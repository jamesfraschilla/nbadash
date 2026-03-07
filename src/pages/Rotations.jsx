import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGame } from "../api.js";
import { supabase } from "../supabaseClient.js";
import wizardsLogoUrl from "../assets/WWizards_Primary_Icon.png";
import dinFontUrl from "../assets/fonts/DIN.ttf";
import styles from "./Rotations.module.css";

const PLAYERS_STORAGE_KEY = "rotations:players:v1";
const DEPTH_TEMPLATE_STORAGE_KEY = "rotations:depth-template:v1";
const GAME_STORAGE_PREFIX = "rotations:game:v1:";
const SECTION_STATE_STORAGE_PREFIX = "rotations:sections:v1:";
const ROTATIONS_TABLE = "rotations_shared_state";
const ROTATIONS_SCOPE_PLAYERS = "players";
const ROTATIONS_SCOPE_DEPTH_TEMPLATE = "depth_template";
const ROTATIONS_SCOPE_GAME = "game";
const ROTATIONS_GLOBAL_SCOPE_KEY = "global";
const QUARTERS = [1, 2, 3, 4];
const MINUTES = Array.from({ length: 12 }, (_, index) => 12 - index);
const POSITION_COLUMNS = [1, 2, 3, 4, 5];
const TOTAL_PER_QUARTER = MINUTES.length * POSITION_COLUMNS.length;
const MAX_LINEUP_HISTORY = 100;

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

const createDefaultGameState = () => ({
  depthChart: createDefaultDepthChart(),
  lineups: createDefaultQuarterLineups(),
  inheritDepthTemplate: true,
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
    cap: player?.cap === "" ? "" : (Number.isFinite(Number(player?.cap)) ? Number(player.cap) : 48),
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

function hasAnyFilledLineups(lineups) {
  return QUARTERS.some((quarter) => (
    (lineups?.[quarter] || []).some((row) => row.some((value) => normalizeName(value)))
  ));
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
    inheritDepthTemplate:
      typeof rawState.inheritDepthTemplate === "boolean"
        ? rawState.inheritDepthTemplate
        : !hasAnyFilledLineups(rawState.lineups),
  };
  return normalized;
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

function loadDepthTemplatePayload() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DEPTH_TEMPLATE_STORAGE_KEY);
  if (!raw) return null;
  const parsed = safeParseJson(raw, null);
  if (!parsed || typeof parsed !== "object") return null;
  if (Array.isArray(parsed)) {
    return { updatedAt: 0, depthChart: normalizeDepthChart(parsed), sourceGameId: "" };
  }
  return {
    updatedAt: Number(parsed.updatedAt || 0),
    depthChart: normalizeDepthChart(parsed.depthChart),
    sourceGameId: String(parsed.sourceGameId || ""),
  };
}

function persistDepthTemplate(depthChart, updatedAt = Date.now(), sourceGameId = "") {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEPTH_TEMPLATE_STORAGE_KEY, JSON.stringify({
    updatedAt,
    depthChart: normalizeDepthChart(depthChart),
    sourceGameId: String(sourceGameId || ""),
  }));
}

function gameStorageKey(gameId) {
  return `${GAME_STORAGE_PREFIX}${gameId}`;
}

function sectionStateStorageKey(gameId) {
  return `${SECTION_STATE_STORAGE_PREFIX}${gameId}`;
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

function parseSharedStateRow(row) {
  const updatedAt = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : null;
  return { updatedAt, payload };
}

async function fetchRemotePlayers() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(ROTATIONS_TABLE)
    .select("payload,updated_at")
    .eq("scope_type", ROTATIONS_SCOPE_PLAYERS)
    .eq("scope_key", ROTATIONS_GLOBAL_SCOPE_KEY)
    .maybeSingle();
  if (error) return null;
  if (!data?.payload) return null;
  const parsed = parseSharedStateRow(data);
  return {
    updatedAt: parsed.updatedAt,
    players: normalizePlayers(parsed.payload?.players),
  };
}

