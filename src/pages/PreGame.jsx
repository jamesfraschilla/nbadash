import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fetchGame } from "../api.js";
import { supabase } from "../supabaseClient.js";
import wizardsLogoUrl from "../assets/WWizards_Primary_Icon.png";
import dinFontUrl from "../assets/fonts/DIN.ttf";
import styles from "./PreGame.module.css";

const PLAYERS_STORAGE_KEY = "pregame:players:v1";
const SLOT_STORAGE_PREFIX = "pregame:slots:v1:";
const SLOT_TEMPLATE_KEY = "pregame:slot-template:v1";
const PREGAME_GLOBAL_PLAYERS_GAME_ID = "9999999901";
const PREGAME_GLOBAL_TEMPLATE_GAME_ID = "9999999902";
const PREGAME_ACTION_PAYLOAD = 900000001;

const EXPORT_SPECS = {
  portrait: { logicalWidth: 384, logicalHeight: 648, outputWidth: 1536, outputHeight: 2592 },
  landscape: { logicalWidth: 660, logicalHeight: 510, outputWidth: 3300, outputHeight: 2550 },
  was: { outputWidth: 3840, outputHeight: 2160, boxX: 0, boxY: 0, boxWidth: 802, boxHeight: 1300 },
};

let exportFontsPromise = null;

function readThemeMode() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getExportColors(themeMode) {
  const dark = themeMode === "dark";
  return {
    background: dark ? "#000000" : "#ffffff",
    chromeText: dark ? "#ffffff" : "#000000",
    timeBg: "#000000",
    timeText: "#ffffff",
    cellBg: "#d3d3d3",
    cellText: "#000000",
    border: "#e5e7eb",
  };
}

function normalizePlayerName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getLastName(name) {
  const parts = normalizePlayerName(name).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : "";
}

function sortPlayersByLastName(players) {
  return [...players].sort((a, b) => {
    const aLast = getLastName(a.name);
    const bLast = getLastName(b.name);
    if (aLast !== bLast) return aLast.localeCompare(bLast);
    return normalizePlayerName(a.name).localeCompare(normalizePlayerName(b.name));
  });
}

function safeParseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizePlayers(rawPlayers) {
  return sortPlayersByLastName(
    (Array.isArray(rawPlayers) ? rawPlayers : [])
      .map((player) => ({
        id: String(player?.id || crypto.randomUUID()),
        name: normalizePlayerName(player?.name || ""),
        display: normalizePlayerName(player?.display || ""),
      }))
      .filter((player) => player.name && player.display)
  );
}

function normalizeSlots(rawSlots) {
  return (Array.isArray(rawSlots) ? rawSlots : [])
    .map((slot) => ({
      id: String(slot?.id || crypto.randomUUID()),
      time: String(slot?.time || ""),
      playerIds: Array.isArray(slot?.playerIds)
        ? slot.playerIds.slice(0, 3).map((value) => String(value || ""))
        : ["", ""],
    }))
    .filter((slot) => slot.time);
}

function normalizeTemplate(rawTemplate) {
  const count = Math.max(1, Number(rawTemplate?.count || 8));
  const playerGroups = Array.isArray(rawTemplate?.playerGroups)
    ? rawTemplate.playerGroups.map((group) => (Array.isArray(group) ? group.slice(0, 3).map((value) => String(value || "")) : ["", ""]))
    : [];
  return { count, playerGroups };
}

function slotsHaveAssignments(slots) {
  return (Array.isArray(slots) ? slots : []).some((slot) =>
    (Array.isArray(slot?.playerIds) ? slot.playerIds : []).some((id) => String(id || "").trim())
  );
}

function parseRemotePayload(note, key) {
  const parsed = safeParseJson(note || "{}", null);
  if (!parsed) return { updatedAt: 0, value: null };
  if (Array.isArray(parsed)) return { updatedAt: 0, value: parsed };
  if (typeof parsed !== "object") return { updatedAt: 0, value: null };
  const updatedAt = Number(parsed.updatedAt || 0);
  if (parsed[key] != null) return { updatedAt, value: parsed[key] };
  if (parsed.value != null) return { updatedAt, value: parsed.value };
  return { updatedAt, value: parsed };
}

function loadPlayers() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(PLAYERS_STORAGE_KEY);
  if (!raw) return [];
  const parsed = safeParseJson(raw, []);
  return normalizePlayers(Array.isArray(parsed) ? parsed : parsed?.players);
}

function persistPlayers(players, updatedAt = Date.now()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify({
    updatedAt,
    players: sortPlayersByLastName(players),
  }));
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

function slotStorageKey(gameId) {
  return `${SLOT_STORAGE_PREFIX}${gameId}`;
}

function loadSlots(gameId) {
  if (typeof window === "undefined" || !gameId) return null;
  const raw = window.localStorage.getItem(slotStorageKey(gameId));
  if (!raw) return null;
  const parsed = safeParseJson(raw, null);
  const slots = normalizeSlots(Array.isArray(parsed) ? parsed : parsed?.slots);
  return slots.length ? slots : null;
}

function persistSlots(gameId, slots, updatedAt = Date.now()) {
  if (typeof window === "undefined" || !gameId) return;
  window.localStorage.setItem(slotStorageKey(gameId), JSON.stringify({
    updatedAt,
    slots,
  }));
}

