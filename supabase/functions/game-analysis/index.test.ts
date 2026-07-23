import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { __test__ } from "./index.ts";

const homeTeam = {
  teamId: "1610612764",
  teamTricode: "WAS",
  teamName: "Wizards",
};

const awayTeam = {
  teamId: "1610612752",
  teamTricode: "NYK",
  teamName: "Knicks",
};

Deno.test("late comeback insight credits the comeback team", () => {
  const actions = [
    { period: 4, clock: "2:00", scoreHome: 90, scoreAway: 95 },
    { period: 4, clock: "1:30", scoreHome: 93, scoreAway: 95 },
    { period: 4, clock: "0:45", scoreHome: 95, scoreAway: 95 },
    { period: 4, clock: "0:20", scoreHome: 95, scoreAway: 97 },
    { period: 4, clock: "0:05", scoreHome: 98, scoreAway: 97 },
  ];
  const scoringEvents = [
    { period: 4, clock: "1:30", elapsed: 2790, teamId: homeTeam.teamId, points: 3, scoreHome: 93, scoreAway: 95 },
    { period: 4, clock: "0:45", elapsed: 2835, teamId: homeTeam.teamId, points: 2, scoreHome: 95, scoreAway: 95 },
    { period: 4, clock: "0:20", elapsed: 2860, teamId: awayTeam.teamId, points: 2, scoreHome: 95, scoreAway: 97 },
    { period: 4, clock: "0:05", elapsed: 2875, teamId: homeTeam.teamId, points: 3, scoreHome: 98, scoreAway: 97 },
  ];

  const insight = __test__.buildLateSwingInsight(
    actions,
    scoringEvents,
    2160,
    2880,
    4,
    "0:00",
    homeTeam,
    awayTeam,
  );

  assertEquals(insight?.type, "comeback");
  assertStringIncludes(insight?.items?.[0] || "", "WAS erased a 5-point deficit");
});

Deno.test("feature payload reports missing scoring and lineup data warnings", () => {
  const features = __test__.buildFeaturePayload({
    gameId: "0022600001",
    gameStatus: 3,
    period: 4,
    homeTeam,
    awayTeam,
    playByPlayActions: [],
  }, null, {
    minPeriod: 1,
    minClock: "12:00",
    maxPeriod: 1,
    maxClock: "11:00",
  });

  assert(features.dataQuality.warnings.length >= 2);
  assert(features.dataQuality.warnings.some((warning: string) => warning.includes("No scoring events")));
  assert(features.dataQuality.warnings.some((warning: string) => warning.includes("Lineup/minutes data")));
});

Deno.test("zero-attempt percentages are unknown while true zero percentages remain displayable", () => {
  assertEquals(__test__.percentage(0, 0), null);
  assertEquals(__test__.formatPercentage(null), "N/A");
  assertEquals(__test__.percentage(0, 4), 0);
  assertEquals(__test__.formatPercentage(0), "0%");
});

Deno.test("turnover sanitizer uses committed-fewer language", () => {
  const features = {
    teams: {
      home: {
        tricode: "WAS",
        totals: {
          turnovers: 2,
        },
      },
      away: {
        tricode: "NYK",
        totals: {
          turnovers: 5,
        },
      },
    },
  };

  assertEquals(
    __test__.sanitizeTurnoverLanguage("WAS forced fewer turnovers in the quarter.", features as any),
    "WAS committed fewer turnovers (2 to 5) in the quarter.",
  );
});
