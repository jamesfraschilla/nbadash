export type OfficialSelection = {
  id: string;
  name: string;
  role?: string;
};

export type TeamSelection = {
  team: string;
  label?: string;
};

export type OfficialGameFact = {
  season: string;
  season_type: string;
  game_id: string;
  game_date: string;
  home_team: string;
  away_team: string;
  official_id: string;
  official_name: string;
  role_key?: string;
  is_alternate?: boolean;
  calls?: number;
  fouls?: number;
  violations?: number;
  technicals?: number;
  category_counts?: Record<string, number>;
  team_net_calls?: Record<string, number>;
  completeness_status?: string;
};

export type TeamGameFact = {
  season: string;
  season_type: string;
  game_id: string;
  game_date: string;
  team: string;
  opponent: string;
  home_away: "home" | "away";
  won?: boolean | null;
  points?: number | null;
  opponent_points?: number | null;
  possessions_estimate?: number | null;
  field_goals_attempted?: number | null;
  three_pointers_attempted?: number | null;
  free_throws_attempted?: number | null;
  rebounds_offensive?: number | null;
  turnovers?: number | null;
  personal_fouls?: number | null;
  technical_fouls?: number | null;
  points_in_paint?: number | null;
  points_fast_break?: number | null;
  points_second_chance?: number | null;
  completeness_status?: string;
};

export type PlayerGameFact = {
  season: string;
  season_type: string;
  game_id: string;
  game_date: string;
  team: string;
  opponent: string;
  player_id: string;
  player_name: string;
  minutes?: number | null;
  points?: number | null;
  three_pointers_attempted?: number | null;
  free_throws_attempted?: number | null;
  personal_fouls?: number | null;
  technical_fouls?: number | null;
  points_in_paint?: number | null;
  completeness_status?: string;
};

export type OfficialPlayerCallEvent = {
  id?: number | string;
  season: string;
  season_type: string;
  game_id: string;
  game_date?: string;
  official_id?: string;
  official_name?: string;
  player_id?: string;
  player_name?: string;
  primary_category?: string;
  secondary_category?: string;
  sub_type?: string;
  descriptor?: string;
  description?: string;
};

export type OfficialCallEvent = OfficialPlayerCallEvent & {
  home_team?: string;
  away_team?: string;
  period?: number | string | null;
  charged_team?: string;
  benefiting_team?: string;
  team_tricode?: string;
};

export type ChallengeEvent = {
  id?: string;
  season: string;
  season_type: string;
  game_id?: string;
  game_date?: string;
  home_team?: string;
  away_team?: string;
  challenging_team?: string;
  challenge_type?: string;
  challenge_outcome?: string;
  crew_chief_id?: string;
  crew_chief_name?: string;
  whistling_official_id?: string;
  whistling_official_name?: string;
};

export type InsightCandidate = {
  id: string;
  officialId: string | null;
  family: "recent-trend" | "game-environment" | "team-history" | "player-history" | "matchup" | "crew";
  conflictKey?: string;
  tags?: string[];
  text: string;
  score: number;
  evidence: {
    sourceTables?: string[];
    formula?: string;
    scope: string;
    sampleSize: number;
    comparisonSampleSize: number;
    currentValue: number;
    comparisonValue: number;
    unit: string;
    supportingGameIds: string[];
    confidence: "high" | "medium";
  };
};

type NumericKey = "calls" | "fouls" | "violations" | "technicals";
type TeamMetricKey = "points" | "free_throws_attempted" | "personal_fouls" | "points_in_paint" | "three_pointers_attempted";
type PlayerMetricKey = "free_throws_attempted" | "personal_fouls" | "technical_fouls" | "points_in_paint" | "three_pointers_attempted";

const VALID_SEASON_TYPES = new Set(["regular season", "playoffs"]);
const TEAM_METRICS: Array<{ key: TeamMetricKey; label: string; unit: string }> = [
  { key: "points", label: "points", unit: "points/game" },
  { key: "free_throws_attempted", label: "free-throw attempts", unit: "FTA/game" },
  { key: "personal_fouls", label: "personal fouls", unit: "fouls/game" },
  { key: "points_in_paint", label: "paint points", unit: "points/game" },
  { key: "three_pointers_attempted", label: "3-point attempts", unit: "3PA/game" },
];
const PLAYER_METRICS: Array<{ key: PlayerMetricKey; label: string; unit: string; minBaseline: number; minDelta: number }> = [
  { key: "free_throws_attempted", label: "free-throw attempts", unit: "FTA/game", minBaseline: 1.5, minDelta: 0.25 },
  { key: "personal_fouls", label: "personal fouls", unit: "fouls/game", minBaseline: 1.2, minDelta: 0.25 },
  { key: "technical_fouls", label: "technical fouls", unit: "technicals/game", minBaseline: 0.02, minDelta: 1.0 },
  { key: "points_in_paint", label: "paint points", unit: "points/game", minBaseline: 4, minDelta: 0.25 },
  { key: "three_pointers_attempted", label: "3-point attempts", unit: "3PA/game", minBaseline: 2, minDelta: 0.25 },
];
const FOUL_CATEGORY_LABELS = new Set([
  "Shooting Foul",
  "Restricted Area Shooting Foul",
  "3-Pt Shooting Foul",
  "Offensive Foul",
  "Foul on Floor",
  "Away From Play Foul",
  "Loose Ball Foul",
  "Double Personal Foul",
  "Transition Take Foul",
  "Clear Path Foul",
  "Flagrant Type 1 Foul",
  "Flagrant Type 2 Foul",
  "Technical Foul",
  "Delay Of Game",
  "Flopping Technical",
  "Rim Hanging Technical",
  "Non Unsportsmanlike Technical",
]);

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, decimals = 1) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function percentDifference(value: number, baseline: number) {
  return baseline ? (value - baseline) / Math.abs(baseline) : 0;
}

function ratio(part: number, total: number) {
  return total > 0 ? part / total : 0;
}

function percentile(value: number, population: number[]) {
  const valid = population.filter(Number.isFinite).sort((a, b) => a - b);
  if (valid.length < 2) return 0;
  const below = valid.filter((candidate) => candidate < value).length;
  const equal = valid.filter((candidate) => candidate === value).length;
  return Math.max(1, Math.min(100, Math.round(((below + Math.max(0, equal - 1) / 2) / (valid.length - 1)) * 99 + 1)));
}

function extremeHigh(value: number) {
  return value >= 90;
}

function extremeLow(value: number) {
  return value <= 10;
}

