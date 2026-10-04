export const ROSTER_FALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function rosterPayloadTimestampMs(payload) {
  const cachedAt = Number(payload?.cachedAt || 0);
  if (Number.isFinite(cachedAt) && cachedAt > 0) return cachedAt;
  const fetchedAt = Date.parse(String(payload?.fetchedAt || ""));
  return Number.isFinite(fetchedAt) ? fetchedAt : 0;
}

export function isRosterFallbackUsable(payload, nowMs = Date.now(), maxAgeMs = ROSTER_FALLBACK_MAX_AGE_MS) {
  if (!payload?.teams || typeof payload.teams !== "object") return false;
  const timestamp = rosterPayloadTimestampMs(payload);
  return timestamp > 0 && Math.max(0, Number(nowMs) - timestamp) <= maxAgeMs;
}
