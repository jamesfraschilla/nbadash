import { fetchNbaMinutes } from "../supabase/functions/_shared/nbaMinutes.js";
import { fetchNbaGame } from "../supabase/functions/_shared/nbaGame.js";
// Read-only replay of saved recaps through current feature extraction/guards.
import { __test__ } from "../supabase/functions/game-analysis/index.ts";
import { normalizeOpeningMinutesData } from "../supabase/functions/_shared/minutesNormalization.ts";
const gameId = Deno.args.find(arg=>/^\d{10}$/.test(arg)) || "0022600162";
const envDir = Deno.env.get("NBA_DASH_ENV_DIR") || ".";
for (const file of [".env", ".env.local"]) {
  const content = await Deno.readTextFile(`${envDir}/${file}`).catch(()=>"");
  for (const line of content.split("\n")) {
    const match = /^(VITE_SUPABASE_URL|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=(.*)$/.exec(line);
    if (match && !Deno.env.get(match[1])) Deno.env.set(match[1],match[2].replace(/^["']|["']$/g,""));
  }
}
const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("Read credentials missing");
const request = async (url:string, options:RequestInit={})=>{
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};
const game=await fetchNbaGame(gameId, process.env.NBA_API_KEY);
const proxy=await request(`${url}/functions/v1/game-metadata`,{method:"POST",headers:{apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify({playByPlayGameId:gameId})});
if(String(game.gameId)!==gameId||String(proxy.game?.gameId)!==gameId||!proxy.game.actions?.length)throw new Error("Invalid game or PBP identity");
game.playByPlayActions=proxy.game.actions;
const minutes=normalizeOpeningMinutesData(await fetchNbaMinutes(game, process.env.NBA_API_KEY),game);
const rows=await request(`${url}/rest/v1/game_analysis_segments?game_id=eq.${gameId}&select=segment_key,result,source`,{headers:{apikey:key,authorization:`Bearer ${key}`}});
const ranges:Record<string,number[]>={q1:[1,1],q2:[2,2],q3:[3,3],q4:[4,4],"first-half":[1,2],"second-half":[3,4],"q1-q3":[1,3],all:[1,Number(game.period)]};
for(const row of rows){
  const [minPeriod,maxPeriod]=ranges[row.segment_key]||[];
  if(!minPeriod)continue;
  const features=__test__.buildFeaturePayload(game,minutes,{minPeriod,maxPeriod,minClock:"12:00",maxClock:"0:00"});
  const repaired=__test__.repairBareShootingPercentages(row.result,features) as Record<string,unknown>;
  console.log(JSON.stringify({gameId,segment:row.segment_key,source:row.source,score:features.score,
    largestRuns:{home:features.teams.home.largestRun,away:features.teams.away.largestRun},
    rejectReasons:__test__.findAiAnalysisRejectReasons(repaired,features)}));
}
