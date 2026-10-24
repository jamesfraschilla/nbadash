// A daily key bypasses old browser/proxy images without random cache-busting on
// every render. Images stay on their source CDN; none are copied into storage.
export function refreshNbaHeadshotUrl(value, now = new Date()) {
  try {
    const url = new URL(value);
    if (url.hostname !== "cdn.nba.com" || !/^\/headshots\/nba\/latest\/(260x190|1040x760)\/\d+\.png$/.test(url.pathname)) return value;
    url.searchParams.set("v", `headshots-v2-${now.toISOString().slice(0, 10)}`);
    return url.toString();
  } catch {
    return value;
  }
}

export function preferLargeNbaHeadshots(candidates) {
  // Replace only the NBA portion of the list. Moving all non-NBA URLs first
  // also promoted automatic G League fallbacks above valid NBA portraits.
  const isNba = (value) => /^https:\/\/cdn\.nba\.com\/headshots\/nba\/latest\/(260x190|1040x760)\/\d+\.png(?:\?|$)/.test(value);
  const nba = candidates.filter(isNba).sort((a, b) => Number(b.includes("/1040x760/")) - Number(a.includes("/1040x760/")));
  let index = 0;
  return candidates.map((candidate) => isNba(candidate) ? nba[index++] : candidate);
}
