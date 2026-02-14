import { createClient, type AuthChangeEvent, type Session, type User } from "@supabase/supabase-js";

const HOSTED_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "") ?? "";
const HOSTED_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

const isBrowser = typeof window !== "undefined";
const isHostedWeb = isBrowser && typeof window.financeApi === "undefined";

const supabase =
  isHostedWeb && HOSTED_URL && HOSTED_ANON_KEY
    ? createClient(HOSTED_URL, HOSTED_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      })
    : null;

export function isHostedAuthEnabled() {
  return Boolean(supabase);
}

export async function getHostedSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getHostedUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getHostedAccessToken() {
  const session = await getHostedSession();
  return session?.access_token ?? null;
}

export async function refreshHostedAccessToken() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

async function formatHostedFunctionError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Edge function call failed.";
  }
  const maybeContext = (error as { context?: { status?: number; text?: () => Promise<string> } }).context;
  if (!maybeContext || typeof maybeContext.text !== "function") {
    return error.message;
  }
  try {
    const body = await maybeContext.text();
    const statusPart = typeof maybeContext.status === "number" ? `${maybeContext.status}` : "unknown";
    return `Edge function error ${statusPart}: ${body || error.message}`;
  } catch {
    return error.message;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function validateHostedJwt(token: string) {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    throw new Error("Your session token is malformed. Please sign out, reset session, and sign back in.");
  }
  const expectedIss = `${HOSTED_URL.replace(/\/+$/, "")}/auth/v1`;
  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (iss && iss !== expectedIss) {
    throw new Error(`Session token project mismatch. Expected issuer ${expectedIss} but got ${iss}. Please sign out, reset session, and sign back in.`);
  }
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp > 0 && Date.now() / 1000 >= exp) {
    throw new Error("Your session token is expired. Please sign out, reset session, and sign back in.");
  }
}

export async function invokeHostedFunction<T>(name: string, payload?: Record<string, unknown>) {
  if (!supabase) {
    throw new Error("Hosted auth is not configured for this build.");
  }
  const client = supabase;
  const endpoint = `${HOSTED_URL.replace(/\/+$/, "")}/functions/v1/${name}`;
  const requestBody = JSON.stringify(payload ?? {});

  async function requestWithFreshToken(forceRefresh: boolean) {
    const refreshResult = await client.auth.refreshSession();
    if (refreshResult.error && forceRefresh) {
      throw new Error("Session refresh failed. Please sign out, reset session, and sign back in.");
    }
    const token =
      refreshResult.data.session?.access_token ??
      (await client.auth.getSession()).data.session?.access_token ??
      null;
    if (!token || token.split(".").length !== 3) {
      throw new Error("Your session token is invalid. Please sign out, reset session, and sign back in.");
    }
    validateHostedJwt(token);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: HOSTED_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: requestBody
    });

    const rawText = await response.text();
    if (!response.ok) {
      if (!forceRefresh && response.status === 401 && /invalid jwt/i.test(rawText)) {
        return requestWithFreshToken(true);
      }
      throw new Error(`Edge function error ${response.status}: ${rawText || "No response body"}`);
    }
    if (!rawText) {
      return {} as T;
    }
    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new Error(`Edge function returned invalid JSON: ${rawText}`);
    }
  }

  try {
    return await requestWithFreshToken(false);
  } catch (error) {
    throw new Error(await formatHostedFunctionError(error));
  }
}

export async function signInHosted(email: string, password: string) {
  if (!supabase) {
    return { error: new Error("Hosted auth is not configured for this build.") };
  }
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpHosted(email: string, password: string) {
  if (!supabase) {
    return { error: new Error("Hosted auth is not configured for this build.") };
  }
  return supabase.auth.signUp({ email, password });
}

export async function signOutHosted() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function resetHostedSession() {
  if (!supabase || !isBrowser) return;
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // best effort
  }
  try {
    const clearKeys = (storage: Storage) => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) continue;
        if (key.startsWith("sb-")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => storage.removeItem(key));
    };
    clearKeys(window.localStorage);
    clearKeys(window.sessionStorage);
  } catch {
    // best effort
  }
}

export function onHostedAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  if (!supabase) {
    return {
      unsubscribe() {
        // no-op
      }
    };
  }
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}

export type HostedUser = User;

