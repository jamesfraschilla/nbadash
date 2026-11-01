const quarters = new Set([1, 2, 3, 4]);
export function quarterHasMinutes(rows) {
  return Array.isArray(rows) && rows.some(row => Array.isArray(row) && row.some(value => String(value ?? "").trim() !== ""));
}
// Copy only minute selections. Keep versions, depth chart, options and all
// other quarters untouched; destination rows must not alias source rows.
export function copyQuarterMinutes(lineups, source, destination) {
  if (!quarters.has(source) || !quarters.has(destination) || source === destination || !Array.isArray(lineups?.[source]) || !lineups[source].every(Array.isArray)) return lineups;
  return { ...lineups, [destination]: lineups[source].map(row => [...row]) };
}
