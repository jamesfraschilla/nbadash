import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PERSONNEL_STAT_KEYS,
  DEFAULT_PERSONNEL_THREE_POINT_COLOR,
  PERSONNEL_SLOT_COUNT,
  PERSONNEL_STAT_OPTIONS,
  PERSONNEL_TAG_OPTIONS,
  PERSONNEL_THREE_POINT_COLOR_OPTIONS,
  calculateThreePointAttemptRatio,
  clearPersonnelStatOverridesForSeason,
  createPersonnelDraft,
  createPersonnelRow,
  formatPersonnelStatValue,
  getCurrentPersonnelSeason,
  getPersonnelThreePointColorForPercentage,
  getPreviousPersonnelSeason,
  hasExactlyFourPersonnelStats,
  hydratePersonnelDraft,
  mergePersonnelStatOverrides,
  normalizePersonnelPlayerStats,
  normalizePersonnelSeason,
  normalizePersonnelStatsMap,
  populatePersonnelDraftFromRoster,
  togglePersonnelRowStat,
  togglePersonnelStat,
  validatePersonnelDraftForExport,
} from "./personnelGraphic.js";

test("constants expose the requested slots, stats, tags, and 3P colors", () => {
  assert.equal(PERSONNEL_SLOT_COUNT, 18);
  assert.deepEqual(PERSONNEL_STAT_OPTIONS.map(({ label }) => label), [
    "PPG", "RPG", "3P%", "APG", "BPG", "SPG", "FTA",
  ]);
  assert.deepEqual(DEFAULT_PERSONNEL_STAT_KEYS, ["ppg", "rpg", "threePointPercentage", "apg"]);
  assert.deepEqual(PERSONNEL_TAG_OPTIONS.map(({ key }) => key), [
    "fire", "cold", "drives_right", "drives_left",
  ]);
  assert.deepEqual(PERSONNEL_THREE_POINT_COLOR_OPTIONS.map(({ key }) => key), [
    "bright_green", "dark_green", "yellow", "orange", "red",
  ]);
  assert.equal(DEFAULT_PERSONNEL_THREE_POINT_COLOR, "bright_green");
});

test("personnel seasons roll over on July 1 and validate saved values", () => {
  assert.equal(getCurrentPersonnelSeason(new Date(2026, 5, 30, 23, 59, 59)), "2025-26");
  assert.equal(getCurrentPersonnelSeason(new Date(2026, 6, 1, 0, 0, 0)), "2026-27");
  assert.equal(getPreviousPersonnelSeason("2026-27"), "2025-26");
  assert.equal(normalizePersonnelSeason("2025-26", "fallback"), "2025-26");
  assert.equal(normalizePersonnelSeason("2025-27", "fallback"), "fallback");
  assert.equal(normalizePersonnelSeason("not-a-season", "fallback"), "fallback");
});

test("default 3P colors are selected from the player's 3FG percentage", () => {
  assert.equal(getPersonnelThreePointColorForPercentage(40), "bright_green");
  assert.equal(getPersonnelThreePointColorForPercentage(0.401), "bright_green");
  assert.equal(getPersonnelThreePointColorForPercentage(39.9), "dark_green");
  assert.equal(getPersonnelThreePointColorForPercentage(30), "dark_green");
  assert.equal(getPersonnelThreePointColorForPercentage(29.9), "yellow");
  assert.equal(getPersonnelThreePointColorForPercentage(20), "yellow");
  assert.equal(getPersonnelThreePointColorForPercentage(19.9), "orange");
  assert.equal(getPersonnelThreePointColorForPercentage(15), "orange");
  assert.equal(getPersonnelThreePointColorForPercentage(14.9), "red");
  assert.equal(getPersonnelThreePointColorForPercentage(0), "red");
  assert.equal(getPersonnelThreePointColorForPercentage(null), DEFAULT_PERSONNEL_THREE_POINT_COLOR);
});

