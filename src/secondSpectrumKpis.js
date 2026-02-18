function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundPct(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ratioOrNull(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator;
}

function byTeam(items, teamId) {
  return asArray(items).filter((item) => item?.offTeamId === teamId);
}

export function getMarkingsDataThrough(markingsData) {
  const chances = asArray(markingsData?.chances);
  if (!chances.length) return null;

  const latest = chances.reduce((best, chance) => {
    if (!best) return chance;
    return asNumber(chance.endWallClock, -Infinity) > asNumber(best.endWallClock, -Infinity)
      ? chance
      : best;
  }, null);

  if (!latest) return null;

  const clock = asNumber(latest.endGameClock, 0);
  const mm = String(Math.floor(clock / 60)).padStart(2, "0");
  const ss = String(Math.floor(clock % 60)).padStart(2, "0");

  return {
    period: asNumber(latest.period, 0),
    gameClock: `${mm}:${ss}`,
    label: `${asNumber(latest.period, 0)}Q ${mm}:${ss}`,
  };
}

export function computeHalfCourtPaintTouchPct(markingsData, teamId) {
  const validHalfCourtChances = byTeam(markingsData?.chances, teamId).filter(
    (chance) => chance?.transition === false && chance?.valid === true,
  );
  const paintTouches = validHalfCourtChances.filter((chance) => chance?.ballInPaint === true).length;
  const pct = ratioOrNull(paintTouches, validHalfCourtChances.length);
  return pct === null ? null : roundPct(pct * 100, 0);
}

export function computeKickAheadsAndEarlyOpposites(markingsData, teamId) {
  const completedTeamPasses = byTeam(markingsData?.passes, teamId).filter((pass) => pass?.complete);
  const backcourt = completedTeamPasses.filter((pass) =>
    ["backcourt", "far"].includes(String(pass?.passerRegion || "")),
  );
  const earlyClock = backcourt.filter((pass) => {
    const sc = asNumber(pass?.shotClock, -1);
    return sc >= 18 && sc <= 24;
  });
  const aheadOrSkip = earlyClock.filter((pass) =>
    ["pass ahead", "skip"].includes(String(pass?.passType || "")),
  );
  return aheadOrSkip.filter((pass) => {
    const startX = asNumber(pass?.ballStartLoc?.[0], NaN);
    const endX = asNumber(pass?.ballEndLoc?.[0], NaN);
    if (!Number.isFinite(startX) || !Number.isFinite(endX)) return false;
    return Math.abs(startX - endX) >= 8;
  }).length;
}

export function computeTotalPasses(markingsData, teamId) {
  return byTeam(markingsData?.passes, teamId).length;
}

export function computeScoringPasses(markingsData, teamId) {
  const teamPasses = byTeam(markingsData?.passes, teamId);
  if (!teamPasses.length) return 0;

  const sorted = [...teamPasses].sort((a, b) => {
    const chanceCmp = String(a?.chanceId || "").localeCompare(String(b?.chanceId || ""));
    if (chanceCmp !== 0) return chanceCmp;
    return asNumber(a?.startFrame, 0) - asNumber(b?.startFrame, 0);
  });

  const assistCondition = sorted.map((pass) => {
    const startGameClock = asNumber(pass?.startGameClock, Infinity);
    const endGameClock = asNumber(pass?.endGameClock, -Infinity);
    return startGameClock - endGameClock <= 1 && Boolean(pass?.assistOpp);
  });

  const secondaryAssistOppCount = sorted.reduce((count, pass, idx) => {
    const nextPass = sorted[idx + 1];
    const sameChance = nextPass && String(nextPass?.chanceId || "") === String(pass?.chanceId || "");
    const leadAssist = sameChance ? Boolean(assistCondition[idx + 1]) : false;
    return leadAssist || Boolean(pass?.secondaryAssist) ? count + 1 : count;
  }, 0);

  const potentialAssists = teamPasses.filter((pass) => Boolean(pass?.assistOpp)).length;
  return potentialAssists + secondaryAssistOppCount;
}

export function computeKickoutPct(markingsData, teamId) {
  const drives = byTeam(markingsData?.drives, teamId);
  const driveAndKicks = drives.filter((drive) => String(drive?.endType || "") === "kickout").length;
  const pct = ratioOrNull(driveAndKicks, drives.length);
  return pct === null ? null : roundPct(pct * 100, 0);
}

export function computeCatchAndShootThreeStats(markingsData, teamId) {
  const threes = byTeam(markingsData?.shots, teamId).filter((shot) => shot?.three === true);
  const catchAndShootThrees = threes.filter((shot) => shot?.catchAndShoot === true);
  const frequency = ratioOrNull(catchAndShootThrees.length, threes.length);
  return {
    count: catchAndShootThrees.length,
    frequencyPct: frequency === null ? null : roundPct(frequency * 100, 0),
  };
}

export function computeShotDifferential(markingsData, teamId) {
  const shots = asArray(markingsData?.shots);
  const freeThrows = asArray(markingsData?.free_throws);

  const teamFga = shots.filter((s) => s?.offTeamId === teamId).length;
  const teamFta = freeThrows.filter((s) => s?.offTeamId === teamId).length;
  const oppFga = shots.filter((s) => s?.offTeamId !== teamId).length;
  const oppFta = freeThrows.filter((s) => s?.offTeamId !== teamId).length;

  const teamTotalShots = teamFga + teamFta / 2;
  const oppTotalShots = oppFga + oppFta / 2;
  return teamTotalShots - oppTotalShots;
}

export function computeNoReversalShotStats(markingsData, teamId) {
  const shotOutcomes = new Set(["FGM2", "FGM3", "FGX2", "FGX3", "FOU_S"]);
  const teamChances = byTeam(markingsData?.chances, teamId);
  const totalShots = teamChances.filter((chance) => shotOutcomes.has(String(chance?.outcome || "")));
  const noReversalShots = totalShots.filter((chance) => asNumber(chance?.reversals, 0) < 1);

  const frequency = ratioOrNull(noReversalShots.length, totalShots.length);

  return {
    count: noReversalShots.length,
    frequency: frequency === null ? null : roundPct(frequency, 4),
  };
}

export function computeSecondSpectrumTeamKpis(markingsData, teamId) {
  const catchAndShoot = computeCatchAndShootThreeStats(markingsData, teamId);
  const noReversal = computeNoReversalShotStats(markingsData, teamId);

  return {
    dataThrough: getMarkingsDataThrough(markingsData),
    halfCourtPaintTouchPct: computeHalfCourtPaintTouchPct(markingsData, teamId),
    kickAheadsAndEarlyOpposites: computeKickAheadsAndEarlyOpposites(markingsData, teamId),
    totalPasses: computeTotalPasses(markingsData, teamId),
    scoringPasses: computeScoringPasses(markingsData, teamId),
    kickoutPct: computeKickoutPct(markingsData, teamId),
    catchAndShootThrees: catchAndShoot.count,
    catchAndShootThreeFrequencyPct: catchAndShoot.frequencyPct,
    shotDifferential: computeShotDifferential(markingsData, teamId),
    noReversalShots: noReversal.count,
    noReversalShotFrequency: noReversal.frequency,
  };
}
