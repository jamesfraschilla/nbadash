function parseClock(clock) {
  if (!clock) return 0;
  const parts = clock.split(":");
  if (parts.length !== 2) return 0;
  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  return minutes * 60 + seconds;
}

export function segmentPeriods(segment) {
  switch (segment) {
    case "q1":
      return (p) => p === 1;
    case "q2":
      return (p) => p === 2;
    case "q3":
      return (p) => p === 3;
    case "q4":
      return (p) => p === 4;
    case "q1-q3":
      return (p) => p >= 1 && p <= 3;
    case "first-half":
      return (p) => p === 1 || p === 2;
    case "second-half":
      return (p) => p === 3 || p === 4;
    default:
      return () => true;
  }
}

export function filterActions(actions, segment) {
  const predicate = segmentPeriods(segment);
  return actions.filter((action) => predicate(action.period));
}

function ensurePlayer(map, playerId, base) {
  if (!map.has(playerId)) {
    map.set(playerId, {
      personId: playerId,
      firstName: base?.firstName || "",
      familyName: base?.familyName || "",
      jerseyNum: base?.jerseyNum || "",
      position: base?.position || "",
      minutes: 0,
      plusMinusPoints: 0,
      points: 0,
      reboundsTotal: 0,
      reboundsOffensive: 0,
      assists: 0,
      blocks: 0,
      steals: 0,
      turnovers: 0,
      foulsPersonal: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      rimFieldGoalsMade: 0,
      rimFieldGoalsAttempted: 0,
      midFieldGoalsMade: 0,
      midFieldGoalsAttempted: 0,
    });
  }
  return map.get(playerId);
}

function addSeconds(player, seconds) {
  player.minutes += seconds;
}

function addPlusMinus(player, value) {
  player.plusMinusPoints += value;
}

function addRebound(player, isOffensive) {
  player.reboundsTotal += 1;
  if (isOffensive) player.reboundsOffensive += 1;
}

function classifyShot(action) {
  if (action.actionType === "3pt") return "three";
  const distance = Number(action.shotDistance || 0);
  if (distance <= 4.9) return "rim";
  return "mid";
}

function isPersonalFoul(action) {
  const subtype = String(action.subType || "").toLowerCase();
  return !subtype.includes("technical");
}

