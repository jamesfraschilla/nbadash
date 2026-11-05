const NBA_HEADSHOT_PATH = /^\/headshots\/nba\/latest\/(260x190|1040x760)\/[^/]+\.png$/i;

export function buildNbaFallbackHeadshotUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "cdn.nba.com") return "";
    const match = NBA_HEADSHOT_PATH.exec(url.pathname);
    if (!match) return "";
    return `https://cdn.nba.com/headshots/nba/latest/${match[1]}/fallback.png`;
  } catch {
    return "";
  }
}

export function pixelBuffersMatch(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

// Small interpolation differences are expected when the resolver resizes the
// stock silhouette. This is intentionally a near-exact reference comparison,
// not a grayscale/face heuristic that could reject a real monochrome portrait.
export function headshotFingerprintsMatch(left, right) {
  if (!left?.length || left.length !== right?.length) return false;
  if (pixelBuffersMatch(left, right)) return true;
  let difference = 0;
  for (let index = 0; index < left.length; index += 4) {
    difference += Math.abs(left[index + 3] - right[index + 3]);
    if (!left[index + 3] && !right[index + 3]) continue;
    for (let channel = 0; channel < 3; channel++) difference += Math.abs(left[index + channel] - right[index + channel]);
  }
  return difference / left.length <= 1.5;
}
