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

Deno.test("analysis metadata sanitizer hides diagnostics from non-admin responses", () => {
  const sanitized = __test__.stripAdminOnlyAnalysisMetadata({
    headline: "WAS wins Q1",
    summary: "WAS controlled the segment.",
    source: "template",
    dataSignature: "abc123",
    dataWarnings: ["Lineup/minutes data is unavailable."],
    dataQuality: { warnings: ["Lineup/minutes data is unavailable."] },
    ai: { attempted: 2, used: false, rejectionReasons: ["bad score"], error: "" },
    fallbackReason: "AI rejected: bad score",
    cache: {
      segmentKey: "q1",
      dataSignature: "abc123",
      generatedAt: "2026-08-23T00:00:00.000Z",
    },
  } as Record<string, unknown>);

  assertEquals(sanitized.headline, "WAS wins Q1");
  assertEquals(sanitized.dataWarnings, ["Lineup/minutes data is unavailable."]);
  assertEquals(sanitized.source, undefined);
  assertEquals(sanitized.dataSignature, undefined);
  assertEquals(sanitized.dataQuality, undefined);
  assertEquals(sanitized.ai, undefined);
  assertEquals(sanitized.fallbackReason, undefined);
  assertEquals((sanitized.cache as Record<string, unknown>).segmentKey, "q1");
  assertEquals((sanitized.cache as Record<string, unknown>).dataSignature, undefined);
});

Deno.test("analysis metadata sanitizer keeps diagnostics for admin responses", () => {
  const payload = {
    headline: "WAS wins Q1",
    source: "ai",
    dataSignature: "abc123",
    dataQuality: { warnings: [] },
    ai: { attempted: 1, used: true },
    fallbackReason: "",
    cache: { dataSignature: "abc123" },
  } as Record<string, unknown>;

  assertEquals(__test__.stripAdminOnlyAnalysisMetadata(payload, true), payload);
});