export function aggregateSegmentStats({
  actions,
  segment,
  minutesData,
  homeTeam,
  awayTeam,
  basePlayers,
}) {
  const predicate = segmentPeriods(segment);
  const segmentSeconds =
    minutesData?.periods?.reduce((sum, period) => {
      if (!predicate(period.period)) return sum;
      const stints = period.stints || [];
      return (
        sum +
        stints.reduce(
          (stintSum, stint) => stintSum + (parseClock(stint.startClock) - parseClock(stint.endClock)),
          0
        )
      );
    }, 0) ?? null;
  const segmentActions = actions.filter((action) => predicate(action.period));
  const orderedActions = [...segmentActions].sort((a, b) => {
    const aOrder = a.orderNumber ?? a.actionNumber ?? 0;
    const bOrder = b.orderNumber ?? b.actionNumber ?? 0;
    return aOrder - bOrder;
  });
  const actionByNumber = new Map(segmentActions.map((action) => [action.actionNumber, action]));

  const playerMap = new Map();
  const baseMap = new Map();
  basePlayers.forEach((player) => baseMap.set(player.personId, player));
  const creditedBlocks = new Set();
  const creditedTransitionTurnovers = new Set();

  const blockKey = (playerId, period, clock) =>
    `${playerId}:${period || "na"}:${clock || "na"}`;

  const creditBlock = (playerId, teamId, key) => {
    if (!playerId || !teamId) return;
    if (key && creditedBlocks.has(key)) return;
    if (key) creditedBlocks.add(key);
    const blocker = ensurePlayer(playerMap, playerId, baseMap.get(playerId));
    blocker.blocks += 1;
    if (teamTotals[teamId]) teamTotals[teamId].blocks += 1;
  };

  const teamTotals = {
    [awayTeam.teamId]: {
      points: 0,
      reboundsTotal: 0,
      reboundsOffensive: 0,
      assists: 0,
      blocks: 0,
      steals: 0,
      turnovers: 0,
      foulsPersonal: 0,
      transitionPoints: 0,
      transitionTurnovers: 0,
      transitionPossessions: 0,
      secondChancePoints: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      rimFieldGoalsMade: 0,
      rimFieldGoalsAttempted: 0,
      midFieldGoalsMade: 0,
      midFieldGoalsAttempted: 0,
      drivingFGMade: 0,
      drivingFGAttempted: 0,
      cuttingFGMade: 0,
      cuttingFGAttempted: 0,
      catchAndShoot3FGMade: 0,
      catchAndShoot3FGAttempted: 0,
      pointsOffTurnovers: 0,
      paintPoints: 0,
    },
    [homeTeam.teamId]: {
      points: 0,
      reboundsTotal: 0,
      reboundsOffensive: 0,
      assists: 0,
      blocks: 0,
      steals: 0,
      turnovers: 0,
      foulsPersonal: 0,
      transitionPoints: 0,
      transitionTurnovers: 0,
      transitionPossessions: 0,
      secondChancePoints: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      rimFieldGoalsMade: 0,
      rimFieldGoalsAttempted: 0,
      midFieldGoalsMade: 0,
      midFieldGoalsAttempted: 0,
      drivingFGMade: 0,
      drivingFGAttempted: 0,
      cuttingFGMade: 0,
      cuttingFGAttempted: 0,
      catchAndShoot3FGMade: 0,
      catchAndShoot3FGAttempted: 0,
      pointsOffTurnovers: 0,
      paintPoints: 0,
    },
  };

  if (segment !== "all" && segmentSeconds === 0 && segmentActions.length === 0) {
    return {
      playerMap,
      teamTotals,
    };
  }

  const lastMissedShotByTeam = new Map();

  orderedActions.forEach((action) => {
    const teamId = action.teamId;
    const isHome = teamId === homeTeam.teamId;
    const isAway = teamId === awayTeam.teamId;

    const teamStats = teamTotals[teamId];

    if (action.actionType === "2pt" || action.actionType === "3pt") {
      const description = `${action.description || ""} ${action.descriptor || ""}`.toLowerCase();
      const drivingKeywords = ["driving layup", "driving dunk", "driving float", "driving hook"];
      const shotDistance = Number(action.shotDistance || 0);
      const isDriving =
        action.actionType === "2pt" &&
        shotDistance <= 7 &&
        drivingKeywords.some((keyword) => description.includes(keyword));
      const isCutting = description.includes("cutting");
      const isPullup = /pull.?up/.test(description);
      const isStepBack = /step.?back/.test(description);
      const isCatchAndShoot3 = action.actionType === "3pt" && !isPullup && !isStepBack;

      const qualifiers = action.qualifiers || [];
      const isFastBreak = qualifiers.includes("fastbreak");
      const isSecondChance = qualifiers.includes("2ndchance") || qualifiers.includes("secondchance");
      const isFromTurnover = qualifiers.includes("fromturnover");

      if (isFromTurnover) {
        const opponentId = isHome ? awayTeam.teamId : isAway ? homeTeam.teamId : null;
        if (opponentId && teamTotals[opponentId]) {
          const possessionKey = action.possession ?? action.actionNumber;
          const creditKey = `${opponentId}:${possessionKey}`;
          if (!creditedTransitionTurnovers.has(creditKey)) {
            creditedTransitionTurnovers.add(creditKey);
            teamTotals[opponentId].transitionTurnovers += 1;
          }
        }
      }

      if (teamStats) {
        teamStats.fieldGoalsAttempted += 1;
        if (isFastBreak) teamStats.transitionPossessions += 1;
        const shotType = classifyShot(action);
        if (shotType === "three") teamStats.threePointersAttempted += 1;
        if (shotType === "rim") teamStats.rimFieldGoalsAttempted += 1;
        if (shotType === "mid") teamStats.midFieldGoalsAttempted += 1;
        if (isDriving) teamStats.drivingFGAttempted += 1;
        if (isCutting) teamStats.cuttingFGAttempted += 1;
        if (isCatchAndShoot3) teamStats.catchAndShoot3FGAttempted += 1;
      }
      if (action.shotResult === "Made") {
        const points = action.actionType === "3pt" ? 3 : 2;
        if (teamStats) {
          teamStats.points += points;
          if (isFastBreak) teamStats.transitionPoints += points;
          if (isSecondChance) teamStats.secondChancePoints += points;
          teamStats.fieldGoalsMade += 1;
          if (action.actionType === "3pt") teamStats.threePointersMade += 1;
          if (classifyShot(action) === "rim") teamStats.rimFieldGoalsMade += 1;
          if (classifyShot(action) === "mid") teamStats.midFieldGoalsMade += 1;
          if (isDriving) teamStats.drivingFGMade += 1;
          if (isCutting) teamStats.cuttingFGMade += 1;
          if (isCatchAndShoot3) teamStats.catchAndShoot3FGMade += 1;
          if (qualifiers.includes("fromturnover")) teamStats.pointsOffTurnovers += points;
          if (qualifiers.includes("pointsinthepaint")) teamStats.paintPoints += points;
        }
      } else if (teamId) {
        lastMissedShotByTeam.set(teamId, action);
      }

      if (action.personId) {
        const player = ensurePlayer(playerMap, action.personId, baseMap.get(action.personId));
        player.fieldGoalsAttempted += 1;
        const shotType = classifyShot(action);
        if (shotType === "three") player.threePointersAttempted += 1;
        if (shotType === "rim") player.rimFieldGoalsAttempted += 1;
        if (shotType === "mid") player.midFieldGoalsAttempted += 1;
        if (action.shotResult === "Made") {
          const points = action.actionType === "3pt" ? 3 : 2;
          player.points += points;
          player.fieldGoalsMade += 1;
          if (shotType === "three") player.threePointersMade += 1;
          if (shotType === "rim") player.rimFieldGoalsMade += 1;
          if (shotType === "mid") player.midFieldGoalsMade += 1;
        }
      }

      if (action.assistPersonId) {
        const assister = ensurePlayer(playerMap, action.assistPersonId, baseMap.get(action.assistPersonId));
        assister.assists += 1;
        if (teamStats) teamStats.assists += 1;
      }

      if (action.blockPersonId) {
        const blockTeamId = isHome ? awayTeam.teamId : isAway ? homeTeam.teamId : null;
        const key = blockKey(action.blockPersonId, action.period, action.clock);
        creditBlock(action.blockPersonId, blockTeamId, key);
      }
    }

    if (action.actionType === "freethrow") {
      if (teamStats) teamStats.freeThrowsAttempted += 1;
      if (action.personId) {
        const player = ensurePlayer(playerMap, action.personId, baseMap.get(action.personId));
        player.freeThrowsAttempted += 1;
        if (action.shotResult === "Made") {
          player.freeThrowsMade += 1;
          player.points += 1;
        }
      }
      if (action.shotResult === "Made" && teamStats) {
        teamStats.freeThrowsMade += 1;
        teamStats.points += 1;
      }
    }

    if (action.actionType === "rebound") {
      const isOffensive = action.subType === "offensive";
      if (teamStats) {
        teamStats.reboundsTotal += 1;
        if (isOffensive) teamStats.reboundsOffensive += 1;
      }
      if (action.personId) {
        const player = ensurePlayer(playerMap, action.personId, baseMap.get(action.personId));
        addRebound(player, isOffensive);
      }

      if (isOffensive) {
        const shot = action.shotActionNumber ? actionByNumber.get(action.shotActionNumber) : null;
        const lastMiss = lastMissedShotByTeam.get(teamId);
        const isThreePointMiss =
          shot?.actionType === "3pt" || lastMiss?.actionType === "3pt";
        if (isThreePointMiss && teamStats) {
          teamStats.threePointOReb = (teamStats.threePointOReb || 0) + 1;
        }
        if (teamId) lastMissedShotByTeam.delete(teamId);
      } else {
        const opponentId = isHome ? awayTeam.teamId : isAway ? homeTeam.teamId : null;
        if (opponentId) lastMissedShotByTeam.delete(opponentId);
      }
    }

    if (action.actionType === "steal" && action.personId) {
      const player = ensurePlayer(playerMap, action.personId, baseMap.get(action.personId));
      player.steals += 1;
      if (teamStats) teamStats.steals += 1;
    }

    if (action.actionType === "block" && action.personId) {
      const key = blockKey(action.personId, action.period, action.clock);
      creditBlock(action.personId, action.teamId, key);
    }

    if (action.actionType === "turnover" && action.personId) {
      const qualifiers = action.qualifiers || [];
      const player = ensurePlayer(playerMap, action.personId, baseMap.get(action.personId));
      player.turnovers += 1;
      if (teamStats) {
        teamStats.turnovers += 1;
        if (qualifiers.includes("fromturnover") || qualifiers.includes("fastbreak")) {
          teamStats.transitionTurnovers += 1;
          teamStats.transitionPossessions += 1;
        }
      }
    }

    if (action.actionType === "foul" && action.personId) {
      if (isPersonalFoul(action)) {
        const player = ensurePlayer(playerMap, action.personId, baseMap.get(action.personId));
        player.foulsPersonal += 1;
        if (teamStats) teamStats.foulsPersonal += 1;
      }
    }

    if (action.actionType === "foul" && action.subType === "offensive") {
      const opponentId = isHome ? awayTeam.teamId : isAway ? homeTeam.teamId : null;
      if (opponentId && teamTotals[opponentId]) {
        teamTotals[opponentId].offensiveFoulsDrawn = (teamTotals[opponentId].offensiveFoulsDrawn || 0) + 1;
      }
    }
  });

  if (minutesData?.periods) {
    minutesData.periods.forEach((period) => {
      if (!predicate(period.period)) return;
      period.stints.forEach((stint) => {
        const duration = parseClock(stint.startClock) - parseClock(stint.endClock);
        const awayPlusMinus = stint.plusMinus || 0;
        const homePlusMinus = -awayPlusMinus;

        stint.playersAway.forEach((player) => {
          const entry = ensurePlayer(playerMap, player.personId, baseMap.get(player.personId));
          addSeconds(entry, duration);
          addPlusMinus(entry, awayPlusMinus);
        });

        stint.playersHome.forEach((player) => {
          const entry = ensurePlayer(playerMap, player.personId, baseMap.get(player.personId));
          addSeconds(entry, duration);
          addPlusMinus(entry, homePlusMinus);
        });
      });
    });
  }

  Object.values(teamTotals).forEach((team) => {
    team.threePointOReb = team.threePointOReb || 0;
    team.offensiveFoulsDrawn = team.offensiveFoulsDrawn || 0;
  });

  return {
    playerMap,
    teamTotals,
  };
}

