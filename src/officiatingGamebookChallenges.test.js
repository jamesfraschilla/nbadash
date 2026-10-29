import test from "node:test";
import assert from "node:assert/strict";
import { parseGamebookChallenges, reconcileGamebookChallenge } from "./officiatingGamebookChallenges.js";
import { enrichChallengeEventsWithOfficials } from "./officiatingChallengeMatcher.js";

const pages = [{ page: 12, text: `NATIONAL BASKETBALL ASSOCIATION OFFICIAL PLAY-BY-PLAY
2nd QUARTER
11:51 J.Slawson BLOCK MISS L.James FB Running Finger Roll Layup
11:51 Pacers Coach's Challenge J.Slawson S.FOUL (P.Ransom): Call Overturned: No Foul on J. Slawson
11:50 J.Slawson Violation: Jump Ball (A.Smith)` }];
test("gamebook restores original overturned shooting foul, not subsequent jump ball", () => {
  const book = parseGamebookChallenges(pages);
  assert.equal(book.length, 1);
  assert.equal(book[0].officialToken, "P.Ransom");
  assert.equal(book[0].subType, "Shooting Foul");
  const before = { game_id: "0022600135", period: 2, game_clock: "PT11M51.00S",
    crew_chief_name: "Courtney Kirkland", video_url: "keep", whistling_official_name: "Aaron Smith",
    source_payload: { actionNumber: 215 }, challenge_outcome: "successful" };
  const corrected = reconcileGamebookChallenge(before, book, [{ official_id: "1627963", official_name: "Phenizee Ransom" }], "https://statsdmz.nba.com/book.pdf");
  assert.equal(corrected.whistling_official_name, "Phenizee Ransom");
  assert.equal(corrected.challenge_type, "Foul");
  assert.equal(corrected.challenge_sub_type, "Shooting Foul");
  assert.equal(corrected.video_url, "keep");
  assert.equal(corrected.crew_chief_name, "Courtney Kirkland");
  assert.equal(corrected.matched_call_event_id, null);
  assert.equal(enrichChallengeEventsWithOfficials([corrected], [], [])[0].whistling_official_name, "Phenizee Ransom");
  assert.deepEqual(reconcileGamebookChallenge(corrected, book, [{ official_id: "1627963", official_name: "Phenizee Ransom" }], "https://statsdmz.nba.com/book.pdf"), corrected);
});
test("ambiguous or unmatched gamebook officials remain reviewable", () => {
  const challenge = { period: 2, game_clock: "11:51", source_payload: {} };
  assert.equal(reconcileGamebookChallenge(challenge, parseGamebookChallenges(pages), [], "url").review_status, "needs_review");
  assert.equal(reconcileGamebookChallenge(challenge, [...parseGamebookChallenges(pages), ...parseGamebookChallenges(pages)], [], "url"), challenge);
});

test("do not label the replacement offensive foul as the original defensive foul", () => {
  const rows = parseGamebookChallenges([{ page: 1, text: `OFFICIAL PLAY-BY-PLAY\n2nd QUARTER\n05:27 76ers Coach's Challenge C.Johnson Offensive (J.Goble): Call Overturned: Corrected to Offensive Foul on C. Johnson` }]);
  const result = reconcileGamebookChallenge({ period: 2, game_clock: "05:27", source_payload: {
    pdfRow: { initial_call: "Defensive Foul", trigger: "Challenge of Called Foul" } } }, rows,
  [{ official_id: "1", official_name: "John Goble" }], "url");
  assert.equal(result.challenge_sub_type, "Defensive Foul");
  assert.equal(result.initial_call, "Defensive Foul");
  assert.equal(result.review_status, "needs_review");
  assert.equal(result.whistling_official_name, "John Goble");
});

test("compact gamebook official tokens resolve compound surnames", () => {
  const rows = parseGamebookChallenges([{ page: 1, text: `OFFICIAL PLAY-BY-PLAY\n4th QUARTER\n04:57 Bulls Coach's Challenge L.Miller S.FOUL (J.VanDuyne): Call Confirmed` }]);
  const result = reconcileGamebookChallenge({ period: 4, game_clock: "04:57", source_payload: {} }, rows,
    [{ official_id: "64", official_name: "Justin Van Duyne" }], "url");
  assert.equal(result.whistling_official_name, "Justin Van Duyne");
  assert.equal(result.challenge_sub_type, "Shooting Foul");
});

test("a book omitting the whistle does not erase independently supported attribution", () => {
  const rows = parseGamebookChallenges([{ page: 1, text: `OFFICIAL PLAY-BY-PLAY\n1st QUARTER\n05:00 Pacers Coach's Challenge Stoppage - Out of Bounds: Call Stands` }]);
  const result = reconcileGamebookChallenge({ period: 1, game_clock: "05:00", whistling_official_name: "Known Official", source_payload: {} }, rows, [], "url");
  assert.equal(result.whistling_official_name, "Known Official");
  assert.equal(result.challenge_type, "OOB");
});
