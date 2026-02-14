import { corsHeaders, withCors } from "../_shared/cors.ts";
import { plaidRequest, type PlaidEnv } from "../_shared/plaid.ts";
import { resolveOwnerId } from "../_shared/supabase.ts";

type LinkTokenResponse = {
  link_token: string;
  expiration: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ownerId = await resolveOwnerId(request);
    const plaidClientId = Deno.env.get("PLAID_CLIENT_ID") ?? "";
    const plaidSecret = Deno.env.get("PLAID_SECRET") ?? "";
    const plaidEnv = (Deno.env.get("PLAID_ENV") ?? "sandbox") as PlaidEnv;
    if (!plaidClientId || !plaidSecret) {
      return withCors({ error: "Missing Plaid credentials." }, 500);
    }

    const webhookUrl = Deno.env.get("PLAID_WEBHOOK_URL") ?? undefined;
    const linkToken = await plaidRequest<LinkTokenResponse>(
      { clientId: plaidClientId, secret: plaidSecret, env: plaidEnv },
      "/link/token/create",
      {
        user: { client_user_id: ownerId },
        client_name: "Finance101",
        language: "en",
        country_codes: ["US"],
        products: ["transactions"],
        webhook: webhookUrl
      }
    );

    return withCors({ linkToken: linkToken.link_token, expiration: linkToken.expiration });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return withCors({ error: message }, message === "Unauthorized" ? 401 : 500);
  }
});
