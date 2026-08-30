import test from "node:test";
import assert from "node:assert/strict";
import {
  PGR_PLAYER_ACTION_DEFINITIONS,
  PGR_REQUIRED_COLUMNS,
  parsePgrRows,
  summarizePgrEvaluations,
} from "./pgrWorkbook.js";

function workbookRows(rows) {
  return [PGR_REQUIRED_COLUMNS, ...rows];
}

test("PGR row parser preserves possession, event, and evaluation hierarchy", () => {
  const rows = workbookRows([
    [
      "0022501187",
      1,
      100004,
      "Q1",
      "11:51.0",
      1,
      "J. Watkins sets a screen",
      "",
      "Foul: Offensive",
      "Watkins, Jamir (Wizards)",
      "Porter Jr., Craig (Cavaliers)",
      "NI",
      "No Infraction",
      "NC",
      "",
      "",
      1,
      0,
      "http://clips.nba.com?gameNo=0022501187&inTime=1&outTime=2&source=grs",
    ],
    [
      "0022501187",
      1,
      100004,
      "Q1",
      "11:51.0",
      2,
      "J. Watkins sets a screen",
      "",
      "Foul: Offensive",
      "Carrington, Bub (Wizards)",
      "Porter Jr., Craig (Cavaliers)",
      "INF",
      "Infraction",
      "C",
      "Called",
      "",
      1,
      0,
      "http://clips.nba.com?gameNo=0022501187&inTime=1&outTime=2&source=grs",
    ],
  ]);

  const report = parsePgrRows(rows, { filename: "sample.xlsx", worksheetName: "0022501187- TIWOGR" });
  assert.deepEqual(report.errors, []);
  assert.equal(report.game_id, "0022501187");
  assert.equal(report.row_count, 2);
  assert.equal(report.event_count, 1);
  assert.equal(report.possession_count, 1);
  assert.equal(report.evaluations[0].player_name, "Watkins, Jamir");
  assert.equal(report.evaluations[0].player_team, "Wizards");
  assert.equal(report.evaluations[1].player_action_label, PGR_PLAYER_ACTION_DEFINITIONS.INF);
  assert.equal(report.events[0].evaluation_count, 2);
  assert.equal(report.possessions[0].event_count, 1);
});

test("PGR row parser rejects duplicate natural evaluation keys", () => {
  const duplicateRow = [
    "0022501187",
    1,
    100004,
    "Q1",
    "11:51.0",
    1,
    "screen",
    "",
    "Foul: Offensive",
    "Watkins, Jamir (Wizards)",
    "Porter Jr., Craig (Cavaliers)",
    "NI",
    "No Infraction",
    "NC",
    "",
    "",
    1,
    0,
    "http://clips.nba.com?gameNo=0022501187",
  ];
  const report = parsePgrRows(workbookRows([duplicateRow, duplicateRow]), { filename: "duplicate.xlsx" });
  assert.match(report.errors.join(" "), /Duplicate evaluation keys/);
});

test("PGR summary names its evaluation-level unit of analysis", () => {
  const report = parsePgrRows(workbookRows([
    ["0022501187", 1, 100004, "Q1", "11:51.0", 1, "screen", "", "Foul: Offensive", "A (Wizards)", "B (Cavaliers)", "INF", "Infraction", "C", "", "", 1, 0, "http://clips.nba.com"],
    ["0022501187", 2, 100005, "Q2", "10:10.0", 1, "drive", "", "Foul: Shooting", "A (Wizards)", "B (Cavaliers)", "NI", "No Infraction", "NC", "", "", 1, 0, "http://clips.nba.com"],
  ]));
  const summary = summarizePgrEvaluations(report.evaluations);
  assert.equal(summary.unit, "evaluation");
  assert.equal(summary.evaluations, 2);
  assert.equal(summary.events, 2);
  assert.equal(summary.infractions, 1);
  assert.equal(summary.calls, 1);
});

test("PGR row parser rejects missing required columns", () => {
  const report = parsePgrRows([["GameID", "PosId"], ["0022501187", 1]], { filename: "bad.xlsx" });
  assert.match(report.errors.join(" "), /Missing required columns/);
});
