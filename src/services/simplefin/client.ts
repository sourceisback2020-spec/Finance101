/**
 * Client-side SimpleFin service.
 *
 * Ports the server-side logic from supabase/functions/_shared/simplefin.ts
 * and simplefinSync.ts into a browser-compatible module. During dev, all
 * requests to SimpleFin are routed through the Vite proxy at
 * /api/simplefin-proxy to bypass CORS restrictions.
 *
 * In production (hosted mode) this module is never used — the Supabase Edge
 * Functions handle everything server-side.
 */

import { IMPORT_CUTOFF_DATE } from "../../domain/calculations";
import type { BankAccount, Transaction } from "../../domain/models";

// ---------------------------------------------------------------------------
// SimpleFin API types (mirrored from supabase/functions/_shared/simplefin.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers (ported from simplefin.ts — all use browser-native APIs)
// ---------------------------------------------------------------------------

function encodeBasicAuth(username: string, password: string): string {
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

function decodeSimpleFinSetupToken(rawInput: string): string {
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
  const padded =
    remainder === 0
      ? standardBase64
      : standardBase64 + "=".repeat(4 - remainder);
  try {
    return atob(padded);
  } catch {
    throw new Error(
      "SimpleFIN setup token could not be decoded. Copy a fresh token from bridge.simplefin.org."
    );
  }
}

// ---------------------------------------------------------------------------
// Proxied API calls
// ---------------------------------------------------------------------------

/**
 * Claim a SimpleFin access URL from a one-time setup token.
 * The POST request is routed through the Vite dev proxy.
 */
export async function claimSimpleFinAccessUrl(
  setupToken: string
): Promise<string> {
  const claimUrl = decodeSimpleFinSetupToken(setupToken).trim();
  if (!claimUrl.startsWith("https://")) {
    throw new Error(
      "SimpleFIN setup token is invalid. It should decode to an https claim URL."
    );
  }
  const response = await fetch("/api/simplefin-proxy", {
    method: "POST",
    headers: {
      "X-Target-URL": claimUrl,
      "Content-Length": "0",
    },
  });
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        "SimpleFIN setup token expired or was already used. Generate a new one."
      );
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

/**
 * Fetch accounts (and optionally transactions) from SimpleFin.
 * The GET request is routed through the Vite dev proxy.
 */
export async function fetchSimpleFinAccounts(
  accessUrl: string,
  startDate?: number
): Promise<SimpleFinAccountSet> {
  const { baseUrl, authHeader } = parseAccessUrl(accessUrl);
  const endpoint = new URL(`${baseUrl}/accounts`);
  if (typeof startDate === "number" && startDate > 0) {
    endpoint.searchParams.set("start-date", String(startDate));
  }
  const response = await fetch("/api/simplefin-proxy", {
    method: "GET",
    headers: {
      "X-Target-URL": endpoint.toString(),
      Authorization: authHeader,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SimpleFIN accounts error ${response.status}: ${text}`);
  }
  return (await response.json()) as SimpleFinAccountSet;
}

// ---------------------------------------------------------------------------
// localStorage persistence for connection metadata
// ---------------------------------------------------------------------------

type LocalSimpleFinConnection = {
  connectionId: string;
  accessUrl: string;
  institutionName: string;
};

const SIMPLEFIN_CONNECTION_KEY = "finance:simplefin:connection";

function saveSimpleFinConnection(connection: LocalSimpleFinConnection): void {
  window.localStorage.setItem(
    SIMPLEFIN_CONNECTION_KEY,
    JSON.stringify(connection)
  );
}

function loadSimpleFinConnection(): LocalSimpleFinConnection | null {
  try {
    const raw = window.localStorage.getItem(SIMPLEFIN_CONNECTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalSimpleFinConnection;
  } catch {
    return null;
  }
}

export function hasLocalSimpleFinConnection(): boolean {
  return loadSimpleFinConnection() !== null;
}

export function clearLocalSimpleFinConnection(): void {
  window.localStorage.removeItem(SIMPLEFIN_CONNECTION_KEY);
}

// ---------------------------------------------------------------------------
// Connect (client-side equivalent of bank-feed-connect-simplefin)
// ---------------------------------------------------------------------------

export async function connectSimpleFinLocal(setupToken: string): Promise<{
  connectionId: string;
  institutionName: string;
  accountsLinked: number;
  banks: BankAccount[];
}> {
  const accessUrl = await claimSimpleFinAccessUrl(setupToken);
  const accountSet = await fetchSimpleFinAccounts(accessUrl);

  const institutionName =
    accountSet.accounts[0]?.org?.name ??
    accountSet.accounts[0]?.org?.domain ??
    "SimpleFIN Institution";

  const connectionId = `simplefin:${crypto.randomUUID()}`;

  // New accounts get currentBalance: 0 — the user sets the initial balance
  // manually. SimpleFin transactions will adjust the balance from there.
  const banks: BankAccount[] = accountSet.accounts.map((account) => ({
    id: `bank-feed:${connectionId}:${account.id}`,
    institution: institutionName,
    nickname: account.name,
    type: "checking" as const,
    currentBalance: 0,
    availableBalance: 0,
    apy: 0,
    lastUpdated: new Date(
      (account["balance-date"] || Math.floor(Date.now() / 1000)) * 1000
    )
      .toISOString()
      .slice(0, 10),
    imageDataUrl: "",
  }));

  // Persist connection so future syncs can reuse the access URL.
  saveSimpleFinConnection({ connectionId, accessUrl, institutionName });

  return {
    connectionId,
    institutionName,
    accountsLinked: accountSet.accounts.length,
    banks,
  };
}

// ---------------------------------------------------------------------------
// Sync (client-side equivalent of bank-feed-sync)
// ---------------------------------------------------------------------------

export async function syncSimpleFinLocal(): Promise<{
  added: number;
  modified: number;
  removed: number;
  connections: number;
  syncedAt: string;
  transactions: Transaction[];
  banks: BankAccount[];
}> {
  const connection = loadSimpleFinConnection();
  if (!connection) {
    return {
      added: 0,
      modified: 0,
      removed: 0,
      connections: 0,
      syncedAt: new Date().toISOString(),
      transactions: [],
      banks: [],
    };
  }

  // Only pull transactions from the cutoff date onward.
  const cutoff = new Date(`${IMPORT_CUTOFF_DATE}T00:00:00Z`);
  const startDate = Math.floor(cutoff.getTime() / 1000);

  const accountSet = await fetchSimpleFinAccounts(
    connection.accessUrl,
    startDate
  );

  // Build bank account records — balance fields are set to 0 because we never
  // overwrite the user's manually-set initial balance from SimpleFin. The db
  // layer will only insert NEW accounts and skip existing ones to preserve
  // the user-set currentBalance.
  const banks: BankAccount[] = accountSet.accounts.map((account) => ({
    id: `bank-feed:${connection.connectionId}:${account.id}`,
    institution: connection.institutionName,
    nickname: account.name,
    type: "checking" as const,
    currentBalance: 0,
    availableBalance: 0,
    apy: 0,
    lastUpdated: new Date(
      (account["balance-date"] || Math.floor(Date.now() / 1000)) * 1000
    )
      .toISOString()
      .slice(0, 10),
    imageDataUrl: "",
  }));

  // Transform SimpleFin transactions into the app's Transaction model.
  const transactions: Transaction[] = accountSet.accounts.flatMap((account) => {
    const appAccountId = `bank-feed:${connection.connectionId}:${account.id}`;
    return (account.transactions ?? [])
      .filter((tx) => (tx.posted || 0) >= startDate)
      .reduce<Transaction[]>((acc, tx) => {
        const signedAmount = Number(tx.amount || "0");
        if (!Number.isFinite(signedAmount)) return acc; // skip malformed amounts
        const posted = tx.posted || Math.floor(Date.now() / 1000);
        acc.push({
          id: `bank-feed:${connection.connectionId}:${account.id}:${tx.id}`,
          date: new Date(posted * 1000).toISOString().slice(0, 10),
          amount: Math.abs(signedAmount),
          type: (signedAmount < 0 ? "expense" : "income") as
            | "expense"
            | "income",
          category: "Imported",
          merchant: tx.description || "SimpleFIN Import",
          account: appAccountId,
          note: "Imported from SimpleFIN bridge",
          recurring: 0,
        });
        return acc;
      }, []);
  });

  return {
    added: transactions.length,
    modified: banks.length,
    removed: 0,
    connections: 1,
    syncedAt: new Date().toISOString(),
    transactions,
    banks,
  };
}
