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

export async function invokeHostedFunction<T>(name: string, payload?: Record<string, unknown>) {
  if (!supabase) {
    throw new Error("Hosted auth is not configured for this build.");
  }
  // Refresh once before invoke so edge gateway gets a current JWT.
  await supabase.auth.refreshSession();
  let { data, error } = await supabase.functions.invoke(name, {
    body: payload ?? {}
  });
  if (error && /invalid jwt/i.test(error.message ?? "")) {
    await supabase.auth.refreshSession();
    ({ data, error } = await supabase.functions.invoke(name, {
      body: payload ?? {}
    }));
  }
  if (error) {
    throw new Error(await formatHostedFunctionError(error));
  }
  return data as T;
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

