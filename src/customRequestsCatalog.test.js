import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const functionPath = path.resolve(
  process.cwd(),
  "supabase/functions/custom-requests/index.ts",
);
const source = fs.readFileSync(functionPath, "utf8");

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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/%/g, " pct ")
    .replace(/\bc\s*&\s*s\b/g, "catch and shoot")
    .replace(/\b3fgm\b/g, "3fg made")
    .replace(/\b3fga\b/g, "3fg attempted")
    .replace(/\b3fgs\b/g, "3fg made")
    .replace(/\bfgm\b/g, "fg made")
    .replace(/\bfga\b/g, "fg attempted")
    .replace(/\bftm\b/g, "ft made")
    .replace(/\bfta\b/g, "ft attempted")
    .replace(/\btotals\b/g, "total")
    .replace(/\bavgs?\b/g, "average")
    .replace(/\bper-game\b/g, "per game")
    .replace(/\bthrees\b/g, "3s")
    .replace(/\bthree pointers\b/g, "3pt")
    .replace(/\bthree point\b/g, "3pt")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeToken(token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (!normalized) return "";
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
    const score = scoreSearchAliases(prompt, aliases);
    if (score > bestScore) {
      bestMatch = metric;
      bestScore = score;
    }
  });

  return bestScore >= 5 ? bestMatch : null;
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
  ];

  cases.forEach(([prompt, expectedMetric]) => {
    assert.equal(findMetricFromPrompt(prompt)?.key, expectedMetric, prompt);
  });
});
