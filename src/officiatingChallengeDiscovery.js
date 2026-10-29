const HTML_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  "#039": "'",
  "#8217": "'",
};

function decodeHtml(value) {
  return String(value || "").replace(/&([^;]+);/g, (match, entity) => (
    Object.prototype.hasOwnProperty.call(HTML_ENTITIES, entity)
      ? HTML_ENTITIES[entity]
      : match
  ));
}

function plainText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function sectionAt(html, index) {
  const prefix = plainText(html.slice(0, index)).toLowerCase();
  const playoffsIndex = prefix.lastIndexOf("playoffs");
  const regularIndex = prefix.lastIndexOf("regular season");
  return playoffsIndex > regularIndex ? "playoffs" : "regular";
}

export function discoverChallengeReviewDocuments(html, pageUrl) {
  const documents = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || "")))) {
    const label = plainText(match[2]);
    if (!/challenge reviews by day/i.test(label)) continue;
    const url = new URL(decodeHtml(match[1]), pageUrl).href;
    if (!/\.pdf(?:$|[?#])/i.test(url)) continue;
    documents.push({
      kind: sectionAt(html, match.index),
      label,
      url,
    });
  }
  return documents.filter((document, index) => (
    documents.findIndex((candidate) => candidate.url === document.url) === index
  ));
}

export function discoverSeasonPageUrl(html, season, archiveUrl) {
  const escapedSeason = String(season || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || "")))) {
    const label = plainText(match[2]);
    if (!new RegExp(`${escapedSeason}.*coach.?s challenge reviews`, "i").test(label)) continue;
    return new URL(decodeHtml(match[1]), archiveUrl).href;
  }
  return "";
}

export function isChallengeSeasonPage(html, season) {
  // NBA sometimes updates the heading without changing the previous season's
  // slug. Validate the document's season, never infer it from the URL alone.
  const headings = [...String(html || "").matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(match => plainText(match[1]));
  return headings.some(heading => heading.includes(season) && /coach.?s challenge reviews/i.test(heading));
}

export function shouldRunWeeklyChallengeSync({
  now = new Date(),
  startDate = "2026-10-04",
  timeZone = "America/New_York",
} = {}) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return dateKey >= startDate;
}
