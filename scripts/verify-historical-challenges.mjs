#!/usr/bin/env node
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

for (const f of [".env", ".env.local"]) for (const line of (await readFile(f, "utf8")).split(/\r?\n/)) {
  const m = line.match(/^(\w+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const refresh = process.argv.includes("--refresh");
if (refresh) await assertOutsideWizardsGameWindow("historical challenge cache refresh");
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const dir = path.resolve("output/historical-challenges");
const verification = { seasons: [], refreshes: [] };
async function all(table, season) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select("*").eq("season", season).order(table === "nba_team_profiles_cache" ? "team" : "id").range(offset, offset + 999);
    if (error) throw error;
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
for (const season of ["2024-25", "2025-26"]) {
  if (refresh) for (const cache of ["nba_authoritative_coach_challenge_events_cache", "challenge-profile-columns"]) {
    const start = Date.now();
    const { data, error } = await db.rpc("refresh_nba_officiating_cache_for_season", { target_season: season, target_cache: cache });
    if (error) throw Error(`${season} ${cache}: ${error.message}`);
    const entry = { season, cache, rows: data, durationMs: Date.now() - start };
    verification.refreshes.push(entry);
    console.log(JSON.stringify(entry));
  }
  const rows = await all("nba_authoritative_coach_challenge_events_cache", season);
  const raw = await all("nba_coach_challenge_events", season);
  const officials = await all("nba_official_profiles_cache", season);
  const teams = await all("nba_team_profiles_cache", season);
  const baselineFile = (await readdir(dir)).filter(f => f.startsWith(`${season}-20`) && f.endsWith("-before.json") && !f.includes("roles")).sort()[0];
  const baseline = JSON.parse(await readFile(path.join(dir, baselineFile), "utf8"));
  const beforeById = new Map(baseline.cached.map(r => [r.id, r]));
  const nowById = new Map(raw.map(r => [r.id, r]));
  const errors = [];
  for (const before of baseline.raw) {
    const now = nowById.get(before.id);
    if (!now) errors.push(`Original challenge ID removed: ${before.id}`);
    else for (const key of ["game_date", "home_team", "away_team", "challenging_team", "created_at", "round", "series"])
      if (before[key] !== now[key]) errors.push(`Unexpected change ${before.id}: ${key}`);
  }
  const statsRows = rows.filter(r => r.season_type.toLowerCase() !== "preseason");
  const whistle = new Map(), chief = new Map(), team = new Map();
  function add(map, key, row) {
    if (!key) return;
    const count = map.get(key) || { total: 0, successful: 0 };
    count.total++; count.successful += Number(row.challenge_outcome === "successful"); map.set(key, count);
  }
  for (const row of statsRows) {
    add(whistle, row.whistling_official_id || row.whistling_official_name, row);
    add(chief, row.crew_chief_id || row.crew_chief_name, row);
    add(team, row.challenging_team, row);
  }
  for (const profile of officials) for (const [map, totalKey, successKey, rateKey] of [
    [whistle, "whistle_challenges", "successful_whistle_challenges", "whistle_challenge_rate"], [chief, "crew_chief_challenges", "successful_crew_chief_challenges", "crew_chief_challenge_rate"]]) {
    const expected = map.get(profile.official_id) || map.get(profile.name) || { total: 0, successful: 0 };
    if (Number(profile[totalKey]) !== expected.total || Number(profile[successKey]) !== expected.successful)
      errors.push(`Official profile mismatch: ${profile.name} ${totalKey}`);
    if (Math.abs(Number(profile[rateKey]) - (expected.total ? expected.successful / expected.total : 0)) > 1e-9)
      errors.push(`Official rate mismatch: ${profile.name} ${rateKey}`);
  }
  for (const profile of teams) {
    const expected = team.get(profile.team) || { total: 0, successful: 0 };
    if (Number(profile.challenges) !== expected.total || Number(profile.successful_challenges) !== expected.successful)
      errors.push(`Team profile mismatch: ${profile.team}`);
    if (Math.abs(Number(profile.challenge_rate) - (expected.total ? expected.successful / expected.total : 0)) > 1e-9)
      errors.push(`Team challenge rate mismatch: ${profile.team}`);
  }
  const beforeProfiles = JSON.parse(await readFile(path.join(dir, `${season}-profiles-before.json`), "utf8"));
  for (const before of beforeProfiles.nba_official_profiles_cache) {
    const now = officials.find(p => p.official_id === before.official_id);
    for (const key of ["games", "calls", "fouls", "violations", "technicals"])
      if (Number(now?.[key]) !== Number(before[key])) errors.push(`Non-challenge statistic changed: ${before.name} ${key}`);
  }
  const summary = { season, before: baseline.cached.length, after: rows.length, preseason: rows.length - statsRows.length,
    allFromOfficialPdf: rows.every(r => r.source === "nba_official_challenge_pdf"),
    missingChiefs: rows.filter(r => !(r.crew_chief_id || r.crew_chief_name)).length,
    missingWhistles: rows.filter(r => !(r.whistling_official_id || r.whistling_official_name)).length,
    missingWhistlesByType: Object.fromEntries(["Foul", "OOB", "Violation"].map(type => [type, rows.filter(r => r.challenge_type === type && !(r.whistling_official_id || r.whistling_official_name)).length])),
    recoveredWhistles: rows.filter(r => beforeById.has(r.id) && !(beforeById.get(r.id).whistling_official_id || beforeById.get(r.id).whistling_official_name) && (r.whistling_official_id || r.whistling_official_name)).length,
    correctedWhistles: rows.filter(r => beforeById.get(r.id)?.whistling_official_id && r.whistling_official_id && beforeById.get(r.id).whistling_official_id !== r.whistling_official_id).length,
    removedUnsupportedWhistles: rows.filter(r => (beforeById.get(r.id)?.whistling_official_id || beforeById.get(r.id)?.whistling_official_name) && !(r.whistling_official_id || r.whistling_official_name)).length,
    correctedChiefs: rows.filter(r => beforeById.get(r.id)?.crew_chief_id && beforeById.get(r.id).crew_chief_id !== r.crew_chief_id).length,
    needsReview: rows.filter(r => r.review_status === "needs_review").length,
    inventoryWithBookEvidence: rows.filter(r => r.source_payload?.gamebookChallenge).length,
    officialsVerified: officials.length, teamsVerified: teams.length, errors };
  verification.seasons.push(summary);
  await writeFile(path.join(dir, `${season}-after-canonical.json`), JSON.stringify(rows));
  await writeFile(path.join(dir, "verification.json"), JSON.stringify(verification, null, 2));
  console.log(JSON.stringify(summary));
}
if (verification.seasons.some(s => s.errors.length)) process.exitCode = 1;
