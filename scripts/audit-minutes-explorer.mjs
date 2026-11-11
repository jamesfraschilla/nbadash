import { fetchNbaMinutes } from "../supabase/functions/_shared/nbaMinutes.js";
import { fetchNbaGame } from "../supabase/functions/_shared/nbaGame.js";
// Read-only audit against the currently published game and NBA PBP feeds.
import fs from "node:fs";
import path from "node:path";
import { buildMinutesExplorer, playerTimeline } from "../src/minutesExplorer.js";
import { normalizeOpeningMinutesData } from "../supabase/functions/_shared/minutesNormalization.ts";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env-dir");
const envDirectory = envIndex >= 0 ? args.splice(envIndex, 2)[1] : process.cwd();
const env = { ...process.env };
for (const name of [".env", ".env.local"]) {
  const file = path.join(envDirectory, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)=(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) throw new Error("Supabase URL and anonymous API key required for the existing PBP proxy.");
const get = async (url, options = {}) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
  return response.json();
};
for (const gameId of args.length ? args : ["0022600015"]) {
  if (!/^\d{10}$/.test(gameId)) throw new Error("Expected a ten-digit game ID.");
  const game = await fetchNbaGame(gameId, process.env.NBA_API_KEY || env.NBA_API_KEY);
  const [minutes, pbp, nba] = await Promise.all([
    fetchNbaMinutes(game, process.env.NBA_API_KEY || env.NBA_API_KEY),
    get(`${env.VITE_SUPABASE_URL}/functions/v1/game-metadata`, { method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ playByPlayGameId: gameId }) }),
    get(`${env.VITE_SUPABASE_URL}/functions/v1/game-metadata`, { method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ liveGameId: gameId }) }),
  ]);
  game.playByPlayActions = pbp.game?.actions;
  const model = buildMinutesExplorer(normalizeOpeningMinutesData(minutes, game), game);
  if (process.env.MINUTES_DEBUG === "1") {
    console.log(JSON.stringify(game.playByPlayActions.filter((row) => row.period === 1 && /06M(37|22)/.test(row.clock)).map(({ actionNumber, orderNumber, clock, actionType, subType, description, scoreHome, scoreAway }) => ({ actionNumber, orderNumber, clock, actionType, subType, description, scoreHome, scoreAway }))));
    for (const record of model.records) {
      const events = model.scoringEvents.filter((event) => event.period === record.period && event.elapsed >= record.start && event.elapsed <= record.end
        && event.home.slice().sort().join() === record.playersHome.map((player) => String(player.personId)).sort().join()
        && event.away.slice().sort().join() === record.playersAway.map((player) => String(player.personId)).sort().join());
      const home = events.filter((event) => event.homeMargin > 0).reduce((sum, event) => sum + event.homeMargin, 0);
      const away = events.filter((event) => event.homeMargin < 0).reduce((sum, event) => sum - event.homeMargin, 0);
      if (home !== record.homeScore || away !== record.awayScore) console.log(JSON.stringify({ period: record.period, start: record.startClock, end: record.endClock, feed: [record.homeScore, record.awayScore], events: [home, away] }));
    }
  }
  const mismatches = [];
  for (const side of ["away", "home"]) for (const player of playerTimeline(model, side)) {
    const boxPlayer = game.boxScore[side].players.find((row) => String(row.personId) === String(player.personId));
    const expected = boxPlayer?.plusMinusPoints;
    const actual = player.intervals.reduce((sum, interval) => sum + interval.margin, 0);
    const nbaExpected = nba.game?.boxScore?.[side]?.players?.find((row) => String(row.personId) === String(player.personId))?.plusMinusPoints;
    if (expected != null && actual !== Number(expected)) mismatches.push({ name: player.nameI, expected, nbaExpected, actual });
  }
  console.log(JSON.stringify({ gameId, events: game.playByPlayActions?.length, issues: model.issues,
    players: Object.fromEntries(["away", "home"].map((side) => [side, model.rosters[side].length])), playerPlusMinusMismatches: mismatches }));
  if (model.issues.length || mismatches.length) process.exitCode = 1;
}