test("createPersonnelDraft produces 18 independent rows with the exact draft shape", () => {
  const draft = createPersonnelDraft({ teamId: 1610612764, season: "2025-26" });

  assert.deepEqual(Object.keys(draft), ["league", "teamId", "season", "rows"]);
  assert.equal(draft.teamId, "1610612764");
  assert.equal(draft.season, "2025-26");
  assert.equal(draft.rows.length, 18);
  assert.deepEqual(Object.keys(draft.rows[0]), [
    "id", "enabled", "personId", "teamId", "fullName", "firstName", "familyName", "jerseyNum",
    "selectedStats", "statOverrides", "tags", "threePointColor", "threePointColorEdited",
  ]);
  assert.deepEqual(draft.rows[0], {
    id: "personnel-slot-1",
    enabled: false,
    personId: "",
    teamId: "",
    fullName: "",
    firstName: "",
    familyName: "",
    jerseyNum: "",
    selectedStats: ["ppg", "rpg", "threePointPercentage", "apg"],
    statOverrides: {},
    tags: [],
    threePointColor: "bright_green",
    threePointColorEdited: false,
  });

  draft.rows[0].selectedStats.pop();
  draft.rows[0].tags.push("fire");
  assert.equal(draft.rows[1].selectedStats.length, 4);
  assert.deepEqual(draft.rows[1].tags, []);
});

test("personnel drafts preserve G League selection through hydration and roster population", () => {
  const draft = createPersonnelDraft({ league: "gleague", teamId: "1612709928", season: "2025-26" });
  const populated = populatePersonnelDraftFromRoster(draft, [{
    personId: "1",
    teamId: "1612709928",
    fullName: "G League Player",
  }], { league: "gleague", teamId: "1612709928" });

  assert.equal(draft.league, "gleague");
  assert.equal(hydratePersonnelDraft(draft).league, "gleague");
  assert.equal(populated.league, "gleague");
  assert.equal(populated.rows[0].fullName, "G League Player");
});

test("changing personnel seasons clears every manual stat override", () => {
  const draft = createPersonnelDraft({ season: "2026-27" });
  draft.rows[0].statOverrides = { ppg: "20.1" };
  draft.rows[1].statOverrides = { rpg: "7.2" };
  const changed = clearPersonnelStatOverridesForSeason(draft, "2025-26");
  assert.equal(changed.season, "2025-26");
  assert.deepEqual(changed.rows[0].statOverrides, {});
  assert.deepEqual(changed.rows[1].statOverrides, {});
});

test("createPersonnelRow and hydration sanitize aliases while preserving 0 through 7 selections", () => {
  assert.deepEqual(createPersonnelRow({
    personId: 22,
    selected: "false",
    selectedStats: ["PTS", "REB", "3P%", "AST", "BLK", "STL", "FTA", "AST", "bogus"],
    statOverrides: { PTS: 12.25, "3P%": "41.8", bogus: "9" },
    tags: ["hot", "Drives Right", "fire", "unknown"],
    threeColor: "Dark Green",
  }), {
    id: "personnel-slot-1",
    enabled: false,
    personId: "22",
    teamId: "",
    fullName: "",
    firstName: "",
    familyName: "",
    jerseyNum: "",
    selectedStats: ["ppg", "rpg", "threePointPercentage", "apg", "bpg", "spg", "fta"],
    statOverrides: { ppg: "12.25", threePointPercentage: "41.8" },
    tags: ["fire", "drives_right"],
    threePointColor: "dark_green",
    threePointColorEdited: true,
  });

  const hydrated = hydratePersonnelDraft({
    personnelDraft: {
      teamId: 1610612764,
      rows: [
        { playerId: "1", selectedStats: [] },
        { playerId: "2", selectedStats: ["PPG", "RPG", "APG"] },
        { playerId: "3", selectedStats: ["PPG", "RPG", "3P%", "APG", "BPG"] },
      ],
    },
  });

  assert.equal(hydrated.rows.length, 18);
  assert.deepEqual(hydrated.rows[0].selectedStats, []);
  assert.deepEqual(hydrated.rows[1].selectedStats, ["ppg", "rpg", "apg"]);
  assert.deepEqual(hydrated.rows[2].selectedStats, ["ppg", "rpg", "threePointPercentage", "apg", "bpg"]);
  assert.deepEqual(hydrated.rows[3].selectedStats, DEFAULT_PERSONNEL_STAT_KEYS);
  assert.equal(hydrated.rows[0].enabled, true);
});

