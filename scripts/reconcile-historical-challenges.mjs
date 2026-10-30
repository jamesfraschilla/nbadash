#!/usr/bin/env node
// Source collection is bounded to four external requests; database writes are
// sequential, optimistic, backed up, and limited to challenge records.
import { readFile, writeFile, appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify, isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { parseGamebookChallenges, reconcileGamebookChallenge, challengeClockSeconds } from "../src/officiatingGamebookChallenges.js";
import { enrichChallengeEventsWithOfficials } from "../src/officiatingChallengeMatcher.js";
import { extractOfficialCallEvents } from "../src/officiatingParser.js";
import { buildChallengeClockClip } from "../src/officiatingChallengeLinks.js";
import { assertOutsideWizardsGameWindow } from "./lib/game-window-guard.mjs";
import { selectHistoricalBookEvidence } from "../src/officiatingHistoricalEvidence.js";

const run = promisify(execFile);
const arg = (name, fallback = "") => process.argv.find(v => v.startsWith(`--${name}=`))?.split("=").slice(1).join("=") || fallback;
const apply = process.argv.includes("--apply");
const season = arg("season");
if (!["2024-25", "2025-26"].includes(season)) throw Error("Choose a historical --season=2024-25 or 2025-26");
const directory = path.resolve(arg("output", "output/historical-challenges"));
await mkdir(directory, { recursive: true });
await mkdir(path.join(directory, "sources"), { recursive: true });
for (const file of [".env", ".env.local"]) for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
  const m = line.match(/^(\w+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
if (apply) await assertOutsideWizardsGameWindow("historical challenge reconciliation");
if (apply) {
  const lock = path.join(directory, `.${season}-apply-lock`);
  try { await mkdir(lock); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.log(`${season}: another historical reconciliation is applying; no writes started.`);
    process.exit(0);
  }
  process.once("exit", () => rmdirSync(lock));
}
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function all(table, columns = "*") {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select(columns).eq("season", season).order("id").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
const raw = await all("nba_coach_challenge_events");
const cached = await all("nba_authoritative_coach_challenge_events_cache");
const assignments = await all("nba_official_game_assignments");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await writeFile(path.join(directory, `${season}-${stamp}-before.json`), JSON.stringify({ raw, cached, assignments }));
const norm = v => String(v || "").toLowerCase().replace(/[^a-z]/g, "");
const date = value => { const [m, d, y] = value.split("/"); return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; };
const same = (a, b) => a.game_id === b.game_id && a.challenging_team === b.challenging_team
  && Number(a.period) === Number(b.period)
  && Math.abs(challengeClockSeconds(a.game_clock) - challengeClockSeconds(b.game_clock)) < 0.11;
const docs = JSON.parse(await readFile(arg("documents", path.join(directory, "inventory-documents.json")), "utf8")).filter(d => d.season === season);
const official = [];
for (const doc of docs) {
  const rows = JSON.parse(await readFile(doc.rows, "utf8"));
  for (const pdf of rows) {
    if (!/^(successful|unsuccessful)$/i.test(pdf.challenge_outcome) || !/^\d+$/.test(pdf.period)
      || !Number.isFinite(challengeClockSeconds(pdf.game_clock))) throw Error("Invalid official inventory document");
    const gameDate = date(pdf.date);
    const scheduled = new Set(assignments.filter(r => r.game_date === gameDate && r.home_team === pdf.home_team && r.away_team === pdf.away_team).map(r => r.game_id).filter(Boolean));
    const candidates = new Set(raw.filter(r => r.game_date === gameDate && r.home_team === pdf.home_team && r.away_team === pdf.away_team).map(r => r.game_id).filter(Boolean));
    // NBA PDF video IDs can themselves reference the wrong game. Prefer the
    // independently ingested date/matchup assignment, never the clip ID alone.
    let gameId = scheduled.size === 1 ? [...scheduled][0] : candidates.size === 1 ? [...candidates][0] : pdf.game_id;
    if (!gameId) {
      const response = await fetch(`https://d1rjt2wyntx8o7.cloudfront.net/api/games/byDate?date=${gameDate}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error(`Unable to resolve missing game ID for ${gameDate}`);
      const schedule = await response.json();
      const matches = schedule.filter(g => g.homeTeam?.teamTricode === pdf.home_team && g.awayTeam?.teamTricode === pdf.away_team);
      if (matches.length === 1) gameId = matches[0].gameId;
    }
    const prefix = gameId.slice(0, 3);
    const item = { season, game_id: gameId || null, game_date: gameDate, home_team: pdf.home_team, away_team: pdf.away_team,
      challenging_team: pdf.team_challenged, period: Number(pdf.period), game_clock: pdf.game_clock,
      season_type: prefix === "001" ? "Preseason" : prefix === "004" ? "Playoffs" : prefix === "005" ? "Play-In" : "Regular Season",
      challenge_type: /foul/i.test(pdf.trigger) ? "Foul" : /oob|bounds/i.test(pdf.trigger) ? "OOB" : "Violation",
      initial_call: pdf.initial_call, call_ruling: pdf.final_ruling, ruling_outcome: pdf.ruling_description,
      challenge_outcome: pdf.challenge_outcome.toLowerCase(), video_url: pdf.video_url,
      source_payload: { pdfUrl: doc.url, pdfRow: pdf } };
    if (official.some(r => same(r, item))) throw Error("Duplicate official PDF challenge identity");
    official.push(item);
  }
}
// Retain all historical rows/user tags. Promote an existing PBP row when it is
// the exact official challenge, instead of inserting a second challenge ID.
const planned = [];
const used = new Set();
const report = { season, mode: apply ? "apply" : "dry-run", sourceRows: raw.length, canonicalBefore: cached.length,
  officialInventory: official.length, missingFromDatabase: [], missingFromDisplay: [], sourceDisagreements: [],
  unresolvedGameIds: [], gameFailures: [], bookOnlyChallenges: [], unresolvedAttributions: [], changed: [], unchanged: 0, applied: 0 };
for (const item of official) {
  const sourceIdentity = pdf => JSON.stringify([pdf?.date, pdf?.away_team, pdf?.home_team, pdf?.team_challenged, String(pdf?.period), pdf?.game_clock]);
  let exact = raw.filter(r => r.source_payload?.pdfRow && sourceIdentity(r.source_payload.pdfRow) === sourceIdentity(item.source_payload.pdfRow));
  if (!exact.length) exact = raw.filter(r => same({ ...r, game_id: item.game_id }, item)
    && r.game_date === item.game_date && r.home_team === item.home_team && r.away_team === item.away_team);
  if (!exact.length) {
    const nearby = raw.filter(r => r.source === "play_by_play" && r.game_id === item.game_id && r.challenging_team === item.challenging_team
      && Number(r.period) === item.period && Math.abs(challengeClockSeconds(r.game_clock) - challengeClockSeconds(item.game_clock)) <= 2);
    if (nearby.length === 1) exact = nearby;
  }
  exact.sort((a, b) => Number(b.source === "nba_official_challenge_pdf") - Number(a.source === "nba_official_challenge_pdf") || b.created_at.localeCompare(a.created_at));
  const before = exact[0];
  if (before && used.has(before.id)) throw Error("Two PDF rows matched one database record");
  if (before) used.add(before.id);
  if (!before) report.missingFromDatabase.push(item);
  if (!cached.some(r => same({ ...r, game_id: r.game_id || item.game_id }, item) && r.game_date === item.game_date)) report.missingFromDisplay.push(item);
  if (before && ["challenge_outcome", "initial_call", "challenge_type", "challenging_team"].some(k => before[k] !== item[k]))
    report.sourceDisagreements.push({ id: before.id, gameId: item.game_id, clock: item.game_clock,
      before: { outcome: before.challenge_outcome, initial: before.initial_call, type: before.challenge_type },
      pdf: { outcome: item.challenge_outcome, initial: item.initial_call, type: item.challenge_type } });
  if (!item.game_id) report.unresolvedGameIds.push(item);
  const hash = createHash("sha256").update(JSON.stringify([season, item.game_date, item.away_team, item.home_team, item.challenging_team, item.period, item.game_clock])).digest("hex");
  const id = before?.id || `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  planned.push({ before, value: { ...before, ...item, id, source: "nba_official_challenge_pdf",
    source_payload: { ...before?.source_payload, ...item.source_payload } } });
}
// Existing canonical entries outside the official PDFs need independent
// evidence; preserve them rather than silently deleting historical records.
for (const before of cached.filter(r => !used.has(r.id))) {
  const underlying = raw.find(r => r.id === before.id);
  planned.push({ before: underlying, value: underlying });
}
const groups = [...Map.groupBy(planned.filter(p => p.value.game_id), p => p.value.game_id)];
const max = Number(arg("max-games")) || groups.length;
const selectedGroups = groups.slice(0, max);
const knownOfficials = new Map(assignments.map(a => [norm(a.official_name), a]));
const work = await mkdtemp(path.join(tmpdir(), "nba-historical-reconciliation-"));
async function roleEvidence(result, file, gameId) {
  if (result.boxscoreOfficials || result.boxscoreError) return result;
  const url = `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.nba.com/", Origin: "https://www.nba.com" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error(`Boxscore HTTP ${response.status}`);
    const payload = await response.json();
    if (String(payload.game?.gameId) !== gameId || !payload.game?.officials?.length) throw Error("Invalid boxscore officials");
    result.boxscoreOfficials = payload.game.officials;
    result.boxscoreUrl = url;
  } catch (error) { result.boxscoreError = error.message; }
  await writeFile(file, JSON.stringify(result));
  return result;
}
async function fetchSources(gameId, challenge) {
  const file = path.join(directory, "sources", `${gameId}.json`);
  const prior = await readFile(file, "utf8").then(JSON.parse).catch(() =>
    readFile(`${file}.gz`).then(buffer => JSON.parse(gunzipSync(buffer).toString("utf8"))).catch(() => null));
  if (prior?.game?.gameId === gameId && prior.book && prior.version === 2) return roleEvidence(prior, file, gameId);
  const day = challenge.game_date.replaceAll("-", "");
  const url = `https://statsdmz.nba.com/pdfs/${day}/${day}_${challenge.away_team}${challenge.home_team}_book.pdf`;
  const pdfPath = path.join(work, `${gameId}.pdf`);
  const [game, book] = await Promise.all([
    fetch(`https://d1rjt2wyntx8o7.cloudfront.net/api/games/${gameId}`, { signal: AbortSignal.timeout(15000) }).then(async r => {
      if (!r.ok) throw Error(`Game feed HTTP ${r.status}`);
      const g = await r.json();
      if (String(g.gameId) !== gameId || !g.playByPlayActions?.length) throw Error("Invalid or empty game feed");
      if (g.homeTeam?.teamTricode !== challenge.home_team || g.awayTeam?.teamTricode !== challenge.away_team) throw Error("Feed game ID disagrees with PDF matchup");
      return { gameId, homeTeam: { teamTricode: challenge.home_team }, awayTeam: { teamTricode: challenge.away_team }, officials: g.officials, playByPlayActions: g.playByPlayActions };
    }).catch(e => ({ gameId, error: e.message })),
    fetch(url, { signal: AbortSignal.timeout(15000) }).then(async r => {
      if (!r.ok) throw Error(`Gamebook HTTP ${r.status}`);
      await writeFile(pdfPath, Buffer.from(await r.arrayBuffer()));
      const { stdout } = await run("python3", ["scripts/extract-historical-gamebook.py", pdfPath], { maxBuffer: 2 * 1024 * 1024, timeout: 15000 });
      return { ...JSON.parse(stdout), url };
    }).catch(e => ({ url, error: e.message })).finally(() => rm(pdfPath, { force: true })),
  ]);
  // Keep only calls/review markers needed for reconciliation, not full games.
  const result = { version: 2, game: { ...game, playByPlayActions: game.playByPlayActions?.filter(a =>
    !["substitution", "timeout"].includes(a.actionType) || a.subType === "challenge") }, book };
  return roleEvidence(result, file, gameId);
}
let next = 0, completed = 0;
const processed = [];
try {
  await Promise.all(Array.from({ length: apply ? 1 : 4 }, async () => {
    while (next < selectedGroups.length) {
      const [gameId, entries] = selectedGroups[next++];
      const sources = await fetchSources(gameId, entries[0].value);
      if (sources.game.error || sources.book.error) report.gameFailures.push({ gameId, feed: sources.game.error, book: sources.book.error });
      const feedOfficials = (sources.game.officials || []).map(o => ({ official_id: String(o.personId || o.officialId || ""),
        official_name: [o.firstName, o.familyName || o.lastName].filter(Boolean).join(" ") }));
      const names = [...String(sources.book.officials || "").matchAll(/#(\d+)\s+([^,#]+)/g)].map(m => ({ jersey: m[1], name: m[2].trim() }));
      const crew = names.map((o, i) => {
        const found = feedOfficials.find(f => norm(f.official_name) === norm(o.name)) || knownOfficials.get(norm(o.name));
        return { game_id: gameId, official_id: found?.official_id || "", official_name: o.name,
          role_key: i === 0 ? "crewChief" : i === 1 ? "referee" : "umpire", assignment_order: i + 1 };
      });
      const fallbackAssignments = assignments.filter(a => a.game_id === gameId);
      const actualCrew = crew.length >= 3 ? crew : fallbackAssignments;
      const explicitChief = sources.boxscoreOfficials?.find(o => o.assignment === "OFFICIAL1");
      const chief = explicitChief ? { official_id: String(explicitChief.personId), official_name: explicitChief.name || [explicitChief.firstName, explicitChief.familyName].join(" ") }
        : actualCrew.find(a => a.role_key === "crewChief");
      const game = { ...sources.game, officials: actualCrew.map(o => ({ personId: o.official_id, fullName: o.official_name })) };
      const bookRows = parseGamebookChallenges(sources.book.pages || []);
      const usedBooks = new Set();
      const calls = sources.game.error ? [] : extractOfficialCallEvents(game).map(e => ({ game_id: gameId,
        period: e.period, game_clock: e.gameClock, action_number: e.actionNumber, order_number: e.orderNumber,
        action_type: e.actionType, primary_category: e.primaryCategory, secondary_category: e.secondaryCategory,
        sub_type: e.subType, descriptor: e.descriptor, description: e.description,
        official_id: e.officialId, official_name: e.officialName, charged_team: e.chargedTeam, source_payload: e.sourcePayload }));
      for (const { before, value } of entries) {
        const protectedRow = ["manual", "verified"].includes(before?.review_status);
        const clip = sources.game.error ? null : buildChallengeClockClip(value, game);
        const freshPayload = { ...value.source_payload };
        // Re-evaluate automatic evidence consistently. Otherwise the matcher's
        // protection of a previous book row can preserve an intentionally
        // cleared subtype and alternate between blank/known on every rerun.
        delete freshPayload.gamebookChallenge;
        const candidate = protectedRow ? value : { ...value, whistling_official_id: "", whistling_official_name: "",
          challenge_sub_type: "", source_payload: { ...freshPayload, officialMatcher: { version: "historical-revalidation" } } };
        // A PDF review clock does not necessarily identify the original play.
        // Only a possession-safe, category-compatible event can supply a whistle.
        const supportedCalls = clip?.url ? calls.filter(c => Number(c.action_number) === Number(clip.actionNumber)) : [];
        let after = enrichChallengeEventsWithOfficials([candidate], supportedCalls, actualCrew)[0];
        const selected = selectHistoricalBookEvidence(value, entries.map(p => p.value), bookRows);
        if (selected) usedBooks.add(selected.book);
        const selectedBooks = selected ? [selected.book] : [];
        if (selected && !protectedRow) {
          after.period = selected.book.period;
          after.game_clock = selected.book.gameClock;
        }
        after = reconcileGamebookChallenge(after, selectedBooks, actualCrew, sources.book.url);
        if (after.match_reason === "gamebook-vs-official-initial-call-conflict" && !supportedCalls.length && !protectedRow) {
          after.whistling_official_id = "";
          after.whistling_official_name = "";
        }
        if (chief && !protectedRow) {
          after.crew_chief_id = chief.official_id;
          after.crew_chief_name = chief.official_name;
        }
        // An unavailable source is not evidence that an existing assignment is
        // wrong. Do not clear attribution when either source failed to load.
        if (before && (sources.game.error || sources.book.error) && !after.whistling_official_id) {
          after.whistling_official_id = before.whistling_official_id;
          after.whistling_official_name = before.whistling_official_name;
          after.challenge_sub_type = before.challenge_sub_type;
          after.review_status = "needs_review";
        }
        after.source_payload = { ...after.source_payload, historicalReconciliation: {
          version: "historical-challenges-v1", inventoryVerified: Boolean(value.source_payload?.pdfRow),
          crewSource: crew === actualCrew ? sources.book.url : "existing-assignments",
          explicitChiefSource: explicitChief ? sources.boxscoreUrl : null,
          explicitChief: explicitChief ? { id: String(explicitChief.personId), name: chief.official_name } : null,
          officials: sources.book.officials || null, sourceFailure: Boolean(sources.game.error || sources.book.error),
          bookMatchReason: selected?.reason || null,
        } };
        if (!(after.whistling_official_id || after.whistling_official_name)) report.unresolvedAttributions.push({ id: after.id, gameId,
          period: after.period, clock: after.game_clock, type: after.challenge_type,
          reason: after.match_reason, bookToken: selected?.book.officialToken || "", bookExcerpt: selected?.book.excerpt || "" });
        const fields = ["game_id", "period", "game_clock", "season_type", "challenge_type", "initial_call", "call_ruling", "ruling_outcome", "challenge_outcome", "video_url",
          "crew_chief_id", "crew_chief_name", "whistling_official_id", "whistling_official_name", "matched_action_number", "matched_call_event_id",
          "challenge_sub_type", "match_confidence", "match_reason", "review_status", "source", "source_payload"];
        if (before && fields.filter(k => k !== "source_payload").every(k => isDeepStrictEqual(before[k] ?? null, after[k] ?? null))) {
          const priorEvidence = { ...before.source_payload }, nextEvidence = { ...after.source_payload };
          delete priorEvidence.officialMatcher;
          delete nextEvidence.officialMatcher;
          if (isDeepStrictEqual(priorEvidence, nextEvidence)) after.source_payload.officialMatcher = before.source_payload.officialMatcher;
        }
        const patch = Object.fromEntries(fields.map(k => [k, after[k] ?? null]));
        const differs = !before || fields.some(k => !isDeepStrictEqual(before[k] ?? null, patch[k]));
        if (differs) {
          const change = { id: after.id, gameId, period: after.period, clock: after.game_clock,
            inserted: !before, before: before ? Object.fromEntries(fields.filter(k => k !== "source_payload").map(k => [k, before[k]])) : null,
            evidenceChanges: Object.keys(after.source_payload).filter(k => !isDeepStrictEqual(before?.source_payload?.[k], after.source_payload[k])),
            after: Object.fromEntries(fields.filter(k => k !== "source_payload").map(k => [k, patch[k]])) };
          report.changed.push(change);
          if (apply) {
            // Persist this recovery journal before every mutation.
            await appendFile(path.join(directory, `${season}-${stamp}-journal.jsonl`), JSON.stringify(change) + "\n");
            const query = before ? db.from("nba_coach_challenge_events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", before.id).eq("updated_at", before.updated_at)
              : db.from("nba_coach_challenge_events").insert({ ...after, ...patch });
            const { data, error } = await query.select("id");
            if (error || data?.length !== 1) throw Error(error?.message || `Concurrent edit for ${after.id}`);
            report.applied++;
          }
        } else report.unchanged++;
        processed.push(after);
      }
      for (const b of bookRows.filter(b => !usedBooks.has(b))) report.bookOnlyChallenges.push({ gameId, ...b });
      completed++;
      if (completed % 25 === 0 || completed === selectedGroups.length) {
        console.log(`${season}: ${completed}/${selectedGroups.length} games, ${report.gameFailures.length} source failures`);
        await writeFile(path.join(directory, `${season}-${stamp}-report.json`), JSON.stringify(report));
      }
    }
  }));
} finally { await rm(work, { recursive: true, force: true }); }
report.coverageAfter = { processed: processed.length, missingWhistle: processed.filter(r => !(r.whistling_official_id || r.whistling_official_name)).length,
  missingChief: processed.filter(r => !(r.crew_chief_id || r.crew_chief_name)).length,
  needsReview: processed.filter(r => r.review_status === "needs_review").length,
  bookEvidence: processed.filter(r => r.source_payload?.gamebookChallenge).length };
await writeFile(path.join(directory, `${season}-${stamp}-report.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, missingFromDatabase: report.missingFromDatabase.length, missingFromDisplay: report.missingFromDisplay.length,
  sourceDisagreements: report.sourceDisagreements.length, changed: report.changed.length, bookOnlyChallenges: report.bookOnlyChallenges.length }, null, 2));
