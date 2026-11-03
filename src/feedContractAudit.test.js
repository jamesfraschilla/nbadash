import test from "node:test";
import assert from "node:assert/strict";
import {auditGame} from "../scripts/audit-nba-feed-contract.mjs";
function fixture(){
  const totals=Object.fromEntries(["points","fieldGoalsMade","fieldGoalsAttempted","threePointersMade","threePointersAttempted",
    "freeThrowsMade","freeThrowsAttempted","reboundsTotal","reboundsOffensive","assists","turnovers","blocks","steals","foulsPersonal",
    "midFieldGoalsMade","midFieldGoalsAttempted"].map(key=>[key,0]));
  return {gameId:"0022600162",gameStatus:3,period:4,homeTeam:{teamId:1},awayTeam:{teamId:2},
    playByPlayActions:[{actionNumber:1,actionType:"period",subType:"end",period:4,clock:"PT00M00.00S",scoreHome:"0",scoreAway:"0"}],
    boxScore:{home:{totals:{...totals},players:[]},away:{totals:{...totals},players:[]}},feedAvailability:{source:"nba-pbp-backup"}};
}
const officials={officials:[{assignment:"OFFICIAL1"},{assignment:"OFFICIAL2"},{assignment:"OFFICIAL3"}]};
test("contract audit checks recovered data but retains an explicit primary-source warning",()=>{
  const result=auditGame(fixture(),officials);
  assert.deepEqual(result.errors,[]);
  assert.match(result.warnings[0],/Primary feed is degraded/);
});
test("using a backup never suppresses empty PBP or genuine statistical mismatches",()=>{
  const game=fixture();game.playByPlayActions=[];
  assert.ok(auditGame(game,officials).errors.includes("play-by-play is empty"));
  game.playByPlayActions=fixture().playByPlayActions;
  game.boxScore.home.totals.points=1;
  assert.ok(auditGame(game,officials).errors.some(e=>e.includes("home points does not reconcile")));
});
test("an omitted raw challenge outcome remains a source warning requiring independent reconciliation",()=>{
  const game=fixture();
  game.homeTeam.teamTricode="HOM";game.awayTeam.teamTricode="AWY";
  game.playByPlayActions.unshift({actionNumber:0,actionType:"timeout",subType:"challenge",period:4,clock:"PT01M00.00S",teamId:1,teamTricode:"HOM",description:"HOM Timeout"});
  const result=auditGame(game,officials);
  assert.deepEqual(result.errors,[]);
  assert.ok(result.warnings.some(message=>message.includes("gamebook/PDF reconciliation")));
});
