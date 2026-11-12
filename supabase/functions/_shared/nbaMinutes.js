const clockSeconds = value => {
  const text = String(value || '');
  const match = /^PT(?:(\d+)M)?([\d.]+)S$/i.exec(text) || /^(\d+):([\d.]+)$/.exec(text);
  return match ? Number(match[1] || 0) * 60 + Number(match[2]) : null;
};
const label = seconds => {
  const rounded = Math.round(seconds * 100) / 100;
  const sec = Math.round((rounded % 60) * 100) / 100;
  return `${Math.floor(rounded / 60)}:${sec < 10 ? '0' : ''}${sec}`;
};
const id = value => String(value);
const periodLength = (gameId, period) => period > 4 ? 300 : /^1[3456]/.test(gameId) ? 600 : 720;

// Enumerate every five-player intermediate lineup between two substitution
// stints. Missing/overlapping substitution records are deliberately rejected.
function boundaryCandidates(game, actions, stints, clock, lineups, end, isCurrentPeriod) {
  const adjacent = stints.filter(s => clockSeconds(s.startClock) > clockSeconds(s.endClock)
    && (clockSeconds(s.startClock) === clock || clockSeconds(s.endClock) === clock));
  if (adjacent.length === 1 && clock === end && isCurrentPeriod && Number(game.gameStatus) === 2) {
    // At a stopped live clock the post-substitution stint has zero duration.
    // Use it only when the independently supplied box-score on-court flags
    // identify exactly the same five players on each team.
    const confirmed = ['home', 'away'].every(side => {
      const onCourt = (game.boxScore?.[side]?.players || []).filter(p => String(p.oncourt) === '1').map(p => id(p.personId)).sort();
      const reconstructed = lineups[side].map(p => id(p.personId)).sort();
      return onCourt.length === 5 && new Set(onCourt).size === 5 && onCourt.join(',') === reconstructed.join(',');
    });
    if (confirmed) adjacent.push({ playersHome: lineups.home, playersAway: lineups.away });
  }
  if (adjacent.length !== 2) return [];
  const choices = {};
  for (const side of ['home', 'away']) {
    const key = side === 'home' ? 'playersHome' : 'playersAway';
    const before = adjacent[0][key].map(p => id(p.personId));
    const after = adjacent[1][key].map(p => id(p.personId));
    const removed = before.filter(p => !after.includes(p)), added = after.filter(p => !before.includes(p));
    const subs = actions.filter(a => a.actionType === 'substitution' && clockSeconds(a.clock) === clock && id(a.teamId) === id(game[`${side}Team`].teamId));
    const outs = subs.filter(a => a.subType === 'out').map(a => id(a.personId));
    const ins = subs.filter(a => a.subType === 'in').map(a => id(a.personId));
    const same = (a, b) => a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
    if (!same(removed, outs) || !same(added, ins) || removed.length !== added.length) return [];
    const playerRows = game.boxScore?.[side]?.players || [];
    if ([...new Set([...before, ...after])].some(personId => !playerRows.some(p => id(p.personId) === personId && p.plusMinusPoints != null && Number.isFinite(Number(p.plusMinusPoints))))) return [];
    choices[side] = [];
    for (let outMask = 0; outMask < 2 ** removed.length; outMask++) for (let inMask = 0; inMask < 2 ** added.length; inMask++) {
      const out = removed.filter((_, i) => outMask & (1 << i));
      const incoming = added.filter((_, i) => inMask & (1 << i));
      if (out.length === incoming.length) choices[side].push([...before.filter(p => !out.includes(p)), ...incoming]);
      if (choices[side].length > 128) return [];
    }
  }
  if (choices.home.length * choices.away.length > 128) return [];
  return choices.home.flatMap(home => choices.away.map(away => [
    ...home.map(personId => ({ Team_id: game.homeTeam.teamId, Person_id: personId })),
    ...away.map(personId => ({ Team_id: game.awayTeam.teamId, Person_id: personId })),
  ]));
}

