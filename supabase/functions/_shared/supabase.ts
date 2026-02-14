import { createClient } from "npm:@supabase/supabase-js@2";

type FunctionEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
};

export function readFunctionEnv(): FunctionEnv {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("Missing required Supabase function secrets.");
  }
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

async function resolveUserIdFromJwt(authHeader: string | null) {
  if (!authHeader) return null;
  const env = readFunctionEnv();
  const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: authHeader
    }
  });
  if (!response.ok) {
    return null;
  }
  const user = (await response.json()) as { id?: string };
  return user.id ?? null;
}

export async function resolveOwnerId(request: Request) {
  const ownerFromJwt = await resolveUserIdFromJwt(request.headers.get("Authorization"));
  if (ownerFromJwt) return ownerFromJwt;
  throw new Error("Unauthorized");
}

export function serviceClient() {
  const env = readFunctionEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
}
