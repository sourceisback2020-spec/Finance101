import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { plaidRequest, type PlaidConfig } from "./plaid.ts";
const IMPORT_CUTOFF_DATE = "2026-02-16";

type ConnectionRow = {
  owner_id: string;
  connection_id: string;
  item_id: string;
  institution_name: string;
  access_token_cipher: string;
  access_token_iv: string;
  sync_cursor: string | null;
};

type AccountMapRow = {
  provider_account_id: string;
  app_account_id: string;
};

type PlaidSyncResponse = {
  added: Array<{
    transaction_id: string;
    account_id: string;
    amount: number;
    date: string;
    authorized_date: string | null;
    name: string;
    merchant_name?: string | null;
    pending: boolean;
    personal_finance_category?: {
      primary?: string;
    } | null;
  }>;
  modified: Array<{
    transaction_id: string;
    account_id: string;
    amount: number;
    date: string;
    authorized_date: string | null;
    name: string;
    merchant_name?: string | null;
    pending: boolean;
    personal_finance_category?: {
      primary?: string;
    } | null;
  }>;
  removed: Array<{
    transaction_id: string;
  }>;
  has_more: boolean;
  next_cursor: string;
};

export type SyncSummary = {
  added: number;
  modified: number;
  removed: number;
  connections: number;
  syncedAt: string;
};

function mapTransactionRecord(
  ownerId: string,
  connectionId: string,
  appAccountId: string,
  transaction: PlaidSyncResponse["added"][number]
) {
  const effectiveDate = transaction.authorized_date || transaction.date;
  if (effectiveDate < IMPORT_CUTOFF_DATE) {
    return null;
  }
  const signedAmount = Number(transaction.amount);
  const isExpense = signedAmount >= 0;
  const magnitude = Math.abs(signedAmount);
  const category = transaction.personal_finance_category?.primary?.replaceAll("_", " ") || "Imported";
  return {
    owner_id: ownerId,
    collection: "transactions",
    id: `bank-feed:${connectionId}:${transaction.transaction_id}`,
    data: {
      id: `bank-feed:${connectionId}:${transaction.transaction_id}`,
        date: effectiveDate,
      amount: magnitude,
      type: isExpense ? "expense" : "income",
      category,
      merchant: transaction.merchant_name || transaction.name,
      account: appAccountId,
      note: "Imported from realtime bank feed",
      recurring: 0
    }
  };
}

export async function syncConnectionTransactions(args: {
  supabase: SupabaseClient;
  ownerId: string;
  connection: ConnectionRow;
  plaid: PlaidConfig;
  decryptAccessToken: (cipherText: string, iv: string) => Promise<string>;
}) {
  const { supabase, ownerId, connection, plaid, decryptAccessToken } = args;
  const accessToken = await decryptAccessToken(connection.access_token_cipher, connection.access_token_iv);
  const { data: accountMaps, error: accountMapError } = await supabase
    .from("bank_feed_accounts")
    .select("provider_account_id, app_account_id")
    .eq("owner_id", ownerId)
    .eq("connection_id", connection.connection_id);
  if (accountMapError) {
    throw accountMapError;
  }
  const accountLookup = new Map<string, string>(
    ((accountMaps ?? []) as AccountMapRow[]).map((row) => [row.provider_account_id, row.app_account_id])
  );
  let cursor = connection.sync_cursor ?? "";
  let hasMore = true;
  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;

  // Enforce official bank-import start date on every sync.
  const { count: prunedCount, error: pruneError } = await supabase
    .from("finance_records")
    .delete({ count: "exact" })
    .eq("owner_id", ownerId)
    .eq("collection", "transactions")
    .like("id", `bank-feed:${connection.connection_id}:%`)
    .lt("data->>date", IMPORT_CUTOFF_DATE);
  if (pruneError) throw pruneError;
  removedCount += prunedCount ?? 0;

  while (hasMore) {
    const syncResult = await plaidRequest<PlaidSyncResponse>(plaid, "/transactions/sync", {
      access_token: accessToken,
      cursor,
      count: 100
    });

    const addedUpserts = syncResult.added
      .map((tx) => {
        const appAccountId = accountLookup.get(tx.account_id);
        if (!appAccountId) return null;
        return mapTransactionRecord(ownerId, connection.connection_id, appAccountId, tx);
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const modifiedUpserts = syncResult.modified
      .map((tx) => {
        const appAccountId = accountLookup.get(tx.account_id);
        if (!appAccountId) return null;
        return mapTransactionRecord(ownerId, connection.connection_id, appAccountId, tx);
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const upserts = [...addedUpserts, ...modifiedUpserts];

    if (upserts.length) {
      const { error } = await supabase
        .from("finance_records")
        .upsert(upserts, { onConflict: "owner_id,collection,id" });
      if (error) throw error;
    }

    if (syncResult.removed.length) {
      const ids = syncResult.removed.map((tx) => `bank-feed:${connection.connection_id}:${tx.transaction_id}`);
      const { error } = await supabase
        .from("finance_records")
        .delete()
        .eq("owner_id", ownerId)
        .eq("collection", "transactions")
        .in("id", ids);
      if (error) throw error;
    }

    addedCount += addedUpserts.length;
    modifiedCount += modifiedUpserts.length;
    removedCount += syncResult.removed.length;
    cursor = syncResult.next_cursor;
    hasMore = syncResult.has_more;
  }

  const { error: updateConnectionError } = await supabase
    .from("bank_feed_connections")
    .update({ sync_cursor: cursor, last_synced_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("connection_id", connection.connection_id);
  if (updateConnectionError) throw updateConnectionError;

  return { addedCount, modifiedCount, removedCount };
}

export async function syncAllConnections(args: {
  supabase: SupabaseClient;
  ownerId: string;
  plaid: PlaidConfig;
  decryptAccessToken: (cipherText: string, iv: string) => Promise<string>;
}) {
  const { supabase, ownerId, plaid, decryptAccessToken } = args;
  const { data: connections, error } = await supabase
    .from("bank_feed_connections")
    .select("owner_id, connection_id, item_id, institution_name, access_token_cipher, access_token_iv, sync_cursor")
    .eq("owner_id", ownerId)
    .eq("provider", "plaid")
    .eq("status", "active");
  if (error) throw error;

  let added = 0;
  let modified = 0;
  let removed = 0;
  for (const connection of (connections ?? []) as ConnectionRow[]) {
    const result = await syncConnectionTransactions({
      supabase,
      ownerId,
      connection,
      plaid,
      decryptAccessToken
    });
    added += result.addedCount;
    modified += result.modifiedCount;
    removed += result.removedCount;
  }

  return {
    added,
    modified,
    removed,
    connections: connections?.length ?? 0,
    syncedAt: new Date().toISOString()
  } satisfies SyncSummary;
}
