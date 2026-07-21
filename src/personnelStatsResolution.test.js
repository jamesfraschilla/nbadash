import assert from "node:assert/strict";
import test from "node:test";
import {
  getMissingPersonnelStatsPlayers,
  getPersonnelStatsCoverage,
  mergePersonnelStatsPayloads,
} from "./personnelStatsResolution.js";

const roster = [
  { personId: "1", fullName: "Alpha Player" },
  { personId: "2", fullName: "Béta Player" },
];

test("stats coverage matches requested players by official ID or normalized name", () => {
  const payload = {
    players: {
      "1": { personId: "1", fullName: "Alpha Player" },
      "espn-9": { personId: "espn-9", fullName: "Beta Player" },
    },
  };
  assert.equal(getPersonnelStatsCoverage(payload, roster), 2);
});

test("missing stats players excludes ID and normalized-name matches", () => {
  const payload = {
    players: {
      "1": { personId: "1", fullName: "Alpha Player" },
      fallback: { personId: "fallback", fullName: "Beta Player" },
    },
  };
  assert.deepEqual(
    getMissingPersonnelStatsPlayers(payload, [...roster, { personId: "3", fullName: "Gamma Player" }]),
    [{ personId: "3", fullName: "Gamma Player" }]
  );
});

test("stats payload merge prefers later authoritative records and removes name duplicates", () => {
  const merged = mergePersonnelStatsPayloads([
    {
      source: "espn",
      players: {
        "espn-9": { personId: "espn-9", fullName: "Alpha Player", pointsPerGame: 8 },
      },
    },
    {
      source: "nba",
      players: {
        "1": { personId: "1", fullName: "Alpha Player", pointsPerGame: 10 },
      },
    },
  ], "2026-27");

  assert.deepEqual(Object.keys(merged.players), ["1"]);
  assert.equal(merged.players["1"].pointsPerGame, 10);
  assert.equal(merged.source, "espn + nba");
});

test("stats payload merge joins matching IDs even when a source omits the name", () => {
  const merged = mergePersonnelStatsPayloads([
    {
      source: "espn",
      players: {
        "1": { personId: "1", fullName: "Alpha Player", pointsPerGame: 8 },
      },
    },
    {
      source: "nba",
      players: {
        "1": { personId: "1", pointsPerGame: 10, assistsPerGame: 4 },
      },
    },
  ], "2026-27");

  assert.deepEqual(Object.keys(merged.players), ["1"]);
  assert.equal(merged.players["1"].fullName, "Alpha Player");
  assert.equal(merged.players["1"].pointsPerGame, 10);
});

test("stats payload merge preserves name-only fallback rows for roster matching", () => {
  const merged = mergePersonnelStatsPayloads([
    {
      source: "espn",
      players: {
        rookie: { fullName: "Name Only Rookie", pointsPerGame: 3 },
      },
    },
  ], "2026-27");

  assert.equal(merged.count, 1);
  assert.equal(getPersonnelStatsCoverage(merged, [{ fullName: "Name Only Rookie" }]), 1);
});

test("empty successful stats payloads remain a confirmed empty result", () => {
  const merged = mergePersonnelStatsPayloads([
    { source: "nba-web-fallback", players: {}, count: 0 },
  ], "2026-27");
  assert.equal(merged.count, 0);
  assert.deepEqual(merged.players, {});
});
