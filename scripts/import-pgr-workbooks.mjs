#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parsePgrWorkbook, summarizePgrEvaluations } from "../src/pgrWorkbook.js";

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const DEFAULT_SEASON = "2025-26";
const WIZARDS_TEAM_ID = "1610612764";
const WIZARDS_TRICODE = "WAS";

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
  const repoRoot = process.cwd();
  await loadEnvFile(path.join(repoRoot, ".env"));
  await loadEnvFile(path.join(repoRoot, ".env.local"));
}

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function positionalArgs() {
  return process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
}

async function expandWorkbookPaths(inputs) {
  const files = [];
  for (const input of inputs) {
    const resolved = path.resolve(input);
    const info = await stat(resolved);
    if (info.isDirectory()) {
      const names = await readdir(resolved);
      names
        .filter((name) => /\.xlsx?$/i.test(name) && !name.startsWith("~$"))
        .sort((left, right) => left.localeCompare(right))
        .forEach((name) => files.push(path.join(resolved, name)));
    } else if (/\.xlsx?$/i.test(resolved) && !path.basename(resolved).startsWith("~$")) {
      files.push(resolved);
    }
  }
  return [...new Set(files)];
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: "https://www.nba.com",
      Referer: "https://www.nba.com/",
      "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard PGR Importer)",
    },
  });
  if (!response.ok) throw new Error(`${url} failed (${response.status})`);
  return response.json();
}

function teamTricode(team) {
  return String(team?.teamTricode || team?.teamAbbreviation || team?.triCode || "").trim().toUpperCase();
}

function teamId(team) {
  return String(team?.teamId || team?.id || "").trim();
}

function normalizeGameMetadata(gameId, game) {
  const homeTeam = game?.homeTeam || {};
  const awayTeam = game?.awayTeam || {};
  const home = teamTricode(homeTeam);
  const away = teamTricode(awayTeam);
  const isWizardsGame = home === WIZARDS_TRICODE
    || away === WIZARDS_TRICODE
    || teamId(homeTeam) === WIZARDS_TEAM_ID
    || teamId(awayTeam) === WIZARDS_TEAM_ID;
  return {
    game_id: String(game?.gameId || gameId || "").trim(),
    game_date: String(game?.gameDate || game?.gameEt || "").slice(0, 10),
    home_team: home,
    away_team: away,
    matchup: [away, home].filter(Boolean).join(" @ "),
    season_type: String(game?.seasonType || "").trim(),
    is_wizards_game: isWizardsGame,
    source_payload: game || {},
  };
}

async function resolveGame(gameId) {
  const game = await fetchJson(`${API_BASE}/games/${encodeURIComponent(gameId)}`);
  return normalizeGameMetadata(gameId, game);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    return [
      error.message,
      error.details,
      error.hint,
      error.code,
    ].filter(Boolean).join(" | ") || JSON.stringify(error);
  }
  return String(error);
}

