#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { buildChallengeClockClip, CHALLENGE_CLOCK_LINK_VERSION } from "../src/officiatingChallengeLinks.js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

const arg = (key, fallback = "") => process.argv.find(v => v.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
const season = arg("season", "2026-27"), apply = process.argv.includes("--apply");
for (const file of [".env", ".env.local"]) for (const line of (await readFile(file, "utf8").catch(() => "")).split(/\r?\n/)) {
  const match = line.match(/^(\w+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
if (apply) await assertOutsideWizardsGameWindow("repair challenge Clock links");
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const rows = [];
for (let start = 0; ; start += 1000) {
  let query = db.from("nba_coach_challenge_events").select("*").eq("season", season).order("id").range(start, start + 999);
  if (arg("game-ids")) query = query.in("game_id", arg("game-ids").split(","));
  const { data, error } = await query;
  if (error) throw error;
  rows.push(...data); if (data.length < 1000) break;
}
const output = "output/challenge-clock-audit";
await mkdir(output, { recursive: true });
const prefix = `${output}/${new Date().toISOString().replace(/[:.]/g, "-")}`;
await writeFile(`${prefix}-before.json`, JSON.stringify(rows, null, 2));
const report = { season, mode: apply ? "apply" : "dry-run", sourceRows: rows.length,
  gamesChecked: 0, changes: [], failures: [], linkReasons: {} };
for (const [gameId, group] of Map.groupBy(rows, row => row.game_id)) {
  try {
    const response = await fetch(`https://d1rjt2wyntx8o7.cloudfront.net/api/games/${gameId}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Game feed HTTP ${response.status}`);
    const game = await response.json();
    if (game.gameId !== gameId || !game.playByPlayActions?.length) throw new Error("Invalid/empty game feed");
    for (const row of group) {
      const clip = buildChallengeClockClip(row, game);
      report.linkReasons[clip.reason] = (report.linkReasons[clip.reason] || 0) + 1;
      const metadata = { clockClipUrl: clip.url, clockLinkReason: clip.reason,
        clockLinkActionNumber: clip.actionNumber, clockLinkVersion: CHALLENGE_CLOCK_LINK_VERSION };
      if (Object.keys(metadata).every(key => row.source_payload?.[key] === metadata[key])) continue;
      report.changes.push({ id: row.id, gameId, period: row.period, clock: row.game_clock,
        oldUrl: row.source_payload?.clockClipUrl || null, ...metadata });
      if (apply) {
        // Only clip metadata changes. Preserve Video, clocks, attribution,
        // outcomes, and all previously collected provenance and user tags.
        const { data, error } = await db.from("nba_coach_challenge_events")
          .update({ source_payload: { ...row.source_payload, ...metadata }, updated_at: new Date().toISOString() })
          .eq("id", row.id).eq("updated_at", row.updated_at).select("id");
        if (error || data?.length !== 1) throw new Error(error?.message || `Concurrent edit: ${row.id}`);
      }
    }
    report.gamesChecked++;
    if (report.gamesChecked % 20 === 0) console.log(`Checked ${report.gamesChecked} games`);
  } catch (error) { report.failures.push({ gameId, error: error.message }); }
  await writeFile(`${prefix}-report.json`, JSON.stringify(report, null, 2));
}
if (apply && report.changes.length) {
  const { error } = await db.rpc("refresh_nba_officiating_cache_for_season", {
    target_season: season, target_cache: "nba_authoritative_coach_challenge_events_cache" });
  if (error) throw error;
}
console.log(JSON.stringify({ ...report, changes: report.changes.length, report: `${prefix}-report.json` }, null, 2));
if (report.failures.length) process.exitCode = 1;
