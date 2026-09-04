#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";
import { buildOfficialCallEvent, extractOfficialToken, matchOfficialToken } from "../src/officiatingParser.js";
import { canonicalOfficialIdentity } from "../src/officiatingIdentity.js";

const DEFAULT_SEASON = "2025-26";
const INSERT_BATCH_SIZE = 1000;
const DELETE_BATCH_SIZE = 25;
const OFFICIAL_ASSET_DIR = "src/assets/referees";
const OFFICIAL_NAME_OVERRIDES_BY_ID = {
  101284: "John Goble",
  1627962: "Jacyn Goble",
};
const NBA_REQUEST_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Officiating Importer)",
};

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readListArg(name) {
  const value = readArg(name);
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = await readFile(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) return;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  });
}

async function loadLocalEnv() {
  await loadEnvFile(path.join(process.cwd(), ".env"));
  await loadEnvFile(path.join(process.cwd(), ".env.local"));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: NBA_REQUEST_HEADERS });
  if (!response.ok) throw new Error(`${url} failed (${response.status})`);
  return response.json();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function isAbbreviatedOfficialName(value) {
  return /^[A-Z]\.[A-Za-z' -]+$/.test(cleanText(value));
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeGameId(value) {
  const text = cleanText(value);
  if (/^[124]\d{7}$/.test(text)) return `00${text}`;
  return text;
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function rowFromCsv(headers, line) {
  const values = parseCsvLine(line);
  const row = {};
  headers.forEach((header, index) => {
    row[header] = values[index] ?? "";
  });
  return row;
}

async function archiveFirstFile(archivePath) {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-tf", archivePath]);
    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`tar -tf failed for ${archivePath}: ${errorOutput}`));
        return;
      }
      resolve(output.split(/\r?\n/).find(Boolean));
    });
  });
}

async function streamArchiveCsv(archivePath, onRow) {
  const csvFile = await archiveFirstFile(archivePath);
  if (!csvFile) throw new Error(`No CSV file found in ${archivePath}`);
  const child = spawn("tar", ["-xOf", archivePath, csvFile]);
  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let headers = null;
  let rowCount = 0;
  for await (const line of reader) {
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }
    if (!line) continue;
    rowCount += 1;
    await onRow(rowFromCsv(headers, line), rowCount);
  }
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exitCode !== 0) throw new Error(`tar -xOf failed for ${archivePath}`);
  return rowCount;
}

function splitSeasonStart(season) {
  const match = /^(\d{4})/.exec(cleanText(season));
  return match ? match[1] : "2025";
}

function findNewestDataRoot() {
  const candidates = [process.env.NBA_DATASET_DIR, readArg("dataset-dir")]
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
  if (candidates.length) return candidates[0];
  return "";
}

async function findArchive(datasetDir, filename) {
  const explicit = readArg(filename.replace(/_/g, "-").replace(/\.tar\.xz$/, ""));
  if (explicit) return path.resolve(explicit);
  const root = datasetDir || "/tmp";
  const direct = path.join(root, filename);
  const nested = path.join(root, "datasets", filename);
  if (existsSync(direct)) return direct;
  if (existsSync(nested)) return nested;
  return "";
}

