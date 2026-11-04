import {challengeClockClipUrl,CHALLENGE_CLOCK_LINK_VERSION} from "./officiatingChallengeLinks.js";
export function challengeClockCoverage(rows) {
  const missing=rows.filter(r=>!challengeClockClipUrl(r));
  return {total:rows.length,linked:rows.length-missing.length,missing:missing.length,
    outdated:rows.filter(r=>Number(r.source_payload?.clockLinkVersion||r.clock_link_version||0)<CHALLENGE_CLOCK_LINK_VERSION).length,
    reasons:Object.fromEntries([...Map.groupBy(missing,r=>r.source_payload?.clockLinkReason||r.clock_link_reason||"not-processed")].map(([k,v])=>[k,v.length]))};
}
