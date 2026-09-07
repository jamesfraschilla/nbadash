import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildOfficiatingInsightCandidates,
  formatPercentileOrdinal,
  selectDeterministicInsights,
  type OfficialGameFact,
  type TeamGameFact,
} from "./officiatingInsights.ts";

function officialFacts(): OfficialGameFact[] {
  return Array.from({ length: 30 }, (_, index) => ({
    season: "2025-26",
    season_type: "Regular Season",
    game_id: `game-${index}`,
    game_date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    home_team: index % 2 ? "WAS" : "NYK",
    away_team: index % 2 ? "NYK" : "WAS",
    official_id: "one",
    official_name: "Official One",
    calls: index >= 20 ? 24 : 15,
    fouls: index >= 20 ? 20 : 10,
    violations: 4,
    technicals: 0,
    category_counts: { "Shooting Foul": index >= 20 ? 10 : 4, "3-Pt Shooting Foul": 2 },
  }));
}

function teamFacts(): TeamGameFact[] {
  return Array.from({ length: 30 }, (_, index) => ["WAS", "NYK"].map((team, teamIndex) => ({
    season: "2025-26",
    season_type: "Regular Season",
    game_id: `game-${index}`,
    game_date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    team,
    opponent: team === "WAS" ? "NYK" : "WAS",
    home_away: (teamIndex === index % 2 ? "home" : "away") as "home" | "away",
    points: team === "WAS" ? 120 : 100,
    field_goals_attempted: 90,
    three_pointers_attempted: team === "WAS" ? 45 : 25,
    free_throws_attempted: 24,
    rebounds_offensive: 10,
    turnovers: 12,
    personal_fouls: 20,
    points_in_paint: team === "WAS" ? 60 : 40,
    possessions_estimate: 102,
  }))).flat();
}

Deno.test("builds evidence-backed candidates with supporting samples", () => {
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: officialFacts(),
    teamGameFacts: teamFacts(),
    officials: [{ id: "one", name: "Official One" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
  });
  assert(result.candidates.some((candidate) => candidate.family === "recent-trend"));
  assert(result.candidates.every((candidate) => candidate.evidence.sampleSize > 0));
});

Deno.test("excludes preseason and alternate assignments from coverage", () => {
  const rows = officialFacts();
  rows.push({ ...rows[0], game_id: "preseason", season_type: "Preseason" });
  rows.push({ ...rows[0], game_id: "alternate", is_alternate: true });
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: rows,
    teamGameFacts: teamFacts(),
    officials: [{ id: "one", name: "Official One" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
  });
  assertEquals(result.coverage.one.officialGames, 30);
});

Deno.test("deterministic selection never exceeds four claims per official", () => {
  const officials = [{ id: "one", name: "Official One" }];
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: officialFacts(),
    teamGameFacts: teamFacts(),
    officials,
    teams: [{ team: "WAS" }, { team: "NYK" }],
  });
  const selected = selectDeterministicInsights(result.candidates, officials);
  assert(selected.profiles[0].insights.length <= 4);
});

Deno.test("formats percentile ordinals correctly", () => {
  assertEquals(formatPercentileOrdinal(1), "1st");
  assertEquals(formatPercentileOrdinal(2), "2nd");
  assertEquals(formatPercentileOrdinal(3), "3rd");
  assertEquals(formatPercentileOrdinal(11), "11th");
  assertEquals(formatPercentileOrdinal(12), "12th");
  assertEquals(formatPercentileOrdinal(13), "13th");
  assertEquals(formatPercentileOrdinal(21), "21st");
  assertEquals(formatPercentileOrdinal(22), "22nd");
  assertEquals(formatPercentileOrdinal(23), "23rd");
});

function populationFacts(selectedIndex = 29): OfficialGameFact[] {
  return Array.from({ length: 30 }, (_, officialIndex) => (
    Array.from({ length: 20 }, (_, gameIndex) => ({
      season: "2025-26",
      season_type: "Regular Season",
      game_id: `official-${officialIndex}-game-${gameIndex}`,
      game_date: `2026-02-${String(gameIndex + 1).padStart(2, "0")}`,
      home_team: "WAS",
      away_team: "NYK",
      official_id: `official-${officialIndex}`,
      official_name: officialIndex === selectedIndex ? "Kevin Cutler" : `Peer ${officialIndex}`,
      calls: 40,
      fouls: 0,
      violations: 40,
      category_counts: {
        "Shooting Foul": 2,
        "3-Pt Shooting Foul": officialIndex + 1,
      },
    }))
  )).flat();
}