async function loadOfficialAssetNames() {
  const directory = path.resolve(OFFICIAL_ASSET_DIR);
  const entries = await readdir(directory).catch(() => []);
  return entries
    .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
    .map((name) => path.basename(name, path.extname(name)).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((name) => {
      const parts = name.split(/\s+/);
      return {
        personId: "",
        firstName: parts[0] || "",
        familyName: parts.slice(1).join(" "),
        name,
      };
    });
}

function buildTeamMapFromGameRows(rows) {
  const teamsById = new Map();
  rows.forEach((row) => {
    const teamId = cleanText(row.teamId || row.team_id);
    const team = cleanText(row.teamTricode || row.team_tricode).toUpperCase();
    if (teamId && team) teamsById.set(teamId, team);
  });
  return teamsById;
}

async function loadGameMetadata(matchupsArchivePath) {
  const games = new Map();
  if (!matchupsArchivePath || !existsSync(matchupsArchivePath)) return games;
  await streamArchiveCsv(matchupsArchivePath, (row) => {
    const gameId = normalizeGameId(row.game_id);
    if (!gameId || games.has(gameId)) return;
    games.set(gameId, {
      gameId,
      homeTeamId: cleanText(row.home_team_id),
      awayTeamId: cleanText(row.away_team_id),
    });
  });
  return games;
}

async function loadStatsTokenByAction(statsArchivePath) {
  const tokens = new Map();
  if (!statsArchivePath || !existsSync(statsArchivePath)) return tokens;
  await streamArchiveCsv(statsArchivePath, (row) => {
    const token = extractOfficialToken(row.description);
    if (!token) return;
    const gameId = normalizeGameId(row.gameId);
    const actionNumber = cleanText(row.actionNumber);
    if (!gameId || !actionNumber) return;
    tokens.set(`${gameId}|${actionNumber}`, token);
  });
  return tokens;
}

function dominantValues(countsByKey) {
  const values = new Map();
  countsByKey.forEach((counts, key) => {
    let bestValue = "";
    let bestCount = -1;
    counts.forEach((count, value) => {
      if (count > bestCount || (count === bestCount && value.localeCompare(bestValue) < 0)) {
        bestValue = value;
        bestCount = count;
      }
    });
    if (bestValue) values.set(key, bestValue);
  });
  return values;
}

function addCount(map, key, value) {
  if (!key || !value) return;
  if (!map.has(key)) map.set(key, new Map());
  const counts = map.get(key);
  counts.set(value, (counts.get(value) || 0) + 1);
}

function resolveFullName(token, officialAssetNames) {
  const match = matchOfficialToken(token, officialAssetNames);
  if (match.official) return match.official.name || `${match.official.firstName} ${match.official.familyName}`.trim();
  return "";
}

function actionFromCdnRow(row) {
  return {
    actionNumber: numericOrNull(row.actionNumber),
    orderNumber: numericOrNull(row.orderNumber),
    period: numericOrNull(row.period),
    clock: cleanText(row.clock),
    timeActual: cleanText(row.timeActual),
    actionType: cleanText(row.actionType),
    subType: cleanText(row.subType),
    descriptor: cleanText(row.descriptor),
    description: cleanText(row.description),
    officialId: cleanText(row.officialId),
    teamId: cleanText(row.teamId),
    teamTricode: cleanText(row.teamTricode).toUpperCase(),
    personId: cleanText(row.personId),
    playerName: cleanText(row.playerName),
    foulDrawnPersonId: cleanText(row.foulDrawnPersonId),
    foulDrawnPlayerName: cleanText(row.foulDrawnPlayerName),
    foulPersonalTotal: numericOrNull(row.foulPersonalTotal),
    foulTechnicalTotal: numericOrNull(row.foulTechnicalTotal),
    turnoverTotal: numericOrNull(row.turnoverTotal),
    side: cleanText(row.side),
    xLegacy: numericOrNull(row.xLegacy),
    yLegacy: numericOrNull(row.yLegacy),
    area: cleanText(row.area),
    areaDetail: cleanText(row.areaDetail),
  };
}

function actionFromLiveAction(action) {
  return {
    ...action,
    officialId: cleanText(action.officialId),
    teamTricode: cleanText(action.teamTricode).toUpperCase(),
  };
}

function normalizeGameDate(row) {
  const actual = cleanText(row.timeActual);
  return actual ? actual.slice(0, 10) : null;
}

async function loadCdnCalledEvents({ cdnArchivePath, statsTokenByAction, officialNameById, gameMetadata, season, seasonType, maxGames = 0 }) {
  const rowsByGame = new Map();
  const teamRowsByGame = new Map();
  let rawRows = 0;
  await streamArchiveCsv(cdnArchivePath, (row) => {
    rawRows += 1;
    const gameId = normalizeGameId(row.gameId);
    if (!gameId) return;
    if (!teamRowsByGame.has(gameId)) teamRowsByGame.set(gameId, []);
    teamRowsByGame.get(gameId).push(row);
    if (!cleanText(row.officialId)) return;
    if (!["foul", "violation", "turnover"].includes(cleanText(row.actionType).toLowerCase())) return;
    if (!rowsByGame.has(gameId)) rowsByGame.set(gameId, []);
    rowsByGame.get(gameId).push(row);
  });

  const events = [];
  const gameEntries = [...rowsByGame.entries()].slice(0, maxGames || rowsByGame.size);
  gameEntries.forEach(([gameId, rows]) => {
    const teamMap = buildTeamMapFromGameRows(teamRowsByGame.get(gameId) || rows);
    const meta = gameMetadata.get(gameId) || {};
    const homeTeam = teamMap.get(meta.homeTeamId) || "";
    const awayTeam = teamMap.get(meta.awayTeamId) || "";
    const teams = [...new Set([...teamMap.values()].filter(Boolean))];
    const fallbackHome = homeTeam || teams[0] || "";
    const fallbackAway = awayTeam || teams.find((team) => team !== fallbackHome) || "";
    rows.forEach((row) => {
      const action = actionFromCdnRow(row);
      const token = statsTokenByAction.get(`${gameId}|${cleanText(row.actionNumber)}`) || "";
      const event = buildOfficialCallEvent(action, {
        officials: [],
        officialNameById,
        gameId,
        gameDate: normalizeGameDate(row),
        season,
        seasonType,
        homeTeam: fallbackHome,
        awayTeam: fallbackAway,
      });
      if (!event) return;
      events.push({
        ...event,
        officialToken: token || event.officialToken,
        sourcePayload: {
          ...event.sourcePayload,
          officialToken: token,
          ingestSource: "cdnnba",
        },
      });
    });
  });

  return { events, rawRows };
}

function gameOfficialsFromLiveBoxscore(game = {}) {
  return (Array.isArray(game.officials) ? game.officials : []).map((official) => ({
    personId: cleanText(official.personId || official.officialId),
    firstName: cleanText(official.firstName),
    familyName: cleanText(official.familyName || official.lastName),
    name: [official.firstName, official.familyName || official.lastName].filter(Boolean).join(" ").trim(),
  }));
}

async function loadLiveCalledEvents({ gameIds, season }) {
  const events = [];
  for (const gameId of gameIds) {
    const [pbpPayload, boxscorePayload] = await Promise.all([
      fetchJson(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${encodeURIComponent(gameId)}.json`),
      fetchJson(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${encodeURIComponent(gameId)}.json`),
    ]);
    const game = pbpPayload.game || {};
    const boxscoreGame = boxscorePayload.game || {};
    const actions = Array.isArray(game.actions) ? game.actions : [];
    const officials = gameOfficialsFromLiveBoxscore(boxscoreGame);
    const homeTeam = cleanText(boxscoreGame.homeTeam?.teamTricode || game.homeTeam?.teamTricode).toUpperCase();
    const awayTeam = cleanText(boxscoreGame.awayTeam?.teamTricode || game.awayTeam?.teamTricode).toUpperCase();
    actions
      .filter((action) => cleanText(action.officialId))
      .forEach((action) => {
        const event = buildOfficialCallEvent(actionFromLiveAction(action), {
          officials,
          gameId,
          gameDate: cleanText(game.gameDate || game.gameEt || boxscoreGame.gameDate || boxscoreGame.gameEt).slice(0, 10),
          season,
          seasonType: gameId.startsWith("004") ? "Playoffs" : gameId.startsWith("001") ? "Preseason" : "Regular Season",
          homeTeam,
          awayTeam,
        });
        if (!event) return;
        events.push({
          ...event,
          sourcePayload: {
            ...event.sourcePayload,
            ingestSource: "cdnnba_live",
          },
        });
      });
  }
  return events;
}

function toCallRow(event) {
  const identity = canonicalOfficialIdentity({
    officialId: event.officialId,
    officialName: event.officialName,
  });
  return {
    season: event.season,
    season_type: event.seasonType,
    game_id: event.gameId,
    game_date: event.gameDate ? event.gameDate.slice(0, 10) : null,
    home_team: event.homeTeam,
    away_team: event.awayTeam,
    period: event.period,
    game_clock: event.gameClock,
    action_number: event.actionNumber,
    order_number: event.orderNumber,
    action_type: event.actionType,
    sub_type: event.subType,
    descriptor: event.descriptor,
    description: event.description,
    official_token: event.officialToken,
    official_id: identity.officialId,
    official_name: identity.officialName,
    team_id: event.teamId,
    team_tricode: event.teamTricode,
    player_id: event.playerId,
    player_name: event.playerName,
    primary_category: event.primaryCategory,
    secondary_category: event.secondaryCategory,
    charged_team: event.chargedTeam,
    benefiting_team: event.benefitingTeam,
    confidence: event.confidence,
    confidence_reason: event.confidenceReason,
    area: event.sourcePayload?.area || "",
    area_detail: event.sourcePayload?.areaDetail || "",
    source_payload: event.sourcePayload,
  };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function duplicateNaturalKeys(rows) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = `${row.game_id}|${row.action_number ?? ""}`;
    if (!row.game_id || row.action_number == null) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.values()].filter((count) => count > 1).length;
}

