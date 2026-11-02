// Read-only derived views. Never persist or mutate the upstream minutes data.
export function defaultMinutesVantage(data) {
  for (const side of ["away", "home"]) {
    const team = data?.[`${side}Team`];
    if (String(team?.teamId) === "1610612764" || String(team?.teamTricode).toUpperCase() === "WAS") return side;
  }
  return "away";
}

export function clockSeconds(value) {
  const match = /^(?:PT)?(\d+)(?::|M)([\d.]+)S?$/.exec(String(value || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export const signed = (value) => `${value > 0 ? "+" : ""}${value}`;
export const durationLabel = (seconds) => {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};
const id = (player) => String(player.personId);
const signature = (players) => players.map(id).sort().join(",");
const validFive = (players) => players.length === 5 && new Set(players.map(id)).size === 5;
const emptyStats = () => ({ points: 0, fga: 0, fgm: 0, three: 0, fta: 0, oreb: 0, tov: 0 });
const ratio = (numerator, denominator) => denominator > 0 ? 100 * numerator / denominator : null;
const estimatedPossessions = (stats) => Math.max(0, stats.fga + 0.44 * stats.fta - stats.oreb + stats.tov);

export function comboMetrics(own, opponent) {
  const possessions = estimatedPossessions(own);
  const opponentPossessions = estimatedPossessions(opponent);
  const ortg = ratio(own.points, possessions);
  const drtg = ratio(opponent.points, opponentPossessions);
  return {
    possessions, opponentPossessions, plusMinus: own.points - opponent.points, ortg, drtg,
    net: ortg == null || drtg == null ? null : ortg - drtg,
    efg: ratio(own.fgm + 0.5 * own.three, own.fga),
    opponentEfg: ratio(opponent.fgm + 0.5 * opponent.three, opponent.fga),
    tov: ratio(own.tov, own.fga + 0.44 * own.fta + own.tov),
    opponentTov: ratio(opponent.tov, opponent.fga + 0.44 * opponent.fta + opponent.tov),
  };
}

export function buildMinutesExplorer(data, game) {
  const issues = new Set();
  if (String(data?.gameId) !== String(game?.gameId)) issues.add("The game and minutes feeds do not refer to the same game.");
  const rosters = { away: new Map(), home: new Map() };
  const samples = { away: new Map(), home: new Map() };
  const records = [];
  const scoringEvents = [];
  const periods = [...(data?.periods || [])].sort((a, b) => a.period - b.period);
  const regulation = /^1[3456]\d{8}$/.test(String(data?.gameId)) ? 600 : 720;
  const periodLength = (p) => p <= 4 ? regulation : 300;
  const offset = (p) => Math.min(p - 1, 4) * regulation + Math.max(0, p - 5) * 300;
  const sample = (side, players) => {
    const key = signature(players);
    if (!samples[side].has(key)) samples[side].set(key, { players: [...players], seconds: 0, own: emptyStats(), opponent: emptyStats() });
    return samples[side].get(key);
  };
  for (const period of periods) {
    const stints = period.stints || [];
    let cursor = periodLength(period.period);
    for (const stint of stints) {
      const start = clockSeconds(stint.startClock), end = clockSeconds(stint.endClock);
      if (start == null || end == null || start < end || start > periodLength(period.period)) {
        issues.add("Invalid lineup clock boundaries."); continue;
      }
      if (Math.abs(cursor - start) > 0.1) issues.add("There are gaps or overlaps in the lineup intervals.");
      cursor = end;
      const record = { ...stint, allocatedHome: 0, allocatedAway: 0, period: period.period, start: offset(period.period) + periodLength(period.period) - start,
        end: offset(period.period) + periodLength(period.period) - end };
      records.push(record);
      for (const side of ["away", "home"]) {
        const players = stint[side === "away" ? "playersAway" : "playersHome"] || [];
        if (!validFive(players)) { issues.add("A lineup does not contain five unique players."); continue; }
        players.forEach((player) => rosters[side].set(id(player), player));
        sample(side, players).seconds += start - end;
      }
    }
    if (Number(data?.gameStatus) === 3 && cursor !== 0) issues.add("A completed period is missing its closing lineup interval.");
  }
  if (!periods.length) issues.add("Lineup intervals are unavailable.");
  for (const repair of data?.periodStintRepairs || []) if (repair.status === "unresolved") issues.add(repair.reason);
  if (data?.openingStintRepair?.status === "unresolved") issues.add(data.openingStintRepair.reason);

  // Retain substitution order as a tie-breaker. At a shared clock, reconcile
  // scoring to the minutes feed's interval scores: NBA's revised event order
  // can otherwise disagree with its own box-score player plus/minus.
  const unique = new Map();
  (game?.playByPlayActions || []).forEach((action, index) => unique.set(action.actionNumber ?? `row-${index}`, action));
  const actions = [...unique.values()].sort((a, b) => Number(a.period) - Number(b.period)
    || (clockSeconds(b.clock) ?? 0) - (clockSeconds(a.clock) ?? 0)
    || Number(a.orderNumber ?? a.actionNumber ?? 0) - Number(b.orderNumber ?? b.actionNumber ?? 0));
  if (!actions.length) issues.add("Play-by-play is unavailable; combination statistics cannot be verified.");
  for (const period of periods) {
    const first = period.stints?.[0];
    if (!first) continue;
    const current = { away: [...(first.playersAway || [])], home: [...(first.playersHome || [])] };
    let previousBoundary = null;
    for (const action of actions.filter((row) => Number(row.period) === Number(period.period))) {
      const actionClock = clockSeconds(action.clock);
      if (actionClock == null) continue;
      const side = String(action.teamId) === String(data.homeTeam.teamId) ? "home"
        : String(action.teamId) === String(data.awayTeam.teamId) ? "away" : null;
      const type = String(action.actionType || "").toLowerCase();
      if (type === "substitution" && side) {
        // Opening lineups already include between-period substitutions.
        if (actionClock === periodLength(period.period)) continue;
        const playerId = String(action.personId);
        if (action.subType === "out") current[side] = current[side].filter((player) => id(player) !== playerId);
        if (action.subType === "in" && !current[side].some((player) => id(player) === playerId)) {
          const player = rosters[side].get(playerId);
          if (player) current[side].push(player);
          else issues.add("A substitution references an unknown player.");
        }
        continue;
      }
      if (!side || !["2pt", "3pt", "freethrow", "rebound", "turnover"].includes(type)) continue;
      if (["2pt", "3pt", "freethrow"].includes(type) && !["made", "missed"].includes(String(action.shotResult).toLowerCase())) {
        issues.add("A shot is missing its result.");
      }
      const delta = emptyStats();
      const made = String(action.shotResult).toLowerCase() === "made";
      if (type === "2pt" || type === "3pt") {
        delta.fga = 1; delta.fgm = Number(made); delta.three = Number(made && type === "3pt");
        delta.points = made ? (type === "3pt" ? 3 : 2) : 0;
      }
      if (type === "freethrow") { delta.fta = 1; delta.points = Number(made); }
      // Dead-ball/team rebound bookkeeping is not a personal offensive rebound.
      if (type === "rebound" && Number(action.personId) > 0 && action.subType === "offensive") delta.oreb = 1;
      if (type === "turnover") delta.tov = 1;
      if (!Object.values(delta).some(Boolean)) continue;
      const elapsed = offset(period.period) + periodLength(period.period) - actionClock;
      const candidates = records.filter((record) => record.period === Number(period.period) && elapsed >= record.start && elapsed <= record.end);
      const allocationKey = side === "home" ? "allocatedHome" : "allocatedAway";
      const scoreKey = side === "home" ? "homeScore" : "awayScore";
      let chosen;
      if (delta.points) chosen = candidates.find((record) => Number(record[scoreKey]) - record[allocationKey] >= delta.points);
      else if (previousBoundary?.elapsed === elapsed && candidates.includes(previousBoundary.record)) chosen = previousBoundary.record;
      else chosen = candidates.find((record) => signature(record.playersAway || []) === signature(current.away)
        && signature(record.playersHome || []) === signature(current.home)) || candidates[0];
      if (!chosen) { issues.add("Scoring events could not be reconciled with lineup intervals."); continue; }
      if (delta.points) chosen[allocationKey] += delta.points;
      previousBoundary = { elapsed, record: chosen };
      const attributed = { away: chosen.playersAway || [], home: chosen.playersHome || [] };
      if (delta.points) scoringEvents.push({ period: Number(period.period),
        elapsed,
        homeMargin: side === "home" ? delta.points : -delta.points,
        away: attributed.away.map(id), home: attributed.home.map(id) });
      for (const target of ["away", "home"]) {
        if (!validFive(attributed[target])) { issues.add("Substitutions could not be resolved to a five-player lineup."); continue; }
        const bucket = sample(target, attributed[target])[side === target ? "own" : "opponent"];
        Object.keys(delta).forEach((key) => { bucket[key] += delta[key]; });
      }
    }
  }
  if (records.some((record) => record.allocatedHome !== Number(record.homeScore) || record.allocatedAway !== Number(record.awayScore))) {
    issues.add("Interval scoring totals do not reconcile with the play-by-play.");
  }
  // Never show plausible-looking ratings from an empty, truncated, or revised
  // feed. Reconcile events with the independent box score before exposing them.
  for (const side of ["away", "home"]) {
    if (String(data?.[`${side}Team`]?.teamId) !== String(game?.[`${side}Team`]?.teamId)
      || Number(data?.[`${side}Team`]?.score) !== Number(game?.[`${side}Team`]?.score)) {
      issues.add("The game and minutes feeds are at different score updates.");
    }
    const totals = [...samples[side].values()].reduce((sum, row) => {
      Object.keys(sum).forEach((key) => { sum[key] += row.own[key]; }); return sum;
    }, emptyStats());
    if (Number(data?.[`${side}Team`]?.score) !== totals.points) issues.add("Play-by-play scoring does not reconcile with the minutes feed.");
    const box = game?.boxScore?.[side]?.players;
    if (!box?.length) issues.add("Box-score verification is unavailable.");
    else for (const [metric, field] of [["fga", "fieldGoalsAttempted"], ["fgm", "fieldGoalsMade"], ["three", "threePointersMade"], ["fta", "freeThrowsAttempted"]]) {
      const values = box.map((player) => player[field] ?? player.statistics?.[field]);
      if (values.some((value) => value == null)) { issues.add("Box-score verification is incomplete."); continue; }
      if (values.reduce((sum, value) => sum + Number(value), 0) !== totals[metric]) issues.add("Play-by-play shooting does not reconcile with the box score.");
    }
    for (const player of rosters[side].values()) {
      const expected = box?.find((row) => id(row) === id(player))?.plusMinusPoints;
      const actual = [...samples[side].values()].filter((row) => row.players.some((person) => id(person) === id(player)))
        .reduce((sum, row) => sum + row.own.points - row.opponent.points, 0);
      if (expected != null && Number(expected) !== actual) issues.add("Lineup scoring does not reconcile with player box-score plus/minus.");
    }
  }
  return { records, scoringEvents, rosters: Object.fromEntries(Object.entries(rosters).map(([side, roster]) => [side, [...roster.values()]])),
    samples: Object.fromEntries(Object.entries(samples).map(([side, rows]) => [side, [...rows.values()]])),
    totalSeconds: Math.max(4 * regulation, ...records.map((record) => record.end)), issues: [...issues] };
}

export function playerTimeline(model, side) {
  return model.rosters[side].map((player) => {
    const intervals = [];
    for (const record of model.records) {
      if (!(record[side === "home" ? "playersHome" : "playersAway"] || []).some((row) => id(row) === id(player))) continue;
      const margin = Number(record.plusMinus || 0) * (side === "home" ? 1 : -1);
      const last = intervals.at(-1);
      if (last && last.end === record.start && last.period === record.period) {
        last.end = record.end; last.margin += margin; last.endClock = record.endClock;
      } else intervals.push({ start: record.start, end: record.end, margin, period: record.period, startClock: record.startClock, endClock: record.endClock });
    }
    if (!model.issues.length) {
      intervals.forEach((interval) => { interval.margin = 0; });
      for (const event of model.scoringEvents) {
        if (!event[side].includes(id(player))) continue;
        const interval = intervals.find((row) => row.period === event.period && event.elapsed >= row.start && event.elapsed <= row.end);
        if (interval) interval.margin += event.homeMargin * (side === "home" ? 1 : -1);
      }
    }
    return { ...player, intervals };
  });
}

export function buildCombos(model, side, selectedIds) {
  const selected = [...new Set(selectedIds.map(String))].slice(0, 4);
  if (!selected.length) return [];
  const rows = Array.from({ length: 2 ** selected.length }, (_, mask) => ({ mask, seconds: 0, own: emptyStats(), opponent: emptyStats() }));
  for (const sample of model.samples[side]) {
    const present = new Set(sample.players.map(id));
    const mask = selected.reduce((value, playerId, index) => value | (present.has(playerId) ? 1 << index : 0), 0);
    const row = rows[mask]; row.seconds += sample.seconds;
    for (const direction of ["own", "opponent"]) Object.keys(row[direction]).forEach((key) => { row[direction][key] += sample[direction][key]; });
  }
  return rows.reverse().map((row) => ({ ...row, ...comboMetrics(row.own, row.opponent) }));
}
