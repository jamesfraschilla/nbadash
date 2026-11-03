// Independent arithmetic replay of selected alert families from an audit file.
// This is not an assertion that the untested alert families are correct.
import {readFile, writeFile} from "node:fs/promises";
const filename=process.argv.find(a=>a.startsWith("--report="))?.slice(9);
if(!filename)throw new Error("--report=<audit-game-dashboard JSON> is required");
const report=JSON.parse(await readFile(filename,"utf8"));
if(!/^002\d{7}$/.test(String(report.gameId)))throw new Error("This scoring replay is scoped to NBA regular-season games");
const remaining=clock=>{
  const m=String(clock).match(/^PT(?:(\d+)M)?([\d.]+)S$/) || String(clock).match(/^(\d+):([\d.]+)$/);
  if(!m)throw new Error(`Unrecognized clock ${clock}`);
  return Number(m[1]||0)*60+Number(m[2]);
};
const actions=[...report.game.playByPlayActions].sort((a,b)=>Number(a.period)-Number(b.period)
  || remaining(b.clock)-remaining(a.clock) || Number(a.orderNumber??a.actionNumber)-Number(b.orderNumber??b.actionNumber));
const points=a=>a.shotResult!=="Made"?0:a.actionType==="3pt"?3:a.actionType==="2pt"?2:a.actionType==="freethrow"?1:0;
const result={gameId:report.gameId,checked:[],failures:[],uncheckedCategories:[]};
for(const alert of report.allAlerts){
  let expected,actual;
  if(alert.category==="Run"){
    const [,end,start,own,other]=alert.id.split(":");
    const first=actions.findIndex(a=>String(a.actionNumber)===start),last=actions.findIndex(a=>String(a.actionNumber)===end);
    if(first<0||last<first)throw new Error(`Unresolved run anchors ${alert.id}`);
    const window=actions.slice(first,last+1);
    expected=[window.filter(a=>String(a.teamId)===String(alert.teamId)).reduce((n,a)=>n+points(a),0),
      window.filter(a=>String(a.teamId)!==String(alert.teamId)).reduce((n,a)=>n+points(a),0)];
    actual=[Number(own),Number(other)];
  }else if(alert.category==="Player Impact"){
    const [,anchor,player]=alert.id.split(":");
    const end=actions.findIndex(a=>String(a.actionNumber)===anchor);
    if(end<0)throw new Error(`Unresolved impact anchor ${alert.id}`);
    const window=actions.slice(0,end+1).filter(a=>Number(a.period)===Number(alert.period)&&String(a.teamId)===String(alert.teamId));
    const teamPoints=window.reduce((n,a)=>n+points(a),0);
    const created=window.filter(a=>String(a.personId)===player||String(a.assistPersonId)===player).reduce((n,a)=>n+points(a),0);
    expected=[Math.round(1000*created/teamPoints)/10];
    actual=[Number(alert.title.match(/([\d.]+)%/)?.[1])];
  }else if(["Quarter","Halftime","Final"].includes(alert.category)){
    const period=alert.category==="Final"?Number(report.game.period):Number(alert.period);
    const window=actions.filter(a=>Number(a.period)<=period);
    expected=[report.game.homeTeam,report.game.awayTeam].map(t=>window.filter(a=>String(a.teamId)===String(t.teamId)).reduce((n,a)=>n+points(a),0)).sort((a,b)=>b-a);
    const score=alert.title.match(/(\d+)-(\d+)/);
    if(!score){result.uncheckedCategories.push(alert.category);continue;}
    actual=score.slice(1).map(Number);
  }else{result.uncheckedCategories.push(alert.category);continue;}
  result.checked.push({id:alert.id,category:alert.category,expected,actual});
  if(JSON.stringify(expected)!==JSON.stringify(actual))result.failures.push(result.checked.at(-1));
}
result.uncheckedCategories=[...new Set(result.uncheckedCategories)];
await writeFile(filename.replace(/\.json$/,"-alert-evidence.json"),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
if(result.failures.length)process.exitCode=1;
