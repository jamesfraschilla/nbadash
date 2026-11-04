import test from "node:test";
import assert from "node:assert/strict";
import {challengeClockCoverage} from "./challengeClockCoverage.js";
test("Clock coverage counts missing and outdated links separately from PDF Video and attribution",()=>{
  const rows=[{game_id:"0022600015",review_status:"needs_review",source_payload:{clockLinkVersion:4,clockClipUrl:"https://clips.nba.com/?gameNo=0022600015"}},
    {game_id:"0022600015",video_url:"https://dmmx2.nba.com/video",source_payload:{clockLinkVersion:4,clockLinkReason:"original-play-not-identifiable"}},
    {game_id:"0022600015",source_payload:{clockLinkVersion:3,clockLinkReason:"game-mismatch"}}];
  assert.deepEqual(challengeClockCoverage(rows),{total:3,linked:1,missing:2,outdated:1,reasons:{"original-play-not-identifiable":1,"game-mismatch":1}});
});