export function formatPercentileOrdinal(value: number) {
  const rounded = Math.round(value);
  const lastTwo = rounded % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${rounded}th`;
  if (rounded % 10 === 1) return `${rounded}st`;
  if (rounded % 10 === 2) return `${rounded}nd`;
  if (rounded % 10 === 3) return `${rounded}rd`;
  return `${rounded}th`;
}

function completeSeasonRow(row: { season_type?: string; completeness_status?: string; game_date?: string }, asOfDate?: string) {
  const seasonType = String(row.season_type || "").trim().toLowerCase();
  const complete = !row.completeness_status || row.completeness_status === "complete";
  const beforeDate = !asOfDate || !row.game_date || row.game_date < asOfDate;
  return VALID_SEASON_TYPES.has(seasonType) && complete && beforeDate;
}

function officialRowsFor(facts: OfficialGameFact[], official: OfficialSelection) {
  const id = String(official.id || "").trim().toLowerCase();
  const name = String(official.name || "").trim().toLowerCase();
  return facts.filter((row) => (
    !row.is_alternate
    && ((id && String(row.official_id || "").trim().toLowerCase() === id)
      || (name && String(row.official_name || "").trim().toLowerCase() === name))
  ));
}

function categoryTotal(row: OfficialGameFact, labels: Iterable<string>) {
  let total = 0;
  for (const label of labels) total += finite(row.category_counts?.[label]);
  return total;
}

function officialMetric(row: OfficialGameFact, key: NumericKey) {
  if (key === "fouls") return categoryTotal(row, FOUL_CATEGORY_LABELS);
  if (key === "violations") return Math.max(0, finite(row.calls) - categoryTotal(row, FOUL_CATEGORY_LABELS));
  return finite(row[key]);
}

function officialRate(rows: OfficialGameFact[], key: NumericKey) {
  return average(rows.map((row) => officialMetric(row, key)));
}

function categoryRate(rows: OfficialGameFact[], categories: string | string[]) {
  const labels = Array.isArray(categories) ? categories : [categories];
  return average(rows.map((row) => categoryTotal(row, labels)));
}

function firstName(name: string) {
  return String(name || "Official").trim().split(/\s+/)[0] || "Official";
}

function cleanCategory(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isCountedPlayerTechnical(event: OfficialPlayerCallEvent) {
  const parts = [event.primary_category, event.secondary_category, event.sub_type, event.descriptor].map(cleanCategory);
  const excluded = new Set([
    "defense 3 second",
    "defensive 3 second technical",
    "delay technical",
    "flopping technical",
    "rim hanging technical",
    "non unsportsmanlike technical",
    "excess timeout technical",
  ]);
  if (parts.some((part) => excluded.has(part))) return false;
  return parts[0] === "technical" || parts[1] === "technical" || parts[1] === "technical foul" || parts[1] === "double technical";
}

function playerDisplayName(event: OfficialPlayerCallEvent) {
  const descriptionName = /^(.+?)\s+(?:double\s+)?technical\s+foul\b/i.exec(String(event.description || ""))?.[1]?.trim();
  if (descriptionName && !/^team$/i.test(descriptionName)) return descriptionName;
  const stored = String(event.player_name || "").trim();
  return stored && !/^team$/i.test(stored) ? stored : "";
}

function candidateId(prefix: string, officialId: string | null, suffix: string) {
  return [prefix, officialId || "crew", suffix].join(":").replace(/[^a-z0-9:_-]+/gi, "-").toLowerCase();
}

function roleKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[_\s-]+/g, "");
}

function officialKey(row: { official_id?: string; official_name?: string }) {
  return String(row.official_id || row.official_name || "").trim();
}

function teamCode(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function isSuccessfulChallenge(value: unknown) {
  return String(value || "").trim().toLowerCase() === "successful";
}

function selectedOfficialMatcher(official: OfficialSelection) {
  const id = String(official.id || "").trim().toLowerCase();
  const name = String(official.name || "").trim().toLowerCase();
  return (row: { official_id?: string; official_name?: string }) => (
    (id && String(row.official_id || "").trim().toLowerCase() === id)
    || (name && String(row.official_name || "").trim().toLowerCase() === name)
  );
}

function challengeInOfficialCrew(challenge: ChallengeEvent, rows: OfficialGameFact[]) {
  const gameId = String(challenge.game_id || "");
  return rows.some((row) => row.game_id === gameId);
}

function challengeForOfficialCrewChief(challenge: ChallengeEvent, official: OfficialSelection) {
  const id = String(official.id || "").trim().toLowerCase();
  const name = String(official.name || "").trim().toLowerCase();
  return (id && String(challenge.crew_chief_id || "").trim().toLowerCase() === id)
    || (name && String(challenge.crew_chief_name || "").trim().toLowerCase() === name);
}

function isFoulCallEvent(event: OfficialCallEvent) {
  const category = cleanCategory(event.secondary_category || event.primary_category || event.sub_type || event.description);
  return category.includes("foul") || category === "technical" || category === "double technical";
}

function confidence(sampleSize: number, comparisonSize: number): "high" | "medium" {
  return sampleSize >= 20 && comparisonSize >= 40 ? "high" : "medium";
}

function teamRowsForGames(teamFacts: TeamGameFact[], gameIds: Set<string>) {
  return teamFacts.filter((row) => gameIds.has(row.game_id));
}

function metricValues(rows: TeamGameFact[], key: TeamMetricKey) {
  return rows.map((row) => finite(row[key])).filter((value) => Number.isFinite(value));
}

function playerMetricValues(rows: PlayerGameFact[], key: PlayerMetricKey) {
  return rows.map((row) => finite(row[key])).filter((value) => Number.isFinite(value));
}

function perPossession(row: TeamGameFact, key: TeamMetricKey) {
  const possessions = finite(row.possessions_estimate)
    || (finite(row.field_goals_attempted) - finite(row.rebounds_offensive) + finite(row.turnovers) + 0.44 * finite(row.free_throws_attempted));
  return possessions > 0 ? (finite(row[key]) / possessions) * 100 : 0;
}

function latestRows(rows: OfficialGameFact[], count: number) {
  return [...rows].sort((a, b) => String(b.game_date).localeCompare(String(a.game_date))).slice(0, count);
}

function latestTeamRows(rows: TeamGameFact[], count: number) {
  return [...rows].sort((a, b) => String(b.game_date).localeCompare(String(a.game_date))).slice(0, count);
}

function latestPlayerRows(rows: PlayerGameFact[], count: number) {
  return [...rows].sort((a, b) => String(b.game_date).localeCompare(String(a.game_date))).slice(0, count);
}

function seasonStartYear(season: unknown) {
  const match = /^(\d{4})/.exec(String(season || ""));
  return match ? Number(match[1]) : 0;
}

function latestSeason(rows: Array<{ season?: string }>) {
  return [...new Set(rows.map((row) => String(row.season || "").trim()).filter(Boolean))]
    .sort((left, right) => seasonStartYear(right) - seasonStartYear(left))[0] || "";
}

export function buildOfficiatingInsightCandidates({
  officialGameFacts,
  teamGameFacts,
  officials,
  teams,
  playerCallEvents = [],
  playerGameFacts = [],
  officialCallEvents = [],
  challengeEvents = [],
  officialCategoryPercentiles = {},
  asOfDate,
}: {
  officialGameFacts: OfficialGameFact[];
  teamGameFacts: TeamGameFact[];
  officials: OfficialSelection[];
  teams: TeamSelection[];
  playerCallEvents?: OfficialPlayerCallEvent[];
  playerGameFacts?: PlayerGameFact[];
  officialCallEvents?: OfficialCallEvent[];
  challengeEvents?: ChallengeEvent[];
  officialCategoryPercentiles?: Record<string, Record<string, number | null>>;
  asOfDate?: string;
}) {
  const validOfficialFacts = officialGameFacts.filter((row) => completeSeasonRow(row, asOfDate) && !row.is_alternate);
  const validTeamFacts = teamGameFacts.filter((row) => completeSeasonRow(row, asOfDate));
  const validPlayerFacts = playerGameFacts.filter((row) => completeSeasonRow(row, asOfDate));
  const validCallEvents = officialCallEvents.filter((row) => completeSeasonRow(row, asOfDate) && String(row.official_id || row.official_name || "").trim());
  const validChallengeEvents = challengeEvents.filter((row) => completeSeasonRow(row, asOfDate) && String(row.game_id || "").trim());
  const currentTeamSeason = latestSeason(validTeamFacts);
  const currentTeamFacts = currentTeamSeason ? validTeamFacts.filter((row) => row.season === currentTeamSeason) : validTeamFacts;
  const currentPlayerFacts = currentTeamSeason ? validPlayerFacts.filter((row) => row.season === currentTeamSeason) : validPlayerFacts;
  const currentChallengeEvents = currentTeamSeason ? validChallengeEvents.filter((row) => row.season === currentTeamSeason) : validChallengeEvents;
  const currentSeasonScope = currentTeamSeason || "the current season";
  const selectedTeams = new Set(teams.map((row) => row.team));
  const candidates: InsightCandidate[] = [];
  const coverage: Record<string, { officialGames: number; teamGames: number }> = {};

  const officialGroups = new Map<string, OfficialGameFact[]>();
  validOfficialFacts.forEach((row) => {
    const key = String(row.official_id || row.official_name);
    const group = officialGroups.get(key) || [];
    group.push(row);
    officialGroups.set(key, group);
  });
  const population = [...officialGroups.values()].filter((rows) => rows.length >= 10);
  const validPlayerTechnicals = playerCallEvents.filter((event) => (
    completeSeasonRow(event, asOfDate)
    && isCountedPlayerTechnical(event)
    && String(event.player_id || "").trim()
    && playerDisplayName(event)
  ));
  const playerTechnicalTotals = new Map<string, number>();
  validPlayerTechnicals.forEach((event) => {
    const playerId = String(event.player_id);
    playerTechnicalTotals.set(playerId, (playerTechnicalTotals.get(playerId) || 0) + 1);
  });

  officials.forEach((official) => {
    const rows = officialRowsFor(validOfficialFacts, official);
    const officialId = official.id || official.name;
    const matchesOfficial = selectedOfficialMatcher(official);
    const selectedCallRows = validCallEvents.filter(matchesOfficial);
    const recent = latestRows(rows, 10);
    const teamHistoryRows = currentTeamFacts.filter((row) => selectedTeams.has(row.team));
    coverage[officialId] = { officialGames: rows.length, teamGames: teamHistoryRows.length };

    if (rows.length >= 20 && recent.length >= 10) {
      (["fouls", "violations", "technicals"] as NumericKey[]).forEach((key) => {
        const current = officialRate(recent, key);
        const baseline = officialRate(rows, key);
        const delta = percentDifference(current, baseline);
        const meaningful = key === "technicals"
          ? Math.abs(delta) >= 1.5 && Math.abs(current - baseline) >= 0.25
          : Math.abs(delta) >= 0.25 && Math.abs(current - baseline) >= 2;
        if (!meaningful) return;
        const direction = delta > 0 ? "above" : "below";
        const label = key === "technicals" ? "technical fouls" : key;
        candidates.push({
          id: candidateId("recent", officialId, key),
          officialId,
          family: "recent-trend",
          text: `${firstName(official.name)} has averaged ${round(current, 2).toFixed(2)} ${label} over the last 10 games, ${Math.abs(round(delta * 100))}% ${direction} the ${round(baseline, 2).toFixed(2)} per-game baseline since 2024-25.`,
          score: 55 + Math.min(30, Math.abs(delta) * 60),
          evidence: {
            sourceTables: ["nba_official_game_facts"],
            formula: `last_10_${key}_per_game vs official_${key}_per_game_baseline`,
            scope: "Last 10 games versus all available games since 2024-25",
            sampleSize: recent.length,
            comparisonSampleSize: rows.length,
            currentValue: current,
            comparisonValue: baseline,
            unit: `${label}/game`,
            supportingGameIds: recent.map((row) => row.game_id),
            confidence: confidence(recent.length, rows.length),
          },
        });
      });
    }

    if (rows.length >= 20 && selectedCallRows.length >= 50) {
      const officialGameIds = new Set(rows.map((row) => row.game_id));
      const foulEvents = selectedCallRows.filter((event) => officialGameIds.has(event.game_id) && isFoulCallEvent(event));
      const sideCounts = { home: 0, away: 0 };
      foulEvents.forEach((event) => {
        const charged = teamCode(event.charged_team || event.team_tricode);
        if (!charged) return;
        if (charged === teamCode(event.home_team)) sideCounts.home += 1;
        if (charged === teamCode(event.away_team)) sideCounts.away += 1;
      });
      const homeRate = sideCounts.home / rows.length;
      const awayRate = sideCounts.away / rows.length;
      const sideDelta = awayRate - homeRate;
      if (Math.abs(sideDelta) >= 1.25) {
        const target = sideDelta > 0 ? "road" : "home";
        candidates.push({
          id: candidateId("side", officialId, "charged-fouls"),
          officialId,
          family: "game-environment",
          conflictKey: `side:${officialId}:fouls`,
          text: `${firstName(official.name)} has called ${Math.abs(round(sideDelta, 2)).toFixed(2)} more fouls per game on ${target} teams since 2024-25 (${round(awayRate, 2).toFixed(2)} road, ${round(homeRate, 2).toFixed(2)} home).`,
          score: 74 + Math.min(12, Math.abs(sideDelta) * 4),
          evidence: {
            sourceTables: ["nba_official_call_events", "nba_official_game_facts"],
            formula: "(road charged fouls / assigned games) - (home charged fouls / assigned games)",
            scope: "Charged foul side in assigned games since 2024-25",
            sampleSize: rows.length,
            comparisonSampleSize: foulEvents.length,
            currentValue: sideDelta,
            comparisonValue: 0,
            unit: "fouls/game side gap",
            supportingGameIds: [...officialGameIds].slice(0, 25),
            confidence: confidence(rows.length, foulEvents.length),
          },
        });
      }

      [1, 2, 3, 4].forEach((period) => {
        const periodCount = foulEvents.filter((event) => Number(event.period) === period).length;
        const periodRate = periodCount / rows.length;
        const otherPeriods = [1, 2, 3, 4].filter((value) => value !== period);
        const otherRate = otherPeriods.reduce((sum, value) => (
          sum + foulEvents.filter((event) => Number(event.period) === value).length / rows.length
        ), 0) / otherPeriods.length;
        const delta = percentDifference(periodRate, otherRate);
        if (Math.abs(delta) < 0.18 || Math.abs(periodRate - otherRate) < 0.45) return;
        const direction = delta > 0 ? "above" : "below";
        candidates.push({
          id: candidateId("period", officialId, `q${period}-fouls`),
          officialId,
          family: "recent-trend",
          conflictKey: `period:${officialId}:fouls`,
          text: `${firstName(official.name)}'s Q${period} foul rate is ${Math.abs(round(delta * 100))}% ${direction} his other-period baseline since 2024-25 (${round(periodRate, 2).toFixed(2)} vs ${round(otherRate, 2).toFixed(2)} per game).`,
          score: 66 + Math.min(16, Math.abs(delta) * 45),
            evidence: {
            sourceTables: ["nba_official_call_events", "nba_official_game_facts"],
            formula: `Q${period} charged fouls per assigned game vs other Q1-Q4 periods`,
            scope: `Q${period} fouls versus Q1-Q4 non-Q${period} baseline since 2024-25`,
            sampleSize: periodCount,
            comparisonSampleSize: foulEvents.length - periodCount,
            currentValue: periodRate,
            comparisonValue: otherRate,
            unit: "fouls/game",
            supportingGameIds: [...new Set(foulEvents.filter((event) => Number(event.period) === period).map((event) => event.game_id))].slice(0, 25),
            confidence: confidence(periodCount, foulEvents.length - periodCount),
          },
        });
      });
    }

    if (rows.length >= 20) {
      const games = new Set(rows.map((row) => row.game_id));
      const environmentRows = teamRowsForGames(validTeamFacts, games);
      TEAM_METRICS.slice(0, 3).forEach(({ key, label, unit }) => {
        const officialValue = average(metricValues(environmentRows, key));
        const leagueValue = average(metricValues(validTeamFacts, key));
        const delta = percentDifference(officialValue, leagueValue);
        if (Math.abs(delta) < 0.06) return;
        const direction = delta > 0 ? "higher" : "lower";
        candidates.push({
          id: candidateId("environment", officialId, key),
          officialId,
          family: "game-environment",
          text: `Teams in ${firstName(official.name)}'s games have averaged ${round(officialValue, 1).toFixed(1)} ${label}, ${Math.abs(round(delta * 100))}% ${direction} than the league-game baseline of ${round(leagueValue, 1).toFixed(1)}.`,
          score: 45 + Math.min(25, Math.abs(delta) * 100),
          evidence: {
            scope: "All teams in assigned games since 2024-25 versus league-game baseline",
            sampleSize: environmentRows.length,
            comparisonSampleSize: validTeamFacts.length,
            currentValue: officialValue,
            comparisonValue: leagueValue,
            unit,
            supportingGameIds: [...games].slice(0, 25),
            confidence: confidence(rows.length, validTeamFacts.length),
          },
        });
      });
    }

    TEAM_METRICS.forEach(({ key, label, unit }) => {
      const teamComparisons = teams.flatMap(({ team }) => {
        const gameIds = new Set(rows.filter((row) => row.home_team === team || row.away_team === team).map((row) => row.game_id));
        const withOfficial = currentTeamFacts.filter((row) => row.team === team && gameIds.has(row.game_id));
        const baselineRows = currentTeamFacts.filter((row) => row.team === team);
        if (withOfficial.length < 3 || baselineRows.length < 12) return [];
        const current = average(metricValues(withOfficial, key));
        const baseline = average(metricValues(baselineRows, key));
        const delta = percentDifference(current, baseline);
        if (Math.abs(delta) < 0.1) return [];
        return [{ team, withOfficial, baselineRows, current, baseline, delta }];
      });
      const sameDirection = teamComparisons.length >= 2
        && teamComparisons.every((row) => Math.sign(row.delta) === Math.sign(teamComparisons[0].delta));
      if (sameDirection) {
        const direction = teamComparisons[0].delta > 0 ? "above" : "below";
        const text = `${teamComparisons.map((row) => `${row.team} (${round(row.current, 1).toFixed(1)} vs ${round(row.baseline, 1).toFixed(1)})`).join(" and ")} have both run ${direction} their ${label} baselines in ${firstName(official.name)}'s games during ${currentSeasonScope}.`;
        candidates.push({
          id: candidateId("team", officialId, `${teamComparisons.map((row) => row.team).join("-")}-${key}-combined`),
          officialId,
          family: "team-history",
          conflictKey: `team:${officialId}:${key}`,
          text,
          score: 78 + Math.min(12, Math.min(...teamComparisons.map((row) => row.withOfficial.length))) + Math.min(10, average(teamComparisons.map((row) => Math.abs(row.delta))) * 50),
          evidence: {
            scope: `${teamComparisons.map((row) => row.team).join(" and ")} games with ${official.name} versus each team's ${currentSeasonScope} baseline`,
            sampleSize: Math.min(...teamComparisons.map((row) => row.withOfficial.length)),
            comparisonSampleSize: Math.min(...teamComparisons.map((row) => row.baselineRows.length)),
            currentValue: average(teamComparisons.map((row) => row.current)),
            comparisonValue: average(teamComparisons.map((row) => row.baseline)),
            unit,
            supportingGameIds: [...new Set(teamComparisons.flatMap((row) => row.withOfficial.map((teamRow) => teamRow.game_id)))],
            confidence: confidence(Math.min(...teamComparisons.map((row) => row.withOfficial.length)), Math.min(...teamComparisons.map((row) => row.baselineRows.length))),
          },
        });
        return;
      }
      teamComparisons.forEach(({ team, withOfficial, baselineRows, current, baseline, delta }) => {
        const direction = delta > 0 ? "more" : "fewer";
        candidates.push({
          id: candidateId("team", officialId, `${team}-${key}`),
          officialId,
          family: "team-history",
          conflictKey: `team:${officialId}:${key}`,
          text: `${team} has averaged ${round(current, 1).toFixed(1)} ${label} in ${firstName(official.name)}'s games, ${Math.abs(round(delta * 100))}% ${direction} than its ${round(baseline, 1).toFixed(1)} baseline during ${currentSeasonScope}.`,
          score: 60 + Math.min(25, withOfficial.length) + Math.min(15, Math.abs(delta) * 50),
          evidence: {
            scope: `${team} games with ${official.name} versus all ${team} games during ${currentSeasonScope}`,
            sampleSize: withOfficial.length,
            comparisonSampleSize: baselineRows.length,
            currentValue: current,
            comparisonValue: baseline,
            unit,
            supportingGameIds: withOfficial.map((row) => row.game_id),
            confidence: confidence(withOfficial.length, baselineRows.length),
          },
        });
      });
    });

    teams.forEach(({ team }) => {
      const teamRows = currentTeamFacts.filter((row) => row.team === team);
      const recentTeamRows = latestTeamRows(teamRows, 10);
      if (recentTeamRows.length >= 8 && teamRows.length >= 12) {
        TEAM_METRICS.forEach(({ key, label, unit }) => {
          const current = average(metricValues(recentTeamRows, key));
          const baseline = average(metricValues(teamRows, key));
          const delta = percentDifference(current, baseline);
          if (Math.abs(delta) < 0.12) return;
          const direction = delta > 0 ? "up" : "down";
          candidates.push({
            id: candidateId("team-recent", officialId, `${team}-${key}`),
            officialId,
            family: "matchup",
            conflictKey: `team-recent:${team}:${key}`,
            tags: ["team-trend", team, key],
            text: `${team}'s ${label} are ${direction} over its last ${recentTeamRows.length} games (${round(current, 1).toFixed(1)} vs ${round(baseline, 1).toFixed(1)} in ${currentSeasonScope}), which intersects with this crew's matchup environment.`,
            score: 58 + Math.min(16, Math.abs(delta) * 60),
            evidence: {
              sourceTables: ["nba_team_game_facts"],
              formula: `team_last_${recentTeamRows.length}_${key}_per_game vs team_${key}_per_game_baseline`,
              scope: `${team} recent games versus ${team} ${currentSeasonScope} baseline`,
              sampleSize: recentTeamRows.length,
              comparisonSampleSize: teamRows.length,
              currentValue: current,
              comparisonValue: baseline,
              unit,
              supportingGameIds: recentTeamRows.map((row) => row.game_id),
              confidence: confidence(recentTeamRows.length, teamRows.length),
            },
          });
        });
      }

      const officialGamesForTeam = new Set(rows.filter((row) => row.home_team === team || row.away_team === team).map((row) => row.game_id));
      const teamPlayerRows = currentPlayerFacts.filter((row) => row.team === team && finite(row.minutes) >= 8);
      const playerIds = [...new Set(teamPlayerRows.map((row) => row.player_id).filter(Boolean))];
      playerIds.forEach((playerId) => {
        const playerRows = teamPlayerRows.filter((row) => row.player_id === playerId);
        const withOfficial = playerRows.filter((row) => officialGamesForTeam.has(row.game_id));
        if (withOfficial.length < 3 || playerRows.length < 8) return;
        PLAYER_METRICS.forEach(({ key, label, unit, minBaseline, minDelta }) => {
          const baseline = average(playerMetricValues(playerRows, key));
          if (baseline < minBaseline) return;
          const current = average(playerMetricValues(withOfficial, key));
          const delta = percentDifference(current, baseline);
          if (Math.abs(delta) < minDelta) return;
          const direction = delta > 0 ? "more" : "fewer";
          candidates.push({
            id: candidateId("player-metric", officialId, `${playerId}-${key}`),
            officialId,
            family: "player-history",
            conflictKey: `player:${officialId}:${playerId}:${key}`,
            tags: ["player-trend", team, key],
            text: `${withOfficial[0]?.player_name || "A selected-team player"} has averaged ${round(current, 1).toFixed(1)} ${label} in ${firstName(official.name)}'s games, ${Math.abs(round(delta * 100))}% ${direction} than their ${round(baseline, 1).toFixed(1)} ${currentSeasonScope} baseline.`,
            score: 76 + Math.min(14, withOfficial.length * 2) + Math.min(18, Math.abs(delta) * 50),
            evidence: {
              sourceTables: ["nba_player_game_facts", "nba_official_game_facts"],
              formula: `player_${key}_per_game_with_official vs player_${key}_per_game_baseline`,
              scope: `${withOfficial[0]?.player_name || playerId} games with ${official.name} versus player ${currentSeasonScope} baseline`,
              sampleSize: withOfficial.length,
              comparisonSampleSize: playerRows.length,
              currentValue: current,
              comparisonValue: baseline,
              unit,
              supportingGameIds: withOfficial.map((row) => row.game_id),
              confidence: confidence(withOfficial.length, playerRows.length),
            },
          });
        });
      });
    });

    teams.forEach(({ team }) => {
      const gameIds = new Set(rows.filter((row) => row.home_team === team || row.away_team === team).map((row) => row.game_id));
      const withOfficial = currentTeamFacts.filter((row) => row.team === team && gameIds.has(row.game_id) && row.won !== null && row.won !== undefined);
      const baselineRows = currentTeamFacts.filter((row) => row.team === team && row.won !== null && row.won !== undefined);
      if (withOfficial.length >= 5 && baselineRows.length >= 12) {
        const wins = withOfficial.filter((row) => row.won).length;
        const winRate = ratio(wins, withOfficial.length);
        const baselineWins = baselineRows.filter((row) => row.won).length;
        const baselineRate = ratio(baselineWins, baselineRows.length);
        if (Math.abs(winRate - baselineRate) >= 0.18 || winRate >= 0.8 || winRate <= 0.2) {
          const direction = winRate > baselineRate ? "above" : "below";
          candidates.push({
            id: candidateId("record", officialId, `${team}-crew`),
            officialId,
            family: "team-history",
            conflictKey: `record:${officialId}:${team}`,
            text: `${team} is ${wins}-${withOfficial.length - wins} when ${firstName(official.name)} is on the crew during ${currentSeasonScope}, ${Math.abs(round((winRate - baselineRate) * 100))} percentage points ${direction} its baseline.`,
            score: 62 + Math.min(20, withOfficial.length) + Math.min(18, Math.abs(winRate - baselineRate) * 60),
            evidence: {
              scope: `${team} record with ${official.name} on the crew versus team ${currentSeasonScope} baseline`,
              sampleSize: withOfficial.length,
              comparisonSampleSize: baselineRows.length,
              currentValue: winRate,
              comparisonValue: baselineRate,
              unit: "win rate",
              supportingGameIds: withOfficial.map((row) => row.game_id),
              confidence: confidence(withOfficial.length, baselineRows.length),
            },
          });
        }
      }

      const crewChiefRows = rows.filter((row) => roleKey(row.role_key) === "crewchief" && (row.home_team === team || row.away_team === team));
      const crewChiefGames = new Set(crewChiefRows.map((row) => row.game_id));
      const withCrewChief = currentTeamFacts.filter((row) => row.team === team && crewChiefGames.has(row.game_id) && row.won !== null && row.won !== undefined);
      if (withCrewChief.length >= 3 && baselineRows.length >= 12) {
        const wins = withCrewChief.filter((row) => row.won).length;
        const winRate = ratio(wins, withCrewChief.length);
        const baselineRate = ratio(baselineRows.filter((row) => row.won).length, baselineRows.length);
        if (Math.abs(winRate - baselineRate) >= 0.25 || winRate === 1 || winRate === 0) {
          const direction = winRate > baselineRate ? "above" : "below";
          candidates.push({
            id: candidateId("record-cc", officialId, team),
            officialId,
            family: "team-history",
            conflictKey: `record:${officialId}:${team}`,
            text: `${team} is ${wins}-${withCrewChief.length - wins} when ${firstName(official.name)} is crew chief during ${currentSeasonScope}, ${Math.abs(round((winRate - baselineRate) * 100))} percentage points ${direction} its baseline.`,
            score: 72 + Math.min(18, withCrewChief.length) + Math.min(15, Math.abs(winRate - baselineRate) * 50),
            evidence: {
              scope: `${team} record with ${official.name} as crew chief versus team ${currentSeasonScope} baseline`,
              sampleSize: withCrewChief.length,
              comparisonSampleSize: baselineRows.length,
              currentValue: winRate,
              comparisonValue: baselineRate,
              unit: "win rate",
              supportingGameIds: withCrewChief.map((row) => row.game_id),
              confidence: confidence(withCrewChief.length, baselineRows.length),
            },
          });
        }
      }

      const crewChallengeRows = currentChallengeEvents.filter((challenge) => (
        teamCode(challenge.challenging_team) === team && challengeInOfficialCrew(challenge, rows)
      ));
      const teamChallengeRows = currentChallengeEvents.filter((challenge) => teamCode(challenge.challenging_team) === team);
      if (crewChallengeRows.length >= 3 && teamChallengeRows.length >= 8) {
        const successful = crewChallengeRows.filter((challenge) => isSuccessfulChallenge(challenge.challenge_outcome)).length;
        const current = ratio(successful, crewChallengeRows.length);
        const baseline = ratio(teamChallengeRows.filter((challenge) => isSuccessfulChallenge(challenge.challenge_outcome)).length, teamChallengeRows.length);
        if (Math.abs(current - baseline) >= 0.18 || current === 1 || current <= 0.25) {
          const direction = current > baseline ? "above" : "below";
          candidates.push({
            id: candidateId("challenge-team", officialId, team),
            officialId,
            family: "team-history",
            conflictKey: `challenge:${officialId}:${team}`,
            text: `${team} is ${successful}/${crewChallengeRows.length} on challenges when ${firstName(official.name)} is on the crew, ${Math.abs(round((current - baseline) * 100))} percentage points ${direction} its ${currentSeasonScope} challenge baseline.`,
            score: 76 + Math.min(16, crewChallengeRows.length) + Math.min(14, Math.abs(current - baseline) * 55),
            evidence: {
              scope: `${team} challenges with ${official.name} on the crew versus team ${currentSeasonScope} challenge baseline`,
              sampleSize: crewChallengeRows.length,
              comparisonSampleSize: teamChallengeRows.length,
              currentValue: current,
              comparisonValue: baseline,
              unit: "challenge success rate",
              supportingGameIds: [...new Set(crewChallengeRows.map((row) => String(row.game_id || "")))],
              confidence: confidence(crewChallengeRows.length, teamChallengeRows.length),
            },
          });
        }
      }
    });

    const selectedOfficialTechnicals = validPlayerTechnicals.filter((event) => (
      (official.id && String(event.official_id || "") === String(official.id))
      || String(event.official_name || "").trim().toLowerCase() === String(official.name || "").trim().toLowerCase()
    ));
    const officialPlayerGroups = new Map<string, OfficialPlayerCallEvent[]>();
    selectedOfficialTechnicals.forEach((event) => {
      const playerId = String(event.player_id);
      const group = officialPlayerGroups.get(playerId) || [];
      group.push(event);
      officialPlayerGroups.set(playerId, group);
    });
    officialPlayerGroups.forEach((events, playerId) => {
      const officialCount = events.length;
      const totalCount = playerTechnicalTotals.get(playerId) || 0;
      const share = totalCount ? officialCount / totalCount : 0;
      if (officialCount < 3 || totalCount < 5 || share < 0.4) return;
      const playerName = playerDisplayName(events[0]);
      candidates.push({
        id: candidateId("player", officialId, `${playerId}-technicals`),
        officialId,
        family: "player-history",
        text: `${firstName(official.name)} assessed ${officialCount} of ${playerName}'s ${totalCount} counted technical fouls since 2024-25.`,
        score: 72 + Math.min(20, share * 20) + Math.min(8, officialCount),
        evidence: {
          scope: `${playerName} counted technical fouls since 2024-25`,
          sampleSize: officialCount,
          comparisonSampleSize: totalCount,
          currentValue: officialCount,
          comparisonValue: totalCount,
          unit: "technical fouls",
          supportingGameIds: [...new Set(events.map((event) => event.game_id))],
          confidence: totalCount >= 6 ? "high" : "medium",
        },
      });
    });

    if (rows.length >= 20 && population.length >= 20) {
      const categoryDefinitions = [
        { metricKey: "restrictedArea", categories: ["Restricted Area Shooting Foul"], teamKey: "points_in_paint" as TeamMetricKey, label: "restricted-area foul", teamLabel: "paint scoring" },
        { metricKey: "threePoint", categories: ["3-Pt Shooting Foul"], teamKey: "three_pointers_attempted" as TeamMetricKey, label: "3-point shooting-foul", teamLabel: "3-point attempt rate" },
        { metricKey: "shooting", categories: ["Shooting Foul", "Restricted Area Shooting Foul", "3-Pt Shooting Foul"], teamKey: "free_throws_attempted" as TeamMetricKey, label: "shooting-foul", teamLabel: "free-throw attempt rate" },
      ];
      categoryDefinitions.forEach(({ metricKey, categories, teamKey, label, teamLabel }) => {
        const officialValue = categoryRate(rows, categories);
        const officialPopulation = population.map((group) => categoryRate(group, categories));
        const suppliedPercentile = Number(officialCategoryPercentiles[String(official.id || "")]?.[metricKey]);
        const officialPercentile = Number.isFinite(suppliedPercentile) && suppliedPercentile >= 1 && suppliedPercentile <= 100
          ? suppliedPercentile
          : percentile(officialValue, officialPopulation);
        const intersections = teams.flatMap(({ team }) => {
          const teamRows = currentTeamFacts.filter((row) => row.team === team);
          if (teamRows.length < 12) return [];
          const teamValue = average(teamRows.map((row) => perPossession(row, teamKey)));
          const teamPopulation = [...new Set(currentTeamFacts.map((row) => row.team))].map((teamCode) => {
            const rowsForTeam = currentTeamFacts.filter((row) => row.team === teamCode);
            return average(rowsForTeam.map((row) => perPossession(row, teamKey)));
          });
          const teamPercentile = percentile(teamValue, teamPopulation);
          const officialHigh = extremeHigh(officialPercentile);
          const officialLow = extremeLow(officialPercentile);
          const teamHigh = extremeHigh(teamPercentile);
          const teamLow = extremeLow(teamPercentile);
          if (!(officialHigh && teamHigh) && !(officialHigh && teamLow) && !(officialLow && teamHigh)) return [];
          return [{ team, teamRows, teamPercentile }];
        });
        if (!intersections.length) return;
        const teamPercentileAverage = average(intersections.map((row) => row.teamPercentile));
        const teamText = intersections.length === 1
          ? `${intersections[0].team}'s ${teamLabel} is in the ${formatPercentileOrdinal(intersections[0].teamPercentile)} percentile`
          : `${intersections.map((row) => row.team).join(" and ")} rank in the ${intersections.map((row) => formatPercentileOrdinal(row.teamPercentile)).join(" and ")} percentiles for ${teamLabel}`;
        candidates.push({
          id: candidateId("matchup", officialId, `${intersections.map((row) => row.team).join("-")}-${categories.join("-")}`),
          officialId,
          family: "matchup",
          conflictKey: `matchup:${officialId}:${teamKey}`,
          text: `${firstName(official.name)}'s ${label} rate is in the ${formatPercentileOrdinal(officialPercentile)} percentile, while ${teamText}.`,
          score: 75 + Math.min(20, Math.abs(officialPercentile - 50) / 2 + Math.abs(teamPercentileAverage - 50) / 2),
          evidence: {
            scope: `Official category tendency since 2024-25 intersected with ${intersections.map((row) => row.team).join(" and ")} ${currentSeasonScope} team style`,
            sampleSize: rows.length,
            comparisonSampleSize: Math.min(...intersections.map((row) => row.teamRows.length)),
            currentValue: officialPercentile,
            comparisonValue: teamPercentileAverage,
            unit: "percentile",
            supportingGameIds: [],
            confidence: confidence(rows.length, Math.min(...intersections.map((row) => row.teamRows.length))),
          },
        });
      });
    }
  });

  const crewRows = officials.map((official) => officialRowsFor(validOfficialFacts, official));
  if (crewRows.every((rows) => rows.length >= 20)) {
    (["fouls", "violations", "technicals"] as NumericKey[]).forEach((key) => {
      const rates = crewRows.map((rows) => officialRate(rows, key));
      const populationRates = population.map((rows) => officialRate(rows, key));
      const percentiles = rates.map((value) => percentile(value, populationRates));
      const high = percentiles.every(extremeHigh);
      const low = percentiles.every(extremeLow);
      if (!high && !low) return;
      const label = key === "technicals" ? "technical-foul" : key.slice(0, -1);
      candidates.push({
        id: candidateId("crew", null, key),
        officialId: null,
        family: "crew",
        text: `All three officials sit in the ${high ? "90th percentile or higher" : "10th percentile or lower"} among eligible officials for ${label} rate, with individual percentiles from ${Math.round(Math.min(...percentiles))} to ${Math.round(Math.max(...percentiles))}.`,
        score: 85,
        evidence: {
          scope: "Combined crew tendency since 2024-25",
          sampleSize: Math.min(...crewRows.map((rows) => rows.length)),
          comparisonSampleSize: population.length,
          currentValue: average(rates),
          comparisonValue: average(populationRates),
          unit: `${label}s/game`,
          supportingGameIds: [],
          confidence: "high",
        },
      });
    });

    teams.forEach(({ team }) => {
      const crewMemberGameIds = new Set(crewRows.flatMap((rows) => rows.filter((row) => row.home_team === team || row.away_team === team).map((row) => row.game_id)));
      const withCrew = currentTeamFacts.filter((row) => row.team === team && crewMemberGameIds.has(row.game_id) && row.won !== null && row.won !== undefined);
      const baselineRows = currentTeamFacts.filter((row) => row.team === team && row.won !== null && row.won !== undefined);
      if (withCrew.length >= 5 && baselineRows.length >= 12) {
        const wins = withCrew.filter((row) => row.won).length;
        const winRate = ratio(wins, withCrew.length);
        const baselineRate = ratio(baselineRows.filter((row) => row.won).length, baselineRows.length);
        if (Math.abs(winRate - baselineRate) >= 0.15 || winRate >= 0.8 || winRate <= 0.2) {
          const direction = winRate > baselineRate ? "above" : "below";
          candidates.push({
            id: candidateId("crew-record", null, team),
            officialId: null,
            family: "crew",
            conflictKey: `crew:record:${team}`,
            text: `${team} is ${wins}-${withCrew.length - wins} when at least one selected official is on the crew during ${currentSeasonScope}, ${Math.abs(round((winRate - baselineRate) * 100))} percentage points ${direction} its baseline.`,
            score: 78 + Math.min(10, withCrew.length / 2) + Math.min(12, Math.abs(winRate - baselineRate) * 60),
            evidence: {
              scope: `${team} record when one selected official is assigned versus team ${currentSeasonScope} baseline`,
              sampleSize: withCrew.length,
              comparisonSampleSize: baselineRows.length,
              currentValue: winRate,
              comparisonValue: baselineRate,
              unit: "win rate",
              supportingGameIds: withCrew.map((row) => row.game_id),
              confidence: confidence(withCrew.length, baselineRows.length),
            },
          });
        }
      }

      const crewChallengeRows = currentChallengeEvents.filter((challenge) => (
        teamCode(challenge.challenging_team) === team
        && crewRows.some((rows) => challengeInOfficialCrew(challenge, rows))
      ));
      const baselineChallenges = currentChallengeEvents.filter((challenge) => teamCode(challenge.challenging_team) === team);
      if (crewChallengeRows.length >= 3 && baselineChallenges.length >= 8) {
        const successful = crewChallengeRows.filter((challenge) => isSuccessfulChallenge(challenge.challenge_outcome)).length;
        const current = ratio(successful, crewChallengeRows.length);
        const baseline = ratio(baselineChallenges.filter((challenge) => isSuccessfulChallenge(challenge.challenge_outcome)).length, baselineChallenges.length);
        if (Math.abs(current - baseline) >= 0.15 || current === 1 || current <= 0.3) {
          const direction = current > baseline ? "above" : "below";
          candidates.push({
            id: candidateId("crew-challenge", null, team),
            officialId: null,
            family: "crew",
            conflictKey: `crew:challenge:${team}`,
            text: `${team} is ${successful}/${crewChallengeRows.length} on challenges when at least one selected official is on the crew, ${Math.abs(round((current - baseline) * 100))} percentage points ${direction} its ${currentSeasonScope} challenge baseline.`,
            score: 82 + Math.min(8, crewChallengeRows.length) + Math.min(10, Math.abs(current - baseline) * 50),
            evidence: {
              scope: `${team} challenge results with one selected official assigned versus team ${currentSeasonScope} baseline`,
              sampleSize: crewChallengeRows.length,
              comparisonSampleSize: baselineChallenges.length,
              currentValue: current,
              comparisonValue: baseline,
              unit: "challenge success rate",
              supportingGameIds: [...new Set(crewChallengeRows.map((row) => String(row.game_id || "")))],
              confidence: confidence(crewChallengeRows.length, baselineChallenges.length),
            },
          });
        }
      }
    });
  }

  return {
    candidates: candidates.sort((left, right) => right.score - left.score),
    coverage,
    selectedTeams: [...selectedTeams],
  };
}

