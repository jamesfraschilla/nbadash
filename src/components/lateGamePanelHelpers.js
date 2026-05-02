export const MARGIN_OPTION_VALUES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4];

export function buildDefaultStrategyOverrides() {
  return {
    period: "",
    clock: "",
    scoreDiff: "",
    scoreDiffRange: false,
    scoreDiffEnd: "",
    possessionTeamId: "",
    ourTimeouts: "",
    opponentTimeouts: "",
    ourFouls: "",
    opponentFouls: "",
  };
}

export function buildStrategyOverrideDraft(state) {
  return {
    period: state?.period ? String(state.period) : "4",
    clock: state?.clock || "0:30",
    scoreDiff: state?.scoreDiff != null ? String(state.scoreDiff) : "0",
    scoreDiffRange: Boolean(state?.manualOverrides?.scoreDiffRange),
    scoreDiffEnd: state?.manualOverrides?.scoreDiffEnd != null && state?.manualOverrides?.scoreDiffEnd !== ""
      ? String(state.manualOverrides.scoreDiffEnd)
      : state?.scoreDiff != null
        ? String(state.scoreDiff)
        : "0",
    possessionTeamId: state?.possessionTeamId || state?.vantageTeam?.teamId || "",
    ourTimeouts: state?.ourTimeouts != null ? String(state.ourTimeouts) : "0",
    opponentTimeouts: state?.opponentTimeouts != null ? String(state.opponentTimeouts) : "0",
    ourFouls: state?.ourFouls != null ? String(state.ourFouls) : "0",
    opponentFouls: state?.opponentFouls != null ? String(state.opponentFouls) : "0",
  };
}

export function hasStrategyOverrides(overrides) {
  return Object.entries(overrides || {}).some(([key, value]) => {
    if (["scoreDiffRange"].includes(key)) {
      return Boolean(value);
    }
    return value !== "" && value != null;
  });
}

export function resolvePossessionDisplay(stateLike) {
  if (!stateLike) return "Unknown";
  if (!stateLike.isLive && !stateLike.isSimulation) return "Final";
  const possessionTeamId = String(stateLike.possessionTeamId || "").trim();
  if (!possessionTeamId) return "Unknown";
  const vantageTeamId = String(stateLike.vantageTeamId || stateLike.vantageTeam?.teamId || "").trim();
  const opponentTeamId = String(stateLike.opponentTeamId || stateLike.opponentTeam?.teamId || "").trim();
  const vantageLabel = stateLike.vantageTeamTricode || stateLike.vantageTeam?.teamTricode || stateLike.vantageTeam?.teamName || "Team";
  const opponentLabel = stateLike.opponentTeamTricode || stateLike.opponentTeam?.teamTricode || stateLike.opponentTeam?.teamName || "Team";
  if (possessionTeamId === vantageTeamId) return `${vantageLabel} ball`;
  if (possessionTeamId === opponentTeamId) return `${opponentLabel} ball`;
  return "Unknown";
}

export function getMarginOptionLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  if (numeric >= 4) return "4+";
  if (numeric > 0) return `+${numeric}`;
  return String(numeric);
}

export function buildMarginRange(startValue, endValue) {
  const start = Number(startValue);
  const end = Number(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const values = [];
  for (let value = low; value <= high; value += 1) {
    values.push(value);
  }
  return values;
}
