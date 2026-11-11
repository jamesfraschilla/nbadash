import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNbaMinutes } from './nbaMinutes.js';
function fixture() {
  const gameId = '0022200701';
  const roster = [1, 2].flatMap(team => Array.from({ length: 5 }, (_, i) => ({ Game_Id: gameId, Person_id: team * 100 + i, Team_id: team, Period: 1, Person_Type: 'Player', First_Name: 'A', Last_Name: String(i) })));
  const team = id => ({ teamId: id, periods: [{ period: 1, score: id === 1 ? 2 : 0 }] });
  const players = team => roster.filter(p => p.Team_id === team).map(p => ({ personId: p.Person_id, minutes: 'PT12M00.00S', plusMinusPoints: team === 1 ? 2 : -2 }));
  const poc = [{ Game_id: gameId, Event_Num: 1, PlayersPlusMinus: roster.map(p => ({ Team_id: p.Team_id, Person_id: p.Person_id })) }];
  return { roster, poc, game: { gameId, gameStatus: 3, period: 1, gameClock: 'PT00M00.00S', homeTeam: team(1), awayTeam: team(2), boxScore: { home: { players: players(1) }, away: { players: players(2) } }, playByPlayActions: [{ period: 1, clock: 'PT09M00.00S', actionNumber: 1, teamId: 1, actionType: '2pt', shotResult: 'Made' }] } };
}
test('reconstructs verified starting lineups and scoring', () => {
  const { game, roster, poc } = fixture();
  const result = buildNbaMinutes(game, roster, poc);
  assert.equal(result.periods[0].stints[0].homeScore, 2);
  assert.equal(result.periods[0].stints[0].playersHome.length, 5);
  assert.equal(result.periods[0].stints[0].endClock, '0:00');
});
test('rejects mismatched plus-minus and incomplete lineups', () => {
  const { game, roster, poc } = fixture(); game.boxScore.home.players[0].plusMinusPoints = 1;
  assert.throws(() => buildNbaMinutes(game, roster, poc), /scoring does not reconcile/);
  assert.throws(() => buildNbaMinutes(game, roster.slice(1), poc), /starting lineup incomplete/);
});
test('reconstructs simultaneous substitutions and guards bad minutes', () => {
  const { game, roster, poc } = fixture();
  const sub = { Game_Id: game.gameId, Person_id: 105, Team_id: 1, Period: 0, Person_Type: 'Player', First_Name: 'B', Last_Name: 'Five' };
  roster.push(sub);
  game.boxScore.home.players[0].minutes = 'PT06M00.00S';
  game.boxScore.home.players.push({ personId: 105, minutes: 'PT06M00.00S', plusMinusPoints: 0 });
  game.playByPlayActions.push({ period: 1, clock: 'PT06M00.00S', actionNumber: 2, teamId: 1, actionType: 'substitution', subType: 'out', personId: 100 }, { period: 1, clock: 'PT06M00.00S', actionNumber: 3, teamId: 1, actionType: 'substitution', subType: 'in', personId: 105 });
  assert.equal(buildNbaMinutes(game, roster, poc).periods[0].stints.length, 2);
  game.boxScore.home.players[0].minutes = 'PT07M00.00S';
  assert.throws(() => buildNbaMinutes(game, roster, poc), /minutes do not reconcile/);
});
test('uses NBA event lineups for scoring at a substitution boundary', () => {
  const { game, roster, poc } = fixture();
  roster.push({ Game_Id: game.gameId, Person_id: 105, Team_id: 1, Period: 0, Person_Type: 'Player', First_Name: 'B', Last_Name: 'Five' });
  game.boxScore.home.players[0].minutes = 'PT06M00.00S';
  game.boxScore.home.players[0].plusMinusPoints = 0;
  game.boxScore.home.players.push({ personId: 105, minutes: 'PT06M00.00S', plusMinusPoints: 2 });
  game.playByPlayActions[0].clock = 'PT06M00.00S';
  game.playByPlayActions.push({ period: 1, clock: 'PT06M00.00S', actionNumber: 2, teamId: 1, actionType: 'substitution', subType: 'out', personId: 100 }, { period: 1, clock: 'PT06M00.00S', actionNumber: 3, teamId: 1, actionType: 'substitution', subType: 'in', personId: 105 });
  poc[0].PlayersPlusMinus = poc[0].PlayersPlusMinus.map(p => p.Person_id === 100 ? { ...p, Person_id: 105 } : p);
  const [first, second] = buildNbaMinutes(game, roster, poc).periods[0].stints;
  assert.equal(first.homeScore, 0); assert.equal(second.homeScore, 2);
  assert.throws(() => buildNbaMinutes(game, roster, []), /no players-on-court/);
});
test('credits a G League one-for-two free throw as two points', () => {
  const { game, roster, poc } = fixture();
  game.gameId = '2022200155'; roster.forEach(row => { row.Game_Id = game.gameId; }); poc[0].Game_id = game.gameId;
  game.playByPlayActions[0] = { ...game.playByPlayActions[0], actionType: 'freethrow', subType: '1for2' };
  assert.equal(buildNbaMinutes(game, roster, poc).periods[0].stints[0].homeScore, 2);
});
test('identifies a final score conflict when lineup scoring also fails', () => {
  const { game, roster, poc } = fixture();
  game.homeTeam.score = 2; game.awayTeam.score = 0;
  game.boxScore.home.players[0].plusMinusPoints = 1;
  game.playByPlayActions[0].scoreHome = '1';
  game.playByPlayActions[0].scoreAway = '0';
  assert.throws(() => buildNbaMinutes(game, roster, poc), { code: 'FINAL_SCORE_CONFLICT' });
});
test('retries an incomplete on-court feed once and returns only reconciled data', async () => {
  const { game, roster, poc } = fixture();
  const { fetchNbaMinutes } = await import('./nbaMinutes.js');
  let pocCalls = 0;
  const fetcher = async url => ({ ok: true, json: async () => {
    if (url.pathname.endsWith('/rosterlineup')) return roster;
    pocCalls++;
    return pocCalls === 1 ? [] : poc;
  } });
  const result = await fetchNbaMinutes(game, 'key', fetcher);
  assert.equal(result.periods[0].stints[0].homeScore, 2);
  assert.equal(pocCalls, 2);
});

test('accepts stale event score snapshots when period totals and player margins reconcile', () => {
  const { game, roster, poc } = fixture();
  game.homeTeam.score = 2; game.awayTeam.score = 0;
  game.playByPlayActions[0].scoreHome = '1'; game.playByPlayActions[0].scoreAway = '0';
  assert.equal(buildNbaMinutes(game, roster, poc).periods[0].stints[0].homeScore, 2);
});
test('does not retry independent source conflicts', async () => {
  const { game, roster, poc } = fixture();
  game.homeTeam.score = 2; game.awayTeam.score = 0;
  game.boxScore.home.players[0].plusMinusPoints = 1;
  game.playByPlayActions[0].scoreHome = '1'; game.playByPlayActions[0].scoreAway = '0';
  const { fetchNbaMinutes } = await import('./nbaMinutes.js');
  let pocCalls = 0;
  const fetcher = async url => ({ ok: true, json: async () => {
    if (url.pathname.endsWith('/rosterlineup')) return roster;
    pocCalls++; return poc;
  } });
  await assert.rejects(fetchNbaMinutes(game, 'key', fetcher), { code: 'FINAL_SCORE_CONFLICT' });
  assert.equal(pocCalls, 1);
});
