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
  if (derived.rimFieldGoalsAttempted + derived.midFieldGoalsAttempted + Number(derived.threePointersAttempted || 0) !== derived.fieldGoalsAttempted
    || derived.rimFieldGoalsMade + derived.midFieldGoalsMade + Number(derived.threePointersMade || 0) !== derived.fieldGoalsMade) return base;
  return { ...base, ...Object.fromEntries(zones.map((key) => [key, derived[key]])) };
}

// The keyed Traditional box omits these event-derived fields. Retain any
// source-supplied values; otherwise use the play-by-play reconstruction.
export function mergeEventDerivedTotals(base = {}, derived = {}) {
  const fields = [
    "drivingFGMade", "drivingFGAttempted", "cuttingFGMade", "cuttingFGAttempted",
    "catchAndShoot3FGMade", "catchAndShoot3FGAttempted",
    "offensiveFoulsDrawn", "chargesDrawn",
  ];
  return { ...base, ...Object.fromEntries(fields.map((field) => [field, base[field] ?? derived[field] ?? 0])) };
}

export function mergeSegmentSnapshotTotals(computed = {}, snapshot) {
  return snapshot ? reconcileShotZoneTotals({ ...computed, ...snapshot }, computed) : computed;
}
