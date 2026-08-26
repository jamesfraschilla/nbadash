import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const functionPath = path.resolve(
  process.cwd(),
  "supabase/functions/custom-requests/index.ts",
);
const source = fs.readFileSync(functionPath, "utf8");
const leagueKillsBySeason = JSON.parse(fs.readFileSync(
  path.resolve(process.cwd(), "supabase/functions/custom-requests/leagueTeamGameKillsBySeason.json"),
  "utf8",
));

function extractArray(name) {
  const start = source.indexOf(`const ${name}`);
  const equals = source.indexOf("=", start);
  const openBracket = source.indexOf("[", equals);
  let depth = 0;
  let end = openBracket;

  for (; end < source.length; end += 1) {
    const char = source[end];
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return Function(`return (${source.slice(openBracket, end).replace(/\bas const\b/g, "")});`)();
}

const metrics = extractArray("METRICS");
const teams = extractArray("NBA_TEAMS");

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/%/g, " pct ")
    .replace(/\bc\s*&\s*s\b/g, "catch and shoot")
    .replace(/\b3fgas\b/g, "3fg attempted")
    .replace(/\b3fgm\b/g, "3fg made")
    .replace(/\b3fga\b/g, "3fg attempted")
    .replace(/\b3fgs\b/g, "3fg made")
    .replace(/\bfgas\b/g, "fg attempted")
    .replace(/\bfgm\b/g, "fg made")
    .replace(/\bfga\b/g, "fg attempted")
    .replace(/\bftas\b/g, "ft attempted")
    .replace(/\bftm\b/g, "ft made")
    .replace(/\bfta\b/g, "ft attempted")
    .replace(/\btotals\b/g, "total")
    .replace(/\bavgs?\b/g, "average")
    .replace(/\bper-game\b/g, "per game")
    .replace(/\bthrees\b/g, "3s")
    .replace(/(?<!catch and )(?<!catch-and-)\bshoot(?:ing|s)?\s+3s\b/g, "3fg attempted")
    .replace(/\bshot\s+3s\b/g, "3fg attempted")
    .replace(/(?<!catch and )(?<!catch-and-)\bshoot(?:ing|s)?\s+threes\b/g, "3fg attempted")
    .replace(/\btook\s+shots\b/g, "fg attempted")
    .replace(/\btake\s+shots\b/g, "fg attempted")
    .replace(/\bthree pointers\b/g, "3pt")
    .replace(/\bthree point\b/g, "3pt")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeToken(token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "3fgas") return "3fga";
  if (normalized === "fgas") return "fga";
  if (normalized === "ftas") return "fta";
  if (normalized === "totals") return "total";
  if (normalized === "avg" || normalized === "avgs") return "average";
  if (normalized === "times") return "time";
  if (normalized === "games") return "game";
  if (normalized === "points") return "point";
  if (normalized === "threes" || normalized === "three" || normalized === "3pt" || normalized === "3pts") return "3s";
  if (normalized.endsWith("ies") && normalized.length > 4) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith("s") && normalized.length > 3 && !normalized.endsWith("ss")) return normalized.slice(0, -1);
  return normalized;
}

