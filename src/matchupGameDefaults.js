const WIZARDS_TEAM_ID = "1610612764";
const WIZARDS_TRICODE = "WAS";

function normalizeTeamId(team) {
  return String(team?.teamId || team?.id || "").trim();
}

function normalizeTricode(team) {
  return String(team?.teamTricode || team?.tricode || team?.abbreviation || "").trim().toUpperCase();
}

function isWashingtonTeam(team) {
  return normalizeTeamId(team) === WIZARDS_TEAM_ID || normalizeTricode(team) === WIZARDS_TRICODE;
}

export function findWashingtonOpponentTeamId(games, allowedTeamIds = null) {
  const allowed = allowedTeamIds
    ? new Set([...allowedTeamIds].map((teamId) => String(teamId || "").trim()).filter(Boolean))
    : null;

  for (const game of Array.isArray(games) ? games : []) {
    const awayTeam = game?.awayTeam || null;
    const homeTeam = game?.homeTeam || null;
    const awayIsWashington = isWashingtonTeam(awayTeam);
    const homeIsWashington = isWashingtonTeam(homeTeam);
    if (!awayIsWashington && !homeIsWashington) continue;

    const opponentTeamId = normalizeTeamId(awayIsWashington ? homeTeam : awayTeam);
    if (!opponentTeamId || opponentTeamId === WIZARDS_TEAM_ID) continue;
    if (allowed && !allowed.has(opponentTeamId)) continue;
    return opponentTeamId;
  }

  return "";
}