export function buildNbaMinutes(game, roster, playersOnCourt = [], options = {}) {
  const gameId = String(game?.gameId || '');
  if (!/^\d{10}$/.test(gameId) || !Array.isArray(roster) || !Array.isArray(game?.playByPlayActions)) throw new Error('Invalid minutes source');
  const liveNba = /^00/.test(gameId) && Number(game.gameStatus) === 2;
  if (roster.some(row => row.Game_Id && String(row.Game_Id) !== gameId)) throw new Error('Minutes roster identity mismatch');
  const playedPeriods = Math.max(0, Number(game.period || 0));
  const periods = [];
  const courtByAction = new Map(playersOnCourt.map(row => [Number(row.Event_Num), row]));
  if (playersOnCourt.some(row => String(row.Game_id) !== gameId)) throw new Error('Players-on-court game identity mismatch');
  const playerSeconds = new Map();
  const inferredScoringEvents = [];
  const ordered = [...game.playByPlayActions].sort((a, b) => Number(a.period) - Number(b.period) || (clockSeconds(b.clock) ?? -1) - (clockSeconds(a.clock) ?? -1) || Number(a.orderNumber ?? a.actionNumber ?? 0) - Number(b.orderNumber ?? b.actionNumber ?? 0));
  for (let period = 1; period <= playedPeriods; period++) {
    const length = periodLength(gameId, period);
    const end = Number(game.gameStatus) === 2 && period === playedPeriods ? clockSeconds(game.gameClock) : 0;
    if (end == null || end < 0 || end > length) throw new Error('Minutes clock unavailable');
    const lineups = {};
    for (const side of ['home', 'away']) {
      const teamId = id(game[`${side}Team`]?.teamId);
      const rows = roster.filter(row => Number(row.Period) === period && id(row.Team_id) === teamId && row.Person_Type === 'Player');
      if (rows.length !== 5 || new Set(rows.map(row => id(row.Person_id))).size !== 5) throw new Error(`Period ${period} ${side} starting lineup incomplete`);
      lineups[side] = rows.map(row => ({ personId: row.Person_id, nameI: `${String(row.First_Name || '').charAt(0)}. ${row.Last_Name || ''}`.trim(), jerseyNum: String(row.Jersey_Number || '').trim() }));
    }
    const playerInfo = new Map(roster.filter(row => row.Person_Type === 'Player').map(row => [id(row.Person_id), { personId: row.Person_id, nameI: `${String(row.First_Name || '').charAt(0)}. ${row.Last_Name || ''}`.trim(), jerseyNum: String(row.Jersey_Number || '').trim() }]));
    const actions = ordered.filter(a => Number(a.period) === period && clockSeconds(a.clock) != null && clockSeconds(a.clock) >= end);
    const stints = []; let start = length; let homeScore = 0; let awayScore = 0;
    const finish = to => {
      if (start < to) throw new Error('Minutes event order invalid');
      if (start > to || homeScore || awayScore) {
        const home = lineups.home.map(p => ({ ...p })), away = lineups.away.map(p => ({ ...p }));
        stints.push({ startClock: label(start), endClock: label(to), playersHome: home, playersAway: away, homeScore, awayScore, plusMinus: homeScore - awayScore });
        for (const p of [...home, ...away]) playerSeconds.set(id(p.personId), (playerSeconds.get(id(p.personId)) || 0) + start - to);
      }
      start = to; homeScore = 0; awayScore = 0;
    };
    for (let i = 0; i < actions.length;) {
      const action = actions[i], clock = clockSeconds(action.clock);
      if (action.actionType === 'substitution' && clock !== length) {
        finish(clock);
        const changes = [];
        while (i < actions.length && actions[i].actionType === 'substitution' && clockSeconds(actions[i].clock) === clock) changes.push(actions[i++]);
        for (const side of ['home', 'away']) {
          const teamId = id(game[`${side}Team`].teamId);
          const subs = changes.filter(a => id(a.teamId) === teamId);
          for (const sub of subs.filter(a => a.subType === 'out')) {
            const index = lineups[side].findIndex(p => id(p.personId) === id(sub.personId));
            if (index < 0) throw new Error(`Period ${period} substitution out is not on court`);
            lineups[side].splice(index, 1);
          }
          for (const sub of subs.filter(a => a.subType === 'in')) {
            const player = playerInfo.get(id(sub.personId));
            if (!player || lineups[side].some(p => id(p.personId) === id(sub.personId))) throw new Error(`Period ${period} substitution in is invalid`);
            lineups[side].push(player);
          }
          if (lineups[side].length !== 5) throw new Error(`Period ${period} substitution group is incomplete`);
        }
        continue;
      }
      i++;
    }
    finish(end);
    // The NBA POC feed identifies the credited ten players per event. At a
    // shared substitution clock it can differ from PBP ordering, so match the
    // official event lineup to either adjacent stint (or a zero-time stint).
    const lineupKey = players => players.map(p => id(p.personId)).sort().join(',');
    for (const action of actions) {
      if (String(action.shotResult).toLowerCase() !== 'made') continue;
      const type = action.actionType;
      const points = type === '3pt' ? 3 : type === '2pt' ? 2 : type === 'freethrow' ? Number(action.value ?? action.shotValue ?? String(action.subType || '').match(/^1\s*for\s*([123])$/i)?.[1] ?? 1) : 0;
      if (!points) continue;
      if (!Number.isFinite(points) || points < 0 || points > 3) throw new Error('Scoring value unavailable');
      const row = courtByAction.get(Number(action.actionNumber));
      const eventLineups = {};
      if (!row || !Array.isArray(row.PlayersPlusMinus)) {
        // During live games the NBA POC stream can lag PBP for an entire
        // period. Infer within a unique substitution stint, including the
        // current live clock when no substitution is recorded at that clock.
        // Actual substitution boundaries must await the official lineup.
        const eventClock = clockSeconds(action.clock);
        const currentClockWithoutSub = period === playedPeriods && eventClock === end
          && !actions.some(item => item.actionType === 'substitution' && clockSeconds(item.clock) === eventClock);
        const matches = liveNba ? stints.filter(item =>
          clockSeconds(item.startClock) > eventClock && (clockSeconds(item.endClock) < eventClock
            || (currentClockWithoutSub && clockSeconds(item.endClock) === eventClock))) : [];
        if (matches.length !== 1) throw Object.assign(new Error(`Scoring action ${action.actionNumber} has no players-on-court data`), {
          code: 'POC_PENDING', actionNumber: Number(action.actionNumber),
          boundaryChoices: liveNba ? boundaryCandidates(game, actions, stints, eventClock, lineups, end, period === playedPeriods) : [],
        });
        eventLineups.home = matches[0].playersHome;
        eventLineups.away = matches[0].playersAway;
        inferredScoringEvents.push(Number(action.actionNumber));
      } else {
        if (row.inferredByReconciliation) inferredScoringEvents.push(Number(action.actionNumber));
        for (const side of ['home', 'away']) {
          const members = row.PlayersPlusMinus.filter(p => id(p.Team_id) === id(game[`${side}Team`].teamId));
          if (members.length !== 5 || new Set(members.map(p => id(p.Person_id))).size !== 5) throw new Error('Scoring action lineup is incomplete');
          eventLineups[side] = members.map(p => playerInfo.get(id(p.Person_id)));
          if (eventLineups[side].some(p => !p)) throw new Error('Scoring action references an unknown player');
        }
      }
      const clock = clockSeconds(action.clock);
      let stint = stints.find(item => clockSeconds(item.startClock) >= clock && clockSeconds(item.endClock) <= clock
        && lineupKey(item.playersHome) === lineupKey(eventLineups.home) && lineupKey(item.playersAway) === lineupKey(eventLineups.away));
      if (!stint) {
        // Substitutions can surround a free throw at the same clock. Preserve
        // the official scoring lineup as a zero-duration interval.
        const isBoundary = stints.some(item => clockSeconds(item.startClock) === clock || clockSeconds(item.endClock) === clock);
        if (!isBoundary) throw new Error(`Scoring lineup conflicts with substitution stints at ${period}:${action.clock} action ${action.actionNumber}`);
        stint = { startClock: label(clock), endClock: label(clock), playersHome: eventLineups.home, playersAway: eventLineups.away, homeScore: 0, awayScore: 0, plusMinus: 0 };
        const position = stints.findIndex(item => clockSeconds(item.startClock) <= clock);
        stints.splice(position < 0 ? stints.length : position, 0, stint);
      }
      if (id(action.teamId) === id(game.homeTeam.teamId)) stint.homeScore += points;
      else if (id(action.teamId) === id(game.awayTeam.teamId)) stint.awayScore += points;
      else throw new Error('Scoring action team mismatch');
      stint.plusMinus = stint.homeScore - stint.awayScore;
    }
    for (const side of ['home', 'away']) {
      const official = game[`${side}Team`]?.periods?.find(row => Number(row.period) === period)?.score;
      const total = stints.reduce((n, stint) => n + stint[`${side}Score`], 0);
      if (official != null && Number(official) !== total) throw new Error(`Period ${period} ${side} score does not reconcile`);
    }
    stints.forEach((stint, index) => {
      if (index) { stint.prevPlayersHome = stints[index - 1].playersHome; stint.prevPlayersAway = stints[index - 1].playersAway; }
    });
    periods.push({ period, periodLabel: period > 4 ? `OT${period - 4}` : `Q${period}`, stints });
  }
  // Historical G League events can retain old score snapshots after later
  // corrections. Detect that source conflict for diagnosis, but do not reject
  // if independent period scores and player box-score margins all reconcile.
  const finalEvent = Number(game.gameStatus) === 3 ? [...ordered].reverse().find(action => [action.scoreHome, action.scoreAway]
    .every(value => value != null && value !== '' && Number.isFinite(Number(value)))) : null;
  const scoreboard = [game.homeTeam?.score, game.awayTeam?.score];
  const finalScoreConflict = finalEvent && scoreboard.every(value => value != null && value !== '' && Number.isFinite(Number(value)))
    && (Number(finalEvent.scoreHome) !== Number(scoreboard[0]) || Number(finalEvent.scoreAway) !== Number(scoreboard[1]));
  const minuteDifferences = [];
  for (const side of ['home', 'away']) for (const player of game.boxScore?.[side]?.players || []) {
    const expected = clockSeconds(player.minutes);
    if (expected != null) minuteDifferences.push({ personId: id(player.personId), delta: (playerSeconds.get(id(player.personId)) || 0) - expected });
    if (player.plusMinusPoints != null && !options.skipScoringValidation) {
      const margin = periods.flatMap(p => p.stints).filter(stint => stint[side === 'home' ? 'playersHome' : 'playersAway'].some(p => id(p.personId) === id(player.personId))).reduce((sum, stint) => sum + (side === 'home' ? 1 : -1) * stint.plusMinus, 0);
      if (Number(player.plusMinusPoints) !== margin) {
        if (finalScoreConflict) throw Object.assign(new Error('Final play-by-play score conflicts with scoreboard and player plus/minus'), { code: 'FINAL_SCORE_CONFLICT' });
        throw new Error(`Player ${player.personId} lineup scoring does not reconcile`);
      }
    }
  }
  const discrepancies = minuteDifferences.filter(row => Math.abs(row.delta) > 2);
  let boxClockLagSeconds = 0;
  if (discrepancies.length) {
    const lastPeriod = periods.at(-1);
    const active = [...(lastPeriod?.stints || [])].reverse().find(stint => clockSeconds(stint.startClock) > clockSeconds(stint.endClock));
    const activeIds = new Set([...(active?.playersHome || []), ...(active?.playersAway || [])].map(player => id(player.personId)));
    const activeDeltas = minuteDifferences.filter(row => activeIds.has(row.personId)).map(row => row.delta);
    const min = Math.min(...activeDeltas), max = Math.max(...activeDeltas);
    // NBA box minutes and game clock can be sampled seconds apart. Accept only
    // a common positive lag on all ten currently active players; never mask an
    // inactive-player mismatch, an individual discrepancy, or a final game.
    const coherentLiveLag = liveNba && activeIds.size === 10 && activeDeltas.length === 10
      && discrepancies.every(row => activeIds.has(row.personId)) && min >= -1 && max <= 30 && max - min <= 2;
    if (!coherentLiveLag) throw new Error(`Player ${discrepancies[0].personId} minutes do not reconcile`);
    boxClockLagSeconds = Math.round((min + max) * 50) / 100;
  }
  return { gameId, gameStatus: game.gameStatus, period: game.period, gameClock: game.gameClock, homeTeam: game.homeTeam, awayTeam: game.awayTeam, periods,
    source: inferredScoringEvents.length ? 'nba-rosterlineup-pbp-inferred' : 'nba-rosterlineup-pbp', inferredScoringEvents, boxClockLagSeconds };
}

