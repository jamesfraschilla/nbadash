import { assertEquals } from "jsr:@std/assert@1";
import {
  extractEspnJerseys,
  mergeEspnJerseys,
  normalizeRosterPlayerName,
} from "./espnRosterJerseys.ts";

Deno.test("extracts jerseys from roster and nested game-summary athletes", () => {
  const roster = {
    athletes: [{ fullName: "Kylan Boswell", jersey: "18" }],
  };
  const summary = {
    boxscore: {
      players: [{ statistics: [{ athletes: [{
        athlete: { displayName: "Michael Ajayi", jersey: "10" },
      }] }] }],
    },
  };

  assertEquals(extractEspnJerseys(roster).get("kylan boswell"), "18");
  assertEquals(extractEspnJerseys(summary).get("michael ajayi"), "10");
});

Deno.test("normalized matching handles accents, punctuation, and suffixes", () => {
  assertEquals(normalizeRosterPlayerName("  Wendell Moore Jr. "), "wendell moore");
  assertEquals(normalizeRosterPlayerName("Tidjane Salaün"), "tidjane salaun");
});

Deno.test("later observations replace an older jersey number", () => {
  assertEquals(
    mergeEspnJerseys(
      new Map([["sample player", "8"]]),
      new Map([["sample player", "18"]]),
    ).get("sample player"),
    "18",
  );
});
