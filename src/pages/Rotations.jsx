import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGame } from "../api.js";
import { supabase } from "../supabaseClient.js";
import styles from "./Rotations.module.css";

const PLAYERS_STORAGE_KEY = "rotations:players:v1";
const GAME_STORAGE_PREFIX = "rotations:game:v1:";
const ROTATIONS_GAME_ACTION_PAYLOAD = 900000021;
const ROTATIONS_PLAYERS_ACTION_PAYLOAD = 900000022;
const ROTATIONS_GLOBAL_PLAYERS_GAME_ID = "9999999911";
const QUARTERS = [1, 2, 3, 4];
const MINUTES = Array.from({ length: 12 }, (_, index) => 12 - index);
const POSITION_COLUMNS = [1, 2, 3, 4, 5];
const TOTAL_PER_QUARTER = MINUTES.length * POSITION_COLUMNS.length;

const DEFAULT_PLAYERS = [
  { id: "p1", name: "BUB", cap: 48 },
  { id: "p2", name: "BC", cap: 48 },
  { id: "p3", name: "TRE", cap: 48 },
  { id: "p4", name: "KG", cap: 48 },
  { id: "p5", name: "JC", cap: 48 },
  { id: "p6", name: "ALEX", cap: 48 },
  { id: "p7", name: "TV", cap: 48 },
  { id: "p8", name: "SC", cap: 48 },
  { id: "p9", name: "WR", cap: 48 },
  { id: "p10", name: "JW", cap: 48 },
  { id: "p11", name: "AG", cap: 48 },
  { id: "p12", name: "JH", cap: 48 },
  { id: "p13", name: "JR", cap: 48 },
  { id: "p14", name: "LB", cap: 48 },
  { id: "p15", name: "", cap: 48 },
  { id: "p16", name: "", cap: 48 },
  { id: "p17", name: "", cap: 48 },
];

const DEFAULT_DEPTH_ROWS = [
  ["TRAE", "TRE", "BC", "LB", "JR"],
  ["SC", "BUB", "JH", "WR", "AG"],
  ["", "", "", "", ""],
];

const createDefaultQuarterLineups = () => ({
  1: MINUTES.map(() => Array.from({ length: POSITION_COLUMNS.length }, () => "")),
  2: MINUTES.map(() => Array.from({ length: POSITION_COLUMNS.length }, () => "")),
  3: MINUTES.map(() => Array.from({ length: POSITION_COLUMNS.length }, () => "")),
  4: MINUTES.map(() => Array.from({ length: POSITION_COLUMNS.length }, () => "")),
});

const createDefaultDepthChart = () => DEFAULT_DEPTH_ROWS.map((row) => row.slice());

function seedFirstQuarterRow(lineups, depthChart) {
  const nextLineups = { ...lineups };
  const q1 = Array.isArray(nextLineups[1]) ? nextLineups[1].map((row) => [...row]) : [];
  if (!q1.length) return lineups;
  const firstRow = Array.isArray(q1[0]) ? [...q1[0]] : Array.from({ length: POSITION_COLUMNS.length }, () => "");
  const shouldSeed = firstRow.every((value) => !normalizeName(value));
  if (!shouldSeed) return lineups;
  const topDepthRow = Array.isArray(depthChart?.[0]) ? depthChart[0] : [];
  q1[0] = POSITION_COLUMNS.map((_, columnIndex) => normalizeName(topDepthRow[columnIndex] || ""));
  nextLineups[1] = q1;
  return nextLineups;
}

const createDefaultGameState = () => ({
  depthChart: createDefaultDepthChart(),
  lineups: seedFirstQuarterRow(createDefaultQuarterLineups(), createDefaultDepthChart()),
});

function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizePlayers(rawPlayers) {
  const normalized = (Array.isArray(rawPlayers) ? rawPlayers : []).slice(0, 17).map((player, index) => ({
    id: String(player?.id || `p${index + 1}`),
    name: normalizeName(player?.name),
    cap: Number.isFinite(Number(player?.cap)) ? Number(player.cap) : 48,
  }));
  while (normalized.length < 17) {
    normalized.push({ id: `p${normalized.length + 1}`, name: "", cap: 48 });
  }
  return normalized;
}

function normalizeDepthChart(rawDepth) {
  const fallback = createDefaultDepthChart();
  if (!Array.isArray(rawDepth)) return fallback;
  return [0, 1, 2].map((rowIndex) => {
    const row = Array.isArray(rawDepth[rowIndex]) ? rawDepth[rowIndex] : [];
    return POSITION_COLUMNS.map((_, columnIndex) => normalizeName(row[columnIndex] || ""));
  });
}

