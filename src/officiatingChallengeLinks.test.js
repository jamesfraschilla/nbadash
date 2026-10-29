import assert from "node:assert/strict";
import test from "node:test";
import { verifiedChallengeVideoUrl, buildChallengeClockClipUrl, challengeClockClipUrl, challengeLinkIdentity } from "./officiatingChallengeLinks.js";

test("Video is withheld until that challenge has a published PDF clip", () => {
  assert.equal(verifiedChallengeVideoUrl({
    source: "play_by_play",
    game_id: "0012600060",
    matched_action_number: 259,
  }), null);

  assert.equal(verifiedChallengeVideoUrl({
    source: "play_by_play",
    video_url: "https://www.nba.com/stats/events?GameID=0012600019&GameEventID=371",
  }), null);

  assert.equal(verifiedChallengeVideoUrl({
    source: "nba_official_challenge_log",
    video_url: "https://www.nba.com/stats/events?GameID=0012600060&GameEventID=255",
  }), null);
  const published = "https://dmmx2.nba.com/videourlredirect?&project=/ON-AIR/0022600118_20261025_211929";
  assert.equal(verifiedChallengeVideoUrl({ source: "nba_official_challenge_pdf", video_url: published }), published);
  assert.equal(verifiedChallengeVideoUrl({ source: "play_by_play", video_url: published }), null);
  for (const video_url of ["https://clips.nba.com/?gameNo=0022600118", "https://www.nba.com/stats/events?GameID=0022600118",
    "https://dmmx2.nba.com.example.com/clip", "javascript:alert(1)", "not a URL", ""]) {
    assert.equal(verifiedChallengeVideoUrl({ source: "nba_official_challenge_pdf", video_url }), null);
  }
});

test("official Video and timestamp-based Clock remain distinct, in any team's game", () => {
  const row = { game_id: "0022600118", period: 1, game_clock: "07:26.0", source: "nba_official_challenge_pdf",
    video_url: "https://dmmx2.nba.com/videourlredirect?&project=/ON-AIR/0022600118_20261025_211929" };
  const game = { gameId: row.game_id, playByPlayActions: [
    { actionNumber: 1, period: 1, clock: "PT07M26.00S", actionType: "foul", timeActual: "2026-10-26T01:19:29Z" },
    { actionNumber: 2, period: 1, clock: "PT07M26.00S", actionType: "instantreplay", timeActual: "2026-10-26T01:21:00Z" },
  ] };
  const clip = buildChallengeClockClipUrl(row, game);
  assert.equal(clip, "https://clips.nba.com/?gameNo=0022600118&inTime=21191900&outTime=21193900&source=grs");
  assert.equal(verifiedChallengeVideoUrl(row), row.video_url);
  assert.equal(challengeClockClipUrl({ ...row, clock_clip_url: clip }), clip);
  assert.equal(challengeClockClipUrl(row), null);
  assert.equal(buildChallengeClockClipUrl({ ...row, period: 2 }, game), null);
  assert.equal(buildChallengeClockClipUrl(row, { ...game, gameId: "0022600119" }), null);
});

test("PBP Clock prefers the challenged action, not an unrelated review-timestamp fallback", () => {
  const row = { game_id: "0022600118", source_payload: {
    timeActual: "2026-10-26T01:21:00Z", challengedAction: { timeActual: "2026-10-26T01:19:29Z" },
  } };
  assert.equal(new URL(challengeClockClipUrl(row)).searchParams.get("inTime"), "21191900");
  assert.equal(challengeClockClipUrl({ ...row, source_payload: { timeActual: "2026-10-26T01:21:00Z" } }), null);
  assert.equal(challengeClockClipUrl({ ...row, source: "play_by_play",
    source_payload: { timeActual: "2026-10-26T01:21:00Z" } }), null);
  assert.equal(new URL(challengeClockClipUrl({ game_id: row.game_id, clock_time_actual: "2026-10-26T01:19:29Z" })).searchParams.get("inTime"), "21191900");
});

test("a two-second clock discrepancy requires an explicit compatible action link", () => {
  const row = { game_id: "0012600060", challenging_team: "WAS", period: 2, game_clock: "06:36.0" };
  const game = { gameId: row.game_id, playByPlayActions: [
    { actionNumber: 15, period: 2, clock: "PT06M34.00S", actionType: "foul", timeActual: "2026-10-17T00:50:07Z" },
  ] };
  assert.equal(buildChallengeClockClipUrl(row, game), null);
  assert.ok(buildChallengeClockClipUrl({ ...row, challenge_type: "Foul", matched_action_number: 15 }, game));
  assert.equal(buildChallengeClockClipUrl({ ...row, game_clock: "06:37.0" }, game), null);
  assert.equal(buildChallengeClockClipUrl(row, { ...game, playByPlayActions: [...game.playByPlayActions,
    { period: 2, clock: "PT06M38.00S", actionType: "foul", timeActual: "2026-10-17T00:50:03Z" }] }), null);
  assert.equal(challengeLinkIdentity(row), challengeLinkIdentity({ ...row, game_clock: "PT06M36.00S" }));
});

test("a review timestamp is not presented as a clip of the original play", () => {
  const row = { game_id: "0022600118", period: 1, game_clock: "07:26.0" };
  const game = { gameId: row.game_id, playByPlayActions: [
    { period: 1, clock: "PT07M26.00S", actionType: "instantreplay", timeActual: "2026-10-26T01:21:00Z" },
  ] };
  assert.equal(buildChallengeClockClipUrl(row, game), null);
});

test("TOR-WAS Q2 0:54 never links to the prior foul and free-throw possession", () => {
  const row = { game_id: "0022600097", period: 2, game_clock: "00:54.2", challenge_type: "OOB" };
  const game = { gameId: row.game_id, playByPlayActions: [
    { actionNumber: 416, period: 2, clock: "PT00M55.80S", actionType: "foul", timeActual: "2026-10-24T00:15:58Z" },
    { actionNumber: 418, period: 2, clock: "PT00M55.80S", actionType: "freethrow", timeActual: "2026-10-24T00:16:25Z" },
    { actionNumber: 424, period: 2, clock: "PT00M53.50S", actionType: "instantreplay", subType: "challenge", timeActual: "2026-10-24T00:17:12Z" },
  ] };
  assert.equal(buildChallengeClockClipUrl(row, game), null);
  assert.equal(challengeClockClipUrl({ ...row, clock_link_version: "3", clock_time_actual: "2026-10-24T00:15:58Z" }), null);
});

test("even an explicit foul event link cannot cross intervening free throws", () => {
  const row = { game_id: "0022600097", period: 2, game_clock: "00:54.2", challenge_type: "Foul", matched_action_number: 416 };
  const game = { gameId: row.game_id, playByPlayActions: [
    { actionNumber: 416, period: 2, clock: "PT00M55.80S", actionType: "foul", timeActual: "2026-10-24T00:15:58Z" },
    { actionNumber: 418, period: 2, clock: "PT00M55.80S", actionType: "freethrow", timeActual: "2026-10-24T00:16:25Z" },
    { actionNumber: 424, period: 2, clock: "PT00M53.50S", actionType: "instantreplay", subType: "challenge", timeActual: "2026-10-24T00:17:12Z" },
  ] };
  assert.equal(buildChallengeClockClipUrl(row, game), null);
});
