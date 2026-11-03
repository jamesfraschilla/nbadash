import { assertEquals, assert } from "jsr:@std/assert@1";
import { invalidEndingMargins, invalidOpeningMargins, invalidLargestRunClaims, invalidPlayerClaims, invalidScoringDirectionClaims } from "./analysisClaimValidation.ts";

Deno.test("WAS ORL Q3 cannot turn a one-point lead into an opening deficit", () => {
  const features = {score:{start:{home:59,away:60},end:{home:68,away:79}},teams:{home:{name:"Magic",city:"Orlando",tricode:"ORL"},away:{name:"Wizards",city:"Washington",tricode:"WAS"}}};
  assert(invalidOpeningMargins({summary:"Washington outscored Orlando 19-9 in the third quarter, turning a one-point deficit into an 11-point lead."},features).length > 0);
  assertEquals(invalidOpeningMargins({summary:"Washington outscored Orlando 19-9, turning a one-point lead into an 11-point lead."},features),[]);
  assertEquals(invalidOpeningMargins({summary:"Washington had an 8-0 run, turning a one-point deficit into a seven-point lead."},features),[]);
  assertEquals(invalidEndingMargins({summary:"Washington finished ahead 103-94."},features),[]);
});
Deno.test("the largest unanswered run is team-specific; a valid shorter burst is not the largest run", () => {
  const features = {teams:{home:{name:"Magic",city:"Orlando",tricode:"ORL",largestRun:{points:13}},away:{name:"Wizards",city:"Washington",tricode:"WAS",largestRun:{points:8}}}};
  assert(invalidLargestRunClaims({summary:"Orlando's largest run was an 11-0 run."},features).length > 0);
  assert(invalidLargestRunClaims({summary:"Orlando's 11-0 run across Q1 and Q2 marked their largest run."},features).length > 0);
  assertEquals(invalidLargestRunClaims({summary:"Orlando had an 11-0 run; its largest run was 13-0."},features),[]);
  assertEquals(invalidLargestRunClaims({summary:"Washington's largest run was 8-0."},features),[]);
});

Deno.test("WAS–CLE halftime: 14 points cannot lead all scorers when Watson has 16", () => {
  const features = { players: [{ name: "B. Coulibaly", points: 14 }, { name: "P. Watson", points: 16 }] };
  assert(invalidPlayerClaims({ summary: "Washington's Coulibaly led all scorers with 14 Pts on perfect 7/7 shooting." }, features).length > 0);
  assertEquals(invalidPlayerClaims({ summary: "Coulibaly led Washington with 14 Pts." }, features), []);
  assertEquals(invalidPlayerClaims({ summary: "Watson led all scorers with 16 Pts." }, features), []);
});

Deno.test("WAS–CHA second-half scoring cannot reverse the winner with an accurate numeric pair", () => {
  assert(invalidScoringDirectionClaims({ summary: "They outscored Washington Wizards 56–59 in the 24-minute span but maintained a 7-point advantage." }).length > 0);
  assert(invalidScoringDirectionClaims({ summary: "Charlotte outscored Washington 56-56." }).length > 0);
  assertEquals(invalidScoringDirectionClaims({ summary: "Washington outscored Charlotte 59-56, but Charlotte won the game 110-103." }), []);
  assertEquals(invalidScoringDirectionClaims({ summary: "Charlotte was outscored 59-56 in the second half." }), []);
  assertEquals(invalidScoringDirectionClaims({ summary: "Charlotte scored 56-59 in a close second half." }), []);
});

Deno.test("Brandon Miller cannot be labeled a bench standout without verified role data", () => {
  const analysis = { summary: "Charlotte's bench standout Miller scored 31 Pts." };
  assert(invalidPlayerClaims(analysis, { players: [{ name: "B. Miller", points: 31 }] }).length > 0);
  assertEquals(invalidPlayerClaims({ summary: "Miller scored 31 Pts." }, { players: [{ name: "B. Miller", points: 31 }] }), []);
  assertEquals(invalidPlayerClaims(analysis, { players: [{ name: "B. Miller", points: 31, isStarter: false }] }), []);
});

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