test("hydration truncates to 18 rows and pads short payloads", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ playerId: String(index + 1) }));
  const hydrated = hydratePersonnelDraft({ teamId: "team", rows });

  assert.equal(hydrated.rows.length, 18);
  assert.equal(hydrated.rows[17].personId, "18");
  assert.equal(hydratePersonnelDraft({ rows: [{ playerId: "1" }] }).rows[1].personId, "");
});

test("populatePersonnelDraftFromRoster takes 18 unique players and pads blanks", () => {
  const roster = [
    ...Array.from({ length: 20 }, (_, index) => ({
      personId: String(index + 1),
      fullName: `Player ${index + 1}`,
    })),
    { personId: "1" },
    { fullName: "Missing ID" },
  ];
  const populated = populatePersonnelDraftFromRoster(createPersonnelDraft(), roster, { teamId: "1610612764" });

  assert.equal(populated.teamId, "1610612764");
  assert.equal(populated.rows.length, 18);
  assert.equal(populated.rows[0].personId, "1");
  assert.equal(populated.rows[17].personId, "18");
  assert.ok(populated.rows.every((row) => row.enabled));

  const short = populatePersonnelDraftFromRoster(createPersonnelDraft(), roster.slice(0, 2), { teamId: "team" });
  assert.equal(short.rows[1].personId, "2");
  assert.equal(short.rows[2].personId, "");
  assert.equal(short.rows[2].enabled, false);
});

test("populatePersonnelDraftFromRoster preserves configuration by player across reorder", () => {
  const draft = hydratePersonnelDraft({
    teamId: "old-team",
    season: "2024-25",
    rows: [
      {
        playerId: "10",
        enabled: false,
        selectedStats: ["ppg", "rpg", "bpg"],
        statOverrides: { ppg: "14.2", spg: "" },
        tags: ["fire", "drives_left"],
        threePointColor: "red",
      },
      {
        playerId: "20",
        enabled: true,
        tags: ["cold"],
        threePointColor: "yellow",
      },
    ],
  });
  const populated = populatePersonnelDraftFromRoster(draft, [
    { personId: "20" },
    { personId: "10" },
    { personId: "30" },
  ], { teamId: "new-team" });

  assert.equal(populated.teamId, "new-team");
  assert.equal(populated.season, "2024-25");
  assert.deepEqual(populated.rows[0].tags, ["cold"]);
  assert.equal(populated.rows[0].threePointColor, "yellow");
  assert.equal(populated.rows[1].personId, "10");
  assert.equal(populated.rows[1].enabled, false);
  assert.deepEqual(populated.rows[1].selectedStats, ["ppg", "rpg", "bpg"]);
  assert.deepEqual(populated.rows[1].statOverrides, { ppg: "14.2", spg: "" });
  assert.deepEqual(populated.rows[1].tags, ["fire", "drives_left"]);
  assert.equal(populated.rows[1].threePointColor, "red");
  assert.equal(populated.rows[2].enabled, true);
  assert.deepEqual(populated.rows[2].selectedStats, DEFAULT_PERSONNEL_STAT_KEYS);
});