function conflictBucket(candidate: InsightCandidate) {
  if (!candidate.conflictKey) return "";
  const parts = candidate.conflictKey.split(":");
  if ((parts[0] === "team" || parts[0] === "matchup") && parts.length >= 3) {
    return `${parts[1]}:${parts.slice(2).join(":")}`;
  }
  return candidate.conflictKey;
}

function dedupeInsights(insights: InsightCandidate[], supplemental: InsightCandidate[] = []) {
  const selected: InsightCandidate[] = [];
  const usedBuckets = new Set<string>();
  [...insights].sort((left, right) => right.score - left.score).forEach((candidate) => {
    if (selected.length >= 4) return;
    const bucket = conflictBucket(candidate);
    if (bucket && usedBuckets.has(bucket)) return;
    selected.push(candidate);
    if (bucket) usedBuckets.add(bucket);
  });
  supplemental.forEach((candidate) => {
    if (selected.length >= 4) return;
    const bucket = conflictBucket(candidate);
    if (bucket && usedBuckets.has(bucket)) return;
    selected.push(candidate);
    if (bucket) usedBuckets.add(bucket);
  });
  return selected.sort((left, right) => right.score - left.score);
}

export function selectDeterministicInsights(candidates: InsightCandidate[], officials: OfficialSelection[]) {
  const byOfficial = officials.map((official) => {
    const officialId = official.id || official.name;
    const eligible = candidates.filter((candidate) => candidate.officialId === officialId);
    const selected: InsightCandidate[] = [];
    eligible.forEach((candidate) => {
      if (selected.length >= 4) return;
      if (selected.some((row) => row.family === candidate.family) && candidate.score < 80) return;
      selected.push(candidate);
    });
    return { officialId, insights: dedupeInsights(selected.slice(0, 4), eligible.filter((candidate) => !selected.includes(candidate))).slice(0, 4) };
  });
  const crewInsights = dedupeInsights(candidates.filter((candidate) => candidate.family === "crew"), []).slice(0, 3);
  return {
    profiles: byOfficial,
    crewInsight: crewInsights[0] || null,
    crewInsights,
  };
}

