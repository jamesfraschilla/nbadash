import { nbaClipsUrl } from "./nbaClipsTrial.js";

export function verifiedChallengeVideoUrl(row) {
  // Never synthesize a URL from the replay marker itself. video_url is populated
  // either by the official weekly log or by the conservative play-by-play
  // matcher when an immediately preceding reviewable action shares the clock.
  return String(row?.video_url || row?.videoUrl || "").trim() || null;
}

function clockSeconds(value) {
  const text = String(value || "");
  const match = /^(?:PT)?(\d+)(?:M|:)(\d+(?:\.\d+)?)(?:S)?$/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

export function buildChallengeClockClipUrl(row, game) {
  const gameId = String(row?.game_id || row?.gameId || "");
  if (String(game?.gameId) !== gameId) return null;
  const clock = clockSeconds(row.game_clock || row.gameClock);
  if (!Number.isFinite(clock)) return null;
  const adminTypes = new Set(["instantreplay", "replay", "timeout", "substitution", "period", "game", "status", "memo"]);
  const timestamped = (game.playByPlayActions || []).filter(action => Number(action.period) === Number(row.period)
    && nbaClipsUrl(gameId, action));
  const candidates = timestamped.filter(action => !adminTypes.has(action.actionType));
  let matches = candidates.filter(action => Math.abs(clockSeconds(action.clock) - clock) < 0.11)
    .sort((a, b) => Number(adminTypes.has(a.actionType)) - Number(adminTypes.has(b.actionType))
      || Date.parse(a.timeActual) - Date.parse(b.timeActual));
  if (!matches.length) {
    // The PDF's trigger clock can differ slightly from the corrected PBP call.
    // Accept only a unique nearest reviewable clock within the existing
    // official-match tolerance; never interpolate through a dead-ball delay.
    const nearby = candidates.filter(action => ["foul", "violation", "turnover"].includes(action.actionType)
      && Math.abs(clockSeconds(action.clock) - clock) <= 2)
      .sort((a, b) => Math.abs(clockSeconds(a.clock) - clock) - Math.abs(clockSeconds(b.clock) - clock)
        || Date.parse(a.timeActual) - Date.parse(b.timeActual));
    if (nearby.length && !nearby.some(action => clockSeconds(action.clock) !== clockSeconds(nearby[0].clock)
      && Math.abs(clockSeconds(action.clock) - clock) === Math.abs(clockSeconds(nearby[0].clock) - clock))) matches = [nearby[0]];
  }
  if (!matches.length) {
    // Unlike the obsolete NBA event-video pages, timestamp clips can show a
    // replay/review itself. Use its actual timestamp when the original call
    // has been removed from corrected PBP, without pretending it is the play.
    matches = timestamped.filter(action => ["instantreplay", "replay"].includes(action.actionType)
      && Math.abs(clockSeconds(action.clock) - clock) < 0.11)
      .sort((a, b) => Date.parse(a.timeActual) - Date.parse(b.timeActual));
  }
  return matches.length ? nbaClipsUrl(gameId, matches[0]) : null;
}

export function challengeLinkIdentity(row) {
  return [row.game_id, row.challenging_team, row.period, clockSeconds(row.game_clock)].join("|");
}

export function challengeClockClipUrl(row) {
  const stored = String(row?.clock_clip_url || row?.source_payload?.clockClipUrl || "");
  if (stored.startsWith("https://clips.nba.com/")) {
    try {
      if (new URL(stored).searchParams.get("gameNo") === String(row.game_id || row.gameId)) return stored;
    } catch { /* invalid stored metadata is not a usable link */ }
  }
  // For PBP-derived entries, prefer the actual challenged play's timestamp.
  return nbaClipsUrl(row?.game_id || row?.gameId, {
    timeActual: row?.clock_time_actual || row?.source_payload?.challengedAction?.timeActual
      || (row?.source === "play_by_play" ? row?.review_time_actual || row?.source_payload?.timeActual : null),
  });
}
