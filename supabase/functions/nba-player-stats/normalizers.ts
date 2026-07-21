export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeFractionPercentage(value: unknown): number | null {
  const numeric = toNullableNumber(value);
  return numeric === null ? null : numeric * 100;
}
