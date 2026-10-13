// The upstream minutes feed can begin at Q1's first substitution, omitting
// the opening lineup. Recover the missing interval from substitutions and PBP
// scores; never relabel the post-substitution lineup as the starters.
type Row = Record<string, any>;

function clockSeconds(value: unknown): number | null {
  const text = String(value || "");
  const iso = /^PT(\d+)M([\d.]+)S$/i.exec(text);
  const clock = /^(\d+):([\d.]+)$/.exec(text);
  const match = iso || clock;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const clockLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round((seconds % 60) * 1000) / 1000).padStart(2, "0")}`;
const playerId = (player: Row) => String(player?.personId || "");

export function needsOpeningStintRepair(data: Row | null): boolean {
  const q1 = data?.periods?.find((period: Row) => Number(period.period) === 1);
  if (!q1?.stints?.length) return false;
  const firstStart = Math.max(...q1.stints.map((stint: Row) => clockSeconds(stint.startClock) ?? -1));
  const regulationSeconds = /^1(?:3|4|5|6)\d{8}$/.test(String(data?.gameId || "")) ? 600 : 720;
  return firstStart >= 0 && firstStart < regulationSeconds;
}

function repairOpeningQuarter(data: Row | null, game: Row | null, rebuild = false): Row | null {
  if (data?.periods?.some((period: Row) => Number(period.period) > 4)) {
    let removed = 0;
    const periods = data.periods.map((period: Row) => {
      if (Number(period.period) <= 4 || !Array.isArray(period.stints)) return period;
      const valid = period.stints.filter((stint: Row) => (clockSeconds(stint.startClock) ?? 0) <= 300);
      if (!valid.some((stint: Row) => clockSeconds(stint.startClock) === 300)) return period;
      const stints = period.stints.filter((stint: Row) => {
        const placeholder = (clockSeconds(stint.startClock) ?? 0) > 300
          && Number(stint.homeScore || 0) === 0 && Number(stint.awayScore || 0) === 0;
        if (placeholder) removed += 1;
        return !placeholder;
      });
      return stints.length === period.stints.length ? period : { ...period, stints };
    });
    if (removed) data = { ...data, periods, overtimeStintRepair: { removedPlaceholderStints: removed } };
  }
  if ((!needsOpeningStintRepair(data) && !rebuild) || !data) return data;
  const q1 = data.periods.find((period: Row) => Number(period.period) === 1);
  const stints: Row[] = [...q1.stints].sort((a, b) => (clockSeconds(b.startClock) ?? 0) - (clockSeconds(a.startClock) ?? 0));
  const first = stints[0];
  const firstSeconds = clockSeconds(first.startClock)!;
  const unresolved = (reason: string): Row => ({
    ...data,
    openingStintRepair: { status: "unresolved", reason },
  });
  if (!game?.playByPlayActions?.length) return unresolved("Opening play-by-play is unavailable.");
  const actions: Row[] = game.playByPlayActions.filter((action: Row) => (
    Number(action.period) === 1 && action.actionType !== "status" && clockSeconds(action.clock) != null
  )).sort((a: Row, b: Row) => (
    clockSeconds(b.clock)! - clockSeconds(a.clock)!
    || Number(a.orderNumber || a.actionNumber || 0) - Number(b.orderNumber || b.actionNumber || 0)
  ));
  const start = actions.find((action) => action.actionType === "period" && action.subType === "start");
  const regulationSeconds = clockSeconds(start?.clock);
  if (regulationSeconds == null || regulationSeconds < firstSeconds) {
    return unresolved("The opening period boundary could not be verified.");
  }
  const sides = ["Away", "Home"] as const;
  const lineups: Record<string, Row[]> = {};
  const playersById = new Map<string, Row>();
  for (const side of sides) {
    const players = first[`players${side}`];
    if (!Array.isArray(players) || new Set(players.map(playerId)).size !== 5) {
      return unresolved("The first known lineup is incomplete.");
    }
    lineups[side] = players.map((player: Row) => ({ ...player }));
    const boxPlayers = game.boxScore?.[side.toLowerCase()]?.players || [];
    for (const player of boxPlayers) {
      const familyName = String(player.familyName || "").trim();
      playersById.set(playerId(player), {
        personId: player.personId,
        nameI: player.nameI || `${String(player.firstName || "").charAt(0)}. ${familyName}`.trim(),
        jerseyNum: player.jerseyNum || "",
      });
    }
  }
  for (const action of actions) {
    if (action.personId && action.playerNameI && !playersById.has(playerId(action))) {
      playersById.set(playerId(action), { personId: action.personId, nameI: action.playerNameI, jerseyNum: "" });
    }
  }
  for (const stint of stints) {
    for (const side of sides) {
      for (const player of stint[`players${side}`] || []) {
        if (!playersById.has(playerId(player))) playersById.set(playerId(player), player);
      }
    }
  }
  const groups = new Map<number, Row[]>();
  for (const action of actions) {
    const seconds = clockSeconds(action.clock)!;
    if (seconds < firstSeconds || seconds > regulationSeconds || action.actionType !== "substitution") continue;
    if (firstSeconds === regulationSeconds && seconds === regulationSeconds) continue;
    const group = groups.get(seconds) || [];
    group.push(action);
    groups.set(seconds, group);
  }
  // A boundary's score belongs to the lineup leaving the court. Free throws
  // after the substitution at the same clock belong to the new lineup.
  function scoreAt(seconds: number): { home: number; away: number } | null {
    if (seconds === regulationSeconds) return { home: 0, away: 0 };
    let score: { home: number; away: number } | null = null;
    for (const action of actions) {
      // The feed's known period-opening lineup already includes between-period
      // substitutions; replaying those would replace players a second time.
      if (firstSeconds === regulationSeconds && clockSeconds(action.clock) === regulationSeconds && action.actionType === "substitution") continue;
      const actionSeconds = clockSeconds(action.clock)!;
      if (actionSeconds < seconds || (actionSeconds === seconds && action.actionType === "substitution")) break;
      if (action.scoreHome == null || action.scoreHome === "" || action.scoreAway == null || action.scoreAway === "") continue;
      const home = Number(action.scoreHome);
      const away = Number(action.scoreAway);
      if (Number.isFinite(home) && Number.isFinite(away)) score = { home, away };
    }
    return score;
  }
  const missing: Row[] = [];
  function appendStint(from: number, to: number): boolean {
    if (from <= to) return true;
    const startScore = scoreAt(from);
    const endScore = scoreAt(to);
    if (!startScore || !endScore || endScore.home < startScore.home || endScore.away < startScore.away) return false;
    const homeScore = endScore.home - startScore.home;
    const awayScore = endScore.away - startScore.away;
    missing.unshift({
      startClock: clockLabel(from), endClock: clockLabel(to),
      homeScore, awayScore, plusMinus: homeScore - awayScore,
      playersAway: lineups.Away.map((player) => ({ ...player })),
      playersHome: lineups.Home.map((player) => ({ ...player })),
    });
    return true;
  }
  let cursor = firstSeconds;
  for (const [seconds, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    if (!appendStint(seconds, cursor)) return unresolved("Opening stint scores could not be verified.");
    for (const side of sides) {
      const teamId = String(data[`${side.toLowerCase()}Team`]?.teamId || game[`${side.toLowerCase()}Team`]?.teamId || "");
      const teamSubs = group.filter((action) => String(action.teamId) === teamId);
      const ins = [...new Set(teamSubs.filter((action) => action.subType === "in").map(playerId))];
      const outs = [...new Set(teamSubs.filter((action) => action.subType === "out").map(playerId))];
      if (!ins.length && !outs.length) continue;
      if (ins.length !== outs.length) return unresolved("Opening substitution pairs are incomplete.");
      const outgoing = outs.map((id) => playersById.get(id));
      const positions = ins.map((id) => lineups[side].findIndex((player) => playerId(player) === id));
      if (outgoing.some((player) => !player) || positions.some((index) => index < 0)) {
        return unresolved("Opening substitutions do not match the known lineup.");
      }
      positions.forEach((position, index) => {
        lineups[side][position] = { ...outgoing[index]!, rowPosition: lineups[side][position].rowPosition ?? position };
      });
      if (new Set(lineups[side].map(playerId)).size !== 5) return unresolved("Opening lineup contains duplicate players.");
    }
    cursor = seconds;
  }
  if (!appendStint(regulationSeconds, cursor) || (!missing.length && firstSeconds < regulationSeconds)) {
    return unresolved("Opening stint scores could not be verified.");
  }
  // Rebuild observed Q1 transitions when PBP covers the whole available span.
  // Separate substitutions with a free throw between them, even at one clock.
  // Otherwise the intermediate lineup's point disappears from stint totals.
  function rebuildObservedQuarter(): Row[] | null {
    const lastClock = clockSeconds(actions[actions.length - 1]?.clock);
    const feedEnd = Math.min(...stints.map((stint) => clockSeconds(stint.endClock) ?? Infinity));
    if (lastClock == null || lastClock > feedEnd) return null;
    const result: Row[] = [];
    let current: Row = { ...(missing[0] || first), startClock: clockLabel(regulationSeconds), homeScore: 0, awayScore: 0, plusMinus: 0 };
    let pending: Row[] = [];
    let scoreHome = 0;
    let scoreAway = 0;
    function flush(): boolean {
      if (!pending.length) return true;
      const next: Row = { ...current, homeScore: 0, awayScore: 0, plusMinus: 0, startClock: clockLabel(clockSeconds(pending[0].clock)!) };
      for (const side of sides) {
        const teamId = String(data![`${side.toLowerCase()}Team`]?.teamId || game![`${side.toLowerCase()}Team`]?.teamId || "");
        const teamSubs = pending.filter((action) => String(action.teamId) === teamId);
        const ins = [...new Set(teamSubs.filter((action) => action.subType === "in").map(playerId))];
        const outs = [...new Set(teamSubs.filter((action) => action.subType === "out").map(playerId))];
        if (ins.length !== outs.length) return false;
        const players: Row[] = current[`players${side}`].map((player: Row) => ({ ...player }));
        for (let index = 0; index < outs.length; index += 1) {
          const position = players.findIndex((player) => playerId(player) === outs[index]);
          const incoming = playersById.get(ins[index]);
          if (position < 0 || !incoming) return false;
          players[position] = { ...incoming, rowPosition: players[position].rowPosition ?? position };
        }
        if (new Set(players.map(playerId)).size !== 5) return false;
        next[`players${side}`] = players;
      }
      current.endClock = next.startClock;
      if (current.startClock !== current.endClock || current.homeScore || current.awayScore) result.push(current);
      current = next;
      pending = [];
      return true;
    }
    for (const action of actions) {
      if (action.actionType === "substitution") {
        if (firstSeconds === regulationSeconds && clockSeconds(action.clock) === regulationSeconds) continue;
        if (pending.length && clockSeconds(pending[0].clock) !== clockSeconds(action.clock) && !flush()) return null;
        pending.push(action);
      } else if (!flush()) {
        // Feed bookkeeping (timeout/replay/rebound) can separate an out/in
        // pair. Wait for its matching row only if no scoring intervenes.
        const home = Number(action.scoreHome), away = Number(action.scoreAway);
        if ((action.scoreHome != null && action.scoreHome !== "" && home !== scoreHome)
          || (action.scoreAway != null && action.scoreAway !== "" && away !== scoreAway)) return null;
        continue;
      }
      if (action.scoreHome == null || action.scoreHome === "" || action.scoreAway == null || action.scoreAway === "") continue;
      const home = Number(action.scoreHome);
      const away = Number(action.scoreAway);
      if (!Number.isFinite(home) || !Number.isFinite(away) || home < scoreHome || away < scoreAway) return null;
      current.homeScore += home - scoreHome;
      current.awayScore += away - scoreAway;
      current.plusMinus = current.homeScore - current.awayScore;
      scoreHome = home;
      scoreAway = away;
    }
    if (!flush()) return null;
    current.endClock = clockLabel(lastClock);
    if (current.startClock !== current.endClock || current.homeScore || current.awayScore) result.push(current);
    return result.length ? result : null;
  }
  const repaired = (rebuildObservedQuarter() || [...missing, ...stints]).map((stint, index, all) => ({
    ...stint,
    prevPlayersAway: all[index - 1]?.playersAway || [],
    prevPlayersHome: all[index - 1]?.playersHome || [],
    nextPlayersAway: all[index + 1]?.playersAway || [],
    nextPlayersHome: all[index + 1]?.playersHome || [],
  }));
  return {
    ...data,
    periods: data.periods.map((period: Row) => period === q1 ? { ...period, stints: repaired } : period),
    openingStintRepair: { status: "repaired", missingSeconds: regulationSeconds - firstSeconds },
  };
}

// Apply the same verified reconstruction to every period. Pseudo-quarter
// scores are rebased to the real period's opening score, so Q2/OT points
// cannot accidentally include earlier quarters.
export function normalizeOpeningMinutesData(data: Row | null, game: Row | null): Row | null {
  data = repairOpeningQuarter(data, game);
  if (!data || !game?.playByPlayActions?.length) return data;
  let changed = false;
  const repairs: Row[] = [];
  const periods = (data.periods || []).map((period: Row) => {
    if (!period.stints?.length) return period;
    const actions: Row[] = game.playByPlayActions.filter((a: Row) => Number(a.period) === Number(period.period) && a.actionType !== "status" && clockSeconds(a.clock) != null)
      .sort((a: Row, b: Row) => clockSeconds(b.clock)! - clockSeconds(a.clock)! || Number(a.orderNumber || a.actionNumber || 0) - Number(b.orderNumber || b.actionNumber || 0));
    const start = actions.find((a) => a.actionType === "period" && a.subType === "start");
    const last = actions.at(-1);
    if (!start || !last || start.scoreHome == null || start.scoreAway == null) return period;
    const baseHome = Number(start.scoreHome), baseAway = Number(start.scoreAway);
    const expectedHome = Number(last.scoreHome) - baseHome, expectedAway = Number(last.scoreAway) - baseAway;
    const summedHome = period.stints.reduce((n: number, s: Row) => n + Number(s.homeScore || 0), 0);
    const summedAway = period.stints.reduce((n: number, s: Row) => n + Number(s.awayScore || 0), 0);
    const firstSeconds = Math.max(...period.stints.map((s: Row) => clockSeconds(s.startClock) ?? -1));
    if (firstSeconds === clockSeconds(start.clock) && summedHome === expectedHome && summedAway === expectedAway) return period;
    const pseudo = { ...data, periods: [{ ...period, period: 1 }] };
    const pseudoGame = { ...game, playByPlayActions: actions.map((a) => ({ ...a, period: 1,
      scoreHome: a.scoreHome == null || a.scoreHome === "" ? a.scoreHome : String(Number(a.scoreHome) - baseHome),
      scoreAway: a.scoreAway == null || a.scoreAway === "" ? a.scoreAway : String(Number(a.scoreAway) - baseAway),
    })) };
    const repaired = repairOpeningQuarter(pseudo, pseudoGame, true);
    if (repaired?.openingStintRepair?.status !== "repaired") {
      repairs.push({ period: period.period, status: "unresolved", reason: repaired?.openingStintRepair?.reason || "Period timeline could not be verified." });
      return period;
    }
    const stints = repaired.periods[0].stints;
    if (stints.reduce((n: number, s: Row) => n + Number(s.homeScore || 0), 0) !== expectedHome
      || stints.reduce((n: number, s: Row) => n + Number(s.awayScore || 0), 0) !== expectedAway) {
      repairs.push({ period: period.period, status: "unresolved", reason: "Reconstructed period scores do not reconcile." });
      return period;
    }
    changed = true;
    repairs.push({ period: period.period, status: "repaired" });
    return { ...period, stints };
  });
  if (!changed && !repairs.length) return data;
  return { ...data, periods, periodStintRepairs: repairs };
}