function payloadForImport(report, { filename, fileHash, season, game, mode }) {
  return {
    mode,
    schema_version: report.schema_version,
    filename,
    file_hash: fileHash,
    worksheet_name: report.worksheet_name,
    season,
    game_id: report.game_id,
    game,
    row_count: report.row_count,
    event_count: report.event_count,
    possession_count: report.possession_count,
    warnings: report.warnings,
    errors: report.errors,
    source_payload: report.source_payload,
    possessions: report.possessions,
    events: report.events,
    evaluations: report.evaluations,
  };
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function isWizardsTeam(value) {
  return ["WAS", "WASHINGTON", "WASHINGTON WIZARDS", "WIZARDS"].includes(String(value || "").trim().toUpperCase());
}

function buildPgrSummaryPayload(evaluations) {
  const buckets = {
    all: [],
    wizards_for: [],
    wizards_against: [],
  };
  evaluations.forEach((row) => {
    buckets.all.push(row);
    if (isWizardsTeam(row.opponent_team)) buckets.wizards_for.push(row);
    if (isWizardsTeam(row.player_team)) buckets.wizards_against.push(row);
  });
  return Object.fromEntries(Object.entries(buckets).map(([scope, rows]) => {
    const count = (predicate) => rows.filter(predicate).length;
    return [scope, {
      evaluations: rows.length,
      infractions: count((row) => row.player_action_code === "INF"),
      judgment_calls: count((row) => ["PI", "PII"].includes(row.player_action_code)),
      calls: count((row) => row.call_or_no_call === "C"),
      no_calls: count((row) => row.call_or_no_call === "NC"),
      called_no_infraction: count((row) => row.call_or_no_call === "C" && row.player_action_code === "NI"),
      called_assessment_error: count((row) => row.call_or_no_call === "C" && ["BCA", "WPA", "SFA", "PFA", "TTFE"].includes(row.player_action_code)),
      missed_infractions: count((row) => row.call_or_no_call === "NC" && row.player_action_code === "INF"),
      missed_potential_infractions: count((row) => row.call_or_no_call === "NC" && ["PI", "PII"].includes(row.player_action_code)),
    }];
  }));
}

async function insertRows(supabase, table, rows, size = 500) {
  for (const chunk of chunkRows(rows, size)) {
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

async function directServiceImport(supabase, report, { filename, fileHash, season, game, mode }) {
  const existing = await supabase
    .from("nba_pgr_imports")
    .select("id,game_id")
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data && mode !== "replace") {
    return {
      status: "duplicate",
      import_id: existing.data.id,
      game_id: existing.data.game_id,
      message: "This exact PGR workbook has already been imported.",
    };
  }

  if (mode === "replace") {
    const deleteResult = await supabase.from("nba_pgr_imports").delete().eq("game_id", report.game_id);
    if (deleteResult.error) throw deleteResult.error;
  }

  const importInsert = await supabase
    .from("nba_pgr_imports")
    .insert({
      season,
      game_id: report.game_id,
      game_date: game.game_date || null,
      home_team: game.home_team || "",
      away_team: game.away_team || "",
      filename,
      file_hash: fileHash,
      worksheet_name: report.worksheet_name,
      status: "imported",
      row_count: report.row_count,
      possession_count: report.possession_count,
      event_count: report.event_count,
      summary_payload: buildPgrSummaryPayload(report.evaluations),
      warnings: report.warnings || [],
      errors: report.errors || [],
      schema_version: report.schema_version,
      source_payload: report.source_payload || {},
    })
    .select("id,game_id,row_count,event_count,possession_count")
    .single();
  if (importInsert.error) throw importInsert.error;
  const importId = importInsert.data.id;

  try {
    await insertRows(supabase, "nba_pgr_possessions", report.possessions.map((row) => ({
      import_id: importId,
      season,
      game_id: report.game_id,
      pos_id: row.pos_id,
      period_name: row.period_name,
      first_game_clock: row.first_game_clock,
      last_game_clock: row.last_game_clock,
      evaluation_count: row.evaluation_count || 0,
      event_count: row.event_count || 0,
      source_payload: row.source_payload || {},
    })));

    await insertRows(supabase, "nba_pgr_events", report.events.map((row) => ({
      import_id: importId,
      season,
      game_id: report.game_id,
      pos_id: row.pos_id,
      event_id: row.event_id,
      period_name: row.period_name,
      period: row.period,
      game_clock: row.game_clock,
      call_type_name: row.call_type_name,
      play_type_name: row.play_type_name,
      video_url: row.video_url,
      evaluation_count: row.evaluation_count || 0,
      source_payload: row.source_payload || {},
    })));

    await insertRows(supabase, "nba_pgr_evaluations", report.evaluations.map((row) => ({
      import_id: importId,
      season,
      game_id: report.game_id,
      pos_id: row.pos_id,
      event_id: row.event_id,
      rating_seq_no: row.rating_seq_no,
      period_name: row.period_name,
      period: row.period,
      game_clock: row.game_clock,
      call_type_name: row.call_type_name,
      play_type_name: row.play_type_name,
      infraction_type_name: row.infraction_type_name,
      player_name: row.player_name,
      player_team: row.player_team,
      opponent_name: row.opponent_name,
      opponent_team: row.opponent_team,
      player_action_code: row.player_action_code,
      player_action_label: row.player_action_label,
      infraction_rating_name: row.infraction_rating_name,
      call_or_no_call: row.call_or_no_call,
      call_or_no_call_label: row.call_or_no_call_label,
      call_comment: row.call_comment,
      plr_comment: row.plr_comment,
      ogr_flag: row.ogr_flag,
      ptiw_flag: row.ptiw_flag,
      video_url: row.video_url,
      raw_row: row.raw_row || {},
    })));
  } catch (error) {
    await supabase.from("nba_pgr_imports").delete().eq("id", importId).catch(() => {});
    throw error;
  }

  return {
    status: "imported",
    import_id: importId,
    game_id: report.game_id,
    row_count: report.row_count,
    event_count: report.event_count,
    possession_count: report.possession_count,
  };
}

function isRpcServiceAuthError(error) {
  return String(error?.message || "").includes("Authentication is required to import PGR reports");
}

function createSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function importFile(supabase, filePath, { season, mode, dryRun }) {
  const body = await readFile(filePath);
  const filename = path.basename(filePath);
  const report = await parsePgrWorkbook(body, { filename });
  const summary = summarizePgrEvaluations(report.evaluations);
  if (report.errors.length) throw new Error(report.errors.join(" "));

  const game = await resolveGame(report.game_id);
  if (!game.is_wizards_game) {
    throw new Error(`${report.game_id} is not a Wizards game (${game.matchup || "unknown matchup"}).`);
  }

  const result = {
    filename,
    game_id: report.game_id,
    matchup: game.matchup,
    rows: report.row_count,
    events: report.event_count,
    possessions: report.possession_count,
    calls: summary.calls,
    no_calls: summary.noCalls,
    warnings: report.warnings,
  };

  if (dryRun) return { ...result, status: "dry-run" };

  const importOptions = {
    filename,
    fileHash: sha256(body),
    season,
    game,
    mode,
  };
  const { data, error } = await supabase.rpc("nba_import_pgr_report", {
    report_payload: payloadForImport(report, {
      filename,
      fileHash: importOptions.fileHash,
      season,
      game,
      mode,
    }),
  });
  if (error && isRpcServiceAuthError(error)) {
    const fallback = await directServiceImport(supabase, report, importOptions);
    return { ...result, status: fallback?.status || "imported", import_id: fallback?.import_id || "" };
  }
  if (error) throw error;
  return { ...result, status: data?.status || "imported", import_id: data?.import_id || "" };
}

async function main() {
  await loadLocalEnv();
  const season = readArg("season") || DEFAULT_SEASON;
  const mode = hasFlag("replace") ? "replace" : "create";
  const dryRun = hasFlag("dry-run");
  const inputs = positionalArgs();
  if (!inputs.length) {
    throw new Error("Usage: node scripts/import-pgr-workbooks.mjs [--season=2025-26] [--replace] [--dry-run] <file-or-directory> [...]");
  }

  const files = await expandWorkbookPaths(inputs);
  if (!files.length) throw new Error("No .xlsx/.xls files found.");
  const supabase = dryRun ? null : createSupabaseClient();

  let imported = 0;
  let failed = 0;
  for (const filePath of files) {
    try {
      const result = await importFile(supabase, filePath, { season, mode, dryRun });
      if (result.status !== "duplicate") imported += 1;
      console.log(JSON.stringify(result));
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        filename: path.basename(filePath),
        status: "failed",
        error: errorMessage(error),
      }));
    }
  }

  if (failed) {
    throw new Error(`PGR import finished with ${failed} failed file(s) and ${imported} imported/non-duplicate file(s).`);
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