function reconcilePendingLineups(game, roster, officialRows) {
  const provisional = [...officialRows], issues = [];
  let base;
  while (true) {
    try { base = buildNbaMinutes(game, roster, provisional, { skipScoringValidation: true }); break; }
    catch (error) {
      if (error?.code !== 'POC_PENDING' || !error.boundaryChoices?.length || issues.length >= 12) throw error;
      issues.push(error);
      provisional.push({ Game_id: String(game.gameId), Event_Num: error.actionNumber, PlayersPlusMinus: error.boundaryChoices[0], inferredByReconciliation: true });
    }
  }
  const expected = new Map(), current = new Map();
  for (const side of ['home', 'away']) for (const player of game.boxScore?.[side]?.players || []) {
    if (player.plusMinusPoints != null) { expected.set(id(player.personId), Number(player.plusMinusPoints)); current.set(id(player.personId), 0); }
  }
  for (const period of base.periods) for (const stint of period.stints) for (const [side, key] of [['home', 'playersHome'], ['away', 'playersAway']]) {
    for (const player of stint[key]) if (current.has(id(player.personId))) {
      const personId = id(player.personId);
      current.set(personId, current.get(personId) + (side === 'home' ? 1 : -1) * stint.plusMinus);
    }
  }
  // Each candidate contributes a known scoring margin to its ten players.
  // Bound the remaining contribution per player to prune impossible paths.
  const options = issues.map(issue => {
    const action = game.playByPlayActions.find(item => Number(item.actionNumber) === issue.actionNumber);
    const points = action.actionType === '3pt' ? 3 : action.actionType === '2pt' ? 2
      : Number(action.value ?? action.shotValue ?? String(action.subType || '').match(/^1\s*for\s*([123])$/i)?.[1] ?? 1);
    const sign = id(action.teamId) === id(game.homeTeam.teamId) ? 1 : -1;
    const values = choice => new Map(choice.map(player => [id(player.Person_id), (id(player.Team_id) === id(game.homeTeam.teamId) ? 1 : -1) * sign * points]));
    const first = values(issue.boundaryChoices[0]);
    return issue.boundaryChoices.map(choice => {
      const next = values(choice), difference = new Map();
      for (const personId of new Set([...first.keys(), ...next.keys()])) if (expected.has(personId)) {
        const value = (next.get(personId) || 0) - (first.get(personId) || 0);
        if (value) difference.set(personId, value);
      }
      return difference;
    });
  });
  const keys = [...expected.keys()];
  const minima = Array.from({ length: issues.length + 1 }, () => new Map());
  const maxima = Array.from({ length: issues.length + 1 }, () => new Map());
  for (let i = issues.length - 1; i >= 0; i--) for (const personId of keys) {
    const values = options[i].map(option => option.get(personId) || 0);
    minima[i].set(personId, (minima[i + 1].get(personId) || 0) + Math.min(...values));
    maxima[i].set(personId, (maxima[i + 1].get(personId) || 0) + Math.max(...values));
  }
  const solutions = [], path = [], delta = new Map();
  let visited = 0; const deadline = Date.now() + 1500;
  const search = index => {
    if (++visited > 50000 || Date.now() > deadline || solutions.length > 1) return;
    for (const personId of keys) {
      const remaining = expected.get(personId) - current.get(personId) - (delta.get(personId) || 0);
      if (remaining < (minima[index].get(personId) || 0) || remaining > (maxima[index].get(personId) || 0)) return;
    }
    if (index === issues.length) { solutions.push([...path]); return; }
    for (let choice = 0; choice < options[index].length; choice++) {
      const difference = options[index][choice];
      for (const [personId, value] of difference) delta.set(personId, (delta.get(personId) || 0) + value);
      path.push(choice); search(index + 1); path.pop();
      for (const [personId, value] of difference) delta.set(personId, delta.get(personId) - value);
      if (solutions.length > 1 || visited > 50000 || Date.now() > deadline) return;
    }
  };
  search(0);
  if (solutions.length !== 1 || visited > 50000 || Date.now() > deadline) throw new Error('Scoring lineup reconciliation was ambiguous or exceeded its limit');
  const resolved = [...officialRows];
  issues.forEach((issue, index) => resolved.push({ Game_id: String(game.gameId), Event_Num: issue.actionNumber,
    PlayersPlusMinus: issue.boundaryChoices[solutions[0][index]], inferredByReconciliation: true }));
  return buildNbaMinutes(game, roster, resolved);
}

