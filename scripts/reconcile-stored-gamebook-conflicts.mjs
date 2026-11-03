// Quarantine uncertain ORIGINAL-whistle attribution using evidence already
// retained in the source records. No guessing, source downloads or deletions.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { challengeClockSeconds, reconcileGamebookChallenge } from "../src/officiatingGamebookChallenges.js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";

const season = process.argv.find(a => a.startsWith("--season="))?.slice(9) || "2026-27";
const apply = process.argv.includes("--apply");
if (apply) await assertOutsideWizardsGameWindow("source-conflict whistle quarantine");
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rows = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from("nba_coach_challenge_events").select("*")
    .eq("season", season).order("id").range(offset, offset + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
const targets = rows.filter(r => r.match_reason === "gamebook-vs-official-initial-call-conflict");
const directory = path.resolve("output/challenge-source-conflicts", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "before.json"), JSON.stringify(targets, null, 2));
const report = { season, apply, backedUpRecords: targets.length, changes: [], protected: [], skipped: [] };
for (const [gameId, candidates] of Map.groupBy(targets, r => r.game_id)) {
  const { data: assignments, error } = await db.from("nba_official_game_assignments").select("*").eq("season", season).eq("game_id", gameId);
  if (error) throw error;
  for (const before of candidates) {
    if (["manual", "verified"].includes(before.review_status)) { report.protected.push(before.id); continue; }
    const evidence = before.source_payload?.gamebookChallenge;
    if (!/^https:\/\/statsdmz\.nba\.com\/pdfs\//.test(evidence?.url || "")) { report.skipped.push(before.id); continue; }
    const official = rows.find(r => r.game_id === gameId && r.source === "nba_official_challenge_pdf"
      && r.challenging_team === before.challenging_team && Number(r.period) === Number(before.period)
      && Math.abs(challengeClockSeconds(r.game_clock) - challengeClockSeconds(before.game_clock)) < 0.01);
    const original = official?.source_payload?.pdfRow;
    const candidate = original ? { ...before, source_payload: { ...before.source_payload, officialOriginalCall: {
      ...original, sourceId: official.id,
    } } } : before;
    const after = reconcileGamebookChallenge(candidate, [evidence], assignments || [], evidence.url);
    if (!after.source_payload?.gamebookSourceConflict) { report.skipped.push(before.id); continue; }
    const fields = ["challenge_type", "challenge_sub_type", "initial_call", "whistling_official_id", "whistling_official_name", "match_confidence", "match_reason", "review_status", "source_payload"];
    const patch = Object.fromEntries(fields.filter(k => !isDeepStrictEqual(before[k], after[k])).map(k => [k, after[k]]));
    if (!Object.keys(patch).length) continue;
    report.changes.push({ id: before.id, gameId, period: before.period, clock: before.game_clock,
      priorWhistle: before.whistling_official_name, kind: after.source_payload.gamebookSourceConflict.kind, patch });
    // Persist the planned change before writing; concurrency conflicts stop the
    // batch instead of overwriting an intervening user/ingestion decision.
    await writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
    if (apply) {
      const { data, error: updateError } = await db.from("nba_coach_challenge_events")
        .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", before.id)
        .eq("updated_at", before.updated_at).select("id");
      if (updateError) throw updateError;
      if (data?.length !== 1) throw new Error(`Concurrent revision: ${before.id}`);
    }
  }
}
await writeFile(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({directory, season, apply, records:targets.length, changed:report.changes.length,
  kinds: Object.fromEntries([...Map.groupBy(report.changes,r=>r.kind)].map(([k,v])=>[k,v.length])),
  protected:report.protected.length, skipped:report.skipped.length}));
