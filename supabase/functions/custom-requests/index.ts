import rosterSnapshot from "../../../src/data/rosters.json" with { type: "json" };

const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL =
  Deno.env.get("OPENAI_SCOUTING_MODEL") ||
  Deno.env.get("OPENAI_ANALYSIS_MODEL") ||
  "gpt-4.1-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NBA_TEAMS = [
  { teamId: "1610612737", tricode: "ATL", fullName: "Atlanta Hawks", aliases: ["atlanta", "hawks", "atl"] },
  { teamId: "1610612738", tricode: "BOS", fullName: "Boston Celtics", aliases: ["boston", "celtics", "bos"] },
  { teamId: "1610612751", tricode: "BKN", fullName: "Brooklyn Nets", aliases: ["brooklyn", "nets", "bkn"] },
  { teamId: "1610612766", tricode: "CHA", fullName: "Charlotte Hornets", aliases: ["charlotte", "hornets", "cha"] },
  { teamId: "1610612741", tricode: "CHI", fullName: "Chicago Bulls", aliases: ["chicago", "bulls", "chi"] },
  { teamId: "1610612739", tricode: "CLE", fullName: "Cleveland Cavaliers", aliases: ["cleveland", "cavaliers", "cavs", "cle"] },
  { teamId: "1610612742", tricode: "DAL", fullName: "Dallas Mavericks", aliases: ["dallas", "mavericks", "mavs", "dal"] },
  { teamId: "1610612743", tricode: "DEN", fullName: "Denver Nuggets", aliases: ["denver", "nuggets", "den"] },
  { teamId: "1610612765", tricode: "DET", fullName: "Detroit Pistons", aliases: ["detroit", "pistons", "det"] },
  { teamId: "1610612744", tricode: "GSW", fullName: "Golden State Warriors", aliases: ["golden state", "warriors", "gsw"] },
  { teamId: "1610612745", tricode: "HOU", fullName: "Houston Rockets", aliases: ["houston", "rockets", "hou"] },
  { teamId: "1610612754", tricode: "IND", fullName: "Indiana Pacers", aliases: ["indiana", "pacers", "ind"] },
  { teamId: "1610612746", tricode: "LAC", fullName: "LA Clippers", aliases: ["clippers", "la clippers", "los angeles clippers", "lac"] },
  { teamId: "1610612747", tricode: "LAL", fullName: "Los Angeles Lakers", aliases: ["lakers", "la lakers", "los angeles lakers", "lal"] },
  { teamId: "1610612763", tricode: "MEM", fullName: "Memphis Grizzlies", aliases: ["memphis", "grizzlies", "griz", "mem"] },
  { teamId: "1610612748", tricode: "MIA", fullName: "Miami Heat", aliases: ["miami", "heat", "mia"] },
  { teamId: "1610612749", tricode: "MIL", fullName: "Milwaukee Bucks", aliases: ["milwaukee", "bucks", "mil"] },
  { teamId: "1610612750", tricode: "MIN", fullName: "Minnesota Timberwolves", aliases: ["minnesota", "timberwolves", "wolves", "min"] },
  { teamId: "1610612740", tricode: "NOP", fullName: "New Orleans Pelicans", aliases: ["new orleans", "pelicans", "pels", "nop"] },
  { teamId: "1610612752", tricode: "NYK", fullName: "New York Knicks", aliases: ["new york", "knicks", "nyk"] },
  { teamId: "1610612760", tricode: "OKC", fullName: "Oklahoma City Thunder", aliases: ["oklahoma city", "thunder", "okc"] },
  { teamId: "1610612753", tricode: "ORL", fullName: "Orlando Magic", aliases: ["orlando", "magic", "orl"] },
  { teamId: "1610612755", tricode: "PHI", fullName: "Philadelphia 76ers", aliases: ["philadelphia", "76ers", "sixers", "phi"] },
  { teamId: "1610612756", tricode: "PHX", fullName: "Phoenix Suns", aliases: ["phoenix", "suns", "phx"] },
  { teamId: "1610612757", tricode: "POR", fullName: "Portland Trail Blazers", aliases: ["portland", "trail blazers", "blazers", "por"] },
  { teamId: "1610612758", tricode: "SAC", fullName: "Sacramento Kings", aliases: ["sacramento", "kings", "sac"] },
  { teamId: "1610612759", tricode: "SAS", fullName: "San Antonio Spurs", aliases: ["san antonio", "spurs", "sas"] },
  { teamId: "1610612761", tricode: "TOR", fullName: "Toronto Raptors", aliases: ["toronto", "raptors", "tor"] },
  { teamId: "1610612762", tricode: "UTA", fullName: "Utah Jazz", aliases: ["utah", "jazz", "uta"] },
  { teamId: "1610612764", tricode: "WAS", fullName: "Washington Wizards", aliases: ["washington", "wizards", "was"] },
] as const;

type MetricDefinition = {
  key: string;
  label: string;
  aliases: string[];
  kind: "count" | "rate";
  formatter?: "integer" | "percent" | "decimal";
};

type ResultFilter = "all" | "win" | "loss";
type HomeAwayFilter = "all" | "home" | "away";
type SortDirection = "asc" | "desc";
type QuerySeasonScope = "all" | "regular" | "playoffs";
type QueryAggregation =
  | "season_total"
  | "season_average"
  | "max_game"
  | "min_game"
  | "list_games"
  | "count_games_gte"
  | "count_games_lte"
  | "count_games_nonzero"
  | "record"
  | "record_when_gte"
  | "record_when_lte"
  | "record_when_nonzero";

type QueryGroupBy = "none" | "opponent" | "result" | "period" | "home_away" | "month" | "season_scope" | "on_off";
type QuerySortBy = "value" | "date";

type ParsedQuery = {
  teamId: string;
  statKey: string;
  aggregation: QueryAggregation;
  playerId?: string;
  playerName?: string;
  threshold?: number;
  opponentTeamId?: string;
  resultFilter?: ResultFilter;
  homeAwayFilter?: HomeAwayFilter;
  seasonScope?: QuerySeasonScope;
  sort?: SortDirection;
  sortBy?: QuerySortBy;
  limit?: number;
  groupBy?: QueryGroupBy;
  contextPlayerIds?: string[];
  contextPlayerNames?: string[];
};

type OpponentRelativeRequest = {
  team: (typeof NBA_TEAMS)[number];
  metric: MetricDefinition;
  comparison: "gt" | "lt" | "eq";
  aggregation: "count_games" | "record";
  seasonScope: QuerySeasonScope;
  resultFilter: ResultFilter;
  homeAwayFilter: HomeAwayFilter;
};

type QueryGameRow = {
  gameId: string;
  gameDate: string;
  opponent: {
    teamId: string;
    tricode: string;
    fullName: string;
  };
  value: number;
  result: "W" | "L";
  teamScore: number;
  opponentScore: number;
  margin: number;
  isHome: boolean;
  seasonType: string;
  groupKey?: string;
  groupLabel?: string;
};

type AnyRecord = Record<string, unknown>;

type TeamPerspective = {
  side: "home" | "away";
  team: AnyRecord;
  opponent: AnyRecord;
  teamStats: AnyRecord;
  opponentStats: AnyRecord;
  teamBox: AnyRecord;
  opponentBox: AnyRecord;
};

type BuiltGameMetrics = {
  teamId: string;
  opponentId: string;
  opponent: {
    teamId: string;
    tricode: string;
    fullName: string;
  };
  teamScore: number;
  opponentScore: number;
  margin: number;
  result: "W" | "L";
  isHome: boolean;
  seasonType: string;
  metrics: Record<string, number>;
};

type CachedTeamGameRow = QueryGameRow & {
  metrics: Record<string, number>;
  opponentMetrics: Record<string, number>;
};

type CachedPlayerGameRow = QueryGameRow & {
  playerId: string;
  playerName: string;
  teamId: string;
  metrics: Record<string, number>;
};

type GameTableColumn = {
  key: string;
  label: string;
  side?: "team" | "opponent";
  metricKeys?: string[];
  valueType?: "single" | "pair";
  formatter?: MetricDefinition["formatter"];
};

type ParsedGameTableRequest = {
  teamId: string;
  opponentTeamId?: string;
  resultFilter: ResultFilter;
  seasonScope: QuerySeasonScope;
  sort: SortDirection;
  columns: GameTableColumn[];
};

const METRICS: MetricDefinition[] = [
  { key: "minutes", label: "Minutes", aliases: ["minutes", "minute", "mins", "min", "mp"], kind: "count", formatter: "decimal" },
  { key: "points", label: "Points", aliases: ["points", "pts", "scoring"], kind: "count" },
  { key: "field_goals_made", label: "Field Goals Made", aliases: ["field goals made", "fg made", "fgm", "made field goals"], kind: "count" },
  { key: "field_goals_attempted", label: "Field Goals Attempted", aliases: ["field goals attempted", "fg attempted", "fga", "field goal attempts"], kind: "count" },
  { key: "three_pointers_made", label: "3FG Made", aliases: ["3fg made", "3fgm", "3fgs", "3s made", "made 3s", "made threes", "three pointers made", "three point makes", "3pt made", "3pt makes", "3pm", "treys made"], kind: "count" },
  { key: "three_pointers_attempted", label: "3FG Attempted", aliases: ["3fg attempted", "3fga", "3 point attempts", "3pt attempts", "three pointers attempted", "three point attempts", "3s attempted", "3pa", "trey attempts"], kind: "count" },
  { key: "free_throws_made", label: "Free Throws Made", aliases: ["free throws made", "ft made", "ftm", "fts made"], kind: "count" },
  { key: "free_throws_attempted", label: "Free Throws Attempted", aliases: ["free throws attempted", "ft attempted", "fta", "free throw attempts"], kind: "count" },
  { key: "rebounds_total", label: "Rebounds", aliases: ["rebounds", "total rebounds", "reb", "boards", "rebs"], kind: "count" },
  { key: "rebounds_offensive", label: "Offensive Rebounds", aliases: ["offensive rebounds", "oreb", "orb"], kind: "count" },
  { key: "assists", label: "Assists", aliases: ["assists", "ast", "dimes"], kind: "count" },
  { key: "steals", label: "Steals", aliases: ["steals", "stl", "picks"], kind: "count" },
  { key: "blocks", label: "Blocks", aliases: ["blocks", "blk", "swats"], kind: "count" },
  { key: "turnovers", label: "Turnovers", aliases: ["turnovers", "tos", "to", "giveaways"], kind: "count" },
  { key: "fouls_personal", label: "Personal Fouls", aliases: ["personal fouls", "fouls", "pf"], kind: "count" },
  { key: "transition_points", label: "Transition Points", aliases: ["transition points", "fastbreak points", "fast break points"], kind: "count" },
  { key: "transition_possessions", label: "Transition Possessions", aliases: ["transition possessions", "fastbreak possessions", "fast break possessions"], kind: "count" },
  { key: "transition_turnovers", label: "Transition Turnovers", aliases: ["transition turnovers", "fastbreak turnovers", "fast break turnovers"], kind: "count" },
  { key: "transition_rate", label: "Transition Rate", aliases: ["transition rate", "fastbreak rate", "fast break rate"], kind: "rate", formatter: "percent" },
  { key: "transition_ppp", label: "Transition PPP", aliases: ["transition ppp", "fastbreak ppp", "fast break ppp"], kind: "rate", formatter: "decimal" },
  { key: "second_chance_points", label: "Second-Chance Points", aliases: ["second chance points", "2nd chance points"], kind: "count" },
  { key: "points_off_turnovers", label: "Points Off Turnovers", aliases: ["points off turnovers", "pot", "points off tos"], kind: "count" },
  { key: "paint_points", label: "Paint Points", aliases: ["paint points", "points in the paint"], kind: "count" },
  { key: "dynamite_3s_made", label: "Dynamite 3s", aliases: ["dynamite 3s", "dynamite threes", "second chance 3s", "second-chance 3s"], kind: "count" },
  { key: "dynamite_3s_attempted", label: "Dynamite 3s Attempted", aliases: ["dynamite 3 attempts", "dynamite 3s attempted", "second chance 3 attempts"], kind: "count" },
  { key: "driving_fg_made", label: "Driving FG Made", aliases: ["driving field goals made", "driving fgm"], kind: "count" },
  { key: "driving_fg_attempted", label: "Driving FG Attempted", aliases: ["driving field goals attempted", "driving fga"], kind: "count" },
  { key: "driving_fg_percent", label: "Driving FG%", aliases: ["driving fg%", "driving field goal percentage"], kind: "rate", formatter: "percent" },
  { key: "cutting_fg_made", label: "Cutting FG Made", aliases: ["cutting field goals made", "cutting fgm"], kind: "count" },
  { key: "cutting_fg_attempted", label: "Cutting FG Attempted", aliases: ["cutting field goals attempted", "cutting fga"], kind: "count" },
  { key: "cutting_fg_percent", label: "Cutting FG%", aliases: ["cutting fg%", "cutting field goal percentage"], kind: "rate", formatter: "percent" },
  { key: "catch_shoot_3_made", label: "Catch-and-Shoot 3s", aliases: ["catch and shoot 3s", "c&s 3s", "catch-and-shoot 3s"], kind: "count" },
  { key: "catch_shoot_3_attempted", label: "Catch-and-Shoot 3s Attempted", aliases: ["catch and shoot 3 attempts", "c&s 3 attempts"], kind: "count" },
  { key: "catch_shoot_3_percent", label: "Catch-and-Shoot 3P%", aliases: ["catch and shoot 3 percentage", "c&s 3%", "catch-and-shoot 3p%"], kind: "rate", formatter: "percent" },
  { key: "offensive_fouls_drawn", label: "Offensive Fouls Drawn", aliases: ["offensive fouls drawn", "off fouls drawn", "offensive fd"], kind: "count" },
  { key: "charges_drawn", label: "Charges Drawn", aliases: ["charges drawn"], kind: "count" },
  { key: "deflections", label: "Deflections", aliases: ["deflections"], kind: "count" },
  { key: "disruptions", label: "Disruptions", aliases: ["disruptions"], kind: "count" },
  { key: "kills", label: "Kills", aliases: ["kills"], kind: "count" },
  { key: "first_half_margin", label: "First-Half Margin", aliases: ["first half margin", "halftime margin", "margin at halftime", "lead at halftime", "winning at halftime", "were winning at halftime", "ahead at halftime", "halftime lead", "outscored opponents in the first half", "outscored opponents in first half"], kind: "count", formatter: "decimal" },
  { key: "offensive_rating", label: "Offensive Rating", aliases: ["offensive rating", "ortg", "off rating"], kind: "rate", formatter: "decimal" },
  { key: "defensive_rating", label: "Defensive Rating", aliases: ["defensive rating", "drtg", "def rating"], kind: "rate", formatter: "decimal" },
  { key: "net_rating", label: "Net Rating", aliases: ["net rating", "netrtg"], kind: "rate", formatter: "decimal" },
  { key: "efg_pct", label: "eFG%", aliases: ["efg", "efg%", "effective field goal percentage"], kind: "rate", formatter: "percent" },
  { key: "tov_pct", label: "TOV%", aliases: ["tov%", "turnover percentage"], kind: "rate", formatter: "percent" },
  { key: "orb_pct", label: "ORB%", aliases: ["orb%", "offensive rebound percentage"], kind: "rate", formatter: "percent" },
  { key: "ftr", label: "FTr", aliases: ["ftr", "free throw rate"], kind: "rate", formatter: "decimal" },
  { key: "rim_rate", label: "Rim Rate", aliases: ["rim rate"], kind: "rate", formatter: "percent" },
  { key: "mid_rate", label: "Mid Rate", aliases: ["mid rate", "midrange rate", "mid-range rate"], kind: "rate", formatter: "percent" },
  { key: "three_rate", label: "3P Rate", aliases: ["3p rate", "3pt rate", "three point rate"], kind: "rate", formatter: "percent" },
  { key: "rim_fg_pct", label: "Rim FG%", aliases: ["rim fg%", "rim field goal percentage"], kind: "rate", formatter: "percent" },
  { key: "mid_fg_pct", label: "Mid FG%", aliases: ["mid fg%", "mid field goal percentage"], kind: "rate", formatter: "percent" },
  { key: "three_fg_pct", label: "3P FG%", aliases: ["3p fg%", "3pt fg%", "three point percentage", "3pt percentage"], kind: "rate", formatter: "percent" },
];

const SEASON_GAMES_CACHE = new Map<string, Promise<Record<string, unknown>[]>>();
const GAME_DETAILS_CACHE = new Map<string, Promise<Record<string, unknown>>>();
const TEAM_SEASON_DATASET_CACHE = new Map<string, Promise<{
  rows: Array<QueryGameRow & { metrics: Record<string, number> }>;
  skippedGames: Array<{ gameId: string; gameDate: string; error: string }>;
}>>();
const PLAYER_SEASON_DATASET_CACHE = new Map<string, Promise<{
  rows: CachedPlayerGameRow[];
  skippedGames: Array<{ gameId: string; gameDate: string; error: string }>;
}>>();
const PLAYER_PERIOD_POINTS_DATASET_CACHE = new Map<string, Promise<{
  rows: CachedPlayerGameRow[];
  skippedGames: Array<{ gameId: string; gameDate: string; error: string }>;
}>>();
const TEAM_PERIOD_POINTS_DATASET_CACHE = new Map<string, Promise<{
  rows: CachedTeamGameRow[];
  skippedGames: Array<{ gameId: string; gameDate: string; error: string }>;
}>>();
const TEAM_ROSTERS_CACHE = new Map<string, Promise<Array<{
  teamId: string;
  team: (typeof NBA_TEAMS)[number];
  players: Array<{ playerId: string; playerName: string }>;
}>>>();
const GAME_MINUTES_CACHE = new Map<string, Promise<Record<string, unknown>>>();
const TEAM_ON_OFF_DATASET_CACHE = new Map<string, Promise<{
  rows: CachedTeamGameRow[];
  skippedGames: Array<{ gameId: string; gameDate: string; error: string }>;
}>>();

const ROSTER_SNAPSHOT_BY_TEAM = rosterSnapshot as Record<string, Array<Record<string, unknown>>>;

const PERIOD_SUPPORTED_METRIC_KEYS = new Set([
  "minutes",
  "points",
  "field_goals_made",
  "field_goals_attempted",
  "three_pointers_made",
  "three_pointers_attempted",
  "free_throws_made",
  "free_throws_attempted",
  "rebounds_total",
  "rebounds_offensive",
  "assists",
  "steals",
  "blocks",
  "turnovers",
  "fouls_personal",
  "three_fg_pct",
  "efg_pct",
  "tov_pct",
  "ftr",
  "three_rate",
]);

const ON_OFF_SUPPORTED_METRIC_KEYS = new Set([
  "points",
  "offensive_rating",
  "defensive_rating",
  "net_rating",
]);