export async function fetchNbaMinutes(game, apiKey, fetcher = fetch) {
  if (!apiKey) throw new Error('NBA_API_KEY is not configured');
  const load = async path => {
    const url = new URL(`https://api.nba.com/v0/api/stats/${path}`); url.searchParams.set('gameId', String(game.gameId));
    const response = await fetcher(url, { headers: { 'X-NBA-Api-Key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`NBA ${path} unavailable (${response.status})`);
    if (path === 'poc' && response.status === 204 && /^00/.test(String(game.gameId))) return [];
    return response.json();
  };
  const [roster, playersOnCourt] = await Promise.all([load('rosterlineup'), load('poc')]);
  if (!Array.isArray(playersOnCourt)) throw new Error('Players-on-court feed invalid');
  try {
    return buildNbaMinutes(game, roster, playersOnCourt);
  } catch (error) {
    if (error?.code !== 'POC_PENDING') throw error;
    // NBA publishes PBP and players-on-court separately. Give a missing event
    // one bounded retry; never guess its lineup or retry a source conflict.
    await new Promise(resolve => setTimeout(resolve, 300));
    const refreshed = await load('poc');
    if (!Array.isArray(refreshed)) throw new Error('Players-on-court feed invalid');
    try { return buildNbaMinutes(game, roster, refreshed); } catch (pending) {
      if (pending?.code !== 'POC_PENDING' || !pending.boundaryChoices?.length) throw pending;
      try { return reconcilePendingLineups(game, roster, refreshed); } catch { throw pending; }
    }
  }
}
