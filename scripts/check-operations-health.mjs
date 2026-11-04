// Read-only, bounded checks. Does not regenerate AI, run aggregates, or repair
// production. GitHub notification publishing is a separate explicit step.
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createClient} from "@supabase/supabase-js";
import {discoverChallengeReviewDocuments,isChallengeSeasonPage} from "../src/officiatingChallengeDiscovery.js";
import {MONITORED_WORKFLOWS,workflowHealthIssues,pdfImportComplete,cacheIsStale} from "../src/operationsHealth.js";
import {challengeClockCoverage} from "../src/challengeClockCoverage.js";
import {challengeNeedsReview,challengeReviewState} from "../src/challengeReview.js";

const report={checkedAt:new Date().toISOString(),findings:[],checks:[],reviewQueue:[]};
const season="2026-27", repo=process.env.GITHUB_REPOSITORY || "jamesfraschilla/nbadash";
const token=process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const db=url&&key?createClient(url,key,{auth:{persistSession:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}}):null;
async function response(url,options={}) {
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(`HTTP ${r.status}`);
  return r;
}
async function check(key,operation) {
  try { await operation();report.checks.push({key,status:"completed"}); }
  catch(error) { report.findings.push({key,severity:"error",message:`${key}: ${error.message}`});report.checks.push({key,status:"failed"}); }
}
function data(result) {if(result.error)throw Error(result.error.message);return result.data;}
await check("workflow-health",async()=>{
  if(!token)throw Error("GitHub read credential missing");
  for(const workflow of MONITORED_WORKFLOWS) {
    const j=await(await response(`https://api.github.com/repos/${repo}/actions/workflows/${workflow.file}/runs?branch=main&per_page=30`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json"}})).json();
    report.findings.push(...workflowHealthIssues(workflow,j.workflow_runs || []));
  }
});
await check("official-pdf-import",async()=>{
  if(!db)throw Error("Database read credential missing");
  const headers={"User-Agent":"Mozilla/5.0 (compatible; NBA Dashboard Operations)",Accept:"text/html,application/pdf,*/*"};
  let page,html;
  for(const candidate of [`https://official.nba.com/${season}-nba-coachs-challenge-reviews/`,"https://official.nba.com/2025-26-nba-coachs-challenge-reviews/"]) {
    const r=await fetch(candidate,{headers,signal:AbortSignal.timeout(20000)});
    if(r.status===404)continue;
    if(!r.ok)throw Error(`Season page HTTP ${r.status}`);
    const content=await r.text();
    if(isChallengeSeasonPage(content,season)){page=candidate;html=content;break;}
  }
  if(!page)throw Error("No verifiable current-season challenge page found");
  const documents=discoverChallengeReviewDocuments(html,page);
  if(!documents.length)throw Error("Current-season page has no reviews-by-day document");
  for(const document of documents) {
    const pdf=Buffer.from(await(await response(document.url,{headers})).arrayBuffer());
    const hash=createHash("sha256").update(pdf).digest("hex");
    const query=await db.from("nba_coach_challenge_events").select("source_payload",{count:"exact"})
      .eq("season",season).eq("source","nba_official_challenge_pdf").contains("source_payload",{pdfSha256:hash}).limit(1);
    const rows=data(query), expectedRows=rows[0]?.source_payload?.expectedDocumentRows;
    const completed=await db.from("nba_coach_challenge_events").select("id",{count:"exact",head:true})
      .eq("season",season).eq("source","nba_official_challenge_pdf").contains("source_payload",{pdfSha256:hash,importComplete:true});
    data(completed);
    const completeCount=completed.count;
    if(!pdfImportComplete({count:query.count,expectedRows,completeCount}))report.findings.push({key:`pdf:${document.kind}`,severity:"error",
      message:`Published ${document.kind} PDF is not fully imported: ${query.count || 0}/${expectedRows || "unknown"} matching rows; ${completeCount} marked complete.`,url:document.url});
  }
});
await check("officiating-cache-freshness",async()=>{
  if(!db)throw Error("Database read credential missing");
  const [cache]=data(await db.from("nba_officiating_cache_refreshes").select("status,refreshed_at").eq("cache_name",`season:${season}`));
  if(!cache || cache.status!=="success")throw Error("Current-season cache has no successful refresh marker");
  for(const table of ["nba_coach_challenge_events","nba_official_call_events","nba_official_game_assignments"]) {
    const [latest]=data(await db.from(table).select("updated_at").eq("season",season).order("updated_at",{ascending:false}).limit(1));
    if(cacheIsStale(latest?.updated_at,cache.refreshed_at))report.findings.push({key:`cache:${table}`,severity:"error",message:`Current-season statistics cache is behind ${table} by more than the 30-minute grace period.`});
  }
});
await check("challenge-review-queue",async()=>{
  if(!db)throw Error("Database read credential missing");
  report.reviewQueue=data(await db.from("nba_authoritative_coach_challenge_events_cache")
    .select("id,game_id,period,game_clock,match_reason,review_status,gamebook_conflict_kind:source_payload->gamebookSourceConflict->>kind").eq("season",season).eq("review_status","needs_review").limit(1000));
  report.reviewSummary=Object.fromEntries([...Map.groupBy(report.reviewQueue,challengeReviewState)].map(([kind,rows])=>[kind,rows.length]));
  const actionable=report.reviewQueue.filter(challengeNeedsReview);
  const omissions=report.reviewSummary.whistle_unavailable||0;
  if(actionable.length)report.findings.push({key:"challenge-review-queue",severity:"warning",
    message:`${actionable.length} authoritative challenges need source-backed investigation; ${omissions} additional gamebook-confirmed calls have no published whistle and are tracked separately. Automated retry is not adjudication.`,
    url:"https://jamesfraschilla.github.io/nbadash/#/officiating?tab=challenge-log&season=2026-27"});
});
await check("challenge-required-fields",async()=>{
  if(!db)throw Error("Database read credential missing");
  for(const [field,filter] of [["crew chief","and(or(crew_chief_id.is.null,crew_chief_id.eq.),or(crew_chief_name.is.null,crew_chief_name.eq.))"],
    ["team","challenging_team.is.null,challenging_team.eq."],["outcome","challenge_outcome.is.null,challenge_outcome.eq."]]) {
    const result=await db.from("nba_authoritative_coach_challenge_events_cache").select("id",{head:true,count:"exact"}).eq("season",season).or(filter);
    data(result);
    if(result.count)report.findings.push({key:`challenge-missing:${field}`,severity:"error",message:`${result.count} authoritative challenge records are missing a ${field}.`});
  }
});
await check("challenge-clock-coverage",async()=>{
  if(!db)throw Error("Database read credential missing");
  const rows=[];
  for(let offset=0;;offset+=1000){
    const page=data(await db.from("nba_authoritative_coach_challenge_events_cache")
      .select("id,game_id,clock_clip_url:source_payload->>clockClipUrl,clock_link_version:source_payload->>clockLinkVersion,clock_link_reason:source_payload->>clockLinkReason")
      .eq("season",season).order("id").range(offset,offset+999));
    rows.push(...page);if(page.length<1000)break;
  }
  report.clockCoverage=challengeClockCoverage(rows);
  if(report.clockCoverage.missing||report.clockCoverage.outdated)report.findings.push({key:"challenge-clock-coverage",severity:"warning",
    message:`Challenge Clock links: ${report.clockCoverage.linked}/${report.clockCoverage.total} present; ${report.clockCoverage.missing} unavailable; ${report.clockCoverage.outdated} await the current matcher. Missing links need timing evidence, not guessed timestamps. Link presence does not verify NBA playback availability.`,
    url:"https://jamesfraschilla.github.io/nbadash/#/officiating?tab=challenge-log&season=2026-27"});
});
await check("dashboard-availability",async()=>{
  const file=JSON.parse(await readFile("output/dashboard-health/availability.json","utf8"));
  for(const [severity,values] of [["error",file.failures],["warning",file.warnings]]) for(const [index,message] of (values || []).entries()) {
    report.findings.push({key:`dashboard:${severity}:${index}`,severity,message});
  }
});
await mkdir("output/operations-health",{recursive:true});
await writeFile("output/operations-health/latest.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({checkedAt:report.checkedAt,checks:report.checks,findings:report.findings}));
if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,
  `## Operations health\n\n${report.findings.filter(f=>f.severity==="error").length} errors; ${report.findings.filter(f=>f.severity==="warning").length} warnings. No automated statistical attribution or production repairs performed.\n\n${report.findings.map(f=>`- **${f.severity}** ${f.message}${f.url?` [Details](${f.url})`:""}`).join("\n")}\n`,{flag:"a"});
if(report.findings.some(f=>f.severity==="error"))process.exitCode=1;