function normalizeLineups(rawLineups) {
  const fallback = createDefaultQuarterLineups();
  const result = {};
  QUARTERS.forEach((quarter) => {
    const rows = Array.isArray(rawLineups?.[quarter]) ? rawLineups[quarter] : fallback[quarter];
    result[quarter] = MINUTES.map((_, minuteIndex) => {
      const row = Array.isArray(rows?.[minuteIndex]) ? rows[minuteIndex] : [];
      return POSITION_COLUMNS.map((_, columnIndex) => normalizeName(row[columnIndex] || ""));
    });
  });
  return result;
}

function normalizeGameState(rawState) {
  if (!rawState || typeof rawState !== "object") return createDefaultGameState();

  // Backward compatibility with older payload that included players.
  const depthSource = Array.isArray(rawState.depthChart)
    ? rawState.depthChart
    : (rawState.depthChart?.[1] || rawState.depthChart);

  const normalized = {
    depthChart: normalizeDepthChart(depthSource),
    lineups: normalizeLineups(rawState.lineups),
  };
  return {
    ...normalized,
    lineups: seedFirstQuarterRow(normalized.lineups, normalized.depthChart),
  };
}

function loadPlayersPayload() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PLAYERS_STORAGE_KEY);
  if (!raw) return null;
  const parsed = safeParseJson(raw, null);
  if (Array.isArray(parsed)) {
    return { updatedAt: 0, players: normalizePlayers(parsed) };
  }
  if (!parsed || typeof parsed !== "object") return null;
  return {
    updatedAt: Number(parsed.updatedAt || 0),
    players: normalizePlayers(parsed.players),
  };
}

function persistPlayers(players, updatedAt = Date.now()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify({
    updatedAt,
    players: normalizePlayers(players),
  }));
}

function gameStorageKey(gameId) {
  return `${GAME_STORAGE_PREFIX}${gameId}`;
}

function loadGamePayload(gameId) {
  if (typeof window === "undefined" || !gameId) return null;
  const raw = window.localStorage.getItem(gameStorageKey(gameId));
  if (!raw) return null;
  const parsed = safeParseJson(raw, null);
  if (!parsed || typeof parsed !== "object") return null;
  return {
    updatedAt: Number(parsed.updatedAt || 0),
    state: normalizeGameState(parsed.state || parsed),
  };
}

function persistGameState(gameId, state, updatedAt = Date.now()) {
  if (typeof window === "undefined" || !gameId) return;
  window.localStorage.setItem(gameStorageKey(gameId), JSON.stringify({
    updatedAt,
    state,
  }));
}

function parseRemotePayload(note, key) {
  const parsed = safeParseJson(note || "{}", null);
  if (!parsed || typeof parsed !== "object") return { updatedAt: 0, value: null };
  const updatedAt = Number(parsed.updatedAt || 0);
  if (parsed[key] != null) return { updatedAt, value: parsed[key] };
  if (parsed.value != null) return { updatedAt, value: parsed.value };
  return { updatedAt, value: parsed };
}

function parseRemotePlayersPayload(note) {
  const parsed = safeParseJson(note || "{}", null);
  if (!parsed || typeof parsed !== "object") return { updatedAt: 0, players: null };
  const updatedAt = Number(parsed.updatedAt || 0);
  if (Array.isArray(parsed.players)) {
    return { updatedAt, players: normalizePlayers(parsed.players) };
  }
  return { updatedAt, players: null };
}

async function fetchRemotePlayers() {
  if (!supabase) return null;
  const fetchByAction = async (actionNumber) => {
    const { data, error } = await supabase
      .from("pbp_highlights")
      .select("note")
      .eq("game_id", ROTATIONS_GLOBAL_PLAYERS_GAME_ID)
      .eq("action_number", actionNumber)
      .maybeSingle();
    if (error) return null;
    return parseRemotePlayersPayload(data?.note);
  };
  let payload = await fetchByAction(ROTATIONS_PLAYERS_ACTION_PAYLOAD);
  if (!payload?.players?.length) {
    payload = await fetchByAction(ROTATIONS_GAME_ACTION_PAYLOAD);
  }
  return {
    updatedAt: Number(payload?.updatedAt || 0),
    players: payload?.players || null,
  };
}

