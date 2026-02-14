import { corsHeaders, withCors } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { type PlaidEnv } from "../_shared/plaid.ts";
import { syncAllConnections } from "../_shared/sync.ts";
import { serviceClient } from "../_shared/supabase.ts";

type PlaidWebhookPayload = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return withCors({ error: "Method not allowed." }, 405);
  }

  try {
    const webhookSecret = Deno.env.get("BANK_FEED_WEBHOOK_SECRET") ?? "";
    if (webhookSecret) {
      const url = new URL(request.url);
      const provided = url.searchParams.get("secret");
      if (provided !== webhookSecret) {
        return withCors({ error: "Unauthorized webhook." }, 401);
      }
    }

    const payload = (await request.json()) as PlaidWebhookPayload;
    if (payload.webhook_type !== "TRANSACTIONS" || payload.webhook_code !== "SYNC_UPDATES_AVAILABLE" || !payload.item_id) {
      return withCors({ ok: true, ignored: true });
    }

    const plaidClientId = Deno.env.get("PLAID_CLIENT_ID") ?? "";
    const plaidSecret = Deno.env.get("PLAID_SECRET") ?? "";
    const plaidEnv = (Deno.env.get("PLAID_ENV") ?? "sandbox") as PlaidEnv;
    const tokenKey = Deno.env.get("BANK_FEED_TOKEN_KEY") ?? "";
    if (!plaidClientId || !plaidSecret || !tokenKey) {
      return withCors({ error: "Missing required Plaid or encryption secrets." }, 500);
    }

    const supabase = serviceClient();
    const { data: connection, error } = await supabase
      .from("bank_feed_connections")
      .select("owner_id")
      .eq("provider", "plaid")
      .eq("item_id", payload.item_id)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    if (!connection?.owner_id) {
      return withCors({ ok: true, ignored: true });
    }

    const summary = await syncAllConnections({
      supabase,
      ownerId: connection.owner_id,
      plaid: { clientId: plaidClientId, secret: plaidSecret, env: plaidEnv },
      decryptAccessToken: (cipherText, iv) => decryptSecret(cipherText, iv, tokenKey)
    });

    return withCors({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return withCors({ error: message }, 500);
  }
});
