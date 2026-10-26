import { assertEquals, assert } from "jsr:@std/assert@1";
import { invalidEndingMargins, invalidPlayerClaims } from "./analysisClaimValidation.ts";

Deno.test("MEM–SAC ending margins cannot be replaced with quarter differentials", () => {
  const halftime = { score: { end: { home: 59, away: 67 } } };
  assert(invalidEndingMargins({ summary: "Memphis outscored Sacramento 42-31, turning a 3-point deficit into an 11-point lead by halftime." }, halftime).length > 0);
  assertEquals(invalidEndingMargins({ summary: "Memphis took an 8-point lead by halftime." }, halftime), []);
  const q3 = { score: { end: { home: 90, away: 96 } } };
  assert(invalidEndingMargins({ summary: "The Kings outscored Memphis 31-29, finishing down by 2." }, q3).length > 0);
  assertEquals(invalidEndingMargins({ summary: "Memphis's lead peaked at 14, but Sacramento finished down by 6." }, q3), []);
  assertEquals(invalidEndingMargins({ summary: "Sacramento won the quarter by 2." }, q3), []);
  assert(invalidEndingMargins({ headline: "Kings down by 2 at quarter's end" }, q3).length > 0);
  assertEquals(invalidEndingMargins({ summary: "Memphis held an 8-point lead at halftime and finished down by 6." },
    { ...q3, range: { endLabel: "Q3 0:00" } }), []);
  assert(invalidEndingMargins({ summary: "Kings finished ahead by 6." }, { ...q3,
    teams: { home: { name: "Kings", tricode: "SAC" }, away: { name: "Grizzlies", tricode: "MEM" } } }).length > 0);
});

Deno.test("player shooting cannot borrow the team's fraction, including accented names", () => {
  const features = { teams: { away: { name: "Lakers", city: "Los Angeles" } }, players: [
    { name: "L. Dončić", points: 13, threePointersMade: 3, threePointersAttempted: 4 },
  ] };
  assert(invalidPlayerClaims({ summary: "Luka Dončić led the Lakers with 13 Pts, shooting efficiently including 50% (5/10) from three (5/10)." }, features).length > 0);
  assertEquals(invalidPlayerClaims({ summary: "Doncic scored 13 Pts and shot 75% (3/4) from three." }, features), []);
  assertEquals(invalidPlayerClaims({ summary: "Doncic scored 13 Pts. The Lakers shot 50% (5/10) from three." }, features), []);
  assert(invalidPlayerClaims({ summary: "Doncic contributed 15 Pts." }, features).length > 0);
});

Deno.test("multiple player references retain separate shooting ownership", () => {
  const features = { players: [
    { name: "Alpha Player", points: 5, fieldGoalsMade: 2, fieldGoalsAttempted: 4 },
    { name: "Beta Shooter", points: 10, fieldGoalsMade: 4, fieldGoalsAttempted: 5 },
  ] };
  assertEquals(invalidPlayerClaims({ summary: "Alpha Player shot 50% (2/4) overall, while Beta Shooter shot 80% (4/5) overall." }, features), []);
  assert(invalidPlayerClaims({ summary: "Alpha Player shot 80% (4/5) overall." }, features).length > 0);
});

Deno.test("a new team subject ends player ownership before its shooting statistics", () => {
  const features = { teams: { home: { name: "Kings", city: "Sacramento" }, away: { name: "Grizzlies", city: "Memphis" } },
    players: [{ name: "Ty Jerome", points: 10, threePointersMade: 1, threePointersAttempted: 2 }] };
  assertEquals(invalidPlayerClaims({ summary: "Ty Jerome scored 10 Pts, while Sacramento struggled from deep, hitting 11.1% (1/9) on threes." }, features), []);
  assertEquals(invalidPlayerClaims({ summary: "Ty Jerome scored 10 Pts, with Sacramento shooting 50% (12/24) overall." }, features), []);
});
