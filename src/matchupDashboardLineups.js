const LINEUP_SIZE = 5;

function uniqueRosterIds(ids, rosterIds) {
  const available = new Set((rosterIds || []).map(String));
  const used = new Set();
  return (ids || []).map(String).filter((personId) => {
    if (!personId || used.has(personId) || !available.has(personId)) return false;
    used.add(personId);
    return true;
  });
}

export function resolveDashboardMatchupLineup({
  currentLineupIds = [],
  confirmedStarterIds = [],
  projectedStarterIds = [],
  rosterIds = [],
}) {
  const current = uniqueRosterIds(currentLineupIds, rosterIds);
  if (current.length) return current.slice(0, LINEUP_SIZE);

  const confirmed = uniqueRosterIds(confirmedStarterIds, rosterIds);
  const preferred = confirmed.length >= LINEUP_SIZE
    ? confirmed
    : uniqueRosterIds(projectedStarterIds, rosterIds);
  const resolved = [...preferred];
  const used = new Set(resolved);

  for (const personId of rosterIds.map(String)) {
    if (resolved.length >= LINEUP_SIZE) break;
    if (!personId || used.has(personId)) continue;
    used.add(personId);
    resolved.push(personId);
  }

  return resolved.slice(0, LINEUP_SIZE);
}
