import { nbaClipsUrl } from "./nbaClipsTrial.js";

export const CHALLENGE_CLOCK_LINK_VERSION = 3;

export function verifiedChallengeVideoUrl(row) {
  // Video is exclusively the published PDF clip. PBP-derived and timestamp
  // links belong to Clock, even while waiting for the next official PDF.
  if (row?.source !== "nba_official_challenge_pdf") return null;
  const value = String(row?.video_url || row?.videoUrl || "").trim();
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && url.hostname === "dmmx2.nba.com"
      && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

function clockSeconds(value) {
  const text = String(value || "");
  const match = /^(?:PT)?(\d+)(?:M|:)(\d+(?:\.\d+)?)(?:S)?$/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

export function buildChallengeClockClip(row, game) {
  const unavailable = reason => ({ url: null, reason, actionNumber: null });
  const gameId = String(row?.game_id || row?.gameId || "");
  if (String(game?.gameId) !== gameId) return unavailable("game-mismatch");
  const clock = clockSeconds(row.game_clock || row.gameClock);
  if (!Number.isFinite(clock)) return unavailable("invalid-clock");
  const payload = row.source_payload || {};
  const actions = (game.playByPlayActions || []).filter(a => Number(a.period) === Number(row.period));
  const type = a => String(a.actionType || "").toLowerCase();
  const signal = `${row.challenge_type || ""} ${row.initial_call || ""} ${row.challenge_sub_type || ""}`.toLowerCase();
  const category = /foul/.test(signal) ? "foul" : /oob|out.of.bounds|team ball/.test(signal) ? "oob"
    : /goaltend|interference/.test(signal) ? "goaltending" : "";
  const compatible = a => {
    const text = `${a.subType || ""} ${a.descriptor || ""} ${a.description || ""}`.toLowerCase();
    if (/jump\s*ball/.test(text)) return false;
    if (category === "foul") {
      if (type(a) !== "foul") return false;
      if (/defensive foul/.test(signal) && /offensive|off\.foul|charge/.test(text)) return false;
      if (/shooting foul/.test(String(row.challenge_sub_type || "").toLowerCase()) && !/shooting|s\.foul/.test(text)) return false;
      if (/offensive foul/.test(String(row.initial_call || "").toLowerCase()) && !/offensive|off\.foul|charge/.test(text)) return false;
      return true;
    }
    if (category === "oob") return ["turnover", "violation"].includes(type(a)) && /out.of.bounds|\boob\b/.test(text);
    if (category === "goaltending") return /goaltend|basket.*interference/.test(text);
    return ["foul", "turnover", "violation", "2pt", "3pt", "block", "rebound"].includes(type(a));
  };
  const reviews = actions.filter(a => ["instantreplay", "replay"].includes(type(a))
    && Math.abs(clockSeconds(a.clock) - clock) <= 2
    && (String(a.subType || "").includes("challenge") || Number(a.actionNumber) === Number(payload.actionNumber)));
  const explicitReview = reviews.find(a => Number(payload.actionNumber) > 0 && Number(a.actionNumber) === Number(payload.actionNumber));
  const sameTeamReviews = reviews.filter(a => !row.challenging_team || !a.teamTricode || a.teamTricode === row.challenging_team);
  if (!explicitReview && sameTeamReviews.length > 1) return unavailable("ambiguous-review-boundary");
  const review = explicitReview || (sameTeamReviews.length === 1 ? sameTeamReviews[0] : null);
  const precedesReview = a => {
    if (!review) return true;
    if (Number(a.orderNumber) > 0 && Number(review.orderNumber) > 0 && Number(a.orderNumber) >= Number(review.orderNumber)) return false;
    return Date.parse(a.timeActual) <= Date.parse(review.timeActual);
  };
  const crossesBoundary = candidate => {
    if (!review) return false;
    return actions.some(a => a !== candidate
      && ["freethrow", "jumpball", "2pt", "3pt", "turnover"].includes(type(a))
      && Date.parse(a.timeActual) > Date.parse(candidate.timeActual)
      && Date.parse(a.timeActual) < Date.parse(review.timeActual));
  };
  const candidates = actions.filter(a => nbaClipsUrl(gameId, a) && compatible(a) && precedesReview(a) && !crossesBoundary(a));
  const linkedNumber = payload.challengedAction?.actionNumber ?? row.matched_action_number;
  const linked = candidates.find(a => Number(linkedNumber) > 0 && Number(a.actionNumber) === Number(linkedNumber)
    && Math.abs(clockSeconds(a.clock) - clock) <= 2);
  if (linked) {
    // Even an explicit event link must not cross free throws or resumed play.
    const low = Math.min(clock, clockSeconds(linked.clock)), high = Math.max(clock, clockSeconds(linked.clock));
    const crossed = actions.some(a => a !== linked && clockSeconds(a.clock) >= low && clockSeconds(a.clock) <= high
      && ["freethrow", "jumpball"].includes(type(a))
      && Date.parse(a.timeActual) > Date.parse(linked.timeActual)
      && (!review || Date.parse(a.timeActual) < Date.parse(review.timeActual)));
    if (!crossed) return { url: nbaClipsUrl(gameId, linked), reason: "explicit-compatible-challenged-action", actionNumber: linked.actionNumber };
  }
  // No nearest-clock fallback: 1.6 seconds of game clock can include a foul,
  // two free throws, a rebound and a different possession (TOR-WAS Q2 0:54).
  const exact = candidates.filter(a => Math.abs(clockSeconds(a.clock) - clock) < 0.11);
  const timestamps = new Set(exact.map(a => Date.parse(a.timeActual)));
  if (timestamps.size !== 1) return unavailable(exact.length ? "ambiguous-original-play" : "original-play-not-identifiable");
  return { url: nbaClipsUrl(gameId, exact[0]), reason: "compatible-original-play-at-exact-clock", actionNumber: exact[0].actionNumber ?? null };
}

export function buildChallengeClockClipUrl(row, game) {
  return buildChallengeClockClip(row, game).url;
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
  if (Number(row?.clock_link_version || row?.source_payload?.clockLinkVersion) >= CHALLENGE_CLOCK_LINK_VERSION) return null;
  // For PBP-derived entries, prefer the actual challenged play's timestamp.
  return nbaClipsUrl(row?.game_id || row?.gameId, {
    timeActual: row?.clock_time_actual || row?.source_payload?.challengedAction?.timeActual,
  });
}