async function saveRemotePlayers(players, updatedAt = Date.now()) {
  if (!supabase) return;
  const { error } = await supabase.from(ROTATIONS_TABLE).upsert(
    {
      scope_type: ROTATIONS_SCOPE_PLAYERS,
      scope_key: ROTATIONS_GLOBAL_SCOPE_KEY,
      payload: {
        players: normalizePlayers(players),
      },
    },
    { onConflict: "scope_type,scope_key" }
  );
  if (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to save rotations players", error);
  }
}

async function fetchRemoteGameState(gameId) {
  if (!supabase || !gameId) return null;
  const { data, error } = await supabase
    .from(ROTATIONS_TABLE)
    .select("payload,updated_at")
    .eq("scope_type", ROTATIONS_SCOPE_GAME)
    .eq("scope_key", String(gameId))
    .maybeSingle();
  if (error) return null;
  if (!data?.payload) return null;
  const parsed = parseSharedStateRow(data);
  return {
    updatedAt: parsed.updatedAt,
    state: normalizeGameState(parsed.payload),
  };
}

async function saveRemoteGameState(gameId, state, updatedAt = Date.now()) {
  if (!supabase || !gameId) return;
  const { error } = await supabase.from(ROTATIONS_TABLE).upsert(
    {
      scope_type: ROTATIONS_SCOPE_GAME,
      scope_key: String(gameId),
      payload: state,
    },
    { onConflict: "scope_type,scope_key" }
  );
  if (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to save rotations game state", error);
  }
}

async function fetchRemoteDepthTemplate() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(ROTATIONS_TABLE)
    .select("payload,updated_at")
    .eq("scope_type", ROTATIONS_SCOPE_DEPTH_TEMPLATE)
    .eq("scope_key", ROTATIONS_GLOBAL_SCOPE_KEY)
    .maybeSingle();
  if (error) return null;
  if (!data?.payload) return null;
  const parsed = parseSharedStateRow(data);
  return {
    updatedAt: parsed.updatedAt,
    depthChart: normalizeDepthChart(parsed.payload?.depthChart),
    sourceGameId: String(parsed.payload?.sourceGameId || ""),
  };
}