export function normalizeInsightSelection(
  selection: { profiles: Array<{ officialId: string; insights: InsightCandidate[] }>; crewInsight?: InsightCandidate | null; crewInsights?: InsightCandidate[] },
  candidates: InsightCandidate[],
  officials: OfficialSelection[],
) {
  return {
    ...selection,
    profiles: officials.map((official) => {
      const officialId = official.id || official.name;
      const profile = selection.profiles.find((row) => row.officialId === officialId);
      const picked = profile?.insights || [];
      const pickedIds = new Set(picked.map((candidate) => candidate.id));
      const supplemental = candidates
        .filter((candidate) => candidate.officialId === officialId && !pickedIds.has(candidate.id))
        .sort((a, b) => b.score - a.score);
      return { officialId, insights: dedupeInsights(picked, supplemental) };
    }),
    crewInsight: dedupeInsights(selection.crewInsights?.length ? selection.crewInsights : (selection.crewInsight ? [selection.crewInsight] : []), candidates.filter((candidate) => candidate.family === "crew"))[0] || null,
    crewInsights: dedupeInsights(selection.crewInsights?.length ? selection.crewInsights : (selection.crewInsight ? [selection.crewInsight] : []), candidates.filter((candidate) => candidate.family === "crew")).slice(0, 3),
  };
}
