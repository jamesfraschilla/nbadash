import { nbaClipsUrl } from "./nbaClipsTrial.js";

const LIVE_ACTIONS = new Set(["2pt", "3pt", "rebound", "turnover", "foul", "jumpball"]);

function remainingSeconds(clock) {
  const match = /^(?:PT)?(\d+)(?:M|:)(\d+(?:\.\d+)?)(?:S)?$/.exec(String(clock || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

// Only new custom Playcall notes use this. No saved note clocks or prior notes
// are rewritten, and notes created directly from a play retain their source.
export function buildCustomPlaycallClipMeta({ gameId, periodLabel, minutes, seconds, tags, actions = [] }) {
  if (!Array.isArray(tags) || !tags.includes("Playcall")) return null;
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
  if (clock > (period > 4 ? 300 : 720) || clock < 10) return null;
  const clipClock = clock - 10;
  const candidates = actions.filter((action) => Number(action.period) === period && LIVE_ACTIONS.has(action.actionType))
    .map((action) => ({ action, remaining: remainingSeconds(action.clock), instant: Date.parse(action.timeActual) }))
    .filter(({ action, remaining, instant }) => Number.isFinite(instant) && Math.abs(remaining - clipClock) <= 5
      && nbaClipsUrl(gameId, action))
    .sort((a, b) => Math.abs(a.remaining - clipClock) - Math.abs(b.remaining - clipClock) || a.instant - b.instant);
  const anchor = candidates[0];
  if (!anchor) return null;
  // Shift the lookup clock, not the displayed note clock: Q1 5:03 -> Q1 4:53.
  // Keep the standard ten-second video lead-in. Interpolate only a small gap
  // in a running clock, never across a known clock-stopping action.
  const stoppageTypes = new Set(["timeout", "foul", "freethrow", "substitution", "instantreplay", "replay"]);
  if (anchor.remaining !== clipClock && actions.some((action) => Number(action.period) === period
    && stoppageTypes.has(String(action.actionType).toLowerCase())
    && remainingSeconds(action.clock) >= Math.min(anchor.remaining, clipClock)
    && remainingSeconds(action.clock) <= Math.max(anchor.remaining, clipClock))) return null;
  const clipInstant = anchor.instant + (anchor.remaining - clipClock) * 1000;
  const clipUrl = nbaClipsUrl(gameId, { timeActual: new Date(clipInstant).toISOString() });
  if (!clipUrl) return null;
  return { type: "custom_playcall", action_number: anchor.action.actionNumber, clip_url: clipUrl };
}