async function saveRemoteDepthTemplate(depthChart, updatedAt = Date.now(), sourceGameId = "") {
  if (!supabase) return;
  const { error } = await supabase.from(ROTATIONS_TABLE).upsert(
    {
      scope_type: ROTATIONS_SCOPE_DEPTH_TEMPLATE,
      scope_key: ROTATIONS_GLOBAL_SCOPE_KEY,
      payload: {
        depthChart: normalizeDepthChart(depthChart),
        sourceGameId: String(sourceGameId || ""),
      },
    },
    { onConflict: "scope_type,scope_key" }
  );
  if (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to save rotations depth template", error);
  }
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderExportDepthChart(depthChart) {
  return `
    <section class="export-section">
      <div class="export-section-title">Depth Chart</div>
      <table class="export-table">
        <thead>
          <tr>${POSITION_COLUMNS.map((position) => `<th>${position}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${[0, 1, 2].map((rowIndex) => `
            <tr>
              ${POSITION_COLUMNS.map((_, columnIndex) => `<td>${escapeHtml(depthChart?.[rowIndex]?.[columnIndex] || "")}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderExportQuarterTable(quarter, lineups) {
  return `
    <section class="export-section">
      <div class="export-section-title">${quarterLabel(quarter)} Quarter</div>
      <table class="export-table">
        <thead>
          <tr>
            <th></th>
            ${POSITION_COLUMNS.map((position) => `<th>${position}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${MINUTES.map((minute, minuteIndex) => `
            <tr>
              <td>${minute}</td>
              ${POSITION_COLUMNS.map((_, columnIndex) => `<td>${escapeHtml(lineups?.[quarter]?.[minuteIndex]?.[columnIndex] || "")}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function buildRotationsPdfHtml({ headerLine, depthChart, lineups, logoUrl, fontUrl }) {
  const pageMarkup = (quarters, side) => `
    <section class="pdf-page ${side}">
      <div class="pdf-header">${escapeHtml(headerLine)}</div>
      <div class="pdf-column">
        <div class="pdf-sections">
        ${renderExportDepthChart(depthChart)}
        ${quarters.map((quarter) => renderExportQuarterTable(quarter, lineups)).join("")}
        </div>
        <div class="pdf-logo-wrap">
          <img class="pdf-logo" src="${escapeHtml(logoUrl)}" alt="Washington Wizards" />
        </div>
      </div>
    </section>
  `;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Rotations PDF Export</title>
        <style>
          @page {
            size: 8.5in 11in;
            margin: 0;
          }

          @font-face {
            font-family: "DIN Export";
            src: url("${escapeHtml(fontUrl)}") format("truetype");
          }

          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #111111;
            font-family: "DIN Export", "DIN", sans-serif;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .pdf-page {
            position: relative;
            width: 8.5in;
            height: 11in;
            page-break-after: always;
            overflow: hidden;
          }

          .pdf-page:last-child {
            page-break-after: auto;
          }

          .pdf-column {
            position: absolute;
            top: 0.58in;
            bottom: 0.3in;
            width: 4.12in;
          }

          .pdf-page.left .pdf-column {
            left: 0.1in;
          }

          .pdf-page.right .pdf-column {
            right: 0.1in;
          }

          .pdf-header {
            position: absolute;
            top: 0.16in;
            left: 0;
            width: 100%;
            font-size: 24px;
            font-weight: 700;
            text-align: center;
          }

          .pdf-sections {
            padding-bottom: 0.95in;
          }

          .export-section {
            margin-bottom: 0.12in;
          }

          .export-section-title {
            background: #000000;
            color: #ffffff;
            font-size: 16px;
            font-weight: 700;
            text-align: left;
            padding: 6px 8px;
          }

          .export-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }

          .export-table th,
          .export-table td {
            border: 1px solid #8c8c8c;
            text-align: center;
            vertical-align: middle;
            padding: 4px 3px;
            height: 24px;
            font-size: 12px;
          }

          .export-table thead th {
            background: #efefef;
            color: #111111;
            font-weight: 700;
          }

          .pdf-logo-wrap {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0.22in;
            display: flex;
            justify-content: center;
          }

          .pdf-logo {
            width: 0.62in;
            height: 0.62in;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        ${pageMarkup([1, 2], "left")}
        ${pageMarkup([3, 4], "right")}
      </body>
    </html>
  `;
}

export default function Rotations() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const dateParam = params.get("d");
  const backUrl = dateParam ? `/g/${gameId}?d=${dateParam}` : `/g/${gameId}`;

  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [depthTemplate, setDepthTemplate] = useState(createDefaultDepthChart());
  const [depthChart, setDepthChart] = useState(createDefaultDepthChart());
  const [lineups, setLineups] = useState(createDefaultQuarterLineups());
  const [inheritDepthTemplate, setInheritDepthTemplate] = useState(true);
  const [playersHydrated, setPlayersHydrated] = useState(false);
  const [depthTemplateHydrated, setDepthTemplateHydrated] = useState(false);
  const [gameHydrated, setGameHydrated] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [confirmResetTarget, setConfirmResetTarget] = useState(null);
  const [isTouchFillActive, setIsTouchFillActive] = useState(false);
  const [undoDepth, setUndoDepth] = useState(0);
  const [collapsed, setCollapsed] = useState({
    restrictions: false,
    depth: false,
    q1: false,
    q2: false,
    q3: false,
    q4: false,
  });

  const playersUpdatedAtRef = useRef(0);
  const depthTemplateUpdatedAtRef = useRef(0);
  const depthTemplateSourceGameIdRef = useRef("");
  const gameUpdatedAtRef = useRef(0);
  const skipPlayersSaveRef = useRef(false);
  const skipDepthTemplateSaveRef = useRef(false);
  const skipGameSaveRef = useRef(false);
  const lineupHistoryRef = useRef([]);
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

  const { data: remoteDepthTemplate, isFetched: remoteDepthFetched } = useQuery({
    queryKey: ["rotations-depth-template-remote"],
    queryFn: fetchRemoteDepthTemplate,
    enabled: Boolean(supabase),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const washingtonGame = useMemo(() => (
    isWashingtonTeam(game?.homeTeam) || isWashingtonTeam(game?.awayTeam)
  ), [game]);

  useEffect(() => {
    setPlayersHydrated(false);
    setDepthTemplateHydrated(false);
    setGameHydrated(false);
    playersUpdatedAtRef.current = 0;
    depthTemplateUpdatedAtRef.current = 0;
    depthTemplateSourceGameIdRef.current = "";
    gameUpdatedAtRef.current = 0;
    skipPlayersSaveRef.current = false;
    skipDepthTemplateSaveRef.current = false;
    skipGameSaveRef.current = false;
    lineupHistoryRef.current = [];
    setUndoDepth(0);
  }, [gameId]);

  useEffect(() => {
    if (!gameId || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(sectionStateStorageKey(gameId));
    const parsed = safeParseJson(raw, null);
    if (!parsed || typeof parsed !== "object") return;
    setCollapsed((current) => ({
      ...current,
      restrictions: Boolean(parsed.restrictions),
      depth: Boolean(parsed.depth),
      q1: Boolean(parsed.q1),
      q2: Boolean(parsed.q2),
      q3: Boolean(parsed.q3),
      q4: Boolean(parsed.q4),
    }));
  }, [gameId]);

  useEffect(() => {
    if (!gameId || typeof window === "undefined") return;
    window.localStorage.setItem(sectionStateStorageKey(gameId), JSON.stringify(collapsed));
  }, [collapsed, gameId]);

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
    }

    setPlayersHydrated(true);
  }, [playersHydrated, remotePlayers, remotePlayersFetched]);

  useEffect(() => {
    if (depthTemplateHydrated) return;
    if (supabase && !remoteDepthFetched) return;

    const localPayload = loadDepthTemplatePayload();
    const localUpdatedAt = Number(localPayload?.updatedAt || 0);
    const remoteUpdatedAt = Number(remoteDepthTemplate?.updatedAt || 0);
    if (remoteDepthTemplate?.depthChart && remoteUpdatedAt >= localUpdatedAt) {
      setDepthTemplate(remoteDepthTemplate.depthChart);
      depthTemplateUpdatedAtRef.current = remoteUpdatedAt;
      depthTemplateSourceGameIdRef.current = String(remoteDepthTemplate.sourceGameId || "");
      skipDepthTemplateSaveRef.current = true;
    } else if (localPayload?.depthChart) {
      setDepthTemplate(localPayload.depthChart);
      depthTemplateUpdatedAtRef.current = localUpdatedAt;
      depthTemplateSourceGameIdRef.current = String(localPayload.sourceGameId || "");
      skipDepthTemplateSaveRef.current = true;
    }

    setDepthTemplateHydrated(true);
  }, [depthTemplateHydrated, remoteDepthTemplate, remoteDepthFetched]);

  useEffect(() => {
    if (gameHydrated || !gameId) return;
    if (supabase && !remoteGameFetched) return;
    if (!depthTemplateHydrated) return;

    const defaults = {
      depthChart: normalizeDepthChart(depthTemplate),
      lineups: createDefaultQuarterLineups(),
      inheritDepthTemplate: true,
    };
    const shouldInheritFutureTemplate = (state) => {
      const sourceGameId = Number(depthTemplateSourceGameIdRef.current || 0);
      const currentGameNumeric = Number(gameId || 0);
      if (!sourceGameId || !currentGameNumeric || currentGameNumeric <= sourceGameId) return false;
      return Boolean(state?.inheritDepthTemplate);
    };
    const localPayload = loadGamePayload(gameId);
    const localUpdatedAt = Number(localPayload?.updatedAt || 0);
    const remoteUpdatedAt = Number(remoteGameState?.updatedAt || 0);
    if (remoteGameState?.state && remoteUpdatedAt >= localUpdatedAt) {
      setDepthChart(shouldInheritFutureTemplate(remoteGameState.state) ? defaults.depthChart : remoteGameState.state.depthChart);
      setLineups(remoteGameState.state.lineups);
      setInheritDepthTemplate(remoteGameState.state.inheritDepthTemplate);
      gameUpdatedAtRef.current = remoteUpdatedAt;
      skipGameSaveRef.current = true;
    } else if (localPayload?.state) {
      setDepthChart(shouldInheritFutureTemplate(localPayload.state) ? defaults.depthChart : localPayload.state.depthChart);
      setLineups(localPayload.state.lineups);
      setInheritDepthTemplate(localPayload.state.inheritDepthTemplate);
      gameUpdatedAtRef.current = localUpdatedAt;
      skipGameSaveRef.current = true;
    } else {
      setDepthChart(defaults.depthChart);
      setLineups(defaults.lineups);
      setInheritDepthTemplate(defaults.inheritDepthTemplate);
      gameUpdatedAtRef.current = Date.now();
      skipGameSaveRef.current = true;
    }

    setGameHydrated(true);
  }, [gameHydrated, gameId, remoteGameState, remoteGameFetched, depthTemplateHydrated, depthTemplate]);

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
    if (!depthTemplateHydrated) return;

    if (skipDepthTemplateSaveRef.current) {
      skipDepthTemplateSaveRef.current = false;
      persistDepthTemplate(
        depthTemplate,
        depthTemplateUpdatedAtRef.current || Date.now(),
        depthTemplateSourceGameIdRef.current
      );
      return;
    }

    const updatedAt = Date.now();
    depthTemplateUpdatedAtRef.current = updatedAt;
    persistDepthTemplate(depthTemplate, updatedAt, depthTemplateSourceGameIdRef.current);
    saveRemoteDepthTemplate(depthTemplate, updatedAt, depthTemplateSourceGameIdRef.current);
  }, [depthTemplate, depthTemplateHydrated]);

  useEffect(() => {
    if (!gameHydrated || !gameId) return;

    const state = { depthChart, lineups, inheritDepthTemplate };
    if (skipGameSaveRef.current) {
      skipGameSaveRef.current = false;
      persistGameState(gameId, state, gameUpdatedAtRef.current || Date.now());
      return;
    }

    const updatedAt = Date.now();
    gameUpdatedAtRef.current = updatedAt;
    persistGameState(gameId, state, updatedAt);
    saveRemoteGameState(gameId, state, updatedAt);
  }, [depthChart, lineups, inheritDepthTemplate, gameHydrated, gameId]);

  useEffect(() => {
    if (!playersHydrated) return;
    applyRemotePlayers(remotePlayers);
  }, [playersHydrated, remotePlayers]);

  useEffect(() => {
    if (!depthTemplateHydrated) return;
    applyRemoteDepthTemplate(remoteDepthTemplate);
  }, [depthTemplateHydrated, remoteDepthTemplate]);

  useEffect(() => {
    if (!gameHydrated || !gameId || !remoteGameState?.state) return;
    applyRemoteGameState(remoteGameState);
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
  const exportHeaderLine = useMemo(() => `WASHINGTON ${opponentLine}`, [opponentLine]);

  const updatePlayerField = (playerId, field, value) => {
    setPlayers((current) => current.map((player) => {
      if (player.id !== playerId) return player;
      if (field === "cap") {
        if (value === "") return { ...player, cap: "" };
        const parsed = Number.parseInt(value, 10);
        return { ...player, cap: Number.isFinite(parsed) ? parsed : player.cap };
      }
      return { ...player, [field]: normalizeName(value) };
    }));
  };

  const updateDepthCell = (rowIndex, columnIndex, value) => {
    setDepthChart((current) => {
      const next = current.map((row, rIndex) => (
        rIndex !== rowIndex ? row : row.map((cell, cIndex) => (cIndex === columnIndex ? normalizeName(value) : cell))
      ));
      depthTemplateSourceGameIdRef.current = String(gameId || "");
      setInheritDepthTemplate(false);
      setDepthTemplate(next);
      return next;
    });
  };

  const resetDepthChart = () => {
    const emptyDepthChart = [0, 1, 2].map(() => POSITION_COLUMNS.map(() => ""));
    depthTemplateSourceGameIdRef.current = String(gameId || "");
    setInheritDepthTemplate(false);
    setDepthChart(emptyDepthChart);
    setDepthTemplate(emptyDepthChart);
  };

  const updateLineupCell = (quarter, minuteIndex, positionIndex, value) => {
    setLineups((current) => {
      lineupHistoryRef.current = [...lineupHistoryRef.current, current].slice(-MAX_LINEUP_HISTORY);
      setUndoDepth(lineupHistoryRef.current.length);
      setInheritDepthTemplate(false);
      return {
        ...current,
        [quarter]: current[quarter].map((row, rIndex) => (
          rIndex !== minuteIndex
            ? row
            : row.map((cell, cIndex) => (cIndex === positionIndex ? normalizeName(value) : cell))
        )),
      };
    });
  };

  const fillLineupRange = (quarter, startMinuteIndex, startPositionIndex, endMinuteIndex, endPositionIndex, value) => {
    const normalizedValue = normalizeName(value);
    if (!normalizedValue) return;
    const minMinute = Math.min(startMinuteIndex, endMinuteIndex);
    const maxMinute = Math.max(startMinuteIndex, endMinuteIndex);
    const minPosition = Math.min(startPositionIndex, endPositionIndex);
    const maxPosition = Math.max(startPositionIndex, endPositionIndex);
    setLineups((current) => {
      lineupHistoryRef.current = [...lineupHistoryRef.current, current].slice(-MAX_LINEUP_HISTORY);
      setUndoDepth(lineupHistoryRef.current.length);
      setInheritDepthTemplate(false);
      return {
        ...current,
        [quarter]: current[quarter].map((row, minuteIndex) => {
          if (minuteIndex < minMinute || minuteIndex > maxMinute) return row;
          return row.map((cell, positionIndex) => (
            positionIndex < minPosition || positionIndex > maxPosition ? cell : normalizedValue
          ));
        }),
      };
    });
  };

  const resetAll = () => {
    setLineups((current) => {
      lineupHistoryRef.current = [...lineupHistoryRef.current, current].slice(-MAX_LINEUP_HISTORY);
      setUndoDepth(lineupHistoryRef.current.length);
      setInheritDepthTemplate(false);
      return createDefaultQuarterLineups();
    });
    setResetModalOpen(false);
  };

  const resetToStarters = () => {
    setLineups((current) => {
      lineupHistoryRef.current = [...lineupHistoryRef.current, current].slice(-MAX_LINEUP_HISTORY);
      setUndoDepth(lineupHistoryRef.current.length);
      setInheritDepthTemplate(false);
      const next = createDefaultQuarterLineups();
      next[1][0] = POSITION_COLUMNS.map((_, columnIndex) => normalizeName(depthChart?.[0]?.[columnIndex] || ""));
      return next;
    });
    setResetModalOpen(false);
  };

  const resetQuarterMinutes = (quarter) => {
    setLineups((current) => {
      lineupHistoryRef.current = [...lineupHistoryRef.current, current].slice(-MAX_LINEUP_HISTORY);
      setUndoDepth(lineupHistoryRef.current.length);
      setInheritDepthTemplate(false);
      return {
        ...current,
        [quarter]: createDefaultQuarterLineups()[quarter],
      };
    });
  };

  const openResetConfirmation = (target) => {
    setConfirmResetTarget(target);
  };

  const closeResetConfirmation = () => {
    setConfirmResetTarget(null);
  };

  const confirmResetAction = () => {
    if (!confirmResetTarget) return;
    if (confirmResetTarget.type === "depth") {
      resetDepthChart();
    } else if (confirmResetTarget.type === "quarter" && Number.isFinite(confirmResetTarget.quarter)) {
      resetQuarterMinutes(confirmResetTarget.quarter);
    }
    setConfirmResetTarget(null);
  };

  const undoLastLineupChange = () => {
    if (!lineupHistoryRef.current.length) return;
    const previous = lineupHistoryRef.current[lineupHistoryRef.current.length - 1];
    lineupHistoryRef.current = lineupHistoryRef.current.slice(0, -1);
    setUndoDepth(lineupHistoryRef.current.length);
    setLineups(previous);
  };

  const handleExportPdf = () => {
    if (typeof window === "undefined") return;
    const logoUrl = new URL(wizardsLogoUrl, window.location.href).href;
    const fontUrl = new URL(dinFontUrl, window.location.href).href;
    const html = buildRotationsPdfHtml({
      headerLine: exportHeaderLine,
      depthChart,
      lineups,
      logoUrl,
      fontUrl,
    });
    const blob = new Blob([html], { type: "text/html" });
    const blobUrl = window.URL.createObjectURL(blob);
    const exportWindow = window.open(blobUrl, "_blank");
    if (!exportWindow) {
      window.URL.revokeObjectURL(blobUrl);
      return;
    }

    const cleanup = () => {
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
    };

    const triggerPrint = () => {
      try {
        exportWindow.focus();
        exportWindow.print();
      } finally {
        cleanup();
      }
    };

    const pollReady = window.setInterval(() => {
      try {
        if (exportWindow.closed) {
          window.clearInterval(pollReady);
          cleanup();
          return;
        }
        if (exportWindow.document?.readyState === "complete") {
          window.clearInterval(pollReady);
          window.setTimeout(triggerPrint, 250);
        }
      } catch {
        window.clearInterval(pollReady);
        cleanup();
      }
    }, 100);
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
    setIsTouchFillActive(false);
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

  const applyRemotePlayers = (payload) => {
    const remoteUpdatedAt = Number(payload?.updatedAt || 0);
    if (!remoteUpdatedAt || remoteUpdatedAt <= playersUpdatedAtRef.current) return;
    const incomingPlayers = normalizePlayers(payload?.players || []);
    setPlayers(incomingPlayers);
    playersUpdatedAtRef.current = remoteUpdatedAt;
    skipPlayersSaveRef.current = true;
    persistPlayers(incomingPlayers, remoteUpdatedAt);
  };

  const applyRemoteDepthTemplate = (payload) => {
    const remoteUpdatedAt = Number(payload?.updatedAt || 0);
    if (!remoteUpdatedAt || remoteUpdatedAt <= depthTemplateUpdatedAtRef.current) return;
    const incomingDepth = normalizeDepthChart(payload?.depthChart);
    setDepthTemplate(incomingDepth);
    depthTemplateUpdatedAtRef.current = remoteUpdatedAt;
    depthTemplateSourceGameIdRef.current = String(payload?.sourceGameId || "");
    skipDepthTemplateSaveRef.current = true;
    persistDepthTemplate(incomingDepth, remoteUpdatedAt, payload?.sourceGameId);
  };

  const applyRemoteGameState = (payload) => {
    const remoteUpdatedAt = Number(payload?.updatedAt || 0);
    if (!remoteUpdatedAt || remoteUpdatedAt <= gameUpdatedAtRef.current) return;
    const incomingDepth = normalizeDepthChart(payload?.state?.depthChart);
    const incomingLineups = normalizeLineups(payload?.state?.lineups);
    lineupHistoryRef.current = [];
    setUndoDepth(0);
    setDepthChart(incomingDepth);
    setLineups(incomingLineups);
    setInheritDepthTemplate(Boolean(payload?.state?.inheritDepthTemplate));
    gameUpdatedAtRef.current = remoteUpdatedAt;
    skipGameSaveRef.current = true;
    persistGameState(
      gameId,
      { depthChart: incomingDepth, lineups: incomingLineups, inheritDepthTemplate: Boolean(payload?.state?.inheritDepthTemplate) },
      remoteUpdatedAt
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

  useEffect(() => {
    const handleTouchMove = (event) => {
      if (!touchFillRef.current.active) return;
      event.preventDefault();
    };
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => window.removeEventListener("touchmove", handleTouchMove);
  }, []);

  useEffect(() => {
    if (!supabase || !gameId) return undefined;
    const channel = supabase
      .channel(`rotations-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: ROTATIONS_TABLE,
          filter: `scope_type=eq.${ROTATIONS_SCOPE_PLAYERS}`,
        },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row || row.scope_key !== ROTATIONS_GLOBAL_SCOPE_KEY) return;
          const parsed = parseSharedStateRow(row);
          applyRemotePlayers({
            updatedAt: parsed.updatedAt,
            players: normalizePlayers(parsed.payload?.players),
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: ROTATIONS_TABLE,
          filter: `scope_type=eq.${ROTATIONS_SCOPE_DEPTH_TEMPLATE}`,
        },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row || row.scope_key !== ROTATIONS_GLOBAL_SCOPE_KEY) return;
          const parsed = parseSharedStateRow(row);
          applyRemoteDepthTemplate({
            updatedAt: parsed.updatedAt,
            depthChart: parsed.payload?.depthChart,
            sourceGameId: parsed.payload?.sourceGameId,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: ROTATIONS_TABLE,
          filter: `scope_type=eq.${ROTATIONS_SCOPE_GAME}`,
        },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row || row.scope_key !== String(gameId)) return;
          const parsed = parseSharedStateRow(row);
          applyRemoteGameState({
            updatedAt: parsed.updatedAt,
            state: normalizeGameState(parsed.payload),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

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
    <div className={`${styles.page} ${isTouchFillActive ? styles.touchFillLock : ""}`}>
      <div className={styles.topRow}>
        <Link className={styles.backButton} to={backUrl}>Back</Link>
        <div className={styles.topRowActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleExportPdf}
          >
            Export PDF
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={undoLastLineupChange}
            disabled={!undoDepth}
          >
            Undo
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setResetModalOpen(true)}>
            Reset Minutes
          </button>
        </div>
      </div>

      {resetModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setResetModalOpen(false)}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>Reset Minutes</h3>
            <button type="button" className={styles.modalPrimary} onClick={resetAll}>
              Reset All
            </button>
            <button type="button" className={styles.modalPrimary} onClick={resetToStarters}>
              Reset to Starters
            </button>
            <button type="button" className={styles.modalSecondary} onClick={() => setResetModalOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmResetTarget && (
        <div className={styles.modalOverlay} onClick={closeResetConfirmation}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>
              {confirmResetTarget.type === "depth"
                ? "Reset Depth Chart?"
                : `Reset Q${confirmResetTarget.quarter} Minutes?`}
            </h3>
            <button type="button" className={styles.modalPrimary} onClick={confirmResetAction}>
              Yes, Reset
            </button>
            <button type="button" className={styles.modalSecondary} onClick={closeResetConfirmation}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
                        value={player.cap}
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
        <div className={styles.sectionHeaderRow}>
          <button type="button" className={styles.sectionHeaderButton} onClick={() => toggleSection("depth")}>
            Depth Chart
          </button>
          <button
            type="button"
            className={styles.sectionHeaderAction}
            onClick={() => openResetConfirmation({ type: "depth" })}
          >
            Reset Depth Chart
          </button>
        </div>
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
            <div className={styles.sectionHeaderRow}>
              <button type="button" className={styles.sectionHeaderButton} onClick={() => toggleSection(sectionKey)}>
                {quarterLabel(quarter)} Quarter
              </button>
              <button
                type="button"
                className={styles.sectionHeaderAction}
                onClick={() => openResetConfirmation({ type: "quarter", quarter })}
              >
                {`Reset Q${quarter} Minutes`}
              </button>
            </div>
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
                                  setIsTouchFillActive(true);
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
