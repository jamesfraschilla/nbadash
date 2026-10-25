import assert from "node:assert/strict";
import test from "node:test";
import { verifiedChallengeVideoUrl } from "./officiatingChallengeLinks.js";

test("challenge video links require a resolved URL instead of the replay marker action number", () => {
  assert.equal(verifiedChallengeVideoUrl({
    source: "play_by_play",
    game_id: "0012600060",
    matched_action_number: 259,
  }), null);

  assert.equal(verifiedChallengeVideoUrl({
    source: "play_by_play",
    video_url: "https://www.nba.com/stats/events?GameID=0012600019&GameEventID=371",
  }), "https://www.nba.com/stats/events?GameID=0012600019&GameEventID=371");

  assert.equal(verifiedChallengeVideoUrl({
    source: "nba_official_challenge_log",
    video_url: "https://www.nba.com/stats/events?GameID=0012600060&GameEventID=255",
  }), "https://www.nba.com/stats/events?GameID=0012600060&GameEventID=255");
});
