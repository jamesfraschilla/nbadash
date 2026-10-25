import assert from "node:assert/strict";
import test from "node:test";
import { buildWashingtonKillHighlights, playByPlayActionKey } from "./playByPlayKillHighlights.js";

const WAS = 1610612764;
const OPP = 1610612740;
const event = (n, type, team = OPP, extra = {}) => ({ actionNumber: n, orderNumber: n, period: 1,
  clock: `PT${String(12 - n).padStart(2, "0")}M00.00S`, teamId: team, possession: team, actionType: type, ...extra });
const game = (actions, extra = {}) => ({ gameStatus: 2, homeTeam: { teamId: WAS }, awayTeam: { teamId: OPP },
  playByPlayActions: actions, ...extra });
const twoStops = () => [event(1, "2pt", OPP, { shotResult: "Missed" }),
  event(2, "rebound", WAS, { subType: "defensive" }), event(3, "2pt", WAS, { shotResult: "Made" }),
  event(4, "turnover"), event(5, "steal", WAS), event(6, "2pt", WAS, { shotResult: "Made" })];
const entries = (actions, options) => [...buildWashingtonKillHighlights(game(actions, options))];

test("third confirmed stop highlights the possession including the Washington rebound", () => {
  assert.deepEqual(entries([...twoStops(), event(7, "2pt", OPP, { shotResult: "Missed" }),
    event(8, "rebound", WAS, { subType: "defensive" })]), [["action:7", "completed"], ["action:8", "completed"]]);
});

test("scoring on the third possession marks a missed opportunity rather than a Kill", () => {
  assert.deepEqual(entries([...twoStops(), event(7, "3pt", OPP, { shotResult: "Made" })]), [["action:7", "missed"]]);
});

test("a live miss or retained team offensive rebound is unresolved, not a Kill", () => {
  const third = [...twoStops(), event(7, "2pt", OPP, { shotResult: "Missed" })];
  assert.deepEqual(entries(third), []);
  assert.deepEqual(entries([...third, event(8, "rebound", OPP, { subType: "offensive", personId: null }), event(9, "timeout")]), []);
});

test("team offensive rebound then scoring makes the entire third possession yellow", () => {
  assert.deepEqual(entries([...twoStops(), event(7, "2pt", OPP, { shotResult: "Missed" }),
    event(8, "rebound", OPP, { subType: "offensive", personId: null }), event(9, "timeout"),
    event(10, "2pt", OPP, { shotResult: "Made" })]),
  [["action:7", "missed"], ["action:8", "missed"], ["action:10", "missed"]]);
});

test("multiple offensive rebounds followed by a stop are only one possession", () => {
  const actions = [...twoStops(), event(7, "2pt", OPP, { shotResult: "Missed" }),
    event(8, "rebound", OPP, { subType: "offensive" }), event(9, "3pt", OPP, { shotResult: "Missed" }),
    event(10, "rebound", OPP, { subType: "offensive", personId: null }), event(11, "turnover")];
  assert.equal(entries(actions).length, 5);
  assert.ok(entries(actions).every(([, value]) => value === "completed"));
});

test("a foul and a missed non-final free throw do not prematurely complete a Kill", () => {
  const actions = [...twoStops(), event(7, "foul", WAS, { possession: OPP, subType: "shooting" }),
    event(8, "freethrow", OPP, { subType: "1 of 2", shotResult: "Missed" })];
  assert.deepEqual(entries(actions), []);
  assert.deepEqual(entries([...actions, event(9, "freethrow", OPP, { subType: "2 of 2", shotResult: "Made" })]),
    [["action:7", "missed"], ["action:8", "missed"], ["action:9", "missed"]]);
  assert.ok(entries([...actions, event(9, "freethrow", OPP, { subType: "2 of 2", shotResult: "Missed" }),
    event(10, "rebound", WAS, { subType: "defensive" })]).every(([, value]) => value === "completed"));
});

test("the defensive rebound can retain the old possession owner in the feed", () => {
  assert.deepEqual(entries([...twoStops(), event(7, "2pt", OPP, { shotResult: "Missed" }),
    event(8, "rebound", WAS, { possession: OPP, subType: "defensive" })]),
  [["action:7", "completed"], ["action:8", "completed"]]);
});

test("timeout and substitution rows are never marked as defensive possessions", () => {
  const result = entries([...twoStops(), event(7, "2pt", OPP, { shotResult: "Missed" }), event(8, "timeout"),
    event(9, "substitution"), event(10, "turnover")]);
  assert.deepEqual(result, [["action:7", "completed"], ["action:10", "completed"]]);
});

test("period-end confirms a scoreless third possession without coloring period markers", () => {
  assert.deepEqual(entries([...twoStops(), event(7, "3pt", OPP, { shotResult: "Missed" }),
    event(8, "period", OPP, { subType: "end" })]), [["action:7", "completed"]]);
});

test("one uninterrupted seven-stop streak produces two non-overlapping Kills", () => {
  const actions = [];
  for (let n = 1; n <= 7; n++) {
    actions.push(event(n * 2, "turnover"), event(n * 2 + 1, "2pt", WAS, { shotResult: "Made" }));
  }
  assert.deepEqual(entries(actions), [["action:6", "completed"], ["action:12", "completed"]]);
});

test("a score after five stops marks the missed second Kill opportunity", () => {
  const actions = [];
  for (let n = 1; n <= 5; n++) {
    actions.push(event(n * 2, "turnover"), event(n * 2 + 1, "2pt", WAS, { shotResult: "Made" }));
  }
  actions.push(event(12, "2pt", OPP, { shotResult: "Made" }));
  assert.deepEqual(entries(actions), [["action:6", "completed"], ["action:12", "missed"]]);
});

test("an intervening opponent score resets the opportunity", () => {
  assert.deepEqual(entries([event(1, "turnover"), event(2, "2pt", WAS, { shotResult: "Made" }),
    event(3, "2pt", OPP, { shotResult: "Made" }), event(4, "turnover", WAS),
    event(5, "turnover"), event(6, "2pt", WAS, { shotResult: "Made" }), event(7, "2pt", OPP, { shotResult: "Made" })]), []);
});

test("works with Washington away, mixed ID types, missing possession IDs, and out-of-order input", () => {
  const actions = [...twoStops(), event(7, "turnover")].map((a) => ({ ...a, teamId: String(a.teamId), possession: undefined }));
  const input = game([...actions].reverse(), { homeTeam: { teamId: String(OPP) }, awayTeam: { teamId: String(WAS) } });
  const original = JSON.stringify(input);
  assert.deepEqual([...buildWashingtonKillHighlights(input)], [["action:7", "completed"]]);
  assert.equal(JSON.stringify(input), original);
});

test("non-Washington and Capital City games have no Kill highlights", () => {
  const actions = [...twoStops(), event(7, "turnover")];
  assert.deepEqual(entries(actions, { homeTeam: { teamId: 1610612737 } }), []);
  assert.deepEqual(entries(actions, { homeTeam: { teamId: 1612700006, teamTricode: "CCG" } }), []);
});

test("action keys remain stable across display copies and absent action numbers", () => {
  assert.equal(playByPlayActionKey({ actionNumber: 5 }), playByPlayActionKey({ actionNumber: "5", displayDescription: "x" }));
  assert.equal(playByPlayActionKey({ orderNumber: 10 }), "order:10");
  assert.equal(playByPlayActionKey({ period: 1, clock: "1:00", actionType: "turnover" }),
    playByPlayActionKey({ period: 1, clock: "1:00", actionType: "turnover", currentAwayScore: 2 }));
});
