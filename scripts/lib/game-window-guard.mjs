const WIZARDS_TRICODE = "WAS";
const SCOREBOARD_URL = "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";
const BLOCK_BEFORE_MS = 60 * 60 * 1000;
const BLOCK_AFTER_MS = 4 * 60 * 60 * 1000;

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function teamCode(team = {}) {
  return String(team.teamTricode || team.teamAbbreviation || team.triCode || "").trim().toUpperCase();
}

function gameStatus(game = {}) {
  return Number(game.gameStatus || game.gameStatusId || 0);
}

function parseTipMs(game = {}) {
  const candidates = [
    game.gameTimeUTC,
    game.gameEt,
    game.gameDateTimeUTC,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function isWizardsGame(game = {}) {
  return teamCode(game.homeTeam) === WIZARDS_TRICODE || teamCode(game.awayTeam) === WIZARDS_TRICODE;
}

async function fetchTodayGames() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(SCOREBOARD_URL, {
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Maintenance Guard)",
      },
    });
    if (!response.ok) throw new Error(`scoreboard failed (${response.status})`);
    const payload = await response.json();
    return Array.isArray(payload?.scoreboard?.games) ? payload.scoreboard.games : [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function assertOutsideWizardsGameWindow(jobName = "maintenance job") {
  if (hasFlag("force") || process.env.ALLOW_GAME_WINDOW_JOBS === "1") return;

  let games = [];
  try {
    games = await fetchTodayGames();
  } catch (error) {
    console.warn(`Could not verify Wizards game window before ${jobName}: ${error.message}`);
    return;
  }

  const game = games.find(isWizardsGame);
  if (!game) return;

  const status = gameStatus(game);
  const tipMs = parseTipMs(game);
  const nowMs = Date.now();
  const live = status === 2;
  const withinWindow = Number.isFinite(tipMs)
    && nowMs >= tipMs - BLOCK_BEFORE_MS
    && nowMs <= tipMs + BLOCK_AFTER_MS;

  if (live || withinWindow) {
    const away = teamCode(game.awayTeam) || "Away";
    const home = teamCode(game.homeTeam) || "Home";
    throw new Error(
      `Refusing to run ${jobName} during the Wizards game window (${away} @ ${home}). ` +
      "Run again with --force or ALLOW_GAME_WINDOW_JOBS=1 if this is intentional."
    );
  }
}
