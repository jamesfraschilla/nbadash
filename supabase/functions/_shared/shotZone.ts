// Dashboard definition, shared by segment stats and AI feature extraction.
// Rim is a two-point attempt below five feet; all other known-distance twos
// are mid-range. An absent distance is unknown, never an invented zero feet.
export function classifyShotZone(action: Record<string, unknown>): "three" | "rim" | "mid" | "unknown" {
  if (String(action.actionType || "").toLowerCase() === "3pt") return "three";
  const value = action.shotDistance;
  if (value == null || String(value).trim() === "") return "unknown";
  const distance = Number(value);
  if (!Number.isFinite(distance) || distance < 0) return "unknown";
  return distance < 5 ? "rim" : "mid";
}
