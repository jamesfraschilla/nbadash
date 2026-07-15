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
