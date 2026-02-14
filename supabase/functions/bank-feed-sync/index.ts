import { corsHeaders, withCors } from "../_shared/cors.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import { type PlaidEnv } from "../_shared/plaid.ts";
import { syncSimpleFinConnections } from "../_shared/simplefinSync.ts";
import { syncAllConnections } from "../_shared/sync.ts";
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
    const plaidClientId = Deno.env.get("PLAID_CLIENT_ID") ?? "";
    const plaidSecret = Deno.env.get("PLAID_SECRET") ?? "";
    const plaidEnv = (Deno.env.get("PLAID_ENV") ?? "sandbox") as PlaidEnv;
    const tokenKey = Deno.env.get("BANK_FEED_TOKEN_KEY") ?? "";
    if (!tokenKey) {
      return withCors({ error: "Missing BANK_FEED_TOKEN_KEY secret." }, 500);
    }

    const supabase = serviceClient();
    const simpleFinSummary = await syncSimpleFinConnections({
      supabase,
      ownerId,
      decryptAccessUrl: (cipherText, iv) => decryptSecret(cipherText, iv, tokenKey)
    });

    let plaidSummary = { added: 0, modified: 0, removed: 0, connections: 0, syncedAt: new Date().toISOString() };
    if (plaidClientId && plaidSecret) {
      plaidSummary = await syncAllConnections({
        supabase,
        ownerId,
        plaid: { clientId: plaidClientId, secret: plaidSecret, env: plaidEnv },
        decryptAccessToken: (cipherText, iv) => decryptSecret(cipherText, iv, tokenKey)
      });
    }

    return withCors({
      added: simpleFinSummary.added + plaidSummary.added,
      modified: simpleFinSummary.modified + plaidSummary.modified,
      removed: simpleFinSummary.removed + plaidSummary.removed,
      connections: simpleFinSummary.connections + plaidSummary.connections,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return withCors({ error: message }, message === "Unauthorized" ? 401 : 500);
  }
});