export function computeKills(actions, segment, homeTeamId, awayTeamId) {
  const predicate = segmentPeriods(segment);
  const segmentActions = actions
    .filter((action) => predicate(action.period))
    .sort((a, b) => a.orderNumber - b.orderNumber);

  const streaks = {
    [homeTeamId]: 0,
    [awayTeamId]: 0,
  };
  const kills = {
    [homeTeamId]: 0,
    [awayTeamId]: 0,
  };

  let currentPossession = null;
  let possessionScored = false;
  let possessionTeam = null;

  const finishPossession = () => {
    if (!possessionTeam) return;
    if (!possessionScored) {
      streaks[possessionTeam] += 1;
      if (streaks[possessionTeam] >= 3 && streaks[possessionTeam] % 3 === 0) {
        const opponent = possessionTeam === homeTeamId ? awayTeamId : homeTeamId;
        kills[opponent] += 1;
      }
    } else {
      streaks[possessionTeam] = 0;
    }
  };

  segmentActions.forEach((action) => {
    if (action.possession && action.possession !== currentPossession) {
      finishPossession();
      currentPossession = action.possession;
      possessionTeam = action.possession;
      possessionScored = false;
    }

    if (!possessionTeam) return;

    if ((action.actionType === "2pt" || action.actionType === "3pt") && action.shotResult === "Made") {
      possessionScored = true;
    }

    if (action.actionType === "freethrow" && action.teamId === possessionTeam) {
      possessionScored = true;
    }
  });

  finishPossession();

  return {
    homeKills: kills[homeTeamId] || 0,
    awayKills: kills[awayTeamId] || 0,
  };
}
