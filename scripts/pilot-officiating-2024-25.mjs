#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_SEASON = "2024-25";
const DEFAULT_MAX_GAMES = "20";
const DEFAULT_CHALLENGE_LOG = "/Users/jamesfraschilla/Downloads/2024-25-NBA-Coachs-Challenges-05-19-25.pdf";

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function runNodeScript(script, args) {
  const startedAt = Date.now();
  const { stdout, stderr } = await execFileAsync("node", [script, ...args], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 32,
  });
  return {
    script,
    args,
    durationMs: Date.now() - startedAt,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function main() {
  await assertOutsideWizardsGameWindow("2024-25 officiating pilot");
  const season = readArg("season") || DEFAULT_SEASON;
  const maxGames = readArg("max-games") || DEFAULT_MAX_GAMES;
  const datasetDir = readArg("dataset-dir");
  const challengeLog = readArg("challenge-log") || DEFAULT_CHALLENGE_LOG;
  const apply = hasFlag("apply");
  const outputDir = readArg("out-dir") || `test-results/officiating-pilot-${season}`;
  await mkdir(outputDir, { recursive: true });

  const cdnArgs = [
    `--season=${season}`,
    `--max-games=${maxGames}`,
  ];
  if (datasetDir) cdnArgs.push(`--dataset-dir=${datasetDir}`);
  if (apply) cdnArgs.push("--apply");

  const challengeJson = path.join(outputDir, "challenge-log.json");
  const challengeSqlDir = path.join(outputDir, "challenge-sql");
  const challengeExt = path.extname(challengeLog).toLowerCase();
  const challengeSourceArg = challengeExt === ".xlsx" || challengeExt === ".xls"
    ? `--xlsx=${challengeLog}`
    : `--pdf=${challengeLog}`;
  const challengeArgs = [
    `--season=${season}`,
    challengeSourceArg,
    "--season-types=Regular Season,Play-In,Playoffs",
    "--game-id-prefixes=002,005,004",
    `--out=${challengeJson}`,
    `--sql-dir=${challengeSqlDir}`,
    "--sql-chunk-size=100",
    `--max-games=${maxGames}`,
  ];
  const results = [];
  results.push(await runNodeScript("scripts/import-cdnnba-official-calls.mjs", cdnArgs));
  results.push(await runNodeScript("scripts/import-nba-challenge-log.mjs", challengeArgs));

  const report = {
    season,
    mode: apply ? "apply" : "dry-run",
    maxGames,
    datasetDir: datasetDir || null,
    challengeLog,
    generatedAt: new Date().toISOString(),
    results,
    nextSteps: [
      "Review stdout summaries and generated challenge SQL chunks.",
      "Archive-backed cdnnba dry runs still scan compressed source files; use low-concurrency off-hours for the full run.",
      "Confirm game/call/challenge counts before full backfill.",
      "Apply supabase/officiating_season_scoped_rollup_caches.sql before refreshing 2024-25 rollups.",
      "Run npm run officiating:refresh:rollups -- --season=2024-25 only after applying rows.",
    ],
  };
  const reportPath = path.join(outputDir, "pilot-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    season,
    mode: report.mode,
    reportPath,
    resultCount: results.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
