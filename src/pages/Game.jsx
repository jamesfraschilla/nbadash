import { Link, useSearchParams, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGame, fetchMinutes, teamLogoUrl } from "../api.js";
import { gameStatusLabel, normalizeClock } from "../utils.js";
import BoxScoreTable from "../components/BoxScoreTable.jsx";
import StatBars from "../components/StatBars.jsx";
import Officials from "../components/Officials.jsx";
import TransitionStats from "../components/TransitionStats.jsx";
import MiscStats from "../components/MiscStats.jsx";
import CreatingDisruption from "../components/CreatingDisruption.jsx";
import SegmentSelector from "../components/SegmentSelector.jsx";
import { aggregateSegmentStats, computeKills, segmentPeriods } from "../segmentStats.js";
import styles from "./Game.module.css";

const SNAPSHOT_STORAGE_PREFIX = "nba-dashboard:snapshots:";
const CORE_STAT_FIELDS = [
  "points",
  "reboundsTotal",
  "reboundsOffensive",
  "assists",
  "blocks",
  "steals",
  "turnovers",
  "foulsPersonal",
  "fieldGoalsMade",
  "fieldGoalsAttempted",
  "threePointersMade",
  "threePointersAttempted",
  "freeThrowsMade",
  "freeThrowsAttempted",
  "rimFieldGoalsMade",
  "rimFieldGoalsAttempted",
  "midFieldGoalsMade",
  "midFieldGoalsAttempted",
];
const SEGMENT_STAT_DEFAULTS = {
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
};

const reviveSnapshotEntry = (entry) => {
  if (!entry?.snapshot) return entry;
  const snapshot = entry.snapshot;
  let playersMap = snapshot.players;
  if (playersMap instanceof Map) {
    return entry;
  }
  if (Array.isArray(playersMap)) {
    playersMap = new Map(playersMap);
  } else if (playersMap && typeof playersMap === "object") {
    playersMap = new Map(Object.values(playersMap).map((player) => [player.personId, player]));
  } else {
    playersMap = new Map();
  }
  return {
    ...entry,
    snapshot: {
      ...snapshot,
      players: playersMap,
    },
  };
};

const serializeSnapshotEntry = (entry) => {
  if (!entry?.snapshot) return entry;
  const snapshot = entry.snapshot;
  const players = snapshot.players instanceof Map
    ? Array.from(snapshot.players.entries())
    : snapshot.players;
  return {
    ...entry,
    snapshot: {
      ...snapshot,
      players,
    },
  };
};

const loadSnapshots = (gameId) => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(`${SNAPSHOT_STORAGE_PREFIX}${gameId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(reviveSnapshotEntry) : [];
  } catch {
    return [];
  }
};

const saveSnapshots = (gameId, snapshots) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${SNAPSHOT_STORAGE_PREFIX}${gameId}`,
    JSON.stringify((snapshots || []).map(serializeSnapshotEntry))
  );
};

const buildSnapshot = (boxScore) => {
  if (!boxScore?.home || !boxScore?.away) return null;
  const players = new Map();
  [boxScore.home, boxScore.away].forEach((team) => {
    (team.players || []).forEach((player) => {
      players.set(player.personId, player);
    });
  });
  return {
    teams: {
      [boxScore.home.teamId]: boxScore.home.totals,
      [boxScore.away.teamId]: boxScore.away.totals,
    },
    players,
  };
};

const diffStats = (start = {}, end = {}) => {
  const diff = {};
  CORE_STAT_FIELDS.forEach((field) => {
    diff[field] = (end?.[field] || 0) - (start?.[field] || 0);
  });
  return diff;
};

const diffSnapshots = (startSnapshot, endSnapshot, basePlayers) => {
  if (!endSnapshot) return null;
  const teamTotals = {};
  Object.keys(endSnapshot.teams || {}).forEach((teamId) => {
    teamTotals[teamId] = diffStats(startSnapshot?.teams?.[teamId], endSnapshot.teams[teamId]);
  });
  const playerMap = new Map();
  basePlayers.forEach((player) => {
    const start = startSnapshot?.players?.get(player.personId) || {};
    const end = endSnapshot.players?.get(player.personId) || {};
    const diff = diffStats(start, end);
    playerMap.set(player.personId, {
      personId: player.personId,
      firstName: player.firstName || "",
      familyName: player.familyName || "",
      jerseyNum: player.jerseyNum || "",
      position: player.position || "",
      minutes: 0,
      plusMinusPoints: 0,
      ...diff,
    });
  });
  return { teamTotals, playerMap };
};

const getPeriodEndKey = (period) => `period-end-${period}`;

const buildChallengeCircles = (challenges) => {
  const total = challenges?.challengesTotal ?? 0;
  const won = challenges?.challengesWon ?? 0;

  const circles = [];
  if (total === 0) {
    circles.push({ state: "available" });
    return circles;
  }

  circles.push({ state: won >= 1 ? "won" : "lost" });

  if (won >= 1) {
    if (total >= 2) {
      circles.push({ state: won >= 2 ? "won" : "lost" });
    } else {
      circles.push({ state: "available" });
    }
  }

  return circles;
};

