import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { aggregateSegmentStats, countPossessionsByTeam } from '../src/segmentStats.js';
import { normalizeGameMidrangeStats } from '../src/boxScoreNormalization.js';
import { normalizeOpeningMinutesData } from '../supabase/functions/_shared/minutesNormalization.ts';

const root = path.resolve(process.env.AUDIT_OUTPUT || 'output/gleague-feed-audit-2052600033');
const sample = JSON.parse(await fs.readFile(path.join(root, 'latest.json'), 'utf8'));
const records = Object.fromEntries(sample.results.map((result) => [result.source, result]));
async function snapshot(source) {
  const record = records[source];
  if (!record?.snapshot || record.error) return null;
  return JSON.parse(gunzipSync(await fs.readFile(path.join(root, record.snapshot))).toString());
}
const result = { sampledAt: sample.sampled_at, gameId: sample.game_id };
try {
  const [original, pbp, minutes] = await Promise.all(['trail_game', 'trail_pbp', 'trail_minutes'].map(snapshot));
  if (!original || String(original.gameId) !== sample.game_id) throw Error('Game feed unavailable');
  const actions = pbp?.playByPlayActions || [];
  if (Number(original.gameStatus) >= 2 && !actions.length) throw Error('Live play-by-play unavailable');
  const game = normalizeGameMidrangeStats({ ...original, playByPlayActions: actions });
  const minuteData = minutes ? normalizeOpeningMinutesData(minutes, game) : null;
  const basePlayers = ['home', 'away'].flatMap((side) => (game.boxScore?.[side]?.players || [])
    .map((player) => ({ ...player, teamId: game[`${side}Team`].teamId })));
  const computed = aggregateSegmentStats({ gameId: game.gameId, actions, segment: 'all', minutesData: minuteData,
    homeTeam: game.homeTeam, awayTeam: game.awayTeam, basePlayers,
    currentPeriod: game.period, currentClock: game.gameClock, isLive: Number(game.gameStatus) === 2 });
  result.status = 'processed';
  result.gameStatus = game.gameStatus;
  result.period = game.period;
  result.clock = game.gameClock;
  result.playCount = actions.length;
  result.minutesPeriods = minuteData?.periods?.length ?? null;
  result.playersProcessed = computed.playerMap.size;
  result.possessions = countPossessionsByTeam(actions, 'all', game.homeTeam.teamId, game.awayTeam.teamId);
  result.teams = Object.fromEntries(['away', 'home'].map((side) => {
    const team = game[`${side}Team`];
    const box = game.boxScore[side].totals || {};
    const derived = computed.teamTotals[team.teamId] || {};
    return [side, { teamId: team.teamId, score: team.score, boxPoints: box.points,
      derivedPoints: derived.points, boxFieldGoalsMade: box.fieldGoalsMade, derivedFieldGoalsMade: derived.fieldGoalsMade,
      boxFreeThrowsMade: box.freeThrowsMade, derivedFreeThrowsMade: derived.freeThrowsMade }];
  }));
} catch (error) {
  result.status = 'unavailable';
  result.error = error.message;
}
await fs.appendFile(path.join(root, 'processing.jsonl'), `${JSON.stringify(result)}\n`);
console.log('DASHBOARD_PROCESSING', JSON.stringify(result));