async function saveRemotePlayers(players, updatedAt = Date.now()) {
  if (!supabase) return;
  await supabase.from("pbp_highlights").upsert(
    {
      game_id: ROTATIONS_GLOBAL_PLAYERS_GAME_ID,
      action_number: ROTATIONS_PLAYERS_ACTION_PAYLOAD,
      note: JSON.stringify({
        updatedAt,
        players: normalizePlayers(players),
      }),
    },
    { onConflict: "game_id,action_number" }
  );
}

async function fetchRemoteGameState(gameId) {
  if (!supabase || !gameId) return null;
  const { data, error } = await supabase
    .from("pbp_highlights")
    .select("note")
    .eq("game_id", String(gameId))
    .eq("action_number", ROTATIONS_GAME_ACTION_PAYLOAD)
    .maybeSingle();
  if (error) return null;
  const payload = parseRemotePayload(data?.note, "state");
  return {
    updatedAt: payload.updatedAt,
    state: normalizeGameState(payload.value),
  };
}

async function saveRemoteGameState(gameId, state, updatedAt = Date.now()) {
  if (!supabase || !gameId) return;
  await supabase.from("pbp_highlights").upsert(
    {
      game_id: String(gameId),
      action_number: ROTATIONS_GAME_ACTION_PAYLOAD,
      note: JSON.stringify({
        updatedAt,
        state,
      }),
    },
    { onConflict: "game_id,action_number" }
  );
}

function isWashingtonTeam(team) {
  const tricode = String(team?.teamTricode || "").toUpperCase();
  const name = `${team?.teamCity || ""} ${team?.teamName || ""}`.toLowerCase();
  return tricode === "WAS" || name.includes("washington") || name.includes("wizards");
}

function buildOpponentLine(game) {
  const away = game?.awayTeam;
  const home = game?.homeTeam;
  const washingtonAway = isWashingtonTeam(away);
  const opponent = washingtonAway ? home : away;
  const city = String(opponent?.teamCity || "Opponent").trim().toUpperCase();
  return washingtonAway ? `@ ${city}` : `VS ${city}`;
}

function quarterLabel(quarter) {
  if (quarter === 1) return "1st";
  if (quarter === 2) return "2nd";
  if (quarter === 3) return "3rd";
  return "4th";
}

