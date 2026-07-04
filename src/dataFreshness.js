export function latestActionTimestamp(actions = []) {
  const times = (Array.isArray(actions) ? actions : [])
    .map((action) => Date.parse(action?.timeActual || ""))
    .filter((time) => Number.isFinite(time));
  return times.length ? Math.max(...times) : 0;
}

export function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 2) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

export function formatPollingInterval(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function freshnessLevel(maxAgeMs) {
  if (!Number.isFinite(maxAgeMs)) return "unknown";
  if (maxAgeMs >= 90_000) return "stale";
  if (maxAgeMs >= 30_000) return "warning";
  return "fresh";
}

export function buildFreshnessSummary({
  dataUpdatedAt = 0,
  actions = [],
  now = Date.now(),
  isFetching = false,
} = {}) {
  const updatedAt = Number(dataUpdatedAt || 0);
  const updatedAgeMs = updatedAt > 0 ? Math.max(0, now - updatedAt) : null;
  const latestPlayAt = latestActionTimestamp(actions);
  const playAgeMs = latestPlayAt > 0 ? Math.max(0, now - latestPlayAt) : null;
  const maxAgeMs = Math.max(
    updatedAgeMs ?? 0,
    playAgeMs ?? 0
  );
  const parts = [];

  if (updatedAgeMs != null) {
    parts.push(`Updated ${formatAge(updatedAgeMs)}`);
  }
  if (playAgeMs != null) {
    parts.push(`Play ${formatAge(playAgeMs)}`);
  }
  if (isFetching) {
    parts.push("Syncing");
  }

  return {
    label: parts.join(" · "),
    updatedAgeMs,
    playAgeMs,
    level: parts.length ? freshnessLevel(maxAgeMs) : "unknown",
  };
}
