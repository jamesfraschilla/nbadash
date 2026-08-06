export const TOOL_TABS = {
  GRAPHICS: "graphics",
  MATCHUP: "matchup",
  COURT_TIME: "court-time",
  PERSONNEL: "personnel",
  DEPTH_CHART: "depth-chart",
  ROTATIONS: "rotations",
  SCOUTING: "scouting",
  LATE_GAME: "late-game",
  CUSTOM_REQUESTS: "custom-requests",
  VISUAL_DRILL: "visual-drill",
};

export const GRAPHIC_TOOL_TABS = [
  { key: TOOL_TABS.MATCHUP, label: "Match-Up", title: "Match-Up Graphics" },
  { key: TOOL_TABS.COURT_TIME, label: "Court Time", title: "Court Time Graphics" },
  { key: TOOL_TABS.PERSONNEL, label: "Personnel", title: "Personnel Graphics" },
  { key: TOOL_TABS.DEPTH_CHART, label: "Depth Chart", title: "Depth Chart Graphics" },
];

const GRAPHIC_TOOL_TAB_KEYS = new Set(GRAPHIC_TOOL_TABS.map((tab) => tab.key));

export function isGraphicToolTab(value) {
  return GRAPHIC_TOOL_TAB_KEYS.has(String(value || "").trim());
}

export function normalizeGraphicToolTab(value, fallback = TOOL_TABS.MATCHUP) {
  const normalized = String(value || "").trim();
  return isGraphicToolTab(normalized) ? normalized : fallback;
}