function populationTeamFacts(selectedTeamIndexes = [28, 29]): TeamGameFact[] {
  const codes = Array.from({ length: 30 }, (_, index) => (
    index === 28 ? "WAS" : index === 29 ? "NYK" : `T${String(index).padStart(2, "0")}`
  ));
  return codes.flatMap((team, teamIndex) => Array.from({ length: 20 }, (_, gameIndex) => ({
    season: "2025-26",
    season_type: "Regular Season",
    game_id: `team-${teamIndex}-game-${gameIndex}`,
    game_date: `2026-02-${String(gameIndex + 1).padStart(2, "0")}`,
    team,
    opponent: "OPP",
    home_away: "home" as const,
    points: 100,
    field_goals_attempted: 90,
    three_pointers_attempted: selectedTeamIndexes.includes(teamIndex) ? 50 : teamIndex + 10,
    free_throws_attempted: 20,
    rebounds_offensive: 10,
    turnovers: 12,
    personal_fouls: 20,
    points_in_paint: 40,
    possessions_estimate: 100,
  })));
}

Deno.test("matchup candidates use first names and consolidate the same tendency for both teams", () => {
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: populationFacts(),
    teamGameFacts: populationTeamFacts(),
    officials: [{ id: "official-29", name: "Kevin Cutler" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
  });
  const matchups = result.candidates.filter((candidate) => candidate.family === "matchup");
  assertEquals(matchups.length, 1);
  assert(matchups[0].text.startsWith("Kevin's 3-point shooting-foul rate"));
  assert(matchups[0].text.includes("WAS and NYK"));
  assert(!matchups[0].text.includes("Cutler"));
  assert(!matchups[0].text.includes("causal prediction"));
});

Deno.test("matchup prose uses the report's trusted category percentile", () => {
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: populationFacts(),
    teamGameFacts: populationTeamFacts(),
    officials: [{ id: "official-29", name: "Kevin Cutler" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
    officialCategoryPercentiles: {
      "official-29": { threePoint: 94 },
    },
  });
  const candidate = result.candidates.find((row) => row.family === "matchup");
  assert(candidate);
  assert(candidate.text.includes("94th percentile"));
});

Deno.test("matchup candidates require extreme trusted category percentiles", () => {
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: populationFacts(),
    teamGameFacts: populationTeamFacts(),
    officials: [{ id: "official-29", name: "Kevin Cutler" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
    officialCategoryPercentiles: {
      "official-29": { threePoint: 87 },
    },
  });
  assertEquals(result.candidates.filter((row) => row.family === "matchup").length, 0);
});

Deno.test("suppresses low-low matchup intersections", () => {
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: populationFacts(0),
    teamGameFacts: populationTeamFacts([]),
    officials: [{ id: "official-0", name: "Kevin Cutler" }],
    teams: [{ team: "T00" }, { team: "T01" }],
  });
  assertEquals(result.candidates.filter((candidate) => candidate.family === "matchup").length, 0);
});

Deno.test("team trends use the latest active team season instead of cumulative team baselines", () => {
  const officialRows = [
    ...Array.from({ length: 20 }, (_, index) => ({
      season: "2024-25",
      season_type: "Regular Season",
      game_id: `old-${index}`,
      game_date: `2025-01-${String(index + 1).padStart(2, "0")}`,
      home_team: "WAS",
      away_team: "NYK",
      official_id: "one",
      official_name: "Official One",
      calls: 16,
      fouls: 12,
      violations: 4,
      technicals: 0,
      category_counts: { "Shooting Foul": 4 },
    })),
    ...Array.from({ length: 20 }, (_, index) => ({
      season: "2025-26",
      season_type: "Regular Season",
      game_id: index < 3 ? `current-with-official-${index}` : `current-other-official-${index}`,
      game_date: `2026-01-${String(index + 1).padStart(2, "0")}`,
      home_team: "WAS",
      away_team: "NYK",
      official_id: "one",
      official_name: "Official One",
      calls: 16,
      fouls: 12,
      violations: 4,
      technicals: 0,
      category_counts: { "Shooting Foul": 4 },
    })),
  ];
  const teamRows = [
    ...Array.from({ length: 20 }, (_, index) => ({
      season: "2024-25",
      season_type: "Regular Season",
      game_id: `old-${index}`,
      game_date: `2025-01-${String(index + 1).padStart(2, "0")}`,
      team: "WAS",
      opponent: "NYK",
      home_away: "home" as const,
      points: 90,
      field_goals_attempted: 90,
      three_pointers_attempted: 24,
      free_throws_attempted: 12,
      rebounds_offensive: 10,
      turnovers: 12,
      personal_fouls: 20,
      points_in_paint: 36,
      possessions_estimate: 100,
    })),
    ...Array.from({ length: 12 }, (_, index) => ({
      season: "2025-26",
      season_type: "Regular Season",
      game_id: index < 3 ? `current-with-official-${index}` : `current-team-baseline-${index}`,
      game_date: `2026-01-${String(index + 1).padStart(2, "0")}`,
      team: "WAS",
      opponent: "NYK",
      home_away: "home" as const,
      points: index < 3 ? 130 : 100,
      field_goals_attempted: 90,
      three_pointers_attempted: 24,
      free_throws_attempted: 12,
      rebounds_offensive: 10,
      turnovers: 12,
      personal_fouls: 20,
      points_in_paint: 36,
      possessions_estimate: 100,
    })),
  ];
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: officialRows,
    teamGameFacts: teamRows,
    officials: [{ id: "one", name: "Official One" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
  });
  const candidate = result.candidates.find((row) => row.family === "team-history" && row.text.includes("WAS has averaged"));
  assert(candidate);
  assert(candidate.text.includes("during 2025-26"));
  assert(!candidate.text.includes("since 2024-25"));
  assert(candidate.evidence.scope.includes("2025-26"));
});

