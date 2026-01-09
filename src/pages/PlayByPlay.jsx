import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchGame, playerHeadshotUrl, teamLogoUrl } from "../api.js";
import { supabase } from "../supabaseClient.js";
import { normalizeClock } from "../utils.js";
import styles from "./PlayByPlay.module.css";

function actionDescription(action) {
  if (action.description) return action.description;
  const parts = [];
  if (action.playerNameI) parts.push(action.playerNameI);
  if (action.descriptor) parts.push(action.descriptor);
  if (action.subType) parts.push(action.subType);
  if (action.shotResult) parts.push(action.shotResult.toLowerCase());
  return parts.join(" ");
}

export default function PlayByPlay() {
  const { gameId } = useParams();
  const [params, setParams] = useSearchParams();
  const dateParam = params.get("d");
  const viewParam = params.get("view");
  const [period, setPeriod] = useState(null);
  const [viewMode, setViewMode] = useState(viewParam === "highlighted" ? "highlighted" : "all");
  const [latestFirst, setLatestFirst] = useState(true);
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const holdTimerRef = useRef(null);
  const holdTargetRef = useRef(null);

  const { data: game, isLoading, error } = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => fetchGame(gameId),
    enabled: Boolean(gameId),
    staleTime: 30_000,
  });

  const { data: highlightRows } = useQuery({
    queryKey: ["pbp-highlights", gameId],
    queryFn: async () => {
      if (!supabase || !gameId) return [];
      const { data, error: fetchError } = await supabase
        .from("pbp_highlights")
        .select("action_number")
        .eq("game_id", gameId);
      if (fetchError) throw fetchError;
      return data || [];
    },
    enabled: Boolean(gameId),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const actions = game?.playByPlayActions || [];

  const scoreTracked = useMemo(() => {
    let awayScore = 0;
    let homeScore = 0;
    return actions.map((action) => {
      let scoringEvent = false;
      if (action.shotResult === "Made") {
        const points =
          action.actionType === "3pt" ? 3 : action.actionType === "2pt" ? 2 : action.actionType === "freethrow" ? 1 : 0;
        if (points) {
          scoringEvent = true;
          if (action.teamId === game?.awayTeam?.teamId) awayScore += points;
          if (action.teamId === game?.homeTeam?.teamId) homeScore += points;
        }
      }
      return { ...action, currentAwayScore: awayScore, currentHomeScore: homeScore, scoringEvent };
    });
  }, [actions, game?.awayTeam?.teamId, game?.homeTeam?.teamId]);

  const filtered = useMemo(() => {
    let list = scoreTracked;
    if (viewMode === "highlighted") {
      list = scoreTracked.filter((action) => action.actionNumber && highlightedIds.has(action.actionNumber));
    } else {
      list = period ? scoreTracked.filter((action) => action.period === period) : scoreTracked;
    }
    return latestFirst ? [...list].reverse() : list;
  }, [scoreTracked, period, latestFirst, viewMode, highlightedIds]);

  useEffect(() => {
    if (!highlightRows) return;
    setHighlightedIds(new Set(highlightRows.map((row) => row.action_number)));
  }, [highlightRows]);

  useEffect(() => {
    const nextParams = new URLSearchParams(params);
    if (viewMode === "highlighted") {
      nextParams.set("view", "highlighted");
    } else {
      nextParams.delete("view");
    }
    if (nextParams.toString() !== params.toString()) {
      setParams(nextParams, { replace: true });
    }
  }, [viewMode, params, setParams]);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdTargetRef.current = null;
  };

  const toggleHighlight = async (actionNumber) => {
    if (!actionNumber || !supabase || !gameId) return;
    const isHighlighted = highlightedIds.has(actionNumber);
    setHighlightedIds((prev) => {
      const next = new Set(prev);
      if (isHighlighted) {
        next.delete(actionNumber);
      } else {
        next.add(actionNumber);
      }
      return next;
    });
    const request = isHighlighted
      ? supabase.from("pbp_highlights").delete().eq("game_id", gameId).eq("action_number", actionNumber)
      : supabase.from("pbp_highlights").upsert({ game_id: gameId, action_number: actionNumber }, { onConflict: "game_id,action_number" });
    const { error: updateError } = await request;
    if (updateError) {
      setHighlightedIds((prev) => {
        const next = new Set(prev);
        if (isHighlighted) {
          next.add(actionNumber);
        } else {
          next.delete(actionNumber);
        }
        return next;
      });
    }
  };

  const handleHoldStart = (actionNumber) => () => {
    if (!actionNumber) return;
    clearHoldTimer();
    holdTargetRef.current = actionNumber;
    holdTimerRef.current = setTimeout(() => {
      if (holdTargetRef.current === actionNumber) {
        toggleHighlight(actionNumber);
      }
      clearHoldTimer();
    }, 450);
  };

  const handleHoldEnd = () => {
    clearHoldTimer();
  };

  if (isLoading) {
    return <div className={styles.stateMessage}>Loading events...</div>;
  }

  if (error || !game) {
    return <div className={styles.stateMessage}>Error loading game data</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.backRow}>
        <Link className={styles.backButton} to={dateParam ? `/g/${gameId}?d=${dateParam}` : `/g/${gameId}`}>
          Back
        </Link>
      </div>
      <h1 className={styles.title}>Play-by-Play Events</h1>
      <p className={styles.subtitle}>
        {game.awayTeam?.teamTricode} @ {game.homeTeam?.teamTricode}
      </p>

      <div className={styles.controls}>
        <span>Total Events: {filtered.length}</span>
        <label className={styles.toggle}>
          <span>Latest First</span>
          <input
            type="checkbox"
            checked={latestFirst}
            onChange={(event) => setLatestFirst(event.target.checked)}
          />
        </label>
      </div>

      <div className={styles.periodButtons}>
        <button
          type="button"
          className={!period && viewMode === "all" ? styles.active : ""}
          onClick={() => {
            setViewMode("all");
            setPeriod(null);
          }}
        >
          All
        </button>
        {[1, 2, 3, 4].map((p) => (
          <button
            key={p}
            type="button"
            className={period === p && viewMode === "all" ? styles.active : ""}
            onClick={() => {
              setViewMode("all");
              setPeriod(p);
            }}
          >
            Q{p}
          </button>
        ))}
        <button
          type="button"
          className={viewMode === "highlighted" ? styles.active : ""}
          onClick={() => {
            setViewMode("highlighted");
            setPeriod(null);
          }}
        >
          Highlighted
        </button>
      </div>

      <div className={styles.eventsWrapper}>
        <div className={styles.headerRow}>
          <div className={styles.teamHeader}>
            <span>{game.awayTeam.teamName}</span>
            <img src={teamLogoUrl(game.awayTeam.teamId)} alt={game.awayTeam.teamName} />
          </div>
          <div className={styles.centerHeader} />
          <div className={styles.teamHeader}>
            <img src={teamLogoUrl(game.homeTeam.teamId)} alt={game.homeTeam.teamName} />
            <span>{game.homeTeam.teamName}</span>
          </div>
        </div>

        {filtered.map((action, index) => {
          const isAway = action.teamId === game.awayTeam?.teamId;
          const isHome = action.teamId === game.homeTeam?.teamId;
          const actionNumber = action.actionNumber ?? null;
          const rowKey = actionNumber ?? `${action.period}-${index}`;
          return (
            <div
              key={rowKey}
              className={`${styles.eventRow} ${actionNumber && highlightedIds.has(actionNumber) ? styles.highlighted : ""}`}
              onPointerDown={handleHoldStart(actionNumber)}
              onPointerUp={handleHoldEnd}
              onPointerLeave={handleHoldEnd}
              onPointerCancel={handleHoldEnd}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className={styles.awayColumn}>
                {isAway && (
                  <div className={`${styles.eventContent} ${action.scoringEvent ? styles.scoring : ""}`}>
                    <span>{actionDescription(action)}</span>
                    {action.personId && (
                      <img
                        src={playerHeadshotUrl(action.personId)}
                        alt={action.playerNameI || "player"}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
              <div className={styles.centerColumn}>
                <div className={styles.clock}>{normalizeClock(action.clock)}</div>
                <div className={styles.score}>
                  {action.currentAwayScore} - {action.currentHomeScore}
                </div>
              </div>
              <div className={styles.homeColumn}>
                {isHome && (
                  <div className={`${styles.eventContent} ${action.scoringEvent ? styles.scoring : ""}`}>
                    {action.personId && (
                      <img
                        src={playerHeadshotUrl(action.personId)}
                        alt={action.playerNameI || "player"}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <span>{actionDescription(action)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
