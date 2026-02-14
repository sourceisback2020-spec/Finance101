import { corsHeaders, withCors } from "../_shared/cors.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { claimSimpleFinAccessUrl, fetchSimpleFinAccounts } from "../_shared/simplefin.ts";
import { resolveOwnerId, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return withCors({ error: "Method not allowed." }, 405);
  }

  try {
    const ownerId = await resolveOwnerId(request);
    const tokenKey = Deno.env.get("BANK_FEED_TOKEN_KEY") ?? "";
    if (!tokenKey) {
      return withCors({ error: "Missing BANK_FEED_TOKEN_KEY secret." }, 500);
    }
    const { setupToken } = (await request.json()) as { setupToken?: string };
    if (!setupToken || setupToken.trim().length < 10) {
      return withCors({ error: "SimpleFIN setup token is required." }, 400);
    }

    const accessUrl = await claimSimpleFinAccessUrl(setupToken);
    const accountSet = await fetchSimpleFinAccounts(accessUrl);
    const institutionName =
      accountSet.accounts[0]?.org?.name ??
      accountSet.accounts[0]?.org?.domain ??
      "SimpleFIN Institution";
    const connectionId = `simplefin:${crypto.randomUUID()}`;
    const encrypted = await encryptSecret(accessUrl, tokenKey);

    const supabase = serviceClient();
    const { data: existingConnections, error: existingConnectionsError } = await supabase
      .from("bank_feed_connections")
      .select("connection_id")
      .eq("owner_id", ownerId)
      .eq("provider", "simplefin");
    if (existingConnectionsError) throw existingConnectionsError;
    const existingConnectionIds = (existingConnections ?? []).map((row) => row.connection_id);
    if (existingConnectionIds.length > 0) {
      const { error: existingAccountsDeleteError } = await supabase
        .from("bank_feed_accounts")
        .delete()
        .eq("owner_id", ownerId)
        .in("connection_id", existingConnectionIds);
      if (existingAccountsDeleteError) throw existingAccountsDeleteError;
      const { error: existingConnectionsDeleteError } = await supabase
        .from("bank_feed_connections")
        .delete()
        .eq("owner_id", ownerId)
        .eq("provider", "simplefin");
      if (existingConnectionsDeleteError) throw existingConnectionsDeleteError;
      const { error: oldBanksDeleteError } = await supabase
        .from("finance_records")
        .delete()
        .eq("owner_id", ownerId)
        .eq("collection", "banks")
        .like("id", "bank-feed:simplefin:%");
      if (oldBanksDeleteError) throw oldBanksDeleteError;
      const { error: oldTransactionsDeleteError } = await supabase
        .from("finance_records")
        .delete()
        .eq("owner_id", ownerId)
        .eq("collection", "transactions")
        .like("id", "bank-feed:simplefin:%");
      if (oldTransactionsDeleteError) throw oldTransactionsDeleteError;
    }
    const { error: connectionError } = await supabase.from("bank_feed_connections").upsert(
      {
        owner_id: ownerId,
        connection_id: connectionId,
        provider: "simplefin",
        item_id: connectionId,
        institution_name: institutionName,
        access_token_cipher: encrypted.cipherText,
        access_token_iv: encrypted.iv,
        status: "active"
      },
      { onConflict: "owner_id,connection_id" }
    );
    if (connectionError) throw connectionError;

    const accountRows = accountSet.accounts.map((account) => {
      const appBankId = `bank-feed:${connectionId}:${account.id}`;
      return {
        owner_id: ownerId,
        connection_id: connectionId,
        provider_account_id: account.id,
        app_account_id: appBankId,
        name: account.name,
        mask: null,
        account_type: "depository",
        account_subtype: null,
        is_active: true
      };
    });
    if (accountRows.length) {
      const { error: accountError } = await supabase.from("bank_feed_accounts").upsert(accountRows, {
        onConflict: "owner_id,connection_id,provider_account_id"
      });
      if (accountError) throw accountError;
    }

    const financeRows = accountSet.accounts.map((account) => {
      const appBankId = `bank-feed:${connectionId}:${account.id}`;
      const balance = Number(account.balance || "0");
      const availableBalance = Number(account["available-balance"] || account.balance || "0");
      return {
        owner_id: ownerId,
        collection: "banks",
        id: appBankId,
        data: {
          id: appBankId,
          institution: institutionName,
          nickname: account.name,
          type: "checking",
          currentBalance: balance,
          availableBalance,
          apy: 0,
          lastUpdated: new Date((account["balance-date"] || 0) * 1000).toISOString().slice(0, 10),
          imageDataUrl: ""
        }
      };
    });
    if (financeRows.length) {
      const { error: bankError } = await supabase.from("finance_records").upsert(financeRows, {
        onConflict: "owner_id,collection,id"
      });
      if (bankError) throw bankError;
    }

    return withCors({
      connectionId,
      institutionName,
      accountsLinked: accountSet.accounts.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return withCors({ error: message }, message === "Unauthorized" ? 401 : 500);
  }
});
