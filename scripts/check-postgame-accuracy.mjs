import { fetchNbaMinutes } from "../supabase/functions/_shared/nbaMinutes.js";
import { fetchScoreboard } from "../supabase/functions/_shared/scoreboard.js";
// Daily read-only sample: every recent WAS final plus three other NBA finals.
// No model calls, cache refreshes, original-call guesses, or database writes.
import {mkdir,writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createClient} from "@supabase/supabase-js";
import {fetchRecoverableGame} from "../supabase/functions/_shared/nbaLiveRecovery.ts";
import {normalizeOpeningMinutesData} from "../supabase/functions/_shared/minutesNormalization.ts";
import {buildCompletedPeriodSnapshots} from "../src/periodSnapshotTotals.js";
import {buildMinutesExplorer} from "../src/minutesExplorer.js";
const runFile=promisify(execFile);
const db=createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const report={checkedAt:new Date().toISOString(),scope:"Recent WAS finals and three other NBA finals; not exhaustive league-wide certification",findings:[],games:[]};
function data(result){if(result.error)throw Error(result.error.message);return result.data;}
const isWas=game=>[game.homeTeam,game.awayTeam].some(team=>String(team?.teamId)==="1610612764" || team?.teamTricode==="WAS");
const games=new Map();
for(let offset=1;offset<=2;offset++) {
  try {
    const date=new Date(Date.now()-offset*86400000).toLocaleDateString("en-CA",{timeZone:"America/New_York"});
    // This audit samples NBA finals. A transient or unavailable G League
    // scoreboard must not prevent NBA games from being enumerated.
    let list;
    for (let attempt=0; attempt<3; attempt++) {
      try { list=await fetchScoreboard(date, process.env.NBA_API_KEY, ["00"]); break; }
      catch (error) {
        if (attempt===2) throw new Error(`NBA scoreboard ${date}: ${error.message}`);
        await new Promise(resolve=>setTimeout(resolve, 500*(attempt+1)));
      }
    }
    if(!Array.isArray(list))throw Error("Invalid scoreboard contract");
    for(const g of list)if(Number(g.gameStatus)===3 && /^00[24]/.test(String(g.gameId)))games.set(String(g.gameId),g);
  } catch(error) {
    report.findings.push({key:`postgame-scoreboard-${offset}`,severity:"error",message:`Cannot enumerate recent completed NBA games: ${error.message}`});
  }
}
const selected=[...games].filter(([,g])=>isWas(g)).concat([...games].filter(([,g])=>!isWas(g)).slice(0,3));
for(const [gameId,listed] of selected) {
  const check={gameId,wizards:isWas(listed),checks:[],complete:false};report.games.push(check);
  const finding=(suffix,message,severity="error")=>report.findings.push({key:`postgame:${gameId}:${suffix}`,severity,message:`${gameId}: ${message}`,
    url:`https://jamesfraschilla.github.io/nbadash/#/g/${gameId}`});
  try {
    const game=await fetchRecoverableGame(gameId);
    const expected=buildCompletedPeriodSnapshots(game);
    const saved=data(await db.from("period_snapshots").select("period,team_id,totals").eq("game_id",gameId));
    if(expected.length!==Number(game.period)*2)finding("period-endings","Incomplete verified period-ending coverage.");
    const mismatches=[];
    for(const row of expected) {
      const old=saved.find(s=>Number(s.period)===row.period && String(s.team_id)===String(row.team_id));
      if(!old){mismatches.push(`P${row.period}/${row.team_id}: missing`);continue;}
      for(const [key,value] of Object.entries(row.totals))if(!key.startsWith("_") && old.totals?.[key]!==value)mismatches.push(`P${row.period}/${row.team_id}/${key}`);
    }
    if(mismatches.length)finding("snapshots",`${mismatches.length} saved snapshot fields/rows differ from current verified PBP. First: ${mismatches.slice(0,8).join(", ")}`);
    const metrics=["points","fieldGoalsMade","fieldGoalsAttempted","threePointersMade","threePointersAttempted","freeThrowsMade","freeThrowsAttempted","assists","steals","blocks","turnovers"];
    for(const side of ["home","away"]) {
      const final=expected.find(row=>row.period===Number(game.period) && String(row.team_id)===String(game[`${side}Team`].teamId));
      const box=game.boxScore?.[side]?.totals || {};
      const wrong=metrics.filter(key=>box[key]!=null && final?.totals[key]!==Number(box[key]));
      if(wrong.length)finding(`box-${side}`,`PBP-derived full-game totals differ from the box score: ${wrong.join(", ")}.`);
    }
    check.checks.push("period snapshots and PBP/box totals compared");
    const crew=data(await db.from("nba_official_game_assignments").select("role_key,is_alternate").eq("game_id",gameId));
    const active=crew.filter(r=>!r.is_alternate);
    if(active.length!==3 || active.filter(r=>r.role_key==="crewChief").length!==1)finding("crew","Stored active crew does not contain exactly three officials and one crew chief.");
    const calls=data(await db.from("nba_official_call_events").select("id").eq("game_id",gameId).limit(1));
    if(!calls.length)finding("call-ingestion","No officiating call events were stored for this final game.");
    if(check.wizards) {
      const minutes=normalizeOpeningMinutesData(await fetchNbaMinutes(game, process.env.NBA_API_KEY),game);
      for(const issue of buildMinutesExplorer(minutes,game).issues)finding("minutes",issue);
      check.checks.push("minutes, lineup and player +/- reconciliation checked");
      const recaps=data(await db.from("game_analysis_segments").select("segment_key,source").eq("game_id",gameId));
      const required=["all","q1","q2","q3","q4","q1-q3","first-half","second-half"];
      const missing=required.filter(key=>!recaps.some(r=>r.segment_key===key));
      if(missing.length)finding("missing-analysis",`Missing saved analyses: ${missing.join(", ")}.`);
      const fallback=recaps.filter(r=>r.source!=="ai").length;
      if(fallback)finding("analysis-quality",`${fallback} saved analyses use factual template fallbacks. Quality review is needed; this alone is not evidence of incorrect statistics.`,"warning");
      const {stdout}=await runFile("npx",["-y","deno","run","--allow-env","--allow-net","--allow-read","--config","supabase/deno.json","scripts/verify-analysis-records.ts",gameId],{timeout:90000,maxBuffer:2*1024*1024});
      for(const line of stdout.trim().split("\n").filter(Boolean)) {
        const result=JSON.parse(line);
        if(result.rejectReasons?.length)finding(`analysis-${result.segment}`,`Saved ${result.segment} analysis fails factual checks: ${result.rejectReasons.join("; ")}`);
      }
      check.checks.push("saved analysis factual guards replayed without model calls");
    }
    check.complete=true;
  } catch(error){finding("incomplete",`Audit could not complete: ${error.message}`);}
}
await mkdir("output/operations-health",{recursive:true});
await writeFile("output/operations-health/postgame.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,`## Daily accuracy sample\n\n${report.scope}.\n\n${report.games.length} games; ${report.findings.length} findings. Full report in artifacts. No AI generation or production writes.\n`,{flag:"a"});
if(report.findings.some(f=>f.severity==="error"))process.exitCode=1;
