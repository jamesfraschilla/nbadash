// Public NBA feed data only. Never persist notes, drawings, auth or tool drafts.
const KEY = "nba-dashboard:public-game-snapshots:v1";
const MAX_CHARS = 1_200_000;
const MAX_ENTRIES = 2;
const MAX_AGE = 72 * 60 * 60_000;
const FIELDS = ["gameId", "gameCode", "gameStatus", "gameStatusText", "period", "gameClock", "gameTimeUTC", "gameEt", "seasonYear", "seasonType", "arena", "homeTeam", "awayTeam", "officials", "callsAgainst", "timeouts", "challenges", "teamStats", "boxScore", "playByPlayActions", "feedAvailability", "segmentDataQuality"];
let lastWrite = new Map();
const memory = new WeakMap();
const storage = () => { try { return globalThis.window?.localStorage; } catch { return null; } };
const segmentKey = segment => String(segment || "all").toUpperCase();
export function usableSnapshot(game, gameId) {
  return String(game?.gameId) === String(gameId)
    && Boolean(game?.homeTeam?.teamId && game?.awayTeam?.teamId)
    && [1, 2, 3].includes(Number(game.gameStatus))
    && (Number(game.gameStatus) === 1 || (Array.isArray(game.playByPlayActions) && game.playByPlayActions.length > 0));
}
function readEntries(store, now) {
  try {
    const cached = store && memory.get(store);
    if (cached && now >= cached.readAt && now - cached.readAt < 30_000) return cached.entries.filter(e => now - e.savedAt < MAX_AGE);
    const raw = store?.getItem(KEY);
    if (!raw || raw.length > MAX_CHARS) return [];
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed.filter(e => Number.isFinite(e.savedAt) && e.savedAt <= now && now - e.savedAt < MAX_AGE && usableSnapshot(e.game, e.gameId)).slice(0, MAX_ENTRIES) : [];
    if (store) memory.set(store, { readAt: now, entries });
    return entries;
  } catch { return []; }
}
export function readGameSnapshot(gameId, segment, { store = storage(), now = Date.now() } = {}) {
  return readEntries(store, now).find(e => e.gameId === String(gameId) && e.segment === segmentKey(segment)) || null;
}
export function saveGameSnapshot(game, segment, { store = storage(), now = Date.now() } = {}) {
  if (!store || !usableSnapshot(game, game?.gameId)) return false;
  const key = `${game.gameId}:${segmentKey(segment)}`;
  if (now - (lastWrite.get(key) || 0) < 30_000) return false;
  const publicGame = Object.fromEntries(FIELDS.filter(f => game[f] !== undefined).map(f => [f, game[f]]));
  const entry = { gameId: String(game.gameId), segment: segmentKey(segment), savedAt: now, game: publicGame };
  const entries = [entry, ...readEntries(store, now).filter(e => `${e.gameId}:${e.segment}` !== key)].slice(0, MAX_ENTRIES);
  try {
    let raw = JSON.stringify(entries);
    while (raw.length > MAX_CHARS && entries.length > 1) { entries.pop(); raw = JSON.stringify(entries); }
    if (raw.length > MAX_CHARS) return false;
    store.setItem(KEY, raw);
    memory.set(store, { readAt: now, entries });
    lastWrite.set(key, now);
    if (lastWrite.size > 16) lastWrite = new Map([[key, now]]);
    return true;
  } catch { return false; } // Never evict user state to make space for this cache.
}