Deno.test("derives foul and violation trends from normalized categories instead of corrupt stored totals", () => {
  const rows = Array.from({ length: 30 }, (_, index) => {
    const recent = index >= 20;
    return {
      season: "2025-26",
      season_type: "Regular Season",
      game_id: `derived-${index}`,
      game_date: `2026-03-${String(index + 1).padStart(2, "0")}`,
      home_team: "WAS",
      away_team: "NYK",
      official_id: "derived",
      official_name: "Marc Davis",
      calls: recent ? 25 : 15,
      fouls: 0,
      violations: 99,
      technicals: 0,
      category_counts: { "Shooting Foul": recent ? 15 : 14 },
    } satisfies OfficialGameFact;
  });
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: rows,
    teamGameFacts: teamFacts(),
    officials: [{ id: "derived", name: "Marc Davis" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
  });
  const violationTrend = result.candidates.find((candidate) => candidate.id === "recent:derived:violations");
  assert(violationTrend);
  assertEquals(violationTrend.evidence.currentValue, 10);
  assert(violationTrend.text.startsWith("Marc has averaged 10.00 violations"));
});

Deno.test("shooting-foul matchup percentiles use base and location subtype totals", () => {
  const facts = populationFacts();
  const teams = populationTeamFacts().map((row) => ({
    ...row,
    three_pointers_attempted: 30,
    free_throws_attempted: row.team === "WAS" || row.team === "NYK"
      ? 50
      : Number(row.team.slice(1)) + 10,
  }));
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: facts,
    teamGameFacts: teams,
    officials: [{ id: "official-29", name: "Kevin Cutler" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
  });
  const shooting = result.candidates.find((candidate) => candidate.text.startsWith("Kevin's shooting-foul rate"));
  assert(shooting);
  assertEquals(shooting.evidence.currentValue, 100);
});

Deno.test("creates concise player technical concentration claims from direct whistle attribution", () => {
  const playerCallEvents = Array.from({ length: 8 }, (_, index) => ({
    id: index,
    season: index < 4 ? "2024-25" : "2025-26",
    season_type: "Regular Season",
    game_id: `technical-${index}`,
    game_date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    official_id: index < 7 ? "one" : "two",
    official_name: index < 7 ? "Kevin Cutler" : "Peer Two",
    player_id: "player-a",
    player_name: "Player A",
    primary_category: "foul",
    secondary_category: "technical",
    sub_type: "technical",
    description: "Player A technical FOUL (1 Tech)",
  }));
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: officialFacts(),
    teamGameFacts: teamFacts(),
    officials: [{ id: "one", name: "Kevin Cutler" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
    playerCallEvents,
  });
  const candidate = result.candidates.find((row) => row.family === "player-history");
  assert(candidate);
  assertEquals(candidate.text, "Kevin assessed 7 of Player A's 8 counted technical fouls since 2024-25.");
  assertEquals(candidate.evidence.supportingGameIds.length, 7);
});

Deno.test("keeps a notable direct player technical concentration without overstating attribution", () => {
  const playerCallEvents = Array.from({ length: 6 }, (_, index) => ({
    id: index,
    season: index < 3 ? "2024-25" : "2025-26",
    season_type: "Regular Season",
    game_id: `player-technical-${index}`,
    game_date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    official_id: index < 3 ? "one" : `peer-${index}`,
    official_name: index < 3 ? "Jonathan Sterling" : `Peer ${index}`,
    player_id: "player-b",
    player_name: "Jackson Jr.",
    primary_category: "foul",
    secondary_category: "double_technical",
    sub_type: "technical",
    description: "J. Jackson Jr. double technical FOUL (1 Tech)",
  }));
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: officialFacts(),
    teamGameFacts: teamFacts(),
    officials: [{ id: "one", name: "Jonathan Sterling" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
    playerCallEvents,
  });
  const candidate = result.candidates.find((row) => row.family === "player-history");
  assert(candidate);
  assertEquals(candidate.text, "Jonathan assessed 3 of J. Jackson Jr.'s 6 counted technical fouls since 2024-25.");
});

