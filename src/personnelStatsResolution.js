function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function payloadPlayers(payload) {
  const players = payload?.players;
  if (!players || typeof players !== "object" || Array.isArray(players)) return [];
  return Object.values(players).filter((player) => player && typeof player === "object");
}

export function getPersonnelStatsCoverage(payload, requestedPlayers = []) {
  const availablePlayers = payloadPlayers(payload);
  const ids = new Set(availablePlayers.map((player) => String(player?.personId || "").trim()).filter(Boolean));
  const names = new Set(availablePlayers.map((player) => normalizeName(player?.fullName)).filter(Boolean));
  const requested = (Array.isArray(requestedPlayers) ? requestedPlayers : [])
    .filter((player) => String(player?.personId || player?.fullName || "").trim());
  if (!requested.length) return availablePlayers.length;
  return requested.filter((player) => (
    ids.has(String(player?.personId || "").trim())
    || names.has(normalizeName(player?.fullName))
  )).length;
}

export function mergePersonnelStatsPayloads(payloads, season) {
  const normalizedPayloads = (Array.isArray(payloads) ? payloads : []).filter(Boolean);
  const records = [];

  normalizedPayloads.forEach((payload) => {
    payloadPlayers(payload).forEach((player) => {
      const personId = String(player?.personId || "").trim();
      const name = normalizeName(player?.fullName);
      if (!personId && !name) return;
      const existingIndex = records.findIndex((record) => (
        (personId && String(record?.personId || "").trim() === personId)
        || (name && normalizeName(record?.fullName) === name)
      ));
      if (existingIndex >= 0) {
        records[existingIndex] = { ...records[existingIndex], ...player };
      } else {
        records.push({ ...player });
      }
    });
  });

  const players = {};
  records.forEach((player) => {
    const personId = String(player?.personId || "").trim();
    const name = normalizeName(player?.fullName);
    const key = personId || (name ? `name:${name}` : "");
    if (key) players[key] = player;
  });

  const sources = [...new Set(normalizedPayloads.map((payload) => String(payload?.source || "").trim()).filter(Boolean))];
  const errors = normalizedPayloads.flatMap((payload) => Array.isArray(payload?.errors) ? payload.errors : []);
  return {
    fetchedAt: new Date().toISOString(),
    requestedSeason: season,
    season,
    seasonType: "Regular Season",
    perMode: "PerGame",
    source: sources.join(" + ") || "unavailable",
    count: Object.keys(players).length,
    players,
    partial: normalizedPayloads.some((payload) => Boolean(payload?.partial)) || errors.length > 0,
    errors,
  };
}
