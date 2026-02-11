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