function loadSlotsPayload(gameId) {
  if (typeof window === "undefined" || !gameId) return null;
  const raw = window.localStorage.getItem(slotStorageKey(gameId));
  if (!raw) return null;
  const parsed = safeParseJson(raw, null);
  if (Array.isArray(parsed)) {
    return { updatedAt: 0, slots: normalizeSlots(parsed) };
  }
  if (!parsed || typeof parsed !== "object") return null;
  return {
    updatedAt: Number(parsed.updatedAt || 0),
    slots: normalizeSlots(parsed.slots),
  };
}

function loadSlotTemplate() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SLOT_TEMPLATE_KEY);
  if (!raw) return null;
  const parsed = safeParseJson(raw, null);
  if (Array.isArray(parsed?.playerGroups) || Number.isFinite(parsed?.count)) {
    return normalizeTemplate(parsed);
  }
  if (parsed && typeof parsed === "object" && parsed.template) {
    return normalizeTemplate(parsed.template);
  }
  return null;
}

function persistSlotTemplate(slots, updatedAt = Date.now()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SLOT_TEMPLATE_KEY, JSON.stringify({
    updatedAt,
    template: {
      count: Math.max(1, slots.length),
      playerGroups: slots.map((slot) => slot.playerIds.slice(0, 3)),
    },
  }));
}

function loadTemplatePayload() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SLOT_TEMPLATE_KEY);
  if (!raw) return null;
  const parsed = safeParseJson(raw, null);
  if (parsed && typeof parsed === "object" && parsed.template) {
    return {
      updatedAt: Number(parsed.updatedAt || 0),
      template: normalizeTemplate(parsed.template),
    };
  }
  if (parsed && typeof parsed === "object") {
    return {
      updatedAt: 0,
      template: normalizeTemplate(parsed),
    };
  }
  return null;
}

async function fetchRemotePlayers() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("pbp_highlights")
    .select("note")
    .eq("game_id", PREGAME_GLOBAL_PLAYERS_GAME_ID)
    .eq("action_number", PREGAME_ACTION_PAYLOAD)
    .maybeSingle();
  if (error) return null;
  const payload = parseRemotePayload(data?.note, "players");
  return {
    updatedAt: payload.updatedAt,
    players: normalizePlayers(payload.value),
  };
}

async function fetchRemoteSchedule(gameId) {
  if (!supabase || !gameId) return null;
  const { data, error } = await supabase
    .from("pbp_highlights")
    .select("note")
    .eq("game_id", String(gameId))
    .eq("action_number", PREGAME_ACTION_PAYLOAD)
    .maybeSingle();
  if (error) return null;
  const payload = parseRemotePayload(data?.note, "slots");
  return {
    updatedAt: payload.updatedAt,
    slots: normalizeSlots(payload.value),
  };
}

async function fetchRemoteTemplate() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("pbp_highlights")
    .select("note")
    .eq("game_id", PREGAME_GLOBAL_TEMPLATE_GAME_ID)
    .eq("action_number", PREGAME_ACTION_PAYLOAD)
    .maybeSingle();
  if (error) return null;
  const payload = parseRemotePayload(data?.note, "template");
  return {
    updatedAt: payload.updatedAt,
    template: normalizeTemplate(payload.value),
  };
}

async function saveRemotePlayers(players, updatedAt = Date.now()) {
  if (!supabase) return;
  await supabase.from("pbp_highlights").upsert(
    {
      game_id: PREGAME_GLOBAL_PLAYERS_GAME_ID,
      action_number: PREGAME_ACTION_PAYLOAD,
      note: JSON.stringify({
        updatedAt,
        players: sortPlayersByLastName(players),
      }),
    },
    { onConflict: "game_id,action_number" }
  );
}

async function saveRemoteSchedule(gameId, slots, updatedAt = Date.now()) {
  if (!supabase || !gameId) return;
  await supabase.from("pbp_highlights").upsert(
    {
      game_id: String(gameId),
      action_number: PREGAME_ACTION_PAYLOAD,
      note: JSON.stringify({
        updatedAt,
        slots,
      }),
    },
    { onConflict: "game_id,action_number" }
  );
}

async function saveRemoteTemplate(slots, updatedAt = Date.now()) {
  if (!supabase) return;
  await supabase.from("pbp_highlights").upsert(
    {
      game_id: PREGAME_GLOBAL_TEMPLATE_GAME_ID,
      action_number: PREGAME_ACTION_PAYLOAD,
      note: JSON.stringify({
        updatedAt,
        template: {
          count: Math.max(1, slots.length),
          playerGroups: slots.map((slot) => slot.playerIds.slice(0, 3)),
        },
      }),
    },
    { onConflict: "game_id,action_number" }
  );
}

function formatTime(dateValue) {
  return format(dateValue, "h:mm");
}

function parseGameStart(game) {
  const utcValue = game?.gameTimeUTC;
  const etValue = game?.gameEt;
  const candidates = [utcValue, etValue].filter(Boolean);
  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function buildDefaultSlots(game, count = 8) {
  const start = parseGameStart(game);
  const finalSlot = new Date(start.getTime() - (45 * 60 * 1000));
  const firstSlot = new Date(finalSlot.getTime() - ((count - 1) * 15 * 60 * 1000));
  return Array.from({ length: count }, (_, index) => {
    const slotTime = new Date(firstSlot.getTime() + (index * 15 * 60 * 1000));
    return {
      id: crypto.randomUUID(),
      time: formatTime(slotTime),
      playerIds: ["", ""],
    };
  });
}

function buildSlotsFromTemplate(game, template) {
  const count = Math.max(1, Number(template?.count || 8));
  const seeded = buildDefaultSlots(game, count);
  return seeded.map((slot, index) => ({
    ...slot,
    playerIds: Array.isArray(template?.playerGroups?.[index])
      ? template.playerGroups[index].slice(0, 3).map((value) => String(value || ""))
      : ["", ""],
  }));
}

function ensureExportFonts() {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return Promise.resolve();
  }
  if (exportFontsPromise) return exportFontsPromise;

  const loadFont = async (family, url) => {
    const loaded = Array.from(document.fonts || []).some((face) => face.family === family);
    if (loaded) return;
    const fontFace = new FontFace(family, `url(${url})`);
    await fontFace.load();
    document.fonts.add(fontFace);
  };

  exportFontsPromise = loadFont("DIN", dinFontUrl).then(() => undefined).catch(() => undefined);
  return exportFontsPromise;
}

