import { isWashingtonGame, nbaClipsUrl, washingtonEventClipUrl } from "./nbaClipsTrial.js";

const LIVE_ACTIONS = new Set(["2pt", "3pt", "rebound", "turnover", "foul", "jumpball"]);

function remainingSeconds(clock) {
  const match = /^(?:PT)?(\d+)(?:M|:)(\d+(?:\.\d+)?)(?:S)?$/.exec(String(clock || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

export function buildTimedNoteClipMeta({ gameId, periodLabel, minutes, seconds, tags, actions = [], shiftPlaycall = true }) {
  if (minutes == null || seconds == null || minutes === "" || seconds === "") return null;
  const minute = Number(minutes);
  const second = Number(seconds);
  let period = /^Q[1-4]$/.test(periodLabel) ? Number(periodLabel.slice(1)) : null;
  if (periodLabel === "OT") {
    const overtimes = [...new Set(actions.map((a) => Number(a.period)).filter((p) => p > 4))];
    if (overtimes.length === 1) period = overtimes[0];
  }
  if (!period || !Number.isInteger(minute) || !Number.isInteger(second) || minute < 0 || second < 0 || second > 59) return null;
  const clock = minute * 60 + second;
  if (clock > (period > 4 ? 300 : 720)) return null;
  const isPlaycall = shiftPlaycall && Array.isArray(tags) && tags.includes("Playcall");
  const clipClock = Math.max(0, clock - (isPlaycall ? 10 : 0));
  const candidatesFor = (target) => actions.filter((action) => Number(action.period) === period
    && (isPlaycall ? LIVE_ACTIONS.has(action.actionType) : action.actionType !== "status"))
    .map((action) => ({ action, remaining: remainingSeconds(action.clock), instant: Date.parse(action.timeActual) }))
    .filter(({ action, remaining, instant }) => Number.isFinite(instant) && Math.abs(remaining - target) <= 5
      && nbaClipsUrl(gameId, action))
    .sort((a, b) => Math.abs(a.remaining - target) - Math.abs(b.remaining - target) || a.instant - b.instant);
  let anchor = candidatesFor(clipClock)[0];
  let targetClock = clipClock;
  let forwardSeconds = 0;
  // During live entry, the desired +10-second event may not exist yet. An
  // exact note-clock anchor can still create a forward-looking clip safely.
  if (!anchor && isPlaycall) {
    anchor = candidatesFor(clock).find((candidate) => candidate.remaining === clock);
    targetClock = clock;
    forwardSeconds = Math.min(10, clock);
  }
  if (!anchor) return null;
  // Shift the lookup clock, not the displayed note clock: Q1 5:03 -> Q1 4:53.
  // Keep the standard ten-second video lead-in. Interpolate only a small gap
  // in a running clock, never across a known clock-stopping action.
  const stoppageTypes = new Set(["timeout", "foul", "freethrow", "substitution", "instantreplay", "replay"]);
  if (anchor.remaining !== targetClock && actions.some((action) => Number(action.period) === period
    && stoppageTypes.has(String(action.actionType).toLowerCase())
    && remainingSeconds(action.clock) >= Math.min(anchor.remaining, targetClock)
    && remainingSeconds(action.clock) <= Math.max(anchor.remaining, targetClock))) return null;
  const clipInstant = anchor.instant + (anchor.remaining - targetClock + forwardSeconds) * 1000;
  const clipUrl = nbaClipsUrl(gameId, { timeActual: new Date(clipInstant).toISOString() });
  if (!clipUrl) return null;
  return { type: isPlaycall ? "custom_playcall" : "custom_note", action_number: anchor.action.actionNumber, clip_url: clipUrl };
}

// Preserve the earlier behavior for non-Washington custom Playcall notes.
export function buildCustomPlaycallClipMeta(options) {
  return options.tags?.includes("Playcall") ? buildTimedNoteClipMeta(options) : null;
}

export function resolveNoteClipUrl(note, game) {
  const stored = String(note?.source_meta?.clip_url || "");
  if (!game) return /^https:\/\/clips\.nba\.com\//.test(stored) ? stored : null;
  if (!isWashingtonGame(game)) return stored || null;
  const gameId = String(note.game_id || game.gameId || "");
  if (String(game.gameId) !== gameId) return null;
  const source = note.source_meta || {};
  if (source.type === "pbp") {
    const action = (game.playByPlayActions || []).find((event) => String(event.actionNumber) === String(source.action_number));
    const direct = washingtonEventClipUrl(game, action);
    if (direct) return direct;
  }
  const timed = buildTimedNoteClipMeta({ gameId, periodLabel: note.period_label, minutes: note.minutes,
    seconds: note.seconds, tags: note.tags, actions: game.playByPlayActions || [], shiftPlaycall: source.type !== "pbp" });
  if (timed) return timed.clip_url;
  if (/^https:\/\/clips\.nba\.com\//.test(stored)) return stored;
  // Untimed notes actually created during play can use their creation timestamp.
  // Postgame/undated notes must never be assigned an invented game event.
  if (note.minutes == null && note.seconds == null) {
    const times = (game.playByPlayActions || []).map((event) => Date.parse(event.timeActual)).filter(Number.isFinite);
    const created = Date.parse(note.created_at);
    if (times.length && created >= Math.min(...times) && created <= Math.max(...times)) {
      return nbaClipsUrl(gameId, { timeActual: new Date(created + (note.tags?.includes("Playcall") ? 10_000 : 0)).toISOString() });
    }
  }
  return null;
}
