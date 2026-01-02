import { Link, useSearchParams, useParams } from "react-router-dom";
import { useRef, useState } from "react";
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

export default function Game() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const dateParam = params.get("d");
  const [segment, setSegment] = useState("all");
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
  });

  const { data: minutesData } = useQuery({
    queryKey: ["minutes", gameId],
    queryFn: () => fetchMinutes(gameId),
    enabled: Boolean(gameId),
  });

  if (isLoading) {
    return <div className={styles.stateMessage}>Loading game details...</div>;
  }

  if (error || !game) {
    return <div className={styles.stateMessage}>Failed to load game details.</div>;
  }

  const { homeTeam, awayTeam, teamStats, boxScore, officials, callsAgainst } = game;
  const timeouts = game.timeouts;
  const challenges = game.challenges;
  const status = gameStatusLabel(game);
  const isLive = game.gameStatus === 2;
  const clock = isLive ? normalizeClock(game.gameClock) : null;

  const basePlayers = [
    ...(boxScore?.away?.players || []),
    ...(boxScore?.home?.players || []),
  ];

  const segmentStats = aggregateSegmentStats({
    actions: game.playByPlayActions || [],
    segment,
    minutesData,
    homeTeam,
    awayTeam,
    basePlayers,
  });

  const playerMap = segmentStats.playerMap;

  const formatMinutesFromSeconds = (seconds) => {
    const safeSeconds = Math.max(0, Math.round(seconds || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const buildPlayers = (players) =>
    players
      .map((player) => {
        const stats = playerMap.get(player.personId) || {};
        return {
          ...player,
          ...stats,
          minutes: formatMinutesFromSeconds(stats.minutes),
        };
      })
      .filter((player) => player.minutes !== "00:00" || player.points > 0 || player.reboundsTotal > 0);

  const awayPlayers = buildPlayers(boxScore?.away?.players || []);
  const homePlayers = buildPlayers(boxScore?.home?.players || []);

  const awayTotals = segmentStats.teamTotals[awayTeam.teamId] || {};
  const homeTotals = segmentStats.teamTotals[homeTeam.teamId] || {};

  const possessions = (teamTotals) =>
    (teamTotals.fieldGoalsAttempted || 0) +
    0.44 * (teamTotals.freeThrowsAttempted || 0) +
    (teamTotals.turnovers || 0) -
    (teamTotals.reboundsOffensive || 0);

  const useOfficialRatings = segment === "all" && teamStats?.away?.offensiveRating && teamStats?.home?.offensiveRating;

  const ortgAway = useOfficialRatings
    ? Math.round(teamStats.away.offensiveRating)
    : Math.round((awayTotals.points || 0) / Math.max(possessions(awayTotals), 1) * 100);
  const ortgHome = useOfficialRatings
    ? Math.round(teamStats.home.offensiveRating)
    : Math.round((homeTotals.points || 0) / Math.max(possessions(homeTotals), 1) * 100);
  const netAway = useOfficialRatings
    ? Math.round(teamStats.away.netRating)
    : ortgAway - Math.round((homeTotals.points || 0) / Math.max(possessions(homeTotals), 1) * 100);
  const netHome = useOfficialRatings
    ? Math.round(teamStats.home.netRating)
    : ortgHome - Math.round((awayTotals.points || 0) / Math.max(possessions(awayTotals), 1) * 100);

  const officialAwayPossessions = teamStats?.away?.possessions;
  const officialHomePossessions = teamStats?.home?.possessions;
  const useOfficialPossessions = segment === "all" && officialAwayPossessions && officialHomePossessions;

  const awayPossessions = Math.max(
    useOfficialPossessions ? officialAwayPossessions : possessions(awayTotals),
    1
  );
  const homePossessions = Math.max(
    useOfficialPossessions ? officialHomePossessions : possessions(homeTotals),
    1
  );

  const transitionStatsDerived = (teamTotals, possessionsCount) => ({
    transitionRate: (teamTotals.transitionPoints || 0) ? ((teamTotals.transitionPoints || 0) / possessionsCount) * 100 : 0,
    transitionPoints: teamTotals.transitionPoints || 0,
    transitionTurnovers: teamTotals.transitionTurnovers || 0,
    secondChancePoints: teamTotals.secondChancePoints || 0,
    pointsOffTurnovers: teamTotals.pointsOffTurnovers || 0,
    paintPoints: teamTotals.paintPoints || 0,
    threePointORebPercent: teamTotals.reboundsOffensive
      ? ((teamTotals.threePointOReb || 0) / teamTotals.reboundsOffensive) * 100
      : 0,
  });

  const awayTransition = transitionStatsDerived(awayTotals, awayPossessions);
  const homeTransition = transitionStatsDerived(homeTotals, homePossessions);

  const awayDefReb = (awayTotals.reboundsTotal || 0) - (awayTotals.reboundsOffensive || 0);
  const homeDefReb = (homeTotals.reboundsTotal || 0) - (homeTotals.reboundsOffensive || 0);

  const efg = (fgm, fga, tpm) => (fga ? ((fgm + 0.5 * tpm) / fga) * 100 : 0);
  const tov = (to, fga, fta) => (fga || fta || to ? (to / (fga + 0.44 * fta + to)) * 100 : 0);
  const orb = (orbValue, oppDrb) =>
    orbValue || oppDrb ? (orbValue / (orbValue + oppDrb)) * 100 : 0;
  const ftr = (fta, fga) => (fga ? (fta / fga) * 100 : 0);

  const fourFactorRows = [
    {
      label: "eFG%",
      awayValue: efg(awayTotals.fieldGoalsMade, awayTotals.fieldGoalsAttempted, awayTotals.threePointersMade),
      homeValue: efg(homeTotals.fieldGoalsMade, homeTotals.fieldGoalsAttempted, homeTotals.threePointersMade),
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      label: "TOV%",
      awayValue: tov(awayTotals.turnovers, awayTotals.fieldGoalsAttempted, awayTotals.freeThrowsAttempted),
      homeValue: tov(homeTotals.turnovers, homeTotals.fieldGoalsAttempted, homeTotals.freeThrowsAttempted),
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      label: "ORB%",
      awayValue: orb(awayTotals.reboundsOffensive, homeDefReb),
      homeValue: orb(homeTotals.reboundsOffensive, awayDefReb),
      format: (v) => `${v.toFixed(1)}%`,
    },
    {
      label: "FTr",
      awayValue: ftr(awayTotals.freeThrowsAttempted, awayTotals.fieldGoalsAttempted),
      homeValue: ftr(homeTotals.freeThrowsAttempted, homeTotals.fieldGoalsAttempted),
      format: (v) => `${v.toFixed(1)}`,
    },
  ];

  const totalFgaAway = awayTotals.fieldGoalsAttempted || 0;
  const totalFgaHome = homeTotals.fieldGoalsAttempted || 0;

  const shotProfileRows = [
    {
      label: "Rim Rate",
      awayValue: totalFgaAway ? ((awayTotals.rimFieldGoalsAttempted || 0) / totalFgaAway) * 100 : 0,
      homeValue: totalFgaHome ? ((homeTotals.rimFieldGoalsAttempted || 0) / totalFgaHome) * 100 : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${awayTotals.rimFieldGoalsMade || 0}/${awayTotals.rimFieldGoalsAttempted || 0}`,
      homeDetail: `${homeTotals.rimFieldGoalsMade || 0}/${homeTotals.rimFieldGoalsAttempted || 0}`,
    },
    {
      label: "Mid Rate",
      awayValue: totalFgaAway ? ((awayTotals.midFieldGoalsAttempted || 0) / totalFgaAway) * 100 : 0,
      homeValue: totalFgaHome ? ((homeTotals.midFieldGoalsAttempted || 0) / totalFgaHome) * 100 : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${awayTotals.midFieldGoalsMade || 0}/${awayTotals.midFieldGoalsAttempted || 0}`,
      homeDetail: `${homeTotals.midFieldGoalsMade || 0}/${homeTotals.midFieldGoalsAttempted || 0}`,
    },
    {
      label: "3P Rate",
      awayValue: totalFgaAway ? ((awayTotals.threePointersAttempted || 0) / totalFgaAway) * 100 : 0,
      homeValue: totalFgaHome ? ((homeTotals.threePointersAttempted || 0) / totalFgaHome) * 100 : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${awayTotals.threePointersMade || 0}/${awayTotals.threePointersAttempted || 0}`,
      homeDetail: `${homeTotals.threePointersMade || 0}/${homeTotals.threePointersAttempted || 0}`,
    },
  ];

  const shotEffRows = [
    {
      label: "Rim FG%",
      awayValue: awayTotals.rimFieldGoalsAttempted
        ? (awayTotals.rimFieldGoalsMade / awayTotals.rimFieldGoalsAttempted) * 100
        : 0,
      homeValue: homeTotals.rimFieldGoalsAttempted
        ? (homeTotals.rimFieldGoalsMade / homeTotals.rimFieldGoalsAttempted) * 100
        : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${awayTotals.rimFieldGoalsMade || 0}/${awayTotals.rimFieldGoalsAttempted || 0}`,
      homeDetail: `${homeTotals.rimFieldGoalsMade || 0}/${homeTotals.rimFieldGoalsAttempted || 0}`,
    },
    {
      label: "Mid FG%",
      awayValue: awayTotals.midFieldGoalsAttempted
        ? (awayTotals.midFieldGoalsMade / awayTotals.midFieldGoalsAttempted) * 100
        : 0,
      homeValue: homeTotals.midFieldGoalsAttempted
        ? (homeTotals.midFieldGoalsMade / homeTotals.midFieldGoalsAttempted) * 100
        : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${awayTotals.midFieldGoalsMade || 0}/${awayTotals.midFieldGoalsAttempted || 0}`,
      homeDetail: `${homeTotals.midFieldGoalsMade || 0}/${homeTotals.midFieldGoalsAttempted || 0}`,
    },
    {
      label: "3P FG%",
      awayValue: awayTotals.threePointersAttempted
        ? (awayTotals.threePointersMade / awayTotals.threePointersAttempted) * 100
        : 0,
      homeValue: homeTotals.threePointersAttempted
        ? (homeTotals.threePointersMade / homeTotals.threePointersAttempted) * 100
        : 0,
      format: (v) => `${v.toFixed(1)}%`,
      awayDetail: `${awayTotals.threePointersMade || 0}/${awayTotals.threePointersAttempted || 0}`,
      homeDetail: `${homeTotals.threePointersMade || 0}/${homeTotals.threePointersAttempted || 0}`,
    },
  ];

  const awayDisruptions =
    (awayTotals.steals || 0) + (awayTotals.blocks || 0) + (awayTotals.offensiveFoulsDrawn || 0);
  const homeDisruptions =
    (homeTotals.steals || 0) + (homeTotals.blocks || 0) + (homeTotals.offensiveFoulsDrawn || 0);
  const buildCreatingStats = (teamTotals, fallback) => ({
    drivingFGMade: teamTotals.drivingFGMade ?? fallback?.drivingFGMade ?? 0,
    drivingFGAttempted: teamTotals.drivingFGAttempted ?? fallback?.drivingFGAttempted ?? 0,
    cuttingFGMade: teamTotals.cuttingFGMade ?? fallback?.cuttingFGMade ?? 0,
    cuttingFGAttempted: teamTotals.cuttingFGAttempted ?? fallback?.cuttingFGAttempted ?? 0,
    catchAndShoot3FGMade: teamTotals.catchAndShoot3FGMade ?? fallback?.catchAndShoot3FGMade ?? 0,
    catchAndShoot3FGAttempted: teamTotals.catchAndShoot3FGAttempted ?? fallback?.catchAndShoot3FGAttempted ?? 0,
    offensiveFoulsDrawn: teamTotals.offensiveFoulsDrawn ?? fallback?.offensiveFoulsDrawn ?? 0,
  });

  const awayCreating = buildCreatingStats(awayTotals, teamStats?.away?.advancedStats);
  const homeCreating = buildCreatingStats(homeTotals, teamStats?.home?.advancedStats);

  const parseClock = (clock) => {
    if (!clock) return 0;
    const [min, sec] = clock.split(":");
    return Number(min) * 60 + Number(sec);
  };

  const segmentSeconds = (() => {
    if (minutesData?.periods?.length) {
      const predicate = segmentPeriods(segment);
      const total = minutesData.periods
        .filter((p) => predicate(p.period))
        .flatMap((p) => p.stints || [])
        .reduce((sum, stint) => sum + (parseClock(stint.startClock) - parseClock(stint.endClock)), 0);
      if (total > 0) return total;
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
              CC: {challenges.away?.challengesWon ?? 0}/{challenges.away?.challengesTotal ?? 0}
            </div>
          )}
          <div className={styles.teamMetaRow}>
            Fouls: <span className={awayFouls >= 5 ? styles.foulMax : ""}>{Math.min(awayFouls, 5)}</span>
          </div>
        </div>

          <div className={`${styles.teamStatsColumn} ${styles.awayStatsColumn}`}>
            <div className={styles.teamTricode}>{awayTeam.teamTricode}</div>
            <div className={styles.teamScore}>{awayTeam.score}</div>
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
            <div className={styles.teamScore}>{homeTeam.score}</div>
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
              CC: {challenges.home?.challengesWon ?? 0}/{challenges.home?.challengesTotal ?? 0}
            </div>
          )}
          <div className={styles.teamMetaRow}>
            Fouls: <span className={homeFouls >= 5 ? styles.foulMax : ""}>{Math.min(homeFouls, 5)}</span>
          </div>
        </div>
      </section>

      <div className={`${styles.navRow} ${styles.navRowTight}`} ref={statsNavRef}>
        <SegmentSelector value={segment} onChange={setSegment} />
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
