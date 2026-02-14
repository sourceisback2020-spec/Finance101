export type PlaidEnv = "sandbox" | "development" | "production";

function plaidBaseUrl(env: PlaidEnv) {
  if (env === "production") return "https://production.plaid.com";
  if (env === "development") return "https://development.plaid.com";
  return "https://sandbox.plaid.com";
}

export type PlaidConfig = {
  clientId: string;
  secret: string;
  env: PlaidEnv;
};

export async function plaidRequest<T>(config: PlaidConfig, path: string, body: Record<string, unknown>) {
  const response = await fetch(`${plaidBaseUrl(config.env)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      ...body
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Plaid error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export function mapPlaidSubtypeToBankType(subtype?: string) {
  const normalized = (subtype ?? "").toLowerCase();
  if (normalized.includes("checking")) return "checking";
  if (normalized.includes("savings")) return "savings";
  if (normalized.includes("brokerage")) return "brokerage";
  return "cash";
}
