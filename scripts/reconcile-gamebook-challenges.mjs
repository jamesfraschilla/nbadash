#!/usr/bin/env node
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify, isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {createHash} from "node:crypto";
import { parseGamebookChallenges, reconcileGamebookChallenge, challengeClockSeconds } from "../src/officiatingGamebookChallenges.js";
import { enrichChallengeEventsWithOfficials } from "../src/officiatingChallengeMatcher.js";
import { extractOfficialCallEvents } from "../src/officiatingParser.js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";
import { buildChallengeClockClip, CHALLENGE_CLOCK_LINK_VERSION } from "../src/officiatingChallengeLinks.js";
import { fetchRecoverableGame } from "../supabase/functions/_shared/nbaLiveRecovery.ts";
import {challengeNeedsReview,challengeReviewState} from "../src/challengeReview.js";

const runFile = promisify(execFile);
const arg = (name, fallback = "") => process.argv.find(v => v.startsWith(`--${name}=`))?.split("=").slice(1).join("=") || fallback;
const apply = process.argv.includes("--apply");
const season = arg("season", "2026-27");
for (const file of [".env", ".env.local"]) {
  const text = await readFile(file, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(\w+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
if (apply) await assertOutsideWizardsGameWindow("gamebook challenge reconciliation");
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rows = [];
for (let offset = 0; ; offset += 1000) {
  let query = db.from("nba_coach_challenge_events").select("*").eq("season", season).order("id").range(offset, offset + 999);
  if (arg("game-ids")) query = query.in("game_id", arg("game-ids").split(","));
  if (arg("lookback-days")) {
    const cutoff = new Date(Date.now() - Number(arg("lookback-days")) * 86400000).toISOString().slice(0, 10);
    query = process.argv.includes("--retry-unresolved")
      ? query.or(`game_date.gte.${cutoff},review_status.eq.needs_review`)
      : query.gte("game_date", cutoff);
  }
  const { data, error } = await query;
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
const groups = Map.groupBy(rows, row => row.game_id);
const report = { season, mode: apply ? "apply" : "dry-run", challenges: rows.length, games: groups.size,
  gamebooks: 0, bookChallengeRows: 0, gamebookDocuments:[], changed: [], unchanged: 0, failures: [], feedWarnings: [], needsReview: [], newlyUnresolved: [] };
const reportDir = path.resolve(arg("output", "output/challenge-attribution-audit"));
await mkdir(reportDir, { recursive: true });
// Recovery copy must exist before any writes. No user notes/tags are touched.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await writeFile(path.join(reportDir, `${stamp}-before.json`), JSON.stringify(rows, null, 2));
const work = await mkdtemp(path.join(tmpdir(), "nba-gamebook-audit-"));
const fields = ["challenge_type", "challenge_sub_type", "initial_call", "challenge_outcome",
  "whistling_official_id", "whistling_official_name", "matched_call_event_id", "matched_action_number",
  "match_confidence", "match_reason", "review_status"];
try {
  // One game at a time: bounded local memory and no database connection burst.
  for (const [gameId, challenges] of groups) {
    const first = challenges[0];
    const day = String(first.game_date || "").slice(0, 10).replaceAll("-", "");
    const teams = `${first.away_team}${first.home_team}`;
    if (!/^\d{8}$/.test(day) || !/^[A-Z]{6}$/.test(teams)) {
      report.failures.push({ gameId, error: "Missing gamebook date/team metadata" }); continue;
    }
    const url = `https://statsdmz.nba.com/pdfs/${day}/${day}_${teams}_book.pdf`;
    const pdfPath = path.join(work, `${gameId}.pdf`);
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.nba.com/" }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Gamebook HTTP ${response.status}`);
      const pdfBytes=Buffer.from(await response.arrayBuffer());
      const gamebookSha256=createHash("sha256").update(pdfBytes).digest("hex");
      await writeFile(pdfPath, pdfBytes);
      const { stdout } = await runFile("python3", ["scripts/extract-nba-gamebook-pages.py", pdfPath], { maxBuffer: 2 * 1024 * 1024, timeout: 45000 });
      const bookRows = parseGamebookChallenges(JSON.parse(stdout));
      report.gamebooks++; report.bookChallengeRows += bookRows.length;
      report.gamebookDocuments.push({gameId,url,sha256:gamebookSha256,challengeRows:bookRows.length});
      const { data: assignments, error } = await db.from("nba_official_game_assignments").select("*").eq("game_id", gameId).eq("season", season);
      if (error) throw error;
      // Retry filters can omit already-resolved ledger rows. They must still
      // participate in uniqueness checks so one book cannot be claimed twice.
      const ledgerResult=await db.from("nba_coach_challenge_events").select("*")
        .eq("game_id",gameId).eq("season",season).eq("source","nba_official_challenge_pdf");
      if(ledgerResult.error)throw ledgerResult.error;
      const ledgerRows=ledgerResult.data;
      let game = null;
      try {
        game = await fetchRecoverableGame(gameId);
        if (String(game.gameId) !== gameId || !game.playByPlayActions?.length) throw new Error("Invalid/empty game feed");
      } catch (error) {
        game = null;
        report.feedWarnings.push({gameId,error:error.message});
        console.warn(`::warning::${gameId}: ${error.message}; applying only independently supported gamebook evidence, preserving existing clock clips.`);
      }
      const calls = (game ? extractOfficialCallEvents(game) : []).map(event => ({
        game_id: gameId, period: event.period, game_clock: event.gameClock, action_number: event.actionNumber,
        order_number: event.orderNumber, action_type: event.actionType, primary_category: event.primaryCategory,
        secondary_category: event.secondaryCategory, sub_type: event.subType, descriptor: event.descriptor,
        description: event.description, official_id: event.officialId, official_name: event.officialName,
        charged_team: event.chargedTeam, source_payload: event.sourcePayload,
      }));
      const enriched = game ? enrichChallengeEventsWithOfficials(challenges, calls, assignments) : challenges;
      for (let index = 0; index < challenges.length; index++) {
        const before = challenges[index];
        const officialSource = ledgerRows.find(row => row.challenging_team===before.challenging_team
          && Number(row.period) === Number(before.period)
          && Math.abs(challengeClockSeconds(row.game_clock) - challengeClockSeconds(before.game_clock)) < 0.01);
        const candidate = officialSource?.source_payload?.pdfRow ? { ...enriched[index], source_payload: {
          ...enriched[index].source_payload, officialOriginalCall: {
            initial_call: officialSource.source_payload.pdfRow.initial_call,
            trigger: officialSource.source_payload.pdfRow.trigger,
            challenge_outcome: officialSource.source_payload.pdfRow.challenge_outcome,
            ruling_description: officialSource.source_payload.pdfRow.ruling_description,
            sourceId: officialSource.id,
          } } } : enriched[index];
        const after = reconcileGamebookChallenge(candidate, bookRows, assignments, url,{peerChallenges:ledgerRows,gamebookSha256});
        if (game && !process.argv.includes("--preserve-clock-links")) {
          const clip = buildChallengeClockClip(after, game);
          after.source_payload = { ...after.source_payload, clockClipUrl: clip.url,
            clockLinkReason: clip.reason, clockLinkActionNumber: clip.actionNumber,
            clockLinkVersion: CHALLENGE_CLOCK_LINK_VERSION };
        }
        const changedFields = fields.filter(key => (before[key] ?? "") !== (after[key] ?? ""));
        // jsonb key ordering differs from JavaScript insertion order. Compare
        // values structurally so unchanged books never cause daily rewrites.
        const newEvidence = !isDeepStrictEqual(before.source_payload?.gamebookChallenge, after.source_payload?.gamebookChallenge)
          || !isDeepStrictEqual(before.source_payload?.gamebookMatch, after.source_payload?.gamebookMatch)
          || ["clockClipUrl", "clockLinkReason", "clockLinkActionNumber", "clockLinkVersion"]
            .some(key => before.source_payload?.[key] !== after.source_payload?.[key]);
        if (after.review_status === "needs_review") {
          const issue = { id: before.id, gameId, period: before.period, clock: before.game_clock, reason: after.match_reason,
            state:challengeReviewState(after),needsInvestigation:challengeNeedsReview(after) };
          report.needsReview.push(issue);
          if (before.review_status !== "needs_review") report.newlyUnresolved.push(issue);
        }
        if (!changedFields.length && !newEvidence) { report.unchanged++; continue; }
        const change = { id: before.id, gameId, period: before.period, clock: before.game_clock,
          before: Object.fromEntries(fields.map(key => [key, before[key]])),
          after: Object.fromEntries(fields.map(key => [key, after[key]])),
          evidence: after.source_payload?.gamebookChallenge || null };
        // Append recovery/audit evidence before applying each correction.
        report.changed.push(change);
        await writeFile(path.join(reportDir, `${stamp}-report.json`), JSON.stringify(report, null, 2));
        if (apply) {
          const patch = Object.fromEntries(fields.map(key => [key, after[key] ?? null]));
          const { data, error: saveError } = await db.from("nba_coach_challenge_events")
            .update({ ...patch, source_payload: after.source_payload, updated_at: new Date().toISOString() })
            .eq("id", before.id).eq("updated_at", before.updated_at).select("id");
          if (saveError || data?.length !== 1) throw new Error(saveError?.message || `Concurrent edit: ${before.id}`);
        }
      }
      console.log(`${gameId}: ${challenges.length} log rows, ${bookRows.length} gamebook challenge rows`);
    } catch (error) {
      report.failures.push({ gameId, url, error: error.message });
      console.error(`${gameId}: ${error.message}`);
    } finally { await rm(pdfPath, { force: true }); }
  }
} finally { await rm(work, { recursive: true, force: true }); }
await writeFile(path.join(reportDir, `${stamp}-report.json`), JSON.stringify(report, null, 2));
const actionableReview=report.needsReview.filter(row=>row.needsInvestigation);
const sourceOmissions=report.needsReview.filter(row=>row.state==="whistle_unavailable");
console.log(JSON.stringify({ ...report, changed: report.changed.length, needsReview: report.needsReview.length, reportDir }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = ["## Challenge attribution review", "",
    `${report.challenges} raw challenge rows in ${report.games} games checked; ${report.changed.length} updates (including evidence-only changes); ${report.failures.length} fetch/processing failures; ${report.feedWarnings.length} limited-feed warnings; ${actionableReview.length} raw rows need investigation; ${sourceOmissions.length} additional rows have a confirmed call but no published whistle. Raw rows can include non-authoritative siblings.`, "",
    "The daily job retries unresolved current-season entries as well as recent games. Missing source information is not guessed and is not assigned to a human automatically.", "",
    "| Game | Period | Clock | Status | Reason |", "| --- | --- | --- | --- | --- |",
    ...report.needsReview.map(row => `| ${row.gameId} | ${row.period} | ${row.clock} | ${row.state} | ${String(row.reason).replaceAll("|", "/")} |`), ""];
  await writeFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"), { flag: "a" });
}
if (actionableReview.length) console.log(`::warning::${actionableReview.length} raw challenge rows need source-backed investigation; ${sourceOmissions.length} additional rows have no published whistle. See the review summary and Challenge Log review filters.`);
else if(sourceOmissions.length)console.log(`::notice::${sourceOmissions.length} raw challenge rows confirm the call but publish no whistle; kept separate from the investigation queue.`);
// Previously flagged missing source information is retained in the report;
// fail the scheduled job for new attribution regressions or fetch failures.
if (report.failures.length || report.newlyUnresolved.some(row => row.reason !== "gamebook-whistle-not-published")) process.exitCode = 1;