test("toggle helpers allow unchecking and prevent selecting a fifth stat", () => {
  const unchecked = togglePersonnelStat(DEFAULT_PERSONNEL_STAT_KEYS, "RPG");
  assert.deepEqual(unchecked, ["ppg", "threePointPercentage", "apg"]);

  const filled = togglePersonnelStat(unchecked, "BLK");
  assert.deepEqual(filled, ["ppg", "threePointPercentage", "apg", "bpg"]);
  assert.deepEqual(togglePersonnelStat(filled, "SPG"), filled);
  assert.deepEqual(togglePersonnelStat(filled, "not-a-stat"), filled);

  const overLimit = ["ppg", "rpg", "threePointPercentage", "apg", "bpg"];
  assert.deepEqual(togglePersonnelStat(overLimit, "SPG"), overLimit);
  assert.deepEqual(togglePersonnelStat(overLimit, "BPG"), DEFAULT_PERSONNEL_STAT_KEYS);

  const row = togglePersonnelRowStat({ personId: "1", selectedStats: filled }, "APG");
  assert.equal(row.personId, "1");
  assert.deepEqual(row.selectedStats, ["ppg", "threePointPercentage", "bpg"]);
  assert.deepEqual(DEFAULT_PERSONNEL_STAT_KEYS, ["ppg", "rpg", "threePointPercentage", "apg"]);
});

test("validation requires exactly four stats on every populated target", () => {
  assert.equal(hasExactlyFourPersonnelStats(DEFAULT_PERSONNEL_STAT_KEYS), true);
  assert.equal(hasExactlyFourPersonnelStats(["ppg", "rpg", "apg"]), false);
  assert.equal(hasExactlyFourPersonnelStats(["ppg", "rpg", "threePointPercentage", "apg", "bpg"]), false);

  const draft = hydratePersonnelDraft({
    rows: [
      { playerId: "1", enabled: true },
      { playerId: "2", enabled: true, selectedStats: ["ppg", "rpg", "apg"] },
      { playerId: "3", enabled: false, selectedStats: ["ppg"] },
    ],
  });
  const all = validatePersonnelDraftForExport(draft);
  assert.equal(all.valid, false);
  assert.deepEqual(all.rows.map(({ personId }) => personId), ["1", "2", "3"]);
  assert.deepEqual(all.errors.map(({ personId }) => personId), ["2", "3"]);

  const selected = validatePersonnelDraftForExport(draft, { mode: "selected" });
  assert.equal(selected.valid, false);
  assert.deepEqual(selected.rows.map(({ personId }) => personId), ["1", "2"]);
  assert.deepEqual(selected.errors.map(({ personId }) => personId), ["2"]);

  draft.rows[1].selectedStats = [...DEFAULT_PERSONNEL_STAT_KEYS];
  assert.equal(validatePersonnelDraftForExport(draft, { mode: "selected" }).valid, true);
});

test("validation reports no populated targets", () => {
  const draft = createPersonnelDraft();
  assert.deepEqual(validatePersonnelDraftForExport(draft).errors.map(({ code }) => code), ["NO_PLAYERS"]);
  assert.deepEqual(
    validatePersonnelDraftForExport(draft, { selectedOnly: true }).errors.map(({ code }) => code),
    ["NO_PLAYERS"]
  );
});

test("3PA/FGA ratio supports aliases and clamps to zero through one", () => {
  assert.equal(calculateThreePointAttemptRatio({
    threePointAttemptsPerGame: 3.1,
    fieldGoalAttemptsPerGame: 10.2,
  }), 3.1 / 10.2);
  assert.equal(calculateThreePointAttemptRatio({ FG3A: "5", FGA: "10" }), 0.5);
  assert.equal(calculateThreePointAttemptRatio(4, 8), 0.5);
  assert.equal(calculateThreePointAttemptRatio({ FG3A: 11, FGA: 10 }), 1);
  assert.equal(calculateThreePointAttemptRatio({ FG3A: -2, FGA: 10 }), 0);
  assert.equal(calculateThreePointAttemptRatio({ FG3A: 2, FGA: 0 }), 0);
  assert.equal(calculateThreePointAttemptRatio({ FG3A: 2 }), 0);
});

