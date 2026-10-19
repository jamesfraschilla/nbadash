export function normalizeRosterPlayerName(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * ESPN exposes jersey numbers in both team-roster and game-summary payloads.
 * Their nesting differs, so walk the payload and accept any athlete-shaped
 * object with a name and jersey instead of coupling this to one response shape.
 */
export function extractEspnJerseys(payload: unknown) {
  const jerseys = new Map<string, string>();
  const pending: unknown[] = [payload];

  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }

    const record = value as Record<string, unknown>;
    const name = normalizeRosterPlayerName(
      record.fullName || record.displayName || record.name,
    );
    const jersey = String(record.jersey || record.jerseyNum || "").trim();
    if (name && jersey && !jerseys.has(name)) jerseys.set(name, jersey);
    pending.push(...Object.values(record));
  }

  return jerseys;
}

export function mergeEspnJerseys(...sources: Array<Map<string, string>>) {
  const merged = new Map<string, string>();
  for (const source of sources) {
    for (const [name, jersey] of source) {
      if (name && jersey) merged.set(name, jersey);
    }
  }
  return merged;
}
