import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {isDeepStrictEqual} from "node:util";
import {createClient} from "@supabase/supabase-js";
import {fetchRecoverableGame} from "../supabase/functions/_shared/nbaLiveRecovery.ts";
import {buildChallengeClockClip,CHALLENGE_CLOCK_LINK_VERSION,challengeClockClipUrl,challengeLinkIdentity} from "../src/officiatingChallengeLinks.js";
import {assertOutsideWizardsGameWindow} from "./lib/game-window-guard.mjs";
const arg=(key,fallback="")=>process.argv.find(v=>v.startsWith(`--${key}=`))?.slice(key.length+3)||fallback;
const season=arg("season","2026-27"),apply=process.argv.includes("--apply");
if(apply)await assertOutsideWizardsGameWindow("challenge Clock link repair");
const db=createClient(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth:{persistSession:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)})}});
const rows=[];
for(let offset=0;;offset+=1000){
  const {data,error}=await db.from("nba_coach_challenge_events").select("*").eq("season",season).order("id").range(offset,offset+999);
  if(error)throw error;rows.push(...data);if(data.length<1000)break;
}
const cutoff=arg("lookback-days")?new Date(Date.now()-Number(arg("lookback-days"))*86400000).toISOString().slice(0,10):"";
const selected=rows.filter(r=>(!arg("game-ids")||arg("game-ids").split(",").includes(r.game_id))
  && (!process.argv.includes("--missing-only")||!challengeClockClipUrl(r))
  && (!cutoff||r.game_date>=cutoff||process.argv.includes("--retry-missing")&&!challengeClockClipUrl(r)));
const directory=path.resolve("output/challenge-clock-repair",new Date().toISOString().replace(/[:.]/g,"-"));
await mkdir(directory,{recursive:true});
// Preserve complete records before touching only timestamp-link metadata.
await writeFile(path.join(directory,"before.json"),JSON.stringify(selected,null,2));
const report={season,apply,version:CHALLENGE_CLOCK_LINK_VERSION,records:selected.length,games:0,changed:[],failures:[],unavailable:[],unchanged:0};
const save=()=>writeFile(path.join(directory,"report.json"),JSON.stringify(report,null,2));
for(const[gameId,group]of Map.groupBy(selected,r=>r.game_id)){
  let game;
  try{game=await fetchRecoverableGame(gameId);report.games++;}
  catch(error){report.failures.push({gameId,error:error.message});await save();continue;}
  const officialRows=rows.filter(r=>r.game_id===gameId&&r.source==="nba_official_challenge_pdf");
  for(const before of group){
    // The same incident's PDF evidence can support a PBP sibling without
    // changing that sibling's source, official attribution or Video column.
    const sources=officialRows.filter(r=>challengeLinkIdentity(r)===challengeLinkIdentity(before));
    const official=sources.length===1?sources[0]:null;
    const candidate=official?{...before,source:official.source,
      source_payload:{...before.source_payload,pdfRow:official.source_payload.pdfRow}}:before;
    const clip=buildChallengeClockClip(candidate,game);
    const payload={...before.source_payload,clockClipUrl:clip.url,clockLinkReason:clip.reason,
      clockLinkActionNumber:clip.actionNumber,clockLinkVersion:CHALLENGE_CLOCK_LINK_VERSION};
    // No statistical or attribution fields, IDs, user annotations or Video URLs
    // are included in this patch. Optimistic revision checks prevent lost edits.
    if(!clip.url)report.unavailable.push({id:before.id,gameId,period:before.period,clock:before.game_clock,reason:clip.reason});
    if(isDeepStrictEqual(payload,before.source_payload)){report.unchanged++;continue;}
    report.changed.push({id:before.id,gameId,period:before.period,clock:before.game_clock,
      before:challengeClockClipUrl(before),after:clip.url,reason:clip.reason});
    if(apply){
      const result=await db.from("nba_coach_challenge_events").update({source_payload:payload,updated_at:new Date().toISOString()})
        .eq("id",before.id).eq("updated_at",before.updated_at).select("id");
      if(result.error||result.data?.length!==1){await save();throw new Error(result.error?.message||`Concurrent update ${before.id}`);}
    }
  }
  await save();
}
await save();
console.log(JSON.stringify({directory,apply,records:report.records,games:report.games,changed:report.changed.length,
  recovered:report.changed.filter(r=>!r.before&&r.after).length,removed:report.changed.filter(r=>r.before&&!r.after).length,
  failures:report.failures,unavailable:report.unavailable.length}));
// Unavailable evidence is retained for monitoring, not a guessed clip or a
// failed statistical repair. Processing failures are separate from omissions.
if(report.failures.length)console.warn(`Source unavailable for ${report.failures.length} games; see report.`);
