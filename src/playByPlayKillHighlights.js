const WASHINGTON_ID = "1610612764";
const ADMIN_TYPES = new Set(["timeout", "substitution", "period", "game", "status", "instantreplay", "memo"]);
const teamId = (value) => String(value ?? "").trim();
const typeOf = (action) => String(action?.actionType || "").toLowerCase();

export function playByPlayActionKey(action) {
  if (action.actionNumber != null) return `action:${action.actionNumber}`;
  if (action.orderNumber != null) return `order:${action.orderNumber}`;
  return JSON.stringify([action.period, action.clock, action.teamId, action.actionType, action.subType, action.description]);
}

// Presentation only: no writes, network requests, or changes to dashboard totals.
// Work from the complete chronological feed BEFORE period/reverse/substitution filters.
export function buildWashingtonKillHighlights(game) {
  const highlights = new Map();
  const home = teamId(game?.homeTeam?.teamId);
  const away = teamId(game?.awayTeam?.teamId);
  if (home !== WASHINGTON_ID && away !== WASHINGTON_ID) return highlights;
  const opponent = home === WASHINGTON_ID ? away : home;
  if (!opponent) return highlights;
  const validTeams = new Set([home, away]);
  const actions = [...(game.playByPlayActions || [])].sort((a, b) =>
    Number(a.orderNumber ?? a.actionNumber ?? 0) - Number(b.orderNumber ?? b.actionNumber ?? 0));
  let stops = 0;
  let possession = null;

  const finish = () => {
    if (possession?.team !== opponent || !possession.hasOutcome) return;
    const missedOpportunity = stops % 3 === 2 && possession.scored;
    stops = possession.scored ? 0 : stops + 1;
    const kind = missedOpportunity ? "missed" : !possession.scored && stops % 3 === 0 ? "completed" : null;
    if (!kind) return;
    for (const action of possession.actions) {
      if (!ADMIN_TYPES.has(typeOf(action))) highlights.set(playByPlayActionKey(action), kind);
    }
  };

  for (const action of actions) {
    const type = typeOf(action);
    const subtype = String(action.subType || "").toLowerCase();
    const period = Number(action.period || 0);
    const actor = teamId(action.teamId);
    const suppliedOwner = teamId(action.possession);
    const offensiveEvent = ["2pt", "3pt", "freethrow", "turnover", "heave"].includes(type);

    if (possession && period && possession.period && possession.period !== period) {
      finish();
      possession = null;
    }
    if (type === "period" && subtype === "end") {
      finish();
      possession = null;
      continue;
    }
    const owner = validTeams.has(suppliedOwner) ? suppliedOwner
      : offensiveEvent && validTeams.has(actor) ? actor : possession?.team;
    if (!owner) continue;

    if (possession && owner !== possession.team) {
      // The NBA can put the NEW owner on the rebound/steal that ends the OLD
      // possession. Include that defensive event in the highlighted possession.
      const terminalDefense = actor === owner && (
        (type === "rebound" && subtype === "defensive") || type === "steal"
      );
      if (terminalDefense) possession.actions.push(action);
      finish();
      possession = null;
      if (terminalDefense) continue;
    }
    if (!possession) possession = { team: owner, period, actions: [], hasOutcome: false, scored: false, closed: false };
    possession.actions.push(action);

    if (actor === possession.team && offensiveEvent) {
      const turnoverHeave = type === "heave" && (Array.isArray(action.qualifiers) ? action.qualifiers : [])
        .some((q) => String(q).toLowerCase() === "fromturnover");
      if (type !== "heave" || turnoverHeave) possession.hasOutcome = true;
      if (["2pt", "3pt", "freethrow"].includes(type) && String(action.shotResult).toLowerCase() === "made") {
        possession.scored = true;
      }
      if (type === "turnover" || turnoverHeave) possession.closed = true;
    }
    if (type === "rebound") {
      if (subtype === "defensive" && actor !== possession.team && validTeams.has(actor)) possession.closed = true;
      // A player OR TEAM offensive rebound is a continuation, never a stop.
      if (subtype === "offensive" && actor === possession.team) possession.closed = false;
    }
  }

  // Do not call a live miss, missed non-final FT, foul, timeout, or retained
  // offensive rebound a completed stop. Scoring already guarantees a failed Kill.
  if (possession && (possession.scored || possession.closed || Number(game.gameStatus) === 3)) finish();
  return highlights;
}
