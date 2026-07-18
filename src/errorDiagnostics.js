import { readLocalStorage, writeLocalStorage } from "./storage.js";
import { supabase } from "./supabaseClient.js";

const ERROR_LOG_KEY = "nba-dashboard:error-log:v1";
const MAX_ERROR_LOG_ENTRIES = 50;
const MAX_REMOTE_ERRORS_PER_SESSION = 20;
const REMOTE_DUPLICATE_WINDOW_MS = 60_000;
const recentRemoteErrors = new Map();
let remoteErrorCount = 0;

function normalizeErrorEntry(entry) {
  return {
    message: String(entry?.message || "Unknown error"),
    source: String(entry?.source || "runtime"),
    route: String(entry?.route || ""),
    userAgent: String(entry?.userAgent || ""),
    timestamp: Number(entry?.timestamp || Date.now()),
  };
}

async function recordRemoteClientError(entry) {
  if (!supabase || remoteErrorCount >= MAX_REMOTE_ERRORS_PER_SESSION) return;
  const fingerprint = `${entry.source}:${entry.route}:${entry.message}`.slice(0, 1200);
  const now = Date.now();
  const lastSentAt = recentRemoteErrors.get(fingerprint) || 0;
  if (now - lastSentAt < REMOTE_DUPLICATE_WINDOW_MS) return;

  const { data } = await supabase.auth.getSession();
  const actorId = data?.session?.user?.id;
  if (!actorId) return;

  recentRemoteErrors.set(fingerprint, now);
  remoteErrorCount += 1;
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actorId,
    entity_type: "client_error",
    entity_id: null,
    action: entry.source.slice(0, 120),
    detail: {
      message: entry.message.slice(0, 8000),
      route: entry.route.slice(0, 512),
      userAgent: entry.userAgent.slice(0, 512),
      timestamp: entry.timestamp,
    },
  });
  if (error) {
    remoteErrorCount = Math.max(0, remoteErrorCount - 1);
    recentRemoteErrors.delete(fingerprint);
  }
}

export function recordClientError(entry) {
  const normalized = normalizeErrorEntry(entry);
  try {
    const raw = readLocalStorage(ERROR_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(parsed) ? parsed : [];
    next.push(normalized);
    writeLocalStorage(ERROR_LOG_KEY, JSON.stringify(next.slice(-MAX_ERROR_LOG_ENTRIES)));
  } catch {
    // Ignore diagnostics write failures.
  }
  void recordRemoteClientError(normalized).catch(() => {});
}
