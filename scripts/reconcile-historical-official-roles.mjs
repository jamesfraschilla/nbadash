#!/usr/bin/env node
// Fix only historical role/order fields from explicit NBA OFFICIAL1/2/3/4.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { gunzipSync } from "node:zlib";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

const apply = process.argv.includes("--apply");
const arg = name => process.argv.find(v => v.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const season = arg("season");
if (!["2024-25", "2025-26"].includes(season)) throw Error("Historical --season required");
const dir = path.resolve("output/historical-challenges");
for (const f of [".env", ".env.local"]) for (const line of (await readFile(f, "utf8")).split(/\r?\n/)) {
  const m = line.match(/^(\w+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
if (apply) await assertOutsideWizardsGameWindow("historical official role corrections");
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rows = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from("nba_official_game_assignments").select("*").eq("season", season).order("id").range(offset, offset + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await writeFile(path.join(dir, `${season}-${stamp}-roles-before.json`), JSON.stringify(rows));
const games = new Map();
const sourceFiles = await readdir(path.join(dir, "sources"));
for (const file of sourceFiles) {
  if (!file.endsWith(".json") && !file.endsWith(".json.gz")) continue;
  if (file.endsWith(".gz") && sourceFiles.includes(file.slice(0, -3))) continue;
  const buffer = await readFile(path.join(dir, "sources", file));
  const source = JSON.parse((file.endsWith(".gz") ? gunzipSync(buffer) : buffer).toString("utf8"));
  games.set(source.game.gameId, source.boxscoreOfficials || []);
}
const changes = [];
for (const before of rows) {
  const official = games.get(before.game_id)?.find(o => String(o.personId) === before.official_id);
  const order = Number(official?.assignment?.match(/^OFFICIAL([1-4])$/)?.[1]);
  if (!order) continue;
    // Preserve participation flags: an alternate may have actually entered
    // the game, and this role repair must not change game-count denominators.
    const patch = { role_key: ["", "crewChief", "referee", "umpire", "alternate"][order], assignment_order: order };
  if (Object.entries(patch).some(([key, value]) => before[key] !== value)) changes.push({ id: before.id, gameId: before.game_id,
    name: before.official_name, before: Object.fromEntries(Object.keys(patch).map(k => [k, before[k]])), after: patch });
}
const report = { season, mode: apply ? "apply" : "dry-run", assignments: rows.length, changes, applied: 0 };
const reportFile = path.join(dir, `${season}-${stamp}-roles-report.json`);
await writeFile(reportFile, JSON.stringify(report, null, 2));
if (apply) {
  const groups = Map.groupBy(changes, c => JSON.stringify([c.before, c.after]));
  for (const group of groups.values()) for (let offset = 0; offset < group.length; offset += 150) {
    const chunk = group.slice(offset, offset + 150);
    let query = db.from("nba_official_game_assignments").update(chunk[0].after).in("id", chunk.map(c => c.id));
    for (const [key, value] of Object.entries(chunk[0].before)) query = value === null ? query.is(key, null) : query.eq(key, value);
    const { data, error } = await query.select("id");
    if (error || data.length !== chunk.length) throw Error(error?.message || "Concurrent assignment role changes; rerun dry audit");
    report.applied += data.length;
    await writeFile(reportFile, JSON.stringify(report, null, 2));
  }
}
console.log(JSON.stringify({ ...report, changes: changes.length }));
