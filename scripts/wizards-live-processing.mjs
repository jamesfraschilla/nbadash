import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { aggregateSegmentStats, countPossessionsByTeam } from '../src/segmentStats.js';
const root=path.resolve(process.env.AUDIT_OUTPUT);
const batch=JSON.parse(await fs.readFile(path.join(root,'latest.json'),'utf8'));
const record=batch.results.find(x=>x.source==='dashboard_game');
const output={sampledAt:batch.sampledAt,gameId:batch.gameId};
try {
  if(!record?.snapshot || record.error)throw Error('Dashboard game unavailable');
  const game=JSON.parse(gunzipSync(await fs.readFile(path.join(root,record.snapshot))).toString()).game;
  const actions=game.playByPlayActions||[];
  if(Number(game.gameStatus)===2&&!actions.length)throw Error('Live play-by-play empty');
  const basePlayers=['home','away'].flatMap(side=>(game.boxScore?.[side]?.players||[]).map(p=>({...p,teamId:game[`${side}Team`].teamId})));
  const d=aggregateSegmentStats({gameId:game.gameId,actions,segment:'all',minutesData:null,homeTeam:game.homeTeam,awayTeam:game.awayTeam,basePlayers,currentPeriod:game.period,currentClock:game.gameClock,isLive:Number(game.gameStatus)===2});
  output.status='processed';output.period=game.period;output.clock=game.gameClock;output.playCount=actions.length;
  output.possessions=countPossessionsByTeam(actions,'all',game.homeTeam.teamId,game.awayTeam.teamId);
  output.teams=Object.fromEntries(['away','home'].map(side=>{const team=game[`${side}Team`],box=game.boxScore?.[side]?.totals||{},calc=d.teamTotals[team.teamId]||{};return [side,{score:team.score,boxPoints:box.points,computedPoints:calc.points,boxFGM:box.fieldGoalsMade,computedFGM:calc.fieldGoalsMade}]}));
}catch(e){output.status='unavailable';output.error=e.message;}
await fs.appendFile(path.join(root,'processing.jsonl'),JSON.stringify(output)+'\n');
console.log('DASHBOARD_PROCESSING',JSON.stringify(output));
