import { useEffect, useMemo, useRef, useState } from "react";
import { playerHeadshotUrl, teamLogoUrl } from "../api.js";
import { readLocalStorage, writeLocalStorage } from "../storage.js";
import styles from "./MatchUps.module.css";

const MATCH_UP_STORAGE_PREFIX = "nba-dashboard:match-ups:";
const DRAG_ARM_MS = 260;
const MENU_HOLD_MS = 1500;
const PRESS_MOVE_TOLERANCE_PX = 8;
const ROW_SLOT_COUNT = 5;

function buildEmptyState() {
  return {
    collapsed: false,
    slots: {
      away: [],
      home: [],
    },
  };
}

function loadMatchUpState(gameId) {
  if (!gameId) return buildEmptyState();

  const raw = readLocalStorage(`${MATCH_UP_STORAGE_PREFIX}${gameId}`);
  if (!raw) return buildEmptyState();

  try {
    const parsed = JSON.parse(raw);
    const savedSlots = parsed?.slots || parsed?.orders || {};
    return {
      collapsed: Boolean(parsed?.collapsed),
      slots: {
        away: Array.isArray(savedSlots?.away) ? savedSlots.away.map(String) : [],
        home: Array.isArray(savedSlots?.home) ? savedSlots.home.map(String) : [],
      },
    };
  } catch {
    return buildEmptyState();
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

function normalizeRosterPlayer(player, fallback = null) {
  if (!player && !fallback) return null;
  const personId = String(player?.personId || fallback?.personId || "");
  if (!personId) return null;

  const firstName = String(player?.firstName || "").trim();
  const familyName = String(player?.familyName || "").trim() || extractLastName(fallback?.nameI);
  return {
    personId,
    jerseyNum: String(player?.jerseyNum || fallback?.jerseyNum || "").trim(),
    firstName,
    lastName: familyName,
    fullName: [firstName, familyName].filter(Boolean).join(" ").trim(),
    headshotUrl: playerHeadshotUrl(personId),
  };
}

function buildRosterPlayers(teamBoxPlayers, stintPlayers) {
  const roster = [];
  const byId = new Map();

  (teamBoxPlayers || []).forEach((player) => {
    const normalized = normalizeRosterPlayer(player);
    if (!normalized || byId.has(normalized.personId)) return;
    byId.set(normalized.personId, normalized);
    roster.push(normalized);
  });

  normalizeStintPlayers(stintPlayers).forEach((player) => {
    const normalized = normalizeRosterPlayer(null, player);
    if (!normalized || byId.has(normalized.personId)) return;
    byId.set(normalized.personId, normalized);
    roster.push(normalized);
  });

  return roster;
}

function isStarterPlayer(player) {
  const rawStarter =
    player?.starter ??
    player?.isStarter ??
    player?.starterStatus ??
    player?.starterFlag ??
    null;

  if (rawStarter === true) return true;
  const normalized = String(rawStarter || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "y" || normalized === "yes";
}

function buildStarterSlotIds(teamBoxPlayers) {
  const starters = (teamBoxPlayers || [])
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => isStarterPlayer(player))
    .sort((a, b) => {
      const aOrder = Number(a.player?.starterOrder ?? a.player?.starterPosition ?? a.index);
      const bOrder = Number(b.player?.starterOrder ?? b.player?.starterPosition ?? b.index);
      if (Number.isFinite(aOrder) && Number.isFinite(bOrder) && aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.index - b.index;
    })
    .map(({ player }) => String(player?.personId || ""))
    .filter(Boolean);

  return starters.slice(0, ROW_SLOT_COUNT);
}

function buildPreferredSlotIds(teamBoxPlayers, stintPlayers, roster) {
  const slotIds = [];
  const used = new Set();

  normalizeStintPlayers(stintPlayers).forEach((player) => {
    const personId = String(player?.personId || "");
    if (!personId || used.has(personId)) return;
    used.add(personId);
    slotIds.push(personId);
  });

  if (!slotIds.length) {
    buildStarterSlotIds(teamBoxPlayers).forEach((personId) => {
      if (used.has(personId)) return;
      used.add(personId);
      slotIds.push(personId);
    });
  }

  roster.forEach((player) => {
    if (slotIds.length >= ROW_SLOT_COUNT || used.has(player.personId)) return;
    used.add(player.personId);
    slotIds.push(player.personId);
  });

  return slotIds.slice(0, ROW_SLOT_COUNT);
}

function resolveSlotIds(savedSlotIds, defaultSlotIds, roster) {
  const rosterIds = roster.map((player) => player.personId);
  const rosterIdSet = new Set(rosterIds);
  const resolved = Array(ROW_SLOT_COUNT).fill(null);
  const used = new Set();

  for (let index = 0; index < ROW_SLOT_COUNT; index += 1) {
    const savedId = String(savedSlotIds?.[index] || "");
    if (!savedId || used.has(savedId) || !rosterIdSet.has(savedId)) continue;
    resolved[index] = savedId;
    used.add(savedId);
  }

  const fillPool = [...defaultSlotIds, ...rosterIds];
  let fillIndex = 0;

  for (let index = 0; index < ROW_SLOT_COUNT; index += 1) {
    if (resolved[index]) continue;
    while (fillIndex < fillPool.length) {
      const candidate = String(fillPool[fillIndex] || "");
      fillIndex += 1;
      if (!candidate || used.has(candidate) || !rosterIdSet.has(candidate)) continue;
      resolved[index] = candidate;
      used.add(candidate);
      break;
    }
  }

  return resolved.filter(Boolean).slice(0, ROW_SLOT_COUNT);
}

function buildTeamRow(teamBoxPlayers, stintPlayers, savedSlotIds) {
  const roster = buildRosterPlayers(teamBoxPlayers, stintPlayers);
  const rosterMap = new Map(roster.map((player) => [player.personId, player]));
  const preferredSlotIds = buildPreferredSlotIds(teamBoxPlayers, stintPlayers, roster);
  const slotIds = resolveSlotIds(savedSlotIds, preferredSlotIds, roster);
  return {
    roster,
    rosterMap,
    preferredSlotIds,
    slotIds,
    players: slotIds.map((personId) => rosterMap.get(personId) || null),
  };
}

function moveItem(items, fromIndex, toIndex) {
  if (fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return items;
  next.splice(toIndex, 0, moved);
  return next;
}

function swapOrReplace(items, index, personId) {
  const next = [...items];
  const existingIndex = next.findIndex((value) => value === personId);
  if (existingIndex >= 0) {
    [next[index], next[existingIndex]] = [next[existingIndex], next[index]];
    return next;
  }
  next[index] = personId;
  return next;
}

function sortRosterOptions(players) {
  return [...players].sort((a, b) => {
    const nameCompare = String(a?.lastName || "").localeCompare(String(b?.lastName || ""));
    if (nameCompare !== 0) return nameCompare;
    return String(a?.firstName || "").localeCompare(String(b?.firstName || ""));
  });
}

function refreshRowPreservingSharedSlots(currentSlotIds, preferredSlotIds) {
  const preferredSet = new Set(preferredSlotIds);
  const next = Array(ROW_SLOT_COUNT).fill(null);
  const used = new Set();

  (currentSlotIds || []).forEach((personId, index) => {
    if (!preferredSet.has(personId) || used.has(personId)) return;
    next[index] = personId;
    used.add(personId);
  });

  let preferredIndex = 0;
  for (let index = 0; index < ROW_SLOT_COUNT; index += 1) {
    if (next[index]) continue;
    while (preferredIndex < preferredSlotIds.length) {
      const candidate = preferredSlotIds[preferredIndex];
      preferredIndex += 1;
      if (!candidate || used.has(candidate)) continue;
      next[index] = candidate;
      used.add(candidate);
      break;
    }
  }

  return next.filter(Boolean);
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
      aria-label={`Adjust ${player.fullName || player.lastName || "player"}`}
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
  const [menuState, setMenuState] = useState(null);
  const [refreshMenuOpen, setRefreshMenuOpen] = useState(false);
  const pressSessionRef = useRef(null);
  const menuTimeoutRef = useRef(null);
  const slotRefs = useRef({
    away: [],
    home: [],
  });
  const menuRef = useRef(null);
  const refreshMenuRef = useRef(null);
  const refreshButtonRef = useRef(null);

  useEffect(() => {
    setPersistedState(loadMatchUpState(gameId));
    setMenuState(null);
    setRefreshMenuOpen(false);
    setDragState(null);
  }, [gameId]);

  useEffect(() => {
    saveMatchUpState(gameId, persistedState);
  }, [gameId, persistedState]);

  const currentStint = useMemo(() => buildCurrentStint(minutesData), [minutesData]);

  const awayRow = useMemo(
    () => buildTeamRow(boxScore?.away?.players, currentStint?.playersAway, persistedState.slots.away),
    [boxScore?.away?.players, currentStint?.playersAway, persistedState.slots.away]
  );

  const homeRow = useMemo(
    () => buildTeamRow(boxScore?.home?.players, currentStint?.playersHome, persistedState.slots.home),
    [boxScore?.home?.players, currentStint?.playersHome, persistedState.slots.home]
  );

  const clearPressSession = () => {
    if (menuTimeoutRef.current) {
      clearTimeout(menuTimeoutRef.current);
      menuTimeoutRef.current = null;
    }
    pressSessionRef.current = null;
  };

  const updateRowSlots = (side, nextSlotIds) => {
    setPersistedState((current) => ({
      ...current,
      slots: {
        ...current.slots,
        [side]: nextSlotIds,
      },
    }));
  };

  useEffect(() => {
    const handlePointerMove = (event) => {
      const pressSession = pressSessionRef.current;

      if (pressSession && !dragState && event.pointerId === pressSession.pointerId) {
        const deltaX = event.clientX - pressSession.startX;
        const deltaY = event.clientY - pressSession.startY;
        if (Math.hypot(deltaX, deltaY) <= PRESS_MOVE_TOLERANCE_PX) return;

        if ((Date.now() - pressSession.startedAt) < DRAG_ARM_MS) {
          clearPressSession();
          return;
        }

        clearPressSession();
        setDragState({
          side: pressSession.side,
          fromIndex: pressSession.index,
          overIndex: pressSession.index,
          pointerId: pressSession.pointerId,
          pointerX: event.clientX,
          pointerY: event.clientY,
          offsetX: pressSession.offsetX,
          offsetY: pressSession.offsetY,
          width: pressSession.width,
          player: pressSession.player,
        });
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

    const handlePointerUp = (event) => {
      const activeDrag = dragState;
      const pressSession = pressSessionRef.current;

      if (activeDrag && event.pointerId === activeDrag.pointerId) {
        const slotIds = activeDrag.side === "away" ? awayRow.slotIds : homeRow.slotIds;
        updateRowSlots(activeDrag.side, moveItem(slotIds, activeDrag.fromIndex, activeDrag.overIndex));
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
  }, [awayRow.slotIds, dragState, homeRow.slotIds]);

  useEffect(() => {
    const handlePointerDownOutside = (event) => {
      if (!menuState || !menuRef.current?.contains(event.target)) {
        setMenuState(null);
      }
      if (!refreshMenuRef.current?.contains(event.target) && !refreshButtonRef.current?.contains(event.target)) {
        setRefreshMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMenuState(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDownOutside);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDownOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuState]);

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
    clearPressSession();
  }, []);

  const openRosterMenu = (session) => {
    setMenuState({
      side: session.side,
      index: session.index,
      left: session.rect.left,
      top: session.rect.bottom + 8,
      width: session.rect.width,
    });
  };

  const handlePointerDown = (side, index, event) => {
    if (event.button != null && event.button !== 0) return;
    const row = side === "away" ? awayRow : homeRow;
    const player = row.players[index];
    if (!player) return;

    event.preventDefault();
    setMenuState(null);
    setRefreshMenuOpen(false);
    clearPressSession();

    const rect = event.currentTarget.getBoundingClientRect();
    const pointerId = event.pointerId;
    const session = {
      side,
      index,
      player,
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now(),
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      rect,
    };

    pressSessionRef.current = session;
    menuTimeoutRef.current = setTimeout(() => {
      const activeSession = pressSessionRef.current;
      if (!activeSession || activeSession.pointerId !== pointerId) return;
      clearPressSession();
      openRosterMenu(activeSession);
    }, MENU_HOLD_MS);
  };

  const handleRosterSelect = (side, index, personId) => {
    const row = side === "away" ? awayRow : homeRow;
    if (!row.rosterMap.has(personId)) return;
    updateRowSlots(side, swapOrReplace(row.slotIds, index, personId));
    setMenuState(null);
  };

  const toggleRefreshMenu = () => {
    setMenuState(null);
    setRefreshMenuOpen((current) => !current);
  };

  const handleRefreshRow = (side) => {
    const row = side === "away" ? awayRow : homeRow;
    updateRowSlots(
      side,
      refreshRowPreservingSharedSlots(row.slotIds, row.preferredSlotIds)
    );
    setRefreshMenuOpen(false);
  };

  const handleRefreshAll = () => {
    setPersistedState((current) => ({
      ...current,
      slots: {
        ...current.slots,
        away: awayRow.preferredSlotIds,
        home: homeRow.preferredSlotIds,
      },
    }));
    setRefreshMenuOpen(false);
  };

  const updateCollapsed = () => {
    setMenuState(null);
    setRefreshMenuOpen(false);
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
      roster: awayRow.roster,
      preferredSlotIds: awayRow.preferredSlotIds,
      players: awayRow.players,
    },
    {
      key: "home",
      label: homeTeam?.teamTricode || "Home",
      teamName: homeTeam?.teamName || "Home Team",
      teamId: homeTeam?.teamId,
      roster: homeRow.roster,
      preferredSlotIds: homeRow.preferredSlotIds,
      players: homeRow.players,
    },
  ];

  const hasLineups = awayRow.players.length || homeRow.players.length;
  const menuRow = menuState?.side === "away" ? rows[0] : rows[1];
  const menuOptions = menuRow ? sortRosterOptions(menuRow.roster) : [];

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
                  {row.key === "away" ? (
                    <button
                      ref={refreshButtonRef}
                      type="button"
                      className={styles.refreshButton}
                      onClick={toggleRefreshMenu}
                    >
                      Refresh
                    </button>
                  ) : null}
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

      {refreshMenuOpen ? (
        <div ref={refreshMenuRef} className={styles.refreshMenu}>
          <div className={styles.refreshMenuTitle}>Reset Match-Ups</div>
          <button type="button" className={styles.refreshMenuButton} onClick={() => handleRefreshRow("away")}>
            {`Refresh ${awayTeam?.teamTricode || "Away"}`}
          </button>
          <button type="button" className={styles.refreshMenuButton} onClick={() => handleRefreshRow("home")}>
            {`Refresh ${homeTeam?.teamTricode || "Home"}`}
          </button>
          <button type="button" className={styles.refreshMenuButton} onClick={handleRefreshAll}>
            Refresh All
          </button>
        </div>
      ) : null}

      {menuState ? (
        <div
          ref={menuRef}
          className={styles.menu}
          style={{
            left: `${Math.max(12, menuState.left)}px`,
            top: `${menuState.top}px`,
            width: `${Math.max(menuState.width, 180)}px`,
          }}
        >
          <div className={styles.menuHeader}>Select player</div>
          <div className={styles.menuList}>
            {menuOptions.map((player) => (
              <button
                key={player.personId}
                type="button"
                className={styles.menuItem}
                onClick={() => handleRosterSelect(menuState.side, menuState.index, player.personId)}
              >
                {`${player.jerseyNum} ${player.fullName || player.lastName}`.trim()}
              </button>
            ))}
          </div>
        </div>
      ) : null}

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
