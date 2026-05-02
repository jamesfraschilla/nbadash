export function buildDefaultStrategyOverrides() {
  return {
    possessionFlip: false,
    freeThrowsPending: false,
    timeoutCalled: false,
    clockAdvanced: false,
    period: "",
    clock: "",
    scoreDiff: "",
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
    possessionTeamId: state?.possessionTeamId || state?.vantageTeam?.teamId || "",
    ourTimeouts: state?.ourTimeouts != null ? String(state.ourTimeouts) : "0",
    opponentTimeouts: state?.opponentTimeouts != null ? String(state.opponentTimeouts) : "0",
    ourFouls: state?.ourFouls != null ? String(state.ourFouls) : "0",
    opponentFouls: state?.opponentFouls != null ? String(state.opponentFouls) : "0",
  };
}

export function hasStrategyOverrides(overrides) {
  return Object.entries(overrides || {}).some(([key, value]) => {
    if (["possessionFlip", "freeThrowsPending", "timeoutCalled", "clockAdvanced"].includes(key)) {
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
