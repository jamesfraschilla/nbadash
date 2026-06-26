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

type OpponentRecordRequest = {
  team: (typeof NBA_TEAMS)[number];
  opponents: Array<(typeof NBA_TEAMS)[number]>;
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

type AnyRecord = Record<string, any>;

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

type GameMetricContext = {
  homeTeamId: string;
  awayTeamId: string;
  actions: Array<Record<string, unknown>>;
  derivedTotals: Record<string, Record<string, number>>;
  firstHalfPointsByTeam: Record<string, number>;
  killsByTeam: Record<string, number>;
};

type CachedTeamGameRow = QueryGameRow & {
  teamId?: string;
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
  rows: CachedTeamGameRow[];
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
const LEAGUE_TEAM_DATASET_CACHE = new Map<string, Promise<{
  rows: CachedTeamGameRow[];
  skippedGames: Array<{ gameId: string; gameDate: string; error: string }>;
}>>();
const DEFAULT_SEASON_CACHE = new Map<string, Promise<string>>();

const ROSTER_SNAPSHOT_BY_TEAM = {"1610612737":[{"personId":"1630228","firstName":"Jonathan","familyName":"Kuminga","fullName":"Jonathan Kuminga","jerseyNum":"0","position":"F","height":"6-7"},{"personId":"1642484","firstName":"RayJ","familyName":"Dennis","fullName":"RayJ Dennis","jerseyNum":"00","position":"G","height":"6-1"},{"personId":"1630552","firstName":"Jalen","familyName":"Johnson","fullName":"Jalen Johnson","jerseyNum":"1","position":"F","height":"6-8"},{"personId":"1630811","firstName":"Keaton","familyName":"Wallace","fullName":"Keaton Wallace","jerseyNum":"2","position":"G","height":"6-3"},{"personId":"203468","firstName":"CJ","familyName":"McCollum","fullName":"CJ McCollum","jerseyNum":"3","position":"G","height":"6-3"},{"personId":"1629216","firstName":"Gabe","familyName":"Vincent","fullName":"Gabe Vincent","jerseyNum":"4","position":"G","height":"6-2"},{"personId":"1630700","firstName":"Dyson","familyName":"Daniels","fullName":"Dyson Daniels","jerseyNum":"5","position":"G","height":"6-7"},{"personId":"1629638","firstName":"Nickeil","familyName":"Alexander-Walker","fullName":"Nickeil Alexander-Walker","jerseyNum":"7","position":"G","height":"6-5"},{"personId":"1627741","firstName":"Buddy","familyName":"Hield","fullName":"Buddy Hield","jerseyNum":"8","position":"G","height":"6-4"},{"personId":"1631132","firstName":"Christian","familyName":"Koloko","fullName":"Christian Koloko","jerseyNum":"10","position":"C","height":"6-11"},{"personId":"1642258","firstName":"Zaccharie","familyName":"Risacher","fullName":"Zaccharie Risacher","jerseyNum":"10","position":"F","height":"6-8"},{"personId":"1628396","firstName":"Tony","familyName":"Bradley","fullName":"Tony Bradley","jerseyNum":"13","position":"C-F","height":"6-10"},{"personId":"1642854","firstName":"Asa","familyName":"Newell","fullName":"Asa Newell","jerseyNum":"14","position":"F","height":"6-10"},{"personId":"1630168","firstName":"Onyeka","familyName":"Okongwu","fullName":"Onyeka Okongwu","jerseyNum":"17","position":"F-C","height":"6-10"},{"personId":"1631243","firstName":"Mouhamed","familyName":"Gueye","fullName":"Mouhamed Gueye","jerseyNum":"18","position":"F","height":"6-11"},{"personId":"1630557","firstName":"Corey","familyName":"Kispert","fullName":"Corey Kispert","jerseyNum":"24","position":"F","height":"6-6"},{"personId":"1629111","firstName":"Jock","familyName":"Landale","fullName":"Jock Landale","jerseyNum":"31","position":"C","height":"6-11"},{"personId":"1642933","firstName":"Keshon","familyName":"Gilbert","fullName":"Keshon Gilbert","jerseyNum":"","position":"G","height":"6-4"}],"1610612738":[{"personId":"1628369","firstName":"Jayson","familyName":"Tatum","fullName":"Jayson Tatum","jerseyNum":"0","position":"F-G","height":"6-8"},{"personId":"202696","firstName":"Nikola","familyName":"Vučević","fullName":"Nikola Vučević","jerseyNum":"4","position":"C","height":"6-9"},{"personId":"1627759","firstName":"Jaylen","familyName":"Brown","fullName":"Jaylen Brown","jerseyNum":"7","position":"G-F","height":"6-6"},{"personId":"1642910","firstName":"John","familyName":"Tonje","fullName":"John Tonje","jerseyNum":"8","position":"G","height":"6-4"},{"personId":"1628401","firstName":"Derrick","familyName":"White","fullName":"Derrick White","jerseyNum":"9","position":"G","height":"6-4"},{"personId":"1630202","firstName":"Payton","familyName":"Pritchard","fullName":"Payton Pritchard","jerseyNum":"11","position":"G","height":"6-1"},{"personId":"1631199","firstName":"Ron","familyName":"Harper Jr.","fullName":"Ron Harper Jr.","jerseyNum":"13","position":"G-F","height":"6-5"},{"personId":"1641775","firstName":"Jordan","familyName":"Walsh","fullName":"Jordan Walsh","jerseyNum":"27","position":"G","height":"6-6"},{"personId":"1642864","firstName":"Hugo","familyName":"González","fullName":"Hugo González","jerseyNum":"28","position":"G","height":"6-6"},{"personId":"1630573","firstName":"Sam","familyName":"Hauser","fullName":"Sam Hauser","jerseyNum":"30","position":"F","height":"6-7"},{"personId":"1642917","firstName":"Max","familyName":"Shulga","fullName":"Max Shulga","jerseyNum":"44","position":"G","height":"6-4"},{"personId":"1630625","firstName":"Dalano","familyName":"Banton","fullName":"Dalano Banton","jerseyNum":"45","position":"F","height":"6-8"},{"personId":"1630568","firstName":"Luka","familyName":"Garza","fullName":"Luka Garza","jerseyNum":"52","position":"C","height":"6-10"},{"personId":"1631248","firstName":"Baylor","familyName":"Scheierman","fullName":"Baylor Scheierman","jerseyNum":"55","position":"G","height":"6-6"},{"personId":"1642873","firstName":"Amari","familyName":"Williams","fullName":"Amari Williams","jerseyNum":"77","position":"F-C","height":"6-11"},{"personId":"1629674","firstName":"Neemias","familyName":"Queta","fullName":"Neemias Queta","jerseyNum":"88","position":"C","height":"7-0"}],"1610612739":[{"personId":"201935","firstName":"James","familyName":"Harden","fullName":"James Harden","jerseyNum":"1","position":"G","height":"6-5"},{"personId":"1629622","firstName":"Max","familyName":"Strus","fullName":"Max Strus","jerseyNum":"2","position":"G-F","height":"6-5"},{"personId":"1628418","firstName":"Thomas","familyName":"Bryant","fullName":"Thomas Bryant","jerseyNum":"3","position":"C-F","height":"6-9"},{"personId":"1630596","firstName":"Evan","familyName":"Mobley","fullName":"Evan Mobley","jerseyNum":"4","position":"C","height":"6-11"},{"personId":"1630241","firstName":"Sam","familyName":"Merrill","fullName":"Sam Merrill","jerseyNum":"5","position":"G","height":"6-4"},{"personId":"203471","firstName":"Dennis","familyName":"Schröder","fullName":"Dennis Schröder","jerseyNum":"8","position":"G","height":"6-1"},{"personId":"1641854","firstName":"Craig","familyName":"Porter Jr.","fullName":"Craig Porter Jr.","jerseyNum":"9","position":"G","height":"6-1"},{"personId":"1642434","firstName":"Riley","familyName":"Minix","fullName":"Riley Minix","jerseyNum":"12","position":"F","height":"6-7"},{"personId":"1631165","firstName":"Keon","familyName":"Ellis","fullName":"Keon Ellis","jerseyNum":"14","position":"G","height":"6-4"},{"personId":"1642281","firstName":"Jaylon","familyName":"Tyson","fullName":"Jaylon Tyson","jerseyNum":"20","position":"G-F","height":"6-6"},{"personId":"1642400","firstName":"Tristan","familyName":"Enaruna","fullName":"Tristan Enaruna","jerseyNum":"21","position":"F","height":"6-7"},{"personId":"1626204","firstName":"Larry","familyName":"Nance Jr.","fullName":"Larry Nance Jr.","jerseyNum":"22","position":"F-C","height":"6-6"},{"personId":"1642878","firstName":"Tyrese","familyName":"Proctor","fullName":"Tyrese Proctor","jerseyNum":"24","position":"G","height":"6-4"},{"personId":"1628386","firstName":"Jarrett","familyName":"Allen","fullName":"Jarrett Allen","jerseyNum":"31","position":"C","height":"6-9"},{"personId":"1629731","firstName":"Dean","familyName":"Wade","fullName":"Dean Wade","jerseyNum":"32","position":"F-C","height":"6-9"},{"personId":"1630846","firstName":"Olivier","familyName":"Sarr","fullName":"Olivier Sarr","jerseyNum":"33","position":"C","height":"6-10"},{"personId":"1641772","firstName":"Nae'Qwan","familyName":"Tomlin","fullName":"Nae'Qwan Tomlin","jerseyNum":"35","position":"F","height":"6-8"},{"personId":"1628378","firstName":"Donovan","familyName":"Mitchell","fullName":"Donovan Mitchell","jerseyNum":"45","position":"G","height":"6-2"}],"1610612740":[{"personId":"1642847","firstName":"Jeremiah","familyName":"Fears","fullName":"Jeremiah Fears","jerseyNum":"0","position":"G","height":"6-3"},{"personId":"1629627","firstName":"Zion","familyName":"Williamson","fullName":"Zion Williamson","jerseyNum":"1","position":"F","height":"6-6"},{"personId":"1630529","firstName":"Herbert","familyName":"Jones","fullName":"Herbert Jones","jerseyNum":"2","position":"F","height":"6-7"},{"personId":"1629673","firstName":"Jordan","familyName":"Poole","fullName":"Jordan Poole","jerseyNum":"3","position":"G","height":"6-4"},{"personId":"1630621","firstName":"Hunter","familyName":"Dickinson","fullName":"Hunter Dickinson","jerseyNum":"4","position":"C","height":"7-1"},{"personId":"1627749","firstName":"Dejounte","familyName":"Murray","fullName":"Dejounte Murray","jerseyNum":"5","position":"G","height":"6-4"},{"personId":"201599","firstName":"DeAndre","familyName":"Jordan","fullName":"DeAndre Jordan","jerseyNum":"9","position":"C","height":"6-11"},{"personId":"1631121","firstName":"Bryce","familyName":"McGowens","fullName":"Bryce McGowens","jerseyNum":"11","position":"G","height":"6-6"},{"personId":"1642877","firstName":"Micah","familyName":"Peavy","fullName":"Micah Peavy","jerseyNum":"14","position":"G-F","height":"6-7"},{"personId":"1631255","firstName":"Karlo","familyName":"Matković","fullName":"Karlo Matković","jerseyNum":"17","position":"F-C","height":"6-10"},{"personId":"1642274","firstName":"Yves","familyName":"Missi","fullName":"Yves Missi","jerseyNum":"21","position":"C","height":"6-11"},{"personId":"1642852","firstName":"Derik","familyName":"Queen","fullName":"Derik Queen","jerseyNum":"22","position":"C","height":"6-9"},{"personId":"1641725","firstName":"Trey","familyName":"Alexander","fullName":"Trey Alexander","jerseyNum":"23","position":"G","height":"6-5"},{"personId":"1641722","firstName":"Jordan","familyName":"Hawkins","fullName":"Jordan Hawkins","jerseyNum":"24","position":"G","height":"6-5"},{"personId":"1630530","firstName":"Trey","familyName":"Murphy III","fullName":"Trey Murphy III","jerseyNum":"25","position":"F","height":"6-8"},{"personId":"1630180","firstName":"Saddiq","familyName":"Bey","fullName":"Saddiq Bey","jerseyNum":"41","position":"G-F","height":"6-8"},{"personId":"1626172","firstName":"Kevon","familyName":"Looney","fullName":"Kevon Looney","jerseyNum":"55","position":"F","height":"6-9"},{"personId":"1642490","firstName":"Josh","familyName":"Oduro","fullName":"Josh Oduro","jerseyNum":"","position":"C","height":"6-9"}],"1610612741":[{"personId":"1629012","firstName":"Collin","familyName":"Sexton","fullName":"Collin Sexton","jerseyNum":"2","position":"G","height":"6-3"},{"personId":"1630581","firstName":"Josh","familyName":"Giddey","fullName":"Josh Giddey","jerseyNum":"3","position":"G","height":"6-7"},{"personId":"1630644","firstName":"Mac","familyName":"McClung","fullName":"Mac McClung","jerseyNum":"5","position":"G","height":"6-2"},{"personId":"1642265","firstName":"Rob","familyName":"Dillingham","fullName":"Rob Dillingham","jerseyNum":"7","position":"G","height":"6-2"},{"personId":"1642530","firstName":"Yuki","familyName":"Kawamura","fullName":"Yuki Kawamura","jerseyNum":"8","position":"G","height":"5-7"},{"personId":"1631159","firstName":"Leonard","familyName":"Miller","fullName":"Leonard Miller","jerseyNum":"11","position":"F","height":"6-10"},{"personId":"1628380","firstName":"Zach","familyName":"Collins","fullName":"Zach Collins","jerseyNum":"12","position":"F-C","height":"6-9"},{"personId":"1630208","firstName":"Nick","familyName":"Richards","fullName":"Nick Richards","jerseyNum":"13","position":"C","height":"6-11"},{"personId":"1641824","firstName":"Matas","familyName":"Buzelis","fullName":"Matas Buzelis","jerseyNum":"14","position":"F","height":"6-8"},{"personId":"1631338","firstName":"Mouhamadou","familyName":"Gueye","fullName":"Mouhamadou Gueye","jerseyNum":"16","position":"F","height":"6-9"},{"personId":"1629014","firstName":"Anfernee","familyName":"Simons","fullName":"Anfernee Simons","jerseyNum":"22","position":"G","height":"6-3"},{"personId":"1642855","firstName":"Noa","familyName":"Essengue","fullName":"Noa Essengue","jerseyNum":"24","position":"F","height":"6-8"},{"personId":"1630188","firstName":"Jalen","familyName":"Smith","fullName":"Jalen Smith","jerseyNum":"25","position":"F-C","height":"6-8"},{"personId":"1627824","firstName":"Guerschon","familyName":"Yabusele","fullName":"Guerschon Yabusele","jerseyNum":"28","position":"F","height":"6-7"},{"personId":"1630200","firstName":"Tre","familyName":"Jones","fullName":"Tre Jones","jerseyNum":"30","position":"G","height":"6-1"},{"personId":"1630171","firstName":"Isaac","familyName":"Okoro","fullName":"Isaac Okoro","jerseyNum":"35","position":"F-G","height":"6-4"},{"personId":"1630172","firstName":"Patrick","familyName":"Williams","fullName":"Patrick Williams","jerseyNum":"44","position":"F","height":"6-6"},{"personId":"1642950","firstName":"Lachlan","familyName":"Olbrich","fullName":"Lachlan Olbrich","jerseyNum":"47","position":"C","height":"6-8"}],"1610612742":[{"personId":"1631108","firstName":"Max","familyName":"Christie","fullName":"Max Christie","jerseyNum":"00","position":"G","height":"6-5"},{"personId":"1641726","firstName":"Dereck","familyName":"Lively II","fullName":"Dereck Lively II","jerseyNum":"2","position":"C","height":"7-1"},{"personId":"203939","firstName":"Dwight","familyName":"Powell","fullName":"Dwight Powell","jerseyNum":"7","position":"F-C","height":"6-10"},{"personId":"1642358","firstName":"AJ","familyName":"Johnson","fullName":"AJ Johnson","jerseyNum":"8","position":"G","height":"6-5"},{"personId":"1642948","firstName":"Ryan","familyName":"Nembhard","fullName":"Ryan Nembhard","jerseyNum":"9","position":"G","height":"5-11"},{"personId":"1630314","firstName":"Brandon","familyName":"Williams","fullName":"Brandon Williams","jerseyNum":"10","position":"G","height":"6-1"},{"personId":"202681","firstName":"Kyrie","familyName":"Irving","fullName":"Kyrie Irving","jerseyNum":"11","position":"G","height":"6-2"},{"personId":"1630230","firstName":"Naji","familyName":"Marshall","fullName":"Naji Marshall","jerseyNum":"13","position":"F","height":"6-6"},{"personId":"1628997","firstName":"Caleb","familyName":"Martin","fullName":"Caleb Martin","jerseyNum":"16","position":"F","height":"6-5"},{"personId":"203114","firstName":"Khris","familyName":"Middleton","fullName":"Khris Middleton","jerseyNum":"20","position":"F","height":"6-7"},{"personId":"1629655","firstName":"Daniel","familyName":"Gafford","fullName":"Daniel Gafford","jerseyNum":"21","position":"F-C","height":"6-10"},{"personId":"1641890","firstName":"Tyler","familyName":"Smith","fullName":"Tyler Smith","jerseyNum":"21","position":"F","height":"6-9"},{"personId":"1629023","firstName":"P.J.","familyName":"Washington","fullName":"P.J. Washington","jerseyNum":"25","position":"F","height":"6-7"},{"personId":"1630619","firstName":"Moussa","familyName":"Cisse","fullName":"Moussa Cisse","jerseyNum":"30","position":"C","height":"6-11"},{"personId":"202691","firstName":"Klay","familyName":"Thompson","fullName":"Klay Thompson","jerseyNum":"31","position":"G","height":"6-5"},{"personId":"1642843","firstName":"Cooper","familyName":"Flagg","fullName":"Cooper Flagg","jerseyNum":"32","position":"F","height":"6-9"},{"personId":"1628963","firstName":"Marvin","familyName":"Bagley III","fullName":"Marvin Bagley III","jerseyNum":"35","position":"F","height":"6-10"},{"personId":"1642967","firstName":"John","familyName":"Poulakidas","fullName":"John Poulakidas","jerseyNum":"","position":"G","height":"6-6"}],"1610612743":[{"personId":"1631128","firstName":"Christian","familyName":"Braun","fullName":"Christian Braun","jerseyNum":"0","position":"G","height":"6-6"},{"personId":"1642938","firstName":"Curtis","familyName":"Jones","fullName":"Curtis Jones","jerseyNum":"1","position":"G","height":"6-3"},{"personId":"1631124","firstName":"Julian","familyName":"Strawther","fullName":"Julian Strawther","jerseyNum":"3","position":"G","height":"6-6"},{"personId":"1626145","firstName":"Tyus","familyName":"Jones","fullName":"Tyus Jones","jerseyNum":"5","position":"G","height":"6-0"},{"personId":"1631212","firstName":"Peyton","familyName":"Watson","fullName":"Peyton Watson","jerseyNum":"8","position":"G","height":"6-8"},{"personId":"203501","firstName":"Tim","familyName":"Hardaway Jr.","fullName":"Tim Hardaway Jr.","jerseyNum":"10","position":"G-F","height":"6-5"},{"personId":"1628971","firstName":"Bruce","familyName":"Brown","fullName":"Bruce Brown","jerseyNum":"11","position":"G-F","height":"6-4"},{"personId":"1641747","firstName":"DaRon","familyName":"Holmes II","fullName":"DaRon Holmes II","jerseyNum":"14","position":"F","height":"6-9"},{"personId":"203999","firstName":"Nikola","familyName":"Jokić","fullName":"Nikola Jokić","jerseyNum":"15","position":"C","height":"6-11"},{"personId":"202685","firstName":"Jonas","familyName":"Valančiūnas","fullName":"Jonas Valančiūnas","jerseyNum":"17","position":"C","height":"6-11"},{"personId":"1642461","firstName":"Spencer","familyName":"Jones","fullName":"Spencer Jones","jerseyNum":"21","position":"F","height":"6-7"},{"personId":"1630192","firstName":"Zeke","familyName":"Nnaji","fullName":"Zeke Nnaji","jerseyNum":"22","position":"F-C","height":"6-10"},{"personId":"1629661","firstName":"Cameron","familyName":"Johnson","fullName":"Cameron Johnson","jerseyNum":"23","position":"F","height":"6-8"},{"personId":"1629618","firstName":"Jalen","familyName":"Pickett","fullName":"Jalen Pickett","jerseyNum":"24","position":"G","height":"6-2"},{"personId":"1642354","firstName":"KJ","familyName":"Simpson","fullName":"KJ Simpson","jerseyNum":"25","position":"G","height":"6-2"},{"personId":"1627750","firstName":"Jamal","familyName":"Murray","fullName":"Jamal Murray","jerseyNum":"27","position":"G","height":"6-4"},{"personId":"203932","firstName":"Aaron","familyName":"Gordon","fullName":"Aaron Gordon","jerseyNum":"32","position":"F","height":"6-8"},{"personId":"1631223","firstName":"David","familyName":"Roddy","fullName":"David Roddy","jerseyNum":"45","position":"F","height":"6-5"}],"1610612744":[{"personId":"1627780","firstName":"Gary","familyName":"Payton II","fullName":"Gary Payton II","jerseyNum":"0","position":"G","height":"6-2"},{"personId":"1641764","firstName":"Brandin","familyName":"Podziemski","fullName":"Brandin Podziemski","jerseyNum":"2","position":"G","height":"6-4"},{"personId":"1642954","firstName":"Will","familyName":"Richard","fullName":"Will Richard","jerseyNum":"3","position":"G","height":"6-3"},{"personId":"1630541","firstName":"Moses","familyName":"Moody","fullName":"Moses Moody","jerseyNum":"4","position":"G","height":"6-5"},{"personId":"204001","firstName":"Kristaps","familyName":"Porziņģis","fullName":"Kristaps Porziņģis","jerseyNum":"7","position":"F-C","height":"7-2"},{"personId":"1629001","firstName":"De'Anthony","familyName":"Melton","fullName":"De'Anthony Melton","jerseyNum":"8","position":"G","height":"6-2"},{"personId":"202710","firstName":"Jimmy","familyName":"Butler III","fullName":"Jimmy Butler III","jerseyNum":"10","position":"F","height":"6-6"},{"personId":"1630611","firstName":"Gui","familyName":"Santos","fullName":"Gui Santos","jerseyNum":"15","position":"F","height":"6-7"},{"personId":"1643018","firstName":"LJ","familyName":"Cryer","fullName":"LJ Cryer","jerseyNum":"18","position":"G","height":"6-0"},{"personId":"1631466","firstName":"Nate","familyName":"Williams","fullName":"Nate Williams","jerseyNum":"19","position":"G","height":"6-5"},{"personId":"201143","firstName":"Al","familyName":"Horford","fullName":"Al Horford","jerseyNum":"20","position":"C-F","height":"6-8"},{"personId":"1642366","firstName":"Quinten","familyName":"Post","fullName":"Quinten Post","jerseyNum":"21","position":"C","height":"7-0"},{"personId":"203110","firstName":"Draymond","familyName":"Green","fullName":"Draymond Green","jerseyNum":"23","position":"F","height":"6-6"},{"personId":"1629646","firstName":"Charles","familyName":"Bassey","fullName":"Charles Bassey","jerseyNum":"28","position":"C-F","height":"6-10"},{"personId":"201939","firstName":"Stephen","familyName":"Curry","fullName":"Stephen Curry","jerseyNum":"30","position":"G","height":"6-2"},{"personId":"203552","firstName":"Seth","familyName":"Curry","fullName":"Seth Curry","jerseyNum":"31","position":"G","height":"6-1"},{"personId":"1642502","firstName":"Malevy","familyName":"Leons","fullName":"Malevy Leons","jerseyNum":"33","position":"F","height":"6-9"},{"personId":"1630311","firstName":"Pat","familyName":"Spencer","fullName":"Pat Spencer","jerseyNum":"61","position":"G","height":"6-2"}],"1610612745":[{"personId":"1628988","firstName":"Aaron","familyName":"Holiday","fullName":"Aaron Holiday","jerseyNum":"0","position":"G","height":"6-0"},{"personId":"1641708","firstName":"Amen","familyName":"Thompson","fullName":"Amen Thompson","jerseyNum":"1","position":"G-F","height":"6-7"},{"personId":"1627827","firstName":"Dorian","familyName":"Finney-Smith","fullName":"Dorian Finney-Smith","jerseyNum":"2","position":"F","height":"6-7"},{"personId":"1631120","firstName":"JD","familyName":"Davison","fullName":"JD Davison","jerseyNum":"4","position":"G","height":"6-1"},{"personId":"1627832","firstName":"Fred","familyName":"VanVleet","fullName":"Fred VanVleet","jerseyNum":"5","position":"G","height":"6-0"},{"personId":"201142","firstName":"Kevin","familyName":"Durant","fullName":"Kevin Durant","jerseyNum":"7","position":"F","height":"6-11"},{"personId":"1630256","firstName":"Jae'Sean","familyName":"Tate","fullName":"Jae'Sean Tate","jerseyNum":"8","position":"F","height":"6-4"},{"personId":"1631095","firstName":"Jabari","familyName":"Smith Jr.","fullName":"Jabari Smith Jr.","jerseyNum":"10","position":"F","height":"6-11"},{"personId":"203500","firstName":"Steven","familyName":"Adams","fullName":"Steven Adams","jerseyNum":"12","position":"C","height":"6-11"},{"personId":"1641803","firstName":"Tristen","familyName":"Newton","fullName":"Tristen Newton","jerseyNum":"13","position":"G","height":"6-5"},{"personId":"1642263","firstName":"Reed","familyName":"Sheppard","fullName":"Reed Sheppard","jerseyNum":"15","position":"G","height":"6-2"},{"personId":"1631106","firstName":"Tari","familyName":"Eason","fullName":"Tari Eason","jerseyNum":"17","position":"F","height":"6-8"},{"personId":"1629006","firstName":"Josh","familyName":"Okogie","fullName":"Josh Okogie","jerseyNum":"20","position":"G","height":"6-4"},{"personId":"1642384","firstName":"Isaiah","familyName":"Crawford","fullName":"Isaiah Crawford","jerseyNum":"27","position":"F","height":"6-6"},{"personId":"1630578","firstName":"Alperen","familyName":"Sengun","fullName":"Alperen Sengun","jerseyNum":"28","position":"C","height":"6-11"},{"personId":"203991","firstName":"Clint","familyName":"Capela","fullName":"Clint Capela","jerseyNum":"30","position":"C","height":"6-10"},{"personId":"201145","firstName":"Jeff","familyName":"Green","fullName":"Jeff Green","jerseyNum":"32","position":"F","height":"6-8"}],"1610612746":[{"personId":"203078","firstName":"Bradley","familyName":"Beal","fullName":"Bradley Beal","jerseyNum":"0","position":"G","height":"6-4"},{"personId":"202695","firstName":"Kawhi","familyName":"Leonard","fullName":"Kawhi Leonard","jerseyNum":"2","position":"F","height":"6-6"},{"personId":"1642920","firstName":"Kobe","familyName":"Sanders","fullName":"Kobe Sanders","jerseyNum":"4","position":"G","height":"6-8"},{"personId":"1627884","firstName":"Derrick","familyName":"Jones Jr.","fullName":"Derrick Jones Jr.","jerseyNum":"5","position":"F","height":"6-6"},{"personId":"203992","firstName":"Bogdan","familyName":"Bogdanović","fullName":"Bogdan Bogdanović","jerseyNum":"7","position":"G","height":"6-5"},{"personId":"1627739","firstName":"Kris","familyName":"Dunn","fullName":"Kris Dunn","jerseyNum":"8","position":"G","height":"6-3"},{"personId":"1631097","firstName":"Bennedict","familyName":"Mathurin","fullName":"Bennedict Mathurin","jerseyNum":"9","position":"G-F","height":"6-5"},{"personId":"1629636","firstName":"Darius","familyName":"Garland","fullName":"Darius Garland","jerseyNum":"10","position":"G","height":"6-1"},{"personId":"201572","firstName":"Brook","familyName":"Lopez","fullName":"Brook Lopez","jerseyNum":"11","position":"C","height":"7-1"},{"personId":"1642353","firstName":"Cam","familyName":"Christie","fullName":"Cam Christie","jerseyNum":"12","position":"G","height":"6-5"},{"personId":"1631102","firstName":"TyTy","familyName":"Washington Jr.","fullName":"TyTy Washington Jr.","jerseyNum":"14","position":"G","height":"6-3"},{"personId":"1642949","firstName":"Yanic Konan","familyName":"Niederhäuser","fullName":"Yanic Konan Niederhäuser","jerseyNum":"14","position":"C","height":"6-11"},{"personId":"1628381","firstName":"John","familyName":"Collins","fullName":"John Collins","jerseyNum":"20","position":"F-C","height":"6-9"},{"personId":"1641757","firstName":"Jordan","familyName":"Miller","fullName":"Jordan Miller","jerseyNum":"22","position":"G","height":"6-5"},{"personId":"1630543","firstName":"Isaiah","familyName":"Jackson","fullName":"Isaiah Jackson","jerseyNum":"23","position":"F","height":"6-8"},{"personId":"201587","firstName":"Nicolas","familyName":"Batum","fullName":"Nicolas Batum","jerseyNum":"33","position":"G-F","height":"6-7"},{"personId":"1641807","firstName":"Norchad","familyName":"Omier","fullName":"Norchad Omier","jerseyNum":"","position":"F","height":"6-7"},{"personId":"1642951","firstName":"Sean","familyName":"Pedulla","fullName":"Sean Pedulla","jerseyNum":"","position":"G","height":"6-1"}],"1610612747":[{"personId":"1642876","firstName":"Adou","familyName":"Thiero","fullName":"Adou Thiero","jerseyNum":"1","position":"G","height":"6-7"},{"personId":"1629020","firstName":"Jarred","familyName":"Vanderbilt","fullName":"Jarred Vanderbilt","jerseyNum":"2","position":"F","height":"6-8"},{"personId":"1642261","firstName":"Dalton","familyName":"Knecht","fullName":"Dalton Knecht","jerseyNum":"4","position":"F","height":"6-6"},{"personId":"1629028","firstName":"Deandre","familyName":"Ayton","fullName":"Deandre Ayton","jerseyNum":"5","position":"C","height":"7-0"},{"personId":"1642355","firstName":"Bronny","familyName":"James","fullName":"Bronny James","jerseyNum":"9","position":"G","height":"6-2"},{"personId":"1628379","firstName":"Luke","familyName":"Kennard","fullName":"Luke Kennard","jerseyNum":"10","position":"G","height":"6-5"},{"personId":"1629637","firstName":"Jaxson","familyName":"Hayes","fullName":"Jaxson Hayes","jerseyNum":"11","position":"C-F","height":"7-0"},{"personId":"1631222","firstName":"Jake","familyName":"LaRavia","fullName":"Jake LaRavia","jerseyNum":"12","position":"F","height":"6-7"},{"personId":"1628467","firstName":"Maxi","familyName":"Kleber","fullName":"Maxi Kleber","jerseyNum":"14","position":"F","height":"6-10"},{"personId":"1630559","firstName":"Austin","familyName":"Reaves","fullName":"Austin Reaves","jerseyNum":"15","position":"G","height":"6-5"},{"personId":"1631166","firstName":"Drew","familyName":"Timme","fullName":"Drew Timme","jerseyNum":"17","position":"F","height":"6-9"},{"personId":"1641733","firstName":"Nick","familyName":"Smith Jr.","fullName":"Nick Smith Jr.","jerseyNum":"20","position":"G","height":"6-2"},{"personId":"2544","firstName":"LeBron","familyName":"James","fullName":"LeBron James","jerseyNum":"23","position":"F","height":"6-9"},{"personId":"1629060","firstName":"Rui","familyName":"Hachimura","fullName":"Rui Hachimura","jerseyNum":"28","position":"F","height":"6-8"},{"personId":"1643024","firstName":"Chris","familyName":"Mañon","fullName":"Chris Mañon","jerseyNum":"30","position":"G","height":"6-4"},{"personId":"203935","firstName":"Marcus","familyName":"Smart","fullName":"Marcus Smart","jerseyNum":"36","position":"G","height":"6-3"},{"personId":"1629029","firstName":"Luka","familyName":"Dončić","fullName":"Luka Dončić","jerseyNum":"77","position":"F-G","height":"6-8"}],"1610612748":[{"personId":"1631323","firstName":"Simone","familyName":"Fontecchio","fullName":"Simone Fontecchio","jerseyNum":"0","position":"F","height":"6-7"},{"personId":"1631211","firstName":"Trevor","familyName":"Keels","fullName":"Trevor Keels","jerseyNum":"3","position":"G","height":"6-3"},{"personId":"1631107","firstName":"Nikola","familyName":"Jović","fullName":"Nikola Jović","jerseyNum":"5","position":"F","height":"6-10"},{"personId":"1642276","firstName":"Kel'el","familyName":"Ware","fullName":"Kel'el Ware","jerseyNum":"7","position":"C","height":"7-0"},{"personId":"1641796","firstName":"Pelle","familyName":"Larsson","fullName":"Pelle Larsson","jerseyNum":"9","position":"G","height":"6-5"},{"personId":"1631170","firstName":"Jaime","familyName":"Jaquez Jr.","fullName":"Jaime Jaquez Jr.","jerseyNum":"11","position":"G","height":"6-6"},{"personId":"1630696","firstName":"Dru","familyName":"Smith","fullName":"Dru Smith","jerseyNum":"12","position":"G","height":"6-2"},{"personId":"1628389","firstName":"Bam","familyName":"Adebayo","fullName":"Bam Adebayo","jerseyNum":"13","position":"C-F","height":"6-9"},{"personId":"1629639","firstName":"Tyler","familyName":"Herro","fullName":"Tyler Herro","jerseyNum":"14","position":"G","height":"6-5"},{"personId":"1642066","firstName":"Myron","familyName":"Gardner","fullName":"Myron Gardner","jerseyNum":"15","position":"F","height":"6-5"},{"personId":"1642352","firstName":"Keshad","familyName":"Johnson","fullName":"Keshad Johnson","jerseyNum":"16","position":"F","height":"6-6"},{"personId":"1642443","firstName":"Jahmir","familyName":"Young","fullName":"Jahmir Young","jerseyNum":"17","position":"G","height":"6-0"},{"personId":"203952","firstName":"Andrew","familyName":"Wiggins","fullName":"Andrew Wiggins","jerseyNum":"22","position":"F","height":"6-6"},{"personId":"1626181","firstName":"Norman","familyName":"Powell","fullName":"Norman Powell","jerseyNum":"24","position":"G","height":"6-3"},{"personId":"1642857","firstName":"Kasparas","familyName":"Jakučionis","fullName":"Kasparas Jakučionis","jerseyNum":"25","position":"G","height":"6-5"},{"personId":"1630558","firstName":"Davion","familyName":"Mitchell","fullName":"Davion Mitchell","jerseyNum":"45","position":"G","height":"6-0"},{"personId":"1642884","firstName":"Vladislav","familyName":"Goldin","fullName":"Vladislav Goldin","jerseyNum":"50","position":"C","height":"7-0"}],"1610612749":[{"personId":"1630579","firstName":"Jericho","familyName":"Sims","fullName":"Jericho Sims","jerseyNum":"00","position":"C","height":"6-10"},{"personId":"1626167","firstName":"Myles","familyName":"Turner","fullName":"Myles Turner","jerseyNum":"3","position":"C-F","height":"6-11"},{"personId":"1629018","firstName":"Gary","familyName":"Trent Jr.","fullName":"Gary Trent Jr.","jerseyNum":"5","position":"G","height":"6-5"},{"personId":"1629645","firstName":"Kevin","familyName":"Porter Jr.","fullName":"Kevin Porter Jr.","jerseyNum":"7","position":"G-F","height":"6-5"},{"personId":"1626171","firstName":"Bobby","familyName":"Portis","fullName":"Bobby Portis","jerseyNum":"9","position":"F","height":"6-9"},{"personId":"203914","firstName":"Gary","familyName":"Harris","fullName":"Gary Harris","jerseyNum":"11","position":"G","height":"6-4"},{"personId":"1627752","firstName":"Taurean","familyName":"Prince","fullName":"Taurean Prince","jerseyNum":"12","position":"F","height":"6-6"},{"personId":"1631157","firstName":"Ryan","familyName":"Rollins","fullName":"Ryan Rollins","jerseyNum":"13","position":"G","height":"6-3"},{"personId":"1628398","firstName":"Kyle","familyName":"Kuzma","fullName":"Kyle Kuzma","jerseyNum":"18","position":"F","height":"6-8"},{"personId":"1631260","firstName":"AJ","familyName":"Green","fullName":"AJ Green","jerseyNum":"20","position":"G","height":"6-4"},{"personId":"1631172","firstName":"Ousmane","familyName":"Dieng","fullName":"Ousmane Dieng","jerseyNum":"21","position":"F","height":"6-9"},{"personId":"1630828","firstName":"Alex","familyName":"Antetokounmpo","fullName":"Alex Antetokounmpo","jerseyNum":"29","position":"F","height":"6-8"},{"personId":"1642504","firstName":"Cormac","familyName":"Ryan","fullName":"Cormac Ryan","jerseyNum":"30","position":"G","height":"6-5"},{"personId":"203507","firstName":"Giannis","familyName":"Antetokounmpo","fullName":"Giannis Antetokounmpo","jerseyNum":"34","position":"F","height":"6-11"},{"personId":"1631250","firstName":"Pete","familyName":"Nance","fullName":"Pete Nance","jerseyNum":"35","position":"F","height":"6-9"},{"personId":"203648","firstName":"Thanasis","familyName":"Antetokounmpo","fullName":"Thanasis Antetokounmpo","jerseyNum":"43","position":"F","height":"6-7"},{"personId":"1641748","firstName":"Andre","familyName":"Jackson Jr.","fullName":"Andre Jackson Jr.","jerseyNum":"44","position":"G","height":"6-6"}],"1610612750":[{"personId":"1628978","firstName":"Donte","familyName":"DiVincenzo","fullName":"Donte DiVincenzo","jerseyNum":"0","position":"G","height":"6-4"},{"personId":"1630545","firstName":"Terrence","familyName":"Shannon Jr.","fullName":"Terrence Shannon Jr.","jerseyNum":"1","position":"G-F","height":"6-6"},{"personId":"1630183","firstName":"Jaden","familyName":"McDaniels","fullName":"Jaden McDaniels","jerseyNum":"3","position":"F","height":"6-9"},{"personId":"1641763","firstName":"Julian","familyName":"Phillips","fullName":"Julian Phillips","jerseyNum":"4","position":"F","height":"6-6"},{"personId":"1630162","firstName":"Anthony","familyName":"Edwards","fullName":"Anthony Edwards","jerseyNum":"5","position":"G","height":"6-4"},{"personId":"204060","firstName":"Joe","familyName":"Ingles","fullName":"Joe Ingles","jerseyNum":"7","position":"F-G","height":"6-8"},{"personId":"1630538","firstName":"Bones","familyName":"Hyland","fullName":"Bones Hyland","jerseyNum":"8","position":"G","height":"6-2"},{"personId":"201144","firstName":"Mike","familyName":"Conley","fullName":"Mike Conley","jerseyNum":"10","position":"G","height":"6-1"},{"personId":"1629675","firstName":"Naz","familyName":"Reid","fullName":"Naz Reid","jerseyNum":"11","position":"C-F","height":"6-9"},{"personId":"203937","firstName":"Kyle","familyName":"Anderson","fullName":"Kyle Anderson","jerseyNum":"12","position":"F-G","height":"6-8"},{"personId":"1630245","firstName":"Ayo","familyName":"Dosunmu","fullName":"Ayo Dosunmu","jerseyNum":"13","position":"G","height":"6-4"},{"personId":"1642389","firstName":"Zyon","familyName":"Pullin","fullName":"Zyon Pullin","jerseyNum":"15","position":"G","height":"6-4"},{"personId":"1642866","firstName":"Joan","familyName":"Beringer","fullName":"Joan Beringer","jerseyNum":"19","position":"F","height":"6-11"},{"personId":"1641740","firstName":"Jaylen","familyName":"Clark","fullName":"Jaylen Clark","jerseyNum":"22","position":"G","height":"6-5"},{"personId":"1642402","firstName":"Enrique","familyName":"Freeman","fullName":"Enrique Freeman","jerseyNum":"25","position":"F","height":"6-9"},{"personId":"203497","firstName":"Rudy","familyName":"Gobert","fullName":"Rudy Gobert","jerseyNum":"27","position":"C","height":"7-1"},{"personId":"203944","firstName":"Julius","familyName":"Randle","fullName":"Julius Randle","jerseyNum":"30","position":"F-C","height":"6-9"},{"personId":"1642911","firstName":"Rocco","familyName":"Zikarsky","fullName":"Rocco Zikarsky","jerseyNum":"44","position":"C","height":"7-3"}],"1610612751":[{"personId":"1631169","firstName":"Josh","familyName":"Minott","fullName":"Josh Minott","jerseyNum":"00","position":"F","height":"6-8"},{"personId":"1630533","firstName":"Ziaire","familyName":"Williams","fullName":"Ziaire Williams","jerseyNum":"1","position":"F","height":"6-9"},{"personId":"1642874","firstName":"Danny","familyName":"Wolf","fullName":"Danny Wolf","jerseyNum":"2","position":"F","height":"6-11"},{"personId":"1642962","firstName":"Drake","familyName":"Powell","fullName":"Drake Powell","jerseyNum":"4","position":"G-F","height":"6-5"},{"personId":"1642856","firstName":"Egor","familyName":"Dëmin","fullName":"Egor Dëmin","jerseyNum":"8","position":"G","height":"6-8"},{"personId":"1630604","firstName":"E.J.","familyName":"Liddell","fullName":"E.J. Liddell","jerseyNum":"9","position":"F","height":"6-6"},{"personId":"1630623","firstName":"Tyson","familyName":"Etienne","fullName":"Tyson Etienne","jerseyNum":"10","position":"G","height":"6-0"},{"personId":"1629611","firstName":"Terance","familyName":"Mann","fullName":"Terance Mann","jerseyNum":"14","position":"G-F","height":"6-6"},{"personId":"1629008","firstName":"Michael","familyName":"Porter Jr.","fullName":"Michael Porter Jr.","jerseyNum":"17","position":"F","height":"6-10"},{"personId":"1641869","firstName":"Malachi","familyName":"Smith","fullName":"Malachi Smith","jerseyNum":"18","position":"G","height":"6-4"},{"personId":"1630549","firstName":"Day'Ron","familyName":"Sharpe","fullName":"Day'Ron Sharpe","jerseyNum":"20","position":"C","height":"6-10"},{"personId":"1641730","firstName":"Noah","familyName":"Clowney","fullName":"Noah Clowney","jerseyNum":"21","position":"F-C","height":"6-10"},{"personId":"1630592","firstName":"Jalen","familyName":"Wilson","fullName":"Jalen Wilson","jerseyNum":"22","position":"F","height":"6-6"},{"personId":"1630534","firstName":"Ochai","familyName":"Agbaji","fullName":"Ochai Agbaji","jerseyNum":"30","position":"G","height":"6-5"},{"personId":"1643052","firstName":"Chaney","familyName":"Johnson","fullName":"Chaney Johnson","jerseyNum":"31","position":"G-F","height":"6-7"},{"personId":"1629651","firstName":"Nic","familyName":"Claxton","fullName":"Nic Claxton","jerseyNum":"33","position":"C","height":"6-11"},{"personId":"1642879","firstName":"Ben","familyName":"Saraf","fullName":"Ben Saraf","jerseyNum":"77","position":"G","height":"6-6"},{"personId":"1642849","firstName":"Nolan","familyName":"Traore","fullName":"Nolan Traore","jerseyNum":"88","position":"G","height":"6-3"}],"1610612752":[{"personId":"203903","firstName":"Jordan","familyName":"Clarkson","fullName":"Jordan Clarkson","jerseyNum":"00","position":"G","height":"6-5"},{"personId":"1630540","firstName":"Miles","familyName":"McBride","fullName":"Miles McBride","jerseyNum":"2","position":"G","height":"6-2"},{"personId":"1628404","firstName":"Josh","familyName":"Hart","fullName":"Josh Hart","jerseyNum":"3","position":"G","height":"6-5"},{"personId":"1642359","firstName":"Pacôme","familyName":"Dadiet","fullName":"Pacôme Dadiet","jerseyNum":"4","position":"F","height":"6-9"},{"personId":"1630631","firstName":"Jose","familyName":"Alvarado","fullName":"Jose Alvarado","jerseyNum":"5","position":"G","height":"6-0"},{"personId":"1628384","firstName":"OG","familyName":"Anunoby","fullName":"OG Anunoby","jerseyNum":"8","position":"F-G","height":"6-7"},{"personId":"1641755","firstName":"Kevin","familyName":"McCullar Jr.","fullName":"Kevin McCullar Jr.","jerseyNum":"9","position":"G","height":"6-6"},{"personId":"1628973","firstName":"Jalen","familyName":"Brunson","fullName":"Jalen Brunson","jerseyNum":"11","position":"G","height":"6-2"},{"personId":"1642278","firstName":"Tyler","familyName":"Kolek","fullName":"Tyler Kolek","jerseyNum":"13","position":"G","height":"6-2"},{"personId":"1631110","firstName":"Jeremy","familyName":"Sochan","fullName":"Jeremy Sochan","jerseyNum":"20","position":"F","height":"6-8"},{"personId":"1629011","firstName":"Mitchell","familyName":"Robinson","fullName":"Mitchell Robinson","jerseyNum":"23","position":"C-F","height":"7-0"},{"personId":"1628969","firstName":"Mikal","familyName":"Bridges","fullName":"Mikal Bridges","jerseyNum":"25","position":"G-F","height":"6-6"},{"personId":"1626157","firstName":"Karl-Anthony","familyName":"Towns","fullName":"Karl-Anthony Towns","jerseyNum":"32","position":"C-F","height":"7-0"},{"personId":"1641794","firstName":"Dillon","familyName":"Jones","fullName":"Dillon Jones","jerseyNum":"33","position":"F","height":"6-5"},{"personId":"1629013","firstName":"Landry","familyName":"Shamet","fullName":"Landry Shamet","jerseyNum":"44","position":"G","height":"6-5"},{"personId":"1641998","firstName":"Trey","familyName":"Jemison III","fullName":"Trey Jemison III","jerseyNum":"50","position":"C","height":"6-10"},{"personId":"1642885","firstName":"Mohamed","familyName":"Diawara","fullName":"Mohamed Diawara","jerseyNum":"51","position":"F","height":"6-9"},{"personId":"1630574","firstName":"Ariel","familyName":"Hukporti","fullName":"Ariel Hukporti","jerseyNum":"55","position":"C","height":"7-0"}],"1610612753":[{"personId":"1641710","firstName":"Anthony","familyName":"Black","fullName":"Anthony Black","jerseyNum":"0","position":"G","height":"6-7"},{"personId":"1628371","firstName":"Jonathan","familyName":"Isaac","fullName":"Jonathan Isaac","jerseyNum":"1","position":"F","height":"6-10"},{"personId":"1628975","firstName":"Jevon","familyName":"Carter","fullName":"Jevon Carter","jerseyNum":"2","position":"G","height":"6-0"},{"personId":"1630217","firstName":"Desmond","familyName":"Bane","fullName":"Desmond Bane","jerseyNum":"3","position":"G","height":"6-6"},{"personId":"1630591","firstName":"Jalen","familyName":"Suggs","fullName":"Jalen Suggs","jerseyNum":"4","position":"G","height":"6-5"},{"personId":"1631094","firstName":"Paolo","familyName":"Banchero","fullName":"Paolo Banchero","jerseyNum":"5","position":"F","height":"6-10"},{"personId":"1631288","firstName":"Jamal","familyName":"Cain","fullName":"Jamal Cain","jerseyNum":"8","position":"F","height":"6-7"},{"personId":"1642859","firstName":"Jase","familyName":"Richardson","fullName":"Jase Richardson","jerseyNum":"11","position":"G","height":"6-1"},{"personId":"1641724","firstName":"Jett","familyName":"Howard","fullName":"Jett Howard","jerseyNum":"13","position":"G","height":"6-8"},{"personId":"1630658","firstName":"Colin","familyName":"Castleton","fullName":"Colin Castleton","jerseyNum":"14","position":"C","height":"6-10"},{"personId":"1629021","firstName":"Moritz","familyName":"Wagner","fullName":"Moritz Wagner","jerseyNum":"21","position":"F-C","height":"6-11"},{"personId":"1630532","firstName":"Franz","familyName":"Wagner","fullName":"Franz Wagner","jerseyNum":"22","position":"F","height":"6-10"},{"personId":"1641783","firstName":"Tristan","familyName":"da Silva","fullName":"Tristan da Silva","jerseyNum":"23","position":"F","height":"6-8"},{"personId":"1628976","firstName":"Wendell","familyName":"Carter Jr.","fullName":"Wendell Carter Jr.","jerseyNum":"34","position":"C-F","height":"6-10"},{"personId":"1629048","firstName":"Goga","familyName":"Bitadze","fullName":"Goga Bitadze","jerseyNum":"35","position":"C-F","height":"6-11"},{"personId":"1642869","firstName":"Noah","familyName":"Penda","fullName":"Noah Penda","jerseyNum":"93","position":"G-F","height":"6-7"},{"personId":"1631457","firstName":"Alex","familyName":"Morales","fullName":"Alex Morales","jerseyNum":"","position":"G","height":"6-6"}],"1610612754":[{"personId":"1630169","firstName":"Tyrese","familyName":"Haliburton","fullName":"Tyrese Haliburton","jerseyNum":"0","position":"G","height":"6-5"},{"personId":"1630167","firstName":"Obi","familyName":"Toppin","fullName":"Obi Toppin","jerseyNum":"1","position":"F","height":"6-9"},{"personId":"1629614","firstName":"Andrew","familyName":"Nembhard","fullName":"Andrew Nembhard","jerseyNum":"2","position":"G-F","height":"6-4"},{"personId":"1643007","firstName":"Taelon","familyName":"Peter","fullName":"Taelon Peter","jerseyNum":"4","position":"G","height":"6-3"},{"personId":"1641716","firstName":"Jarace","familyName":"Walker","fullName":"Jarace Walker","jerseyNum":"5","position":"F","height":"6-7"},{"personId":"1642880","firstName":"Kam","familyName":"Jones","fullName":"Kam Jones","jerseyNum":"7","position":"G","height":"6-4"},{"personId":"204456","firstName":"T.J.","familyName":"McConnell","fullName":"T.J. McConnell","jerseyNum":"9","position":"G","height":"6-1"},{"personId":"1630695","firstName":"Micah","familyName":"Potter","fullName":"Micah Potter","jerseyNum":"11","position":"C","height":"6-9"},{"personId":"1642277","firstName":"Johnny","familyName":"Furphy","fullName":"Johnny Furphy","jerseyNum":"12","position":"G","height":"6-8"},{"personId":"1641771","firstName":"Jalen","familyName":"Slawson","fullName":"Jalen Slawson","jerseyNum":"18","position":"F","height":"6-7"},{"personId":"1630174","firstName":"Aaron","familyName":"Nesmith","fullName":"Aaron Nesmith","jerseyNum":"23","position":"G-F","height":"6-5"},{"personId":"1641738","firstName":"Kobe","familyName":"Brown","fullName":"Kobe Brown","jerseyNum":"24","position":"F","height":"6-7"},{"personId":"1641767","firstName":"Ben","familyName":"Sheppard","fullName":"Ben Sheppard","jerseyNum":"26","position":"G","height":"6-6"},{"personId":"1631245","firstName":"Quenton","familyName":"Jackson","fullName":"Quenton Jackson","jerseyNum":"29","position":"G","height":"6-4"},{"personId":"1630643","firstName":"Jay","familyName":"Huff","fullName":"Jay Huff","jerseyNum":"32","position":"C","height":"7-1"},{"personId":"1627826","firstName":"Ivica","familyName":"Zubac","fullName":"Ivica Zubac","jerseyNum":"40","position":"C","height":"7-0"},{"personId":"1627783","firstName":"Pascal","familyName":"Siakam","fullName":"Pascal Siakam","jerseyNum":"43","position":"F","height":"6-8"},{"personId":"1630679","firstName":"Ethan","familyName":"Thompson","fullName":"Ethan Thompson","jerseyNum":"55","position":"G","height":"6-4"}],"1610612755":[{"personId":"1630178","firstName":"Tyrese","familyName":"Maxey","fullName":"Tyrese Maxey","jerseyNum":"0","position":"G","height":"6-2"},{"personId":"203083","firstName":"Andre","familyName":"Drummond","fullName":"Andre Drummond","jerseyNum":"1","position":"C","height":"6-11"},{"personId":"1629656","firstName":"Quentin","familyName":"Grimes","fullName":"Quentin Grimes","jerseyNum":"5","position":"G","height":"6-5"},{"personId":"200768","firstName":"Kyle","familyName":"Lowry","fullName":"Kyle Lowry","jerseyNum":"7","position":"G","height":"6-0"},{"personId":"202331","firstName":"Paul","familyName":"George","fullName":"Paul George","jerseyNum":"8","position":"F","height":"6-8"},{"personId":"1626162","firstName":"Kelly","familyName":"Oubre Jr.","fullName":"Kelly Oubre Jr.","jerseyNum":"9","position":"F-G","height":"6-8"},{"personId":"1642348","firstName":"Justin","familyName":"Edwards","fullName":"Justin Edwards","jerseyNum":"11","position":"F","height":"6-7"},{"personId":"1630570","firstName":"Trendon","familyName":"Watford","fullName":"Trendon Watford","jerseyNum":"12","position":"G-F","height":"6-8"},{"personId":"1631207","firstName":"Dalen","familyName":"Terry","fullName":"Dalen Terry","jerseyNum":"14","position":"F","height":"6-6"},{"personId":"1630699","firstName":"MarJon","familyName":"Beauchamp","fullName":"MarJon Beauchamp","jerseyNum":"16","position":"F","height":"6-7"},{"personId":"203954","firstName":"Joel","familyName":"Embiid","fullName":"Joel Embiid","jerseyNum":"21","position":"C-F","height":"7-0"},{"personId":"1641780","firstName":"Johni","familyName":"Broome","fullName":"Johni Broome","jerseyNum":"22","position":"F","height":"6-9"},{"personId":"1631213","firstName":"Tyrese","familyName":"Martin","fullName":"Tyrese Martin","jerseyNum":"23","position":"F","height":"6-6"},{"personId":"1631230","firstName":"Dominick","familyName":"Barlow","fullName":"Dominick Barlow","jerseyNum":"25","position":"F","height":"6-9"},{"personId":"1641737","firstName":"Adem","familyName":"Bona","fullName":"Adem Bona","jerseyNum":"30","position":"F","height":"6-10"},{"personId":"1631133","firstName":"Jabari","familyName":"Walker","fullName":"Jabari Walker","jerseyNum":"33","position":"F","height":"6-7"},{"personId":"1642845","firstName":"VJ","familyName":"Edgecombe","fullName":"VJ Edgecombe","jerseyNum":"77","position":"G","height":"6-4"}],"1610612756":[{"personId":"1626220","firstName":"Royce","familyName":"O'Neale","fullName":"Royce O'Neale","jerseyNum":"00","position":"F","height":"6-6"},{"personId":"1642346","firstName":"Ryan","familyName":"Dunn","fullName":"Ryan Dunn","jerseyNum":"0","position":"F","height":"6-7"},{"personId":"1626164","firstName":"Devin","familyName":"Booker","fullName":"Devin Booker","jerseyNum":"1","position":"G","height":"6-5"},{"personId":"1629599","firstName":"Amir","familyName":"Coffey","fullName":"Amir Coffey","jerseyNum":"2","position":"G-F","height":"6-7"},{"personId":"1628415","firstName":"Dillon","familyName":"Brooks","fullName":"Dillon Brooks","jerseyNum":"3","position":"G-F","height":"6-7"},{"personId":"1630224","firstName":"Jalen","familyName":"Green","fullName":"Jalen Green","jerseyNum":"4","position":"G","height":"6-4"},{"personId":"1629312","firstName":"Haywood","familyName":"Highsmith","fullName":"Haywood Highsmith","jerseyNum":"7","position":"F","height":"6-5"},{"personId":"1628960","firstName":"Grayson","familyName":"Allen","fullName":"Grayson Allen","jerseyNum":"8","position":"G","height":"6-3"},{"personId":"1642863","firstName":"Khaman","familyName":"Maluach","fullName":"Khaman Maluach","jerseyNum":"10","position":"C","height":"7-1"},{"personId":"1642345","firstName":"Oso","familyName":"Ighodaro","fullName":"Oso Ighodaro","jerseyNum":"11","position":"F","height":"6-11"},{"personId":"1631221","firstName":"Collin","familyName":"Gillespie","fullName":"Collin Gillespie","jerseyNum":"12","position":"G","height":"6-1"},{"personId":"1642886","firstName":"Koby","familyName":"Brea","fullName":"Koby Brea","jerseyNum":"14","position":"G","height":"6-5"},{"personId":"1631109","firstName":"Mark","familyName":"Williams","fullName":"Mark Williams","jerseyNum":"15","position":"C","height":"7-1"},{"personId":"1631123","firstName":"Jamaree","familyName":"Bouyea","fullName":"Jamaree Bouyea","jerseyNum":"17","position":"G","height":"6-2"},{"personId":"1630587","firstName":"Isaiah","familyName":"Livers","fullName":"Isaiah Livers","jerseyNum":"18","position":"F","height":"6-6"},{"personId":"1642853","firstName":"Rasheer","familyName":"Fleming","fullName":"Rasheer Fleming","jerseyNum":"20","position":"F","height":"6-9"},{"personId":"1643047","firstName":"CJ","familyName":"Huntley","fullName":"CJ Huntley","jerseyNum":"22","position":"F","height":"6-11"},{"personId":"1630692","firstName":"Jordan","familyName":"Goodwin","fullName":"Jordan Goodwin","jerseyNum":"23","position":"G","height":"6-3"}],"1610612757":[{"personId":"203081","firstName":"Damian","familyName":"Lillard","fullName":"Damian Lillard","jerseyNum":"0","position":"G","height":"6-2"},{"personId":"1630703","firstName":"Scoot","familyName":"Henderson","fullName":"Scoot Henderson","jerseyNum":"00","position":"G","height":"6-3"},{"personId":"1631104","firstName":"Blake","familyName":"Wesley","fullName":"Blake Wesley","jerseyNum":"1","position":"G","height":"6-4"},{"personId":"1631126","firstName":"Caleb","familyName":"Love","fullName":"Caleb Love","jerseyNum":"2","position":"G","height":"6-3"},{"personId":"1642959","firstName":"Chris","familyName":"Youngblood","fullName":"Chris Youngblood","jerseyNum":"3","position":"G","height":"6-4"},{"personId":"1629680","firstName":"Matisse","familyName":"Thybulle","fullName":"Matisse Thybulle","jerseyNum":"4","position":"G-F","height":"6-5"},{"personId":"201950","firstName":"Jrue","familyName":"Holiday","fullName":"Jrue Holiday","jerseyNum":"5","position":"G","height":"6-4"},{"personId":"1630166","firstName":"Deni","familyName":"Avdija","fullName":"Deni Avdija","jerseyNum":"8","position":"F","height":"6-8"},{"personId":"203924","firstName":"Jerami","familyName":"Grant","fullName":"Jerami Grant","jerseyNum":"9","position":"F","height":"6-7"},{"personId":"1642905","firstName":"Yang","familyName":"Hansen","fullName":"Yang Hansen","jerseyNum":"16","position":"C","height":"7-1"},{"personId":"1631101","firstName":"Shaedon","familyName":"Sharpe","fullName":"Shaedon Sharpe","jerseyNum":"17","position":"G","height":"6-5"},{"personId":"1642270","firstName":"Donovan","familyName":"Clingan","fullName":"Donovan Clingan","jerseyNum":"23","position":"C","height":"7-2"},{"personId":"1631200","firstName":"Kris","familyName":"Murray","fullName":"Kris Murray","jerseyNum":"24","position":"F","height":"6-8"},{"personId":"1630249","firstName":"Vít","familyName":"Krejčí","fullName":"Vít Krejčí","jerseyNum":"27","position":"G","height":"6-8"},{"personId":"1641739","firstName":"Toumani","familyName":"Camara","fullName":"Toumani Camara","jerseyNum":"33","position":"F","height":"6-7"},{"personId":"1629057","firstName":"Robert","familyName":"Williams III","fullName":"Robert Williams III","jerseyNum":"35","position":"C-F","height":"6-9"},{"personId":"1631321","firstName":"Sidy","familyName":"Cissoko","fullName":"Sidy Cissoko","jerseyNum":"91","position":"G","height":"6-6"},{"personId":"1643257","firstName":"Jayson","familyName":"Kent","fullName":"Jayson Kent","jerseyNum":"","position":"F","height":"6-8"}],"1610612758":[{"personId":"1628370","firstName":"Malik","familyName":"Monk","fullName":"Malik Monk","jerseyNum":"0","position":"G","height":"6-3"},{"personId":"1642363","firstName":"Nique","familyName":"Clifford","fullName":"Nique Clifford","jerseyNum":"5","position":"G","height":"6-5"},{"personId":"203926","firstName":"Doug","familyName":"McDermott","fullName":"Doug McDermott","jerseyNum":"7","position":"F","height":"6-7"},{"personId":"1630165","firstName":"Killian","familyName":"Hayes","fullName":"Killian Hayes","jerseyNum":"7","position":"G","height":"6-4"},{"personId":"203897","firstName":"Zach","familyName":"LaVine","fullName":"Zach LaVine","jerseyNum":"8","position":"G","height":"6-5"},{"personId":"1630173","firstName":"Precious","familyName":"Achiuwa","fullName":"Precious Achiuwa","jerseyNum":"9","position":"F","height":"6-8"},{"personId":"201942","firstName":"DeMar","familyName":"DeRozan","fullName":"DeMar DeRozan","jerseyNum":"10","position":"G-F","height":"6-6"},{"personId":"1627734","firstName":"Domantas","familyName":"Sabonis","fullName":"Domantas Sabonis","jerseyNum":"11","position":"F-C","height":"6-10"},{"personId":"1631099","firstName":"Keegan","familyName":"Murray","fullName":"Keegan Murray","jerseyNum":"13","position":"F","height":"6-8"},{"personId":"1629631","firstName":"De'Andre","familyName":"Hunter","fullName":"De'Andre Hunter","jerseyNum":"15","position":"F-G","height":"6-7"},{"personId":"201566","firstName":"Russell","familyName":"Westbrook","fullName":"Russell Westbrook","jerseyNum":"18","position":"G","height":"6-4"},{"personId":"1629234","firstName":"Drew","familyName":"Eubanks","fullName":"Drew Eubanks","jerseyNum":"19","position":"F-C","height":"6-10"},{"personId":"1642269","firstName":"Devin","familyName":"Carter","fullName":"Devin Carter","jerseyNum":"22","position":"G","height":"6-2"},{"personId":"1631116","firstName":"Patrick","familyName":"Baldwin Jr.","fullName":"Patrick Baldwin Jr.","jerseyNum":"23","position":"F","height":"7-0"},{"personId":"1641815","firstName":"Isaiah","familyName":"Stevens","fullName":"Isaiah Stevens","jerseyNum":"24","position":"G","height":"5-11"},{"personId":"1631342","firstName":"Daeqwon","familyName":"Plowden","fullName":"Daeqwon Plowden","jerseyNum":"29","position":"G-F","height":"6-4"},{"personId":"1642928","firstName":"Dylan","familyName":"Cardwell","fullName":"Dylan Cardwell","jerseyNum":"32","position":"C","height":"6-10"},{"personId":"1642875","firstName":"Maxime","familyName":"Raynaud","fullName":"Maxime Raynaud","jerseyNum":"42","position":"C","height":"7-1"}],"1610612759":[{"personId":"1629162","firstName":"Jordan","familyName":"McLaughlin","fullName":"Jordan McLaughlin","jerseyNum":"0","position":"G","height":"5-11"},{"personId":"1641705","firstName":"Victor","familyName":"Wembanyama","fullName":"Victor Wembanyama","jerseyNum":"1","position":"F-C","height":"7-4"},{"personId":"1642844","firstName":"Dylan","familyName":"Harper","fullName":"Dylan Harper","jerseyNum":"2","position":"G","height":"6-5"},{"personId":"1629640","firstName":"Keldon","familyName":"Johnson","fullName":"Keldon Johnson","jerseyNum":"3","position":"F-G","height":"6-6"},{"personId":"1628368","firstName":"De'Aaron","familyName":"Fox","fullName":"De'Aaron Fox","jerseyNum":"4","position":"G","height":"6-3"},{"personId":"1642264","firstName":"Stephon","familyName":"Castle","fullName":"Stephon Castle","jerseyNum":"5","position":"G","height":"6-6"},{"personId":"1628436","firstName":"Luke","familyName":"Kornet","fullName":"Luke Kornet","jerseyNum":"7","position":"C-F","height":"7-1"},{"personId":"203482","firstName":"Kelly","familyName":"Olynyk","fullName":"Kelly Olynyk","jerseyNum":"8","position":"F-C","height":"7-0"},{"personId":"1642868","firstName":"Carter","familyName":"Bryant","fullName":"Carter Bryant","jerseyNum":"11","position":"F","height":"6-6"},{"personId":"1641801","firstName":"Emanuel","familyName":"Miller","fullName":"Emanuel Miller","jerseyNum":"14","position":"F","height":"6-5"},{"personId":"202687","firstName":"Bismack","familyName":"Biyombo","fullName":"Bismack Biyombo","jerseyNum":"18","position":"C","height":"6-8"},{"personId":"1630170","firstName":"Devin","familyName":"Vassell","fullName":"Devin Vassell","jerseyNum":"24","position":"G-F","height":"6-5"},{"personId":"1642357","firstName":"David","familyName":"Jones Garcia","fullName":"David Jones Garcia","jerseyNum":"25","position":"G","height":"6-4"},{"personId":"1630577","firstName":"Julian","familyName":"Champagnie","fullName":"Julian Champagnie","jerseyNum":"30","position":"F","height":"6-7"},{"personId":"203084","firstName":"Harrison","familyName":"Barnes","fullName":"Harrison Barnes","jerseyNum":"40","position":"F","height":"6-7"},{"personId":"1630322","firstName":"Lindy","familyName":"Waters III","fullName":"Lindy Waters III","jerseyNum":"43","position":"F","height":"6-5"},{"personId":"203486","firstName":"Mason","familyName":"Plumlee","fullName":"Mason Plumlee","jerseyNum":"45","position":"F-C","height":"7-0"},{"personId":"1631127","firstName":"Harrison","familyName":"Ingram","fullName":"Harrison Ingram","jerseyNum":"55","position":"F","height":"6-5"}],"1610612760":[{"personId":"1628983","firstName":"Shai","familyName":"Gilgeous-Alexander","fullName":"Shai Gilgeous-Alexander","jerseyNum":"2","position":"G","height":"6-6"},{"personId":"1642272","firstName":"Jared","familyName":"McCain","fullName":"Jared McCain","jerseyNum":"3","position":"G","height":"6-3"},{"personId":"1629652","firstName":"Luguentz","familyName":"Dort","fullName":"Luguentz Dort","jerseyNum":"5","position":"G","height":"6-4"},{"personId":"1631119","firstName":"Jaylin","familyName":"Williams","fullName":"Jaylin Williams","jerseyNum":"6","position":"F","height":"6-9"},{"personId":"1631096","firstName":"Chet","familyName":"Holmgren","fullName":"Chet Holmgren","jerseyNum":"7","position":"C-F","height":"7-1"},{"personId":"1631114","firstName":"Jalen","familyName":"Williams","fullName":"Jalen Williams","jerseyNum":"8","position":"G-F","height":"6-5"},{"personId":"1627936","firstName":"Alex","familyName":"Caruso","fullName":"Alex Caruso","jerseyNum":"9","position":"G","height":"6-5"},{"personId":"1630198","firstName":"Isaiah","familyName":"Joe","fullName":"Isaiah Joe","jerseyNum":"11","position":"G","height":"6-4"},{"personId":"1642850","firstName":"Thomas","familyName":"Sorber","fullName":"Thomas Sorber","jerseyNum":"12","position":"C","height":"6-9"},{"personId":"1642362","firstName":"Payton","familyName":"Sandfort","fullName":"Payton Sandfort","jerseyNum":"14","position":"F","height":"6-7"},{"personId":"1642382","firstName":"Branden","familyName":"Carlson","fullName":"Branden Carlson","jerseyNum":"15","position":"C","height":"7-0"},{"personId":"1630598","firstName":"Aaron","familyName":"Wiggins","fullName":"Aaron Wiggins","jerseyNum":"21","position":"G","height":"6-5"},{"personId":"1641717","firstName":"Cason","familyName":"Wallace","fullName":"Cason Wallace","jerseyNum":"22","position":"G","height":"6-3"},{"personId":"1642964","firstName":"Brooks","familyName":"Barnhizer","fullName":"Brooks Barnhizer","jerseyNum":"23","position":"G","height":"6-5"},{"personId":"1642349","firstName":"Ajay","familyName":"Mitchell","fullName":"Ajay Mitchell","jerseyNum":"25","position":"G","height":"6-4"},{"personId":"1629026","firstName":"Kenrich","familyName":"Williams","fullName":"Kenrich Williams","jerseyNum":"34","position":"G-F","height":"6-7"},{"personId":"1642260","firstName":"Nikola","familyName":"Topić","fullName":"Nikola Topić","jerseyNum":"44","position":"G","height":"6-6"},{"personId":"1628392","firstName":"Isaiah","familyName":"Hartenstein","fullName":"Isaiah Hartenstein","jerseyNum":"55","position":"C-F","height":"7-0"}],"1610612761":[{"personId":"1630639","firstName":"A.J.","familyName":"Lawson","fullName":"A.J. Lawson","jerseyNum":"0","position":"G","height":"6-6"},{"personId":"1641711","firstName":"Gradey","familyName":"Dick","fullName":"Gradey Dick","jerseyNum":"1","position":"G-F","height":"6-7"},{"personId":"1642367","firstName":"Jonathan","familyName":"Mogbo","fullName":"Jonathan Mogbo","jerseyNum":"2","position":"F","height":"6-9"},{"personId":"1627742","firstName":"Brandon","familyName":"Ingram","fullName":"Brandon Ingram","jerseyNum":"3","position":"F","height":"6-8"},{"personId":"1630567","firstName":"Scottie","familyName":"Barnes","fullName":"Scottie Barnes","jerseyNum":"4","position":"F-G","height":"6-8"},{"personId":"1630193","firstName":"Immanuel","familyName":"Quickley","fullName":"Immanuel Quickley","jerseyNum":"5","position":"G","height":"6-2"},{"personId":"1629628","firstName":"RJ","familyName":"Barrett","fullName":"RJ Barrett","jerseyNum":"9","position":"F-G","height":"6-6"},{"personId":"1642867","firstName":"Collin","familyName":"Murray-Boyles","fullName":"Collin Murray-Boyles","jerseyNum":"12","position":"F","height":"6-7"},{"personId":"1642266","firstName":"Ja'Kobe","familyName":"Walter","fullName":"Ja'Kobe Walter","jerseyNum":"14","position":"G","height":"6-4"},{"personId":"202066","firstName":"Garrett","familyName":"Temple","fullName":"Garrett Temple","jerseyNum":"17","position":"G-F","height":"6-5"},{"personId":"1627751","firstName":"Jakob","familyName":"Poeltl","fullName":"Jakob Poeltl","jerseyNum":"19","position":"C","height":"7-0"},{"personId":"1642347","firstName":"Jamal","familyName":"Shead","fullName":"Jamal Shead","jerseyNum":"23","position":"G","height":"6-1"},{"personId":"1642935","firstName":"Chucky","familyName":"Hepburn","fullName":"Chucky Hepburn","jerseyNum":"24","position":"G","height":"6-0"},{"personId":"1631218","firstName":"Trayce","familyName":"Jackson-Davis","fullName":"Trayce Jackson-Davis","jerseyNum":"32","position":"F","height":"6-9"},{"personId":"1630572","firstName":"Sandro","familyName":"Mamukelashvili","fullName":"Sandro Mamukelashvili","jerseyNum":"54","position":"F-C","height":"6-9"},{"personId":"1642918","firstName":"Alijah","familyName":"Martin","fullName":"Alijah Martin","jerseyNum":"55","position":"G","height":"6-2"},{"personId":"1642419","firstName":"Jamison","familyName":"Battle","fullName":"Jamison Battle","jerseyNum":"77","position":"F","height":"6-7"}],"1610612762":[{"personId":"1642396","firstName":"Blake","familyName":"Hinson","fullName":"Blake Hinson","jerseyNum":"2","position":"F","height":"6-8"},{"personId":"1641718","firstName":"Keyonte","familyName":"George","fullName":"Keyonte George","jerseyNum":"3","position":"G","height":"6-4"},{"personId":"1642262","firstName":"Cody","familyName":"Williams","fullName":"Cody Williams","jerseyNum":"5","position":"F","height":"6-8"},{"personId":"1642268","firstName":"Isaiah","familyName":"Collier","fullName":"Isaiah Collier","jerseyNum":"8","position":"G","height":"6-4"},{"personId":"1629004","firstName":"Svi","familyName":"Mykhailiuk","fullName":"Svi Mykhailiuk","jerseyNum":"10","position":"G-F","height":"6-7"},{"personId":"1641989","firstName":"Elijah","familyName":"Harkless","fullName":"Elijah Harkless","jerseyNum":"16","position":"G","height":"6-3"},{"personId":"1642846","firstName":"Ace","familyName":"Bailey","fullName":"Ace Bailey","jerseyNum":"19","position":"F","height":"6-9"},{"personId":"1628991","firstName":"Jaren","familyName":"Jackson Jr.","fullName":"Jaren Jackson Jr.","jerseyNum":"20","position":"F-C","height":"6-10"},{"personId":"1643016","firstName":"Bez","familyName":"Mbeng","fullName":"Bez Mbeng","jerseyNum":"21","position":"G","height":"6-4"},{"personId":"1642271","firstName":"Kyle","familyName":"Filipowski","fullName":"Kyle Filipowski","jerseyNum":"22","position":"C","height":"6-11"},{"personId":"1628374","firstName":"Lauri","familyName":"Markkanen","fullName":"Lauri Markkanen","jerseyNum":"23","position":"F-C","height":"7-1"},{"personId":"1631117","firstName":"Walker","familyName":"Kessler","fullName":"Walker Kessler","jerseyNum":"24","position":"C","height":"7-2"},{"personId":"1641729","firstName":"Brice","familyName":"Sensabaugh","fullName":"Brice Sensabaugh","jerseyNum":"28","position":"F","height":"6-6"},{"personId":"203994","firstName":"Jusuf","familyName":"Nurkić","fullName":"Jusuf Nurkić","jerseyNum":"30","position":"C","height":"6-11"},{"personId":"1631131","firstName":"Oscar","familyName":"Tshiebwe","fullName":"Oscar Tshiebwe","jerseyNum":"34","position":"F-C","height":"6-8"},{"personId":"201567","firstName":"Kevin","familyName":"Love","fullName":"Kevin Love","jerseyNum":"42","position":"F-C","height":"6-10"},{"personId":"1629723","firstName":"John","familyName":"Konchar","fullName":"John Konchar","jerseyNum":"55","position":"G","height":"6-5"},{"personId":"1643060","firstName":"Hayden","familyName":"Gray","fullName":"Hayden Gray","jerseyNum":"","position":"G","height":"6-4"}],"1610612763":[{"personId":"1642377","firstName":"Jaylen","familyName":"Wells","fullName":"Jaylen Wells","jerseyNum":"0","position":"F","height":"6-7"},{"personId":"1630590","firstName":"Scotty","familyName":"Pippen Jr.","fullName":"Scotty Pippen Jr.","jerseyNum":"1","position":"G","height":"6-2"},{"personId":"1629660","firstName":"Ty","familyName":"Jerome","fullName":"Ty Jerome","jerseyNum":"2","position":"G-F","height":"6-5"},{"personId":"203484","firstName":"Kentavious","familyName":"Caldwell-Pope","fullName":"Kentavious Caldwell-Pope","jerseyNum":"3","position":"G","height":"6-5"},{"personId":"1642383","firstName":"Walter","familyName":"Clayton Jr.","fullName":"Walter Clayton Jr.","jerseyNum":"4","position":"G","height":"6-4"},{"personId":"1630583","firstName":"Santi","familyName":"Aldama","fullName":"Santi Aldama","jerseyNum":"7","position":"F-C","height":"7-0"},{"personId":"1642914","firstName":"Javon","familyName":"Small","fullName":"Javon Small","jerseyNum":"10","position":"G","height":"6-1"},{"personId":"1629630","firstName":"Ja","familyName":"Morant","fullName":"Ja Morant","jerseyNum":"12","position":"G","height":"6-2"},{"personId":"1641744","firstName":"Zach","familyName":"Edey","fullName":"Zach Edey","jerseyNum":"14","position":"C","height":"7-3"},{"personId":"1629634","firstName":"Brandon","familyName":"Clarke","fullName":"Brandon Clarke","jerseyNum":"15","position":"F","height":"6-8"},{"personId":"1641765","firstName":"Olivier-Maxence","familyName":"Prosper","fullName":"Olivier-Maxence Prosper","jerseyNum":"18","position":"F","height":"6-7"},{"personId":"1641712","firstName":"Rayan","familyName":"Rupert","fullName":"Rayan Rupert","jerseyNum":"21","position":"G-F","height":"6-7"},{"personId":"1641707","firstName":"Taylor","familyName":"Hendricks","fullName":"Taylor Hendricks","jerseyNum":"22","position":"F","height":"6-9"},{"personId":"1642907","firstName":"Cedric","familyName":"Coward","fullName":"Cedric Coward","jerseyNum":"23","position":"G","height":"6-5"},{"personId":"1642285","firstName":"Cam","familyName":"Spencer","fullName":"Cam Spencer","jerseyNum":"24","position":"G","height":"6-3"},{"personId":"1641713","firstName":"GG","familyName":"Jackson","fullName":"GG Jackson","jerseyNum":"45","position":"F","height":"6-9"},{"personId":"201959","firstName":"Taj","familyName":"Gibson","fullName":"Taj Gibson","jerseyNum":"67","position":"F","height":"6-9"},{"personId":"1642942","firstName":"Jahmai","familyName":"Mashack","fullName":"Jahmai Mashack","jerseyNum":"","position":"G","height":"6-4"}],"1610612764":[{"personId":"1641731","firstName":"Bilal","familyName":"Coulibaly","fullName":"Bilal Coulibaly","jerseyNum":"0","position":"G","height":"6-7"},{"personId":"1641774","firstName":"Tristan","familyName":"Vukcevic","fullName":"Tristan Vukcevic","jerseyNum":"00","position":"F","height":"7-0"},{"personId":"1641715","firstName":"Cam","familyName":"Whitmore","fullName":"Cam Whitmore","jerseyNum":"1","position":"F","height":"6-6"},{"personId":"1629027","firstName":"Trae","familyName":"Young","fullName":"Trae Young","jerseyNum":"3","position":"G","height":"6-2"},{"personId":"1626156","firstName":"D'Angelo","familyName":"Russell","fullName":"D'Angelo Russell","jerseyNum":"5","position":"G","height":"6-3"},{"personId":"1642364","firstName":"Jamir","familyName":"Watkins","fullName":"Jamir Watkins","jerseyNum":"5","position":"F","height":"6-6"},{"personId":"1642267","firstName":"Bub","familyName":"Carrington","fullName":"Bub Carrington","jerseyNum":"7","position":"G","height":"6-4"},{"personId":"1630702","firstName":"Jaden","familyName":"Hardy","fullName":"Jaden Hardy","jerseyNum":"8","position":"G","height":"6-3"},{"personId":"1630551","firstName":"Justin","familyName":"Champagnie","fullName":"Justin Champagnie","jerseyNum":"9","position":"G-F","height":"6-6"},{"personId":"1641778","firstName":"Leaky","familyName":"Black","fullName":"Leaky Black","jerseyNum":"12","position":"F","height":"6-6"},{"personId":"1642848","firstName":"Tre","familyName":"Johnson","fullName":"Tre Johnson","jerseyNum":"12","position":"G","height":"6-5"},{"personId":"1630536","firstName":"Sharife","familyName":"Cooper","fullName":"Sharife Cooper","jerseyNum":"13","position":"G","height":"6-0"},{"personId":"1630264","firstName":"Anthony","familyName":"Gill","fullName":"Anthony Gill","jerseyNum":"16","position":"F","height":"6-7"},{"personId":"1642273","firstName":"Kyshawn","familyName":"George","fullName":"Kyshawn George","jerseyNum":"18","position":"F","height":"6-8"},{"personId":"1642259","firstName":"Alex","familyName":"Sarr","fullName":"Alex Sarr","jerseyNum":"20","position":"C","height":"7-0"},{"personId":"203076","firstName":"Anthony","familyName":"Davis","fullName":"Anthony Davis","jerseyNum":"23","position":"F-C","height":"6-10"},{"personId":"1642860","firstName":"Will","familyName":"Riley","fullName":"Will Riley","jerseyNum":"27","position":"F","height":"6-9"},{"personId":"1642882","firstName":"Julian","familyName":"Reese","fullName":"Julian Reese","jerseyNum":"","position":"F","height":"6-9"}],"1610612765":[{"personId":"1631105","firstName":"Jalen","familyName":"Duren","fullName":"Jalen Duren","jerseyNum":"0","position":"C","height":"6-10"},{"personId":"1630595","firstName":"Cade","familyName":"Cunningham","fullName":"Cade Cunningham","jerseyNum":"2","position":"G","height":"6-6"},{"personId":"1642403","firstName":"Isaac","familyName":"Jones","fullName":"Isaac Jones","jerseyNum":"3","position":"F","height":"6-8"},{"personId":"1641842","firstName":"Ronald","familyName":"Holland II","fullName":"Ronald Holland II","jerseyNum":"5","position":"F","height":"6-8"},{"personId":"1630194","firstName":"Paul","familyName":"Reed","fullName":"Paul Reed","jerseyNum":"7","position":"F","height":"6-9"},{"personId":"1627747","firstName":"Caris","familyName":"LeVert","fullName":"Caris LeVert","jerseyNum":"8","position":"G","height":"6-7"},{"personId":"1641709","firstName":"Ausar","familyName":"Thompson","fullName":"Ausar Thompson","jerseyNum":"9","position":"G-F","height":"6-7"},{"personId":"202699","firstName":"Tobias","familyName":"Harris","fullName":"Tobias Harris","jerseyNum":"12","position":"F","height":"6-8"},{"personId":"1631111","firstName":"Wendell","familyName":"Moore Jr.","fullName":"Wendell Moore Jr.","jerseyNum":"14","position":"G","height":"6-5"},{"personId":"1642404","firstName":"Chaz","familyName":"Lanier","fullName":"Chaz Lanier","jerseyNum":"20","position":"G","height":"6-3"},{"personId":"1642450","firstName":"Daniss","familyName":"Jenkins","fullName":"Daniss Jenkins","jerseyNum":"24","position":"G","height":"6-4"},{"personId":"1631204","firstName":"Marcus","familyName":"Sasser","fullName":"Marcus Sasser","jerseyNum":"25","position":"G","height":"6-1"},{"personId":"1628989","firstName":"Kevin","familyName":"Huerter","fullName":"Kevin Huerter","jerseyNum":"27","position":"G-F","height":"6-6"},{"personId":"1630191","firstName":"Isaiah","familyName":"Stewart","fullName":"Isaiah Stewart","jerseyNum":"28","position":"F-C","height":"6-8"},{"personId":"1629750","firstName":"Javonte","familyName":"Green","fullName":"Javonte Green","jerseyNum":"31","position":"G","height":"6-5"},{"personId":"1642449","firstName":"Tolu","familyName":"Smith","fullName":"Tolu Smith","jerseyNum":"35","position":"F","height":"6-11"},{"personId":"1629130","firstName":"Duncan","familyName":"Robinson","fullName":"Duncan Robinson","jerseyNum":"55","position":"F","height":"6-7"}],"1610612766":[{"personId":"1628970","firstName":"Miles","familyName":"Bridges","fullName":"Miles Bridges","jerseyNum":"0","position":"F","height":"6-7"},{"personId":"1630163","firstName":"LaMelo","familyName":"Ball","fullName":"LaMelo Ball","jerseyNum":"1","position":"G","height":"6-7"},{"personId":"1629684","firstName":"Grant","familyName":"Williams","fullName":"Grant Williams","jerseyNum":"2","position":"F","height":"6-7"},{"personId":"1629632","firstName":"Coby","familyName":"White","fullName":"Coby White","jerseyNum":"3","position":"G","height":"6-4"},{"personId":"1642883","firstName":"Sion","familyName":"James","fullName":"Sion James","jerseyNum":"4","position":"G","height":"6-5"},{"personId":"1642851","firstName":"Kon","familyName":"Knueppel","fullName":"Kon Knueppel","jerseyNum":"7","position":"G-F","height":"6-6"},{"personId":"1630182","firstName":"Josh","familyName":"Green","fullName":"Josh Green","jerseyNum":"10","position":"G","height":"6-6"},{"personId":"1641750","firstName":"Ryan","familyName":"Kalkbrenner","fullName":"Ryan Kalkbrenner","jerseyNum":"11","position":"C","height":"7-1"},{"personId":"1641810","firstName":"Antonio","familyName":"Reeves","fullName":"Antonio Reeves","jerseyNum":"12","position":"G","height":"6-5"},{"personId":"1631217","firstName":"Moussa","familyName":"Diabaté","fullName":"Moussa Diabaté","jerseyNum":"14","position":"F","height":"6-10"},{"personId":"1641790","firstName":"PJ","familyName":"Hall","fullName":"PJ Hall","jerseyNum":"16","position":"C","height":"6-8"},{"personId":"1641787","firstName":"Tosan","familyName":"Evbuomwan","fullName":"Tosan Evbuomwan","jerseyNum":"20","position":"F","height":"6-8"},{"personId":"1626192","firstName":"Pat","familyName":"Connaughton","fullName":"Pat Connaughton","jerseyNum":"21","position":"G","height":"6-5"},{"personId":"1630544","firstName":"Tre","familyName":"Mann","fullName":"Tre Mann","jerseyNum":"23","position":"G","height":"6-4"},{"personId":"1641706","firstName":"Brandon","familyName":"Miller","fullName":"Brandon Miller","jerseyNum":"24","position":"F","height":"6-7"},{"personId":"1630214","firstName":"Xavier","familyName":"Tillman","fullName":"Xavier Tillman","jerseyNum":"26","position":"F","height":"6-8"},{"personId":"1642275","firstName":"Tidjane","familyName":"Salaün","fullName":"Tidjane Salaün","jerseyNum":"31","position":"F","height":"6-10"},{"personId":"1642862","firstName":"Liam","familyName":"McNeeley","fullName":"Liam McNeeley","jerseyNum":"33","position":"F","height":"6-7"}]} as Record<string, Array<Record<string, unknown>>>;

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

function buildSeasonString(startYear: number) {
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function parseSeasonStartYear(season: string) {
  const match = /^(\d{4})-\d{2}$/.exec(String(season || "").trim());
  return match ? Number(match[1]) : null;
}

function seasonBoundsForSeason(season: string, date = new Date()) {
  const startYear = parseSeasonStartYear(season);
  if (!Number.isFinite(startYear)) {
    throw new Error(`Invalid season: ${season}`);
  }
  const seasonStart = new Date(Date.UTC(startYear, 9, 1));
  const seasonEnd = new Date(Date.UTC(startYear + 1, 5, 30));
  const shouldClampToToday = String(season) === buildSeasonString(date.getUTCMonth() + 1 >= 7 ? date.getUTCFullYear() : date.getUTCFullYear() - 1)
    || (date >= seasonStart && date <= seasonEnd);
  return {
    start: seasonStart,
    end: shouldClampToToday && date < seasonEnd ? date : seasonEnd,
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
  return gameId.startsWith("001") || gameId.startsWith("002") || gameId.startsWith("004");
}

function isPreseasonGame(game: Record<string, unknown>) {
  return String(game?.gameId || "").startsWith("001");
}

async function fetchGamesByDate(dateStr: string) {
  return requestJson(`${API_BASE}/games/byDate?date=${dateStr}`).catch(() => []);
}

async function hasPreseasonStartedForSeasonStartYear(startYear: number, date = new Date()) {
  const cacheKey = `${buildSeasonString(startYear)}:${formatDateInput(date)}`;
  if (!DEFAULT_SEASON_CACHE.has(cacheKey)) {
    DEFAULT_SEASON_CACHE.set(cacheKey, (async () => {
      const probeStart = new Date(Date.UTC(startYear, 8, 1));
      const probeEnd = new Date(Math.min(date.getTime(), Date.UTC(startYear, 9, 31, 23, 59, 59, 999)));
      if (probeEnd < probeStart) return "false";
      const dateInputs = enumerateDateInputs(probeStart, probeEnd);
      const concurrency = 8;

      for (let index = 0; index < dateInputs.length; index += concurrency) {
        const batch = dateInputs.slice(index, index + concurrency);
        const batchResults = await Promise.all(
          batch.map(async (dateInput) => {
            const games = await fetchGamesByDate(dateInput).catch(() => []);
            return (Array.isArray(games) ? games : [])
              .filter((game) => isNbaDashboardGame(game as AnyRecord))
              .filter((game) => isPlayedGame(game as AnyRecord))
              .filter((game) => isPreseasonGame(game as AnyRecord));
          }),
        );
        if (batchResults.some((games) => games.length > 0)) return "true";
      }

      return "false";
    })().then((value) => String(value)));
  }

  return (await DEFAULT_SEASON_CACHE.get(cacheKey)!) === "true";
}

async function resolveDefaultSeasonString(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  if (month < 7) {
    return buildSeasonString(year - 1);
  }

  const upcomingStartYear = year;
  const preseasonStarted = await hasPreseasonStartedForSeasonStartYear(upcomingStartYear, date);
  return preseasonStarted ? buildSeasonString(upcomingStartYear) : buildSeasonString(upcomingStartYear - 1);
}

async function parseExplicitSeasonString(prompt: string, date = new Date()) {
  const rawPrompt = String(prompt || "");
  const normalizedPrompt = normalizeText(prompt);
  const explicitMatch = /\b(20\d{2})\s*[-/]\s*(\d{2,4})\b/.exec(rawPrompt);
  if (explicitMatch) {
    const startYear = Number(explicitMatch[1]);
    const endFragment = explicitMatch[2];
    const expectedEnd = String(startYear + 1);
    const normalizedEnd = endFragment.length === 2 ? expectedEnd.slice(-2) : endFragment;
    if (normalizedEnd === expectedEnd || normalizedEnd === expectedEnd.slice(-2)) {
      return buildSeasonString(startYear);
    }
  }

  const shortMatch = /\b(\d{2})\s*[-/]\s*(\d{2})\b/.exec(rawPrompt);
  if (shortMatch) {
    const startYear = 2000 + Number(shortMatch[1]);
    const expectedEnd = String(startYear + 1).slice(-2);
    if (shortMatch[2] === expectedEnd) {
      return buildSeasonString(startYear);
    }
  }

  if (/\blast season\b|\blast year\b|\bprevious season\b/.test(normalizedPrompt)) {
    const defaultSeason = await resolveDefaultSeasonString(date);
    const defaultStartYear = parseSeasonStartYear(defaultSeason);
    if (Number.isFinite(defaultStartYear)) {
      return buildSeasonString((defaultStartYear as number) - 1);
    }
  }

  if (/\bthis season\b|\bcurrent season\b/.test(normalizedPrompt)) {
    return null;
  }

  return null;
}

async function resolveSeasonStringForPrompt(prompt: string, date = new Date()) {
  const explicitSeason = await parseExplicitSeasonString(prompt, date);
  if (explicitSeason) return explicitSeason;
  return resolveDefaultSeasonString(date);
}

async function fetchSeasonGames(season?: string) {
  const resolvedSeason = season || await resolveDefaultSeasonString();
  if (!SEASON_GAMES_CACHE.has(resolvedSeason)) {
    SEASON_GAMES_CACHE.set(resolvedSeason, (async () => {
      const { start, end } = seasonBoundsForSeason(resolvedSeason, new Date());
      const dateInputs = enumerateDateInputs(start, end);
      const concurrency = 8;
      const aggregated: Record<string, unknown>[] = [];

      for (let index = 0; index < dateInputs.length; index += concurrency) {
        const batch = dateInputs.slice(index, index + concurrency);
        const batchResults = await Promise.all(
          batch.map(async (dateInput) => {
            const games = await fetchGamesByDate(dateInput).catch(() => []);
            return (Array.isArray(games) ? games : [])
              .filter((game) => isNbaDashboardGame(game as AnyRecord))
              .filter((game) => isSupportedSeasonGame(game as AnyRecord))
              .filter((game) => isPlayedGame(game as AnyRecord))
              .map((game) => ({ ...(game as AnyRecord), gameDate: dateInput }));
          }),
        );
        aggregated.push(...batchResults.flat());
      }

      return [...new Map(aggregated.map((game) => [String(game.gameId || ""), game])).values()]
        .sort((left, right) => String(right.gameDate || "").localeCompare(String(left.gameDate || "")));
    })());
  }
  return SEASON_GAMES_CACHE.get(resolvedSeason)!;
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
  const actionByNumber = new Map(
    orderedActions.map((action) => [safeNumber(action.actionNumber, 0), action]),
  );

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
          ? actionByNumber.get(safeNumber(action.shotActionNumber, 0))
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

function computeDisplayedKillsByTeam(actions: Array<Record<string, unknown>>, homeTeamId: string, awayTeamId: string) {
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
  return kills;
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

function buildGameMetricContext(game: AnyRecord): GameMetricContext {
  const homeTeamId = String(game?.homeTeam?.teamId || "");
  const awayTeamId = String(game?.awayTeam?.teamId || "");
  const actions = Array.isArray(game?.playByPlayActions)
    ? game.playByPlayActions as Array<Record<string, unknown>>
    : [];
  const derivedTotals = buildDerivedTeamTotals(actions, homeTeamId, awayTeamId);
  const firstHalfPointsByTeam: Record<string, number> = {
    [homeTeamId]: 0,
    [awayTeamId]: 0,
  };

  actions.forEach((action) => {
    const period = safeNumber(action.period, 0);
    if (period < 1 || period > 2) return;
    const teamId = String(action.teamId || "");
    if (!teamId) return;
    const actionType = String(action.actionType || "").toLowerCase();
    const shotResult = String(action.shotResult || "");
    let points = 0;
    if ((actionType === "2pt" || actionType === "3pt") && shotResult === "Made") {
      points = actionType === "3pt" ? 3 : 2;
    } else if (actionType === "freethrow" && shotResult === "Made") {
      points = 1;
    }
    if (points) {
      firstHalfPointsByTeam[teamId] = safeNumber(firstHalfPointsByTeam[teamId], 0) + points;
    }
  });

  return {
    homeTeamId,
    awayTeamId,
    actions,
    derivedTotals,
    firstHalfPointsByTeam,
    killsByTeam: computeDisplayedKillsByTeam(actions, homeTeamId, awayTeamId),
  };
}

function buildGameMetrics(game: AnyRecord, teamId: string, context = buildGameMetricContext(game)): BuiltGameMetrics {
  const perspective = selectTeamPerspective(game, teamId);
  const { homeTeamId, awayTeamId, derivedTotals } = context;
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
  const firstHalfTeamPoints = safeNumber(context.firstHalfPointsByTeam[teamId], 0);
  const firstHalfOpponentPoints = safeNumber(context.firstHalfPointsByTeam[opponentId], 0);

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
      kills: safeNumber(context.killsByTeam[teamId], 0),
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

    if (safeNumber(action.assistPersonId, 0) === safeNumber(playerId, 0) && points > 0) {
      periodMetrics.assists += 1;
    }
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
    const score = scoreSearchAliases(prompt, aliases) + scoreMetricIntent(metric, prompt);
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

function hasExplicitOnOffContext(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  return normalizedPrompt.includes("on off")
    || normalizedPrompt.includes("on/off")
    || normalizedPrompt.includes("on the floor")
    || normalizedPrompt.includes("off the floor")
    || normalizedPrompt.includes("on court")
    || normalizedPrompt.includes("off court")
    || /\bwith\s+[a-z0-9 .'-]+\s+on\b/.test(normalizedPrompt)
    || /\bwith\s+[a-z0-9 .'-]+\s+off\b/.test(normalizedPrompt);
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
  const normalizedPrompt = normalizeText(prompt).replace(/\bcatch and shoot\b/g, "catchshoot");
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

function parseOpponentRecordRequest(
  prompt: string,
  explicitTeam: (typeof NBA_TEAMS)[number] | null,
  inferredTeam: (typeof NBA_TEAMS)[number] | null,
) {
  if (!isRecordPrompt(prompt)) return null;
  if (!hasExplicitOpponentContext(prompt)) return null;
  if (findMetricFromPrompt(prompt)) return null;

  const team = explicitTeam || inferredTeam;
  if (!team) return null;

  const opponents = findTeamMatches(prompt)
    .map((entry) => entry.team)
    .filter((entry, index, list) => entry.teamId !== team.teamId && list.findIndex((other) => other.teamId === entry.teamId) === index);
  if (!opponents.length) return null;

  return {
    team,
    opponents,
    seasonScope: parseSeasonScope(prompt),
    resultFilter: parseResultFilter(prompt),
    homeAwayFilter: parseHomeAwayFilter(prompt),
  } satisfies OpponentRecordRequest;
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
  if (/\b1st half\b|\bfirst half\b|\bhalftime\b/.test(normalizedPrompt)) return "H1";
  if (/\b2nd half\b|\bsecond half\b/.test(normalizedPrompt)) return "H2";
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
    || normalizedPrompt.includes("1st half")
    || normalizedPrompt.includes("first half")
    || normalizedPrompt.includes("2nd half")
    || normalizedPrompt.includes("second half")
    || normalizedPrompt.includes("halftime")
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

function scoreParsedCandidate(
  candidate: ParsedQuery | null,
  options: {
    prompt: string;
    promptHasExplicitOpponent: boolean;
    explicitOrImplicitThreshold: number | null;
    inferredPlayerTeam: { team: (typeof NBA_TEAMS)[number] } | null;
    sourceBonus: number;
  },
) {
  if (!candidate) return null;

  const parsed: ParsedQuery = { ...candidate };
  const matchedTeam = NBA_TEAMS.find((entry) => entry.teamId === parsed.teamId) || null;
  const matchedMetric = METRICS.find((entry) => entry.key === parsed.statKey) || null;
  if (!matchedTeam || !matchedMetric) return null;

  if (parsed.opponentTeamId && !options.promptHasExplicitOpponent) {
    parsed.opponentTeamId = undefined;
  }
  if (parsed.groupBy === "on_off" && !hasExplicitOnOffContext(options.prompt)) {
    parsed.groupBy = "none";
  }
  if (parsed.opponentTeamId === parsed.teamId) {
    parsed.opponentTeamId = undefined;
  }
  if (options.explicitOrImplicitThreshold != null && parsed.threshold == null) {
    return null;
  }

  const parsedGroupBy = parseGroupBy(options.prompt);
  const teamScore = scoreTeamPrompt(matchedTeam, options.prompt);
  const metricScore = scoreMetricPrompt(matchedMetric, options.prompt);
  const matchedOpponent = parsed.opponentTeamId
    ? NBA_TEAMS.find((entry) => entry.teamId === parsed.opponentTeamId) || null
    : null;
  const opponentScore = matchedOpponent ? scoreTeamPrompt(matchedOpponent, options.prompt) : 0;
  const filterBonus = (parsed.resultFilter && parsed.resultFilter !== "all" ? 2 : 0)
    + (matchedOpponent ? 2 : 0);
  const thresholdBonus = options.explicitOrImplicitThreshold != null && parsed.threshold === options.explicitOrImplicitThreshold ? 4 : 0;
  const groupBonus = parsedGroupBy !== "none" && parsed.groupBy === parsedGroupBy ? 6 : 0;
  const inferredTeamBonus = options.inferredPlayerTeam?.team.teamId === matchedTeam.teamId ? 12 : 0;
  const metricIntentBonus = scoreMetricIntent(matchedMetric, options.prompt);
  const effectiveTeamScore = Math.max(teamScore, inferredTeamBonus);
  const score = effectiveTeamScore
    + metricScore
    + opponentScore
    + options.sourceBonus
    + filterBonus
    + thresholdBonus
    + groupBonus
    + metricIntentBonus;

  if (effectiveTeamScore < 6 || metricScore < 5) return null;

  return {
    parsed,
    team: matchedTeam,
    metric: matchedMetric,
    score,
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
  const parts: string[] = [team.fullName];
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

function sumMetricMaps(metricMaps: Array<Record<string, number>>) {
  const merged: Record<string, number> = {};
  metricMaps.forEach((metrics) => {
    Object.entries(metrics || {}).forEach(([key, value]) => {
      merged[key] = safeNumber(merged[key], 0) + safeNumber(value, 0);
    });
  });
  return merged;
}

function collapsePeriodRowsToGameThresholdRows(
  rows: Array<CachedTeamGameRow | CachedPlayerGameRow>,
  aggregation: QueryAggregation,
  statKey: string,
) {
  const byGame = new Map<string, Array<CachedTeamGameRow | CachedPlayerGameRow>>();
  rows.forEach((row) => {
    if (!byGame.has(row.gameId)) byGame.set(row.gameId, []);
    byGame.get(row.gameId)?.push(row);
  });

  const selectValue = (gameRows: Array<CachedTeamGameRow | CachedPlayerGameRow>) => {
    const values = gameRows.map((row) => safeNumber(row.metrics?.[statKey], 0));
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

function collapsePeriodRowsToCombinedSpanRows(
  rows: Array<CachedTeamGameRow | CachedPlayerGameRow>,
  groupLabel: string,
  groupKeys: string[],
) {
  const byGame = new Map<string, Array<CachedTeamGameRow | CachedPlayerGameRow>>();
  rows.forEach((row) => {
    if (!groupKeys.includes(String(row.groupKey || ""))) return;
    if (!byGame.has(row.gameId)) byGame.set(row.gameId, []);
    byGame.get(row.gameId)?.push(row);
  });

  return [...byGame.values()].map((gameRows) => {
    const source = gameRows[0];
    const mergedMetrics = sumMetricMaps(gameRows.map((row) => row.metrics || {}));
    return {
      ...source,
      value: 0,
      groupKey: groupLabel,
      groupLabel,
      metrics: mergedMetrics,
      ...("opponentMetrics" in source
        ? { opponentMetrics: sumMetricMaps(gameRows.map((row) => ("opponentMetrics" in row ? row.opponentMetrics || {} : {}))) }
        : {}),
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
        String((game as AnyRecord)?.homeTeam?.teamId || "") === team.teamId ||
        String((game as AnyRecord)?.awayTeam?.teamId || "") === team.teamId
      ));

      const detailedGames = await mapWithConcurrency(
        teamGames,
        (game) => fetchGameDetailsSafe(String((game as AnyRecord).gameId || "")),
      );

      const skippedGames = detailedGames
        .map((entry, index) => (
          entry.error
            ? {
              gameId: String((teamGames[index] as AnyRecord).gameId || ""),
              gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
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
            gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
          } as AnyRecord;
          const metricContext = buildGameMetricContext(game);
          const metrics = buildGameMetrics(game, team.teamId, metricContext);
          const opponentMetrics = buildGameMetrics(game, metrics.opponent.teamId, metricContext);
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

async function buildTeamSubsetDataset(
  season: string,
  team: (typeof NBA_TEAMS)[number],
  opponentTeamIds: string[],
) {
  const opponentSet = new Set(opponentTeamIds);
  const seasonGames = await fetchSeasonGames(season);
  const teamGames = seasonGames.filter((game) => {
    const homeTeamId = String((game as AnyRecord)?.homeTeam?.teamId || "");
    const awayTeamId = String((game as AnyRecord)?.awayTeam?.teamId || "");
    const involvesTeam = homeTeamId === team.teamId || awayTeamId === team.teamId;
    const opponentId = homeTeamId === team.teamId ? awayTeamId : awayTeamId === team.teamId ? homeTeamId : "";
    return involvesTeam && opponentSet.has(opponentId);
  });

  const detailedGames = await mapWithConcurrency(
    teamGames,
    (game) => fetchGameDetailsSafe(String((game as AnyRecord).gameId || "")),
    4,
  );

  const skippedGames = detailedGames
    .map((entry, index) => (
      entry.error
        ? {
          gameId: String((teamGames[index] as AnyRecord).gameId || ""),
          gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
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
        gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
      } as AnyRecord;
      const metricContext = buildGameMetricContext(game);
      const metrics = buildGameMetrics(game, team.teamId, metricContext);
      const opponentMetrics = buildGameMetrics(game, metrics.opponent.teamId, metricContext);
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

  return { rows, skippedGames };
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
        String((game as AnyRecord)?.homeTeam?.teamId || "") === team.teamId ||
        String((game as AnyRecord)?.awayTeam?.teamId || "") === team.teamId
      ));

      const detailedGames = await mapWithConcurrency(
        teamGames,
        (game) => fetchGameDetailsSafe(String((game as AnyRecord).gameId || "")),
      );

      const skippedGames = detailedGames
        .map((entry, index) => (
          entry.error
            ? {
              gameId: String((teamGames[index] as AnyRecord).gameId || ""),
              gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
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
            gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
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
        String((game as AnyRecord)?.homeTeam?.teamId || "") === team.teamId ||
        String((game as AnyRecord)?.awayTeam?.teamId || "") === team.teamId
      ));

      const detailedGames = await mapWithConcurrency(teamGames, async (game) => {
          const gameId = String((game as AnyRecord).gameId || "");
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
              gameId: String((teamGames[index] as AnyRecord).gameId || ""),
              gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
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
            gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
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
    String((game as AnyRecord)?.homeTeam?.teamId || "") === team.teamId ||
    String((game as AnyRecord)?.awayTeam?.teamId || "") === team.teamId
  ));

  const detailedGames = await mapWithConcurrency(
    teamGames,
    (game) => fetchGameDetailsSafe(String((game as AnyRecord).gameId || "")),
  );

  const skippedGames = detailedGames
    .map((entry, index) => (
      entry.error
        ? {
          gameId: String((teamGames[index] as AnyRecord).gameId || ""),
          gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
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
        gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
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
    String((game as AnyRecord)?.homeTeam?.teamId || "") === team.teamId ||
    String((game as AnyRecord)?.awayTeam?.teamId || "") === team.teamId
  ));

  const detailedGames = await mapWithConcurrency(teamGames, async (game) => {
    const gameId = String((game as AnyRecord).gameId || "");
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
          gameId: String((teamGames[index] as AnyRecord).gameId || ""),
          gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
          error: entry.gameEntry.error || entry.minutesEntry.error || "Unable to load game detail or minutes data.",
        }
        : null
    ))
    .filter(Boolean) as Array<{ gameId: string; gameDate: string; error: string }>;

  const rows = detailedGames.flatMap((entry, index) => {
    if (!entry.gameEntry.game || !entry.minutesEntry.data) return [];
    const game = {
      ...entry.gameEntry.game,
      gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
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
        String((game as AnyRecord)?.homeTeam?.teamId || "") === team.teamId ||
        String((game as AnyRecord)?.awayTeam?.teamId || "") === team.teamId
      ));

      const detailedGames = await mapWithConcurrency(
        teamGames,
        (game) => fetchGameDetailsSafe(String((game as AnyRecord).gameId || "")),
      );

      const skippedGames = detailedGames
        .map((entry, index) => (
          entry.error
            ? {
              gameId: String((teamGames[index] as AnyRecord).gameId || ""),
              gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
              error: entry.error,
            }
            : null
        ))
        .filter(Boolean) as Array<{ gameId: string; gameDate: string; error: string }>;

      const rows = detailedGames.flatMap((entry, index) => {
        if (!entry.game) return [];
        const game = {
          ...entry.game,
          gameDate: String((teamGames[index] as AnyRecord).gameDate || ""),
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
        String((game as AnyRecord)?.homeTeam?.teamId || "") === team.teamId ||
        String((game as AnyRecord)?.awayTeam?.teamId || "") === team.teamId
      ));

      const detailedGames = await mapWithConcurrency(teamGames, async (game) => {
          const gameId = String((game as AnyRecord).gameId || "");
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
        const gameId = String((game as AnyRecord).gameId || "");
        const gameDate = String((game as AnyRecord).gameDate || "");
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

async function buildLeagueTeamSeasonDataset(season: string) {
  if (!LEAGUE_TEAM_DATASET_CACHE.has(season)) {
    LEAGUE_TEAM_DATASET_CACHE.set(season, (async () => {
      const seasonGames = await fetchSeasonGames(season);
      const detailedGames = await mapWithConcurrency(
        seasonGames,
        (game) => fetchGameDetailsSafe(String((game as AnyRecord).gameId || "")),
      );

      const skippedGames = detailedGames
        .map((entry, index) => (
          entry.error
            ? {
              gameId: String((seasonGames[index] as AnyRecord).gameId || ""),
              gameDate: String((seasonGames[index] as AnyRecord).gameDate || ""),
              error: entry.error,
            }
            : null
        ))
        .filter(Boolean) as Array<{ gameId: string; gameDate: string; error: string }>;

      const rows = detailedGames.flatMap((entry, index) => {
        if (!entry.game) return [];
        const game = {
          ...entry.game,
          gameDate: String((seasonGames[index] as AnyRecord).gameDate || ""),
        } as AnyRecord;
        const homeTeamId = String(game?.homeTeam?.teamId || "");
        const awayTeamId = String(game?.awayTeam?.teamId || "");
        const homeTeam = NBA_TEAMS.find((team) => team.teamId === homeTeamId) || null;
        const awayTeam = NBA_TEAMS.find((team) => team.teamId === awayTeamId) || null;
        const builtRows: CachedTeamGameRow[] = [];
        const metricContext = buildGameMetricContext(game);
        if (homeTeam) {
          const metrics = buildGameMetrics(game, homeTeam.teamId, metricContext);
          const opponentMetrics = buildGameMetrics(game, metrics.opponent.teamId, metricContext);
          builtRows.push({
            teamId: homeTeam.teamId,
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
          });
        }
        if (awayTeam) {
          const metrics = buildGameMetrics(game, awayTeam.teamId, metricContext);
          const opponentMetrics = buildGameMetrics(game, metrics.opponent.teamId, metricContext);
          builtRows.push({
            teamId: awayTeam.teamId,
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
          });
        }
        return builtRows;
      });

      return { rows, skippedGames };
    })());
  }

  return LEAGUE_TEAM_DATASET_CACHE.get(season)!;
}

function parseLeagueRankingRequest(prompt: string) {
  const normalizedPrompt = normalizeText(prompt);
  if (!/\b(team|teams)\b/.test(normalizedPrompt)) return null;
  const metric = findMetricFromPrompt(prompt);
  if (!metric) return null;
  const aggregation = normalizedPrompt.includes("average")
    || normalizedPrompt.includes("per game")
    || normalizedPrompt.includes("averaged")
    ? "season_average"
    : "season_total";
  const seasonScope = parseSeasonScope(prompt);
  return { metric, aggregation, seasonScope } as const;
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
  subjectLabel: string = team.fullName,
): any {
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
    const qualifier = comparatorText
      ? (
        query.playerName
          ? ` when ${query.playerName} posted ${comparatorText} ${metric.label.toLowerCase()}`
          : ` when posting ${comparatorText} ${metric.label.toLowerCase()}`
      )
      : "";
    return {
      aggregation,
      value: wins - losses,
      displayValue: formatRecordDisplay(wins, losses),
      answer: `${query.playerName ? team.fullName : subjectScopeLabel}'s record${qualifier} was ${wins}-${losses}.`,
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
    const season = await resolveSeasonStringForPrompt(prompt);
    const explicitTeam = findTeamFromPrompt(prompt);
    const inferredPlayerTeam = explicitTeam ? null : await inferTeamFromPlayerPrompt(prompt, season).catch(() => null);
    const opponentRecordRequest = parseOpponentRecordRequest(prompt, explicitTeam, inferredPlayerTeam?.team || null);
    if (opponentRecordRequest) {
      const dataset = await buildTeamSubsetDataset(
        season,
        opponentRecordRequest.team,
        opponentRecordRequest.opponents.map((entry) => entry.teamId),
      );
      if (!dataset.rows.length) {
        return jsonResponse(502, {
          error: "Unable to load any completed game details for this request.",
          skippedGames: dataset.skippedGames,
        });
      }

      const opponentIds = new Set<string>(opponentRecordRequest.opponents.map((entry) => entry.teamId));
      const matchingRows = dataset.rows.filter((row) => {
        if (!matchesSeasonScope(row, opponentRecordRequest.seasonScope)) return false;
        if (!opponentIds.has(row.opponent.teamId)) return false;
        if (opponentRecordRequest.resultFilter === "win" && row.result !== "W") return false;
        if (opponentRecordRequest.resultFilter === "loss" && row.result !== "L") return false;
        if (opponentRecordRequest.homeAwayFilter === "home" && !row.isHome) return false;
        if (opponentRecordRequest.homeAwayFilter === "away" && row.isHome) return false;
        return true;
      }).map((row) => ({
        gameId: row.gameId,
        gameDate: row.gameDate,
        opponent: row.opponent,
        value: 0,
        result: row.result,
        teamScore: row.teamScore,
        opponentScore: row.opponentScore,
        margin: row.margin,
        isHome: row.isHome,
        seasonType: row.seasonType,
      }));

      const wins = matchingRows.filter((row) => row.result === "W").length;
      const losses = matchingRows.filter((row) => row.result === "L").length;
      const opponentLabel = opponentRecordRequest.opponents.map((entry) => entry.tricode).join(", ");
      return jsonResponse(200, {
        prompt,
        season,
        team: {
          teamId: opponentRecordRequest.team.teamId,
          tricode: opponentRecordRequest.team.tricode,
          fullName: opponentRecordRequest.team.fullName,
        },
        filters: {
          opponent: opponentRecordRequest.opponents.map((entry) => ({
            teamId: entry.teamId,
            tricode: entry.tricode,
            fullName: entry.fullName,
          })),
          resultFilter: opponentRecordRequest.resultFilter,
          homeAwayFilter: opponentRecordRequest.homeAwayFilter,
          seasonScope: opponentRecordRequest.seasonScope,
          sort: "desc",
          limit: null,
          groupBy: "none",
        },
        stat: {
          key: "record",
          label: "Record",
        },
        parsedQuery: {
          aggregation: "record",
          seasonScope: opponentRecordRequest.seasonScope,
        },
        result: {
          aggregation: "record",
          value: wins - losses,
          displayValue: `${wins}-${losses}`,
          answer: `${opponentRecordRequest.team.fullName}'s record against ${opponentLabel} was ${wins}-${losses}.`,
          games: matchingRows,
          sampleSize: matchingRows.length,
          groups: [],
          record: {
            wins,
            losses,
            winPct: matchingRows.length ? (wins / matchingRows.length) * 100 : 0,
          },
        },
        skippedGames: dataset.skippedGames,
      });
    }

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
    const leagueRankingRequest = !explicitTeam && !extractLikelyPlayerName(prompt, null)
      ? parseLeagueRankingRequest(prompt)
      : null;
    if (leagueRankingRequest) {
      const dataset = await buildLeagueTeamSeasonDataset(season);
      if (!dataset.rows.length) {
        return jsonResponse(502, {
          error: "Unable to load any completed game details for this request.",
          skippedGames: dataset.skippedGames,
        });
      }

      const rows = dataset.rows.filter((row) => matchesSeasonScope(row, leagueRankingRequest.seasonScope));
      const byTeam = new Map<string, { team: (typeof NBA_TEAMS)[number]; games: CachedTeamGameRow[] }>();
      rows.forEach((row) => {
        const resolvedTeam = NBA_TEAMS.find((entry) => entry.teamId === String((row as Record<string, unknown>).teamId || "")) || null;
        if (!resolvedTeam) return;
        const key = `${row.gameId}:${resolvedTeam.teamId}`;
        const rowWithTeam = { ...row } as CachedTeamGameRow & { teamId: string };
        if (!byTeam.has(resolvedTeam.teamId)) {
          byTeam.set(resolvedTeam.teamId, { team: resolvedTeam, games: [] });
        }
        const group = byTeam.get(resolvedTeam.teamId)!;
        if (!group.games.some((entry) => `${entry.gameId}:${String((entry as Record<string, unknown>).teamId || resolvedTeam.teamId)}` === key)) {
          group.games.push(rowWithTeam);
        }
      });

      const ranked = [...byTeam.values()].map((entry) => {
        const total = entry.games.reduce((sum, game) => sum + safeNumber((game.metrics as Record<string, unknown>)[leagueRankingRequest.metric.key], 0), 0);
        const average = entry.games.length ? total / entry.games.length : 0;
        const wins = entry.games.filter((game) => game.result === "W").length;
        const losses = entry.games.filter((game) => game.result === "L").length;
        return {
          team: entry.team,
          games: entry.games.length,
          wins,
          losses,
          total,
          average,
          value: leagueRankingRequest.aggregation === "season_average" ? average : total,
        };
      }).sort((left, right) => right.value - left.value);

      return jsonResponse(200, {
        prompt,
        season,
        team: null,
        filters: {
          seasonScope: leagueRankingRequest.seasonScope,
        },
        stat: {
          key: leagueRankingRequest.metric.key,
          label: leagueRankingRequest.metric.label,
        },
        parsedQuery: {
          aggregation: "league_ranking",
          seasonScope: leagueRankingRequest.seasonScope,
        },
        result: {
          aggregation: "league_ranking",
          value: ranked.length,
          displayValue: `${ranked.length}`,
          answer: `Showing teams ranked by ${leagueRankingRequest.metric.label.toLowerCase()} ${leagueRankingRequest.aggregation === "season_average" ? "per game" : "total"}${leagueRankingRequest.seasonScope !== "all" ? ` in the ${leagueRankingRequest.seasonScope}` : ""}.`,
          games: [],
          sampleSize: ranked.length,
          groups: [],
          table: {
            columns: [
              { key: "rank", label: "Rank" },
              { key: "team", label: "Team" },
              { key: "value", label: leagueRankingRequest.aggregation === "season_average" ? "AVG" : "TOTAL" },
              { key: "games", label: "Games" },
              { key: "record", label: "Record" },
            ],
            rows: ranked.map((entry, index) => ({
              rank: index + 1,
              team: entry.team.tricode,
              value: leagueRankingRequest.aggregation === "season_average"
                ? formatAverageValue(entry.average, leagueRankingRequest.metric)
                : formatValue(entry.total, leagueRankingRequest.metric),
              games: entry.games,
              record: `${entry.wins}-${entry.losses}`,
            })),
          },
        },
        skippedGames: dataset.skippedGames,
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

    let parsed: ParsedQuery | null = null;
    let team: (typeof NBA_TEAMS)[number] | null = null;
    let metric: MetricDefinition | null = null;
    let openAiParsed: ParsedQuery | null = null;

    const fallbackCandidate = scoreParsedCandidate(fallbackParsed, {
      prompt,
      promptHasExplicitOpponent,
      explicitOrImplicitThreshold,
      inferredPlayerTeam,
      sourceBonus: 25,
    });
    let selectedCandidate = fallbackCandidate;

    if (!selectedCandidate) {
      openAiParsed = await parsePromptWithOpenAI(prompt)
        .then((value) => normalizeParsedQuery(value))
        .catch(() => null);
      selectedCandidate = scoreParsedCandidate(openAiParsed, {
        prompt,
        promptHasExplicitOpponent,
        explicitOrImplicitThreshold,
        inferredPlayerTeam,
        sourceBonus: 0,
      });
    }

    if (selectedCandidate) {
      parsed = selectedCandidate.parsed;
      team = selectedCandidate.team;
      metric = selectedCandidate.metric;
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
      const playerDataset = await buildSinglePlayerSeasonDataset(season, team, parsed.playerId);
      rowsForQuery = playerDataset.rows;
      skippedGames = playerDataset.skippedGames;
    } else if (parsed.groupBy === "period" && metric.key === "points") {
      const teamPeriodDataset = await buildTeamPeriodPointsDataset(season, team);
      rowsForQuery = teamPeriodDataset.rows;
      skippedGames = teamPeriodDataset.skippedGames;
    } else {
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
      if (specificPeriod === "H1") {
        rowsForQuery = collapsePeriodRowsToCombinedSpanRows(rowsForQuery, "H1", ["Q1", "Q2"]);
        parsed.groupBy = "none";
      } else if (specificPeriod === "H2") {
        rowsForQuery = collapsePeriodRowsToCombinedSpanRows(rowsForQuery, "H2", ["Q3", "Q4"]);
        parsed.groupBy = "none";
      } else {
        rowsForQuery = rowsForQuery.filter((row) => row.groupKey === specificPeriod);
      }
    }
    if (parsed.groupBy === "period" && isSingleQuarterThresholdPrompt(prompt) && (
      parsed.aggregation === "count_games_gte"
      || parsed.aggregation === "count_games_lte"
      || parsed.aggregation === "count_games_nonzero"
      || parsed.aggregation === "record_when_gte"
      || parsed.aggregation === "record_when_lte"
      || parsed.aggregation === "record_when_nonzero"
    )) {
      rowsForQuery = collapsePeriodRowsToGameThresholdRows(rowsForQuery, parsed.aggregation, metric.key);
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
