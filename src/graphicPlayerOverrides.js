export function normalizeGraphicPlayerOverride(value = {}) {
  const raw = value && typeof value === "object" ? value : {};
  const number = raw.jerseyNum == null ? null : String(raw.jerseyNum).trim().replace(/^#\s*/, "");
  return {
    jerseyNum: number === null || /^\d{0,3}$/.test(number) ? number : null,
    headshotUrl: String(raw.headshotUrl || "").trim(),
    headshotStoragePath: String(raw.headshotStoragePath || "").trim(),
    hideHeadshot: raw.hideHeadshot === true,
  };
}

export function graphicPlayerOverrideKey(league, teamId, personId) {
  return [league === "gleague" ? "gleague" : "nba", String(teamId || ""), String(personId || "")].join(":");
}

export function normalizeGraphicPlayerOverrideMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => /^(nba|gleague):[^:]+:[^:]+$/.test(key))
    .map(([key, override]) => [key, normalizeGraphicPlayerOverride(override)]));
}

export function applyGraphicPlayerOverride(player, value) {
  if (!player) return null;
  const override = normalizeGraphicPlayerOverride(value);
  return { ...player,
    ...(override.jerseyNum !== null ? { jerseyNum: override.jerseyNum } : {}),
    ...(override.headshotUrl ? { headshotDataUrl: "", headshotUrl: override.headshotUrl } : {}),
    headshotHidden: override.hideHeadshot,
  };
}
