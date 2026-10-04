import { createClient } from "npm:@supabase/supabase-js@2";

export const MAX_EDGE_BODY_BYTES = 2 * 1024 * 1024;

export function requestBodyTooLarge(req: Request, maxBytes = MAX_EDGE_BODY_BYTES) {
  const declared = Number(req.headers.get("content-length") || 0);
  return Number.isFinite(declared) && declared > maxBytes;
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Supabase function credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireActiveRateLimitedUser(
  req: Request,
  functionName: string,
  options: { limit?: number; windowSeconds?: number } = {},
) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false as const, status: 401, error: "Authentication required." };

  const client = adminClient();
  const { data: userData, error: userError } = await client.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return { ok: false as const, status: 401, error: "Unable to verify session." };

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id,status")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || profile?.status !== "active") {
    return { ok: false as const, status: 403, error: "Active account required." };
  }

  const { data: allowed, error: rateError } = await client.rpc("consume_edge_request_limit", {
    p_user_id: userId,
    p_function_name: functionName,
    p_limit: options.limit || 20,
    p_window_seconds: options.windowSeconds || 60,
  });
  if (rateError) throw new Error(`Unable to enforce request limit: ${rateError.message}`);
  if (!allowed) return { ok: false as const, status: 429, error: "Too many requests. Try again shortly." };

  return { ok: true as const, userId };
}