test("stat formatting leaves missing values blank while preserving legitimate zeroes", () => {
  assert.equal(formatPersonnelStatValue({}, "PPG"), "");
  assert.equal(formatPersonnelStatValue({ ppg: null }, "PPG"), "");
  assert.equal(formatPersonnelStatValue({ ppg: "" }, "PPG"), "");
  assert.equal(formatPersonnelStatValue({ ppg: 0 }, "PPG"), "0.0");
  assert.equal(formatPersonnelStatValue({ FG3_PCT: 0.4 }, "3P%"), "40.0");
  assert.deepEqual(mergePersonnelStatOverrides(
    { ppg: 10.25, rpg: 4.5, threePointPercentage: 38.2 },
    { PTS: "12.4", "3P%": "", notAStat: "9" }
  ), {
    ppg: "12.4",
    rpg: 4.5,
    threePointPercentage: "",
  });
  assert.equal(formatPersonnelStatValue(
    mergePersonnelStatOverrides({ ppg: 10.25 }, { ppg: "12.4" }),
    "PPG"
  ), "12.4");
  assert.equal(formatPersonnelStatValue(
    mergePersonnelStatOverrides({ threePointPercentage: 38.2 }, { threePointPercentage: "" }),
    "3P%"
  ), "");
});

test("stats normalization handles NBA fields and percentage scaling", () => {
  assert.deepEqual(normalizePersonnelPlayerStats({
    PLAYER_ID: 22,
    TEAM_ID: 1610612764,
    PLAYER_NAME: "Alex Example",
    TEAM_ABBREVIATION: "was",
    GP: 72,
    PTS: 20.2,
    REB: 4.2,
    FG3_PCT: 0.382,
    AST: 1.6,
    BLK: 0.4,
    STL: 1.1,
    FTA: 3.5,
    FG3A: 3.1,
    FGA: 10.2,
  }), {
    personId: "22",
    teamId: "1610612764",
    fullName: "Alex Example",
    teamTricode: "WAS",
    gamesPlayed: 72,
    ppg: 20.2,
    rpg: 4.2,
    threePointPercentage: 38.2,
    apg: 1.6,
    bpg: 0.4,
    spg: 1.1,
    fta: 3.5,
    threePointAttemptsPerGame: 3.1,
    fieldGoalAttemptsPerGame: 10.2,
  });
  assert.equal(normalizePersonnelPlayerStats({ PLAYER_NAME: "No ID" }), null);
  assert.equal(normalizePersonnelPlayerStats({
    playerId: "1",
    threePointPercentage: 38.2,
  }).threePointPercentage, 38.2);
});

test("stats map normalization accepts raw NBA result sets and keyed maps", () => {
  const rawMap = normalizePersonnelStatsMap({
    resultSets: [{
      name: "LeagueDashPlayerStats",
      headers: ["PLAYER_ID", "PLAYER_NAME", "PTS", "REB", "FG3_PCT", "AST", "FG3A", "FGA"],
      rowSet: [
        [1, "One Player", 12, 4, 0.4, 3, 4, 10],
        [2, "Two Player", 8, 7, 0.25, 1, 2, 8],
      ],
    }],
  });
  assert.deepEqual(Object.keys(rawMap), ["1", "2"]);
  assert.equal(rawMap["1"].threePointPercentage, 40);
  assert.equal(calculateThreePointAttemptRatio(rawMap["1"]), 0.4);

  const keyedMap = normalizePersonnelStatsMap({
    players: {
      3: { personId: "3", fullName: "Three Player", pointsPerGame: "14.5", threePointPercentage: 37.5 },
    },
  });
  assert.equal(keyedMap["3"].ppg, 14.5);
  assert.equal(keyedMap["3"].threePointPercentage, 37.5);

  const matchedByName = normalizePersonnelStatsMap({
    players: {
      "espn-1": { personId: "espn-1", fullName: "José Alvarado", pointsPerGame: 9.5 },
      "espn-2": { personId: "espn-2", fullName: "Bobby Portis", pointsPerGame: 14.2 },
    },
  }, [
    { personId: "1630631", fullName: "Jose Alvarado" },
    { personId: "1626171", fullName: "Bobby Portis Jr." },
  ]);
  assert.equal(matchedByName["1630631"].personId, "1630631");
  assert.equal(matchedByName["1630631"].ppg, 9.5);
  assert.equal(matchedByName["1626171"].ppg, 14.2);
});
