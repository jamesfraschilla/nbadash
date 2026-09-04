#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  incompleteGameIds,
  recentCompletedDateKeys,
  selectCompletedScheduleGames,
} from "../src/officiatingNightlyIngestion.js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

const CURRENT_SEASON = "2026-27";
const SEASON_START = Date.parse("2026-10-03T00:00:00-04:00");
const SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json";

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = await readFile(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) return;
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key]) return;
    process.env[key] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  });
}

function easternHour() {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()));
}

async function fetchSchedule() {
  const response = await fetch(SCHEDULE_URL, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.nba.com/schedule",
      "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Nightly Officiating Import)",
    },
  });
  if (!response.ok) throw new Error(`NBA schedule request failed (${response.status})`);
  return response.json();
}

async function selectAllRows(supabase, table, columns, gameIds) {
  if (!gameIds.length) return [];
  const rows = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in("game_id", gameIds)
      .range(start, start + pageSize - 1);
    if (error) throw new Error(`Failed checking ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function runImporter(gameIds) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/backfill-officiating-2025-26.mjs",
      `--season=${CURRENT_SEASON}`,
      `--game-ids=${gameIds.join(",")}`,
      "--concurrency=3",
      "--apply",
      "--require-complete",
    ], { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Nightly importer exited with code ${code}`));
    });
  });
}

async function main() {
  await loadEnvFile(path.join(process.cwd(), ".env"));
  await loadEnvFile(path.join(process.cwd(), ".env.local"));
  if (!hasFlag("force-time") && easternHour() !== 4) {
    console.log("Skipping: nightly officiating ingestion only runs during the 4:00 AM America/New_York hour.");
    return;
  }
  if (!hasFlag("force-season") && Date.now() < SEASON_START) {
    console.log(`Skipping: ${CURRENT_SEASON} ingestion starts October 3, 2026.`);
    return;
  }
  await assertOutsideWizardsGameWindow("nightly officiating ingestion");

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const lookbackDays = Math.max(1, Number(readArg("lookback-days")) || 3);
  const dateKeys = recentCompletedDateKeys({ lookbackDays });
  const schedule = await fetchSchedule();
  const completedGames = selectCompletedScheduleGames(schedule, {
    season: CURRENT_SEASON,
    dateKeys,
  });
  if (!completedGames.length) {
    console.log(`No completed non-preseason games found for ${dateKeys.join(", ")}.`);
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const gameIds = completedGames.map((game) => game.gameId);
  const [assignments, calls] = await Promise.all([
    selectAllRows(supabase, "nba_official_game_assignments", "game_id,is_alternate", gameIds),
    selectAllRows(supabase, "nba_official_call_events", "game_id", gameIds),
  ]);
  const pendingGameIds = hasFlag("refresh-all")
    ? gameIds
    : incompleteGameIds(completedGames, assignments, calls);
  if (!pendingGameIds.length) {
    console.log(`All ${completedGames.length} recently completed games are already complete.`);
    return;
  }

  console.log(`Importing ${pendingGameIds.length} completed games: ${pendingGameIds.join(", ")}`);
  await runImporter(pendingGameIds);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
