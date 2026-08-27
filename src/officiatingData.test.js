import assert from "node:assert/strict";
import test from "node:test";
import { preferAuthoritativeChallengeEvents } from "./officiatingData.js";

test("preferAuthoritativeChallengeEvents keeps daily PBP rows until weekly official rows arrive", () => {
  const events = preferAuthoritativeChallengeEvents([
    {
      game_id: "0022500109",
      game_date: "2025-10-26",
      challenging_team: "WAS",
      period: 1,
      game_clock: "PT05M43.00S",
      challenge_outcome: "",
      source: "play_by_play",
    },
    {
      game_id: "0022500109",
      game_date: "2025-10-26",
      challenging_team: "WAS",
      period: 1,
      game_clock: "05:43.0",
      challenge_outcome: "successful",
      source: "nba_official_challenge_pdf",
    },
    {
      game_id: "0022500123",
      game_date: "2025-10-28",
      challenging_team: "WAS",
      period: 2,
      game_clock: "PT05M55.00S",
      challenge_outcome: "successful",
      source: "play_by_play",
    },
  ]);

  assert.equal(events.length, 2);
  assert.equal(events.find((event) => event.game_id === "0022500109").source, "nba_official_challenge_pdf");
  assert.equal(events.find((event) => event.game_id === "0022500123").source, "play_by_play");
});