function tokenizeText(value) {
  return normalizeText(value)
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

function uniqueTokens(value) {
  return [...new Set(tokenizeText(value))];
}

const stopwords = new Set([
  "a",
  "an",
  "and",
  "for",
  "game",
  "had",
  "has",
  "have",
  "how",
  "in",
  "is",
  "many",
  "more",
  "of",
  "or",
  "season",
  "team",
  "than",
  "that",
  "the",
  "their",
  "this",
  "time",
  "what",
  "with",
]);

function uniqueMeaningfulTokens(value) {
  return uniqueTokens(value).filter((token) => !stopwords.has(token));
}

function tokenOverlapScore(promptTokens, aliasTokens) {
  if (!aliasTokens.length) return 0;
  const promptSet = new Set(promptTokens);
  const matches = aliasTokens.filter((token) => promptSet.has(token)).length;
  return matches / aliasTokens.length;
}

const phraseVariantRules = [
  { pattern: /\bfield goals?\b/g, replacements: ["fg"] },
  { pattern: /\bfg\b/g, replacements: ["field goals"] },
  { pattern: /\bfree throws?\b/g, replacements: ["ft"] },
  { pattern: /\bft\b/g, replacements: ["free throws"] },
  { pattern: /\b3pt\b/g, replacements: ["3fg", "3s"] },
  { pattern: /\b3fg\b/g, replacements: ["3pt", "3s"] },
  { pattern: /\b3s\b/g, replacements: ["3pt", "3fg"] },
  { pattern: /\bcatch and shoot\b/g, replacements: ["catch shoot", "c and s"] },
  { pattern: /\bc and s\b/g, replacements: ["catch and shoot"] },
  { pattern: /\bsecond chance\b/g, replacements: ["2nd chance"] },
  { pattern: /\b2nd chance\b/g, replacements: ["second chance"] },
  { pattern: /\bmade\b/g, replacements: ["make", "makes"] },
  { pattern: /\bmakes\b/g, replacements: ["made", "make"] },
  { pattern: /\battempted\b/g, replacements: ["attempt", "attempts"] },
  { pattern: /\battempts\b/g, replacements: ["attempted", "attempt"] },
  { pattern: /\bpercentage\b/g, replacements: ["percent", "pct"] },
  { pattern: /\bpercent\b/g, replacements: ["percentage", "pct"] },
  { pattern: /\bpct\b/g, replacements: ["percentage", "percent"] },
];

function buildPhraseVariants(seed) {
  const normalizedSeed = normalizeText(seed);
  const pending = [normalizedSeed];
  const variants = new Set();

  while (pending.length) {
    const phrase = pending.pop() || "";
    if (!phrase || variants.has(phrase)) continue;
    variants.add(phrase);

    phraseVariantRules.forEach(({ pattern, replacements }) => {
      if (!pattern.test(phrase)) return;
      replacements.forEach((replacement) => {
        pending.push(phrase.replace(pattern, replacement));
      });
    });
  }

  return [...variants];
}

function stripTrailingQualifier(value, qualifier) {
  const normalized = normalizeText(value);
  const patterns = qualifier === "made"
    ? [/\bmade\b/g, /\bmakes\b/g, /\bmake\b/g]
    : [/\battempted\b/g, /\battempts\b/g, /\battempt\b/g];
  return patterns
    .reduce((current, pattern) => current.replace(pattern, " "), normalized)
    .replace(/\s+/g, " ")
    .trim();
}

function buildMetricSearchAliases(metric) {
  const seeds = new Set([
    metric.key.replace(/_/g, " "),
    metric.label,
    ...metric.aliases,
  ]);

  if (metric.key.endsWith("_made")) {
    [...seeds].forEach((seed) => {
      const base = stripTrailingQualifier(seed, "made");
      if (!base) return;
      seeds.add(base);
      seeds.add(`made ${base}`);
      seeds.add(`${base} made`);
    });
  }

  if (metric.key.endsWith("_attempted")) {
    [...seeds].forEach((seed) => {
      const base = stripTrailingQualifier(seed, "attempted");
      if (!base) return;
      seeds.add(base);
      seeds.add(`attempted ${base}`);
      seeds.add(`${base} attempted`);
      seeds.add(`${base} attempts`);
    });
  }

  if (metric.formatter === "percent") {
    seeds.add(metric.label.replace("%", " percent"));
    seeds.add(metric.label.replace("%", " percentage"));
  }

  return [...new Set(
    [...seeds]
      .flatMap((seed) => buildPhraseVariants(seed))
      .map((alias) => normalizeText(alias))
      .filter(Boolean),
  )];
}

const metricSearchIndex = metrics.map((metric) => ({
  metric,
  aliases: buildMetricSearchAliases(metric).map((alias) => ({
    alias,
    tokens: uniqueMeaningfulTokens(alias),
  })),
}));

const teamSearchIndex = teams.map((team) => ({
  team,
  aliases: [...new Set([
    ...team.aliases,
    team.fullName,
    team.tricode,
  ])].map((alias) => ({
    alias: normalizeText(alias),
    tokens: uniqueMeaningfulTokens(alias),
  })),
}));

function scoreSearchAliases(prompt, searchEntries) {
  const normalizedPrompt = normalizeText(prompt);
  const paddedPrompt = ` ${normalizedPrompt} `;
  const promptTokens = uniqueMeaningfulTokens(prompt);
  let bestScore = 0;

  searchEntries.forEach(({ alias, tokens }) => {
    const exactMatch = paddedPrompt.includes(` ${alias} `);
    const overlap = tokenOverlapScore(promptTokens, tokens);
    const matchingTokens = tokens.filter((token) => promptTokens.includes(token)).length;
    if (!exactMatch && matchingTokens === 0) return;
    const score = exactMatch
      ? 100 + (tokens.length * 5)
      : (overlap * 20) + (matchingTokens * 4);
    if (score > bestScore) bestScore = score;
  });

  return bestScore;
}

function findMetricFromPrompt(prompt) {
  let bestMatch = null;
  let bestScore = 0;

  metricSearchIndex.forEach(({ metric, aliases }) => {
    const score = scoreSearchAliases(prompt, aliases) + scoreMetricIntent(metric, prompt);
    if (score > bestScore) {
      bestMatch = metric;
      bestScore = score;
    }
  });

  return bestScore >= 5 ? bestMatch : null;
}

function usesAttemptIntent(prompt) {
  const normalizedPrompt = normalizeText(prompt).replace(/\bcatch and shoot\b/g, "catchshoot");
  return /\b(attempt|attempted|attempts|shot|shoot|took|take)\b/.test(normalizedPrompt);
}

function usesMadeIntent(prompt) {
  const normalizedPrompt = normalizeText(prompt);
  return /\b(make|made|makes|hit|hits|hitting)\b/.test(normalizedPrompt);
}

function scoreMetricIntent(metric, prompt) {
  const promptWantsAttempted = usesAttemptIntent(prompt);
  const promptWantsMade = usesMadeIntent(prompt);
  const attemptedMetric = metric.key.endsWith("_attempted");
  const madeMetric = metric.key.endsWith("_made");

  if (promptWantsAttempted && attemptedMetric) return 12;
  if (promptWantsAttempted && madeMetric) return -10;
  if (promptWantsMade && madeMetric) return 10;
  if (promptWantsMade && attemptedMetric) return -8;
  return 0;
}

function findTeamFromPrompt(prompt) {
  let bestMatch = null;
  let bestScore = 0;

  teamSearchIndex.forEach(({ team, aliases }) => {
    const score = scoreSearchAliases(prompt, aliases);
    if (score > bestScore) {
      bestMatch = team;
      bestScore = score;
    }
  });

  return bestScore >= 6 ? bestMatch : null;
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseThreshold(prompt) {
  const loweredPrompt = String(prompt || "").toLowerCase();
  const normalizedPrompt = normalizeText(prompt);
  const numericMatch = /(\d+(?:\.\d+)?)\s*\+/.exec(loweredPrompt)
    || /(\d+(?:\.\d+)?)\s*(?:or more|or greater|at least|plus|>=)/.exec(loweredPrompt)
    || /at least\s+(\d+(?:\.\d+)?)/.exec(loweredPrompt)
    || /over\s+(\d+(?:\.\d+)?)/.exec(loweredPrompt)
    || /more than\s+(\d+(?:\.\d+)?)/.exec(loweredPrompt)
    || /under\s+(\d+(?:\.\d+)?)/.exec(loweredPrompt)
    || /below\s+(\d+(?:\.\d+)?)/.exec(loweredPrompt)
    || /less than\s+(\d+(?:\.\d+)?)/.exec(loweredPrompt)
    || /fewer than\s+(\d+(?:\.\d+)?)/.exec(loweredPrompt)
    || /(\d+(?:\.\d+)?)\s*(?:or more|or greater|at least|plus)/.exec(normalizedPrompt);
  if (numericMatch) return safeNumber(numericMatch[1], 0);
  return null;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBareThresholdForMetric(prompt, metric) {
  if (!metric) return null;
  const normalizedPrompt = normalizeText(prompt);
  const metricAliases = buildMetricSearchAliases(metric)
    .sort((left, right) => right.length - left.length)
    .slice(0, 18);
  for (const alias of metricAliases) {
    const escapedAlias = escapeRegExp(alias);
    const beforeMetric = new RegExp(`\\b(?:got|had|has|posted|recorded|with)\\s+(\\d+(?:\\.\\d+)?)\\s+${escapedAlias}\\b`);
    const afterMetric = new RegExp(`\\b${escapedAlias}\\s+(?:of|at|=|equal(?:ed|s)?|was|were)?\\s*(\\d+(?:\\.\\d+)?)\\b`);
    const match = beforeMetric.exec(normalizedPrompt) || afterMetric.exec(normalizedPrompt);
    if (match) return safeNumber(match[1], 0);
  }
  return null;
}

function parseImplicitThreshold(prompt, metric) {
  if (!metric) return null;
  const normalizedPrompt = normalizeText(prompt);
  if (
    metric.key === "first_half_margin"
    && (
      normalizedPrompt.includes("winning at halftime")
      || normalizedPrompt.includes("lead at halftime")
      || normalizedPrompt.includes("halftime lead")
      || normalizedPrompt.includes("outscored opponents in the first half")
      || normalizedPrompt.includes("outscored opponents in first half")
    )
  ) {
    return 1;
  }
  return null;
}

function isUpperBoundPrompt(prompt) {
  const normalizedPrompt = normalizeText(prompt);
  return /under|below|less than|fewer than|<=|at most|or fewer/.test(normalizedPrompt);
}

function isLowerBoundPrompt(prompt) {
  const normalizedPrompt = normalizeText(prompt);
  return /\+/.test(normalizedPrompt)
    || /or more|or greater|at least|plus|>=|over|more than/.test(normalizedPrompt);
}

function isRecordPrompt(prompt) {
  const normalizedPrompt = normalizeText(prompt);
  return normalizedPrompt.includes("record")
    || normalizedPrompt.includes("win loss")
    || normalizedPrompt.includes("wins and losses")
    || normalizedPrompt.includes("w l");
}

function detectAggregation(prompt, threshold) {
  const normalizedPrompt = normalizeText(prompt);
  const wantsCount = normalizedPrompt.includes("how many games")
    || normalizedPrompt.includes("how many times")
    || normalizedPrompt.includes("how often")
    || normalizedPrompt.includes("number of games")
    || normalizedPrompt.includes("count of games");

  if (isRecordPrompt(prompt)) {
    if (isUpperBoundPrompt(prompt)) return "record_when_lte";
    if (threshold != null) return "record_when_gte";
    if (wantsCount || normalizedPrompt.includes("with ") || normalizedPrompt.includes("when ")) return "record_when_nonzero";
    return "record";
  }

  if (wantsCount || (normalizedPrompt.includes("how many") && threshold != null)) {
    if (isUpperBoundPrompt(prompt)) return "count_games_lte";
    if (threshold != null) return "count_games_gte";
    return "count_games_nonzero";
  }

  if (normalizedPrompt.includes("average") || normalizedPrompt.includes("mean") || normalizedPrompt.includes("per game")) {
    return "season_average";
  }

  return "season_total";
}

function buildFallbackParse(prompt) {
  const team = findTeamFromPrompt(prompt);
  const metric = findMetricFromPrompt(prompt);
  if (!team || !metric) return null;
  const threshold = parseThreshold(prompt) ?? parseImplicitThreshold(prompt, metric);
  return {
    teamId: team.teamId,
    statKey: metric.key,
    aggregation: detectAggregation(prompt, threshold),
    threshold: threshold ?? undefined,
  };
}

function parseLeagueConditionalRecordRequest(prompt) {
  const normalizedPrompt = normalizeText(prompt);
  if (findTeamFromPrompt(prompt)) return null;
  if (!isRecordPrompt(prompt)) return null;
  if (!/\b(all teams|every team|league|nba)\b/.test(normalizedPrompt)) return null;

  const metric = findMetricFromPrompt(prompt);
  if (!metric) return null;

  const threshold = parseThreshold(prompt) ?? parseBareThresholdForMetric(prompt, metric);
  if (threshold == null) return null;

  return {
    metric,
    threshold,
    comparator: isUpperBoundPrompt(prompt) ? "lte" : isLowerBoundPrompt(prompt) ? "gte" : "eq",
  };
}

test("every custom request metric resolves from its label and aliases", () => {
  metrics.forEach((metric) => {
    const byLabel = findMetricFromPrompt(metric.label);
    assert.equal(byLabel?.key, metric.key, `label should resolve for ${metric.key}`);

    metric.aliases.forEach((alias) => {
      const byAlias = findMetricFromPrompt(alias);
      assert.equal(byAlias?.key, metric.key, `alias "${alias}" should resolve for ${metric.key}`);
    });
  });
});

test("custom requests resolve representative natural-language stat prompts", () => {
  const cases = [
    ["How many games this season has Washington made 5 or more 3FGs?", "three_pointers_made"],
    ["What is Washington's totals for Dynamite 3s this season?", "dynamite_3s_made"],
    ["What is Cleveland's season total for kills?", "kills"],
    ["New York average transition points", "transition_points"],
    ["Boston highest disruptions game", "disruptions"],
    ["Miami lowest turnover game", "turnovers"],
    ["Washington FGA this season", "field_goals_attempted"],
    ["Washington FTM this season", "free_throws_made"],
    ["Washington catch and shoot 3 percentage", "catch_shoot_3_percent"],
    ["How many 3PAs does James Harden average?", "three_pointers_attempted"],
    ["How many boards does Bam Adebayo average?", "rebounds_total"],
    ["How many dimes does Tyrese Haliburton average?", "assists"],
    ["How many swats does Myles Turner average?", "blocks"],
    ["What is Shai's off rating in wins?", "offensive_rating"],
    ["How many MP does Jalen Duren play?", "minutes"],
  ];

  cases.forEach(([prompt, expectedMetric]) => {
    assert.equal(findMetricFromPrompt(prompt)?.key, expectedMetric, prompt);
  });
});

test("custom request fallback parser resolves threshold and record prompts", () => {
  const thresholdParse = buildFallbackParse("How many games this season has Washington made 5 or more 3FGs?");
  assert.equal(thresholdParse?.teamId, "1610612764");
  assert.equal(thresholdParse?.statKey, "three_pointers_made");
  assert.equal(thresholdParse?.aggregation, "count_games_gte");
  assert.equal(thresholdParse?.threshold, 5);

  const halftimeParse = buildFallbackParse("What is the Wizards record when they outscored opponents in the first half?");
  assert.equal(halftimeParse?.teamId, "1610612764");
  assert.equal(halftimeParse?.statKey, "first_half_margin");
  assert.equal(halftimeParse?.aggregation, "record_when_gte");
  assert.equal(halftimeParse?.threshold, 1);
});

test("custom request parser resolves league-wide conditional record prompts", () => {
  const exactParse = parseLeagueConditionalRecordRequest(
    "What is the cumulative team record of all teams last season when that team got 6 kills in a single game?",
  );
  assert.equal(exactParse?.metric.key, "kills");
  assert.equal(exactParse?.threshold, 6);
  assert.equal(exactParse?.comparator, "eq");

  const lowerBoundParse = parseLeagueConditionalRecordRequest(
    "What is the cumulative team record of all teams last season when that team got 6 or more kills in a single game?",
  );
  assert.equal(lowerBoundParse?.metric.key, "kills");
  assert.equal(lowerBoundParse?.threshold, 6);
  assert.equal(lowerBoundParse?.comparator, "gte");
});

test("custom request precomputed kills cache includes the failed 2025-26 league query", () => {
  const rows = leagueKillsBySeason["2025-26"]?.rows || [];
  const exactSixRows = rows.filter((row) => row.metrics?.kills === 6);
  const wins = exactSixRows.filter((row) => row.result === "W").length;
  const losses = exactSixRows.filter((row) => row.result === "L").length;

  assert.ok(rows.length > 2700);
  assert.equal(leagueKillsBySeason["2025-26"].skippedGames.length, 0);
  assert.equal(exactSixRows.length, 439);
  assert.equal(`${wins}-${losses}`, "198-241");
});