function canonicalizeOfficialIds(rows) {
  const counts = new Map();
  rows.forEach((row) => {
    const name = cleanText(row.official_name);
    const id = cleanText(row.official_id);
    if (!name || !id) return;
    if (isAbbreviatedOfficialName(name)) return;
    const nameKey = name.toLowerCase();
    const key = `${nameKey}|${id}`;
    const current = counts.get(key) || {
      nameKey,
      officialName: name,
      officialId: id,
      calls: 0,
      games: new Set(),
    };
    current.calls += 1;
    current.games.add(row.game_id);
    counts.set(key, current);
  });

  const canonicalByName = new Map();
  counts.forEach((entry) => {
    const current = canonicalByName.get(entry.nameKey);
    if (
      !current ||
      entry.games.size > current.games.size ||
      (entry.games.size === current.games.size && entry.calls > current.calls) ||
      (entry.games.size === current.games.size && entry.calls === current.calls && entry.officialId.localeCompare(current.officialId) > 0)
    ) {
      canonicalByName.set(entry.nameKey, entry);
    }
  });

  return rows.map((row) => {
    const canonical = canonicalByName.get(cleanText(row.official_name).toLowerCase());
    if (!canonical) return row;
    return {
      ...row,
      official_id: canonical.officialId,
      official_name: canonical.officialName,
    };
  });
}

function createSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function applyCallRows(rows) {
  const supabase = createSupabaseClient();
  const gameIds = [...new Set(rows.map((row) => row.game_id).filter(Boolean))];
  const rawArchiveGameIds = gameIds
    .filter((gameId) => /^00[124]\d{7}$/.test(gameId))
    .map((gameId) => gameId.slice(2));
  const deleteGameIds = [...new Set([...gameIds, ...rawArchiveGameIds])];
  for (const chunk of chunkArray(deleteGameIds, DELETE_BATCH_SIZE)) {
    const { error } = await supabase
      .from("nba_official_call_events")
      .delete()
      .in("game_id", chunk);
    if (error) throw new Error(`Failed deleting existing official call rows: ${error.message}`);
  }
  let inserted = 0;
  for (const chunk of chunkArray(rows, INSERT_BATCH_SIZE)) {
    const { error } = await supabase
      .from("nba_official_call_events")
      .insert(chunk);
    if (error) throw new Error(`Failed inserting official call rows: ${error.message}`);
    inserted += chunk.length;
    process.stdout.write(`Inserted ${inserted}/${rows.length}\r`);
  }
  if (rows.length) process.stdout.write("\n");
  return inserted;
}

async function archiveExists(archivePath) {
  if (!archivePath) return false;
  const info = await stat(archivePath).catch(() => null);
  return Boolean(info?.isFile());
}

