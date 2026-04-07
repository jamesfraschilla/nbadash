import { useEffect, useMemo, useRef, useState } from "react";
import { teamLogoUrl } from "../api.js";
import PlayerHeadshot from "./PlayerHeadshot.jsx";
import { readLocalStorage, writeLocalStorage } from "../storage.js";
import styles from "./MatchUps.module.css";

const MATCH_UP_STORAGE_PREFIX = "nba-dashboard:match-ups:";
const DRAG_ARM_MS_MOUSE = 20;
const DRAG_ARM_MS_TOUCH = 90;
const DOUBLE_ACTIVATE_MS_MOUSE = 360;
const PRESS_MOVE_TOLERANCE_PX_MOUSE = 8;
const PRESS_MOVE_TOLERANCE_PX_TOUCH = 16;
const SWAP_FLASH_MS = 180;
const ROW_SLOT_COUNT = 5;
const DRAG_TARGET_PADDING_PX = 22;
const PICKER_OPEN_GUARD_MS = 260;
const PICKER_HOLD_MS_TOUCH = 420;

function isGLeagueTeamId(teamId) {
  const numericTeamId = Number(teamId);
  return numericTeamId >= 1612700000 && numericTeamId < 1612710000;
}

function buildEmptyState() {
  return {
    collapsed: true,
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
      collapsed: true,
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

function extractFirstName(playerName = "") {
  const parts = String(playerName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return parts.slice(0, -1).join(" ");
}

function formatPlayerNameCase(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
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

function normalizeRosterPlayer(player, fallback = null, teamId = null) {
  if (!player && !fallback) return null;
  const personId = String(player?.personId || fallback?.personId || "");
  if (!personId) return null;

  const fullNameSource = String(
    player?.fullName ||
    player?.display ||
    player?.name ||
    fallback?.nameI ||
    fallback?.fullName ||
    fallback?.display ||
    fallback?.name ||
    ""
  ).trim();
  const firstName = String(player?.firstName || player?.givenName || "").trim() || extractFirstName(fullNameSource);
  const familyName = String(player?.familyName || player?.lastName || "").trim() || extractLastName(fullNameSource);
  return {
    personId,
    jerseyNum: String(player?.jerseyNum || fallback?.jerseyNum || "").trim(),
    firstName,
    lastName: familyName,
    fullName: [firstName, familyName].filter(Boolean).join(" ").trim(),
    displayName: formatPlayerNameCase(
      String(player?.display || player?.fullName || player?.name || fallback?.display || fallback?.fullName || fallback?.nameI || fallback?.name || "").trim()
    ),
    teamId,
  };
}

function buildRosterPlayers(teamBoxPlayers, stintPlayers, extraRosterPlayers, teamId) {
  const roster = [];
  const byId = new Map();

  (teamBoxPlayers || []).forEach((player) => {
    const normalized = normalizeRosterPlayer(player, null, teamId);
    if (!normalized || byId.has(normalized.personId)) return;
    byId.set(normalized.personId, normalized);
    roster.push(normalized);
  });

  normalizeStintPlayers(stintPlayers).forEach((player) => {
    const normalized = normalizeRosterPlayer(null, player, teamId);
    if (!normalized || byId.has(normalized.personId)) return;
    byId.set(normalized.personId, normalized);
    roster.push(normalized);
  });

  (extraRosterPlayers || []).forEach((player) => {
    const normalized = normalizeRosterPlayer(player, null, teamId);
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

function buildCurrentStintSlotIds(stintPlayers) {
  const slotIds = [];
  const used = new Set();

  normalizeStintPlayers(stintPlayers).forEach((player) => {
    const personId = String(player?.personId || "");
    if (!personId || used.has(personId)) return;
    used.add(personId);
    slotIds.push(personId);
  });

  return slotIds.slice(0, ROW_SLOT_COUNT);
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

function buildTeamRow(teamBoxPlayers, stintPlayers, extraRosterPlayers, savedSlotIds, teamId) {
  const roster = buildRosterPlayers(teamBoxPlayers, stintPlayers, extraRosterPlayers, teamId);
  const rosterMap = new Map(roster.map((player) => [player.personId, player]));
  const currentStintSlotIds = buildCurrentStintSlotIds(stintPlayers).filter((personId) => rosterMap.has(personId));
  const preferredSlotIds = buildPreferredSlotIds(teamBoxPlayers, stintPlayers, roster);
  const slotIds = resolveSlotIds(savedSlotIds, preferredSlotIds, roster);
  return {
    roster,
    rosterMap,
    currentStintSlotIds,
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

function swapItemPositions(items, fromIndex, toIndex) {
  if (fromIndex === toIndex) return items;
  const next = [...items];
  if (!next[fromIndex]) return items;
  if (!next[toIndex]) {
    return moveItem(items, fromIndex, toIndex);
  }
  [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
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

function refreshRowToCurrentLineup(currentSlotIds, currentStintSlotIds) {
  const currentLineupSet = new Set(currentStintSlotIds);
  const next = Array(ROW_SLOT_COUNT).fill(null);
  const used = new Set();

  (currentSlotIds || []).forEach((personId, index) => {
    if (!currentLineupSet.has(personId) || used.has(personId)) return;
    next[index] = personId;
    used.add(personId);
  });

  let currentLineupIndex = 0;
  for (let index = 0; index < ROW_SLOT_COUNT; index += 1) {
    if (next[index]) continue;
    while (currentLineupIndex < currentStintSlotIds.length) {
      const candidate = currentStintSlotIds[currentLineupIndex];
      currentLineupIndex += 1;
      if (!candidate || used.has(candidate)) continue;
      next[index] = candidate;
      used.add(candidate);
      break;
    }
  }

  return next.filter(Boolean);
}

function findSlotIndex(slots, clientX, clientY) {
  let matchedIndex = -1;
  let matchedDistance = Number.POSITIVE_INFINITY;

  slots.forEach((slot, index) => {
    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    const withinBounds =
      clientX >= rect.left - DRAG_TARGET_PADDING_PX &&
      clientX <= rect.right + DRAG_TARGET_PADDING_PX &&
      clientY >= rect.top - DRAG_TARGET_PADDING_PX &&
      clientY <= rect.bottom + DRAG_TARGET_PADDING_PX;

    if (!withinBounds) return;

    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    const distance = Math.hypot(clientX - centerX, clientY - centerY);
    if (distance < matchedDistance) {
      matchedIndex = index;
      matchedDistance = distance;
    }
  });

  return matchedIndex;
}

function isTouchPointer(pointerType) {
  return pointerType === "touch" || pointerType === "pen";
}

function dragArmMsForPointer(pointerType) {
  return isTouchPointer(pointerType) ? DRAG_ARM_MS_TOUCH : DRAG_ARM_MS_MOUSE;
}

function moveToleranceForPointer(pointerType) {
  return isTouchPointer(pointerType) ? PRESS_MOVE_TOLERANCE_PX_TOUCH : PRESS_MOVE_TOLERANCE_PX_MOUSE;
}

function doubleActivateMsForPointer(pointerType) {
  return DOUBLE_ACTIVATE_MS_MOUSE;
}

function MatchUpTile({ player, isDraggingSource, isTarget, isSwapAnimating, onPointerDown }) {
  const tileClassName = `${styles.tile} ${isTarget ? styles.tileTarget : ""} ${isSwapAnimating ? styles.tileSwap : ""}`.trim();
  const headshotStyle = player && isGLeagueTeamId(player.teamId)
    ? { mixBlendMode: "multiply" }
    : undefined;

  if (!player) {
    return (
      <div className={`${tileClassName} ${styles.tileEmpty}`.trim()}>
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
      onContextMenu={(event) => event.preventDefault()}
      aria-label={`Adjust ${player.fullName || player.lastName || "player"}`}
    >
      <div className={tileClassName}>
        <div className={styles.avatarFrame}>
          <PlayerHeadshot
            className={styles.avatarImage}
            personId={player.personId}
            teamId={player.teamId}
            style={headshotStyle}
            alt=""
            draggable={false}
          />
        </div>
        <div className={styles.playerMeta}>
          <div className={styles.playerName}>{`${player.jerseyNum} ${player.lastName}`.trim()}</div>
        </div>
      </div>
    </button>
  );
}

function ExpandedTile({ player, teamLabel, isDraggingSource, isTarget, isSwapAnimating, onPointerDown }) {
  const tileClassName = `${styles.expandedTile} ${isTarget ? styles.expandedTileTarget : ""} ${isSwapAnimating ? styles.expandedTileSwap : ""}`.trim();

  if (!player) {
    return (
      <div className={`${tileClassName} ${styles.expandedTileEmpty}`.trim()}>
        <div className={styles.expandedAvatarFrame} />
        <div className={styles.expandedPlayerName}>Open</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.expandedTileButton} ${isDraggingSource ? styles.tileButtonDragging : ""}`}
      onPointerDown={onPointerDown}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={`Adjust ${teamLabel} ${player.fullName || player.lastName || "player"}`}
    >
      <div className={tileClassName}>
        <div className={styles.expandedAvatarFrame}>
          <PlayerHeadshot
            className={styles.expandedAvatarImage}
            personId={player.personId}
            teamId={player.teamId}
            alt=""
            draggable={false}
          />
        </div>
        <div className={styles.expandedPlayerName}>{`${player.jerseyNum} ${player.lastName}`.trim()}</div>
      </div>
    </button>
  );
}

function HeadshotPickerTile({ player, isActive, onClick }) {
  const displayLabel = String(
    player?.displayName ||
    player?.fullName ||
    [player?.firstName, player?.lastName].filter(Boolean).join(" ") ||
    player?.lastName ||
    ""
  ).trim();

  return (
    <button
      type="button"
      className={`${styles.pickerItem} ${isActive ? styles.pickerItemActive : ""}`.trim()}
      onClick={onClick}
    >
      <div className={styles.pickerAvatarFrame}>
        <PlayerHeadshot
          className={styles.pickerAvatarImage}
          personId={player.personId}
          teamId={player.teamId}
          style={isGLeagueTeamId(player.teamId) ? { mixBlendMode: "multiply" } : undefined}
          alt=""
          draggable={false}
        />
      </div>
      <div className={styles.pickerPlayerLabel}>{`${player.jerseyNum ? `#${player.jerseyNum} ` : ""}${formatPlayerNameCase(displayLabel)}`.trim()}</div>
    </button>
  );
}

export default function MatchUps({
  gameId,
  awayTeam,
  homeTeam,
  boxScore,
  minutesData,
  awayRosterPlayers = [],
  homeRosterPlayers = [],
}) {
  const [persistedState, setPersistedState] = useState(() => loadMatchUpState(gameId));
  const [dragState, setDragState] = useState(null);
  const [pickerState, setPickerState] = useState(null);
  const [refreshMenuOpen, setRefreshMenuOpen] = useState(false);
  const [expandedOpen, setExpandedOpen] = useState(false);
  const [swapFlash, setSwapFlash] = useState(null);
  const [isPortraitExpandedLayout, setIsPortraitExpandedLayout] = useState(() => (
    typeof window !== "undefined" ? window.matchMedia("(orientation: portrait)").matches : false
  ));
  const pressSessionRef = useRef(null);
  const lastActivateRef = useRef({
    side: null,
    index: -1,
    at: 0,
    pointerType: null,
    x: 0,
    y: 0,
  });
  const swapFlashTimeoutRef = useRef(null);
  const pickerHoldTimeoutRef = useRef(null);
  const dragStateRef = useRef(null);
  const pickerOpenedAtRef = useRef(0);
  const expandedOpenRef = useRef(false);
  const isPortraitExpandedLayoutRef = useRef(isPortraitExpandedLayout);
  const rowSlotIdsRef = useRef({
    away: [],
    home: [],
  });
  const compactSlotRefs = useRef({
    away: [],
    home: [],
  });
  const expandedLandscapeSlotRefs = useRef({
    away: [],
    home: [],
  });
  const expandedPortraitSlotRefs = useRef({
    away: [],
    home: [],
  });
  const refreshMenuRef = useRef(null);
  const refreshButtonRef = useRef(null);

  useEffect(() => {
    setPersistedState(loadMatchUpState(gameId));
    setPickerState(null);
    setRefreshMenuOpen(false);
    setExpandedOpen(false);
    setDragState(null);
  }, [gameId]);

  useEffect(() => {
    saveMatchUpState(gameId, persistedState);
  }, [gameId, persistedState]);

  const currentStint = useMemo(() => buildCurrentStint(minutesData), [minutesData]);

  const awayRow = useMemo(
    () => buildTeamRow(
      boxScore?.away?.players,
      currentStint?.playersAway,
      awayRosterPlayers,
      persistedState.slots.away,
      awayTeam?.teamId
    ),
    [awayRosterPlayers, awayTeam?.teamId, boxScore?.away?.players, currentStint?.playersAway, persistedState.slots.away]
  );

  const homeRow = useMemo(
    () => buildTeamRow(
      boxScore?.home?.players,
      currentStint?.playersHome,
      homeRosterPlayers,
      persistedState.slots.home,
      homeTeam?.teamId
    ),
    [boxScore?.home?.players, currentStint?.playersHome, homeRosterPlayers, homeTeam?.teamId, persistedState.slots.home]
  );

  const clearPressSession = () => {
    if (pickerHoldTimeoutRef.current) {
      clearTimeout(pickerHoldTimeoutRef.current);
      pickerHoldTimeoutRef.current = null;
    }
    const activeSession = pressSessionRef.current;
    if (activeSession?.target?.hasPointerCapture?.(activeSession.pointerId)) {
      activeSession.target.releasePointerCapture(activeSession.pointerId);
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

  const triggerSwapFlash = (side, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;

    if (swapFlashTimeoutRef.current) {
      clearTimeout(swapFlashTimeoutRef.current);
    }

    setSwapFlash({
      side,
      indexes: [fromIndex, toIndex],
    });

    swapFlashTimeoutRef.current = setTimeout(() => {
      setSwapFlash(null);
      swapFlashTimeoutRef.current = null;
    }, SWAP_FLASH_MS);
  };

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    expandedOpenRef.current = expandedOpen;
  }, [expandedOpen]);

  useEffect(() => {
    if (!expandedOpen || typeof window === "undefined") return undefined;

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const scrollY = window.scrollY;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, [expandedOpen]);

  useEffect(() => {
    isPortraitExpandedLayoutRef.current = isPortraitExpandedLayout;
  }, [isPortraitExpandedLayout]);

  useEffect(() => {
    rowSlotIdsRef.current = {
      away: awayRow.slotIds,
      home: homeRow.slotIds,
    };
  }, [awayRow.slotIds, homeRow.slotIds]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia("(orientation: portrait)");
    const updateLayout = () => setIsPortraitExpandedLayout(mediaQuery.matches);
    updateLayout();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updateLayout);
      return () => mediaQuery.removeEventListener("change", updateLayout);
    }

    mediaQuery.addListener(updateLayout);
    return () => mediaQuery.removeListener(updateLayout);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const pressSession = pressSessionRef.current;
      const activeDrag = dragStateRef.current;

      if (pressSession && !activeDrag && event.pointerId === pressSession.pointerId) {
        const deltaX = event.clientX - pressSession.startX;
        const deltaY = event.clientY - pressSession.startY;
        if (Math.hypot(deltaX, deltaY) <= moveToleranceForPointer(pressSession.pointerType)) return;

        if ((Date.now() - pressSession.startedAt) < dragArmMsForPointer(pressSession.pointerType)) {
          return;
        }

        clearPressSession();
        lastActivateRef.current = { side: null, index: -1, at: 0, pointerType: null, x: 0, y: 0 };
        const nextDragState = {
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
        };
        dragStateRef.current = nextDragState;
        setDragState(nextDragState);
        return;
      }

      if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;

      event.preventDefault();
      const slots = expandedOpenRef.current
        ? (
          isPortraitExpandedLayoutRef.current
            ? expandedPortraitSlotRefs.current[activeDrag.side]
            : expandedLandscapeSlotRefs.current[activeDrag.side]
        )
        : compactSlotRefs.current[activeDrag.side];
      const nextOverIndex = findSlotIndex(slots, event.clientX, event.clientY);
      const nextDragState = {
        ...activeDrag,
        pointerX: event.clientX,
        pointerY: event.clientY,
        overIndex: nextOverIndex >= 0 ? nextOverIndex : activeDrag.overIndex,
      };
      dragStateRef.current = nextDragState;
      setDragState(nextDragState);
    };

    const handlePointerUp = (event) => {
      const activeDrag = dragStateRef.current;
      const pressSession = pressSessionRef.current;

      if (activeDrag && event.pointerId === activeDrag.pointerId) {
        const slotIds = rowSlotIdsRef.current[activeDrag.side] || [];
        updateRowSlots(activeDrag.side, swapItemPositions(slotIds, activeDrag.fromIndex, activeDrag.overIndex));
        triggerSwapFlash(activeDrag.side, activeDrag.fromIndex, activeDrag.overIndex);
        lastActivateRef.current = { side: null, index: -1, at: 0, pointerType: null, x: 0, y: 0 };
        dragStateRef.current = null;
        setDragState(null);
      }

      if (pressSession && event.pointerId === pressSession.pointerId) {
        if (!activeDrag && !isTouchPointer(pressSession.pointerType)) {
          handlePointerActivate(pressSession);
        }
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
  }, []);

  useEffect(() => {
    const handlePointerDownOutside = (event) => {
      if (pickerState && (Date.now() - pickerOpenedAtRef.current) < PICKER_OPEN_GUARD_MS) {
        return;
      }
      if (pickerState && !event.target?.closest?.(`.${styles.pickerDialog}`)) {
        setPickerState(null);
      }
      if (!refreshMenuRef.current?.contains(event.target) && !refreshButtonRef.current?.contains(event.target)) {
        setRefreshMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setPickerState(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDownOutside);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDownOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [pickerState]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setExpandedOpen(false);
        setPickerState(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

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
    if (swapFlashTimeoutRef.current) {
      clearTimeout(swapFlashTimeoutRef.current);
    }
  }, []);

  const openHeadshotPicker = (session) => {
    pickerOpenedAtRef.current = Date.now();
    setPickerState({
      side: session.side,
      index: session.index,
    });
  };

  const handlePointerActivate = (session) => {
    const now = Date.now();
    const previous = lastActivateRef.current;
    const doubleActivateMs = doubleActivateMsForPointer(session.pointerType);
    if (
      previous.side === session.side &&
      previous.index === session.index &&
      previous.pointerType === session.pointerType &&
      now - previous.at <= doubleActivateMs
    ) {
      lastActivateRef.current = { side: null, index: -1, at: 0, pointerType: null, x: 0, y: 0 };
      setRefreshMenuOpen(false);
      openHeadshotPicker(session);
      return;
    }

    lastActivateRef.current = {
      side: session.side,
      index: session.index,
      at: now,
      pointerType: session.pointerType,
      x: session.startX || 0,
      y: session.startY || 0,
    };
  };

  const handlePointerDown = (side, index, event) => {
    if (event.button != null && event.button !== 0) return;
    const row = side === "away" ? awayRow : homeRow;
    const player = row.players[index];
    if (!player) return;

    event.preventDefault();
    setPickerState(null);
    setRefreshMenuOpen(false);
    clearPressSession();

    const rect = event.currentTarget.getBoundingClientRect();
    const pointerId = event.pointerId;
    const pointerType = event.pointerType || "mouse";
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
      target: event.currentTarget,
      pointerType,
    };

    if (event.currentTarget?.setPointerCapture) {
      event.currentTarget.setPointerCapture(pointerId);
    }

    pressSessionRef.current = session;

    if (isTouchPointer(pointerType)) {
      pickerHoldTimeoutRef.current = setTimeout(() => {
        const activeSession = pressSessionRef.current;
        if (!activeSession || activeSession.pointerId !== pointerId || dragStateRef.current) return;
        clearPressSession();
        setRefreshMenuOpen(false);
        openHeadshotPicker(session);
      }, PICKER_HOLD_MS_TOUCH);
    }
  };

  const handlePickerSelect = (side, index, personId) => {
    const row = side === "away" ? awayRow : homeRow;
    if (!row.rosterMap.has(personId)) return;
    updateRowSlots(side, swapOrReplace(row.slotIds, index, personId));
    setPickerState(null);
  };

  const toggleRefreshMenu = () => {
    setPickerState(null);
    setRefreshMenuOpen((current) => !current);
  };

  const openExpandedView = () => {
    setPickerState(null);
    setRefreshMenuOpen(false);
    setExpandedOpen(true);
  };

  const handleRefreshRow = (side) => {
    const row = side === "away" ? awayRow : homeRow;
    if (!row.currentStintSlotIds.length) {
      setRefreshMenuOpen(false);
      return;
    }
    updateRowSlots(
      side,
      refreshRowToCurrentLineup(row.slotIds, row.currentStintSlotIds)
    );
    setRefreshMenuOpen(false);
  };

  const handleRefreshAll = () => {
    setPersistedState((current) => ({
      ...current,
      slots: {
        ...current.slots,
        away: awayRow.currentStintSlotIds.length ? awayRow.currentStintSlotIds : current.slots.away,
        home: homeRow.currentStintSlotIds.length ? homeRow.currentStintSlotIds : current.slots.home,
      },
    }));
    setRefreshMenuOpen(false);
  };

  const updateCollapsed = () => {
    setPickerState(null);
    setRefreshMenuOpen(false);
    setExpandedOpen(false);
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
      slotIds: awayRow.slotIds,
      preferredSlotIds: awayRow.preferredSlotIds,
      players: awayRow.players,
    },
    {
      key: "home",
      label: homeTeam?.teamTricode || "Home",
      teamName: homeTeam?.teamName || "Home Team",
      teamId: homeTeam?.teamId,
      roster: homeRow.roster,
      slotIds: homeRow.slotIds,
      preferredSlotIds: homeRow.preferredSlotIds,
      players: homeRow.players,
    },
  ];

  const hasLineups = awayRow.players.length || homeRow.players.length;
  const pickerRow = pickerState?.side === "away" ? rows[0] : pickerState?.side === "home" ? rows[1] : null;
  const pickerOptions = pickerRow ? sortRosterOptions(pickerRow.roster) : [];
  const pickerSelectedPersonId = pickerRow && Number.isInteger(pickerState?.index)
    ? pickerRow.slotIds[pickerState.index] || ""
    : "";

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
                    <div className={styles.headerActions}>
                      <button
                        type="button"
                        className={styles.expandButton}
                        onClick={openExpandedView}
                      >
                        Expand
                      </button>
                      <button
                        ref={refreshButtonRef}
                        type="button"
                        className={styles.refreshButton}
                        onClick={toggleRefreshMenu}
                      >
                        Refresh
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className={styles.rowScroller}>
                  <div className={styles.slotGrid}>
                    {Array.from({ length: ROW_SLOT_COUNT }, (_, index) => {
                      const player = row.players[index] || null;
                      const isSource = dragState?.side === row.key && dragState?.fromIndex === index;
                      const isTarget = dragState?.side === row.key && dragState?.overIndex === index;
                      const isSwapAnimating = swapFlash?.side === row.key && swapFlash.indexes.includes(index);
                      return (
                        <div
                          key={`${row.key}-${player?.personId || `slot-${index}`}`}
                          ref={(node) => {
                            compactSlotRefs.current[row.key][index] = node;
                          }}
                          className={`${styles.slot} ${isTarget ? styles.slotTarget : ""}`}
                        >
                          <MatchUpTile
                            player={player}
                            isDraggingSource={isSource}
                            isTarget={isTarget}
                            isSwapAnimating={isSwapAnimating}
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

      {expandedOpen ? (
        <div className={styles.expandedOverlay}>
          <div className={styles.expandedView}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setExpandedOpen(false)}
            >
              Close
            </button>

            <div className={styles.expandedLandscape}>
              {rows.map((row) => {
                const logoUrl = row.teamId ? teamLogoUrl(row.teamId) : "";
                return (
                  <div key={`expanded-${row.key}`} className={styles.expandedRow}>
                    <div className={styles.expandedRowHeader}>
                      {logoUrl ? <img className={styles.expandedTeamLogo} src={logoUrl} alt="" /> : null}
                      <div>
                        <div className={styles.expandedTeamCode}>{row.label}</div>
                        <div className={styles.expandedTeamName}>{row.teamName}</div>
                      </div>
                    </div>
                    <div className={styles.expandedSlotGrid}>
                      {Array.from({ length: ROW_SLOT_COUNT }, (_, index) => {
                        const player = row.players[index] || null;
                        const isSource = dragState?.side === row.key && dragState?.fromIndex === index;
                        const isTarget = dragState?.side === row.key && dragState?.overIndex === index;
                        const isSwapAnimating = swapFlash?.side === row.key && swapFlash.indexes.includes(index);
                        return (
                          <div
                            key={`expanded-${row.key}-${player?.personId || `slot-${index}`}`}
                            ref={(node) => {
                              expandedLandscapeSlotRefs.current[row.key][index] = node;
                            }}
                          >
                            <ExpandedTile
                              player={player}
                              teamLabel={row.label}
                              isDraggingSource={isSource}
                              isTarget={isTarget}
                              isSwapAnimating={isSwapAnimating}
                              onPointerDown={(event) => handlePointerDown(row.key, index, event)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.expandedPortrait}>
              <div className={styles.expandedPortraitHeader}>
                <div className={styles.expandedPortraitTeam}>
                  {rows[0]?.teamId ? <img className={styles.expandedTeamLogo} src={teamLogoUrl(rows[0].teamId)} alt="" /> : null}
                  <span>{rows[0]?.label}</span>
                </div>
                <div className={styles.expandedPortraitTeam}>
                  {rows[1]?.teamId ? <img className={styles.expandedTeamLogo} src={teamLogoUrl(rows[1].teamId)} alt="" /> : null}
                  <span>{rows[1]?.label}</span>
                </div>
              </div>
              <div className={styles.expandedPortraitRows}>
                {Array.from({ length: ROW_SLOT_COUNT }, (_, index) => (
                  <div key={`portrait-pair-${index}`} className={styles.expandedPortraitPair}>
                    {rows.slice(0, 2).map((row) => {
                      const player = row?.players[index] || null;
                      const isSource = dragState?.side === row?.key && dragState?.fromIndex === index;
                      const isTarget = dragState?.side === row?.key && dragState?.overIndex === index;
                      const isSwapAnimating = swapFlash?.side === row?.key && swapFlash.indexes.includes(index);
                      return (
                        <div
                          key={`portrait-${row?.key || "row"}-${index}-${player?.personId || "open"}`}
                          ref={(node) => {
                            if (row?.key) {
                              expandedPortraitSlotRefs.current[row.key][index] = node;
                            }
                          }}
                        >
                          <ExpandedTile
                            player={player}
                            teamLabel={row?.label || "Team"}
                            isDraggingSource={isSource}
                            isTarget={isTarget}
                            isSwapAnimating={isSwapAnimating}
                            onPointerDown={(event) => row?.key && handlePointerDown(row.key, index, event)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

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

      {pickerState ? (
        <div className={styles.pickerOverlay}>
          <div className={styles.pickerDialog} onClick={(event) => event.stopPropagation()}>
            <div className={styles.pickerHeader}>
              <div className={styles.pickerTitle}>Select player</div>
              <button type="button" className={styles.pickerCloseButton} onClick={() => setPickerState(null)}>
                Close
              </button>
            </div>
            <div className={styles.pickerGrid}>
              {pickerOptions.map((player) => (
                <HeadshotPickerTile
                  key={player.personId}
                  player={player}
                  isActive={player.personId === pickerSelectedPersonId}
                  onClick={() => handlePickerSelect(pickerState.side, pickerState.index, player.personId)}
                />
              ))}
            </div>
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
          {expandedOpen ? (
            <div className={styles.expandedTile}>
              <div className={styles.expandedAvatarFrame}>
                <PlayerHeadshot
                  className={styles.expandedAvatarImage}
                  personId={dragState.player.personId}
                  teamId={dragState.player.teamId}
                  alt=""
                  draggable={false}
                />
              </div>
              <div className={styles.expandedPlayerName}>{`${dragState.player.jerseyNum} ${dragState.player.lastName}`.trim()}</div>
            </div>
          ) : (
            <div className={styles.tile}>
              <div className={styles.avatarFrame}>
                <PlayerHeadshot
                  className={styles.avatarImage}
                  personId={dragState.player.personId}
                  teamId={dragState.player.teamId}
                  style={isGLeagueTeamId(dragState.player.teamId) ? { mixBlendMode: "multiply" } : undefined}
                  alt=""
                  draggable={false}
                />
              </div>
              <div className={styles.playerMeta}>
                <div className={styles.playerName}>{`${dragState.player.jerseyNum} ${dragState.player.lastName}`.trim()}</div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
