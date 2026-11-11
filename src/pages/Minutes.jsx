import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { teamLogoUrl } from "../api.js";
import { getGamePollingInterval, isGameDayPollingGame } from "../gamePolling.js";
import { useGame, useMinutes } from "../queries.js";
import {
  buildSubstitutionAnnotationLookup,
  getSubstitutionAnnotation,
} from "../substitutionUtils.js";
import styles from "./Minutes.module.css";
import { buildMinutesExplorer, defaultMinutesVantage } from "../minutesExplorer.js";
import { MinutesTimeline, MinutesCombos } from "../components/MinutesExplorer.jsx";

function StintCell({
  stint,
  isLast,
  view,
  period,
  awayTeamId,
  homeTeamId,
  substitutionLookup,
}) {
  const prevAway = new Set((stint.prevPlayersAway || []).map((player) => player.personId));
  const prevHome = new Set((stint.prevPlayersHome || []).map((player) => player.personId));
  const hasPrevAway = (stint.prevPlayersAway || []).length > 0;
  const hasPrevHome = (stint.prevPlayersHome || []).length > 0;

  const valueClass = (value) => {
    if (value > 0) return styles.valuePositive;
    if (value < 0) return styles.valueNegative;
    return styles.valueZero;
  };

  const displayPlusMinus = (() => {
    if (view === "away") return -(stint.plusMinus || 0);
    if (view === "neutral") return Math.abs(stint.plusMinus || 0);
    return stint.plusMinus || 0;
  })();

  const plusMinusLabel = view === "neutral"
    ? `${displayPlusMinus}`
    : `${displayPlusMinus > 0 ? "+" : ""}${displayPlusMinus}`;
  const formatSubbedInName = (player, teamId) => {
    const outgoingLastName = getSubstitutionAnnotation(substitutionLookup, {
      period,
      teamId,
      clock: stint.startClock,
      personId: player.personId,
    });
    return outgoingLastName ? `${player.nameI} (${outgoingLastName})` : player.nameI;
  };

  return (
    <div className={`${styles.stintCell} ${isLast ? styles.lastCell : ""}`}>
      <div className={styles.stintHeader}>
        <span className={`${styles.timeValue} ${valueClass(displayPlusMinus)}`}>{stint.startClock}</span>
        <span className={`${styles.netValue} ${valueClass(displayPlusMinus)}`}>
          ({plusMinusLabel})
        </span>
      </div>
      <div className={styles.playersSection}>
        {stint.playersAway.map((player) => {
          const isSubbedIn = hasPrevAway && !prevAway.has(player.personId);
          return (
          <div
            key={player.personId}
            className={isSubbedIn ? styles.subbedIn : ""}
          >
            {isSubbedIn
              ? formatSubbedInName(player, awayTeamId)
              : player.nameI}
          </div>
          );
        })}
      </div>
      <div className={styles.playersSection}>
        {stint.playersHome.map((player) => {
          const isSubbedIn = hasPrevHome && !prevHome.has(player.personId);
          return (
          <div
            key={player.personId}
            className={isSubbedIn ? styles.subbedIn : ""}
          >
            {isSubbedIn
              ? formatSubbedInName(player, homeTeamId)
              : player.nameI}
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Minutes() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const dateParam = params.get("d");
  const [viewSelection, setView] = useState(null);
  const [format, setFormat] = useState("table");
  const [comboSideSelection, setComboSide] = useState(null);
  // Page-local only: survive view/team changes, but not leaving Minutes.
  const [comboSelections, setComboSelections] = useState({ gameId, away: [], home: [] });
  const routeShouldTrackPolling = isGameDayPollingGame(gameId);
  const { data: game, isLoading: isGameLoading } = useGame(gameId, {
    dateStr: dateParam,
    refetchInterval: (query) => getGamePollingInterval(query.state.data, { gameId }),
    refetchIntervalInBackground: routeShouldTrackPolling,
  });
  const shouldTrackPolling = isGameDayPollingGame(game || gameId);
  const { data, dataUpdatedAt, isLoading, error } = useMinutes(gameId, {
    refetchInterval: () => getGamePollingInterval(game, { gameId }),
    refetchIntervalInBackground: shouldTrackPolling,
  });
  const defaultVantage = defaultMinutesVantage(data || game);
  const view = viewSelection?.gameId === gameId ? viewSelection.value : defaultVantage;
  const comboSide = comboSideSelection?.gameId === gameId ? comboSideSelection.value : defaultVantage;
  const substitutionLookup = useMemo(
    () => buildSubstitutionAnnotationLookup(game?.playByPlayActions || []),
    [game?.playByPlayActions],
  );
  const explorer = useMemo(() => format === "table" ? null : buildMinutesExplorer(data, game), [data, game, format]);

  if (isLoading || (!game && isGameLoading)) {
    return <div className={styles.stateMessage}>Loading minutes data...</div>;
  }

  if (!data) {
    return <div className={styles.stateMessage}>Failed to load minutes data.</div>;
  }

  const { homeTeam, awayTeam, periods } = data;

  return (
    <div className={styles.container}>
      {error && <small role="status">Minutes last verified at {new Date(dataUpdatedAt).toLocaleTimeString()}; updating.</small>}
      <div className={styles.backRow}>
        <Link className={styles.backButton} to={dateParam ? `/g/${gameId}?d=${dateParam}` : `/g/${gameId}`}>
          Back
        </Link>
      </div>
      <div className={styles.viewToggle}>
        <span>View</span>
        {["table", "timeline", "combos"].map((option) => <button key={option} type="button"
          aria-pressed={format === option} className={`${styles.viewButton} ${format === option ? styles.viewButtonActive : ""}`}
          onClick={() => setFormat(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}
      </div>
      <div className={styles.viewToggle}>
        <span>Vantage</span>
        {["away", "neutral", "home"].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            className={`${styles.viewButton} ${view === option ? styles.viewButtonActive : ""}`}
            onClick={() => { setView({ gameId, value: option }); if (option !== "neutral") setComboSide({ gameId, value: option }); }}
          >
            {option === "neutral" ? "Neutral" : (data[`${option}Team`].teamTricode || data[`${option}Team`].teamName)}
          </button>
        ))}
      </div>
      <section className={styles.header}>
        <div className={styles.teamSection}>
          <div className={styles.teamSummary}>
            <img className={styles.teamLogo} src={teamLogoUrl(awayTeam.teamId)} alt={`${awayTeam.teamName} logo`} />
            <div className={styles.teamScore}>{awayTeam.score}</div>
          </div>
        </div>
        <div className={styles.vs}>@</div>
        <div className={styles.teamSection}>
          <div className={styles.teamSummary}>
            <img className={styles.teamLogo} src={teamLogoUrl(homeTeam.teamId)} alt={`${homeTeam.teamName} logo`} />
            <div className={styles.teamScore}>{homeTeam.score}</div>
          </div>
        </div>
      </section>

      {format === "timeline" && <MinutesTimeline model={explorer} data={data} vantage={view} />}
      {format === "combos" && <>
        {view === "neutral" && <div className={styles.viewToggle}><span>Combos team</span>{["away", "home"].map((side) => <button key={side} type="button" className={`${styles.viewButton} ${comboSide === side ? styles.viewButtonActive : ""}`} aria-pressed={comboSide === side} onClick={() => setComboSide({ gameId, value: side })}>{data[`${side}Team`].teamTricode || data[`${side}Team`].teamName}</button>)}</div>}
        <MinutesCombos model={explorer} data={data} side={comboSide}
          selected={comboSelections.gameId === gameId ? comboSelections[comboSide] : []}
          onSelectedChange={(selected) => setComboSelections((previous) => ({
            ...(previous.gameId === gameId ? previous : { gameId, away: [], home: [] }),
            [comboSide]: selected,
          }))} />
      </>}
      {format === "table" && <section className={styles.periods}>
        {(data.periodStintRepairs || []).filter((repair) => repair.status === "unresolved").map((repair) => (
          <div key={repair.period} className={styles.stateMessage}>Period {repair.period} has incomplete lineup data. {repair.reason}</div>
        ))}
        {data.openingStintRepair?.status === "unresolved" ? (
          <div className={styles.stateMessage}>
            The minutes feed is missing the opening Q1 lineup interval. {data.openingStintRepair.reason}
          </div>
        ) : null}
        {periods.map((period) => (
          <div key={period.period} className={styles.period}>
            <div className={styles.periodTitle}>{period.periodLabel}</div>
            <div className={styles.stintRow}>
              <div className={styles.teamLabels}>
                <div className={styles.labelSpacer} />
                <div className={styles.teamLabel}>
                  <img
                    className={styles.teamLabelLogo}
                    src={teamLogoUrl(awayTeam.teamId)}
                    alt={`${awayTeam.teamName} logo`}
                  />
                </div>
                <div className={styles.teamLabel}>
                  <img
                    className={styles.teamLabelLogo}
                    src={teamLogoUrl(homeTeam.teamId)}
                    alt={`${homeTeam.teamName} logo`}
                  />
                </div>
              </div>
              <div className={styles.stintsContainer}>
                {period.stints.map((stint, index) => (
                  <StintCell
                    key={`${period.period}-${index}`}
                    stint={stint}
                    isLast={index === period.stints.length - 1}
                    view={view}
                    period={period.period}
                    awayTeamId={awayTeam.teamId}
                    homeTeamId={homeTeam.teamId}
                    substitutionLookup={substitutionLookup}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </section>}
    </div>
  );
}