Deno.test("combines repeated team-history bullets for the same official metric", () => {
  const baselineRows = teamFacts();
  const officialRows = officialFacts().slice(0, 10).map((row, index) => ({
    ...row,
    game_id: `mousa-game-${index}`,
    game_date: `2026-06-${String(index + 1).padStart(2, "0")}`,
  }));
  const officialTeamRows = officialRows.flatMap((officialRow) => ["WAS", "NYK"].map((team, teamIndex) => {
    const row = {
      season: "2025-26",
      season_type: "Regular Season",
      game_id: officialRow.game_id,
      game_date: officialRow.game_date,
      team,
      opponent: team === "WAS" ? "NYK" : "WAS",
      home_away: teamIndex === 0 ? "home" as const : "away" as const,
      points: 110,
      field_goals_attempted: 90,
      three_pointers_attempted: 30,
      free_throws_attempted: 20,
      rebounds_offensive: 10,
      turnovers: 12,
      personal_fouls: 25,
      points_in_paint: 42,
      possessions_estimate: 100,
    } satisfies TeamGameFact;
    return row;
  }));
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: officialRows,
    teamGameFacts: [...baselineRows, ...officialTeamRows],
    officials: [{ id: "one", name: "Mousa Dagher" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
  });
  const personalFoulCandidates = result.candidates.filter((candidate) => candidate.conflictKey === "team:one:personal_fouls");
  assertEquals(personalFoulCandidates.length, 1);
  assert(personalFoulCandidates[0].text.includes("WAS"));
  assert(personalFoulCandidates[0].text.includes("NYK"));
  assert(personalFoulCandidates[0].text.includes("have both run"));
});

Deno.test("creates team challenge performance candidates for assigned crew members", () => {
  const challenges = Array.from({ length: 18 }, (_, index) => ({
    id: `challenge-${index}`,
    season: "2025-26",
    season_type: "Regular Season",
    game_id: index < 7 ? `game-${index}` : `other-${index}`,
    game_date: `2026-04-${String(index + 1).padStart(2, "0")}`,
    home_team: "WAS",
    away_team: "NYK",
    challenging_team: "WAS",
    challenge_type: "Foul",
    challenge_outcome: index < 7 ? "successful" : index % 2 ? "successful" : "unsuccessful",
  }));
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: officialFacts(),
    teamGameFacts: teamFacts(),
    officials: [{ id: "one", name: "Matt Kallio" }],
    teams: [{ team: "WAS" }, { team: "NYK" }],
    challengeEvents: challenges,
  });
  const candidate = result.candidates.find((row) => row.id === "challenge-team:one:was");
  assert(candidate);
  assert(candidate.text.includes("WAS is 7/7 on challenges when Matt is on the crew"));
});

Deno.test("returns multiple crew insights when crew-level facts clear thresholds", () => {
  const officials = [
    { id: "one", name: "Official One" },
    { id: "two", name: "Official Two" },
    { id: "three", name: "Official Three" },
  ];
  const facts = officials.flatMap((official, officialIndex) => Array.from({ length: 30 }, (_, gameIndex) => ({
    season: "2025-26",
    season_type: "Regular Season",
    game_id: `${official.id}-game-${gameIndex}`,
    game_date: `2026-05-${String((gameIndex % 28) + 1).padStart(2, "0")}`,
    home_team: "WAS",
    away_team: "NYK",
    official_id: official.id,
    official_name: official.name,
    calls: 30,
    fouls: 24 + officialIndex,
    violations: 6,
    technicals: 2,
    category_counts: { "Shooting Foul": 24 + officialIndex },
  } satisfies OfficialGameFact)));
  const peers = Array.from({ length: 25 }, (_, peerIndex) => (
    Array.from({ length: 20 }, (_, gameIndex) => ({
      season: "2025-26",
      season_type: "Regular Season",
      game_id: `peer-${peerIndex}-game-${gameIndex}`,
      game_date: `2026-05-${String((gameIndex % 28) + 1).padStart(2, "0")}`,
      home_team: "WAS",
      away_team: "NYK",
      official_id: `peer-${peerIndex}`,
      official_name: `Peer ${peerIndex}`,
      calls: 20,
      fouls: 10,
      violations: 10,
      technicals: 0,
      category_counts: { "Shooting Foul": 10 },
    } satisfies OfficialGameFact))
  )).flat();
  const result = buildOfficiatingInsightCandidates({
    officialGameFacts: [...facts, ...peers],
    teamGameFacts: teamFacts(),
    officials,
    teams: [{ team: "WAS" }, { team: "NYK" }],
  });
  const selected = selectDeterministicInsights(result.candidates, officials);
  assert(selected.crewInsights.length >= 1);
  assert(selected.crewInsights[0].text.includes("All three officials"));
});