export default function Rotations() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const dateParam = params.get("d");
  const backUrl = dateParam ? `/g/${gameId}?d=${dateParam}` : `/g/${gameId}`;

  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [depthChart, setDepthChart] = useState(createDefaultDepthChart());
  const [lineups, setLineups] = useState(createDefaultQuarterLineups());
  const [playersHydrated, setPlayersHydrated] = useState(false);
  const [gameHydrated, setGameHydrated] = useState(false);
  const [collapsed, setCollapsed] = useState({
    restrictions: false,
    depth: false,
    q1: false,
    q2: false,
    q3: false,
    q4: false,
  });

  const playersUpdatedAtRef = useRef(0);
  const gameUpdatedAtRef = useRef(0);
  const skipPlayersSaveRef = useRef(false);
  const skipGameSaveRef = useRef(false);
  const dragFillRef = useRef({
    active: false,
    quarter: null,
    value: "",
    originMinuteIndex: -1,
    originPositionIndex: -1,
    lastMinuteIndex: -1,
    lastPositionIndex: -1,
  });
  const touchFillRef = useRef({
    timerId: null,
    startTouchX: 0,
    startTouchY: 0,
    active: false,
    quarter: null,
    value: "",
    originMinuteIndex: -1,
    originPositionIndex: -1,
    endMinuteIndex: -1,
    endPositionIndex: -1,
  });
  const [touchPreview, setTouchPreview] = useState(null);

  const { data: game, isLoading, error } = useQuery({
    queryKey: ["game-rotations", gameId],
    queryFn: () => fetchGame(gameId),
    enabled: Boolean(gameId),
  });

  const { data: remotePlayers, isFetched: remotePlayersFetched } = useQuery({
    queryKey: ["rotations-players-remote"],
    queryFn: fetchRemotePlayers,
    enabled: Boolean(supabase),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const { data: remoteGameState, isFetched: remoteGameFetched } = useQuery({
    queryKey: ["rotations-game-remote", gameId],
    queryFn: () => fetchRemoteGameState(gameId),
    enabled: Boolean(supabase && gameId),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const washingtonGame = useMemo(() => (
    isWashingtonTeam(game?.homeTeam) || isWashingtonTeam(game?.awayTeam)
  ), [game]);

  useEffect(() => {
    setPlayersHydrated(false);
    setGameHydrated(false);
    playersUpdatedAtRef.current = 0;
    gameUpdatedAtRef.current = 0;
    skipPlayersSaveRef.current = false;
    skipGameSaveRef.current = false;
  }, [gameId]);

  useEffect(() => {
    if (playersHydrated) return;
    if (supabase && !remotePlayersFetched) return;

    const localPayload = loadPlayersPayload();
    const localUpdatedAt = Number(localPayload?.updatedAt || 0);
    const remoteUpdatedAt = Number(remotePlayers?.updatedAt || 0);

    if (remotePlayers?.players?.length && remoteUpdatedAt >= localUpdatedAt) {
      setPlayers(remotePlayers.players);
      playersUpdatedAtRef.current = remoteUpdatedAt;
      skipPlayersSaveRef.current = true;
    } else if (localPayload?.players?.length) {
      setPlayers(localPayload.players);
      playersUpdatedAtRef.current = localUpdatedAt;
      skipPlayersSaveRef.current = true;
    } else if (remotePlayers?.players?.length) {
      setPlayers(remotePlayers.players);
      playersUpdatedAtRef.current = remoteUpdatedAt;
      skipPlayersSaveRef.current = true;
    }

    setPlayersHydrated(true);
  }, [playersHydrated, remotePlayers, remotePlayersFetched]);

  useEffect(() => {
    if (gameHydrated || !gameId) return;
    if (supabase && !remoteGameFetched) return;

    const defaults = createDefaultGameState();
    const localPayload = loadGamePayload(gameId);
    const localUpdatedAt = Number(localPayload?.updatedAt || 0);
    const remoteUpdatedAt = Number(remoteGameState?.updatedAt || 0);

    if (remoteGameState?.state && remoteUpdatedAt >= localUpdatedAt) {
      setDepthChart(remoteGameState.state.depthChart);
      setLineups(remoteGameState.state.lineups);
      gameUpdatedAtRef.current = remoteUpdatedAt;
      skipGameSaveRef.current = true;
    } else if (localPayload?.state) {
      setDepthChart(localPayload.state.depthChart);
      setLineups(localPayload.state.lineups);
      gameUpdatedAtRef.current = localUpdatedAt;
      skipGameSaveRef.current = true;
    } else {
      setDepthChart(defaults.depthChart);
      setLineups(defaults.lineups);
      gameUpdatedAtRef.current = Date.now();
      skipGameSaveRef.current = true;
    }

    setGameHydrated(true);
  }, [gameHydrated, gameId, remoteGameState, remoteGameFetched]);

  useEffect(() => {
    if (!playersHydrated) return;

    if (skipPlayersSaveRef.current) {
      skipPlayersSaveRef.current = false;
      persistPlayers(players, playersUpdatedAtRef.current || Date.now());
      return;
    }

    const updatedAt = Date.now();
    playersUpdatedAtRef.current = updatedAt;
    persistPlayers(players, updatedAt);
    saveRemotePlayers(players, updatedAt);
  }, [players, playersHydrated]);

  useEffect(() => {
    if (!gameHydrated || !gameId) return;

    const state = { depthChart, lineups };
    if (skipGameSaveRef.current) {
      skipGameSaveRef.current = false;
      persistGameState(gameId, state, gameUpdatedAtRef.current || Date.now());
      return;
    }

    const updatedAt = Date.now();
    gameUpdatedAtRef.current = updatedAt;
    persistGameState(gameId, state, updatedAt);
    saveRemoteGameState(gameId, state, updatedAt);
  }, [depthChart, lineups, gameHydrated, gameId]);

  useEffect(() => {
    if (!playersHydrated) return;
    const remoteUpdatedAt = Number(remotePlayers?.updatedAt || 0);
    if (!remoteUpdatedAt || remoteUpdatedAt <= playersUpdatedAtRef.current) return;
    setPlayers(remotePlayers.players || []);
    playersUpdatedAtRef.current = remoteUpdatedAt;
    skipPlayersSaveRef.current = true;
    persistPlayers(remotePlayers.players || [], remoteUpdatedAt);
  }, [playersHydrated, remotePlayers]);

  useEffect(() => {
    if (!gameHydrated || !gameId || !remoteGameState?.state) return;
    const remoteUpdatedAt = Number(remoteGameState.updatedAt || 0);
    if (!remoteUpdatedAt || remoteUpdatedAt <= gameUpdatedAtRef.current) return;
    setDepthChart(remoteGameState.state.depthChart);
    setLineups(remoteGameState.state.lineups);
    gameUpdatedAtRef.current = remoteUpdatedAt;
    skipGameSaveRef.current = true;
    persistGameState(gameId, remoteGameState.state, remoteUpdatedAt);
  }, [gameHydrated, gameId, remoteGameState]);

  const playerOptions = useMemo(() => {
    const unique = new Set();
    players.forEach((player) => {
      const name = normalizeName(player.name);
      if (!name) return;
      unique.add(name);
    });
    return Array.from(unique);
  }, [players]);

  const quarterCounts = useMemo(() => {
    const result = { 1: {}, 2: {}, 3: {}, 4: {} };
    QUARTERS.forEach((quarter) => {
      const counts = {};
      (lineups[quarter] || []).forEach((row) => {
        row.forEach((value) => {
          const name = normalizeName(value);
          if (!name) return;
          counts[name] = (counts[name] || 0) + 1;
        });
      });
      result[quarter] = counts;
    });
    return result;
  }, [lineups]);

  const totalCounts = useMemo(() => {
    const totals = {};
    QUARTERS.forEach((quarter) => {
      Object.entries(quarterCounts[quarter] || {}).forEach(([name, count]) => {
        totals[name] = (totals[name] || 0) + (count || 0);
      });
    });
    return totals;
  }, [quarterCounts]);

  const quarterTotals = useMemo(() => {
    const values = { 1: 0, 2: 0, 3: 0, 4: 0 };
    QUARTERS.forEach((quarter) => {
      let filled = 0;
      (lineups[quarter] || []).forEach((row) => {
        row.forEach((value) => {
          if (normalizeName(value)) filled += 1;
        });
      });
      values[quarter] = filled;
    });
    return values;
  }, [lineups]);

  const allQuarterTotal = quarterTotals[1] + quarterTotals[2] + quarterTotals[3] + quarterTotals[4];
  const opponentLine = useMemo(() => buildOpponentLine(game), [game]);

  const updatePlayerField = (playerId, field, value) => {
    setPlayers((current) => current.map((player) => {
      if (player.id !== playerId) return player;
      if (field === "cap") {
        const parsed = Number.parseInt(value, 10);
        return { ...player, cap: Number.isFinite(parsed) ? parsed : 0 };
      }
      return { ...player, [field]: normalizeName(value) };
    }));
  };

  const updateDepthCell = (rowIndex, columnIndex, value) => {
    setDepthChart((current) => current.map((row, rIndex) => (
      rIndex !== rowIndex ? row : row.map((cell, cIndex) => (cIndex === columnIndex ? normalizeName(value) : cell))
    )));
  };

  const updateLineupCell = (quarter, minuteIndex, positionIndex, value) => {
    setLineups((current) => ({
      ...current,
      [quarter]: current[quarter].map((row, rIndex) => (
        rIndex !== minuteIndex
          ? row
          : row.map((cell, cIndex) => (cIndex === positionIndex ? normalizeName(value) : cell))
      )),
    }));
  };

  const fillLineupRange = (quarter, startMinuteIndex, startPositionIndex, endMinuteIndex, endPositionIndex, value) => {
    const normalizedValue = normalizeName(value);
    if (!normalizedValue) return;
    const minMinute = Math.min(startMinuteIndex, endMinuteIndex);
    const maxMinute = Math.max(startMinuteIndex, endMinuteIndex);
    const minPosition = Math.min(startPositionIndex, endPositionIndex);
    const maxPosition = Math.max(startPositionIndex, endPositionIndex);
    setLineups((current) => ({
      ...current,
      [quarter]: current[quarter].map((row, minuteIndex) => {
        if (minuteIndex < minMinute || minuteIndex > maxMinute) return row;
        return row.map((cell, positionIndex) => (
          positionIndex < minPosition || positionIndex > maxPosition ? cell : normalizedValue
        ));
      }),
    }));
  };

  const resetAll = () => {
    setLineups(seedFirstQuarterRow(createDefaultQuarterLineups(), depthChart));
  };

  const toggleSection = (key) => {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  };

  const clearTouchFillTimer = () => {
    const timerId = touchFillRef.current.timerId;
    if (timerId) {
      window.clearTimeout(timerId);
      touchFillRef.current.timerId = null;
    }
  };

  const stopTouchFill = () => {
    clearTouchFillTimer();
    touchFillRef.current.active = false;
    touchFillRef.current.quarter = null;
    touchFillRef.current.value = "";
    touchFillRef.current.originMinuteIndex = -1;
    touchFillRef.current.originPositionIndex = -1;
    touchFillRef.current.endMinuteIndex = -1;
    touchFillRef.current.endPositionIndex = -1;
    setTouchPreview(null);
  };

  const getCellMetaFromElement = (element) => {
    const cell = element?.closest?.("[data-quarter][data-minute-index][data-position-index]");
    if (!cell) return null;
    const quarter = Number.parseInt(cell.getAttribute("data-quarter") || "", 10);
    const minuteIndex = Number.parseInt(cell.getAttribute("data-minute-index") || "", 10);
    const positionIndex = Number.parseInt(cell.getAttribute("data-position-index") || "", 10);
    if (!Number.isFinite(quarter) || !Number.isFinite(minuteIndex) || !Number.isFinite(positionIndex)) return null;
    return { quarter, minuteIndex, positionIndex };
  };

  const isInTouchPreviewRange = (quarter, minuteIndex, positionIndex) => {
    if (!touchPreview || touchPreview.quarter !== quarter) return false;
    const minMinute = Math.min(touchPreview.startMinuteIndex, touchPreview.endMinuteIndex);
    const maxMinute = Math.max(touchPreview.startMinuteIndex, touchPreview.endMinuteIndex);
    const minPosition = Math.min(touchPreview.startPositionIndex, touchPreview.endPositionIndex);
    const maxPosition = Math.max(touchPreview.startPositionIndex, touchPreview.endPositionIndex);
    return (
      minuteIndex >= minMinute
      && minuteIndex <= maxMinute
      && positionIndex >= minPosition
      && positionIndex <= maxPosition
    );
  };

  useEffect(() => {
    const endDragFill = () => {
      dragFillRef.current.active = false;
      if (touchFillRef.current.active) {
        stopTouchFill();
      }
    };
    window.addEventListener("mouseup", endDragFill);
    window.addEventListener("touchend", endDragFill, { passive: true });
    window.addEventListener("touchcancel", endDragFill, { passive: true });
    return () => {
      window.removeEventListener("mouseup", endDragFill);
      window.removeEventListener("touchend", endDragFill);
      window.removeEventListener("touchcancel", endDragFill);
      clearTouchFillTimer();
    };
  }, []);

  const getRowValues = (quarter, minuteIndex) => (lineups[quarter]?.[minuteIndex] || []);

  const getPreviousRowValues = (quarter, minuteIndex) => {
    if (minuteIndex > 0) return getRowValues(quarter, minuteIndex - 1);
    if (quarter > 1) return getRowValues(quarter - 1, MINUTES.length - 1);
    return null;
  };

  const getNextRowValues = (quarter, minuteIndex) => {
    if (minuteIndex < MINUTES.length - 1) return getRowValues(quarter, minuteIndex + 1);
    if (quarter < 4) return getRowValues(quarter + 1, 0);
    return null;
  };

  if (isLoading) {
    return <div className={styles.stateMessage}>Loading rotations...</div>;
  }

  if (error || !game) {
    return <div className={styles.stateMessage}>Unable to load rotations.</div>;
  }

  if (!washingtonGame) {
    return (
      <div className={styles.page}>
        <div className={styles.topRow}>
          <Link className={styles.backButton} to={backUrl}>Back</Link>
        </div>
        <div className={styles.stateMessage}>Rotations is available only for Washington games.</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link className={styles.backButton} to={backUrl}>Back</Link>
        <button type="button" className={styles.secondaryButton} onClick={resetAll}>Reset Game Grid</button>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>{opponentLine}</h1>
      </header>

      <section className={styles.sheetSection}>
        <button type="button" className={styles.sectionHeaderButton} onClick={() => toggleSection("restrictions")}>
          Restrictions / Totals
        </button>
        {!collapsed.restrictions && (
          <table className={styles.totalsTable}>
            <thead>
              <tr>
                <th>Player</th>
                <th>Cap</th>
                <th>1st</th>
                <th>2nd</th>
                <th>3rd</th>
                <th>4th</th>
                <th>Tot</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const name = normalizeName(player.name);
                const cap = Number(player.cap) || 0;
                const q1 = name ? (quarterCounts[1]?.[name] || 0) : 0;
                const q2 = name ? (quarterCounts[2]?.[name] || 0) : 0;
                const q3 = name ? (quarterCounts[3]?.[name] || 0) : 0;
                const q4 = name ? (quarterCounts[4]?.[name] || 0) : 0;
                const totalCount = name ? (totalCounts[name] || 0) : 0;
                let totalClassName = "";
                if (name && totalCount > cap) totalClassName = styles.overCapCell;
                else if (name && totalCount >= Math.max(0, cap - 5)) totalClassName = styles.nearCapCell;

                return (
                  <tr key={`totals-row-${player.id}`}>
                    <td className={styles.playerNameCell}>
                      <input
                        className={styles.playerNameInput}
                        value={player.name}
                        onChange={(event) => updatePlayerField(player.id, "name", event.target.value)}
                        aria-label={`Player ${player.id}`}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.capInput}
                        type="number"
                        min="0"
                        value={cap}
                        onChange={(event) => updatePlayerField(player.id, "cap", event.target.value)}
                        aria-label={`Cap for ${name || player.id}`}
                      />
                    </td>
                    <td>{q1}</td>
                    <td>{q2}</td>
                    <td>{q3}</td>
                    <td>{q4}</td>
                    <td className={totalClassName}>{totalCount}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td />
                <td className={quarterTotals[1] !== TOTAL_PER_QUARTER ? styles.badTotalCell : ""}>{quarterTotals[1]}</td>
                <td className={quarterTotals[2] !== TOTAL_PER_QUARTER ? styles.badTotalCell : ""}>{quarterTotals[2]}</td>
                <td className={quarterTotals[3] !== TOTAL_PER_QUARTER ? styles.badTotalCell : ""}>{quarterTotals[3]}</td>
                <td className={quarterTotals[4] !== TOTAL_PER_QUARTER ? styles.badTotalCell : ""}>{quarterTotals[4]}</td>
                <td className={allQuarterTotal !== TOTAL_PER_QUARTER * 4 ? styles.badTotalCell : ""}>{allQuarterTotal}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section className={styles.sheetSection}>
        <button type="button" className={styles.sectionHeaderButton} onClick={() => toggleSection("depth")}>
          Depth Chart
        </button>
        {!collapsed.depth && (
          <table className={styles.depthTable}>
            <thead>
              <tr>
                {POSITION_COLUMNS.map((position) => <th key={`depth-head-${position}`}>{position}</th>)}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((rowIndex) => (
                <tr key={`depth-row-${rowIndex}`}>
                  {POSITION_COLUMNS.map((position) => {
                    const columnIndex = position - 1;
                    const value = depthChart[rowIndex]?.[columnIndex] || "";
                    return (
                      <td key={`depth-cell-${rowIndex}-${position}`}>
                        <select
                          className={styles.playerSelect}
                          value={value}
                          onChange={(event) => updateDepthCell(rowIndex, columnIndex, event.target.value)}
                        >
                          <option value=""> </option>
                          {playerOptions.map((option) => (
                            <option key={`depth-${rowIndex}-${position}-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {QUARTERS.map((quarter) => {
        const sectionKey = `q${quarter}`;
        return (
          <section key={quarter} className={styles.sheetSection}>
            <button type="button" className={styles.sectionHeaderButton} onClick={() => toggleSection(sectionKey)}>
              {quarterLabel(quarter)} Quarter
            </button>
            {!collapsed[sectionKey] && (
              <table className={styles.rotationTable}>
                <thead>
                  <tr>
                    <th>Time</th>
                    {POSITION_COLUMNS.map((position) => <th key={`pos-${quarter}-${position}`}>{position}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MINUTES.map((minute, minuteIndex) => {
                    const rowValues = lineups[quarter]?.[minuteIndex] || [];
                    const nonBlank = rowValues.filter((value) => normalizeName(value));
                    const hasDuplicate = new Set(nonBlank).size !== nonBlank.length;
                    const previousRowValues = getPreviousRowValues(quarter, minuteIndex);
                    const nextRowValues = getNextRowValues(quarter, minuteIndex);

                    return (
                      <tr key={`minute-row-${quarter}-${minute}`}>
                        <td className={styles.minuteCell}>{minute}</td>
                        {POSITION_COLUMNS.map((position) => {
                          const positionIndex = position - 1;
                          const value = rowValues[positionIndex] || "";
                          const normalizedValue = normalizeName(value);
                          const isSubIn = Boolean(
                            normalizedValue
                              && previousRowValues
                              && !previousRowValues.some((entry) => normalizeName(entry) === normalizedValue)
                          );
                          const isSubOut = Boolean(
                            normalizedValue
                              && nextRowValues
                              && !nextRowValues.some((entry) => normalizeName(entry) === normalizedValue)
                          );

                          const cellClassName = [
                            hasDuplicate && value ? styles.duplicateCell : "",
                            isSubOut ? styles.subOutCell : "",
                            isSubIn ? styles.subInCell : "",
                            isInTouchPreviewRange(quarter, minuteIndex, positionIndex) ? styles.touchPreviewCell : "",
                          ].filter(Boolean).join(" ");

                          return (
                            <td
                              key={`lineup-cell-${quarter}-${minute}-${position}`}
                              className={cellClassName}
                              data-quarter={quarter}
                              data-minute-index={minuteIndex}
                              data-position-index={positionIndex}
                              onTouchStart={(event) => {
                                if (touchFillRef.current.active) return;
                                if (!normalizedValue) return;
                                const touch = event.touches?.[0];
                                if (!touch) return;
                                clearTouchFillTimer();
                                touchFillRef.current.startTouchX = touch.clientX;
                                touchFillRef.current.startTouchY = touch.clientY;
                                touchFillRef.current.quarter = quarter;
                                touchFillRef.current.value = normalizedValue;
                                touchFillRef.current.originMinuteIndex = minuteIndex;
                                touchFillRef.current.originPositionIndex = positionIndex;
                                touchFillRef.current.endMinuteIndex = minuteIndex;
                                touchFillRef.current.endPositionIndex = positionIndex;
                                touchFillRef.current.timerId = window.setTimeout(() => {
                                  touchFillRef.current.active = true;
                                  touchFillRef.current.timerId = null;
                                  setTouchPreview({
                                    quarter,
                                    startMinuteIndex: minuteIndex,
                                    startPositionIndex: positionIndex,
                                    endMinuteIndex: minuteIndex,
                                    endPositionIndex: positionIndex,
                                  });
                                }, 1000);
                              }}
                              onTouchMove={(event) => {
                                const touch = event.touches?.[0];
                                if (!touch) return;

                                if (!touchFillRef.current.active) {
                                  const dx = Math.abs(touch.clientX - touchFillRef.current.startTouchX);
                                  const dy = Math.abs(touch.clientY - touchFillRef.current.startTouchY);
                                  if (dx > 8 || dy > 8) clearTouchFillTimer();
                                  return;
                                }

                                event.preventDefault();
                                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                                const meta = getCellMetaFromElement(target);
                                if (!meta || meta.quarter !== touchFillRef.current.quarter) return;
                                touchFillRef.current.endMinuteIndex = meta.minuteIndex;
                                touchFillRef.current.endPositionIndex = meta.positionIndex;
                                setTouchPreview({
                                  quarter: meta.quarter,
                                  startMinuteIndex: touchFillRef.current.originMinuteIndex,
                                  startPositionIndex: touchFillRef.current.originPositionIndex,
                                  endMinuteIndex: meta.minuteIndex,
                                  endPositionIndex: meta.positionIndex,
                                });
                              }}
                              onTouchEnd={(event) => {
                                if (touchFillRef.current.active) {
                                  event.preventDefault();
                                  fillLineupRange(
                                    touchFillRef.current.quarter,
                                    touchFillRef.current.originMinuteIndex,
                                    touchFillRef.current.originPositionIndex,
                                    touchFillRef.current.endMinuteIndex,
                                    touchFillRef.current.endPositionIndex,
                                    touchFillRef.current.value
                                  );
                                }
                                stopTouchFill();
                              }}
                              onTouchCancel={() => {
                                stopTouchFill();
                              }}
                            >
                              <select
                                className={styles.playerSelect}
                                value={value}
                                onChange={(event) => updateLineupCell(quarter, minuteIndex, positionIndex, event.target.value)}
                                onMouseDown={(event) => {
                                  if (!event.shiftKey || !normalizedValue) return;
                                  event.preventDefault();
                                  dragFillRef.current = {
                                    active: true,
                                    quarter,
                                    value: normalizedValue,
                                    originMinuteIndex: minuteIndex,
                                    originPositionIndex: positionIndex,
                                    lastMinuteIndex: minuteIndex,
                                    lastPositionIndex: positionIndex,
                                  };
                                }}
                                onMouseEnter={() => {
                                  const drag = dragFillRef.current;
                                  if (!drag.active || drag.quarter !== quarter) return;
                                  if (drag.lastMinuteIndex === minuteIndex && drag.lastPositionIndex === positionIndex) return;
                                  drag.lastMinuteIndex = minuteIndex;
                                  drag.lastPositionIndex = positionIndex;
                                  fillLineupRange(
                                    quarter,
                                    drag.originMinuteIndex,
                                    drag.originPositionIndex,
                                    minuteIndex,
                                    positionIndex,
                                    drag.value
                                  );
                                }}
                              >
                                <option value=""> </option>
                                {playerOptions.map((option) => (
                                  <option key={`${quarter}-${minute}-${position}-${option}`} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}
