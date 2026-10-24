import test from "node:test";
import assert from "node:assert/strict";
import { preferLargeNbaHeadshots, refreshNbaHeadshotUrl } from "./playerHeadshotPolicy.js";

test("NBA exports preserve custom priority and keep G League fallbacks behind current NBA portraits", () => {
  const small = "https://cdn.nba.com/headshots/nba/latest/260x190/1641824.png?v=refresh";
  const large = small.replace("260x190", "1040x760");
  const custom = "https://example.com/custom.png";
  const gLeague = "https://example.com/functions/v1/player-headshot?personId=1641824";
  assert.deepEqual(preferLargeNbaHeadshots([custom, small, large, gLeague]), [custom, large, small, gLeague]);
  assert.deepEqual(preferLargeNbaHeadshots([gLeague, large, small]), [gLeague, large, small]);
});

test("NBA images get one stable refresh URL per day while custom images remain untouched", () => {
  const original = "https://cdn.nba.com/headshots/nba/latest/1040x760/1641824.png";
  const morning = refreshNbaHeadshotUrl(original, new Date("2026-10-24T09:00:00Z"));
  assert.equal(morning, refreshNbaHeadshotUrl(original, new Date("2026-10-24T23:00:00Z")));
  assert.notEqual(morning, refreshNbaHeadshotUrl(original, new Date("2026-10-25T09:00:00Z")));
  assert.equal(refreshNbaHeadshotUrl(morning, new Date("2026-10-24T10:00:00Z")), morning);
  assert.equal(refreshNbaHeadshotUrl("https://example.com/custom.png"), "https://example.com/custom.png");
});
