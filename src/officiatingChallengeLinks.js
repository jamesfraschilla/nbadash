import { nbaClipsUrl } from "./nbaClipsTrial.js";

export const CHALLENGE_CLOCK_LINK_VERSION = 4;

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

// Original-call attribution and clip timing are different evidence questions.
// NBA corrections can remove the original foul or replace it with another call.
function verifiedIncidentClip(row, game, actions, clock) {
  const payload = row.source_payload || {};
  const pdf = payload.pdfRow || {};
  const book = payload.gamebookChallenge || {};
  const gameCode=String(game.gameCode || "");
  const challengingTeam=[game.homeTeam,game.awayTeam].find(t=>t?.teamTricode===row.challenging_team);
  const sameClock = value => Math.abs(clockSeconds(value) - clock) < 0.11;
  const pdfVerified = row.source === "nba_official_challenge_pdf"
    && String(pdf.game_id) === String(row.game_id) && Number(pdf.period) === Number(row.period)
    && pdf.team_challenged === row.challenging_team && sameClock(pdf.game_clock);
  const bookVerified = book.version === "gamebook-challenge-v1"
    && /^https:\/\/statsdmz\.nba\.com\/pdfs\//.test(book.url || "")
    && /^\d{8}\/[A-Z]{6}$/.test(gameCode) && book.url.endsWith(`${gameCode.replace("/","_")}_book.pdf`)
    && Number(book.period) === Number(row.period) && sameClock(book.gameClock)
    && !!challengingTeam && book.challengingTeamName === challengingTeam.teamName
    && /Coach['’]s Challenge/i.test(book.excerpt || "");
  if (!pdfVerified && !bookVerified) return null;
  const type = a => String(a.actionType || "").toLowerCase();
  const timed = actions.filter(a => nbaClipsUrl(game.gameId, a));
  const exact = timed.filter(a => sameClock(a.clock));
  // Only use a correction explicitly described in the official initial/final
  // call ledger. Never reinterpret the correction as the original whistle.
  const final = String(pdf.ruling_description || "");
  const corrected = pdfVerified && /^successful$/i.test(pdf.challenge_outcome || "")
    ? exact.filter(a => type(a) === "foul" && (
      /^offensive foul$/i.test(final) && /offensive|charge/i.test(`${a.subType} ${a.description}`)
      || /^defensive foul$/i.test(final) && /personal|shooting/i.test(`${a.subType} ${a.description}`)
        && !/offensive|technical/i.test(`${a.subType} ${a.description}`))) : [];
  const correctedTimes = new Set(corrected.map(a => Date.parse(a.timeActual)));
  if (correctedTimes.size === 1) {
    const candidate=corrected[0], candidateTime=Date.parse(candidate.timeActual);
    const boundary=exact.filter(a => type(a)==="timeout" && a.teamTricode===row.challenging_team
      || ["instantreplay","replay"].includes(type(a)) && /challenge/i.test(a.subType || ""))
      .sort((a,b)=>Date.parse(a.timeActual)-Date.parse(b.timeActual))[0];
    const boundaryTime=boundary?Date.parse(boundary.timeActual):null;
    const crossed=boundaryTime!=null && (candidateTime>boundaryTime+5000 || timed.some(a => a!==candidate
      && Date.parse(a.timeActual)>candidateTime && Date.parse(a.timeActual)<boundaryTime
      && (["freethrow","jumpball"].includes(type(a))
        || ["2pt","3pt","turnover"].includes(type(a)) && Date.parse(a.timeActual)-candidateTime>1000)));
    if (!crossed) return {url:nbaClipsUrl(game.gameId,candidate),
      reason:"verified-corrected-incident-timestamp",actionNumber:candidate.actionNumber ?? null};
    return null;
  }
  if (correctedTimes.size > 1) return null;

  // A review may be minutes after the play. Only the initial team timeout at
  // the exact challenge clock can anchor a clip, and only when live action
  // immediately precedes it. The 10-second clip lead-in then includes the play.
  const stops = exact.filter(a => type(a) === "timeout" && a.teamTricode === row.challenging_team);
  const stopTimes = new Set(stops.map(a => Date.parse(a.timeActual)));
  if (stopTimes.size !== 1) return null;
  const stop = stops[0], stopTime = Date.parse(stop.timeActual);
  // A successful no-foul reversal may leave only the named defender's block
  // in the corrected feed. Require that player in the gamebook ruling, a
  // unique nearby block, and no intervening possession or review boundary.
  const normalizeName=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z]/g,"");
  const clearedPlayer=bookVerified && /Call Overturned/i.test(book.excerpt || "")
    ? /No (?:Personal )?Foul on ([A-Z]\.\s*[^:]+)$/i.exec(book.excerpt || "")?.[1] : null;
  const blocks=clearedPlayer ? timed.filter(a=>type(a)==="block"
    && normalizeName(String(a.description||"").split(/\s+BLOCK/i)[0])===normalizeName(clearedPlayer)
    && Math.abs(clockSeconds(a.clock)-clock)<=2
    && Date.parse(a.timeActual)<=stopTime+100 && Date.parse(a.timeActual)>=stopTime-120000) : [];
  if (blocks.length===1) {
    const block=blocks[0], blockTime=Date.parse(block.timeActual);
    const intervening=timed.some(a=>Date.parse(a.timeActual)>blockTime+100 && Date.parse(a.timeActual)<stopTime
      && ["2pt","3pt","foul","turnover","violation","freethrow","jumpball","timeout","instantreplay","replay"].includes(type(a)));
    if (!intervening) return {url:nbaClipsUrl(game.gameId,block),reason:"gamebook-verified-cleared-defender-block",
      actionNumber:block.actionNumber ?? null};
  }
  // Corrected calls can be inserted 10–30 ms AFTER their timeout. Treat only
  // an exact-clock, sub-100 ms live cluster as atomic, never a later review
  // correction (which can be minutes after the original incident).
  const atomic = exact.filter(a => ["2pt","3pt","foul","turnover","violation","block"].includes(type(a))
    && Date.parse(a.timeActual) >= stopTime && Date.parse(a.timeActual) <= stopTime + 100);
  if (atomic.length && !exact.some(a => ["freethrow","jumpball"].includes(type(a))
    && Math.abs(Date.parse(a.timeActual) - stopTime) <= 100)) {
    return {url:nbaClipsUrl(game.gameId, stop),reason:"verified-atomic-challenge-incident",
      actionNumber:stop.actionNumber ?? null};
  }
  const liveTypes = ["2pt","3pt","foul","turnover","violation","block","rebound","freethrow","jumpball","heave"];
  const before = timed.filter(a => liveTypes.includes(type(a)) && Date.parse(a.timeActual) <= stopTime)
    .sort((a,b)=>Date.parse(b.timeActual)-Date.parse(a.timeActual));
  const last = before[0];
  if (!last || ["freethrow","jumpball"].includes(type(last))) return null;
  const gap = stopTime - Date.parse(last.timeActual);
  const clockGap = clockSeconds(last.clock) - clock;
  // If the removed foul was the next recorded event, the previous row can be
  // an earlier made basket. Continuous game-clock/wall-clock movement proves
  // the timeout was immediate live play, not minutes into the review.
  const immediate=gap>=0 && gap<=5000 && clockGap>=-0.11 && clockGap<=5;
  const continuousPlay=clockGap>0 && clockGap<=24 && gap>=0 && Math.abs(gap/1000-clockGap)<=2;
  if (!immediate && !continuousPlay) return null;
  // Do not cross an earlier stoppage/review before reaching this timeout.
  if (timed.some(a => ["timeout","instantreplay","replay"].includes(type(a))
    && Date.parse(a.timeActual) > Date.parse(last.timeActual)
    && Date.parse(a.timeActual) < stopTime)) return null;
  return {url:nbaClipsUrl(game.gameId, stop),reason:"verified-immediate-challenge-stoppage",
    actionNumber:stop.actionNumber ?? null};
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
  if (timestamps.size !== 1) {
    if (exact.length) return unavailable("ambiguous-original-play");
    const incident=verifiedIncidentClip(row,game,actions,clock);
    if (incident) return incident;
    // A corrected game clock is not a nearest-event search. Require a unique
    // same-team timeout AND a compatible live call in its sub-100 ms cluster,
    // backed by this exact challenge's official PDF entry. Never use a later
    // corrected event or cross free throws to manufacture the missing play.
    const pdf=payload.pdfRow || {};
    const verified=row.source==="nba_official_challenge_pdf" && String(pdf.game_id)===gameId
      && Number(pdf.period)===Number(row.period) && pdf.team_challenged===row.challenging_team
      && Math.abs(clockSeconds(pdf.game_clock)-clock)<0.11;
    const stops=actions.filter(a=>type(a)==="timeout" && a.teamTricode===row.challenging_team
      && Math.abs(clockSeconds(a.clock)-clock)<=2 && nbaClipsUrl(gameId,a));
    if (verified && stops.length===1 && Math.abs(clockSeconds(stops[0].clock)-clock)>0.11) {
      const stop=stops[0], time=Date.parse(stop.timeActual);
      const cluster=actions.filter(a=>Math.abs(clockSeconds(a.clock)-clockSeconds(stop.clock))<0.11
        && Math.abs(Date.parse(a.timeActual)-time)<=100);
      const final=String(pdf.ruling_description || "");
      const live=cluster.filter(a=>compatible(a) || /^successful$/i.test(pdf.challenge_outcome || "")
        && type(a)==="foul" && (
          /^offensive foul$/i.test(final) && /offensive|charge/i.test(`${a.subType} ${a.description}`)
          || /^defensive foul$/i.test(final) && /personal|shooting/i.test(`${a.subType} ${a.description}`)
            && !/offensive|technical/i.test(`${a.subType} ${a.description}`)));
      if (new Set(live.map(a=>Date.parse(a.timeActual))).size===1
        && !cluster.some(a=>["freethrow","jumpball"].includes(type(a))))
        return {url:nbaClipsUrl(gameId,live[0]),reason:"pdf-verified-clock-corrected-atomic-incident",
          actionNumber:live[0].actionNumber ?? null};
    }
    const nearby=actions.filter(a=>Math.abs(clockSeconds(a.clock)-clock)<=2);
    const exactStops=stops.filter(a=>Math.abs(clockSeconds(a.clock)-clock)<0.11);
    const reason=!nearby.length?"no-nearby-play-at-challenge-clock"
      : exactStops.length>1?"multiple-challenge-clock-stoppages"
      : exactStops.length===1 && nearby.some(a=>["foul","2pt","3pt","turnover"].includes(type(a))
        && Date.parse(a.timeActual)>Date.parse(exactStops[0].timeActual)+5000)?"corrected-event-timestamp-after-timeout"
      : exactStops.length===1?"original-incident-timestamp-not-verifiable"
      : stops.length?"clock-correction-without-unique-compatible-incident"
      : "no-source-matched-challenge-stoppage";
    return unavailable(reason);
  }
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
  if (Number(row?.clock_link_version || row?.source_payload?.clockLinkVersion) >= 3) return null;
  // For PBP-derived entries, prefer the actual challenged play's timestamp.
  return nbaClipsUrl(row?.game_id || row?.gameId, {
    timeActual: row?.clock_time_actual || row?.source_payload?.challengedAction?.timeActual,
  });
}