Deno.test("zero-attempt percentages are unknown while true zero percentages remain displayable", () => {
  assertEquals(__test__.percentage(0, 0), null);
  assertEquals(__test__.formatPercentage(null), "N/A");
  assertEquals(__test__.percentage(0, 4), 0);
  assertEquals(__test__.formatPercentage(0), "0%");
  assertEquals(__test__.formatPercentageWithAttempts(47.8, 11, 23), "47.8% (11/23)");
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

Deno.test("analysis text normalizer abbreviates count stats and team stat categories", () => {
  assertEquals(
    __test__.normalizeStatAbbreviations("Player had 1 point, 2 assists, 3 rebounds, 4 steals, 5 blocks, 6 turnovers, 2 offensive rebounds, 3 defensive rebounds, 8 points off turnovers, 12 paint points, 7 transition points, and 4 second-chance points."),
    "Player had 1 Pt, 2 Ast, 3 Reb, 4 Stl, 5 Blk, 6 TO, 2 OReb, 3 DReb, 8 Pts off TO, 12 paint Pts, 7 transition Pts, and 4 second-chance Pts.",
  );
});

Deno.test("analysis sanitizer combines turnover correction with stat abbreviations", () => {
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
    __test__.sanitizeAnalysisText("WAS forced fewer turnovers in the quarter and scored 7 points off turnovers.", features as any),
    "WAS committed fewer TO (2 to 5) in the quarter and scored 7 Pts off TO.",
  );
});

Deno.test("analysis language guard rejects bare shooting percentages", () => {
  const features = {
    teams: {
      home: {
        shooting: { fgPct: 47.8, threePct: 40, rimPct: null, midPct: null, ftPct: null },
        totals: {
          fieldGoalsMade: 11,
          fieldGoalsAttempted: 23,
          threePointersMade: 4,
          threePointersAttempted: 10,
          rimFieldGoalsMade: 0,
          rimFieldGoalsAttempted: 0,
          midFieldGoalsMade: 0,
          midFieldGoalsAttempted: 0,
          freeThrowsMade: 0,
          freeThrowsAttempted: 0,
        },
      },
      away: {
        shooting: { fgPct: 33.3, threePct: 20, rimPct: null, midPct: null, ftPct: null },
        totals: {
          fieldGoalsMade: 9,
          fieldGoalsAttempted: 27,
          threePointersMade: 2,
          threePointersAttempted: 10,
          rimFieldGoalsMade: 0,
          rimFieldGoalsAttempted: 0,
          midFieldGoalsMade: 0,
          midFieldGoalsAttempted: 0,
          freeThrowsMade: 0,
          freeThrowsAttempted: 0,
        },
      },
    },
  };

  assertEquals(
    __test__.shouldRejectAiAnalysis({
      headline: "Shooting edge",
      summary: "WAS shot 47.8% overall with 40% from three.",
      sections: [],
    }, features as any),
    true,
  );
  assertEquals(
    __test__.shouldRejectAiAnalysis({
      headline: "Shooting edge",
      summary: "WAS shot 47.8% (11/23) overall with 40% (4/10) from three.",
      sections: [],
    }, features as any),
    false,
  );
});

Deno.test("analysis language guard rejects zero lead or zero advantage wording", () => {
  assertEquals(__test__.hasZeroMarginLanguage("WAS never led, with its largest advantage being 0."), true);
  assertEquals(__test__.hasZeroMarginLanguage("WAS never led during the span."), false);
});

Deno.test("analysis language guard rejects all-team-scoring overstatements", () => {
  assertEquals(__test__.hasOverstatedAllTeamScoring("T. Jones accounted for all of Chicago's scoring in the quarter."), true);
  assertEquals(__test__.hasOverstatedAllTeamScoring("T. Jones scored 14 of Chicago's 37 points in the quarter."), false);
});

function buildScoreGuardFeatures() {
  return {
    range: {
      startLabel: "Q3 12:00",
      endLabel: "Q3 0:00",
      duration: "12:00",
    },
    score: {
      start: { home: 51, away: 52 },
      end: { home: 74, away: 87 },
      rangePoints: { home: 23, away: 35 },
      margin: { home: -12, away: 12 },
    },
    teams: {
      home: {
        tricode: "WAS",
        name: "Wizards",
        shooting: { fgPct: 30.8, threePct: 23.1, rimPct: 45.5, midPct: null, ftPct: null },
        totals: {
          fieldGoalsMade: 8,
          fieldGoalsAttempted: 26,
          threePointersMade: 3,
          threePointersAttempted: 13,
          rimFieldGoalsMade: 5,
          rimFieldGoalsAttempted: 11,
          midFieldGoalsMade: 0,
          midFieldGoalsAttempted: 0,
          freeThrowsMade: 0,
          freeThrowsAttempted: 0,
          turnovers: 7,
          pointsOffTurnovers: 2,
        },
      },
      away: {
        tricode: "CHI",
        name: "Bulls",
        shooting: { fgPct: 50, threePct: 20, rimPct: 61.1, midPct: null, ftPct: null },
        totals: {
          fieldGoalsMade: 13,
          fieldGoalsAttempted: 26,
          threePointersMade: 1,
          threePointersAttempted: 5,
          rimFieldGoalsMade: 11,
          rimFieldGoalsAttempted: 18,
          midFieldGoalsMade: 0,
          midFieldGoalsAttempted: 0,
          freeThrowsMade: 0,
          freeThrowsAttempted: 0,
          turnovers: 4,
          pointsOffTurnovers: 11,
        },
      },
    },
  };
}

Deno.test("analysis language guard rejects incorrect selected-span score claims", () => {
  const features = buildScoreGuardFeatures();

  const reasons = __test__.findAiAnalysisRejectReasons({
    headline: "Bulls dominate Q3",
    summary: "The Bulls outscored the Wizards 37-23 in Q3.",
    sections: [],
  }, features as any);

  assert(reasons.some((reason: string) => reason.includes("span score claim 37-23")));
  assertEquals(
    __test__.shouldRejectAiAnalysis({
      headline: "Bulls win Q3",
      summary: "The Bulls outscored the Wizards 35-23 in Q3.",
      sections: [],
    }, features as any),
    false,
  );
});

Deno.test("analysis language guard rejects incorrect score transition claims", () => {
  const features = buildScoreGuardFeatures();

  assertEquals(
    __test__.shouldRejectAiAnalysis({
      headline: "Bulls create separation",
      summary: "The score moved from 52-51 to 89-74.",
      sections: [],
    }, features as any),
    true,
  );
  assertEquals(
    __test__.shouldRejectAiAnalysis({
      headline: "Bulls create separation",
      summary: "The score moved from 52-51 to 87-74.",
      sections: [],
    }, features as any),
    false,
  );
});