const getSegmentSnapshotBounds = (segment, snapshots, currentSnapshot, currentPeriod) => {
  const snapshotEntries = snapshots || [];
  const snapshotByKey = new Map(snapshotEntries.map((s) => [s.key, s]));
  const periodEndEntry = (period) => snapshotByKey.get(getPeriodEndKey(period)) || null;
  const periodEndSnapshot = (period) => periodEndEntry(period)?.snapshot || null;
  const latestSnapshotEntry = snapshotEntries.reduce((latest, entry) => {
    if (!entry?.actionNumber) return latest;
    if (!latest || entry.actionNumber > latest.actionNumber) return entry;
    return latest;
  }, null);

  const zeroSnapshot = { teams: {}, players: new Map() };

  const isLivePeriod = (period) => currentPeriod === period;

  switch (segment) {
    case "all":
      return {
        start: zeroSnapshot,
        startMeta: null,
        end: currentSnapshot,
        endIsLive: false,
      };
    case "q1":
      return {
        start: zeroSnapshot,
        startMeta: null,
        end: periodEndSnapshot(1) || (isLivePeriod(1) ? currentSnapshot : null),
        endIsLive: isLivePeriod(1),
      };
    case "q2":
      return {
        start: periodEndSnapshot(1),
        startMeta: periodEndEntry(1),
        end: periodEndSnapshot(2) || (isLivePeriod(2) ? currentSnapshot : null),
        endIsLive: isLivePeriod(2),
      };
    case "q3":
      return {
        start: periodEndSnapshot(2),
        startMeta: periodEndEntry(2),
        end: periodEndSnapshot(3) || (isLivePeriod(3) ? currentSnapshot : null),
        endIsLive: isLivePeriod(3),
      };
    case "q4":
      return {
        start: periodEndSnapshot(3),
        startMeta: periodEndEntry(3),
        end: periodEndSnapshot(4) || (isLivePeriod(4) ? currentSnapshot : null),
        endIsLive: isLivePeriod(4),
      };
    case "first-half":
      return {
        start: zeroSnapshot,
        startMeta: null,
        end:
          periodEndSnapshot(2) ||
          ((currentPeriod === 1 || currentPeriod === 2) ? currentSnapshot : null),
        endIsLive: currentPeriod === 1 || currentPeriod === 2,
      };
    case "second-half":
      return {
        start: periodEndSnapshot(2),
        startMeta: periodEndEntry(2),
        end:
          periodEndSnapshot(4) ||
          ((currentPeriod === 3 || currentPeriod === 4) ? currentSnapshot : null),
        endIsLive: currentPeriod === 3 || currentPeriod === 4,
      };
    case "q1-q3":
      return {
        start: zeroSnapshot,
        startMeta: null,
        end:
          periodEndSnapshot(3) ||
          ((currentPeriod === 1 || currentPeriod === 2 || currentPeriod === 3) ? currentSnapshot : null),
        endIsLive: currentPeriod === 3,
      };
    default:
      return null;
  }
};

