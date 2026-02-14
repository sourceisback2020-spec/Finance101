export type SimpleFinAccountSet = {
  errors: string[];
  accounts: Array<{
    org?: {
      domain?: string;
      name?: string;
      "sfin-url"?: string;
    };
    id: string;
    name: string;
    currency: string;
    balance: string;
    "available-balance"?: string;
    "balance-date": number;
    transactions?: Array<{
      id: string;
      posted: number;
      amount: string;
      description: string;
      pending?: boolean;
    }>;
  }>;
};

function encodeBasicAuth(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function parseAccessUrl(accessUrl: string) {
  const parsed = new URL(accessUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("SimpleFIN access URL must be HTTPS.");
  }
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (!username || !password) {
    throw new Error("SimpleFIN access URL is missing credentials.");
  }
  parsed.username = "";
  parsed.password = "";
  const baseUrl = parsed.toString().replace(/\/+$/, "");
  return { baseUrl, authHeader: encodeBasicAuth(username, password) };
}

function decodeSimpleFinSetupToken(rawInput: string) {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error("SimpleFIN setup token is empty.");
  }
  if (trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Accept multiline paste, URL-safe base64, and missing padding.
  const compact = trimmed.replace(/\s+/g, "");
  const standardBase64 = compact.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = standardBase64.length % 4;
  const padded = remainder === 0 ? standardBase64 : standardBase64 + "=".repeat(4 - remainder);
  try {
    return atob(padded);
  } catch {
    throw new Error("SimpleFIN setup token could not be decoded. Copy a fresh token from bridge.simplefin.org.");
  }
}

export async function claimSimpleFinAccessUrl(setupToken: string) {
  const decodedClaimUrl = decodeSimpleFinSetupToken(setupToken).trim();
  if (!decodedClaimUrl.startsWith("https://")) {
    throw new Error("SimpleFIN setup token is invalid. It should decode to an https claim URL.");
  }
  const response = await fetch(decodedClaimUrl, {
    method: "POST",
    headers: {
      "Content-Length": "0"
    }
  });
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("SimpleFIN setup token expired or was already used. Generate a new one.");
    }
    const body = await response.text();
    throw new Error(`SimpleFIN claim error ${response.status}: ${body}`);
  }
  const accessUrl = (await response.text()).trim();
  if (!accessUrl.startsWith("https://")) {
    throw new Error("SimpleFIN returned an invalid access URL.");
  }
  return accessUrl;
}

export async function fetchSimpleFinAccounts(accessUrl: string, startDate?: number) {
  const { baseUrl, authHeader } = parseAccessUrl(accessUrl);
  const endpoint = new URL(`${baseUrl}/accounts`);
  if (typeof startDate === "number" && startDate > 0) {
    endpoint.searchParams.set("start-date", String(startDate));
  }
  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      Authorization: authHeader
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SimpleFIN accounts error ${response.status}: ${text}`);
  }
  const data = (await response.json()) as SimpleFinAccountSet;
  return data;
}
