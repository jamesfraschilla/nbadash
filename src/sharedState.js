import { supabase } from "./supabaseClient.js";

export const SHARED_STATE_TABLE = "rotations_shared_state";

export class SharedStateConflictError extends Error {
  constructor(message = "This shared state changed in another browser. Reload before saving again.") {
    super(message);
    this.name = "SharedStateConflictError";
    this.code = "SHARED_STATE_CONFLICT";
  }
}

export async function fetchSharedStateRow(scopeType, scopeKey) {
  if (!supabase || !scopeType || !scopeKey) return null;
  const { data, error } = await supabase
    .from(SHARED_STATE_TABLE)
    .select("payload,updated_at")
    .eq("scope_type", scopeType)
    .eq("scope_key", scopeKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    payload: data.payload && typeof data.payload === "object" ? data.payload : {},
    version: String(data.updated_at || ""),
  };
}

export async function saveSharedStateRow({ scopeType, scopeKey, payload, expectedVersion }) {
  if (!supabase || !scopeType || !scopeKey) return null;
  if (expectedVersion) {
    const { data, error } = await supabase
      .from(SHARED_STATE_TABLE)
      .update({ payload })
      .eq("scope_type", scopeType)
      .eq("scope_key", scopeKey)
      .eq("updated_at", expectedVersion)
      .select("payload,updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new SharedStateConflictError();
    return { payload: data.payload, version: String(data.updated_at || "") };
  }

  const { data, error } = await supabase
    .from(SHARED_STATE_TABLE)
    .insert({ scope_type: scopeType, scope_key: scopeKey, payload })
    .select("payload,updated_at")
    .maybeSingle();
  if (error?.code === "23505") throw new SharedStateConflictError();
  if (error) throw error;
  return data ? { payload: data.payload, version: String(data.updated_at || "") } : null;
}
