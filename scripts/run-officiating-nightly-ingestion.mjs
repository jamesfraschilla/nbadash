#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
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

function runImporter(gameIds) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/backfill-officiating-2025-26.mjs",
      `--season=${CURRENT_SEASON}`,
      `--game-ids=${gameIds.join(",")}`,
      "--concurrency=3",
      "--skip-stats-playbyplay",
      "--apply",
      "--require-complete",
      "--allow-incomplete-preseason",
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
  // Retry outstanding dates even when GitHub's scheduled runner starts late.
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
    console.log(`No completed games found for ${dateKeys.join(", ")}.`);
    return;
  }

  const gameIds = completedGames.map((game) => game.gameId);
  // Reconcile every recently completed game on each run. Assignments, challenge
  // outcomes, and replay metadata can all be corrected after the first posting.
  const pendingGameIds = gameIds;

  console.log(`Importing ${pendingGameIds.length} completed games: ${pendingGameIds.join(", ")}`);
  await runImporter(pendingGameIds);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
