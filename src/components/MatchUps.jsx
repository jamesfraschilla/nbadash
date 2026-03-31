import { useEffect, useMemo, useRef, useState } from "react";
import { playerHeadshotUrl, teamLogoUrl } from "../api.js";
import { readLocalStorage, writeLocalStorage } from "../storage.js";
import styles from "./MatchUps.module.css";

const MATCH_UP_STORAGE_PREFIX = "nba-dashboard:match-ups:";
const DRAG_HOLD_MS = 260;
const PRESS_MOVE_TOLERANCE_PX = 8;
const ROW_SLOT_COUNT = 5;

function loadMatchUpState(gameId) {
  if (!gameId) {
    return {
      collapsed: false,
      orders: {
        away: [],
        home: [],
      },
    };
  }

  const raw = readLocalStorage(`${MATCH_UP_STORAGE_PREFIX}${gameId}`);
  if (!raw) {
    return {
      collapsed: false,
      orders: {
        away: [],
        home: [],
      },
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      collapsed: Boolean(parsed?.collapsed),
      orders: {
        away: Array.isArray(parsed?.orders?.away) ? parsed.orders.away.map(String) : [],
        home: Array.isArray(parsed?.orders?.home) ? parsed.orders.home.map(String) : [],
      },
    };
  } catch {
    return {
      collapsed: false,
      orders: {
        away: [],
        home: [],
      },
    };
  }
}

function saveMatchUpState(gameId, value) {
  if (!gameId) return;
  writeLocalStorage(`${MATCH_UP_STORAGE_PREFIX}${gameId}`, JSON.stringify(value));
}

