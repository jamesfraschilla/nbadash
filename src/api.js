const API_BASE = "https://d1rjt2wyntx8o7.cloudfront.net/api";

async function requestJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchGamesByDate(dateStr) {
  const url = `${API_BASE}/games/byDate?date=${dateStr}`;
  return requestJson(url);
}

export function fetchGame(gameId, segment = null) {
  const segmentParam = segment ? `?segment=${segment}` : "";
  const url = `${API_BASE}/games/${gameId}${segmentParam}`;
  return requestJson(url);
}

export function fetchMinutes(gameId) {
  const url = `${API_BASE}/games/${gameId}/minutes`;
  return requestJson(url);
}

export function teamLogoUrl(teamId, league = null) {
  const inferredLeague =
    league ||
    (Number(teamId) >= 1612700000 && Number(teamId) < 1612710000 ? "gleague" : "nba");

  if (inferredLeague === "gleague") {
    return `https://ak-static.cms.nba.com/wp-content/uploads/logos/nbagleague/${teamId}/primary/L/logo.svg`;
  }
  if (inferredLeague === "wnba") {
    return `https://cdn.wnba.com/logos/wnba/${teamId}/D/logo.svg`;
  }
  return `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;
}

export function playerHeadshotUrl(personId) {
  return `https://cdn.nba.com/headshots/nba/latest/260x190/${personId}.png`;
}

export function nbaEventVideoUrl({ gameId, actionNumber, seasonYear, title }) {
  if (!gameId || actionNumber == null) return null;

  const seasonText = String(seasonYear ?? "").trim();
  let season;
  if (/^\d{4}$/.test(seasonText)) {
    const startYear = Number(seasonText);
    season = `${startYear}-${String(startYear + 1).slice(-2)}`;
  } else if (/^\d{4}-\d{2}$/.test(seasonText)) {
    season = seasonText;
  } else if (/^\d{4}-\d{4}$/.test(seasonText)) {
    const startYear = Number(seasonText.slice(0, 4));
    season = `${startYear}-${String(startYear + 1).slice(-2)}`;
  }

  const params = new URLSearchParams({
    flag: "1",
    GameID: String(gameId),
    GameEventID: String(actionNumber),
  });

  if (season) params.set("Season", season);
  if (title) params.set("title", String(title));

  return `https://www.nba.com/stats/events?${params.toString()}`;
}