function normalizeText(value: string) {
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
    .replace(/\bshoot(?:ing|s)?\s+3s\b/g, "3fg attempted")
    .replace(/\bshot\s+3s\b/g, "3fg attempted")
    .replace(/\bshoot(?:ing|s)?\s+threes\b/g, "3fg attempted")
    .replace(/\btook\s+shots\b/g, "fg attempted")
    .replace(/\btake\s+shots\b/g, "fg attempted")
    .replace(/\bthree pointers\b/g, "3pt")
    .replace(/\bthree point\b/g, "3pt")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeToken(token: string) {
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

function tokenizeText(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

function uniqueTokens(value: string) {
  return [...new Set(tokenizeText(value))];
}

const MATCH_STOPWORDS = new Set([
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

function uniqueMeaningfulTokens(value: string) {
  return uniqueTokens(value).filter((token) => !MATCH_STOPWORDS.has(token));
}

function tokenOverlapScore(promptTokens: string[], aliasTokens: string[]) {
  if (!aliasTokens.length) return 0;
  const promptSet = new Set(promptTokens);
  const matches = aliasTokens.filter((token) => promptSet.has(token)).length;
  return matches / aliasTokens.length;
}

const TEAM_SEARCH_INDEX = NBA_TEAMS.map((team) => ({
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

const PHRASE_VARIANT_RULES = [
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

function buildPhraseVariants(seed: string) {
  const normalizedSeed = normalizeText(seed);
  const pending = [normalizedSeed];
  const variants = new Set<string>();

  while (pending.length) {
    const phrase = pending.pop() || "";
    if (!phrase || variants.has(phrase)) continue;
    variants.add(phrase);

    PHRASE_VARIANT_RULES.forEach(({ pattern, replacements }) => {
      if (!pattern.test(phrase)) return;
      replacements.forEach((replacement) => {
        pending.push(phrase.replace(pattern, replacement));
      });
    });
  }

  return [...variants];
}

function stripTrailingQualifier(value: string, qualifier: "made" | "attempted") {
  const normalized = normalizeText(value);
  const patterns = qualifier === "made"
    ? [/\bmade\b/g, /\bmakes\b/g, /\bmake\b/g]
    : [/\battempted\b/g, /\battempts\b/g, /\battempt\b/g];
  return patterns
    .reduce((current, pattern) => current.replace(pattern, " "), normalized)
    .replace(/\s+/g, " ")
    .trim();
}

function buildMetricSearchAliases(metric: MetricDefinition) {
  const seeds = new Set<string>([
    metric.key.replace(/_/g, " "),
    metric.label,
    ...metric.aliases,
  ]);

  if (metric.key.endsWith("_made")) {
    [...seeds].forEach((seed) => {
      const base = stripTrailingQualifier(seed, "made");
      if (base) {
        seeds.add(base);
        seeds.add(`made ${base}`);
        seeds.add(`${base} made`);
      }
    });
  }

  if (metric.key.endsWith("_attempted")) {
    [...seeds].forEach((seed) => {
      const base = stripTrailingQualifier(seed, "attempted");
      if (base) {
        seeds.add(base);
        seeds.add(`attempted ${base}`);
        seeds.add(`${base} attempted`);
        seeds.add(`${base} attempts`);
        seeds.add(`attempt ${base}`);
        if (base.includes("3")) {
          seeds.add("shoot 3s");
          seeds.add("shot 3s");
          seeds.add("shoot threes");
          seeds.add("3s shot");
        }
        if (base.includes("field goals") || base === "fg") {
          seeds.add("shots");
          seeds.add("take shots");
          seeds.add("took shots");
          seeds.add("shot attempts");
        }
      }
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

const METRIC_SEARCH_INDEX = METRICS.map((metric) => ({
  metric,
  aliases: buildMetricSearchAliases(metric).map((alias) => ({
    alias,
    tokens: uniqueMeaningfulTokens(alias),
  })),
}));

function parseThreshold(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  const numericMatch = /(\d+(?:\.\d+)?)\s*\+/.exec(normalizedPrompt)
    || /(\d+(?:\.\d+)?)\s*(?:or more|or greater|at least|plus|>=)/.exec(normalizedPrompt)
    || /at least\s+(\d+(?:\.\d+)?)/.exec(normalizedPrompt)
    || /over\s+(\d+(?:\.\d+)?)/.exec(normalizedPrompt)
    || /more than\s+(\d+(?:\.\d+)?)/.exec(normalizedPrompt)
    || /under\s+(\d+(?:\.\d+)?)/.exec(normalizedPrompt)
    || /below\s+(\d+(?:\.\d+)?)/.exec(normalizedPrompt)
    || /less than\s+(\d+(?:\.\d+)?)/.exec(normalizedPrompt)
    || /fewer than\s+(\d+(?:\.\d+)?)/.exec(normalizedPrompt);
  if (numericMatch) return safeNumber(numericMatch[1], 0);
  return null;
}

function isLowerBoundPrompt(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  return /\+/.test(normalizedPrompt)
    || /or more|or greater|at least|plus|>=|over|more than/.test(normalizedPrompt);
}

function isUpperBoundPrompt(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  return /under|below|less than|fewer than|<=|at most|or fewer/.test(normalizedPrompt);
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function requestJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 8,
) {
  const results: R[] = new Array(items.length);
  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    const batchResults = await Promise.all(
      batch.map((item, batchIndex) => worker(item, index + batchIndex)),
    );
    batchResults.forEach((result, batchIndex) => {
      results[index + batchIndex] = result;
    });
  }
  return results;
}

function currentSeasonString(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function currentSeasonBounds(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const startYear = month >= 7 ? year : year - 1;
  const seasonStart = new Date(Date.UTC(startYear, 9, 1));
  const seasonEnd = new Date(Date.UTC(startYear + 1, 5, 30));
  return {
    start: seasonStart,
    end: date < seasonEnd ? date : seasonEnd,
  };
}

function parseClockText(clock: unknown) {
  const raw = String(clock || "").trim();
  if (!raw) return 0;
  const parts = raw.split(":");
  if (parts.length !== 2) return 0;
  return (Number(parts[0] || 0) * 60) + Number(parts[1] || 0);
}

function parseIsoClock(clock: unknown) {
  const raw = String(clock || "").trim();
  const match = /PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/i.exec(raw);
  if (!match) return 0;
  return (Number(match[1] || 0) * 60) + Number(match[2] || 0);
}

function periodLengthSeconds(period: number) {
  return period > 4 ? 5 * 60 : 12 * 60;
}

function formatDateInput(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function enumerateDateInputs(start: Date, end: Date) {
  const dates: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    dates.push(formatDateInput(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function isPlayedGame(game: Record<string, unknown>) {
  const status = safeNumber(game?.gameStatus, 0);
  return status === 2 || status === 3;
}

function isNbaDashboardGame(game: Record<string, unknown>) {
  return !String(game?.gameId || "").startsWith("202");
}

function isSupportedSeasonGame(game: Record<string, unknown>) {
  const gameId = String(game?.gameId || "");
  return gameId.startsWith("002") || gameId.startsWith("004");
}

async function fetchGamesByDate(dateStr: string) {
  return requestJson(`${API_BASE}/games/byDate?date=${dateStr}`).catch(() => []);
}

async function fetchSeasonGames(season = currentSeasonString()) {
  if (!SEASON_GAMES_CACHE.has(season)) {
    SEASON_GAMES_CACHE.set(season, (async () => {
      const { start, end } = currentSeasonBounds(new Date());
      const dateInputs = enumerateDateInputs(start, end);
      const concurrency = 8;
      const aggregated: Record<string, unknown>[] = [];

      for (let index = 0; index < dateInputs.length; index += concurrency) {
        const batch = dateInputs.slice(index, index + concurrency);
        const batchResults = await Promise.all(
          batch.map(async (dateInput) => {
            const games = await fetchGamesByDate(dateInput).catch(() => []);
            return (Array.isArray(games) ? games : [])
              .filter((game) => isNbaDashboardGame(game as Record<string, unknown>))
              .filter((game) => isSupportedSeasonGame(game as Record<string, unknown>))
              .filter((game) => isPlayedGame(game as Record<string, unknown>))
              .map((game) => ({ ...(game as Record<string, unknown>), gameDate: dateInput }));
          }),
        );
        aggregated.push(...batchResults.flat());
      }

      return [...new Map(aggregated.map((game) => [String(game.gameId || ""), game])).values()]
        .sort((left, right) => String(right.gameDate || "").localeCompare(String(left.gameDate || "")));
    })());
  }
  return SEASON_GAMES_CACHE.get(season)!;
}

function isSuspiciousGamePayload(game: Record<string, unknown>) {
  const homeScore = safeNumber((game.homeTeam as Record<string, unknown> | undefined)?.score, 0);
  const awayScore = safeNumber((game.awayTeam as Record<string, unknown> | undefined)?.score, 0);
  const homeBoxPoints = safeNumber((((game.boxScore as Record<string, unknown> | undefined)?.home as Record<string, unknown> | undefined)?.totals as Record<string, unknown> | undefined)?.points, 0);
  const awayBoxPoints = safeNumber((((game.boxScore as Record<string, unknown> | undefined)?.away as Record<string, unknown> | undefined)?.totals as Record<string, unknown> | undefined)?.points, 0);
  const playByPlayCount = Array.isArray(game.playByPlayActions) ? game.playByPlayActions.length : 0;

  if ((homeScore > 0 || awayScore > 0) && homeBoxPoints === 0 && awayBoxPoints === 0) return true;
  if (playByPlayCount === 0 && (homeScore > 0 || awayScore > 0)) return true;
  if (homeBoxPoints > 0 && homeScore > 0 && Math.abs(homeBoxPoints - homeScore) > 2) return true;
  if (awayBoxPoints > 0 && awayScore > 0 && Math.abs(awayBoxPoints - awayScore) > 2) return true;
  return false;
}

async function fetchGameDetailsWithRetry(gameId: string, maxAttempts = 3) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const game = await requestJson(`${API_BASE}/games/${gameId}`) as Record<string, unknown>;
      if (isSuspiciousGamePayload(game)) {
        throw new Error(`Incomplete game payload for ${gameId}.`);
      }
      return game;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 150));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch game ${gameId}.`);
}

async function fetchGameDetails(gameId: string) {
  if (!GAME_DETAILS_CACHE.has(gameId)) {
    const request = fetchGameDetailsWithRetry(gameId).catch((error) => {
      GAME_DETAILS_CACHE.delete(gameId);
      throw error;
    });
    GAME_DETAILS_CACHE.set(gameId, request);
  }
  return GAME_DETAILS_CACHE.get(gameId)!;
}

async function fetchGameDetailsSafe(gameId: string) {
  try {
    const game = await fetchGameDetails(gameId);
    return { game, error: null };
  } catch (error) {
    console.error(`Skipping game ${gameId} after upstream failure.`, error);
    return {
      game: null,
      error: error instanceof Error ? error.message : "Unknown error.",
    };
  }
}

async function fetchMinutesWithRetry(gameId: string, maxAttempts = 3) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestJson(`${API_BASE}/games/${gameId}/minutes`) as Record<string, unknown>;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 150));
      }
    }
  }
  throw lastError || new Error(`Failed to fetch minutes for ${gameId}.`);
}

async function fetchGameMinutes(gameId: string) {
  if (!GAME_MINUTES_CACHE.has(gameId)) {
    const request = fetchMinutesWithRetry(gameId).catch((error) => {
      GAME_MINUTES_CACHE.delete(gameId);
      throw error;
    });
    GAME_MINUTES_CACHE.set(gameId, request);
  }
  return GAME_MINUTES_CACHE.get(gameId)!;
}

function getSnapshotRoster(team: (typeof NBA_TEAMS)[number]) {
  const players = Array.isArray(ROSTER_SNAPSHOT_BY_TEAM[team.teamId])
    ? ROSTER_SNAPSHOT_BY_TEAM[team.teamId]
    : [];
  return {
    teamId: team.teamId,
    team,
    players: players
      .map((player) => ({
        playerId: String(player.personId || player.playerId || "").trim(),
        playerName: String(player.fullName || `${String(player.firstName || "").trim()} ${String(player.familyName || "").trim()}`).trim(),
      }))
      .filter((player) => player.playerId && player.playerName),
  };
}

async function fetchTeamRoster(team: (typeof NBA_TEAMS)[number], season: string) {
  const snapshotRoster = getSnapshotRoster(team);
  if (snapshotRoster.players.length) {
    return snapshotRoster;
  }

  const url = new URL("https://stats.nba.com/stats/commonteamroster");
  url.searchParams.set("LeagueID", "00");
  url.searchParams.set("Season", season);
  url.searchParams.set("TeamID", team.teamId);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Connection: "keep-alive",
      Host: "stats.nba.com",
      Origin: "https://www.nba.com",
      Referer: "https://www.nba.com/",
      "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Custom Requests)",
      "x-nba-stats-origin": "stats",
      "x-nba-stats-token": "true",
    },
  });

  if (!response.ok) {
    throw new Error(`Roster fetch failed (${response.status}) for ${team.tricode}`);
  }

  const payload = await response.json() as AnyRecord;
  const resultSets = Array.isArray(payload?.resultSets)
    ? payload.resultSets as AnyRecord[]
    : payload?.resultSet
      ? [payload.resultSet as AnyRecord]
      : [];
  const rosterSet = resultSets.find((entry) => String(entry?.name || "").toLowerCase() === "commonteamroster");
  const headers = Array.isArray(rosterSet?.headers) ? rosterSet.headers.map((value) => String(value || "")) : [];
  const rows = Array.isArray(rosterSet?.rowSet) ? rosterSet.rowSet as unknown[][] : [];

  return {
    teamId: team.teamId,
    team,
    players: rows
      .map((row) => headers.reduce<Record<string, unknown>>((accumulator, header, index) => {
        accumulator[header] = row[index];
        return accumulator;
      }, {}))
      .map((row) => ({
        playerId: String(row.PLAYER_ID || "").trim(),
        playerName: String(row.PLAYER || "").trim(),
      }))
      .filter((player) => player.playerId && player.playerName),
  };
}

async function fetchAllTeamRosters(season: string) {
  if (!TEAM_ROSTERS_CACHE.has(season)) {
    TEAM_ROSTERS_CACHE.set(
      season,
      Promise.resolve(
        NBA_TEAMS.map((team) => {
          const snapshotRoster = getSnapshotRoster(team);
          return snapshotRoster.players.length ? snapshotRoster : null;
        }).filter(Boolean) as Array<{
          teamId: string;
          team: (typeof NBA_TEAMS)[number];
          players: Array<{ playerId: string; playerName: string }>;
        }>,
      ),
    );
  }
  return TEAM_ROSTERS_CACHE.get(season)!;
}

function classifyShot(action: Record<string, unknown>) {
  if (String(action.actionType || "") === "3pt") return "three";
  const distance = safeNumber(action.shotDistance, 0);
  return distance <= 4.9 ? "rim" : "mid";
}

function isPersonalFoul(action: Record<string, unknown>) {
  const subtype = String(action.subType || "").toLowerCase();
  return !subtype.includes("technical");
}

function sameTeam(a: unknown, b: unknown) {
  return Number(a) === Number(b);
}

function estimatePossessions(teamTotals: Record<string, unknown>, opponentTotals: Record<string, unknown>) {
  const fieldGoalsAttempted = safeNumber(teamTotals.fieldGoalsAttempted, 0);
  const freeThrowsAttempted = safeNumber(teamTotals.freeThrowsAttempted, 0);
  const offensiveRebounds = safeNumber(teamTotals.reboundsOffensive, 0);
  const turnovers = safeNumber(teamTotals.turnovers, 0);
  const opponentFieldGoalsAttempted = safeNumber(opponentTotals.fieldGoalsAttempted, 0);
  const opponentFreeThrowsAttempted = safeNumber(opponentTotals.freeThrowsAttempted, 0);
  const opponentOffensiveRebounds = safeNumber(opponentTotals.reboundsOffensive, 0);
  const opponentTurnovers = safeNumber(opponentTotals.turnovers, 0);
  return 0.5 * (
    (fieldGoalsAttempted + 0.44 * freeThrowsAttempted - offensiveRebounds + turnovers) +
    (opponentFieldGoalsAttempted + 0.44 * opponentFreeThrowsAttempted - opponentOffensiveRebounds + opponentTurnovers)
  );
}

function buildDerivedTeamTotals(actions: Array<Record<string, unknown>>, homeTeamId: string, awayTeamId: string) {
  const orderedActions = [...actions].sort((a, b) => {
    const aOrder = safeNumber(a.orderNumber ?? a.actionNumber, 0);
    const bOrder = safeNumber(b.orderNumber ?? b.actionNumber, 0);
    return aOrder - bOrder;
  });

  const teamTotals: Record<string, Record<string, number>> = {
    [homeTeamId]: {
      points: 0,
      reboundsTotal: 0,
      reboundsOffensive: 0,
      assists: 0,
      blocks: 0,
      steals: 0,
      turnovers: 0,
      foulsPersonal: 0,
      transitionPoints: 0,
      transitionTurnovers: 0,
      transitionPossessions: 0,
      secondChancePoints: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      rimFieldGoalsMade: 0,
      rimFieldGoalsAttempted: 0,
      midFieldGoalsMade: 0,
      midFieldGoalsAttempted: 0,
      drivingFGMade: 0,
      drivingFGAttempted: 0,
      cuttingFGMade: 0,
      cuttingFGAttempted: 0,
      catchAndShoot3FGMade: 0,
      catchAndShoot3FGAttempted: 0,
      secondChance3FGMade: 0,
      secondChance3FGAttempted: 0,
      pointsOffTurnovers: 0,
      paintPoints: 0,
      threePointOReb: 0,
      offensiveFoulsDrawn: 0,
    },
    [awayTeamId]: {
      points: 0,
      reboundsTotal: 0,
      reboundsOffensive: 0,
      assists: 0,
      blocks: 0,
      steals: 0,
      turnovers: 0,
      foulsPersonal: 0,
      transitionPoints: 0,
      transitionTurnovers: 0,
      transitionPossessions: 0,
      secondChancePoints: 0,
      fieldGoalsMade: 0,
      fieldGoalsAttempted: 0,
      threePointersMade: 0,
      threePointersAttempted: 0,
      freeThrowsMade: 0,
      freeThrowsAttempted: 0,
      rimFieldGoalsMade: 0,
      rimFieldGoalsAttempted: 0,
      midFieldGoalsMade: 0,
      midFieldGoalsAttempted: 0,
      drivingFGMade: 0,
      drivingFGAttempted: 0,
      cuttingFGMade: 0,
      cuttingFGAttempted: 0,
      catchAndShoot3FGMade: 0,
      catchAndShoot3FGAttempted: 0,
      secondChance3FGMade: 0,
      secondChance3FGAttempted: 0,
      pointsOffTurnovers: 0,
      paintPoints: 0,
      threePointOReb: 0,
      offensiveFoulsDrawn: 0,
    },
  };

  const creditedTransitionTurnovers = new Set<string>();
  const creditedBlocks = new Set<string>();
  const lastMissedShotByTeam = new Map<string, Record<string, unknown>>();
  let currentPossession: number | null = null;
  let possessionTeam: number | null = null;
  let orebInPossession = false;
  let currentTransitionPossessionTeamId: string | null = null;
  let currentTransitionPossessionIsFastbreak = false;

  const finalizeTransitionPossession = () => {
    if (
      currentTransitionPossessionTeamId &&
      currentTransitionPossessionIsFastbreak &&
      teamTotals[currentTransitionPossessionTeamId]
    ) {
      teamTotals[currentTransitionPossessionTeamId].transitionPossessions += 1;
    }
    currentTransitionPossessionIsFastbreak = false;
  };

  const isStoppage = (action: Record<string, unknown>) =>
    ["timeout", "foul", "freethrow", "substitution", "violation"].includes(String(action.actionType || ""));

  const creditBlock = (playerId: unknown, blockTeamId: string, period: unknown, clock: unknown) => {
    if (!playerId || !blockTeamId || !teamTotals[blockTeamId]) return;
    const key = `${String(playerId)}:${String(period || "")}:${String(clock || "")}`;
    if (creditedBlocks.has(key)) return;
    creditedBlocks.add(key);
    teamTotals[blockTeamId].blocks += 1;
  };

  orderedActions.forEach((action) => {
    if (action.possession != null) {
      const nextPossession = Number(action.possession);
      if (Number.isFinite(nextPossession) && nextPossession !== currentPossession) {
        currentPossession = nextPossession;
        possessionTeam = nextPossession;
        orebInPossession = false;
      }
    }

    const possessionTeamId = action.possession != null && action.possession !== ""
      ? String(action.possession)
      : null;
    if (possessionTeamId && possessionTeamId !== currentTransitionPossessionTeamId) {
      finalizeTransitionPossession();
      currentTransitionPossessionTeamId = possessionTeamId;
    }

    const teamId = String(action.teamId || "");
    const teamStats = teamTotals[teamId];
    const isHome = teamId === homeTeamId;
    const isAway = teamId === awayTeamId;

    if (orebInPossession && isStoppage(action)) orebInPossession = false;

    if (action.actionType === "2pt" || action.actionType === "3pt") {
      const description = `${action.description || ""} ${action.descriptor || ""}`.toLowerCase();
      const qualifiers = Array.isArray(action.qualifiers) ? action.qualifiers.map((entry) => String(entry).toLowerCase()) : [];
      const isFastBreak = qualifiers.includes("fastbreak");
      const isSecondChance = qualifiers.includes("2ndchance") || qualifiers.includes("secondchance");
      const isFromTurnover = qualifiers.includes("fromturnover");
      const drivingKeywords = ["driving layup", "driving dunk", "driving float", "driving hook"];
      const shotDistance = safeNumber(action.shotDistance, 0);
      const isDriving =
        action.actionType === "2pt" &&
        shotDistance <= 7 &&
        drivingKeywords.some((keyword) => description.includes(keyword));
      const isCutting = description.includes("cutting");
      const isPullup = /pull.?up/.test(description);
      const isStepBack = /step.?back/.test(description);
      const isCatchAndShoot3 = action.actionType === "3pt" && !isPullup && !isStepBack;

      if (isFastBreak) currentTransitionPossessionIsFastbreak = true;

      if (isFromTurnover) {
        const opponentId = isHome ? awayTeamId : isAway ? homeTeamId : "";
        if (opponentId && teamTotals[opponentId]) {
          const possessionKey = String(action.possession ?? action.actionNumber ?? "");
          const creditKey = `${opponentId}:${possessionKey}`;
          if (!creditedTransitionTurnovers.has(creditKey)) {
            creditedTransitionTurnovers.add(creditKey);
            teamTotals[opponentId].transitionTurnovers += 1;
          }
        }
      }

      if (teamStats) {
        teamStats.fieldGoalsAttempted += 1;
        const shotType = classifyShot(action);
        if (shotType === "three") teamStats.threePointersAttempted += 1;
        if (shotType === "rim") teamStats.rimFieldGoalsAttempted += 1;
        if (shotType === "mid") teamStats.midFieldGoalsAttempted += 1;
        if (isDriving) teamStats.drivingFGAttempted += 1;
        if (isCutting) teamStats.cuttingFGAttempted += 1;
        if (isCatchAndShoot3) teamStats.catchAndShoot3FGAttempted += 1;
        if (action.actionType === "3pt" && orebInPossession && sameTeam(teamId, possessionTeam)) {
          teamStats.secondChance3FGAttempted += 1;
        }
      }

      if (String(action.shotResult || "") === "Made" && teamStats) {
        const points = action.actionType === "3pt" ? 3 : 2;
        const shotType = classifyShot(action);
        teamStats.points += points;
        if (isFastBreak) teamStats.transitionPoints += points;
        if (isSecondChance) teamStats.secondChancePoints += points;
        teamStats.fieldGoalsMade += 1;
        if (action.actionType === "3pt") teamStats.threePointersMade += 1;
        if (shotType === "rim") teamStats.rimFieldGoalsMade += 1;
        if (shotType === "mid") teamStats.midFieldGoalsMade += 1;
        if (isDriving) teamStats.drivingFGMade += 1;
        if (isCutting) teamStats.cuttingFGMade += 1;
        if (isCatchAndShoot3) teamStats.catchAndShoot3FGMade += 1;
        if (qualifiers.includes("fromturnover")) teamStats.pointsOffTurnovers += points;
        if (qualifiers.includes("pointsinthepaint")) teamStats.paintPoints += points;
        if (action.actionType === "3pt" && orebInPossession && sameTeam(teamId, possessionTeam)) {
          teamStats.secondChance3FGMade += 1;
        }
      } else if (teamId) {
        lastMissedShotByTeam.set(teamId, action);
      }

      if (safeNumber(action.assistPersonId, 0) && teamStats) teamStats.assists += 1;
      if (safeNumber(action.blockPersonId, 0)) {
        const blockTeamId = isHome ? awayTeamId : isAway ? homeTeamId : "";
        creditBlock(action.blockPersonId, blockTeamId, action.period, action.clock);
      }
    }

    if (action.actionType === "freethrow") {
      const qualifiers = Array.isArray(action.qualifiers) ? action.qualifiers.map((entry) => String(entry).toLowerCase()) : [];
      const isFastBreak = qualifiers.includes("fastbreak");
      if (isFastBreak) currentTransitionPossessionIsFastbreak = true;
      if (teamStats) teamStats.freeThrowsAttempted += 1;
      if (String(action.shotResult || "") === "Made" && teamStats) {
        teamStats.freeThrowsMade += 1;
        teamStats.points += 1;
        if (isFastBreak) teamStats.transitionPoints += 1;
      }
    }

    if (action.actionType === "rebound" && teamStats) {
      const isOffensive = String(action.subType || "") === "offensive";
      teamStats.reboundsTotal += 1;
      if (isOffensive) teamStats.reboundsOffensive += 1;

      if (isOffensive) {
        if (sameTeam(teamId, possessionTeam)) {
          orebInPossession = Boolean(action.personId);
        }
        const shot = action.shotActionNumber
          ? orderedActions.find((entry) => safeNumber(entry.actionNumber, 0) === safeNumber(action.shotActionNumber, 0))
          : null;
        const lastMiss = lastMissedShotByTeam.get(teamId);
        if (shot?.actionType === "3pt" || lastMiss?.actionType === "3pt") {
          teamStats.threePointOReb += 1;
        }
        if (teamId) lastMissedShotByTeam.delete(teamId);
      } else {
        const opponentId = isHome ? awayTeamId : isAway ? homeTeamId : "";
        if (opponentId) lastMissedShotByTeam.delete(opponentId);
      }
    }

    if (action.actionType === "steal" && teamStats) teamStats.steals += 1;

    if (action.actionType === "block") {
      creditBlock(action.personId, teamId, action.period, action.clock);
    }

    if (action.actionType === "turnover" && teamStats) {
      const qualifiers = Array.isArray(action.qualifiers) ? action.qualifiers.map((entry) => String(entry).toLowerCase()) : [];
      if (qualifiers.includes("fastbreak")) currentTransitionPossessionIsFastbreak = true;
      teamStats.turnovers += 1;
      if (qualifiers.includes("fromturnover") || qualifiers.includes("fastbreak")) {
        teamStats.transitionTurnovers += 1;
      }
    }

    if (action.actionType === "foul" && teamStats) {
      const qualifiers = Array.isArray(action.qualifiers) ? action.qualifiers.map((entry) => String(entry).toLowerCase()) : [];
      if (qualifiers.includes("fastbreak")) currentTransitionPossessionIsFastbreak = true;
      if (isPersonalFoul(action)) teamStats.foulsPersonal += 1;
      if (String(action.subType || "") === "offensive") {
        const opponentId = isHome ? awayTeamId : isAway ? homeTeamId : "";
        if (opponentId && teamTotals[opponentId]) {
          teamTotals[opponentId].offensiveFoulsDrawn += 1;
        }
      }
    }
  });

  finalizeTransitionPossession();
  return teamTotals;
}

function computeDisplayedKills(actions: Array<Record<string, unknown>>, teamId: string, homeTeamId: string, awayTeamId: string) {
  const orderedActions = [...actions].sort((a, b) => {
    const aOrder = safeNumber(a.orderNumber ?? a.actionNumber, 0);
    const bOrder = safeNumber(b.orderNumber ?? b.actionNumber, 0);
    return aOrder - bOrder;
  });
  const streaks: Record<string, number> = { [homeTeamId]: 0, [awayTeamId]: 0 };
  const kills: Record<string, number> = { [homeTeamId]: 0, [awayTeamId]: 0 };
  let currentPossession: unknown = null;
  let possessionScored = false;
  let possessionTeam: unknown = null;

  const finishPossession = () => {
    if (!possessionTeam) return;
    const possessionKey = String(possessionTeam);
    if (!possessionScored) {
      streaks[possessionKey] += 1;
      if (streaks[possessionKey] >= 3 && streaks[possessionKey] % 3 === 0) {
        const opponent = possessionKey === homeTeamId ? awayTeamId : homeTeamId;
        kills[opponent] += 1;
      }
    } else {
      streaks[possessionKey] = 0;
    }
  };

  orderedActions.forEach((action) => {
    if (action.possession && action.possession !== currentPossession) {
      finishPossession();
      currentPossession = action.possession;
      possessionTeam = action.possession;
      possessionScored = false;
    }

    if (!possessionTeam) return;
    if ((action.actionType === "2pt" || action.actionType === "3pt") && String(action.shotResult || "") === "Made") {
      possessionScored = true;
    }
    if (action.actionType === "freethrow" && String(action.teamId || "") === String(possessionTeam)) {
      possessionScored = true;
    }
  });

  finishPossession();
  return kills[teamId] || 0;
}

function selectTeamPerspective(game: AnyRecord, teamId: string): TeamPerspective {
  const homeTeamId = String(game?.homeTeam?.teamId || "");
  const awayTeamId = String(game?.awayTeam?.teamId || "");
  const emptyRecord: AnyRecord = {};
  const teamStats = (game.teamStats || emptyRecord) as AnyRecord;
  const boxScore = (game.boxScore || emptyRecord) as AnyRecord;
  if (teamId === homeTeamId) {
    return {
      side: "home",
      team: (game.homeTeam || emptyRecord) as AnyRecord,
      opponent: (game.awayTeam || emptyRecord) as AnyRecord,
      teamStats: (teamStats.home || emptyRecord) as AnyRecord,
      opponentStats: (teamStats.away || emptyRecord) as AnyRecord,
      teamBox: (boxScore.home || emptyRecord) as AnyRecord,
      opponentBox: (boxScore.away || emptyRecord) as AnyRecord,
    };
  }
  return {
    side: "away",
    team: (game.awayTeam || emptyRecord) as AnyRecord,
    opponent: (game.homeTeam || emptyRecord) as AnyRecord,
    teamStats: (teamStats.away || emptyRecord) as AnyRecord,
    opponentStats: (teamStats.home || emptyRecord) as AnyRecord,
    teamBox: (boxScore.away || emptyRecord) as AnyRecord,
    opponentBox: (boxScore.home || emptyRecord) as AnyRecord,
  };
}

function buildGameMetrics(game: AnyRecord, teamId: string): BuiltGameMetrics {
  const perspective = selectTeamPerspective(game, teamId);
  const homeTeamId = String(game?.homeTeam?.teamId || "");
  const awayTeamId = String(game?.awayTeam?.teamId || "");
  const derivedTotals = buildDerivedTeamTotals(
    Array.isArray(game?.playByPlayActions) ? game.playByPlayActions as Array<Record<string, unknown>> : [],
    homeTeamId,
    awayTeamId,
  );
  const teamBoxTotals = (perspective.teamBox?.totals || {}) as Record<string, unknown>;
  const opponentBoxTotals = (perspective.opponentBox?.totals || {}) as Record<string, unknown>;
  const teamTotals = {
    ...teamBoxTotals,
    ...(derivedTotals[teamId] || {}),
  };
  const opponentId = teamId === homeTeamId ? awayTeamId : homeTeamId;
  const opponentTotals = {
    ...opponentBoxTotals,
    ...(derivedTotals[opponentId] || {}),
  };
  const advancedStats = (perspective.teamStats?.advancedStats || {}) as Record<string, unknown>;
  const possessions = safeNumber(perspective.teamStats?.possessions, estimatePossessions(teamTotals, opponentTotals));
  const teamScore = safeNumber(teamTotals.points, safeNumber(perspective.team?.score, 0));
  const opponentPoints = safeNumber(opponentTotals.points, safeNumber(perspective.opponent?.score, 0));
  const deflections = safeNumber(advancedStats.deflections, 0);
  const offensiveFoulsDrawn = safeNumber(teamTotals.offensiveFoulsDrawn, safeNumber(advancedStats.offensiveFoulsDrawn, 0));
  const disruptions = safeNumber(teamTotals.steals, 0) + safeNumber(teamTotals.blocks, 0) + offensiveFoulsDrawn + deflections;
  const totalFga = Math.max(1, safeNumber(teamTotals.fieldGoalsAttempted, 0));
  const opponentDefReb = Math.max(0, safeNumber(opponentTotals.reboundsTotal, 0) - safeNumber(opponentTotals.reboundsOffensive, 0));
  const transitionPossessions = safeNumber(teamTotals.transitionPossessions, 0);
  const transitionPoints = safeNumber(teamTotals.transitionPoints, 0);
  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions as Array<Record<string, unknown>> : [];
  let firstHalfTeamPoints = 0;
  let firstHalfOpponentPoints = 0;
  actions.forEach((action) => {
    const period = safeNumber(action.period, 0);
    if (period < 1 || period > 2) return;
    const actionType = String(action.actionType || "").toLowerCase();
    const shotResult = String(action.shotResult || "");
    let points = 0;
    if ((actionType === "2pt" || actionType === "3pt") && shotResult === "Made") {
      points = actionType === "3pt" ? 3 : 2;
    } else if (actionType === "freethrow" && shotResult === "Made") {
      points = 1;
    }
    if (!points) return;
    if (String(action.teamId || "") === teamId) firstHalfTeamPoints += points;
    else firstHalfOpponentPoints += points;
  });

  return {
    teamId,
    opponentId,
    opponent: {
      teamId: String(perspective.opponent?.teamId || ""),
      tricode: String(perspective.opponent?.teamTricode || ""),
      fullName: `${String(perspective.opponent?.teamCity || "").trim()} ${String(perspective.opponent?.teamName || "").trim()}`.trim(),
    },
    teamScore,
    opponentScore: opponentPoints,
    margin: teamScore - opponentPoints,
    result: teamScore >= opponentPoints ? "W" : "L",
    isHome: teamId === homeTeamId,
    seasonType: String(game?.seasonType || ""),
    metrics: {
      points: safeNumber(teamTotals.points, 0),
      field_goals_made: safeNumber(teamTotals.fieldGoalsMade, 0),
      field_goals_attempted: safeNumber(teamTotals.fieldGoalsAttempted, 0),
      three_pointers_made: safeNumber(teamTotals.threePointersMade, 0),
      three_pointers_attempted: safeNumber(teamTotals.threePointersAttempted, 0),
      free_throws_made: safeNumber(teamTotals.freeThrowsMade, 0),
      free_throws_attempted: safeNumber(teamTotals.freeThrowsAttempted, 0),
      rebounds_total: safeNumber(teamTotals.reboundsTotal, 0),
      rebounds_offensive: safeNumber(teamTotals.reboundsOffensive, 0),
      assists: safeNumber(teamTotals.assists, 0),
      steals: safeNumber(teamTotals.steals, 0),
      blocks: safeNumber(teamTotals.blocks, 0),
      turnovers: safeNumber(teamTotals.turnovers, 0),
      fouls_personal: safeNumber(teamTotals.foulsPersonal, 0),
      transition_points: transitionPoints,
      transition_possessions: transitionPossessions,
      transition_turnovers: safeNumber(teamTotals.transitionTurnovers, 0),
      transition_rate: possessions > 0 ? (transitionPossessions / possessions) * 100 : 0,
      transition_ppp: transitionPossessions > 0 ? transitionPoints / transitionPossessions : 0,
      second_chance_points: safeNumber(teamTotals.secondChancePoints, 0),
      points_off_turnovers: safeNumber(teamTotals.pointsOffTurnovers, 0),
      paint_points: safeNumber(teamTotals.paintPoints, 0),
      dynamite_3s_made: safeNumber(teamTotals.secondChance3FGMade, 0),
      dynamite_3s_attempted: safeNumber(teamTotals.secondChance3FGAttempted, 0),
      driving_fg_made: safeNumber(teamTotals.drivingFGMade, 0),
      driving_fg_attempted: safeNumber(teamTotals.drivingFGAttempted, 0),
      driving_fg_percent: safeNumber(teamTotals.drivingFGAttempted, 0) > 0 ? (safeNumber(teamTotals.drivingFGMade, 0) / safeNumber(teamTotals.drivingFGAttempted, 1)) * 100 : 0,
      cutting_fg_made: safeNumber(teamTotals.cuttingFGMade, 0),
      cutting_fg_attempted: safeNumber(teamTotals.cuttingFGAttempted, 0),
      cutting_fg_percent: safeNumber(teamTotals.cuttingFGAttempted, 0) > 0 ? (safeNumber(teamTotals.cuttingFGMade, 0) / safeNumber(teamTotals.cuttingFGAttempted, 1)) * 100 : 0,
      catch_shoot_3_made: safeNumber(teamTotals.catchAndShoot3FGMade, 0),
      catch_shoot_3_attempted: safeNumber(teamTotals.catchAndShoot3FGAttempted, 0),
      catch_shoot_3_percent: safeNumber(teamTotals.catchAndShoot3FGAttempted, 0) > 0 ? (safeNumber(teamTotals.catchAndShoot3FGMade, 0) / safeNumber(teamTotals.catchAndShoot3FGAttempted, 1)) * 100 : 0,
      offensive_fouls_drawn: offensiveFoulsDrawn,
      charges_drawn: safeNumber(advancedStats.chargesDrawn, 0),
      deflections,
      disruptions,
      kills: computeDisplayedKills(
        actions,
        teamId,
        homeTeamId,
        awayTeamId,
      ),
      first_half_margin: firstHalfTeamPoints - firstHalfOpponentPoints,
      offensive_rating: possessions > 0 ? (safeNumber(teamTotals.points, 0) / possessions) * 100 : 0,
      defensive_rating: possessions > 0 ? (opponentPoints / possessions) * 100 : 0,
      net_rating: possessions > 0 ? ((safeNumber(teamTotals.points, 0) - opponentPoints) / possessions) * 100 : 0,
      efg_pct: totalFga > 0 ? ((safeNumber(teamTotals.fieldGoalsMade, 0) + (0.5 * safeNumber(teamTotals.threePointersMade, 0))) / totalFga) * 100 : 0,
      tov_pct: (safeNumber(teamTotals.fieldGoalsAttempted, 0) || safeNumber(teamTotals.freeThrowsAttempted, 0) || safeNumber(teamTotals.turnovers, 0))
        ? (safeNumber(teamTotals.turnovers, 0) / (safeNumber(teamTotals.fieldGoalsAttempted, 0) + (0.44 * safeNumber(teamTotals.freeThrowsAttempted, 0)) + safeNumber(teamTotals.turnovers, 0))) * 100
        : 0,
      orb_pct: (safeNumber(teamTotals.reboundsOffensive, 0) || opponentDefReb)
        ? (safeNumber(teamTotals.reboundsOffensive, 0) / (safeNumber(teamTotals.reboundsOffensive, 0) + opponentDefReb)) * 100
        : 0,
      ftr: totalFga > 0 ? safeNumber(teamTotals.freeThrowsAttempted, 0) / totalFga : 0,
      rim_rate: (safeNumber(teamTotals.rimFieldGoalsAttempted, 0) / totalFga) * 100,
      mid_rate: (safeNumber(teamTotals.midFieldGoalsAttempted, 0) / totalFga) * 100,
      three_rate: (safeNumber(teamTotals.threePointersAttempted, 0) / totalFga) * 100,
      rim_fg_pct: safeNumber(teamTotals.rimFieldGoalsAttempted, 0) > 0 ? (safeNumber(teamTotals.rimFieldGoalsMade, 0) / safeNumber(teamTotals.rimFieldGoalsAttempted, 1)) * 100 : 0,
      mid_fg_pct: safeNumber(teamTotals.midFieldGoalsAttempted, 0) > 0 ? (safeNumber(teamTotals.midFieldGoalsMade, 0) / safeNumber(teamTotals.midFieldGoalsAttempted, 1)) * 100 : 0,
      three_fg_pct: safeNumber(teamTotals.threePointersAttempted, 0) > 0 ? (safeNumber(teamTotals.threePointersMade, 0) / safeNumber(teamTotals.threePointersAttempted, 1)) * 100 : 0,
    },
  };
}

function buildPlayerMetricMap(player: Record<string, unknown>) {
  const minutes = parseMinutesToDecimal(player.minutes);
  const fieldGoalsAttempted = safeNumber(player.fieldGoalsAttempted, 0);
  const threePointersAttempted = safeNumber(player.threePointersAttempted, 0);
  const freeThrowsAttempted = safeNumber(player.freeThrowsAttempted, 0);
  const reboundsOffensive = safeNumber(player.reboundsOffensive, 0);
  const reboundsTotal = safeNumber(player.reboundsTotal, 0);
  const opponentDefRebWhileOnCourt = Math.max(0, safeNumber(player.opponentDRBWhileOnCourt, 0));
  const rimFieldGoalsAttempted = safeNumber(player.rimFieldGoalsAttempted, 0);
  const rimFieldGoalsMade = safeNumber(player.rimFieldGoalsMade, 0);
  const midFieldGoalsAttempted = safeNumber(player.midFieldGoalsAttempted, 0);
  const midFieldGoalsMade = safeNumber(player.midFieldGoalsMade, 0);

  return {
    minutes,
    points: safeNumber(player.points, 0),
    field_goals_made: safeNumber(player.fieldGoalsMade, 0),
    field_goals_attempted: fieldGoalsAttempted,
    three_pointers_made: safeNumber(player.threePointersMade, 0),
    three_pointers_attempted: threePointersAttempted,
    free_throws_made: safeNumber(player.freeThrowsMade, 0),
    free_throws_attempted: freeThrowsAttempted,
    rebounds_total: reboundsTotal,
    rebounds_offensive: reboundsOffensive,
    assists: safeNumber(player.assists, 0),
    steals: safeNumber(player.steals, 0),
    blocks: safeNumber(player.blocks, 0),
    turnovers: safeNumber(player.turnovers, 0),
    fouls_personal: safeNumber(player.foulsPersonal, 0),
    offensive_rating: safeNumber(player.offensiveRating, 0),
    defensive_rating: safeNumber(player.defensiveRating, 0),
    rim_rate: fieldGoalsAttempted > 0 ? (rimFieldGoalsAttempted / fieldGoalsAttempted) * 100 : 0,
    mid_rate: fieldGoalsAttempted > 0 ? (midFieldGoalsAttempted / fieldGoalsAttempted) * 100 : 0,
    three_rate: fieldGoalsAttempted > 0 ? (threePointersAttempted / fieldGoalsAttempted) * 100 : 0,
    rim_fg_pct: rimFieldGoalsAttempted > 0 ? (rimFieldGoalsMade / rimFieldGoalsAttempted) * 100 : 0,
    mid_fg_pct: midFieldGoalsAttempted > 0 ? (midFieldGoalsMade / midFieldGoalsAttempted) * 100 : 0,
    three_fg_pct: threePointersAttempted > 0 ? (safeNumber(player.threePointersMade, 0) / threePointersAttempted) * 100 : 0,
    efg_pct: fieldGoalsAttempted > 0
      ? ((safeNumber(player.fieldGoalsMade, 0) + (0.5 * safeNumber(player.threePointersMade, 0))) / fieldGoalsAttempted) * 100
      : 0,
    tov_pct: (fieldGoalsAttempted || freeThrowsAttempted || safeNumber(player.turnovers, 0))
      ? (safeNumber(player.turnovers, 0) / (fieldGoalsAttempted + (0.44 * freeThrowsAttempted) + safeNumber(player.turnovers, 0))) * 100
      : 0,
    orb_pct: (reboundsOffensive || opponentDefRebWhileOnCourt)
      ? (reboundsOffensive / (reboundsOffensive + opponentDefRebWhileOnCourt)) * 100
      : 0,
    ftr: fieldGoalsAttempted > 0 ? freeThrowsAttempted / fieldGoalsAttempted : 0,
    charges_drawn: safeNumber(player.chargesDrawn, 0),
    deflections: safeNumber(player.deflections, 0),
    disruptions: safeNumber(player.steals, 0)
      + safeNumber(player.blocks, 0)
      + safeNumber(player.chargesDrawn, 0)
      + safeNumber(player.deflections, 0),
  };
}

function buildPlayerSeasonRows(game: AnyRecord, team: (typeof NBA_TEAMS)[number]) {
  const perspective = selectTeamPerspective(game, team.teamId);
  const players = Array.isArray(perspective.teamBox?.players) ? perspective.teamBox.players as Array<Record<string, unknown>> : [];
  const teamScore = safeNumber(perspective.team?.score, safeNumber((perspective.teamBox?.totals as Record<string, unknown> | undefined)?.points, 0));
  const opponentScore = safeNumber(perspective.opponent?.score, safeNumber((perspective.opponentBox?.totals as Record<string, unknown> | undefined)?.points, 0));
  const result: "W" | "L" = teamScore >= opponentScore ? "W" : "L";
  const opponent = {
    teamId: String(perspective.opponent?.teamId || ""),
    tricode: String(perspective.opponent?.teamTricode || ""),
    fullName: `${String(perspective.opponent?.teamCity || "").trim()} ${String(perspective.opponent?.teamName || "").trim()}`.trim(),
  };

  return players
    .map((player) => {
      const playerId = String(player.personId || "").trim();
      const playerName = toDisplayName(player.firstName, player.familyName);
      if (!playerId || !playerName) return null;
      return {
        gameId: String(game.gameId || ""),
        gameDate: String(game.gameDate || ""),
        opponent,
        value: 0,
        result,
        teamScore,
        opponentScore,
        margin: teamScore - opponentScore,
        isHome: String(game?.homeTeam?.teamId || "") === team.teamId,
        seasonType: String(game?.seasonType || ""),
        playerId,
        playerName,
        teamId: team.teamId,
        metrics: buildPlayerMetricMap(player),
      } satisfies CachedPlayerGameRow;
    })
    .filter(Boolean) as CachedPlayerGameRow[];
}

function buildSinglePlayerSeasonRow(game: AnyRecord, team: (typeof NBA_TEAMS)[number], targetPlayerId: string) {
  const perspective = selectTeamPerspective(game, team.teamId);
  const players = Array.isArray(perspective.teamBox?.players) ? perspective.teamBox.players as Array<Record<string, unknown>> : [];
  const player = players.find((entry) => String(entry.personId || "").trim() === targetPlayerId);
  if (!player) return null;

  const teamScore = safeNumber(perspective.team?.score, safeNumber((perspective.teamBox?.totals as Record<string, unknown> | undefined)?.points, 0));
  const opponentScore = safeNumber(perspective.opponent?.score, safeNumber((perspective.opponentBox?.totals as Record<string, unknown> | undefined)?.points, 0));
  const opponent = {
    teamId: String(perspective.opponent?.teamId || ""),
    tricode: String(perspective.opponent?.teamTricode || ""),
    fullName: `${String(perspective.opponent?.teamCity || "").trim()} ${String(perspective.opponent?.teamName || "").trim()}`.trim(),
  };

  return {
    gameId: String(game.gameId || ""),
    gameDate: String(game.gameDate || ""),
    opponent,
    value: 0,
    result: teamScore >= opponentScore ? "W" : "L",
    teamScore,
    opponentScore,
    margin: teamScore - opponentScore,
    isHome: String(game?.homeTeam?.teamId || "") === team.teamId,
    seasonType: String(game?.seasonType || ""),
    playerId: targetPlayerId,
    playerName: toDisplayName(player.firstName, player.familyName),
    teamId: team.teamId,
    metrics: buildPlayerMetricMap(player),
  } satisfies CachedPlayerGameRow;
}

function buildPlayerPeriodMetricRows(game: AnyRecord, team: (typeof NBA_TEAMS)[number], minutesData?: AnyRecord | null) {
  const perspective = selectTeamPerspective(game, team.teamId);
  const players = Array.isArray(perspective.teamBox?.players) ? perspective.teamBox.players as Array<Record<string, unknown>> : [];
  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions as Array<Record<string, unknown>> : [];
  const teamScore = safeNumber(perspective.team?.score, safeNumber((perspective.teamBox?.totals as Record<string, unknown> | undefined)?.points, 0));
  const opponentScore = safeNumber(perspective.opponent?.score, safeNumber((perspective.opponentBox?.totals as Record<string, unknown> | undefined)?.points, 0));
  const result: "W" | "L" = teamScore >= opponentScore ? "W" : "L";
  const opponent = {
    teamId: String(perspective.opponent?.teamId || ""),
    tricode: String(perspective.opponent?.teamTricode || ""),
    fullName: `${String(perspective.opponent?.teamCity || "").trim()} ${String(perspective.opponent?.teamName || "").trim()}`.trim(),
  };

  const orderedActions = [...actions].sort((a, b) => {
    const aOrder = safeNumber(a.orderNumber ?? a.actionNumber, 0);
    const bOrder = safeNumber(b.orderNumber ?? b.actionNumber, 0);
    return aOrder - bOrder;
  });

  const metricsByPlayerPeriod = new Map<string, Record<string, number>>();
  const minutesByPlayerPeriod = new Map<string, number>();
  const ensurePeriodMetrics = (playerId: string, period: number) => {
    const key = `${playerId}:Q${period}`;
    if (!metricsByPlayerPeriod.has(key)) {
      metricsByPlayerPeriod.set(key, {
        minutes: 0,
        points: 0,
        field_goals_made: 0,
        field_goals_attempted: 0,
        three_pointers_made: 0,
        three_pointers_attempted: 0,
        free_throws_made: 0,
        free_throws_attempted: 0,
        rebounds_total: 0,
        rebounds_offensive: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls_personal: 0,
      });
    }
    return metricsByPlayerPeriod.get(key)!;
  };

  const isHome = String(game?.homeTeam?.teamId || "") === team.teamId;
  const periods = Array.isArray(minutesData?.periods) ? minutesData.periods as Array<Record<string, unknown>> : [];
  periods.forEach((periodEntry) => {
    const period = safeNumber(periodEntry.period, 0);
    const stints = Array.isArray(periodEntry.stints) ? periodEntry.stints as Array<Record<string, unknown>> : [];
    if (period < 1 || period > 4 || !stints.length) return;
    stints.forEach((stint) => {
      const playersForTeam = Array.isArray(isHome ? stint.playersHome : stint.playersAway)
        ? (isHome ? stint.playersHome : stint.playersAway) as Array<Record<string, unknown>>
        : [];
      const durationMinutes = Math.max(0, parseClockText(stint.startClock) - parseClockText(stint.endClock)) / 60;
      if (!durationMinutes) return;
      playersForTeam.forEach((player) => {
        const playerId = String(player.personId || "").trim();
        if (!playerId) return;
        const key = `${playerId}:Q${period}`;
        minutesByPlayerPeriod.set(key, safeNumber(minutesByPlayerPeriod.get(key), 0) + durationMinutes);
      });
    });
  });

  orderedActions.forEach((action) => {
    const teamId = String(action.teamId || "");
    const playerId = String(action.personId || "");
    const period = safeNumber(action.period, 0);
    if (teamId !== team.teamId || !playerId || period < 1 || period > 4) return;

    const actionType = String(action.actionType || "").toLowerCase();
    const shotResult = String(action.shotResult || "");
    const periodMetrics = ensurePeriodMetrics(playerId, period);
    let points = 0;
    if ((actionType === "2pt" || actionType === "3pt") && shotResult === "Made") {
      points = actionType === "3pt" ? 3 : 2;
    } else if (actionType === "freethrow" && shotResult === "Made") {
      points = 1;
    }

    if (actionType === "2pt" || actionType === "3pt") {
      periodMetrics.field_goals_attempted += 1;
      if (actionType === "3pt") periodMetrics.three_pointers_attempted += 1;
      if (shotResult === "Made") {
        periodMetrics.field_goals_made += 1;
        if (actionType === "3pt") periodMetrics.three_pointers_made += 1;
      }
    }

    if (actionType === "freethrow") {
      periodMetrics.free_throws_attempted += 1;
      if (shotResult === "Made") periodMetrics.free_throws_made += 1;
    }

    if (actionType === "rebound") {
      periodMetrics.rebounds_total += 1;
      if (String(action.subType || "").toLowerCase() === "offensive") {
        periodMetrics.rebounds_offensive += 1;
      }
    }

    if (actionType === "assist") periodMetrics.assists += 1;
    if (actionType === "steal") periodMetrics.steals += 1;
    if (actionType === "block") periodMetrics.blocks += 1;
    if (actionType === "turnover") periodMetrics.turnovers += 1;
    if (actionType === "foul" && isPersonalFoul(action)) periodMetrics.fouls_personal += 1;
    if (points > 0) periodMetrics.points += points;
  });

  return players.flatMap((player) => {
    const playerId = String(player.personId || "").trim();
    const playerName = toDisplayName(player.firstName, player.familyName);
    if (!playerId || !playerName) return [];
    return [1, 2, 3, 4].map((period) => {
      const periodMetrics = metricsByPlayerPeriod.get(`${playerId}:Q${period}`) || {
        minutes: safeNumber(minutesByPlayerPeriod.get(`${playerId}:Q${period}`), 0),
        points: 0,
        field_goals_made: 0,
        field_goals_attempted: 0,
        three_pointers_made: 0,
        three_pointers_attempted: 0,
        free_throws_made: 0,
        free_throws_attempted: 0,
        rebounds_total: 0,
        rebounds_offensive: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls_personal: 0,
      };
      periodMetrics.minutes = safeNumber(minutesByPlayerPeriod.get(`${playerId}:Q${period}`), 0);
      const fga = safeNumber(periodMetrics.field_goals_attempted, 0);
      const fgm = safeNumber(periodMetrics.field_goals_made, 0);
      const threeA = safeNumber(periodMetrics.three_pointers_attempted, 0);
      const threeM = safeNumber(periodMetrics.three_pointers_made, 0);
      const fta = safeNumber(periodMetrics.free_throws_attempted, 0);
      const tov = safeNumber(periodMetrics.turnovers, 0);
      return ({
      gameId: String(game.gameId || ""),
      gameDate: String(game.gameDate || ""),
      opponent,
      value: 0,
      result,
      teamScore,
      opponentScore,
      margin: teamScore - opponentScore,
      isHome: String(game?.homeTeam?.teamId || "") === team.teamId,
      seasonType: String(game?.seasonType || ""),
      groupKey: `Q${period}`,
      groupLabel: `Q${period}`,
      playerId,
      playerName,
      teamId: team.teamId,
      metrics: {
        ...periodMetrics,
        three_fg_pct: threeA > 0 ? (threeM / threeA) * 100 : 0,
        efg_pct: fga > 0 ? ((fgm + (0.5 * threeM)) / fga) * 100 : 0,
        tov_pct: (fga || fta || tov) ? (tov / (fga + (0.44 * fta) + tov)) * 100 : 0,
        ftr: fga > 0 ? fta / fga : 0,
        three_rate: fga > 0 ? (threeA / fga) * 100 : 0,
      },
    } satisfies CachedPlayerGameRow);
    });
  });
}

function buildSinglePlayerPeriodMetricRows(
  game: AnyRecord,
  team: (typeof NBA_TEAMS)[number],
  targetPlayerId: string,
  minutesData?: AnyRecord | null,
) {
  return buildPlayerPeriodMetricRows(game, team, minutesData)
    .filter((row) => row.playerId === targetPlayerId);
}

function buildTeamPeriodPointRows(game: AnyRecord, team: (typeof NBA_TEAMS)[number]) {
  const perspective = selectTeamPerspective(game, team.teamId);
  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions as Array<Record<string, unknown>> : [];
  const teamScore = safeNumber(perspective.team?.score, safeNumber((perspective.teamBox?.totals as Record<string, unknown> | undefined)?.points, 0));
  const opponentScore = safeNumber(perspective.opponent?.score, safeNumber((perspective.opponentBox?.totals as Record<string, unknown> | undefined)?.points, 0));
  const result: "W" | "L" = teamScore >= opponentScore ? "W" : "L";
  const opponent = {
    teamId: String(perspective.opponent?.teamId || ""),
    tricode: String(perspective.opponent?.teamTricode || ""),
    fullName: `${String(perspective.opponent?.teamCity || "").trim()} ${String(perspective.opponent?.teamName || "").trim()}`.trim(),
  };

  const pointsByPeriod = new Map<number, number>();
  actions.forEach((action) => {
    const teamId = String(action.teamId || "");
    const period = safeNumber(action.period, 0);
    if (teamId !== team.teamId || period < 1 || period > 4) return;
    const actionType = String(action.actionType || "").toLowerCase();
    const shotResult = String(action.shotResult || "");
    let points = 0;
    if ((actionType === "2pt" || actionType === "3pt") && shotResult === "Made") {
      points = actionType === "3pt" ? 3 : 2;
    } else if (actionType === "freethrow" && shotResult === "Made") {
      points = 1;
    } else {
      points = safeNumber(action.pointsTotal, 0);
    }
    if (!points) return;
    pointsByPeriod.set(period, safeNumber(pointsByPeriod.get(period), 0) + points);
  });

  return [1, 2, 3, 4].map((period) => ({
    gameId: String(game.gameId || ""),
    gameDate: String(game.gameDate || ""),
    opponent,
    value: 0,
    result,
    teamScore,
    opponentScore,
    margin: teamScore - opponentScore,
    isHome: String(game?.homeTeam?.teamId || "") === team.teamId,
    seasonType: String(game?.seasonType || ""),
    groupKey: `Q${period}`,
    groupLabel: `Q${period}`,
    metrics: {
      points: safeNumber(pointsByPeriod.get(period), 0),
    },
    opponentMetrics: {},
  } satisfies CachedTeamGameRow));
}

function findPlayerMatchFromRows(prompt: string, rows: CachedPlayerGameRow[]) {
  const normalizedPrompt = normalizePlayerName(prompt);
  if (!normalizedPrompt) return null;
  const promptTokens = normalizedPrompt.split(/\s+/).filter(Boolean);

  const candidates = uniqueByKey(
    rows.map((row) => ({ playerId: row.playerId, playerName: row.playerName })),
    (entry) => entry.playerId,
  );

  let bestMatch: { playerId: string; playerName: string } | null = null;
  let bestScore = 0;

  candidates.forEach((candidate) => {
    const fullName = normalizePlayerName(candidate.playerName);
    const parts = candidate.playerName.split(/\s+/).filter(Boolean);
    const lastName = normalizePlayerName(parts[parts.length - 1] || "");
    let score = 0;
    if (fullName && ` ${normalizedPrompt} `.includes(` ${fullName} `)) score = Math.max(score, 100);
    if (lastName && ` ${normalizedPrompt} `.includes(` ${lastName} `)) score = Math.max(score, 30);

    if (!score && fullName) {
      const partCount = Math.max(1, fullName.split(/\s+/).filter(Boolean).length);
      for (let index = 0; index <= promptTokens.length - partCount; index += 1) {
        const window = promptTokens.slice(index, index + partCount).join(" ");
        const distance = boundedLevenshtein(window, fullName, 2);
        if (distance <= 2) {
          score = Math.max(score, 90 - (distance * 10));
        }
      }
    }

    if (!score && lastName) {
      promptTokens.forEach((token) => {
        const distance = boundedLevenshtein(token, lastName, 2);
        if (distance <= 2) {
          score = Math.max(score, 40 - (distance * 5));
        }
      });
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  });

  return bestScore >= 30 ? bestMatch : null;
}

function findPlayerByExactName(rows: CachedPlayerGameRow[], playerName: string) {
  const normalizedTarget = normalizePlayerName(playerName);
  if (!normalizedTarget) return null;

  const candidates = uniqueByKey(
    rows.map((row) => ({ playerId: row.playerId, playerName: row.playerName })),
    (entry) => entry.playerId,
  );

  return candidates.find((candidate) => normalizePlayerName(candidate.playerName) === normalizedTarget) || null;
}

function extractLikelyPlayerName(prompt: string, team?: (typeof NBA_TEAMS)[number] | null) {
  const matches = extractLikelyPlayerNames(prompt, team);
  return matches[0] || null;
}

function extractLikelyPlayerNames(prompt: string, team?: (typeof NBA_TEAMS)[number] | null) {
  const matches = [...String(prompt || "").matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][A-Za-z'.-]+)+)\b/g)]
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
  if (!matches.length) return [];

  if (!team) {
    return uniqueByKey(matches.filter((candidate) => candidate.split(/\s+/).length >= 2), (candidate) => normalizePlayerName(candidate));
  }

  const teamNameParts = new Set([
    normalizePlayerName(team.fullName),
    ...team.fullName.split(/\s+/).map(normalizePlayerName),
    ...team.aliases.map(normalizePlayerName),
  ]);

  return matches.filter((candidate) => {
    const normalized = normalizePlayerName(candidate);
    if (!normalized) return false;
    if (teamNameParts.has(normalized)) return false;
    if ([...teamNameParts].some((part) => part && normalized === part)) return false;
    return candidate.split(/\s+/).length >= 2;
  });
}

async function inferTeamFromPlayerPrompt(prompt: string, season: string) {
  const likelyPlayerName = extractLikelyPlayerName(prompt, null);
  if (!likelyPlayerName) return null;

  const normalizedTarget = normalizePlayerName(likelyPlayerName);
  const rosters = await fetchAllTeamRosters(season);

  let bestMatch: { team: (typeof NBA_TEAMS)[number]; playerName: string; score: number } | null = null;
  rosters.forEach((roster) => {
    roster.players.forEach((player) => {
      const normalizedPlayerName = normalizePlayerName(player.playerName);
      let score = 0;
      if (normalizedPlayerName === normalizedTarget) {
        score = 100;
      } else {
        const distance = boundedLevenshtein(normalizedTarget, normalizedPlayerName, 2);
        if (distance <= 2) {
          score = 90 - (distance * 10);
        }
      }
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          team: roster.team,
          playerName: player.playerName,
          score,
        };
      }
    });
  });

  return bestMatch && bestMatch.score >= 70 ? bestMatch : null;
}

async function inferPlayersFromPrompt(prompt: string, season: string, teamOverride: (typeof NBA_TEAMS)[number] | null = null) {
  const likelyPlayerNames = extractLikelyPlayerNames(prompt, teamOverride);
  if (!likelyPlayerNames.length) return [];

  if (teamOverride) {
    const roster = await fetchTeamRoster(teamOverride, season).catch(() => null);
    if (!roster) return [];
    return likelyPlayerNames.map((playerName) => {
      const normalizedTarget = normalizePlayerName(playerName);
      let bestMatch: { playerName: string; playerId: string; score: number } | null = null;
      roster.players.forEach((player) => {
        const normalizedPlayerName = normalizePlayerName(player.playerName);
        let score = 0;
        if (normalizedPlayerName === normalizedTarget) score = 100;
        else {
          const distance = boundedLevenshtein(normalizedTarget, normalizedPlayerName, 2);
          if (distance <= 2) score = 90 - (distance * 10);
        }
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { playerName: player.playerName, playerId: player.playerId, score };
        }
      });
      return bestMatch && bestMatch.score >= 70
        ? { promptName: playerName, playerName: bestMatch.playerName, playerId: bestMatch.playerId, team: teamOverride, score: bestMatch.score }
        : null;
    }).filter(Boolean) as Array<{ promptName: string; playerName: string; playerId: string; team: (typeof NBA_TEAMS)[number]; score: number }>;
  }

  const rosters = await fetchAllTeamRosters(season);
  return likelyPlayerNames.map((playerName) => {
    const normalizedTarget = normalizePlayerName(playerName);
    let bestMatch: { team: (typeof NBA_TEAMS)[number]; playerName: string; playerId: string; score: number } | null = null;
    rosters.forEach((roster) => {
      roster.players.forEach((player) => {
        const normalizedPlayerName = normalizePlayerName(player.playerName);
        let score = 0;
        if (normalizedPlayerName === normalizedTarget) score = 100;
        else {
          const distance = boundedLevenshtein(normalizedTarget, normalizedPlayerName, 2);
          if (distance <= 2) score = 90 - (distance * 10);
        }
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { team: roster.team, playerName: player.playerName, playerId: player.playerId, score };
        }
      });
    });
    return bestMatch && bestMatch.score >= 70
      ? { promptName: playerName, playerName: bestMatch.playerName, playerId: bestMatch.playerId, team: bestMatch.team, score: bestMatch.score }
      : null;
  }).filter(Boolean) as Array<{ promptName: string; playerName: string; playerId: string; team: (typeof NBA_TEAMS)[number]; score: number }>;
}

function isComparisonPrompt(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  return /\b(compare|comparison|versus|vs\.?|who averages more|who has more|which player|better)\b/.test(normalizedPrompt)
    || (extractLikelyPlayerNames(prompt, null).length >= 2 && /\b(or|vs\.?|versus|and)\b/.test(normalizedPrompt));
}

function scoreSearchAliases(prompt: string, searchEntries: Array<{ alias: string; tokens: string[] }>) {
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

function findTeamFromPrompt(prompt: string) {
  let bestMatch: (typeof NBA_TEAMS)[number] | null = null;
  let bestScore = 0;
  TEAM_SEARCH_INDEX.forEach(({ team, aliases }) => {
    const score = scoreSearchAliases(prompt, aliases);
    if (score > bestScore) {
      bestMatch = team;
      bestScore = score;
    }
  });
  return bestScore >= 6 ? bestMatch : null;
}

function findMetricFromPrompt(prompt: string) {
  let bestMatch: MetricDefinition | null = null;
  let bestScore = 0;
  METRIC_SEARCH_INDEX.forEach(({ metric, aliases }) => {
    const score = scoreSearchAliases(prompt, aliases);
    if (score > bestScore) {
      bestMatch = metric;
      bestScore = score;
    }
  });
  return bestScore >= 5 ? bestMatch : null;
}

function scoreTeamPrompt(team: (typeof NBA_TEAMS)[number], prompt: string) {
  const searchEntry = TEAM_SEARCH_INDEX.find((entry) => entry.team.teamId === team.teamId);
  return searchEntry ? scoreSearchAliases(prompt, searchEntry.aliases) : 0;
}

function scoreMetricPrompt(metric: MetricDefinition, prompt: string) {
  const searchEntry = METRIC_SEARCH_INDEX.find((entry) => entry.metric.key === metric.key);
  return searchEntry ? scoreSearchAliases(prompt, searchEntry.aliases) : 0;
}

function findTeamMatches(prompt: string) {
  return TEAM_SEARCH_INDEX
    .map(({ team }) => ({ team, score: scoreTeamPrompt(team, prompt) }))
    .filter((entry) => entry.score >= 6)
    .sort((left, right) => right.score - left.score);
}

function hasExplicitOpponentContext(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  return [
    /\bvs\b/,
    /\bversus\b/,
    /\bagainst\b/,
    /\bv\b/,
    /\bopp(?:onent)?\b/,
  ].some((pattern) => pattern.test(normalizedPrompt));
}

function parseOpponentTeamFromPrompt(prompt: string, subjectTeamId: string) {
  if (!hasExplicitOpponentContext(prompt)) return null;

  const teamMatches = findTeamMatches(prompt).filter((entry) => entry.team.teamId !== subjectTeamId);
  if (!teamMatches.length) return null;

  if (teamMatches.length > 1 && teamMatches[0].score === teamMatches[1].score) {
    return null;
  }

  return teamMatches[0]?.team || null;
}

function usesAttemptIntent(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  return /\b(attempt|attempted|attempts|shot|shoot|took|take)\b/.test(normalizedPrompt);
}

function usesMadeIntent(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  return /\b(make|made|makes|hit|hits|hitting)\b/.test(normalizedPrompt);
}

function scoreMetricIntent(metric: MetricDefinition, prompt: string) {
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

function parseResultFilter(prompt: string): ResultFilter {
  const normalizedPrompt = normalizeText(prompt);
  const winPatterns = [
    " in wins",
    " in win",
    " wins only",
    " won games",
    " games won",
    " when they win",
    " when it wins",
    " in victories",
  ];
  const lossPatterns = [
    " in losses",
    " in loss",
    " losses only",
    " lost games",
    " games lost",
    " when they lose",
    " when it loses",
    " in defeats",
  ];
  const hasWin = winPatterns.some((pattern) => normalizedPrompt.includes(pattern))
    || /\bin\s+(?:[a-z]+\s+){0,4}wins?\b/.test(normalizedPrompt);
  const hasLoss = lossPatterns.some((pattern) => normalizedPrompt.includes(pattern))
    || /\bin\s+(?:[a-z]+\s+){0,4}loss(?:es)?\b/.test(normalizedPrompt);
  if (hasWin && hasLoss) return "all";
  if (hasWin) return "win";
  if (hasLoss) return "loss";
  return "all";
}

function parseHomeAwayFilter(prompt: string, groupBy: QueryGroupBy = "none"): HomeAwayFilter {
  if (groupBy === "home_away") return "all";
  const normalizedPrompt = normalizeText(prompt);
  const hasAway = /\b(road|away)\b/.test(normalizedPrompt);
  const hasHome = /\bhome\b/.test(normalizedPrompt);
  if (hasAway && !hasHome) return "away";
  if (hasHome && !hasAway) return "home";
  return "all";
}

function parseOpponentRelativeRequest(
  prompt: string,
  explicitTeam: (typeof NBA_TEAMS)[number] | null,
  inferredTeam: (typeof NBA_TEAMS)[number] | null,
) {
  const normalizedPrompt = normalizeText(prompt);
  if (!/\b(opponent|their opponent|the opponent|opponents)\b/.test(normalizedPrompt)) return null;
  if (!/\b(more|fewer|less|higher|lower|equal|same|tied)\b/.test(normalizedPrompt)) return null;

  const team = explicitTeam || inferredTeam;
  const metric = findMetricFromPrompt(prompt);
  if (!team || !metric) return null;

  let comparison: OpponentRelativeRequest["comparison"] | null = null;
  if (/\b(more|higher|greater)\b/.test(normalizedPrompt)) comparison = "gt";
  if (/\b(fewer|less|lower)\b/.test(normalizedPrompt)) comparison = "lt";
  if (/\b(equal|same|tied)\b/.test(normalizedPrompt)) comparison = "eq";
  if (!comparison) return null;

  return {
    team,
    metric,
    comparison,
    aggregation: isRecordPrompt(prompt) ? "record" : "count_games",
    seasonScope: parseSeasonScope(prompt),
    resultFilter: parseResultFilter(prompt),
    homeAwayFilter: parseHomeAwayFilter(prompt),
  } satisfies OpponentRelativeRequest;
}

function parseImplicitThreshold(prompt: string, metric: MetricDefinition | null) {
  if (!metric) return null;
  const normalizedPrompt = normalizeText(prompt);
  if (
    metric.key === "first_half_margin"
    && (
      normalizedPrompt.includes("winning at halftime")
      || normalizedPrompt.includes("winning at half")
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

function isSingleQuarterThresholdPrompt(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  return normalizedPrompt.includes("single quarter")
    || normalizedPrompt.includes("a single quarter")
    || normalizedPrompt.includes("in a quarter")
    || normalizedPrompt.includes("in any quarter")
    || normalizedPrompt.includes("any quarter");
}

function parseSpecificPeriod(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  if (/\b1st quarter\b|\bfirst quarter\b|\bq1\b/.test(normalizedPrompt)) return "Q1";
  if (/\b2nd quarter\b|\bsecond quarter\b|\bq2\b/.test(normalizedPrompt)) return "Q2";
  if (/\b3rd quarter\b|\bthird quarter\b|\bq3\b/.test(normalizedPrompt)) return "Q3";
  if (/\b4th quarter\b|\bfourth quarter\b|\bq4\b/.test(normalizedPrompt)) return "Q4";
  return null;
}

function parseListLimit(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  const topBottomMatch = /\b(?:top|bottom|highest|lowest|best|worst)\s+(\d{1,2})\b/.exec(normalizedPrompt);
  if (topBottomMatch) return Math.max(1, Math.min(25, safeNumber(topBottomMatch[1], 5)));
  const lastMatch = /\b(?:last|recent)\s+(\d{1,2})\b/.exec(normalizedPrompt);
  if (lastMatch) return Math.max(1, Math.min(25, safeNumber(lastMatch[1], 5)));
  return undefined;
}

function isRecordPrompt(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  return normalizedPrompt.includes("record")
    || normalizedPrompt.includes("win loss")
    || normalizedPrompt.includes("wins and losses")
    || normalizedPrompt.includes("w l");
}

function wantsFullGameLog(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  return normalizedPrompt.includes("each game")
    || normalizedPrompt.includes("every game")
    || normalizedPrompt.includes("game by game")
    || normalizedPrompt.includes("single game")
    || normalizedPrompt.includes("from each of their games")
    || normalizedPrompt.includes("from all games")
    || normalizedPrompt.includes("for all games");
}

function detectAggregation(prompt: string, threshold: number | null): QueryAggregation {
  const normalizedPrompt = normalizeText(prompt);
  const explicitListLimit = parseListLimit(prompt);
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

  if (wantsFullGameLog(prompt)) return "list_games";

  if (explicitListLimit != null) return "list_games";

  if (normalizedPrompt.includes("average") || normalizedPrompt.includes("mean") || normalizedPrompt.includes("per game")) {
    return "season_average";
  }

  if (normalizedPrompt.includes("highest") || normalizedPrompt.includes("most") || normalizedPrompt.includes("max") || normalizedPrompt.includes("best")) {
    return normalizedPrompt.includes("games") ? "list_games" : "max_game";
  }

  if (normalizedPrompt.includes("lowest") || normalizedPrompt.includes("least") || normalizedPrompt.includes("min") || normalizedPrompt.includes("fewest") || normalizedPrompt.includes("worst")) {
    return normalizedPrompt.includes("games") ? "list_games" : "min_game";
  }

  if (normalizedPrompt.includes("show") || normalizedPrompt.includes("list ") || normalizedPrompt.includes("game log")) {
    return "list_games";
  }

  return "season_total";
}

function parseSortDirection(prompt: string, aggregation: QueryAggregation): SortDirection | undefined {
  const normalizedPrompt = normalizeText(prompt);
  if (aggregation === "list_games" && /\b(last|latest|recent|newest)\b/.test(normalizedPrompt)) return "desc";
  if (aggregation === "list_games" && /\b(first|earliest|oldest|chronological)\b/.test(normalizedPrompt)) return "asc";
  if (
    aggregation === "max_game" ||
    aggregation === "count_games_gte" ||
    aggregation === "record_when_gte"
  ) return "desc";
  if (
    aggregation === "min_game" ||
    aggregation === "count_games_lte" ||
    aggregation === "record_when_lte"
  ) return "asc";
  if (/\b(top|highest|most|best|descending|desc)\b/.test(normalizedPrompt)) return "desc";
  if (/\b(bottom|lowest|least|worst|ascending|asc)\b/.test(normalizedPrompt)) return "asc";
  return undefined;
}

function parseSortBy(prompt: string, aggregation: QueryAggregation): QuerySortBy | undefined {
  const normalizedPrompt = normalizeText(prompt);
  if (aggregation === "list_games") {
    if (wantsFullGameLog(prompt)) return "date";
    if (/\b(last|latest|recent|newest|first|earliest|oldest|chronological|date)\b/.test(normalizedPrompt)) return "date";
  }
  if (/\b(date|chronological|latest|recent|earliest|oldest)\b/.test(normalizedPrompt)) return "date";
  if (/\b(highest|lowest|top|bottom|best|worst|most|least)\b/.test(normalizedPrompt)) return "value";
  return undefined;
}

function parseGroupBy(prompt: string): QueryGroupBy {
  const normalizedPrompt = normalizeText(prompt);
  const referencesWins = /\bwins?\b/.test(normalizedPrompt);
  const referencesLosses = /\bloss(?:es)?\b/.test(normalizedPrompt);
  const referencesHome = /\bhome\b/.test(normalizedPrompt);
  const referencesAway = /\baway\b/.test(normalizedPrompt);
  const referencesRegular = normalizedPrompt.includes("regular season");
  const referencesPlayoffs = normalizedPrompt.includes("playoff") || normalizedPrompt.includes("playoffs") || normalizedPrompt.includes("postseason");
  if (
    normalizedPrompt.includes("which quarter")
    || normalizedPrompt.includes("by quarter")
    || normalizedPrompt.includes("per quarter")
    || normalizedPrompt.includes("each quarter")
    || normalizedPrompt.includes("in the 1st quarter")
    || normalizedPrompt.includes("in the first quarter")
    || normalizedPrompt.includes("in the 2nd quarter")
    || normalizedPrompt.includes("in the second quarter")
    || normalizedPrompt.includes("in the 3rd quarter")
    || normalizedPrompt.includes("in the third quarter")
    || normalizedPrompt.includes("in the 4th quarter")
    || normalizedPrompt.includes("in the fourth quarter")
    || normalizedPrompt.includes("by period")
    || normalizedPrompt.includes("per period")
    || normalizedPrompt.includes("each period")
  ) return "period";
  if (
    normalizedPrompt.includes("on off")
    || normalizedPrompt.includes("on/off")
    || normalizedPrompt.includes("on the floor")
    || normalizedPrompt.includes("off the floor")
    || normalizedPrompt.includes("on court")
    || normalizedPrompt.includes("off court")
    || /\bwith\s+[a-z0-9 .'-]+\s+on\b/.test(normalizedPrompt)
    || /\bwith\s+[a-z0-9 .'-]+\s+off\b/.test(normalizedPrompt)
  ) return "on_off";
  if (
    (referencesHome && referencesAway && /\b(vs\.?|versus|split|compare|comparison)\b/.test(normalizedPrompt))
    || normalizedPrompt.includes("by home away")
    || normalizedPrompt.includes("home vs away")
    || normalizedPrompt.includes("away vs home")
  ) return "home_away";
  if (
    (referencesRegular && referencesPlayoffs && /\b(vs\.?|versus|split|compare|comparison)\b/.test(normalizedPrompt))
    || normalizedPrompt.includes("regular season vs playoffs")
    || normalizedPrompt.includes("playoffs vs regular season")
    || normalizedPrompt.includes("by season type")
  ) return "season_scope";
  if (
    normalizedPrompt.includes("by month")
    || normalizedPrompt.includes("per month")
    || normalizedPrompt.includes("each month")
    || normalizedPrompt.includes("which month")
    || normalizedPrompt.includes("month by month")
  ) return "month";
  if (
    /\bwins?\s+vs\.?\s+losses?\b/.test(normalizedPrompt)
    || /\bwins?\s+versus\s+losses?\b/.test(normalizedPrompt)
    || /\bwin\s*\/\s*loss\b/.test(normalizedPrompt)
    || /\bin\s+(?:[a-z]+\s+){0,4}wins?\b/.test(normalizedPrompt) && /\bin\s+(?:[a-z]+\s+){0,4}loss(?:es)?\b/.test(normalizedPrompt)
    || (referencesWins && referencesLosses && /\b(vs\.?|versus|split|compare|comparison)\b/.test(normalizedPrompt))
  ) return "result";
  if (
    normalizedPrompt.includes("by opponent")
    || normalizedPrompt.includes("per opponent")
    || normalizedPrompt.includes("each opponent")
    || normalizedPrompt.includes("against each")
  ) return "opponent";
  if (
    normalizedPrompt.includes("by result")
    || normalizedPrompt.includes("by win loss")
    || normalizedPrompt.includes("by wins and losses")
    || normalizedPrompt.includes("split by win")
    || normalizedPrompt.includes("split by result")
  ) return "result";
  return "none";
}

function parseSeasonScope(prompt: string): QuerySeasonScope {
  const normalizedPrompt = normalizeText(prompt);
  const referencesPlayoffs = normalizedPrompt.includes("playoff")
    || normalizedPrompt.includes("playoffs")
    || normalizedPrompt.includes("postseason")
    || normalizedPrompt.includes("post season");
  const referencesRegular = normalizedPrompt.includes("regular season");
  if (referencesRegular && referencesPlayoffs) return "all";
  if (
    referencesPlayoffs
  ) return "playoffs";
  if (referencesRegular) return "regular";
  return "all";
}

function metricByKey(key: string) {
  return METRICS.find((metric) => metric.key === key) || null;
}

function counterpartMetricKey(metricKey: string, qualifier: "made" | "attempted") {
  if (qualifier === "made" && metricKey.endsWith("_attempted")) {
    return metricKey.replace(/_attempted$/, "_made");
  }
  if (qualifier === "attempted" && metricKey.endsWith("_made")) {
    return metricKey.replace(/_made$/, "_attempted");
  }
  return metricKey;
}

function buildColumnMetricLabel(team: (typeof NBA_TEAMS)[number], side: "team" | "opponent", baseLabel: string, valueType: "single" | "pair") {
  const prefix = side === "team" ? team.tricode : "OPP";
  return `${prefix} ${baseLabel}${valueType === "pair" ? " M/A" : ""}`;
}

function parseGameTableRequest(prompt: string): ParsedGameTableRequest | null {
  const normalizedPrompt = normalizeText(prompt);
  if (!normalizedPrompt.includes("table")) return null;

  const team = findTeamFromPrompt(prompt);
  if (!team) return null;

  const quotedMetricMatches = [...prompt.matchAll(/(?:(the opponent|opponent|[A-Za-z .'-]+?)'s)\s+"([^"]+)"/gi)];
  if (!quotedMetricMatches.length) return null;

  const metricColumns: GameTableColumn[] = [];
  for (const match of quotedMetricMatches) {
    const ownerText = String(match[1] || "").trim().toLowerCase();
    const phrase = String(match[2] || "").trim();
    const side: "team" | "opponent" = ownerText.includes("opponent") ? "opponent" : "team";
    const baseMetric = findMetricFromPrompt(phrase);
    if (!baseMetric) continue;
    const trailing = prompt.slice(match.index! + match[0].length, match.index! + match[0].length + 28).toLowerCase();
    const wantsPair = /(made\s*\/\s*attempted|makes\s*\/\s*attempts|make\s*\/\s*attempt|made\/attempted|makes\/attempts)/.test(trailing);
    if (wantsPair) {
      const madeKey = counterpartMetricKey(baseMetric.key, "made");
      const attemptedKey = counterpartMetricKey(baseMetric.key, "attempted");
      const madeMetric = metricByKey(madeKey);
      const attemptedMetric = metricByKey(attemptedKey);
      if (madeMetric && attemptedMetric) {
        metricColumns.push({
          key: `${side}:${madeMetric.key}:${attemptedMetric.key}`,
          label: buildColumnMetricLabel(team, side, baseMetric.label.replace(/ Attempted$/i, "").replace(/ Made$/i, ""), "pair"),
          side,
          metricKeys: [madeMetric.key, attemptedMetric.key],
          valueType: "pair",
        });
        continue;
      }
    }

    metricColumns.push({
      key: `${side}:${baseMetric.key}`,
      label: buildColumnMetricLabel(team, side, baseMetric.label, "single"),
      side,
      metricKeys: [baseMetric.key],
      valueType: "single",
      formatter: baseMetric.formatter,
    });
  }

  if (!metricColumns.length) return null;

  const uniqueMetricColumns = metricColumns.filter((column, index, list) => (
    list.findIndex((entry) => entry.key === column.key) === index
  ));

  return {
    teamId: team.teamId,
    opponentTeamId: parseOpponentTeamFromPrompt(prompt, team.teamId)?.teamId,
    resultFilter: parseResultFilter(prompt),
    seasonScope: parseSeasonScope(prompt),
    sort: parseSortDirection(prompt, "list_games") || "asc",
    columns: [
      { key: "gameDate", label: "Date" },
      { key: "opponent", label: "Opponent" },
      { key: "result", label: "Outcome" },
      ...uniqueMetricColumns,
    ],
  };
}

function buildFallbackParse(prompt: string, teamOverride: (typeof NBA_TEAMS)[number] | null = null): ParsedQuery | null {
  const team = teamOverride || findTeamFromPrompt(prompt);
  const metric = findMetricFromPrompt(prompt);
  if (!team || !metric) return null;

  const groupBy = parseGroupBy(prompt);
  const threshold = parseThreshold(prompt) ?? parseImplicitThreshold(prompt, metric);
  const aggregation = detectAggregation(prompt, threshold);
  const opponent = parseOpponentTeamFromPrompt(prompt, team.teamId);
  const resultFilter = parseResultFilter(prompt);
  const homeAwayFilter = parseHomeAwayFilter(prompt, groupBy);
  const seasonScope = parseSeasonScope(prompt);
  const limit = parseListLimit(prompt);
  const sort = parseSortDirection(prompt, aggregation);
  const sortBy = parseSortBy(prompt, aggregation);

  return {
    teamId: team.teamId,
    statKey: metric.key,
    aggregation,
    threshold: threshold != null ? threshold : undefined,
    opponentTeamId: opponent?.teamId,
    resultFilter,
    homeAwayFilter,
    seasonScope,
    sort,
    sortBy,
    limit,
    groupBy,
  };
}

const CUSTOM_REQUEST_QUERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["teamId", "statKey", "aggregation", "resultFilter", "homeAwayFilter", "groupBy", "seasonScope"],
  properties: {
    teamId: { type: "string" },
    statKey: { type: "string" },
    aggregation: {
      type: "string",
      enum: [
        "season_total",
        "season_average",
        "max_game",
        "min_game",
        "list_games",
        "count_games_gte",
        "count_games_lte",
        "count_games_nonzero",
        "record",
        "record_when_gte",
        "record_when_lte",
        "record_when_nonzero",
      ],
    },
    threshold: { type: "number" },
    opponentTeamId: { type: "string" },
    resultFilter: {
      type: "string",
      enum: ["all", "win", "loss"],
    },
    homeAwayFilter: {
      type: "string",
      enum: ["all", "home", "away"],
    },
    seasonScope: {
      type: "string",
      enum: ["all", "regular", "playoffs"],
    },
    sort: {
      type: "string",
      enum: ["asc", "desc"],
    },
    sortBy: {
      type: "string",
      enum: ["value", "date"],
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 200,
    },
    groupBy: {
      type: "string",
      enum: ["none", "opponent", "result", "period", "home_away", "month", "season_scope", "on_off"],
    },
  },
};

function extractResponseText(payload: Record<string, unknown>) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputItems = Array.isArray(payload?.output) ? payload.output : [];
  const textParts: string[] = [];

  outputItems.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const contentItems = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as Array<Record<string, unknown>>
      : [];
    contentItems.forEach((contentItem) => {
      const text = String(contentItem?.text || "").trim();
      if (text) textParts.push(text);
    });
  });

  return textParts.join("\n").trim();
}

async function parsePromptWithOpenAI(prompt: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) return null;

  const teamSummary = NBA_TEAMS.map((team) => `${team.fullName} (${team.tricode})`).join(", ");
  const metricSummary = METRICS.map((metric) => `${metric.key}: ${metric.label}`).join("; ");
  const aggregationSummary = [
    "season_total",
    "season_average",
    "max_game",
    "min_game",
    "list_games",
    "count_games_gte",
    "count_games_lte",
    "count_games_nonzero",
    "record",
    "record_when_gte",
    "record_when_lte",
        "record_when_nonzero",
  ].join(", ");
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
      instructions:
        "Parse an NBA dashboard stat request into a structured query object. " +
        "Use one subject team only and one statKey from the provided catalog. " +
        "You may also identify one opponent team filter, one win/loss filter, and whether the scope is all games, regular season, or playoffs if the prompt asks for them. " +
        `Allowed aggregations: ${aggregationSummary}. ` +
        "Do not calculate any answer. Only return the query object.",
      input: `Teams: ${teamSummary}\nStats: ${metricSummary}\nPrompt: ${prompt}`,
      text: {
        format: {
          type: "json_schema",
          name: "custom_request_query",
          strict: true,
          schema: CUSTOM_REQUEST_QUERY_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) return null;
  const payload = await response.json();
  const text = extractResponseText(payload as Record<string, unknown>);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isSupportedAggregation(value: unknown) {
  return [
    "list_games",
    "count_games_gte",
    "count_games_lte",
    "count_games_nonzero",
    "record",
    "record_when_gte",
    "record_when_lte",
    "record_when_nonzero",
    "season_total",
    "season_average",
    "max_game",
    "min_game",
  ].includes(String(value || "").trim());
}

function normalizeParsedQuery(value: unknown): ParsedQuery | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const teamId = String(candidate.teamId || "").trim();
  const statKey = String(candidate.statKey || "").trim();
  const aggregation = String(candidate.aggregation || "").trim() as QueryAggregation;
  if (!teamId || !statKey || !isSupportedAggregation(aggregation)) return null;
  const opponentTeamId = String(candidate.opponentTeamId || "").trim();
  const resultFilter = String(candidate.resultFilter || "all").trim() as ResultFilter;
  const homeAwayFilter = String(candidate.homeAwayFilter || "all").trim() as HomeAwayFilter;
  const seasonScope = String(candidate.seasonScope || "all").trim() as QuerySeasonScope;
  const sort = String(candidate.sort || "").trim() as SortDirection;
  const sortBy = String(candidate.sortBy || "").trim() as QuerySortBy;
  const limit = candidate.limit != null ? Math.max(1, Math.min(200, safeNumber(candidate.limit, 5))) : undefined;
  const groupBy = String(candidate.groupBy || "none").trim() as QueryGroupBy;
  return {
    teamId,
    statKey,
    aggregation,
    threshold: candidate.threshold != null ? safeNumber(candidate.threshold, 0) : undefined,
    opponentTeamId: opponentTeamId && opponentTeamId !== teamId ? opponentTeamId : undefined,
    resultFilter: resultFilter === "win" || resultFilter === "loss" ? resultFilter : "all",
    homeAwayFilter: homeAwayFilter === "home" || homeAwayFilter === "away" ? homeAwayFilter : "all",
    seasonScope: seasonScope === "regular" || seasonScope === "playoffs" ? seasonScope : "all",
    sort: sort === "asc" || sort === "desc" ? sort : undefined,
    sortBy: sortBy === "date" || sortBy === "value" ? sortBy : undefined,
    limit,
    groupBy: ["opponent", "result", "period", "home_away", "month", "season_scope", "on_off"].includes(groupBy) ? groupBy : "none",
  };
}

function formatValue(value: number, metric: MetricDefinition) {
  if (metric.formatter === "percent") return `${value.toFixed(1)}%`;
  if (metric.formatter === "decimal") return value.toFixed(1);
  return `${Math.round(value)}`;
}

function formatAverageValue(value: number, metric: MetricDefinition) {
  if (metric.formatter === "percent") return `${value.toFixed(1)}%`;
  return value.toFixed(1);
}

function parseMinutesToDecimal(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const isoMatch = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(raw);
  if (isoMatch) {
    const minutes = Number(isoMatch[1] || 0);
    const seconds = Number(isoMatch[2] || 0);
    return minutes + (seconds / 60);
  }
  const colonMatch = /^(\d+):(\d+(?:\.\d+)?)$/.exec(raw);
  if (colonMatch) {
    return Number(colonMatch[1] || 0) + (Number(colonMatch[2] || 0) / 60);
  }
  return safeNumber(raw, 0);
}

function toDisplayName(firstName: unknown, familyName: unknown) {
  return `${String(firstName || "").trim()} ${String(familyName || "").trim()}`.trim();
}

function normalizePlayerName(value: string) {
  return normalizeText(value)
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedLevenshtein(leftRaw: string, rightRaw: string, maxDistance = 2) {
  const left = String(leftRaw || "").trim();
  const right = String(rightRaw || "").trim();
  if (!left || !right) return Number.MAX_SAFE_INTEGER;
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > maxDistance) return Number.MAX_SAFE_INTEGER;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let rowIndex = 1; rowIndex <= left.length; rowIndex += 1) {
    const current = [rowIndex];
    let rowMin = current[0];
    for (let columnIndex = 1; columnIndex <= right.length; columnIndex += 1) {
      const substitutionCost = left[rowIndex - 1] === right[columnIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[columnIndex] + 1,
        current[columnIndex - 1] + 1,
        previous[columnIndex - 1] + substitutionCost,
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > maxDistance) return Number.MAX_SAFE_INTEGER;
    previous = current;
  }
  return previous[right.length];
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatRecordDisplay(wins: number, losses: number) {
  return `${wins}-${losses}`;
}

function describeScope(
  team: (typeof NBA_TEAMS)[number],
  opponent: (typeof NBA_TEAMS)[number] | null,
  resultFilter: ResultFilter,
) {
  const parts = [team.fullName];
  if (opponent) parts.push(`against ${opponent.fullName}`);
  if (resultFilter === "win") parts.push("in wins");
  if (resultFilter === "loss") parts.push("in losses");
  return parts.join(" ");
}

function compareRows(
  left: QueryGameRow,
  right: QueryGameRow,
  sort: SortDirection | undefined,
  sortBy: QuerySortBy = "value",
) {
  const direction = sort === "asc" ? 1 : -1;
  if (sortBy === "date") {
    const dateCompare = String(left.gameDate).localeCompare(String(right.gameDate)) * direction;
    if (dateCompare !== 0) return dateCompare;
    return (left.value - right.value) * -1;
  }
  if (left.value !== right.value) return (left.value - right.value) * direction;
  return String(right.gameDate).localeCompare(String(left.gameDate));
}

function groupByLabel(groupBy: QueryGroupBy) {
  if (groupBy === "result") return "result";
  if (groupBy === "period") return "quarter";
  if (groupBy === "home_away") return "home/away";
  if (groupBy === "month") return "month";
  if (groupBy === "season_scope") return "season type";
  if (groupBy === "on_off") return "on/off";
  return "opponent";
}

function resolveGroupIdentity(row: QueryGameRow, groupBy: QueryGroupBy) {
  if (groupBy === "opponent") {
    return {
      key: row.opponent.teamId,
      label: row.opponent.tricode || row.opponent.fullName || row.opponent.teamId,
    };
  }
  if (groupBy === "period") {
    return {
      key: String(row.groupKey || row.groupLabel || ""),
      label: String(row.groupLabel || row.groupKey || "-"),
    };
  }
  if (groupBy === "home_away") {
    return {
      key: row.isHome ? "home" : "away",
      label: row.isHome ? "Home" : "Away",
    };
  }
  if (groupBy === "month") {
    const key = String(row.gameDate || "").slice(0, 7);
    return { key, label: key || "-" };
  }
  if (groupBy === "season_scope") {
    const isPlayoff = String(row.seasonType || "").toLowerCase().includes("playoff") || String(row.gameId || "").startsWith("004");
    return {
      key: isPlayoff ? "playoffs" : "regular",
      label: isPlayoff ? "Playoffs" : "Regular Season",
    };
  }
  if (groupBy === "on_off") {
    return {
      key: String(row.groupKey || row.groupLabel || ""),
      label: String(row.groupLabel || row.groupKey || "-"),
    };
  }
  return { key: row.result, label: row.result };
}

function matchesSeasonScope(row: { seasonType?: string; gameId?: string }, seasonScope: QuerySeasonScope = "all") {
  if (seasonScope === "all") return true;
  const seasonType = String(row.seasonType || "").toLowerCase();
  const gameId = String(row.gameId || "");
  const isPlayoff = seasonType.includes("playoff") || gameId.startsWith("004");
  if (seasonScope === "playoffs") return isPlayoff;
  return !isPlayoff;
}

function formatMetricValueByKey(value: number, metricKey: string) {
  const metric = metricByKey(metricKey);
  if (!metric) return `${Math.round(value)}`;
  return formatValue(value, metric);
}

function executeGameTableQuery(
  rowsWithMetrics: CachedTeamGameRow[],
  request: ParsedGameTableRequest,
  team: (typeof NBA_TEAMS)[number],
) {
  const filteredRows = rowsWithMetrics.filter((row) => {
    if (!matchesSeasonScope(row, request.seasonScope)) return false;
    if (request.opponentTeamId && row.opponent.teamId !== request.opponentTeamId) return false;
    if (request.resultFilter === "win" && row.result !== "W") return false;
    if (request.resultFilter === "loss" && row.result !== "L") return false;
    return true;
  });

  const orderedRows = [...filteredRows].sort((left, right) => compareRows(left, right, request.sort, "date"));

  const tableRows = orderedRows.map((row) => {
    const values: Record<string, string> = {};
    request.columns.forEach((column) => {
      if (column.key === "gameDate") {
        values[column.key] = row.gameDate;
        return;
      }
      if (column.key === "opponent") {
        values[column.key] = row.opponent.tricode || row.opponent.fullName || "-";
        return;
      }
      if (column.key === "result") {
        values[column.key] = row.result;
        return;
      }
      if (!column.metricKeys?.length) {
        values[column.key] = "-";
        return;
      }
      const sourceMetrics = column.side === "opponent" ? row.opponentMetrics : row.metrics;
      if (column.valueType === "pair" && column.metricKeys.length >= 2) {
        const made = safeNumber(sourceMetrics[column.metricKeys[0]], 0);
        const attempted = safeNumber(sourceMetrics[column.metricKeys[1]], 0);
        values[column.key] = `${Math.round(made)}/${Math.round(attempted)}`;
        return;
      }
      const metricKey = column.metricKeys[0];
      values[column.key] = formatMetricValueByKey(safeNumber(sourceMetrics[metricKey], 0), metricKey);
    });

    return {
      gameId: row.gameId,
      gameDate: row.gameDate,
      opponent: row.opponent,
      result: row.result,
      teamScore: row.teamScore,
      opponentScore: row.opponentScore,
      values,
    };
  });

  const opponent = request.opponentTeamId
    ? NBA_TEAMS.find((entry) => entry.teamId === request.opponentTeamId) || null
    : null;
  const scopeBits = [
    request.seasonScope === "playoffs" ? "playoff" : request.seasonScope === "regular" ? "regular-season" : "season",
    "games",
  ];
  if (opponent) scopeBits.push(`against ${opponent.fullName}`);
  if (request.resultFilter === "win") scopeBits.push("in wins");
  if (request.resultFilter === "loss") scopeBits.push("in losses");

  return {
    aggregation: "game_table",
    value: tableRows.length,
    displayValue: `${tableRows.length}`,
    answer: `Showing ${tableRows.length} ${scopeBits.join(" ")} for ${team.fullName}, sorted by date ${request.sort === "asc" ? "ascending" : "descending"}.`,
    sampleSize: tableRows.length,
    games: [],
    groups: [],
    table: {
      columns: request.columns.map((column) => ({ key: column.key, label: column.label })),
      rows: tableRows,
    },
  };
}

function buildGroupedSummaries(
  rows: QueryGameRow[],
  metric: MetricDefinition,
  query: ParsedQuery,
  aggregation: QueryAggregation,
  threshold: number,
  sortDirection: SortDirection,
) {
  if (!rows.length || !query.groupBy || query.groupBy === "none") return [];

  const groups = new Map<string, { label: string; rows: QueryGameRow[] }>();
  rows.forEach((row) => {
    const { key, label } = resolveGroupIdentity(row, query.groupBy);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, { label, rows: [] });
    }
    groups.get(key)?.rows.push(row);
  });

  const summaries = [...groups.values()].map((group) => {
    const games = [...group.rows].sort((left, right) => compareRows(left, right, sortDirection, query.sortBy || "value"));
    const total = games.reduce((sum, row) => sum + row.value, 0);
    const average = games.length ? total / games.length : 0;
    const wins = games.filter((row) => row.result === "W").length;
    const losses = games.filter((row) => row.result === "L").length;
    let value = total;
    let displayValue = formatValue(total, metric);

    if (aggregation === "season_average") {
      value = average;
      displayValue = formatAverageValue(average, metric);
    } else if (aggregation === "count_games_gte") {
      value = games.filter((row) => row.value >= threshold).length;
      displayValue = `${value}`;
    } else if (aggregation === "count_games_lte") {
      value = games.filter((row) => row.value <= threshold).length;
      displayValue = `${value}`;
    } else if (aggregation === "count_games_nonzero") {
      value = games.filter((row) => row.value > 0).length;
      displayValue = `${value}`;
    } else if (aggregation === "record" || aggregation === "record_when_gte" || aggregation === "record_when_lte" || aggregation === "record_when_nonzero") {
      let recordRows = games;
      if (aggregation === "record_when_gte") recordRows = games.filter((row) => row.value >= threshold);
      if (aggregation === "record_when_lte") recordRows = games.filter((row) => row.value <= threshold);
      if (aggregation === "record_when_nonzero") recordRows = games.filter((row) => row.value > 0);
      const recordWins = recordRows.filter((row) => row.result === "W").length;
      const recordLosses = recordRows.filter((row) => row.result === "L").length;
      value = recordWins - recordLosses;
      displayValue = `${recordWins}-${recordLosses}`;
    } else if (aggregation === "max_game") {
      const best = games[0];
      value = best?.value || 0;
      displayValue = formatValue(value, metric);
    } else if (aggregation === "min_game") {
      const best = [...games].sort((left, right) => compareRows(left, right, "asc", "value"))[0];
      value = best?.value || 0;
      displayValue = formatValue(value, metric);
    } else if (aggregation === "list_games") {
      value = games.length;
      displayValue = `${games.length}`;
    }

    return {
      key: group.label,
      label: group.label,
      value,
      displayValue,
      sampleSize: games.length,
      wins,
      losses,
      averageDisplayValue: formatAverageValue(average, metric),
      totalDisplayValue: formatValue(total, metric),
    };
  });

  return summaries.sort((left, right) => {
    if (typeof left.value === "number" && typeof right.value === "number" && left.value !== right.value) {
      return sortDirection === "asc" ? left.value - right.value : right.value - left.value;
    }
    return left.label.localeCompare(right.label);
  });
}

function collapsePeriodRowsToGameThresholdRows(
  rows: Array<CachedTeamGameRow | CachedPlayerGameRow>,
  aggregation: QueryAggregation,
) {
  const byGame = new Map<string, Array<CachedTeamGameRow | CachedPlayerGameRow>>();
  rows.forEach((row) => {
    if (!byGame.has(row.gameId)) byGame.set(row.gameId, []);
    byGame.get(row.gameId)?.push(row);
  });

  const selectValue = (gameRows: Array<CachedTeamGameRow | CachedPlayerGameRow>) => {
    const values = gameRows.map((row) => safeNumber(row.value, 0));
    if (aggregation === "count_games_lte" || aggregation === "record_when_lte") {
      return Math.min(...values);
    }
    return Math.max(...values);
  };

  return [...byGame.values()].map((gameRows) => {
    const source = gameRows[0];
    return {
      ...source,
      value: selectValue(gameRows),
      groupKey: undefined,
      groupLabel: undefined,
    };
  });
}

async function buildTeamSeasonDataset(
  season: string,
  team: (typeof NBA_TEAMS)[number],
) {
  const cacheKey = `${season}:${team.teamId}`;
  if (!TEAM_SEASON_DATASET_CACHE.has(cacheKey)) {
    TEAM_SEASON_DATASET_CACHE.set(cacheKey, (async () => {
      const seasonGames = await fetchSeasonGames(season);
      const teamGames = seasonGames.filter((game) => (
        String((game as Record<string, unknown>)?.homeTeam?.teamId || "") === team.teamId ||
        String((game as Record<string, unknown>)?.awayTeam?.teamId || "") === team.teamId
      ));

      const detailedGames = await mapWithConcurrency(
        teamGames,
        (game) => fetchGameDetailsSafe(String((game as Record<string, unknown>).gameId || "")),
      );

      const skippedGames = detailedGames
        .map((entry, index) => (
          entry.error
            ? {
              gameId: String((teamGames[index] as Record<string, unknown>).gameId || ""),
              gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
              error: entry.error,
            }
            : null
        ))
        .filter(Boolean) as Array<{ gameId: string; gameDate: string; error: string }>;

      const rows = detailedGames
        .map((entry, index) => {
          if (!entry.game) return null;
          const game = {
            ...entry.game,
            gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
          } as AnyRecord;
          const metrics = buildGameMetrics(game, team.teamId);
          const opponentMetrics = buildGameMetrics(game, metrics.opponent.teamId);
          return {
            gameId: String(game.gameId || ""),
            gameDate: String(game.gameDate || ""),
            opponent: metrics.opponent,
            value: 0,
            result: metrics.result,
            teamScore: safeNumber(metrics.teamScore, 0),
            opponentScore: safeNumber(metrics.opponentScore, 0),
            margin: safeNumber(metrics.margin, 0),
            isHome: Boolean(metrics.isHome),
            seasonType: String(metrics.seasonType || ""),
            metrics: metrics.metrics,
            opponentMetrics: opponentMetrics.metrics,
          } satisfies CachedTeamGameRow;
        })
        .filter(Boolean) as CachedTeamGameRow[];

      if (skippedGames.length) {
        TEAM_SEASON_DATASET_CACHE.delete(cacheKey);
      }

      return { rows, skippedGames };
    })());
  }

  return TEAM_SEASON_DATASET_CACHE.get(cacheKey)!;
}

async function buildPlayerSeasonDataset(
  season: string,
  team: (typeof NBA_TEAMS)[number],
) {
  const cacheKey = `${season}:${team.teamId}`;
  if (!PLAYER_SEASON_DATASET_CACHE.has(cacheKey)) {
    PLAYER_SEASON_DATASET_CACHE.set(cacheKey, (async () => {
      const seasonGames = await fetchSeasonGames(season);
      const teamGames = seasonGames.filter((game) => (
        String((game as Record<string, unknown>)?.homeTeam?.teamId || "") === team.teamId ||
        String((game as Record<string, unknown>)?.awayTeam?.teamId || "") === team.teamId
      ));

      const detailedGames = await mapWithConcurrency(
        teamGames,
        (game) => fetchGameDetailsSafe(String((game as Record<string, unknown>).gameId || "")),
      );

      const skippedGames = detailedGames
        .map((entry, index) => (
          entry.error
            ? {
              gameId: String((teamGames[index] as Record<string, unknown>).gameId || ""),
              gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
              error: entry.error,
            }
            : null
        ))
        .filter(Boolean) as Array<{ gameId: string; gameDate: string; error: string }>;

      const rows = detailedGames
        .flatMap((entry, index) => {
          if (!entry.game) return [];
          const game = {
            ...entry.game,
            gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
          } as AnyRecord;
          return buildPlayerSeasonRows(game, team);
        });

      if (skippedGames.length) {
        PLAYER_SEASON_DATASET_CACHE.delete(cacheKey);
      }

      return { rows, skippedGames };
    })());
  }

  return PLAYER_SEASON_DATASET_CACHE.get(cacheKey)!;
}

async function buildPlayerPeriodPointsDataset(
  season: string,
  team: (typeof NBA_TEAMS)[number],
) {
  const cacheKey = `${season}:${team.teamId}`;
  if (!PLAYER_PERIOD_POINTS_DATASET_CACHE.has(cacheKey)) {
    PLAYER_PERIOD_POINTS_DATASET_CACHE.set(cacheKey, (async () => {
      const seasonGames = await fetchSeasonGames(season);
      const teamGames = seasonGames.filter((game) => (
        String((game as Record<string, unknown>)?.homeTeam?.teamId || "") === team.teamId ||
        String((game as Record<string, unknown>)?.awayTeam?.teamId || "") === team.teamId
      ));

      const detailedGames = await mapWithConcurrency(teamGames, async (game) => {
          const gameId = String((game as Record<string, unknown>).gameId || "");
          const [gameEntry, minutesEntry] = await Promise.all([
            fetchGameDetailsSafe(gameId),
            fetchGameMinutes(gameId).then((value) => ({ data: value, error: null })).catch((error) => ({
              data: null,
              error: error instanceof Error ? error.message : String(error),
            })),
          ]);
          return { gameEntry, minutesEntry };
        });

      const skippedGames = detailedGames
        .map((entry, index) => (
          entry.gameEntry.error || entry.minutesEntry.error
            ? {
              gameId: String((teamGames[index] as Record<string, unknown>).gameId || ""),
              gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
              error: entry.gameEntry.error || entry.minutesEntry.error || "Unable to load game detail or minutes data.",
            }
            : null
        ))
        .filter(Boolean) as Array<{ gameId: string; gameDate: string; error: string }>;

      const rows = detailedGames
        .flatMap((entry, index) => {
          if (!entry.gameEntry.game || !entry.minutesEntry.data) return [];
          const game = {
            ...entry.gameEntry.game,
            gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
          } as AnyRecord;
          return buildPlayerPeriodMetricRows(game, team, entry.minutesEntry.data as AnyRecord);
        });

      if (skippedGames.length) {
        PLAYER_PERIOD_POINTS_DATASET_CACHE.delete(cacheKey);
      }

      return { rows, skippedGames };
    })());
  }

  return PLAYER_PERIOD_POINTS_DATASET_CACHE.get(cacheKey)!;
}

async function buildSinglePlayerSeasonDataset(
  season: string,
  team: (typeof NBA_TEAMS)[number],
  targetPlayerId: string,
) {
  const seasonGames = await fetchSeasonGames(season);
  const teamGames = seasonGames.filter((game) => (
    String((game as Record<string, unknown>)?.homeTeam?.teamId || "") === team.teamId ||
    String((game as Record<string, unknown>)?.awayTeam?.teamId || "") === team.teamId
  ));

  const detailedGames = await mapWithConcurrency(
    teamGames,
    (game) => fetchGameDetailsSafe(String((game as Record<string, unknown>).gameId || "")),
  );

  const skippedGames = detailedGames
    .map((entry, index) => (
      entry.error
        ? {
          gameId: String((teamGames[index] as Record<string, unknown>).gameId || ""),
          gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
          error: entry.error,
        }
        : null
    ))
    .filter(Boolean) as Array<{ gameId: string; gameDate: string; error: string }>;

  const rows = detailedGames
    .map((entry, index) => {
      if (!entry.game) return null;
      const game = {
        ...entry.game,
        gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
      } as AnyRecord;
      return buildSinglePlayerSeasonRow(game, team, targetPlayerId);
    })
    .filter(Boolean) as CachedPlayerGameRow[];

  return { rows, skippedGames };
}

async function buildSinglePlayerPeriodDataset(
  season: string,
  team: (typeof NBA_TEAMS)[number],
  targetPlayerId: string,
) {
  const seasonGames = await fetchSeasonGames(season);
  const teamGames = seasonGames.filter((game) => (
    String((game as Record<string, unknown>)?.homeTeam?.teamId || "") === team.teamId ||
    String((game as Record<string, unknown>)?.awayTeam?.teamId || "") === team.teamId
  ));

  const detailedGames = await mapWithConcurrency(teamGames, async (game) => {
    const gameId = String((game as Record<string, unknown>).gameId || "");
    const [gameEntry, minutesEntry] = await Promise.all([
      fetchGameDetailsSafe(gameId),
      fetchGameMinutes(gameId).then((value) => ({ data: value, error: null })).catch((error) => ({
        data: null,
        error: error instanceof Error ? error.message : String(error),
      })),
    ]);
    return { gameEntry, minutesEntry };
  });

  const skippedGames = detailedGames
    .map((entry, index) => (
      entry.gameEntry.error || entry.minutesEntry.error
        ? {
          gameId: String((teamGames[index] as Record<string, unknown>).gameId || ""),
          gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
          error: entry.gameEntry.error || entry.minutesEntry.error || "Unable to load game detail or minutes data.",
        }
        : null
    ))
    .filter(Boolean) as Array<{ gameId: string; gameDate: string; error: string }>;

  const rows = detailedGames.flatMap((entry, index) => {
    if (!entry.gameEntry.game || !entry.minutesEntry.data) return [];
    const game = {
      ...entry.gameEntry.game,
      gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
    } as AnyRecord;
    return buildSinglePlayerPeriodMetricRows(game, team, targetPlayerId, entry.minutesEntry.data as AnyRecord);
  });

  return { rows, skippedGames };
}

async function buildTeamPeriodPointsDataset(
  season: string,
  team: (typeof NBA_TEAMS)[number],
) {
  const cacheKey = `${season}:${team.teamId}`;
  if (!TEAM_PERIOD_POINTS_DATASET_CACHE.has(cacheKey)) {
    TEAM_PERIOD_POINTS_DATASET_CACHE.set(cacheKey, (async () => {
      const seasonGames = await fetchSeasonGames(season);
      const teamGames = seasonGames.filter((game) => (
        String((game as Record<string, unknown>)?.homeTeam?.teamId || "") === team.teamId ||
        String((game as Record<string, unknown>)?.awayTeam?.teamId || "") === team.teamId
      ));

      const detailedGames = await mapWithConcurrency(
        teamGames,
        (game) => fetchGameDetailsSafe(String((game as Record<string, unknown>).gameId || "")),
      );

      const skippedGames = detailedGames
        .map((entry, index) => (
          entry.error
            ? {
              gameId: String((teamGames[index] as Record<string, unknown>).gameId || ""),
              gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
              error: entry.error,
            }
            : null
        ))
        .filter(Boolean) as Array<{ gameId: string; gameDate: string; error: string }>;

      const rows = detailedGames.flatMap((entry, index) => {
        if (!entry.game) return [];
        const game = {
          ...entry.game,
          gameDate: String((teamGames[index] as Record<string, unknown>).gameDate || ""),
        } as AnyRecord;
        return buildTeamPeriodPointRows(game, team);
      });

      if (skippedGames.length) {
        TEAM_PERIOD_POINTS_DATASET_CACHE.delete(cacheKey);
      }

      return { rows, skippedGames };
    })());
  }

  return TEAM_PERIOD_POINTS_DATASET_CACHE.get(cacheKey)!;
}

function buildTeamOnOffRows(
  game: AnyRecord,
  minutesData: AnyRecord,
  team: (typeof NBA_TEAMS)[number],
  targetPlayerIds: string[],
) {
  const perspective = selectTeamPerspective(game, team.teamId);
  const teamScore = safeNumber(perspective.team?.score, safeNumber((perspective.teamBox?.totals as Record<string, unknown> | undefined)?.points, 0));
  const opponentScore = safeNumber(perspective.opponent?.score, safeNumber((perspective.opponentBox?.totals as Record<string, unknown> | undefined)?.points, 0));
  const result: "W" | "L" = teamScore >= opponentScore ? "W" : "L";
  const opponent = {
    teamId: String(perspective.opponent?.teamId || ""),
    tricode: String(perspective.opponent?.teamTricode || ""),
    fullName: `${String(perspective.opponent?.teamCity || "").trim()} ${String(perspective.opponent?.teamName || "").trim()}`.trim(),
  };
  const isHome = String(game?.homeTeam?.teamId || "") === team.teamId;
  const actions = Array.isArray(game?.playByPlayActions) ? game.playByPlayActions as Array<Record<string, unknown>> : [];
  const periods = Array.isArray(minutesData?.periods) ? minutesData.periods as Array<Record<string, unknown>> : [];

  const buckets: Record<string, { pointsFor: number; pointsAgainst: number; possessionsFor: number; possessionsAgainst: number }> = {
    on: { pointsFor: 0, pointsAgainst: 0, possessionsFor: 0, possessionsAgainst: 0 },
    off: { pointsFor: 0, pointsAgainst: 0, possessionsFor: 0, possessionsAgainst: 0 },
  };

  periods.forEach((periodEntry) => {
    const period = safeNumber(periodEntry.period, 0);
    const stints = Array.isArray(periodEntry.stints) ? periodEntry.stints as Array<Record<string, unknown>> : [];
    if (!period || !stints.length) return;

    const stintDescriptors = stints.map((stint) => {
      const players = Array.isArray(isHome ? stint.playersHome : stint.playersAway)
        ? (isHome ? stint.playersHome : stint.playersAway) as Array<Record<string, unknown>>
        : [];
      const lineupIds = new Set(players.map((player) => String(player.personId || "")));
      const on = targetPlayerIds.every((playerId) => lineupIds.has(playerId));
      return {
        startSec: Math.min(parseClockText(stint.startClock), periodLengthSeconds(period)),
        endSec: Math.min(parseClockText(stint.endClock), periodLengthSeconds(period)),
        bucket: on ? "on" : "off",
      };
    });

    const periodActions = actions
      .filter((action) => safeNumber(action.period, 0) === period)
      .sort((left, right) => safeNumber(left.orderNumber ?? left.actionNumber, 0) - safeNumber(right.orderNumber ?? right.actionNumber, 0));

    let lastPossession: string | null = null;
    periodActions.forEach((action) => {
      const actionSec = parseIsoClock(action.clock);
      const stint = stintDescriptors.find((entry) => actionSec <= entry.startSec && actionSec > entry.endSec);
      if (!stint) return;
      const bucket = buckets[stint.bucket];
      const actionType = String(action.actionType || "").toLowerCase();
      const shotResult = String(action.shotResult || "");
      let points = 0;
      if ((actionType === "2pt" || actionType === "3pt") && shotResult === "Made") {
        points = actionType === "3pt" ? 3 : 2;
      } else if (actionType === "freethrow" && shotResult === "Made") {
        points = 1;
      }
      if (points > 0) {
        if (String(action.teamId || "") === team.teamId) bucket.pointsFor += points;
        else bucket.pointsAgainst += points;
      }

      const possession = String(action.possession || "");
      if (possession && possession !== lastPossession) {
        if (possession === team.teamId) bucket.possessionsFor += 1;
        else bucket.possessionsAgainst += 1;
        lastPossession = possession;
      }
    });
  });

  return ["on", "off"].map((bucketKey) => {
    const bucket = buckets[bucketKey];
    const possessionsFor = bucket.possessionsFor;
    const possessionsAgainst = bucket.possessionsAgainst;
    const combinedPossessions = Math.max(1, 0.5 * (possessionsFor + possessionsAgainst));
    return {
      gameId: String(game.gameId || ""),
      gameDate: String(game.gameDate || ""),
      opponent,
      value: 0,
      result,
      teamScore,
      opponentScore,
      margin: teamScore - opponentScore,
      isHome,
      seasonType: String(game?.seasonType || ""),
      groupKey: bucketKey,
      groupLabel: bucketKey === "on" ? "On" : "Off",
      metrics: {
        points: bucket.pointsFor,
        offensive_rating: possessionsFor > 0 ? (bucket.pointsFor / possessionsFor) * 100 : 0,
        defensive_rating: possessionsAgainst > 0 ? (bucket.pointsAgainst / possessionsAgainst) * 100 : 0,
        net_rating: combinedPossessions > 0 ? ((bucket.pointsFor - bucket.pointsAgainst) / combinedPossessions) * 100 : 0,
      },
      opponentMetrics: {},
    } satisfies CachedTeamGameRow;
  });
}

async function buildTeamOnOffDataset(
  season: string,
  team: (typeof NBA_TEAMS)[number],
  targetPlayerIds: string[],
) {
  const cacheKey = `${season}:${team.teamId}:${targetPlayerIds.slice().sort().join(",")}`;
  if (!TEAM_ON_OFF_DATASET_CACHE.has(cacheKey)) {
    TEAM_ON_OFF_DATASET_CACHE.set(cacheKey, (async () => {
      const seasonGames = await fetchSeasonGames(season);
      const teamGames = seasonGames.filter((game) => (
        String((game as Record<string, unknown>)?.homeTeam?.teamId || "") === team.teamId ||
        String((game as Record<string, unknown>)?.awayTeam?.teamId || "") === team.teamId
      ));

      const detailedGames = await mapWithConcurrency(teamGames, async (game) => {
          const gameId = String((game as Record<string, unknown>).gameId || "");
          const [gameEntry, minutesEntry] = await Promise.all([
            fetchGameDetailsSafe(gameId),
            fetchGameMinutes(gameId).then((value) => ({ data: value, error: null })).catch((error) => ({
              data: null,
              error: error instanceof Error ? error.message : String(error),
            })),
          ]);
          return { game, gameEntry, minutesEntry };
        });

      const skippedGames: Array<{ gameId: string; gameDate: string; error: string }> = [];
      const rows = detailedGames.flatMap(({ game, gameEntry, minutesEntry }) => {
        const gameId = String((game as Record<string, unknown>).gameId || "");
        const gameDate = String((game as Record<string, unknown>).gameDate || "");
        if (!gameEntry.game || !minutesEntry.data) {
          skippedGames.push({
            gameId,
            gameDate,
            error: gameEntry.error || minutesEntry.error || "Unable to load game or minutes data.",
          });
          return [];
        }
        const hydratedGame = {
          ...gameEntry.game,
          gameDate,
        } as AnyRecord;
        return buildTeamOnOffRows(hydratedGame, minutesEntry.data as AnyRecord, team, targetPlayerIds);
      });

      if (skippedGames.length) {
        TEAM_ON_OFF_DATASET_CACHE.delete(cacheKey);
      }

      return { rows, skippedGames };
    })());
  }

  return TEAM_ON_OFF_DATASET_CACHE.get(cacheKey)!;
}

async function executeComparisonQuery(
  prompt: string,
  season: string,
  metric: MetricDefinition,
  baseQuery: ParsedQuery,
  matchedPlayers: Array<{ playerName: string; playerId: string; team: (typeof NBA_TEAMS)[number] }>,
) {
  const uniquePlayers = uniqueByKey(matchedPlayers, (entry) => `${entry.team.teamId}:${entry.playerId}`).slice(0, 4);
  const tableColumns = [
    { key: "player", label: "Player" },
    { key: "team", label: "Team" },
    { key: "group", label: "Group" },
    { key: "value", label: "Value" },
    { key: "games", label: "Games" },
    { key: "record", label: "Record" },
    { key: "avg", label: "Avg" },
    { key: "total", label: "Total" },
  ];

  const tableRows: Array<{ gameId: string; gameDate: string; opponent: { teamId: string; tricode: string; fullName: string }; result: string; teamScore: number; opponentScore: number; values: Record<string, string> }> = [];

  for (const player of uniquePlayers) {
    const query = {
      ...baseQuery,
      playerId: player.playerId,
      playerName: player.playerName,
      teamId: player.team.teamId,
    } satisfies ParsedQuery;

    const playerDataset = query.groupBy === "period" && PERIOD_SUPPORTED_METRIC_KEYS.has(metric.key)
      ? await buildPlayerPeriodPointsDataset(season, player.team)
      : await buildPlayerSeasonDataset(season, player.team);
    const rowsForQuery = playerDataset.rows.filter((row) => row.playerId === player.playerId);
    const result = executeQuery(rowsForQuery, metric, query, player.team, player.playerName);

    if (Array.isArray(result.groups) && result.groups.length) {
      result.groups.forEach((group, index) => {
        tableRows.push({
          gameId: `${player.team.teamId}:${player.playerId}:${index}`,
          gameDate: "",
          opponent: { teamId: "", tricode: "", fullName: "" },
          result: "",
          teamScore: 0,
          opponentScore: 0,
          values: {
            player: player.playerName,
            team: player.team.tricode,
            group: group.label,
            value: String(group.displayValue || "-"),
            games: String(group.sampleSize || 0),
            record: `${group.wins}-${group.losses}`,
            avg: String(group.averageDisplayValue || "-"),
            total: String(group.totalDisplayValue || "-"),
          },
        });
      });
    } else {
      tableRows.push({
        gameId: `${player.team.teamId}:${player.playerId}`,
        gameDate: "",
        opponent: { teamId: "", tricode: "", fullName: "" },
        result: "",
        teamScore: 0,
        opponentScore: 0,
        values: {
          player: player.playerName,
          team: player.team.tricode,
          group: "All",
          value: String(result.displayValue || "-"),
          games: String(result.sampleSize || 0),
          record: result.record ? `${result.record.wins}-${result.record.losses}` : "-",
          avg: Array.isArray(result.games) && result.games.length && baseQuery.aggregation !== "season_average"
            ? formatAverageValue(result.games.reduce((sum, row) => sum + row.value, 0) / result.games.length, metric)
            : String(result.displayValue || "-"),
          total: baseQuery.aggregation === "season_total"
            ? String(result.displayValue || "-")
            : Array.isArray(result.games) ? formatValue(result.games.reduce((sum, row) => sum + row.value, 0), metric) : "-",
        },
      });
    }
  }

  return {
    prompt,
    season,
    team: {
      teamId: uniquePlayers[0]?.team.teamId || "",
      tricode: uniquePlayers[0]?.team.tricode || "NBA",
      fullName: uniquePlayers.length === 1 ? uniquePlayers[0]?.team.fullName || "" : "Multiple Teams",
    },
    filters: {
      opponent: baseQuery.opponentTeamId
        ? NBA_TEAMS.find((entry) => entry.teamId === baseQuery.opponentTeamId) || null
        : null,
      resultFilter: baseQuery.resultFilter || "all",
      homeAwayFilter: baseQuery.homeAwayFilter || "all",
      seasonScope: baseQuery.seasonScope || "all",
      sort: baseQuery.sort || null,
      limit: null,
      groupBy: baseQuery.groupBy || "none",
    },
    stat: {
      key: metric.key,
      label: `${metric.label} Comparison`,
    },
    parsedQuery: {
      ...baseQuery,
      teamId: uniquePlayers[0]?.team.teamId || "",
    },
    result: {
      aggregation: "comparison_table",
      value: tableRows.length,
      displayValue: `${tableRows.length}`,
      answer: `Comparison table for ${metric.label.toLowerCase()} across ${uniquePlayers.map((player) => player.playerName).join(" vs ")}.`,
      sampleSize: tableRows.length,
      games: [],
      groups: [],
      table: {
        columns: tableColumns,
        rows: tableRows,
      },
    },
    skippedGames: [],
    supportedStats: METRICS.map((entry) => ({ key: entry.key, label: entry.label })),
  };
}

function executeQuery(
  rowsWithMetrics: Array<CachedTeamGameRow | CachedPlayerGameRow>,
  metric: MetricDefinition,
  query: ParsedQuery,
  team: (typeof NBA_TEAMS)[number],
  subjectLabel = team.fullName,
) {
  const threshold = safeNumber(query.threshold, 0);
  const requestedAggregation = query.aggregation || "season_total";
  const aggregation = metric.kind === "rate" && requestedAggregation === "season_total"
    ? "season_average"
    : requestedAggregation;
  const opponentTeam = query.opponentTeamId
    ? NBA_TEAMS.find((entry) => entry.teamId === query.opponentTeamId) || null
    : null;
  const scopedLabel = describeScope(team, opponentTeam, query.resultFilter || "all");
  const subjectScopeLabel = query.playerName
    ? `${query.playerName} for ${scopedLabel}`
    : scopedLabel;

  const rows: QueryGameRow[] = rowsWithMetrics.map((row) => ({
    gameId: row.gameId,
    gameDate: row.gameDate,
    opponent: row.opponent,
    value: safeNumber((row.metrics as Record<string, unknown>)[metric.key], 0),
    result: row.result,
    teamScore: row.teamScore,
    opponentScore: row.opponentScore,
    margin: row.margin,
    isHome: row.isHome,
    seasonType: row.seasonType,
    groupKey: row.groupKey,
    groupLabel: row.groupLabel,
  }));

  const filteredRows = rows.filter((row) => {
    if (!matchesSeasonScope(row, query.seasonScope || "all")) return false;
    if (query.opponentTeamId && row.opponent.teamId !== query.opponentTeamId) return false;
    if (query.resultFilter === "win" && row.result !== "W") return false;
    if (query.resultFilter === "loss" && row.result !== "L") return false;
    if (query.homeAwayFilter === "home" && !row.isHome) return false;
    if (query.homeAwayFilter === "away" && row.isHome) return false;
    return true;
  });

  const sortDirection = query.sort
    || (
      aggregation === "list_games" && (query.sortBy || "value") === "date"
        ? "asc"
        : aggregation === "min_game" || aggregation === "count_games_lte" || aggregation === "record_when_lte"
          ? "asc"
          : "desc"
    );
  const sortBy = query.sortBy || (aggregation === "list_games" ? "date" : "value");
  const orderedRows = [...filteredRows].sort((left, right) => compareRows(left, right, sortDirection, sortBy));
  const listLimit = query.limit || (aggregation === "list_games" ? orderedRows.length : 25);
  const groupedSummaries = buildGroupedSummaries(orderedRows, metric, query, aggregation, threshold, sortDirection);
  const distinctGameSampleSize = new Set(filteredRows.map((row) => row.gameId)).size;

  const buildCountAnswer = (matchingRows: QueryGameRow[], comparatorText: string) => ({
      aggregation,
      value: matchingRows.length,
      displayValue: `${matchingRows.length}`,
      answer: `${subjectScopeLabel} had ${matchingRows.length} game${matchingRows.length === 1 ? "" : "s"} this season with ${comparatorText} ${metric.label.toLowerCase()}.`,
      games: matchingRows,
      sampleSize: distinctGameSampleSize,
      groups: groupedSummaries,
    });

  const buildRecordAnswer = (matchingRows: QueryGameRow[], comparatorText: string | null) => {
    const wins = matchingRows.filter((row) => row.result === "W").length;
    const losses = matchingRows.filter((row) => row.result === "L").length;
    const qualifier = comparatorText ? ` when posting ${comparatorText} ${metric.label.toLowerCase()}` : "";
    return {
      aggregation,
      value: wins - losses,
      displayValue: formatRecordDisplay(wins, losses),
      answer: `${subjectScopeLabel}'s record${qualifier} was ${wins}-${losses}.`,
      games: matchingRows,
      sampleSize: distinctGameSampleSize,
      groups: groupedSummaries,
      record: {
        wins,
        losses,
        winPct: matchingRows.length ? (wins / matchingRows.length) * 100 : 0,
      },
    };
  };

  if (!filteredRows.length) {
    return {
      aggregation,
      value: 0,
      displayValue: aggregation === "record" || aggregation.startsWith("record_when") ? "0-0" : "0",
      answer: `No completed games matched that filter for ${subjectScopeLabel}.`,
      games: [],
      sampleSize: 0,
      groups: groupedSummaries,
    };
  }

  if (aggregation === "count_games_gte") {
    const matchingRows = orderedRows.filter((entry) => entry.value >= threshold);
    return buildCountAnswer(matchingRows, `${threshold}+`);
  }

  if (aggregation === "count_games_lte") {
    const matchingRows = orderedRows.filter((entry) => entry.value <= threshold);
    return buildCountAnswer(matchingRows, `${threshold} or fewer`);
  }

  if (aggregation === "count_games_nonzero") {
    const matchingRows = orderedRows.filter((entry) => entry.value > 0);
    return {
      aggregation,
      value: matchingRows.length,
      displayValue: `${matchingRows.length}`,
      answer: `${subjectScopeLabel} recorded ${metric.label.toLowerCase()} in ${matchingRows.length} game${matchingRows.length === 1 ? "" : "s"} this season.`,
      games: matchingRows,
      sampleSize: distinctGameSampleSize,
      groups: groupedSummaries,
    };
  }

  if (aggregation === "record") {
    return buildRecordAnswer(orderedRows, null);
  }

  if (aggregation === "record_when_gte") {
    return buildRecordAnswer(orderedRows.filter((entry) => entry.value >= threshold), `${threshold}+`);
  }

  if (aggregation === "record_when_lte") {
    return buildRecordAnswer(orderedRows.filter((entry) => entry.value <= threshold), `${threshold} or fewer`);
  }

  if (aggregation === "record_when_nonzero") {
    return buildRecordAnswer(orderedRows.filter((entry) => entry.value > 0), "any");
  }

  if (aggregation === "season_average") {
    const average = orderedRows.reduce((sum, entry) => sum + entry.value, 0) / orderedRows.length;
    const displayAverage = formatAverageValue(average, metric);
    const answer = groupedSummaries.length && query.groupBy !== "none"
      ? `Showing ${metric.label.toLowerCase()} averages for ${subjectScopeLabel}, grouped by ${groupByLabel(query.groupBy)}.`
      : `${subjectScopeLabel} averaged ${displayAverage} ${metric.label.toLowerCase()} across ${orderedRows.length} game${orderedRows.length === 1 ? "" : "s"}.`;
    return {
      aggregation,
      value: average,
      displayValue: displayAverage,
      answer,
      games: query.groupBy === "period" ? [] : orderedRows,
      sampleSize: distinctGameSampleSize,
      groups: groupedSummaries,
    };
  }

  if (aggregation === "max_game") {
      const best = [...orderedRows].sort((left, right) => compareRows(left, right, "desc", "value"))[0] || null;
    return {
      aggregation,
      value: best?.value || 0,
      displayValue: formatValue(best?.value || 0, metric),
      answer: best
        ? `${subjectScopeLabel}'s highest single-game ${metric.label.toLowerCase()} total was ${formatValue(best.value, metric)} on ${best.gameDate} against ${best.opponent.tricode || best.opponent.fullName}.`
        : `No completed games found for ${subjectScopeLabel}.`,
      games: best ? [best] : [],
      sampleSize: distinctGameSampleSize,
      groups: groupedSummaries,
    };
  }

  if (aggregation === "min_game") {
      const best = [...orderedRows].sort((left, right) => compareRows(left, right, "asc", "value"))[0] || null;
    return {
      aggregation,
      value: best?.value || 0,
      displayValue: formatValue(best?.value || 0, metric),
      answer: best
        ? `${subjectScopeLabel}'s lowest single-game ${metric.label.toLowerCase()} total was ${formatValue(best.value, metric)} on ${best.gameDate} against ${best.opponent.tricode || best.opponent.fullName}.`
        : `No completed games found for ${subjectScopeLabel}.`,
      games: best ? [best] : [],
      sampleSize: distinctGameSampleSize,
      groups: groupedSummaries,
    };
  }

  if (aggregation === "list_games") {
    const listedGames = orderedRows.slice(0, listLimit);
    return {
      aggregation,
      value: listedGames.length,
      displayValue: `${listedGames.length}`,
      answer: `Showing ${listedGames.length} ${metric.label.toLowerCase()} game${listedGames.length === 1 ? "" : "s"} for ${subjectScopeLabel}, sorted by ${sortBy === "date" ? "date" : metric.label.toLowerCase()} ${sortDirection === "asc" ? "ascending" : "descending"}.`,
      games: listedGames,
      sampleSize: distinctGameSampleSize,
      groups: groupedSummaries,
    };
  }

  const total = orderedRows.reduce((sum, entry) => sum + entry.value, 0);
  return {
    aggregation: "season_total",
    value: total,
    displayValue: formatValue(total, metric),
    answer: `${subjectScopeLabel}'s total ${metric.label.toLowerCase()} was ${formatValue(total, metric)} across ${orderedRows.length} game${orderedRows.length === 1 ? "" : "s"}.`,
    games: orderedRows,
    sampleSize: distinctGameSampleSize,
    groups: groupedSummaries,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const prompt = String(body?.prompt || "").trim();
    if (!prompt) return jsonResponse(400, { error: "Prompt is required." });
    const season = currentSeasonString();
    const explicitTeam = findTeamFromPrompt(prompt);
    const inferredPlayerTeam = explicitTeam ? null : await inferTeamFromPlayerPrompt(prompt, season).catch(() => null);
    const opponentRelativeRequest = parseOpponentRelativeRequest(prompt, explicitTeam, inferredPlayerTeam?.team || null);
    if (opponentRelativeRequest) {
      const dataset = await buildTeamSeasonDataset(season, opponentRelativeRequest.team);
      if (!dataset.rows.length) {
        return jsonResponse(502, {
          error: "Unable to load any completed game details for this request.",
          skippedGames: dataset.skippedGames,
        });
      }

      const filteredRows = dataset.rows.filter((row) => {
        if (!matchesSeasonScope(row, opponentRelativeRequest.seasonScope)) return false;
        if (opponentRelativeRequest.resultFilter === "win" && row.result !== "W") return false;
        if (opponentRelativeRequest.resultFilter === "loss" && row.result !== "L") return false;
        if (opponentRelativeRequest.homeAwayFilter === "home" && !row.isHome) return false;
        if (opponentRelativeRequest.homeAwayFilter === "away" && row.isHome) return false;
        return true;
      });
      const matchingRows = filteredRows.filter((row) => {
        const teamValue = safeNumber((row.metrics as Record<string, unknown>)[opponentRelativeRequest.metric.key], 0);
        const opponentValue = safeNumber((row.opponentMetrics as Record<string, unknown>)[opponentRelativeRequest.metric.key], 0);
        if (opponentRelativeRequest.comparison === "gt") return teamValue > opponentValue;
        if (opponentRelativeRequest.comparison === "lt") return teamValue < opponentValue;
        return teamValue === opponentValue;
      }).map((row) => ({
        gameId: row.gameId,
        gameDate: row.gameDate,
        opponent: row.opponent,
        value: safeNumber((row.metrics as Record<string, unknown>)[opponentRelativeRequest.metric.key], 0),
        result: row.result,
        teamScore: row.teamScore,
        opponentScore: row.opponentScore,
        margin: row.margin,
        isHome: row.isHome,
        seasonType: row.seasonType,
      }));

      const wins = matchingRows.filter((row) => row.result === "W").length;
      const losses = matchingRows.filter((row) => row.result === "L").length;
      const comparisonText = opponentRelativeRequest.comparison === "gt"
        ? `more ${opponentRelativeRequest.metric.label.toLowerCase()} than their opponent`
        : opponentRelativeRequest.comparison === "lt"
          ? `fewer ${opponentRelativeRequest.metric.label.toLowerCase()} than their opponent`
          : `the same number of ${opponentRelativeRequest.metric.label.toLowerCase()} as their opponent`;

      return jsonResponse(200, {
        prompt,
        season,
        team: {
          teamId: opponentRelativeRequest.team.teamId,
          tricode: opponentRelativeRequest.team.tricode,
          fullName: opponentRelativeRequest.team.fullName,
        },
        filters: {
          opponent: null,
          resultFilter: opponentRelativeRequest.resultFilter,
          homeAwayFilter: opponentRelativeRequest.homeAwayFilter,
          seasonScope: opponentRelativeRequest.seasonScope,
          sort: "desc",
          limit: null,
          groupBy: "none",
        },
        stat: {
          key: opponentRelativeRequest.metric.key,
          label: opponentRelativeRequest.metric.label,
        },
        parsedQuery: {
          aggregation: opponentRelativeRequest.aggregation === "record" ? "record_when_relative" : "count_games_relative",
          seasonScope: opponentRelativeRequest.seasonScope,
        },
        result: {
          aggregation: opponentRelativeRequest.aggregation === "record" ? "record_when_relative" : "count_games_relative",
          value: opponentRelativeRequest.aggregation === "record" ? wins - losses : matchingRows.length,
          displayValue: opponentRelativeRequest.aggregation === "record" ? `${wins}-${losses}` : `${matchingRows.length}`,
          answer: opponentRelativeRequest.aggregation === "record"
            ? `${opponentRelativeRequest.team.fullName}'s record when posting ${comparisonText} was ${wins}-${losses}.`
            : `${opponentRelativeRequest.team.fullName} had ${matchingRows.length} game${matchingRows.length === 1 ? "" : "s"} this season with ${comparisonText}.`,
          games: matchingRows,
          sampleSize: filteredRows.length,
          groups: [],
          record: opponentRelativeRequest.aggregation === "record"
            ? { wins, losses, winPct: matchingRows.length ? (wins / matchingRows.length) * 100 : 0 }
            : undefined,
        },
        skippedGames: dataset.skippedGames,
        supportedStats: METRICS.map((entry) => ({ key: entry.key, label: entry.label })),
      });
    }
    const metricForComparison = findMetricFromPrompt(prompt);
    if (metricForComparison && isComparisonPrompt(prompt)) {
      const comparisonPlayers = await inferPlayersFromPrompt(prompt, season, explicitTeam || inferredPlayerTeam?.team || null);
      if (comparisonPlayers.length >= 2) {
        const baseQuery = normalizeParsedQuery(buildFallbackParse(prompt, explicitTeam || inferredPlayerTeam?.team || comparisonPlayers[0]?.team || null));
        if (baseQuery) {
          const comparisonPayload = await executeComparisonQuery(prompt, season, metricForComparison, baseQuery, comparisonPlayers);
          return jsonResponse(200, comparisonPayload);
        }
      }
    }

    const tableRequest = parseGameTableRequest(prompt);
    if (tableRequest) {
      const team = NBA_TEAMS.find((entry) => entry.teamId === tableRequest.teamId) || null;
      if (!team) {
        return jsonResponse(400, { error: "I could not match that table request to a single NBA team." });
      }
      const dataset = await buildTeamSeasonDataset(season, team);
      if (!dataset.rows.length) {
        return jsonResponse(502, {
          error: "Unable to load any completed game details for this request.",
          skippedGames: dataset.skippedGames,
        });
      }

      const result = executeGameTableQuery(dataset.rows, tableRequest, team);
      return jsonResponse(200, {
        prompt,
        season,
        team: {
          teamId: team.teamId,
          tricode: team.tricode,
          fullName: team.fullName,
        },
        filters: {
          opponent: tableRequest.opponentTeamId
            ? NBA_TEAMS.find((entry) => entry.teamId === tableRequest.opponentTeamId) || null
            : null,
          resultFilter: tableRequest.resultFilter || "all",
          homeAwayFilter: "all",
          sort: tableRequest.sort || null,
          limit: null,
          groupBy: "none",
          seasonScope: tableRequest.seasonScope || "all",
        },
        stat: {
          key: "game_table",
          label: "Custom Table",
        },
        parsedQuery: {
          aggregation: "game_table",
          seasonScope: tableRequest.seasonScope || "all",
        },
        result,
        skippedGames: dataset.skippedGames,
        supportedStats: METRICS.map((entry) => ({ key: entry.key, label: entry.label })),
      });
    }

    const fallbackParsed = normalizeParsedQuery(buildFallbackParse(prompt, inferredPlayerTeam?.team || explicitTeam || null));
    const promptThreshold = parseThreshold(prompt);
    const explicitOrImplicitThreshold = promptThreshold ?? parseImplicitThreshold(prompt, metricForComparison || findMetricFromPrompt(prompt));
    const promptHasExplicitOpponent = hasExplicitOpponentContext(prompt);
    const specificPeriod = parseSpecificPeriod(prompt);
    const openAiParsedPromise = parsePromptWithOpenAI(prompt)
      .then((value) => normalizeParsedQuery(value))
      .catch(() => null);
    const seasonGamesPromise = fetchSeasonGames(season);
    const openAiParsed = await openAiParsedPromise;
    const candidateParses = [fallbackParsed, openAiParsed].filter(Boolean) as ParsedQuery[];

    let parsed: ParsedQuery | null = null;
    let team: (typeof NBA_TEAMS)[number] | null = null;
    let metric: MetricDefinition | null = null;

    let bestCandidateScore = 0;

    for (const candidate of candidateParses) {
      const matchedTeam = NBA_TEAMS.find((entry) => entry.teamId === candidate.teamId) || null;
      const matchedMetric = METRICS.find((entry) => entry.key === candidate.statKey) || null;
      if (matchedTeam && matchedMetric) {
        if (candidate.opponentTeamId && !promptHasExplicitOpponent) {
          candidate.opponentTeamId = undefined;
        }
        if (explicitOrImplicitThreshold != null && candidate.threshold == null) {
          continue;
        }
        const teamScore = scoreTeamPrompt(matchedTeam, prompt);
        const metricScore = scoreMetricPrompt(matchedMetric, prompt);
        const matchedOpponent = candidate.opponentTeamId
          ? NBA_TEAMS.find((entry) => entry.teamId === candidate.opponentTeamId) || null
          : null;
        const opponentScore = matchedOpponent ? scoreTeamPrompt(matchedOpponent, prompt) : 0;
        const sourceBonus = candidate === fallbackParsed ? 25 : 0;
        const filterBonus = (candidate.resultFilter && candidate.resultFilter !== "all" ? 2 : 0)
          + (matchedOpponent ? 2 : 0);
        const thresholdBonus = explicitOrImplicitThreshold != null && candidate.threshold === explicitOrImplicitThreshold ? 4 : 0;
        const groupBonus = parseGroupBy(prompt) !== "none" && candidate.groupBy === parseGroupBy(prompt) ? 6 : 0;
        const inferredTeamBonus = inferredPlayerTeam?.team.teamId === matchedTeam.teamId ? 12 : 0;
        const metricIntentBonus = scoreMetricIntent(matchedMetric, prompt);
        const effectiveTeamScore = Math.max(teamScore, inferredTeamBonus);
        const candidateScore = effectiveTeamScore + metricScore + opponentScore + sourceBonus + filterBonus + thresholdBonus + groupBonus + metricIntentBonus;
        if (effectiveTeamScore < 6 || metricScore < 5 || candidateScore <= bestCandidateScore) continue;
        bestCandidateScore = candidateScore;
        if (candidate.opponentTeamId === candidate.teamId) {
          candidate.opponentTeamId = undefined;
        }
        parsed = candidate;
        team = matchedTeam;
        metric = matchedMetric;
      }
    }

    if (!parsed || !team || !metric) {
      return jsonResponse(400, {
        error: "I could not match that request to a single NBA team and a supported dashboard stat.",
        fallbackParsed,
        openAiParsed,
        supportedStats: METRICS.map((entry) => entry.label),
      });
    }

    if (parsed.groupBy === "period" && !PERIOD_SUPPORTED_METRIC_KEYS.has(metric.key)) {
      return jsonResponse(400, {
        error: "Quarter or period splits are currently supported for player box-score style stats and related shooting rates.",
      });
    }

    if (parsed.groupBy === "on_off" && !ON_OFF_SUPPORTED_METRIC_KEYS.has(metric.key)) {
      return jsonResponse(400, {
        error: "On/off splits are currently supported for points, offensive rating, defensive rating, and net rating.",
      });
    }

    if (parsed.groupBy === "on_off") {
      const onOffPlayers = uniqueByKey(
        await inferPlayersFromPrompt(prompt, season, team),
        (entry) => `${entry.team.teamId}:${entry.playerId}`,
      ).filter((entry) => entry.team.teamId === team.teamId);
      if (!onOffPlayers.length) {
        return jsonResponse(400, {
          error: `I could not identify a player from ${team.fullName} for that on/off request.`,
        });
      }
      parsed.contextPlayerIds = onOffPlayers.map((entry) => entry.playerId);
      parsed.contextPlayerNames = onOffPlayers.map((entry) => entry.playerName);
    }

    const likelyPlayerName = extractLikelyPlayerName(prompt, team);
    if (likelyPlayerName) {
      const inferredPlayers = await inferPlayersFromPrompt(prompt, season, team);
      const matchedPlayer = inferredPlayers.find((entry) => entry.team.teamId === team.teamId) || null;
      if (matchedPlayer) {
        parsed.playerId = matchedPlayer.playerId;
        parsed.playerName = matchedPlayer.playerName;
      } else {
        return jsonResponse(400, {
          error: `${likelyPlayerName} was not found in ${team.fullName}'s ${season} game data. If you meant a different team, change the team in the prompt. If you meant games against ${team.fullName}, phrase it as "against ${team.tricode}" or "vs ${team.fullName}".`,
        });
      }
    }

    let rowsForQuery: Array<CachedTeamGameRow | CachedPlayerGameRow> = [];
    let subjectLabel = parsed.playerName || team.fullName;
    let skippedGames: Array<{ gameId: string; gameDate: string; error: string }> = [];

    if (parsed.groupBy === "on_off" && parsed.contextPlayerIds?.length) {
      const onOffDataset = await buildTeamOnOffDataset(season, team, parsed.contextPlayerIds);
      rowsForQuery = onOffDataset.rows;
      skippedGames = onOffDataset.skippedGames;
      subjectLabel = `${team.fullName} with ${parsed.contextPlayerNames?.join(" + ") || "selected players"} on/off`;
    } else if (parsed.playerId && parsed.groupBy === "period" && PERIOD_SUPPORTED_METRIC_KEYS.has(metric.key)) {
      const playerPeriodDataset = await buildSinglePlayerPeriodDataset(season, team, parsed.playerId);
      rowsForQuery = playerPeriodDataset.rows;
      skippedGames = playerPeriodDataset.skippedGames;
    } else if (parsed.playerId) {
      await seasonGamesPromise;
      const playerDataset = await buildSinglePlayerSeasonDataset(season, team, parsed.playerId);
      rowsForQuery = playerDataset.rows;
      skippedGames = playerDataset.skippedGames;
    } else if (parsed.groupBy === "period" && metric.key === "points") {
      const teamPeriodDataset = await buildTeamPeriodPointsDataset(season, team);
      rowsForQuery = teamPeriodDataset.rows;
      skippedGames = teamPeriodDataset.skippedGames;
    } else {
      await seasonGamesPromise;
      const dataset = await buildTeamSeasonDataset(season, team);
      if (!dataset.rows.length) {
        return jsonResponse(502, {
          error: "Unable to load any completed game details for this request.",
          skippedGames: dataset.skippedGames,
        });
      }
      rowsForQuery = dataset.rows;
      skippedGames = dataset.skippedGames;
    }

    if (!rowsForQuery.length) {
      return jsonResponse(502, {
        error: "Unable to load any completed game details for this request.",
        skippedGames,
      });
    }
    if (parsed.groupBy === "period" && specificPeriod) {
      rowsForQuery = rowsForQuery.filter((row) => row.groupKey === specificPeriod);
    }
    if (parsed.groupBy === "period" && isSingleQuarterThresholdPrompt(prompt) && (
      parsed.aggregation === "count_games_gte"
      || parsed.aggregation === "count_games_lte"
      || parsed.aggregation === "count_games_nonzero"
      || parsed.aggregation === "record_when_gte"
      || parsed.aggregation === "record_when_lte"
      || parsed.aggregation === "record_when_nonzero"
    )) {
      rowsForQuery = collapsePeriodRowsToGameThresholdRows(rowsForQuery, parsed.aggregation);
      parsed.groupBy = "none";
    }
    const result = executeQuery(rowsForQuery, metric, parsed, team, subjectLabel);

    return jsonResponse(200, {
      prompt,
      season,
      team: {
        teamId: team.teamId,
        tricode: team.tricode,
        fullName: team.fullName,
      },
      filters: {
        opponent: parsed.opponentTeamId
          ? NBA_TEAMS.find((entry) => entry.teamId === parsed.opponentTeamId) || null
          : null,
        resultFilter: parsed.resultFilter || "all",
        homeAwayFilter: parsed.homeAwayFilter || "all",
        seasonScope: parsed.seasonScope || "all",
        sort: parsed.sort || null,
        limit: parsed.limit || null,
        groupBy: parsed.groupBy || "none",
      },
      stat: {
        key: metric.key,
        label: metric.label,
      },
      player: parsed.playerId
        ? {
          playerId: parsed.playerId,
          fullName: parsed.playerName || "",
        }
        : null,
      parsedQuery: parsed,
      result: {
        ...result,
        games: result.games,
      },
      skippedGames,
      supportedStats: METRICS.map((entry) => ({ key: entry.key, label: entry.label })),
    });
  } catch (error) {
    console.error("custom-requests failed", error);
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unknown error.",
    });
  }
});
