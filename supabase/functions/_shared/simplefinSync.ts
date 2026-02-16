import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchSimpleFinAccounts } from "./simplefin.ts";
const IMPORT_CUTOFF_UNIX = Math.floor(new Date("2026-02-12T00:00:00Z").getTime() / 1000);
const IMPORT_CUTOFF_DATE = "2026-02-12";

type SimpleFinConnectionRow = {
  owner_id: string;
  connection_id: string;
  institution_name: string;
  access_token_cipher: string;
  access_token_iv: string;
  sync_cursor: string | null;
};

type AccountMapRow = {
  provider_account_id: string;
  app_account_id: string;
};

type ExistingBankRecordRow = {
  id: string;
  data: {
    currentBalance?: number;
    availableBalance?: number;
    lastUpdated?: string;
  };
};

function toIsoDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function dateStampToNumber(dateStamp: string | undefined) {
  if (!dateStamp) return Number.NaN;
  const parsed = new Date(`${dateStamp}T00:00:00Z`).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export async function syncSimpleFinConnections(args: {
  supabase: SupabaseClient;
  ownerId: string;
  decryptAccessUrl: (cipherText: string, iv: string) => Promise<string>;
}) {
  const { supabase, ownerId, decryptAccessUrl } = args;
  const { data: connections, error } = await supabase
    .from("bank_feed_connections")
    .select("owner_id, connection_id, institution_name, access_token_cipher, access_token_iv, sync_cursor")
    .eq("owner_id", ownerId)
    .eq("provider", "simplefin")
    .eq("status", "active");
  if (error) throw error;

  let added = 0;
  let modified = 0;
  let removed = 0;
  const connectionRows = (connections ?? []) as SimpleFinConnectionRow[];

  for (const connection of connectionRows) {
    const accessUrl = await decryptAccessUrl(connection.access_token_cipher, connection.access_token_iv);
    const cursorStartDate = connection.sync_cursor ? Number(connection.sync_cursor) : IMPORT_CUTOFF_UNIX;
    const startDate = Math.max(cursorStartDate, IMPORT_CUTOFF_UNIX);
    const accountSet = await fetchSimpleFinAccounts(accessUrl, startDate);

    // Enforce official bank-import start date on every sync.
    const { count: prunedCount, error: pruneError } = await supabase
      .from("finance_records")
      .delete({ count: "exact" })
      .eq("owner_id", ownerId)
      .eq("collection", "transactions")
      .like("id", `bank-feed:${connection.connection_id}:%`)
      .lt("data->>date", IMPORT_CUTOFF_DATE);
    if (pruneError) throw pruneError;
    removed += prunedCount ?? 0;

    const { data: accountMaps, error: mapError } = await supabase
      .from("bank_feed_accounts")
      .select("provider_account_id, app_account_id")
      .eq("owner_id", ownerId)
      .eq("connection_id", connection.connection_id);
    if (mapError) throw mapError;
    const accountLookup = new Map<string, string>(
      ((accountMaps ?? []) as AccountMapRow[]).map((row) => [row.provider_account_id, row.app_account_id])
    );
    const mappedAccountIds = [...accountLookup.values()];
    const existingByAppId = new Map<string, ExistingBankRecordRow["data"]>();
    if (mappedAccountIds.length) {
      const { data: existingBanks, error: existingError } = await supabase
        .from("finance_records")
        .select("id, data")
        .eq("owner_id", ownerId)
        .eq("collection", "banks")
        .in("id", mappedAccountIds);
      if (existingError) throw existingError;
      for (const row of (existingBanks ?? []) as ExistingBankRecordRow[]) {
        existingByAppId.set(row.id, row.data ?? {});
      }
    }

    const bankUpdates = accountSet.accounts
      .map((account) => {
        const appAccountId = accountLookup.get(account.id);
        if (!appAccountId) return null;
        const providerLastUpdated = toIsoDate(account["balance-date"] || Math.floor(Date.now() / 1000));
        const existing = existingByAppId.get(appAccountId);
        const existingStamp = dateStampToNumber(existing?.lastUpdated);
        const providerStamp = dateStampToNumber(providerLastUpdated);
        const keepExistingBalance = Number.isFinite(existingStamp) && Number.isFinite(providerStamp) && existingStamp >= providerStamp;
        const currentBalance = keepExistingBalance ? Number(existing?.currentBalance ?? account.balance ?? 0) : Number(account.balance || "0");
        const availableBalance = keepExistingBalance
          ? Number(existing?.availableBalance ?? existing?.currentBalance ?? account["available-balance"] ?? account.balance ?? 0)
          : Number(account["available-balance"] || account.balance || "0");
        const lastUpdated = keepExistingBalance ? existing?.lastUpdated || providerLastUpdated : providerLastUpdated;
        return {
          owner_id: ownerId,
          collection: "banks",
          id: appAccountId,
          data: {
            id: appAccountId,
            institution: connection.institution_name || account.org?.name || "SimpleFIN Institution",
            nickname: account.name,
            type: "checking",
            currentBalance,
            availableBalance,
            apy: 0,
            lastUpdated,
            imageDataUrl: ""
          }
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (bankUpdates.length) {
      const { error: bankError } = await supabase.from("finance_records").upsert(bankUpdates, {
        onConflict: "owner_id,collection,id"
      });
      if (bankError) throw bankError;
    }

    const transactionRows = accountSet.accounts.flatMap((account) => {
      const appAccountId = accountLookup.get(account.id);
      if (!appAccountId) return [];
      return (account.transactions ?? []).map((transaction) => {
        const signedAmount = Number(transaction.amount || "0");
        const isExpense = signedAmount < 0;
        const amount = Math.abs(signedAmount);
        const posted = transaction.posted || Math.floor(Date.now() / 1000);
        if (posted < IMPORT_CUTOFF_UNIX) return null;
        return {
          owner_id: ownerId,
          collection: "transactions",
          id: `bank-feed:${connection.connection_id}:${account.id}:${transaction.id}`,
          data: {
            id: `bank-feed:${connection.connection_id}:${account.id}:${transaction.id}`,
            date: toIsoDate(posted),
            amount,
            type: isExpense ? "expense" : "income",
            category: "Imported",
            merchant: transaction.description || "SimpleFIN Import",
            account: appAccountId,
            note: "Imported from SimpleFIN bridge",
            recurring: 0
          }
        };
      }).filter((row): row is NonNullable<typeof row> => Boolean(row));
    });

    if (transactionRows.length) {
      const { error: txError } = await supabase.from("finance_records").upsert(transactionRows, {
        onConflict: "owner_id,collection,id"
      });
      if (txError) throw txError;
    }

    const nextCursor = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 60;
    const { error: updateError } = await supabase
      .from("bank_feed_connections")
      .update({
        sync_cursor: String(nextCursor),
        last_synced_at: new Date().toISOString()
      })
      .eq("owner_id", ownerId)
      .eq("connection_id", connection.connection_id);
    if (updateError) throw updateError;

    added += transactionRows.length;
    const accountErrors = accountSet.errors.length;
    modified += bankUpdates.length + accountErrors;
    removed += 0;
  }

  return {
    added,
    modified,
    removed,
    connections: connectionRows.length,
    syncedAt: new Date().toISOString()
  };
}