async function main() {
  await assertOutsideWizardsGameWindow("cdnnba official-call import");
  await loadLocalEnv();
  const season = readArg("season") || DEFAULT_SEASON;
  const seasonStart = readArg("season-start") || splitSeasonStart(season);
  const maxGames = Number(readArg("max-games")) || 0;
  const datasetDir = readArg("dataset-dir") || findNewestDataRoot();
  const includePlayoffs = !hasFlag("regular-only");
  const apply = hasFlag("apply");
  const officialAssetNames = await loadOfficialAssetNames();
  const liveGameIds = readListArg("live-game-ids").map(normalizeGameId);
  const regularLiveGameIds = liveGameIds.filter((gameId) => !gameId.startsWith("001"));
  if (regularLiveGameIds.length !== liveGameIds.length) {
    console.warn("Ignoring preseason live game IDs for official-call import.");
  }
  const sets = [
    {
      seasonType: "Regular Season",
      cdn: await findArchive(datasetDir, `cdnnba_${seasonStart}.tar.xz`),
      stats: await findArchive(datasetDir, `nbastatsv3_${seasonStart}.tar.xz`),
      matchups: await findArchive(datasetDir, `matchups_${seasonStart}.tar.xz`),
    },
  ];
  if (includePlayoffs) {
    sets.push({
      seasonType: "Playoffs",
      cdn: await findArchive(datasetDir, `cdnnba_po_${seasonStart}.tar.xz`),
      stats: await findArchive(datasetDir, `nbastatsv3_po_${seasonStart}.tar.xz`),
      matchups: await findArchive(datasetDir, `matchups_po_${seasonStart}.tar.xz`),
    });
  }

  const usableSets = [];
  for (const set of sets) {
    if (!(await archiveExists(set.cdn))) {
      console.warn(`Skipping ${set.seasonType}: missing cdnnba archive.`);
      continue;
    }
    usableSets.push(set);
  }
  if (!usableSets.length) {
    throw new Error("No cdnnba archives found. Pass --dataset-dir=/path/to/nba_data/datasets.");
  }

  const allRows = [];
  const audit = [];
  for (const set of usableSets) {
    console.log(`Reading ${set.seasonType} archives...`);
    const statsTokenByAction = await loadStatsTokenByAction(set.stats);
    const officialTokenCountsById = new Map();
    await streamArchiveCsv(set.cdn, (row) => {
      const officialId = cleanText(row.officialId);
      if (!officialId) return;
      const token = statsTokenByAction.get(`${normalizeGameId(row.gameId)}|${cleanText(row.actionNumber)}`);
      addCount(officialTokenCountsById, officialId, token);
    });
    const officialTokenById = dominantValues(officialTokenCountsById);
    const officialNameById = new Map();
    officialTokenById.forEach((token, officialId) => {
      officialNameById.set(officialId, OFFICIAL_NAME_OVERRIDES_BY_ID[officialId] || resolveFullName(token, officialAssetNames) || token);
    });
    const gameMetadata = await loadGameMetadata(set.matchups);
    const { events, rawRows } = await loadCdnCalledEvents({
      cdnArchivePath: set.cdn,
      statsTokenByAction,
      officialNameById,
      gameMetadata,
      season,
      seasonType: set.seasonType,
      maxGames,
    });
    const rows = events.map(toCallRow);
    allRows.push(...rows);
    audit.push({
      seasonType: set.seasonType,
      rawRows,
      actionTokens: statsTokenByAction.size,
      officialIds: officialNameById.size,
      games: new Set(rows.map((row) => row.game_id)).size,
      rows: rows.length,
      rowsWithName: rows.filter((row) => row.official_name).length,
      rowsWithBenefitingTeam: rows.filter((row) => row.benefiting_team).length,
      categories: rows.reduce((counts, row) => {
        counts[row.primary_category] = (counts[row.primary_category] || 0) + 1;
        return counts;
      }, {}),
    });
  }

  if (regularLiveGameIds.length) {
    console.log(`Reading ${regularLiveGameIds.length} live cdnnba games...`);
    const liveEvents = await loadLiveCalledEvents({ gameIds: regularLiveGameIds, season });
    const liveRows = liveEvents.map(toCallRow);
    allRows.push(...liveRows);
    audit.push({
      seasonType: "Live Supplement",
      rawRows: null,
      actionTokens: null,
      officialIds: new Set(liveRows.map((row) => row.official_id)).size,
      games: new Set(liveRows.map((row) => row.game_id)).size,
      rows: liveRows.length,
      rowsWithName: liveRows.filter((row) => row.official_name).length,
      rowsWithBenefitingTeam: liveRows.filter((row) => row.benefiting_team).length,
      categories: liveRows.reduce((counts, row) => {
        counts[row.primary_category] = (counts[row.primary_category] || 0) + 1;
        return counts;
      }, {}),
    });
  }

  const canonicalRows = canonicalizeOfficialIds(allRows);
  const summary = {
    season,
    mode: apply ? "apply" : "dry-run",
    totalRows: canonicalRows.length,
    totalGames: new Set(canonicalRows.map((row) => row.game_id)).size,
    duplicateGameActionKeys: duplicateNaturalKeys(canonicalRows),
    rowsWithName: canonicalRows.filter((row) => row.official_name).length,
    rowsWithBenefitingTeam: canonicalRows.filter((row) => row.benefiting_team).length,
    seasonTypes: audit,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (apply) {
    const inserted = await applyCallRows(canonicalRows);
    console.log(`Applied cdnnba official call backfill: ${inserted} rows.`);
  } else {
    console.log("Dry run only. Re-run with --apply to replace nba_official_call_events for these games.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
