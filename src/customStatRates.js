// Share of missed threes recovered, not share of all offensive rebounds
// originating from a three. The latter can misleadingly show 100%.
export function threePointOffensiveReboundPercent(totals = {}) {
  const misses = Number(totals.threePointersAttempted || 0) - Number(totals.threePointersMade || 0);
  return misses > 0 ? Number(totals.threePointOReb || 0) / misses * 100 : 0;
}

// Full-game team rows must use the same distance-based zones as player rows,
// segments and analysis. Only reconcile when the PBP covers the box-score FGs.
export function reconcileShotZoneTotals(base = {}, derived = {}) {
  if (!Number.isFinite(derived.fieldGoalsAttempted) || derived.fieldGoalsAttempted !== base.fieldGoalsAttempted
    || derived.fieldGoalsMade !== base.fieldGoalsMade) return base;
  const zones = ["rimFieldGoalsMade", "rimFieldGoalsAttempted", "midFieldGoalsMade", "midFieldGoalsAttempted"];
  if (!zones.every((key) => Number.isFinite(derived[key]))) return base;
  return { ...base, ...Object.fromEntries(zones.map((key) => [key, derived[key]])) };
}