function makeCanvas(width, height, background) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

function drawCenteredText(context, text, x, y, width, size, color, weight = 700) {
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.font = `${weight} ${size}px "DIN", sans-serif`;
  context.fillText(text, x + (width / 2), y);
}

function drawCenteredTextMiddle(context, text, x, y, width, height, size, color, weight = 700) {
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${weight} ${size}px "DIN", sans-serif`;
  context.fillText(text, x + (width / 2), y + (height / 2));
}

function drawLandscapeExport(slots, playerById, headerLineTwo, logoImage, themeMode, scale = 1) {
  const spec = EXPORT_SPECS.landscape;
  const colors = getExportColors(themeMode);
  const { canvas, context } = makeCanvas(spec.logicalWidth * scale, spec.logicalHeight * scale, colors.background);
  context.scale(scale, scale);

  drawCenteredText(context, "PRE-GAME COURT TIME", 0, 42, spec.logicalWidth, 54, colors.chromeText, 700);
  drawCenteredText(context, headerLineTwo, 0, 108, spec.logicalWidth, 30, colors.chromeText, 700);

  const tableX = 12;
  const tableY = 172;
  const tableWidth = spec.logicalWidth - 24;
  const colCount = Math.max(1, slots.length);
  const colWidth = tableWidth / colCount;
  const timeHeight = 60;
  const rowHeight = 76;

  slots.forEach((slot, index) => {
    const x = tableX + (index * colWidth);
    context.fillStyle = colors.timeBg;
    context.fillRect(x, tableY, colWidth, timeHeight);
    context.strokeStyle = colors.border;
    context.strokeRect(x, tableY, colWidth, timeHeight);
    drawCenteredTextMiddle(context, slot.time, x, tableY, colWidth, timeHeight, 26, colors.timeText, 700);

    const row1Y = tableY + timeHeight;
    const row2Y = row1Y + rowHeight;
    context.fillStyle = colors.cellBg;
    context.fillRect(x, row1Y, colWidth, rowHeight);
    context.fillRect(x, row2Y, colWidth, rowHeight);
    context.strokeRect(x, row1Y, colWidth, rowHeight);
    context.strokeRect(x, row2Y, colWidth, rowHeight);

    const displays = slot.playerIds.slice(0, 3).map((id) => playerById.get(id)?.display || "");
    const first = displays[0] || "";
    const rest = displays.slice(1).filter(Boolean);
    if (first) {
      drawCenteredTextMiddle(context, first.toUpperCase(), x, row1Y, colWidth, rowHeight, 24, colors.cellText, 700);
    }
    if (rest.length) {
      const restText = rest.join("  ").toUpperCase();
      drawCenteredTextMiddle(context, restText, x, row2Y, colWidth, rowHeight, 24, colors.cellText, 700);
    }
  });

  if (logoImage) {
    const size = 40;
    const y = tableY + timeHeight + (rowHeight * 2) + 26;
    const x = (spec.logicalWidth - size) / 2;
    context.drawImage(logoImage, x, y, size, size);
  }

  return canvas;
}

function drawPortraitExport(slots, playerById, headerLineTwo, logoImage, themeMode, scale = 1) {
  const spec = EXPORT_SPECS.portrait;
  const colors = getExportColors(themeMode);
  const { canvas, context } = makeCanvas(spec.logicalWidth * scale, spec.logicalHeight * scale, colors.background);
  context.scale(scale, scale);

  drawCenteredText(context, "PRE-GAME COURT TIME", 0, 36, spec.logicalWidth, 44, colors.chromeText, 700);
  drawCenteredText(context, headerLineTwo.replace("@", "vs"), 0, 86, spec.logicalWidth, 27, colors.chromeText, 700);

  const tableX = 30;
  const tableY = 132;
  const tableWidth = spec.logicalWidth - 60;
  const timeColWidth = 72;
  const playerColWidth = (tableWidth - timeColWidth) / 2;
  const rowCount = Math.max(1, slots.length);
  const rowHeight = Math.floor((spec.logicalHeight - tableY - 104) / rowCount);

  slots.forEach((slot, index) => {
    const y = tableY + (index * rowHeight);

    context.fillStyle = colors.timeBg;
    context.fillRect(tableX, y, timeColWidth, rowHeight);
    context.strokeStyle = colors.border;
    context.strokeRect(tableX, y, timeColWidth, rowHeight);
    drawCenteredTextMiddle(context, slot.time, tableX, y, timeColWidth, rowHeight, 24, colors.timeText, 700);

    const x1 = tableX + timeColWidth;
    const x2 = x1 + playerColWidth;
    const displays = slot.playerIds.slice(0, 3).map((id) => playerById.get(id)?.display || "");
    const presentCount = displays.filter(Boolean).length;

    if (slot.playerIds.length >= 3 && presentCount >= 3) {
      context.fillStyle = colors.cellBg;
      context.fillRect(x1, y, playerColWidth * 2, rowHeight);
      context.strokeRect(x1, y, playerColWidth * 2, rowHeight);
      const lineHeight = 24;
      const totalHeight = lineHeight * 3;
      const startY = y + ((rowHeight - totalHeight) / 2);
      displays.slice(0, 3).forEach((name, idx) => {
        drawCenteredTextMiddle(
          context,
          name.toUpperCase(),
          x1,
          startY + (idx * lineHeight),
          playerColWidth * 2,
          lineHeight,
          24,
          colors.cellText,
          700
        );
      });
      return;
    }

    context.fillStyle = colors.cellBg;
    context.fillRect(x1, y, playerColWidth, rowHeight);
    context.fillRect(x2, y, playerColWidth, rowHeight);
    context.strokeRect(x1, y, playerColWidth, rowHeight);
    context.strokeRect(x2, y, playerColWidth, rowHeight);

    if (displays[0]) {
      drawCenteredTextMiddle(context, displays[0].toUpperCase(), x1, y, playerColWidth, rowHeight, 24, colors.cellText, 700);
    }
    const rest = displays.slice(1).filter(Boolean);
    if (rest.length) {
      const restText = rest.join("  ").toUpperCase();
      drawCenteredTextMiddle(context, restText, x2, y, playerColWidth, rowHeight, 24, colors.cellText, 700);
    }
  });

  if (logoImage) {
    const size = 36;
    const x = (spec.logicalWidth - size) / 2;
    const y = spec.logicalHeight - 82;
    context.drawImage(logoImage, x, y, size, size);
  }

  return canvas;
}

function fitInside(source, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / source.width, targetHeight / source.height);
  return {
    width: source.width * scale,
    height: source.height * scale,
  };
}

async function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = filename;
  link.click();
}

function isWashingtonTeam(team) {
  const tricode = String(team?.teamTricode || "").toUpperCase();
  const name = `${team?.teamCity || ""} ${team?.teamName || ""}`.toLowerCase();
  return tricode === "WAS" || name.includes("washington") || name.includes("wizards");
}

function buildHeaderLine(game) {
  const home = game?.homeTeam;
  const away = game?.awayTeam;
  const washingtonIsAway = isWashingtonTeam(away);
  const opponent = washingtonIsAway ? home : away;
  const rawCity = String(opponent?.teamCity || "").trim();
  const rawName = String(opponent?.teamName || "").trim();
  const lowerName = rawName.toLowerCase();
  let opponentLabel = rawCity ? rawCity.toUpperCase() : "OPPONENT";
  if (rawCity.toLowerCase() === "la" || rawCity.toLowerCase() === "los angeles") {
    if (lowerName.includes("clipper")) opponentLabel = "LA CLIPPERS";
    if (lowerName.includes("laker")) opponentLabel = "LA LAKERS";
  }
  return washingtonIsAway ? `@ ${opponentLabel}` : `vs ${opponentLabel}`;
}

export default function PreGame() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const dateParam = params.get("d");
  const backUrl = dateParam ? `/g/${gameId}?d=${dateParam}` : `/g/${gameId}`;

  const { data: game, isLoading, error } = useQuery({
    queryKey: ["game-pregame", gameId],
    queryFn: () => fetchGame(gameId),
    enabled: Boolean(gameId),
  });

  const [players, setPlayers] = useState(() => loadPlayers());
  const [slots, setSlots] = useState([]);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [playerDrafts, setPlayerDrafts] = useState({});
  const [newPlayerDraft, setNewPlayerDraft] = useState({ name: "", display: "" });
  const [slotDrafts, setSlotDrafts] = useState([]);
  const [inlineTimeSlotId, setInlineTimeSlotId] = useState(null);
  const [inlineTimeDraft, setInlineTimeDraft] = useState("");
  const [activePlayerCell, setActivePlayerCell] = useState(null);
  const [playersHydrated, setPlayersHydrated] = useState(false);
  const [slotsHydrated, setSlotsHydrated] = useState(false);
  const playersUpdatedAtRef = useRef(0);
  const slotsUpdatedAtRef = useRef(0);
  const templateUpdatedAtRef = useRef(0);

  const { data: remotePlayers, isFetched: remotePlayersFetched } = useQuery({
    queryKey: ["pregame-players-remote"],
    queryFn: fetchRemotePlayers,
    enabled: Boolean(supabase),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const { data: remoteSchedule, isFetched: remoteScheduleFetched } = useQuery({
    queryKey: ["pregame-schedule-remote", gameId],
    queryFn: () => fetchRemoteSchedule(gameId),
    enabled: Boolean(supabase && gameId),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const { data: remoteTemplate, isFetched: remoteTemplateFetched } = useQuery({
    queryKey: ["pregame-template-remote"],
    queryFn: fetchRemoteTemplate,
    enabled: Boolean(supabase),
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const washingtonGame = useMemo(() => (
    isWashingtonTeam(game?.homeTeam) || isWashingtonTeam(game?.awayTeam)
  ), [game]);

  useEffect(() => {
    setPlayersHydrated(false);
    setSlotsHydrated(false);
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
    } else if (localPayload?.players?.length) {
      setPlayers(localPayload.players);
      playersUpdatedAtRef.current = localUpdatedAt;
    } else if (remotePlayers?.players?.length) {
      setPlayers(remotePlayers.players);
      playersUpdatedAtRef.current = remoteUpdatedAt;
    }
    setPlayersHydrated(true);
  }, [playersHydrated, remotePlayers, remotePlayersFetched]);

  useEffect(() => {
    if (slotsHydrated) return;
    if (!gameId || !game) return;
    if (supabase && (!remoteScheduleFetched || !remoteTemplateFetched)) return;

    const localSchedulePayload = loadSlotsPayload(gameId);
    const localScheduleUpdatedAt = Number(localSchedulePayload?.updatedAt || 0);
    const remoteScheduleUpdatedAt = Number(remoteSchedule?.updatedAt || 0);
    const localTemplatePayload = loadTemplatePayload();
    const localTemplateUpdatedAt = Number(localTemplatePayload?.updatedAt || 0);
    const remoteTemplateUpdatedAt = Number(remoteTemplate?.updatedAt || 0);
    const selectedTemplate = remoteTemplateUpdatedAt >= localTemplateUpdatedAt
      ? remoteTemplate?.template
      : localTemplatePayload?.template;
    const templateHasAssignments = slotsHaveAssignments(
      selectedTemplate?.playerGroups?.map((playerIds) => ({ playerIds })) || []
    );

    const remoteHasAssignments = slotsHaveAssignments(remoteSchedule?.slots);
    const localHasAssignments = slotsHaveAssignments(localSchedulePayload?.slots);

    if (
      remoteSchedule?.slots?.length &&
      remoteScheduleUpdatedAt >= localScheduleUpdatedAt &&
      (remoteHasAssignments || !templateHasAssignments)
    ) {
      setSlots(remoteSchedule.slots);
      slotsUpdatedAtRef.current = remoteScheduleUpdatedAt;
      setSlotsHydrated(true);
      return;
    }

    if (localSchedulePayload?.slots?.length && (localHasAssignments || !templateHasAssignments)) {
      setSlots(localSchedulePayload.slots);
      slotsUpdatedAtRef.current = localScheduleUpdatedAt;
      setSlotsHydrated(true);
      return;
    }

    if (selectedTemplate) {
      setSlots(buildSlotsFromTemplate(game, selectedTemplate));
      templateUpdatedAtRef.current = Math.max(localTemplateUpdatedAt, remoteTemplateUpdatedAt);
      slotsUpdatedAtRef.current = templateUpdatedAtRef.current;
    } else {
      setSlots(buildDefaultSlots(game));
      slotsUpdatedAtRef.current = Date.now();
    }
    setSlotsHydrated(true);
  }, [
    gameId,
    game,
    remoteSchedule,
    remoteTemplate,
    slotsHydrated,
    remoteScheduleFetched,
    remoteTemplateFetched,
  ]);

  useEffect(() => {
    if (!playersHydrated) return;
    const updatedAt = Date.now();
    playersUpdatedAtRef.current = updatedAt;
    persistPlayers(players, updatedAt);
    saveRemotePlayers(players, updatedAt);
  }, [players, playersHydrated]);

  useEffect(() => {
    if (!slotsHydrated || !gameId || !slots.length) return;
    const updatedAt = Date.now();
    slotsUpdatedAtRef.current = updatedAt;
    templateUpdatedAtRef.current = updatedAt;
    persistSlots(gameId, slots, updatedAt);
    persistSlotTemplate(slots, updatedAt);
    saveRemoteSchedule(gameId, slots, updatedAt);
    saveRemoteTemplate(slots, updatedAt);
  }, [gameId, slots, slotsHydrated]);

  useEffect(() => {
    if (!playersHydrated) return;
    const remoteUpdatedAt = Number(remotePlayers?.updatedAt || 0);
    if (!remoteUpdatedAt || remoteUpdatedAt <= playersUpdatedAtRef.current) return;
    setPlayers(remotePlayers.players || []);
    playersUpdatedAtRef.current = remoteUpdatedAt;
    persistPlayers(remotePlayers.players || [], remoteUpdatedAt);
  }, [playersHydrated, remotePlayers]);

  useEffect(() => {
    if (!slotsHydrated || !gameId || !remoteSchedule?.slots?.length) return;
    const remoteUpdatedAt = Number(remoteSchedule?.updatedAt || 0);
    if (!remoteUpdatedAt || remoteUpdatedAt <= slotsUpdatedAtRef.current) return;
    setSlots(remoteSchedule.slots);
    slotsUpdatedAtRef.current = remoteUpdatedAt;
    persistSlots(gameId, remoteSchedule.slots, remoteUpdatedAt);
  }, [slotsHydrated, gameId, remoteSchedule]);

  const sortedPlayers = useMemo(() => sortPlayersByLastName(players), [players]);
  const playerById = useMemo(() => new Map(sortedPlayers.map((player) => [player.id, player])), [sortedPlayers]);
  const headerLineTwo = useMemo(() => buildHeaderLine(game), [game]);
  const tableTypeScale = useMemo(() => {
    const slotCount = Math.max(1, slots.length || 1);
    if (slotCount >= 12) return { time: "24px", player: "20px", lineGap: "3px" };
    if (slotCount >= 10) return { time: "30px", player: "24px", lineGap: "4px" };
    if (slotCount >= 8) return { time: "36px", player: "30px", lineGap: "6px" };
    if (slotCount >= 6) return { time: "42px", player: "35px", lineGap: "7px" };
    return { time: "48px", player: "40px", lineGap: "9px" };
  }, [slots.length]);

  const openSlotsEditor = () => {
    setSlotDrafts(slots.map((slot) => ({ ...slot, playerIds: [...slot.playerIds] })));
    setSlotsOpen(true);
  };

  const updateSlotById = (slotId, updater) => {
    setSlots((current) => current.map((slot) => (slot.id === slotId ? updater(slot) : slot)));
  };

  const handleSavePlayer = (playerId, draft) => {
    const name = normalizePlayerName(draft?.name);
    const display = normalizePlayerName(draft?.display);
    if (!name || !display) return;
    setPlayers((current) => sortPlayersByLastName(current.map((player) => (
      player.id === playerId ? { ...player, name, display } : player
    ))));
    setEditingPlayerId(null);
  };

  const handleDeletePlayer = (playerId) => {
    setPlayers((current) => current.filter((player) => player.id !== playerId));
    setSlots((current) => current.map((slot) => ({
      ...slot,
      playerIds: slot.playerIds.map((id) => (id === playerId ? "" : id)),
    })));
    setEditingPlayerId(null);
  };

  const handleAddPlayer = () => {
    const name = normalizePlayerName(newPlayerDraft.name);
    const display = normalizePlayerName(newPlayerDraft.display);
    if (!name || !display) return;
    setPlayers((current) => sortPlayersByLastName([
      ...current,
      { id: crypto.randomUUID(), name, display },
    ]));
    setNewPlayerDraft({ name: "", display: "" });
  };

  const handleExport = async (formatKey) => {
    await ensureExportFonts();
    const themeMode = readThemeMode();
    const logoImage = await loadImage(wizardsLogoUrl);

    const portraitScale = EXPORT_SPECS.portrait.outputWidth / EXPORT_SPECS.portrait.logicalWidth;
    const landscapeScale = EXPORT_SPECS.landscape.outputWidth / EXPORT_SPECS.landscape.logicalWidth;

    const portraitCanvas = drawPortraitExport(slots, playerById, headerLineTwo, logoImage, themeMode, portraitScale);

    if (formatKey === "portrait") {
      downloadCanvas(portraitCanvas, `pregame-${gameId}-portrait.png`);
      setExportOpen(false);
      return;
    }

    if (formatKey === "landscape") {
      const landscapeCanvas = drawLandscapeExport(
        slots,
        playerById,
        headerLineTwo,
        logoImage,
        themeMode,
        landscapeScale
      );
      downloadCanvas(landscapeCanvas, `pregame-${gameId}-landscape.png`);
      setExportOpen(false);
      return;
    }

    const wasSpec = EXPORT_SPECS.was;
    const colors = getExportColors(themeMode);
    const { canvas, context } = makeCanvas(wasSpec.outputWidth, wasSpec.outputHeight, "#ffffff");
    context.fillStyle = colors.background;
    context.fillRect(wasSpec.boxX, wasSpec.boxY, wasSpec.boxWidth, wasSpec.boxHeight);
    const fitted = fitInside(portraitCanvas, wasSpec.boxWidth, wasSpec.boxHeight);
    const drawX = wasSpec.boxX + ((wasSpec.boxWidth - fitted.width) / 2);
    const drawY = wasSpec.boxY + ((wasSpec.boxHeight - fitted.height) / 2);
    context.drawImage(portraitCanvas, drawX, drawY, fitted.width, fitted.height);
    downloadCanvas(canvas, `pregame-${gameId}-was.png`);
    setExportOpen(false);
  };

  if (isLoading) {
    return <div className={styles.stateMessage}>Loading pre-game schedule...</div>;
  }

  if (error || !game) {
    return <div className={styles.stateMessage}>Unable to load pre-game schedule.</div>;
  }

  if (!washingtonGame) {
    return (
      <div className={styles.page}>
        <div className={styles.topRow}>
          <Link className={styles.backButton} to={backUrl}>Back</Link>
        </div>
        <div className={styles.stateMessage}>Pre-Game is available only for Washington games.</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link className={styles.backButton} to={backUrl}>Back</Link>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>PRE-GAME COURT TIME</h1>
        <div className={styles.subtitle}>{headerLineTwo}</div>
      </header>

      <section
        className={styles.tableWrap}
        style={{
          "--pregame-time-font-size": tableTypeScale.time,
          "--pregame-player-font-size": tableTypeScale.player,
          "--pregame-cell-line-gap": tableTypeScale.lineGap,
        }}
      >
        <table className={styles.scheduleTable}>
          <thead>
            <tr>
              {slots.map((slot) => (
                <th key={`time-${slot.id}`} className={styles.timeCell}>
                  {inlineTimeSlotId === slot.id ? (
                    <input
                      autoFocus
                      className={styles.inlineTimeInput}
                      value={inlineTimeDraft}
                      onChange={(event) => setInlineTimeDraft(event.target.value)}
                      onBlur={() => {
                        updateSlotById(slot.id, (current) => ({ ...current, time: inlineTimeDraft.trim() || current.time }));
                        setInlineTimeSlotId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          updateSlotById(slot.id, (current) => ({ ...current, time: inlineTimeDraft.trim() || current.time }));
                          setInlineTimeSlotId(null);
                        }
                        if (event.key === "Escape") {
                          setInlineTimeSlotId(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.cellButton}
                      onClick={() => {
                        setInlineTimeSlotId(slot.id);
                        setInlineTimeDraft(slot.time);
                      }}
                    >
                      {slot.time}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {slots.map((slot) => {
                const displays = slot.playerIds.slice(0, 3).map((id) => playerById.get(id)?.display || "");
                const hasThree = slot.playerIds.length >= 3;
                if (hasThree) {
                  return (
                    <td key={`merged-${slot.id}`} className={styles.playerCellMerged} rowSpan={2}>
                      {activePlayerCell?.slotId === slot.id && activePlayerCell?.index === "merged" ? (
                        <div className={styles.inlinePlayerEditor}>
                          {[0, 1, 2].map((playerIndex) => (
                            <select
                              key={`${slot.id}-merged-${playerIndex}`}
                              className={styles.inlineSelect}
                              value={slot.playerIds[playerIndex] || ""}
                              onChange={(event) => {
                                const nextId = event.target.value;
                                updateSlotById(slot.id, (current) => {
                                  const next = [...current.playerIds];
                                  next[playerIndex] = nextId;
                                  return { ...current, playerIds: next };
                                });
                                setActivePlayerCell(null);
                              }}
                              onBlur={() => setActivePlayerCell(null)}
                            >
                              <option value="">--</option>
                              {sortedPlayers.map((player) => (
                                <option key={player.id} value={player.id}>{player.name}</option>
                              ))}
                            </select>
                          ))}
                        </div>
                      ) : (
                        <button type="button" className={styles.cellButton} onClick={() => setActivePlayerCell({ slotId: slot.id, index: "merged" })}>
                          {displays.filter(Boolean).map((name, idx) => (
                            <div key={`${slot.id}-${idx}`} className={styles.nameLine}>{name.toUpperCase()}</div>
                          ))}
                        </button>
                      )}
                    </td>
                  );
                }

                return (
                  <td key={`slot-top-${slot.id}`} className={styles.playerCell}>
                    {activePlayerCell?.slotId === slot.id && activePlayerCell?.index === 0 ? (
                      <select
                        autoFocus
                        className={styles.inlineSelect}
                        value={slot.playerIds[0] || ""}
                        onChange={(event) => {
                          const nextId = event.target.value;
                          updateSlotById(slot.id, (current) => {
                            const next = [...current.playerIds];
                            next[0] = nextId;
                            return { ...current, playerIds: next };
                          });
                          setActivePlayerCell(null);
                        }}
                        onBlur={() => setActivePlayerCell(null)}
                      >
                        <option value="">--</option>
                        {sortedPlayers.map((player) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                    ) : (
                      <button type="button" className={styles.cellButton} onClick={() => setActivePlayerCell({ slotId: slot.id, index: 0 })}>
                        {(displays[0] || "").toUpperCase()}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              {slots.map((slot) => {
                const displays = slot.playerIds.slice(0, 3).map((id) => playerById.get(id)?.display || "");
                if (slot.playerIds.length >= 3) return null;
                return (
                  <td key={`slot-bottom-${slot.id}`} className={styles.playerCell}>
                    {activePlayerCell?.slotId === slot.id && activePlayerCell?.index === 1 ? (
                      <select
                        autoFocus
                        className={styles.inlineSelect}
                        value={slot.playerIds[1] || ""}
                        onChange={(event) => {
                          const nextId = event.target.value;
                          updateSlotById(slot.id, (current) => {
                            const next = [...current.playerIds];
                            next[1] = nextId;
                            return { ...current, playerIds: next };
                          });
                          setActivePlayerCell(null);
                        }}
                        onBlur={() => setActivePlayerCell(null)}
                      >
                        <option value="">--</option>
                        {sortedPlayers.map((player) => (
                          <option key={player.id} value={player.id}>{player.name}</option>
                        ))}
                      </select>
                    ) : (
                      <button type="button" className={styles.cellButton} onClick={() => setActivePlayerCell({ slotId: slot.id, index: 1 })}>
                        {(displays[1] || "").toUpperCase()}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </section>

      <div className={styles.bottomRow}>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={openSlotsEditor}>Edit Slots</button>
          <button type="button" className={styles.actionButton} onClick={() => setPlayersOpen(true)}>Edit Players</button>
          <button type="button" className={styles.actionButton} onClick={() => setExportOpen(true)}>Export</button>
        </div>
      </div>

      {playersOpen && (
        <div className={styles.modalOverlay} onClick={() => setPlayersOpen(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Edit Players</h2>
              <button type="button" className={styles.modalClose} onClick={() => setPlayersOpen(false)}>Close</button>
            </div>
            <div className={styles.gridHeader}>
              <span>Name</span>
              <span>Display</span>
              <span>Actions</span>
            </div>
            <div className={styles.playerRows}>
              {sortedPlayers.map((player) => {
                const isEditing = editingPlayerId === player.id;
                const draft = playerDrafts[player.id] || { name: player.name, display: player.display };
                return (
                  <div key={player.id} className={styles.playerRow}>
                    {isEditing ? (
                      <>
                        <input
                          className={styles.textInput}
                          value={draft.name}
                          onChange={(event) => setPlayerDrafts((current) => ({
                            ...current,
                            [player.id]: { ...draft, name: event.target.value },
                          }))}
                        />
                        <input
                          className={styles.textInput}
                          value={draft.display}
                          onChange={(event) => setPlayerDrafts((current) => ({
                            ...current,
                            [player.id]: { ...draft, display: event.target.value },
                          }))}
                        />
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={`${styles.iconButton} ${styles.iconSave}`}
                            onClick={() => handleSavePlayer(player.id, draft)}
                            aria-label="Save player"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className={`${styles.iconButton} ${styles.iconDelete}`}
                            onClick={() => handleDeletePlayer(player.id)}
                            aria-label="Delete player"
                          >
                            ✕
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={styles.readCell}>{player.name}</div>
                        <div className={styles.readCell}>{player.display}</div>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => {
                              setEditingPlayerId(player.id);
                              setPlayerDrafts((current) => ({
                                ...current,
                                [player.id]: { name: player.name, display: player.display },
                              }));
                            }}
                            aria-label="Edit player"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className={`${styles.iconButton} ${styles.iconDelete}`}
                            onClick={() => handleDeletePlayer(player.id)}
                            aria-label="Delete player"
                          >
                            ✕
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              <div className={styles.playerRow}>
                <input
                  className={styles.textInput}
                  value={newPlayerDraft.name}
                  onChange={(event) => setNewPlayerDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Player name"
                />
                <input
                  className={styles.textInput}
                  value={newPlayerDraft.display}
                  onChange={(event) => setNewPlayerDraft((current) => ({ ...current, display: event.target.value }))}
                  placeholder="Nickname / initials"
                />
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.iconSave}`}
                    onClick={handleAddPlayer}
                    aria-label="Add player"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.iconDelete}`}
                    onClick={() => setNewPlayerDraft({ name: "", display: "" })}
                    aria-label="Clear new player"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.doneButton} onClick={() => setPlayersOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {slotsOpen && (
        <div className={styles.modalOverlay} onClick={() => setSlotsOpen(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Edit Slots</h2>
              <button type="button" className={styles.modalClose} onClick={() => setSlotsOpen(false)}>Close</button>
            </div>
            <div className={styles.addSlotTop}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => {
                  const first = slotDrafts[0];
                  const fallback = "4:30";
                  const firstTime = first?.time || fallback;
                  const [hours, minutes] = firstTime.split(":").map((value) => Number(value));
                  const timeDate = new Date();
                  timeDate.setHours(Number.isFinite(hours) ? hours : 4, Number.isFinite(minutes) ? minutes : 30, 0, 0);
                  const added = new Date(timeDate.getTime() - (15 * 60 * 1000));
                  setSlotDrafts((current) => [
                    { id: crypto.randomUUID(), time: formatTime(added), playerIds: ["", ""] },
                    ...current,
                  ]);
                }}
                aria-label="Add slot above first"
              >
                +
              </button>
            </div>

            <div className={styles.slotHeaderRow}>
              <span />
              <span className={styles.slotHeaderTime}>Time</span>
              <button
                type="button"
                className={styles.resetButton}
                onClick={() => setSlotDrafts((current) => current.map((slot) => ({
                  ...slot,
                  playerIds: ["", ""],
                })))}
              >
                RESET
              </button>
              <span />
            </div>

            <div className={styles.slotRows}>
              {slotDrafts.map((slot, index) => (
                <div key={slot.id} className={styles.slotRow}>
                  <button
                    type="button"
                    className={styles.slotDeleteButton}
                    onClick={() => setSlotDrafts((current) => current.filter((candidate) => candidate.id !== slot.id))}
                    aria-label="Delete slot"
                  >
                    ✕
                  </button>
                  <div className={styles.slotTimeColumn}>
                    <input
                      className={styles.timeInput}
                      value={slot.time}
                      onChange={(event) => setSlotDrafts((current) => current.map((candidate, candidateIndex) => (
                        candidateIndex === index ? { ...candidate, time: event.target.value } : candidate
                      )))}
                    />
                  </div>
                  <div className={styles.slotPlayerColumn}>
                    {slot.playerIds.map((playerId, playerIndex) => (
                      <div key={`${slot.id}-${playerIndex}`} className={styles.slotPlayerRow}>
                        <select
                          className={styles.selectInput}
                          value={playerId}
                          onChange={(event) => {
                            const nextId = event.target.value;
                            setSlotDrafts((current) => current.map((candidate, candidateIndex) => {
                              if (candidateIndex !== index) return candidate;
                              const nextPlayerIds = [...candidate.playerIds];
                              nextPlayerIds[playerIndex] = nextId;
                              return { ...candidate, playerIds: nextPlayerIds };
                            }));
                          }}
                        >
                          <option value="">--</option>
                          {sortedPlayers.map((player) => (
                            <option key={player.id} value={player.id}>{player.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={styles.slotClearPlayerButton}
                          onClick={() => setSlotDrafts((current) => current.map((candidate, candidateIndex) => {
                            if (candidateIndex !== index) return candidate;
                            const nextPlayerIds = [...candidate.playerIds];
                            nextPlayerIds.splice(playerIndex, 1);
                            while (nextPlayerIds.length < 2) nextPlayerIds.push("");
                            return { ...candidate, playerIds: nextPlayerIds };
                          }))}
                          aria-label="Delete player slot"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setSlotDrafts((current) => current.map((candidate, candidateIndex) => {
                      if (candidateIndex !== index) return candidate;
                      if (candidate.playerIds.length >= 3) return candidate;
                      return { ...candidate, playerIds: [...candidate.playerIds, ""] };
                    }))}
                    aria-label="Add player dropdown"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.doneButton}
                onClick={() => {
                  setSlots(slotDrafts.map((slot) => ({
                    ...slot,
                    playerIds: slot.playerIds.slice(0, 3),
                  })));
                  setSlotsOpen(false);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.exportModal}>
            <h2 className={styles.modalTitle}>Export</h2>
            <button type="button" className={styles.doneButton} onClick={() => handleExport("portrait")}>Portrait</button>
            <button type="button" className={styles.doneButton} onClick={() => handleExport("landscape")}>Landscape</button>
            <button type="button" className={styles.doneButton} onClick={() => handleExport("was")}>WAS</button>
            <button type="button" className={styles.modalCancel} onClick={() => setExportOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