export default function Game() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const dateParam = params.get("d");
  const [segment, setSegment] = useState("all");
  const [snapshots, setSnapshots] = useState(() => loadSnapshots(gameId));
  const statsNavRef = useRef(null);
  const boxScoreNavRef = useRef(null);
  const handleScrollToAdvanced = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleScrollToBoxScore = () => {
    if (!boxScoreNavRef.current) return;
    const top = window.scrollY + boxScoreNavRef.current.getBoundingClientRect().top;
    const header = document.querySelector("header");
    const offset = header?.getBoundingClientRect().height || 0;
    window.scrollTo({ top: Math.max(0, top - offset), behavior: "smooth" });
  };

  const { data: game, isLoading, error } = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => fetchGame(gameId),
    enabled: Boolean(gameId),
    staleTime: 30_000,
    refetchInterval: (data) => (data?.gameStatus === 3 ? false : 15_000),
    refetchIntervalInBackground: true,
  });

  const { data: minutesData } = useQuery({
    queryKey: ["minutes", gameId],
    queryFn: () => fetchMinutes(gameId),
    enabled: Boolean(gameId),
    refetchInterval: () => (game?.gameStatus === 3 ? false : 15_000),
    refetchIntervalInBackground: true,
  });

  const { homeTeam, awayTeam, teamStats, boxScore, officials, callsAgainst } = game || {};
  const timeouts = game?.timeouts;
  const challenges = game?.challenges;
  const status = game ? gameStatusLabel(game) : "";
  const isLive = game?.gameStatus === 2;
  const clock = isLive ? normalizeClock(game?.gameClock) : null;
  const useSnapshots = isLive;

  const basePlayers = [
    ...(boxScore?.away?.players || []),
    ...(boxScore?.home?.players || []),
  ];

  const currentSnapshot = useMemo(() => buildSnapshot(boxScore), [boxScore]);

  useEffect(() => {
    if (!gameId || !boxScore || !game || !useSnapshots) return;
    const existing = loadSnapshots(gameId);
    const existingKeys = new Set(existing.map((s) => s.key));
    const additions = [];
    const snapshot = buildSnapshot(boxScore);
    if (!snapshot) return;

    (game.playByPlayActions || []).forEach((action) => {
      if (action.actionType === "period" && action.subType === "end") {
        const key = getPeriodEndKey(action.period);
        if (!existingKeys.has(key)) {
          additions.push({
            key,
            type: "period-end",
            period: action.period,
            clock: action.clock,
            actionNumber: action.actionNumber,
            snapshot,
            updatedAt: Date.now(),
          });
          existingKeys.add(key);
        }
      }
      if (action.actionType === "timeout") {
        const key = `timeout-${action.actionNumber}`;
        if (!existingKeys.has(key)) {
          additions.push({
            key,
            type: "timeout",
            period: action.period,
            clock: action.clock,
            actionNumber: action.actionNumber,
            snapshot,
            updatedAt: Date.now(),
          });
          existingKeys.add(key);
        }
      }
    });

    if (additions.length) {
      const nextSnapshots = [...existing, ...additions];
      saveSnapshots(gameId, nextSnapshots);
      setSnapshots(nextSnapshots);
    }
  }, [gameId, boxScore, game, useSnapshots]);

  useEffect(() => {
    setSnapshots(loadSnapshots(gameId));
  }, [gameId]);

  const segmentStats = homeTeam?.teamId && awayTeam?.teamId
    ? aggregateSegmentStats({
      actions: game?.playByPlayActions || [],
      segment,
      minutesData,
      homeTeam,
      awayTeam,
      basePlayers,
    })
    : { playerMap: new Map(), teamTotals: {} };

  const snapshotBounds = useMemo(() => {
    if (!useSnapshots) return null;
    return getSegmentSnapshotBounds(segment, snapshots, currentSnapshot, game?.period);
  }, [useSnapshots, segment, snapshots, currentSnapshot, game?.period]);
  const snapshotLabel = useMemo(() => {
    if (!snapshotBounds?.startMeta) return null;
    const { type, period, clock } = snapshotBounds.startMeta;
    const labelType = type === "period-end" ? "Period end" : "Timeout";
    return `${labelType} (Q${period} ${clock})`;
  }, [snapshotBounds]);
  const snapshotStats = useMemo(() => {
    if (!snapshotBounds || !snapshotBounds.end || !snapshotBounds.start) return null;
    if (!homeTeam?.teamId || !awayTeam?.teamId) return null;
    return diffSnapshots(snapshotBounds.start, snapshotBounds.end, basePlayers);
  }, [snapshotBounds, basePlayers, homeTeam, awayTeam]);

  const playerMap = useMemo(() => {
    if (!snapshotStats) return segmentStats.playerMap;
    const merged = new Map(segmentStats.playerMap);
    snapshotStats.playerMap.forEach((snap, personId) => {
      const base = merged.get(personId) || snap;
      merged.set(personId, {
        ...base,
        ...snap,
        minutes: base.minutes ?? snap.minutes,
        plusMinusPoints: base.plusMinusPoints ?? snap.plusMinusPoints,
      });
    });
    return merged;
  }, [segmentStats.playerMap, snapshotStats]);

  const formatMinutesFromSeconds = (seconds) => {
    const safeSeconds = Math.max(0, Math.round(seconds || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const parseDuration = (value) => {
    if (!value) return null;
    const match = /PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(String(value));
    if (!match) return null;
    const minutes = Number(match[1] || 0);
    const seconds = Number(match[2] || 0);
    return Math.round(minutes * 60 + seconds);
  };

  const buildPlayers = (players) =>
    players
      .map((player) => {
        const stats = playerMap.get(player.personId) || {};
        const base = segment === "all"
          ? player
          : {
            personId: player.personId,
            firstName: player.firstName || "",
            familyName: player.familyName || "",
            jerseyNum: player.jerseyNum || "",
            position: player.position || "",
          };
        const safeStats = segment === "all" ? stats : { ...SEGMENT_STAT_DEFAULTS, ...stats };
        const officialSeconds = segment === "all" ? parseDuration(player.minutes) : null;
        const minutesSeconds =
          segment === "all" && Number.isFinite(officialSeconds) ? officialSeconds : safeStats.minutes;
        const plusMinusPoints =
          segment === "all" && player.plusMinusPoints != null ? player.plusMinusPoints : safeStats.plusMinusPoints;
        return {
          ...base,
          ...safeStats,
          plusMinusPoints,
          minutes: formatMinutesFromSeconds(minutesSeconds),
        };
      })
      .filter((player) => player.minutes !== "00:00" || player.points > 0 || player.reboundsTotal > 0);

  const awayPlayers = buildPlayers(boxScore?.away?.players || []);
  const homePlayers = buildPlayers(boxScore?.home?.players || []);

  const baseAwayTotals = awayTeam?.teamId ? segmentStats.teamTotals[awayTeam.teamId] || {} : {};
  const baseHomeTotals = homeTeam?.teamId ? segmentStats.teamTotals[homeTeam.teamId] || {} : {};
  const awaySnapshotTotals = awayTeam?.teamId ? snapshotStats?.teamTotals?.[awayTeam.teamId] : null;
  const homeSnapshotTotals = homeTeam?.teamId ? snapshotStats?.teamTotals?.[homeTeam.teamId] : null;
  const isLiveSegment = segment !== "all" && snapshotBounds?.endIsLive;
  const mergeTeamTotals = (base, snapshot) => {
    if (!snapshot) return base;
    const merged = { ...base, ...snapshot };
    if (isLiveSegment) {
      const basePoints = base?.points ?? 0;
      const snapPoints = snapshot?.points;
      merged.points = Number.isFinite(snapPoints) ? Math.max(basePoints, snapPoints) : basePoints;
    }
    return merged;
  };
  const awayTotals = mergeTeamTotals(baseAwayTotals, awaySnapshotTotals);
  const homeTotals = mergeTeamTotals(baseHomeTotals, homeSnapshotTotals);
  const advancedAwayTotals = baseAwayTotals;
  const advancedHomeTotals = baseHomeTotals;
  const displayAwayScore = segment === "all" ? awayTeam?.score ?? 0 : awayTotals.points || 0;
  const displayHomeScore = segment === "all" ? homeTeam?.score ?? 0 : homeTotals.points || 0;

  if (isLoading) {
    return <div className={styles.stateMessage}>Loading game details...</div>;
  }

  if (error || !game) {
    return <div className={styles.stateMessage}>Failed to load game details.</div>;
  }

  const possessions = (teamTotals) =>
    (teamTotals.fieldGoalsAttempted || 0) +
    0.44 * (teamTotals.freeThrowsAttempted || 0) +
    (teamTotals.turnovers || 0) -
    (teamTotals.reboundsOffensive || 0);

  const useOfficialRatings = segment === "all" && teamStats?.away?.offensiveRating && teamStats?.home?.offensiveRating;

  const ortgAway = useOfficialRatings
    ? Math.round(teamStats.away.offensiveRating)
    : Math.round((advancedAwayTotals.points || 0) / Math.max(possessions(advancedAwayTotals), 1) * 100);
  const ortgHome = useOfficialRatings
    ? Math.round(teamStats.home.offensiveRating)
    : Math.round((advancedHomeTotals.points || 0) / Math.max(possessions(advancedHomeTotals), 1) * 100);
  const netAway = useOfficialRatings
    ? Math.round(teamStats.away.netRating)
    : ortgAway - Math.round((advancedHomeTotals.points || 0) / Math.max(possessions(advancedHomeTotals), 1) * 100);
  const netHome = useOfficialRatings
    ? Math.round(teamStats.home.netRating)
    : ortgHome - Math.round((advancedAwayTotals.points || 0) / Math.max(possessions(advancedAwayTotals), 1) * 100);

  const officialAwayPossessions = teamStats?.away?.possessions;
  const officialHomePossessions = teamStats?.home?.possessions;
  const useOfficialPossessions = segment === "all" && officialAwayPossessions && officialHomePossessions;

  const awayPossessions = Math.max(
    useOfficialPossessions ? officialAwayPossessions : possessions(advancedAwayTotals),
    1
  );
  const homePossessions = Math.max(
    useOfficialPossessions ? officialHomePossessions : possessions(advancedHomeTotals),
    1
  );

  const transitionStatsDerived = (teamTotals, possessionsCount) => ({
    transitionRate: (teamTotals.transitionPossessions || 0)
      ? ((teamTotals.transitionPossessions || 0) / possessionsCount) * 100
      : 0,
    transitionPoints: teamTotals.transitionPoints || 0,
    transitionTurnovers: teamTotals.transitionTurnovers || 0,
    secondChancePoints: teamTotals.secondChancePoints || 0,
    pointsOffTurnovers: teamTotals.pointsOffTurnovers || 0,
    paintPoints: teamTotals.paintPoints || 0,
    threePointORebPercent: teamTotals.reboundsOffensive
      ? ((teamTotals.threePointOReb || 0) / teamTotals.reboundsOffensive) * 100
      : 0,
  });

  const useOfficialTransition = segment === "all"
    && teamStats?.away?.transitionStats
    && teamStats?.home?.transitionStats;
  const awayTransitionDerived = transitionStatsDerived(advancedAwayTotals, awayPossessions);
  const homeTransitionDerived = transitionStatsDerived(advancedHomeTotals, homePossessions);
  const mergeTransition = (derived, official) =>
    official
      ? { ...derived, ...official }
      : derived;
  const awayTransition = useOfficialTransition
    ? mergeTransition(awayTransitionDerived, teamStats.away.transitionStats)
    : awayTransitionDerived;
  const homeTransition = useOfficialTransition
    ? mergeTransition(homeTransitionDerived, teamStats.home.transitionStats)
    : homeTransitionDerived;

  const awayDefReb = (advancedAwayTotals.reboundsTotal || 0) - (advancedAwayTotals.reboundsOffensive || 0);
  const homeDefReb = (advancedHomeTotals.reboundsTotal || 0) - (advancedHomeTotals.reboundsOffensive || 0);

  const efg = (fgm, fga, tpm) => (fga ? ((fgm + 0.5 * tpm) / fga) * 100 : 0);
  const tov = (to, fga, fta) => (fga || fta || to ? (to / (fga + 0.44 * fta + to)) * 100 : 0);
  const orb = (orbValue, oppDrb) =>
    orbValue || oppDrb ? (orbValue / (orbValue + oppDrb)) * 100 : 0;
  const ftr = (fta, fga) => (fga ? (fta / fga) * 100 : 0);

  const fourFactorRows = [
    {
      label: "eFG%",
      awayValue: efg(advancedAwayTotals.fieldGoalsMade, advancedAwayTotals.fieldGoalsAttempted, advancedAwayTotals.threePointersMade),
      homeValue: efg(advancedHomeTotals.fieldGoalsMade, advancedHomeTotals.fieldGoalsAttempted, advancedHomeTotals.threePointersMade),
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      label: "TOV%",
      awayValue: tov(advancedAwayTotals.turnovers, advancedAwayTotals.fieldGoalsAttempted, advancedAwayTotals.freeThrowsAttempted),
      homeValue: tov(advancedHomeTotals.turnovers, advancedHomeTotals.fieldGoalsAttempted, advancedHomeTotals.freeThrowsAttempted),
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      label: "ORB%",
      awayValue: orb(advancedAwayTotals.reboundsOffensive, homeDefReb),
      homeValue: orb(advancedHomeTotals.reboundsOffensive, awayDefReb),
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      label: "FTr",
      awayValue: ftr(advancedAwayTotals.freeThrowsAttempted, advancedAwayTotals.fieldGoalsAttempted),
      homeValue: ftr(advancedHomeTotals.freeThrowsAttempted, advancedHomeTotals.fieldGoalsAttempted),
      format: (v) => `${v.toFixed(1)}`,
    },
  ];

  const totalFgaAway = advancedAwayTotals.fieldGoalsAttempted || 0;
  const totalFgaHome = advancedHomeTotals.fieldGoalsAttempted || 0;

  const shotProfileRows = [
    {
      label: "Rim Rate",
      awayValue: totalFgaAway ? ((advancedAwayTotals.rimFieldGoalsAttempted || 0) / totalFgaAway) * 100 : 0,
      homeValue: totalFgaHome ? ((advancedHomeTotals.rimFieldGoalsAttempted || 0) / totalFgaHome) * 100 : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${advancedAwayTotals.rimFieldGoalsMade || 0}/${advancedAwayTotals.rimFieldGoalsAttempted || 0}`,
      homeDetail: `${advancedHomeTotals.rimFieldGoalsMade || 0}/${advancedHomeTotals.rimFieldGoalsAttempted || 0}`,
    },
    {
      label: "Mid Rate",
      awayValue: totalFgaAway ? ((advancedAwayTotals.midFieldGoalsAttempted || 0) / totalFgaAway) * 100 : 0,
      homeValue: totalFgaHome ? ((advancedHomeTotals.midFieldGoalsAttempted || 0) / totalFgaHome) * 100 : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${advancedAwayTotals.midFieldGoalsMade || 0}/${advancedAwayTotals.midFieldGoalsAttempted || 0}`,
      homeDetail: `${advancedHomeTotals.midFieldGoalsMade || 0}/${advancedHomeTotals.midFieldGoalsAttempted || 0}`,
    },
    {
      label: "3P Rate",
      awayValue: totalFgaAway ? ((advancedAwayTotals.threePointersAttempted || 0) / totalFgaAway) * 100 : 0,
      homeValue: totalFgaHome ? ((advancedHomeTotals.threePointersAttempted || 0) / totalFgaHome) * 100 : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${advancedAwayTotals.threePointersMade || 0}/${advancedAwayTotals.threePointersAttempted || 0}`,
      homeDetail: `${advancedHomeTotals.threePointersMade || 0}/${advancedHomeTotals.threePointersAttempted || 0}`,
    },
  ];

  const shotEffRows = [
    {
      label: "Rim FG%",
      awayValue: advancedAwayTotals.rimFieldGoalsAttempted
        ? (advancedAwayTotals.rimFieldGoalsMade / advancedAwayTotals.rimFieldGoalsAttempted) * 100
        : 0,
      homeValue: advancedHomeTotals.rimFieldGoalsAttempted
        ? (advancedHomeTotals.rimFieldGoalsMade / advancedHomeTotals.rimFieldGoalsAttempted) * 100
        : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${advancedAwayTotals.rimFieldGoalsMade || 0}/${advancedAwayTotals.rimFieldGoalsAttempted || 0}`,
      homeDetail: `${advancedHomeTotals.rimFieldGoalsMade || 0}/${advancedHomeTotals.rimFieldGoalsAttempted || 0}`,
    },
    {
      label: "Mid FG%",
      awayValue: advancedAwayTotals.midFieldGoalsAttempted
        ? (advancedAwayTotals.midFieldGoalsMade / advancedAwayTotals.midFieldGoalsAttempted) * 100
        : 0,
      homeValue: advancedHomeTotals.midFieldGoalsAttempted
        ? (advancedHomeTotals.midFieldGoalsMade / advancedHomeTotals.midFieldGoalsAttempted) * 100
        : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${advancedAwayTotals.midFieldGoalsMade || 0}/${advancedAwayTotals.midFieldGoalsAttempted || 0}`,
      homeDetail: `${advancedHomeTotals.midFieldGoalsMade || 0}/${advancedHomeTotals.midFieldGoalsAttempted || 0}`,
    },
    {
      label: "3P FG%",
      awayValue: advancedAwayTotals.threePointersAttempted
        ? (advancedAwayTotals.threePointersMade / advancedAwayTotals.threePointersAttempted) * 100
        : 0,
      homeValue: advancedHomeTotals.threePointersAttempted
        ? (advancedHomeTotals.threePointersMade / advancedHomeTotals.threePointersAttempted) * 100
        : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${advancedAwayTotals.threePointersMade || 0}/${advancedAwayTotals.threePointersAttempted || 0}`,
      homeDetail: `${advancedHomeTotals.threePointersMade || 0}/${advancedHomeTotals.threePointersAttempted || 0}`,
    },
  ];

  const awayDeflections = segment === "all" ? teamStats?.away?.advancedStats?.deflections ?? 0 : 0;
  const homeDeflections = segment === "all" ? teamStats?.home?.advancedStats?.deflections ?? 0 : 0;
  const awayDisruptions =
    (advancedAwayTotals.steals || 0) +
    (advancedAwayTotals.blocks || 0) +
    (advancedAwayTotals.offensiveFoulsDrawn || 0) +
    awayDeflections;
  const homeDisruptions =
    (advancedHomeTotals.steals || 0) +
    (advancedHomeTotals.blocks || 0) +
    (advancedHomeTotals.offensiveFoulsDrawn || 0) +
    homeDeflections;
  const buildCreatingStats = (teamTotals, fallback) => ({
    drivingFGMade: teamTotals.drivingFGMade ?? fallback?.drivingFGMade ?? 0,
    drivingFGAttempted: teamTotals.drivingFGAttempted ?? fallback?.drivingFGAttempted ?? 0,
    cuttingFGMade: teamTotals.cuttingFGMade ?? fallback?.cuttingFGMade ?? 0,
    cuttingFGAttempted: teamTotals.cuttingFGAttempted ?? fallback?.cuttingFGAttempted ?? 0,
    catchAndShoot3FGMade: teamTotals.catchAndShoot3FGMade ?? fallback?.catchAndShoot3FGMade ?? 0,
    catchAndShoot3FGAttempted: teamTotals.catchAndShoot3FGAttempted ?? fallback?.catchAndShoot3FGAttempted ?? 0,
    offensiveFoulsDrawn: teamTotals.offensiveFoulsDrawn ?? fallback?.offensiveFoulsDrawn ?? 0,
  });

  const awayCreating = buildCreatingStats(advancedAwayTotals, teamStats?.away?.advancedStats);
  const homeCreating = buildCreatingStats(advancedHomeTotals, teamStats?.home?.advancedStats);

  const parseClock = (clock) => {
    if (!clock) return 0;
    const [min, sec] = clock.split(":");
    return Number(min) * 60 + Number(sec);
  };

  const parseIsoClock = (clock) => {
    if (!clock) return 0;
    const match = /PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(clock);
    if (!match) return 0;
    const minutes = Number(match[1] || 0);
    const seconds = Number(match[2] || 0);
    return minutes * 60 + seconds;
  };

  const estimateElapsedSegmentSeconds = () => {
    if (!isLive || !game?.period || !game?.gameClock) return null;
    const predicate = segmentPeriods(segment);
    const currentPeriod = Number(game.period) || 1;
    const periodLength = (period) => (period <= 4 ? 12 * 60 : 5 * 60);
    const remaining = parseIsoClock(game.gameClock);
    const elapsedCurrent = Math.max(0, periodLength(currentPeriod) - remaining);
    let total = 0;
    for (let period = 1; period < currentPeriod; period += 1) {
      if (predicate(period)) total += periodLength(period);
    }
    if (predicate(currentPeriod)) total += elapsedCurrent;
    return total || null;
  };

  const estimateElapsedAllSeconds = () => {
    if (!game?.period || !game?.gameClock) return null;
    const period = Number(game.period) || 1;
    const currentLength = period <= 4 ? 12 * 60 : 5 * 60;
    const remaining = parseIsoClock(game.gameClock);
    const elapsedCurrent = Math.max(0, currentLength - remaining);
    let completed = 0;
    for (let p = 1; p < period; p += 1) {
      completed += p <= 4 ? 12 * 60 : 5 * 60;
    }
    return completed + elapsedCurrent;
  };

  const segmentSeconds = (() => {
    if (minutesData?.periods?.length) {
      const predicate = segmentPeriods(segment);
      const total = minutesData.periods
        .filter((p) => predicate(p.period))
        .flatMap((p) => p.stints || [])
        .reduce((sum, stint) => sum + (parseClock(stint.startClock) - parseClock(stint.endClock)), 0);
      if (total > 0) {
        if (isLive) {
          const elapsed = segment === "all" ? estimateElapsedAllSeconds() : estimateElapsedSegmentSeconds();
          if (elapsed) return Math.min(total, elapsed);
        }
        return total;
      }
    }
    if (segment === "all") {
      const elapsed = estimateElapsedAllSeconds();
      if (elapsed) return elapsed;
    }
    const defaultSeconds = {
      "q1": 12 * 60,
      "q2": 12 * 60,
      "q3": 12 * 60,
      "q4": 12 * 60,
      "q1-q3": 36 * 60,
      "first-half": 24 * 60,
      "second-half": 24 * 60,
      "all": 48 * 60,
    };
    return defaultSeconds[segment] || 48 * 60;
  })();

  const killStats = segmentSeconds === 0
    ? { homeKills: 0, awayKills: 0 }
    : computeKills(game.playByPlayActions || [], segment, homeTeam.teamId, awayTeam.teamId);

  const paceFrom = (possessionsCount) =>
    segmentSeconds ? (possessionsCount * 2880) / segmentSeconds : 0;

  const basePace = useOfficialPossessions
    ? (officialAwayPossessions + officialHomePossessions) / 2
    : (awayPossessions + homePossessions) / 2;

  const paceValue = paceFrom(basePace);

  const currentPeriod = game.period || 1;
  const currentFouls = (teamId) =>
    (game.playByPlayActions || []).filter(
      (action) => action.period === currentPeriod && action.actionType === "foul" && action.teamId === teamId
    ).length;
  const awayFouls = currentFouls(awayTeam.teamId);
  const homeFouls = currentFouls(homeTeam.teamId);

  return (
    <div className={styles.container}>
      <div className={styles.backRow}>
        <Link className={styles.backButton} to={dateParam ? `/?d=${dateParam}` : "/"}>
          Back
        </Link>
      </div>
      <div className={styles.contentAlign}>
        <section className={styles.scoreboard}>
          <div className={`${styles.teamLogoColumn} ${styles.awayLogoColumn}`}>
            <img
              className={styles.teamLogo}
              src={teamLogoUrl(awayTeam.teamId)}
              alt={`${awayTeam.teamName} logo`}
            />
            <div className={styles.teamRecord}>{awayTeam.wins}-{awayTeam.losses}</div>
            {timeouts && <div className={styles.teamMetaRow}>TO: {timeouts.away}</div>}
          {challenges && (
            <div className={styles.teamMetaRow}>
              CC:
              <span className={styles.challengeRow}>
                {buildChallengeCircles(challenges.away).map((circle, index) => (
                  <span
                    key={`${circle.state}-${index}`}
                    className={`${styles.challengeDot} ${styles[`challenge${circle.state[0].toUpperCase()}${circle.state.slice(1)}`]}`}
                  />
                ))}
              </span>
            </div>
          )}
          <div className={styles.teamMetaRow}>
            Fouls: <span className={awayFouls >= 5 ? styles.foulMax : ""}>{Math.min(awayFouls, 5)}</span>
          </div>
        </div>

          <div className={`${styles.teamStatsColumn} ${styles.awayStatsColumn}`}>
            <div className={styles.teamTricode}>{awayTeam.teamTricode}</div>
            <div className={styles.teamScore}>{displayAwayScore}</div>
            <div className={styles.statValue}>{ortgAway}</div>
            <div className={styles.statValue}>{netAway >= 0 ? "+" : ""}{netAway}</div>
          </div>

          <div className={styles.centerColumn}>
            <div className={styles.vs}>vs</div>
            <div className={styles.dash}>-</div>
          <div className={styles.statLabel}>ORTG</div>
          <div className={styles.statLabel}>NET</div>
          <div className={styles.paceRow}>PACE: {paceValue.toFixed(1)}</div>
          <div className={`${styles.status} ${isLive ? styles.statusLive : ""}`}>
            {status || game.gameStatusText}
          </div>
          {clock && <div className={styles.clock}>{clock}</div>}
          </div>

          <div className={`${styles.teamStatsColumn} ${styles.homeStatsColumn}`}>
            <div className={styles.teamTricode}>{homeTeam.teamTricode}</div>
            <div className={styles.teamScore}>{displayHomeScore}</div>
            <div className={styles.statValue}>{ortgHome}</div>
            <div className={styles.statValue}>{netHome >= 0 ? "+" : ""}{netHome}</div>
          </div>

          <div className={`${styles.teamLogoColumn} ${styles.homeLogoColumn}`}>
            <img
              className={styles.teamLogo}
              src={teamLogoUrl(homeTeam.teamId)}
              alt={`${homeTeam.teamName} logo`}
            />
            <div className={styles.teamRecord}>{homeTeam.wins}-{homeTeam.losses}</div>
            {timeouts && <div className={styles.teamMetaRow}>TO: {timeouts.home}</div>}
          {challenges && (
            <div className={styles.teamMetaRow}>
              CC:
              <span className={styles.challengeRow}>
                {buildChallengeCircles(challenges.home).map((circle, index) => (
                  <span
                    key={`${circle.state}-${index}`}
                    className={`${styles.challengeDot} ${styles[`challenge${circle.state[0].toUpperCase()}${circle.state.slice(1)}`]}`}
                  />
                ))}
              </span>
            </div>
          )}
          <div className={styles.teamMetaRow}>
            Fouls: <span className={homeFouls >= 5 ? styles.foulMax : ""}>{Math.min(homeFouls, 5)}</span>
          </div>
        </div>
      </section>

      <div className={`${styles.navRow} ${styles.navRowTight}`} ref={statsNavRef}>
        <SegmentSelector value={segment} onChange={setSegment} />
        {snapshotLabel ? <div className={styles.snapshotLabel}>{snapshotLabel}</div> : null}
        <Link to={dateParam ? `/m/${gameId}?d=${dateParam}` : `/m/${gameId}`}>Minutes</Link>
        <Link to={dateParam ? `/g/${gameId}/events?d=${dateParam}` : `/g/${gameId}/events`}>
          Play-by-Play
        </Link>
        <button type="button" className={styles.navButton} onClick={handleScrollToBoxScore}>
          Box Score
        </button>
      </div>

      <StatBars
        title="Four Factors"
        awayLabel={awayTeam.teamTricode}
        homeLabel={homeTeam.teamTricode}
        rows={fourFactorRows}
      />

        <StatBars
          title="Shot Profile"
          awayLabel={awayTeam.teamTricode}
          homeLabel={homeTeam.teamTricode}
          rows={shotProfileRows}
        />

        <StatBars
          title="Shot Efficiency"
          awayLabel={awayTeam.teamTricode}
          homeLabel={homeTeam.teamTricode}
          rows={shotEffRows}
        />

        <TransitionStats
          awayLabel={awayTeam.teamTricode}
          homeLabel={homeTeam.teamTricode}
          awayStats={awayTransition}
          homeStats={homeTransition}
        />

        <MiscStats
          awayLabel={awayTeam.teamTricode}
          homeLabel={homeTeam.teamTricode}
          awayStats={awayTransition}
          homeStats={homeTransition}
        />

        <CreatingDisruption
          awayLabel={awayTeam.teamTricode}
          homeLabel={homeTeam.teamTricode}
          awayStats={awayCreating}
          homeStats={homeCreating}
          awayDisruptions={awayDisruptions}
          homeDisruptions={homeDisruptions}
          awayKills={killStats.awayKills}
          homeKills={killStats.homeKills}
        />

        <Officials
          officials={officials}
          callsAgainst={callsAgainst}
          homeAbr={homeTeam.teamTricode}
          awayAbr={awayTeam.teamTricode}
        />

      <div className={styles.navRow} ref={boxScoreNavRef}>
        <SegmentSelector value={segment} onChange={setSegment} />
        <Link to={dateParam ? `/m/${gameId}?d=${dateParam}` : `/m/${gameId}`}>Minutes</Link>
        <Link to={dateParam ? `/g/${gameId}/events?d=${dateParam}` : `/g/${gameId}/events`}>
          Play-by-Play
        </Link>
        <button
          type="button"
          className={styles.navButton}
          onClick={handleScrollToAdvanced}
        >
          Advanced
        </button>
      </div>

      <section className={styles.boxScoreSection}>
        <BoxScoreTable
          teamLabel={awayTeam.teamTricode}
          boxScore={{ players: awayPlayers, totals: awayTotals }}
          currentPeriod={game.period}
        />
        <BoxScoreTable
          teamLabel={homeTeam.teamTricode}
          boxScore={{ players: homePlayers, totals: homeTotals }}
          currentPeriod={game.period}
        />
      </section>
      </div>
    </div>
  );
}