function extractLastName(playerName = "") {
  const parts = String(playerName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts[parts.length - 1];
}

function buildCurrentStint(minutesData) {
  const periods = Array.isArray(minutesData?.periods) ? minutesData.periods : [];
  for (let periodIndex = periods.length - 1; periodIndex >= 0; periodIndex -= 1) {
    const stints = Array.isArray(periods[periodIndex]?.stints) ? periods[periodIndex].stints : [];
    if (stints.length) {
      return stints[stints.length - 1];
    }
  }
  return null;
}

function normalizeStintPlayers(players) {
  return [...(players || [])]
    .sort((a, b) => {
      const aPosition = Number(a?.rowPosition);
      const bPosition = Number(b?.rowPosition);
      if (Number.isFinite(aPosition) && Number.isFinite(bPosition) && aPosition !== bPosition) {
        return aPosition - bPosition;
      }
      return 0;
    })
    .slice(0, ROW_SLOT_COUNT);
}

function buildPlayerLookup(boxScore) {
  const players = [
    ...(boxScore?.away?.players || []),
    ...(boxScore?.home?.players || []),
  ];
  return new Map(players.map((player) => [String(player.personId), player]));
}

function buildRowPlayers(players, playerLookup) {
  return normalizeStintPlayers(players).map((player, index) => {
    const personId = String(player?.personId || "");
    const fullPlayer = playerLookup.get(personId);
    return {
      personId,
      jerseyNum: String(fullPlayer?.jerseyNum || player?.jerseyNum || "").trim(),
      lastName: String(fullPlayer?.familyName || extractLastName(player?.nameI)).trim(),
      fullName: [fullPlayer?.firstName, fullPlayer?.familyName].filter(Boolean).join(" ").trim(),
      headshotUrl: player?.personId ? playerHeadshotUrl(player.personId) : "",
      slotIndex: index,
    };
  });
}

function applySavedOrder(players, savedOrder) {
  if (!players.length) return players;
  const playersById = new Map(players.map((player) => [player.personId, player]));
  const ordered = [];

  (savedOrder || []).forEach((personId) => {
    if (!playersById.has(personId)) return;
    ordered.push(playersById.get(personId));
    playersById.delete(personId);
  });

  players.forEach((player) => {
    if (playersById.has(player.personId)) {
      ordered.push(player);
    }
  });

  return ordered.slice(0, ROW_SLOT_COUNT);
}

function moveItem(items, fromIndex, toIndex) {
  if (fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return items;
  next.splice(toIndex, 0, moved);
  return next;
}

function MatchUpTile({ player, isDraggingSource, onPointerDown }) {
  if (!player) {
    return (
      <div className={`${styles.tile} ${styles.tileEmpty}`}>
        <div className={styles.avatarFrame} />
        <div className={styles.playerMeta}>
          <div className={styles.playerName}>Open</div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.tileButton} ${isDraggingSource ? styles.tileButtonDragging : ""}`}
      onPointerDown={onPointerDown}
      aria-label={`Move ${player.fullName || player.lastName || "player"}`}
    >
      <div className={styles.tile}>
        <div className={styles.avatarFrame}>
          <img className={styles.avatarImage} src={player.headshotUrl} alt="" draggable="false" />
        </div>
        <div className={styles.playerMeta}>
          <div className={styles.playerName}>{`${player.jerseyNum} ${player.lastName}`.trim()}</div>
        </div>
      </div>
    </button>
  );
}

export default function MatchUps({
  gameId,
  awayTeam,
  homeTeam,
  boxScore,
  minutesData,
}) {
  const [persistedState, setPersistedState] = useState(() => loadMatchUpState(gameId));
  const [dragState, setDragState] = useState(null);
  const holdTimeoutRef = useRef(null);
  const pressSessionRef = useRef(null);
  const slotRefs = useRef({
    away: [],
    home: [],
  });

  useEffect(() => {
    setPersistedState(loadMatchUpState(gameId));
  }, [gameId]);

  useEffect(() => {
    saveMatchUpState(gameId, persistedState);
  }, [gameId, persistedState]);

  const currentStint = useMemo(() => buildCurrentStint(minutesData), [minutesData]);
  const playerLookup = useMemo(() => buildPlayerLookup(boxScore), [boxScore]);

  const awayPlayers = useMemo(() => {
    const players = buildRowPlayers(currentStint?.playersAway, playerLookup);
    return applySavedOrder(players, persistedState.orders.away);
  }, [currentStint?.playersAway, persistedState.orders.away, playerLookup]);

  const homePlayers = useMemo(() => {
    const players = buildRowPlayers(currentStint?.playersHome, playerLookup);
    return applySavedOrder(players, persistedState.orders.home);
  }, [currentStint?.playersHome, persistedState.orders.home, playerLookup]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const pressSession = pressSessionRef.current;
      if (pressSession && !dragState && event.pointerId === pressSession.pointerId) {
        const deltaX = event.clientX - pressSession.startX;
        const deltaY = event.clientY - pressSession.startY;
        if (Math.hypot(deltaX, deltaY) > PRESS_MOVE_TOLERANCE_PX) {
          clearTimeout(holdTimeoutRef.current);
          holdTimeoutRef.current = null;
          pressSessionRef.current = null;
        }
        return;
      }

      if (!dragState || event.pointerId !== dragState.pointerId) return;
      event.preventDefault();

      const slots = slotRefs.current[dragState.side] || [];
      const nextOverIndex = slots.findIndex((slot) => {
        if (!slot) return false;
        const rect = slot.getBoundingClientRect();
        return (
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        );
      });

      setDragState((current) => current ? {
        ...current,
        pointerX: event.clientX,
        pointerY: event.clientY,
        overIndex: nextOverIndex >= 0 ? nextOverIndex : current.overIndex,
      } : current);
    };

    const clearPressSession = () => {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
      pressSessionRef.current = null;
    };

    const handlePointerUp = (event) => {
      const activeDrag = dragState;
      const pressSession = pressSessionRef.current;

      if (activeDrag && event.pointerId === activeDrag.pointerId) {
        const currentPlayers = activeDrag.side === "away" ? awayPlayers : homePlayers;
        const nextPlayers = moveItem(currentPlayers, activeDrag.fromIndex, activeDrag.overIndex);
        setPersistedState((current) => ({
          ...current,
          orders: {
            ...current.orders,
            [activeDrag.side]: nextPlayers.map((player) => player.personId),
          },
        }));
        setDragState(null);
      }

      if (pressSession && event.pointerId === pressSession.pointerId) {
        clearPressSession();
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [awayPlayers, dragState, homePlayers]);

  useEffect(() => {
    if (!dragState) return undefined;

    const previousBodyUserSelect = document.body.style.userSelect;
    const previousBodyCursor = document.body.style.cursor;
    const previousTouchAction = document.documentElement.style.touchAction;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    document.documentElement.style.touchAction = "none";

    return () => {
      document.body.style.userSelect = previousBodyUserSelect;
      document.body.style.cursor = previousBodyCursor;
      document.documentElement.style.touchAction = previousTouchAction;
    };
  }, [dragState]);

  useEffect(() => () => {
    clearTimeout(holdTimeoutRef.current);
  }, []);

  const handlePointerDown = (side, index, event) => {
    if (event.button != null && event.button !== 0) return;
    const rowPlayers = side === "away" ? awayPlayers : homePlayers;
    const player = rowPlayers[index];
    if (!player) return;

    clearTimeout(holdTimeoutRef.current);
    const tileRect = event.currentTarget.getBoundingClientRect();
    const pointerId = event.pointerId;
    pressSessionRef.current = {
      side,
      index,
      player,
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - tileRect.left,
      offsetY: event.clientY - tileRect.top,
      width: tileRect.width,
      height: tileRect.height,
    };

    holdTimeoutRef.current = setTimeout(() => {
      const session = pressSessionRef.current;
      if (!session || session.pointerId !== pointerId) return;
      setDragState({
        side,
        fromIndex: index,
        overIndex: index,
        pointerId,
        pointerX: session.startX,
        pointerY: session.startY,
        offsetX: session.offsetX,
        offsetY: session.offsetY,
        width: session.width,
        height: session.height,
        player,
      });
      pressSessionRef.current = null;
      holdTimeoutRef.current = null;
    }, DRAG_HOLD_MS);
  };

  const updateCollapsed = () => {
    setPersistedState((current) => ({
      ...current,
      collapsed: !current.collapsed,
    }));
  };

  const rows = [
    {
      key: "away",
      label: awayTeam?.teamTricode || "Away",
      teamName: awayTeam?.teamName || "Visiting Team",
      teamId: awayTeam?.teamId,
      players: awayPlayers,
    },
    {
      key: "home",
      label: homeTeam?.teamTricode || "Home",
      teamName: homeTeam?.teamName || "Home Team",
      teamId: homeTeam?.teamId,
      players: homePlayers,
    },
  ];

  const hasLineups = awayPlayers.length || homePlayers.length;

  return (
    <section className={styles.container} aria-label="Match-Ups">
      <button
        type="button"
        className={styles.toggleButton}
        onClick={updateCollapsed}
        aria-expanded={!persistedState.collapsed}
      >
        <span className={styles.toggleLabel}>Match-Ups</span>
        <span className={styles.toggleIcon} aria-hidden="true">{persistedState.collapsed ? "+" : "−"}</span>
      </button>

      {persistedState.collapsed ? null : (
        <div className={styles.body}>
          <div className={styles.instructions}>Press and hold a player, then drag to change the matchup column.</div>

          {hasLineups ? rows.map((row) => {
            const logoUrl = row.teamId ? teamLogoUrl(row.teamId) : "";
            return (
              <div key={row.key} className={styles.row}>
                <div className={styles.rowLabel}>
                  {logoUrl ? <img className={styles.teamLogo} src={logoUrl} alt="" /> : null}
                  <div>
                    <div className={styles.teamCode}>{row.label}</div>
                    <div className={styles.teamName}>{row.teamName}</div>
                  </div>
                </div>

                <div className={styles.rowScroller}>
                  <div className={styles.slotGrid}>
                    {Array.from({ length: ROW_SLOT_COUNT }, (_, index) => {
                      const player = row.players[index] || null;
                      const isSource = dragState?.side === row.key && dragState?.fromIndex === index;
                      const isTarget = dragState?.side === row.key && dragState?.overIndex === index;
                      return (
                        <div
                          key={`${row.key}-${player?.personId || `slot-${index}`}`}
                          ref={(node) => {
                            slotRefs.current[row.key][index] = node;
                          }}
                          className={`${styles.slot} ${isTarget ? styles.slotTarget : ""}`}
                        >
                          <MatchUpTile
                            player={player}
                            isDraggingSource={isSource}
                            onPointerDown={(event) => handlePointerDown(row.key, index, event)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className={styles.emptyState}>Current lineups are not available yet.</div>
          )}
        </div>
      )}

      {dragState?.player ? (
        <div
          className={styles.dragGhost}
          style={{
            width: `${dragState.width}px`,
            left: `${dragState.pointerX - dragState.offsetX}px`,
            top: `${dragState.pointerY - dragState.offsetY}px`,
          }}
          aria-hidden="true"
        >
          <div className={styles.tile}>
            <div className={styles.avatarFrame}>
              <img className={styles.avatarImage} src={dragState.player.headshotUrl} alt="" draggable="false" />
            </div>
            <div className={styles.playerMeta}>
              <div className={styles.playerName}>{`${dragState.player.jerseyNum} ${dragState.player.lastName}`.trim()}</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
