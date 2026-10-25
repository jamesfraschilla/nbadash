export function verifiedChallengeVideoUrl(row) {
  // Never synthesize a URL from the replay marker itself. video_url is populated
  // either by the official weekly log or by the conservative play-by-play
  // matcher when an immediately preceding reviewable action shares the clock.
  return String(row?.video_url || row?.videoUrl || "").trim() || null;
}
