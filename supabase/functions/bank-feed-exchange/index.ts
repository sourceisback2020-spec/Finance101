import { corsHeaders, withCors } from "../_shared/cors.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { mapPlaidSubtypeToBankType, plaidRequest, type PlaidEnv } from "../_shared/plaid.ts";
import { resolveOwnerId, serviceClient } from "../_shared/supabase.ts";

type ExchangeResponse = {
  access_token: string;
  item_id: string;
};

type AccountsBalanceResponse = {
  accounts: Array<{
    account_id: string;
    name: string;
    mask?: string | null;
    type?: string | null;
    subtype?: string | null;
    balances: {
      current?: number | null;
      available?: number | null;
    };
  }>;
  item: {
    institution_id?: string | null;
  };
};

type InstitutionResponse = {
  institution: {
    name: string;
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return withCors({ error: "Method not allowed." }, 405);
  }

  try {
    const ownerId = await resolveOwnerId(request);
    const { publicToken } = (await request.json()) as { publicToken?: string };
    if (!publicToken) {
      return withCors({ error: "publicToken is required." }, 400);
    }

    const plaidClientId = Deno.env.get("PLAID_CLIENT_ID") ?? "";
    const plaidSecret = Deno.env.get("PLAID_SECRET") ?? "";
    const plaidEnv = (Deno.env.get("PLAID_ENV") ?? "sandbox") as PlaidEnv;
    const tokenKey = Deno.env.get("BANK_FEED_TOKEN_KEY") ?? "";
    if (!plaidClientId || !plaidSecret || !tokenKey) {
      return withCors({ error: "Missing required Plaid or encryption secrets." }, 500);
    }

    const plaidConfig = { clientId: plaidClientId, secret: plaidSecret, env: plaidEnv };
    const exchange = await plaidRequest<ExchangeResponse>(plaidConfig, "/item/public_token/exchange", {
      public_token: publicToken
    });
    const balances = await plaidRequest<AccountsBalanceResponse>(plaidConfig, "/accounts/balance/get", {
      access_token: exchange.access_token
    });

    let institutionName = "Linked Bank";
    if (balances.item.institution_id) {
      try {
        const institution = await plaidRequest<InstitutionResponse>(plaidConfig, "/institutions/get_by_id", {
          institution_id: balances.item.institution_id,
          country_codes: ["US"]
        });
        institutionName = institution.institution.name;
      } catch {
        institutionName = "Linked Bank";
      }
    }

    const encryptedToken = await encryptSecret(exchange.access_token, tokenKey);
    const supabase = serviceClient();
    const connectionId = exchange.item_id;

    const { error: connectionError } = await supabase.from("bank_feed_connections").upsert(
      {
        owner_id: ownerId,
        connection_id: connectionId,
        provider: "plaid",
        item_id: exchange.item_id,
        institution_name: institutionName,
        access_token_cipher: encryptedToken.cipherText,
        access_token_iv: encryptedToken.iv,
        status: "active"
      },
      { onConflict: "owner_id,connection_id" }
    );
    if (connectionError) throw connectionError;

    const nowDate = new Date().toISOString().slice(0, 10);
    const accountRows = balances.accounts.map((account) => {
      const appBankId = `bank-feed:${connectionId}:${account.account_id}`;
      return {
        owner_id: ownerId,
        connection_id: connectionId,
        provider_account_id: account.account_id,
        app_account_id: appBankId,
        name: account.name,
        mask: account.mask ?? null,
        account_type: account.type ?? null,
        account_subtype: account.subtype ?? null,
        is_active: true
      };
    });
    if (accountRows.length) {
      const { error: accountError } = await supabase.from("bank_feed_accounts").upsert(accountRows, {
        onConflict: "owner_id,connection_id,provider_account_id"
      });
      if (accountError) throw accountError;
    }

    const financeRows = balances.accounts.map((account) => {
      const appBankId = `bank-feed:${connectionId}:${account.account_id}`;
      return {
        owner_id: ownerId,
        collection: "banks",
        id: appBankId,
        data: {
          id: appBankId,
          institution: institutionName,
          nickname: account.mask ? `${account.name} •${account.mask}` : account.name,
          type: mapPlaidSubtypeToBankType(account.subtype ?? undefined),
          currentBalance: Number(account.balances.current ?? 0),
          availableBalance: Number(account.balances.available ?? account.balances.current ?? 0),
          apy: 0,
          lastUpdated: nowDate,
          imageDataUrl: ""
        }
      };
    });
    if (financeRows.length) {
      const { error: bankUpsertError } = await supabase.from("finance_records").upsert(financeRows, {
        onConflict: "owner_id,collection,id"
      });
      if (bankUpsertError) throw bankUpsertError;
    }

    return withCors({
      connectionId,
      institutionName,
      accountsLinked: balances.accounts.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return withCors({ error: message }, message === "Unauthorized" ? 401 : 500);
  }
});
