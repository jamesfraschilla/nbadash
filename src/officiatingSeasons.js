export const DEFAULT_OFFICIATING_SEASON = "2025-26";
export const CUMULATIVE_OFFICIATING_SEASON = "2024-Present";
export const OFFICIATING_SEASONS = ["2024-25", "2025-26", "2026-27"];
export const OFFICIATING_SEASON_OPTIONS = [CUMULATIVE_OFFICIATING_SEASON, ...OFFICIATING_SEASONS];

const SEASON_STARTS = [
  { season: "2026-27", startsAt: new Date("2026-10-03T00:00:00-04:00") },
];

export function currentOfficiatingSeasonDefault(now = new Date()) {
  return SEASON_STARTS.find(({ startsAt }) => now >= startsAt)?.season || DEFAULT_OFFICIATING_SEASON;
}

export function defaultOfficiatingSeasonForTab(tab, now = new Date()) {
  return tab === "officials" ? CUMULATIVE_OFFICIATING_SEASON : currentOfficiatingSeasonDefault(now);
}

export function officiatingSeasonValues(season) {
  return season === CUMULATIVE_OFFICIATING_SEASON
    ? OFFICIATING_SEASONS
    : [season || DEFAULT_OFFICIATING_SEASON];
}
