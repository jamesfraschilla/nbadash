// This tint describes the observed rate, not percentile eligibility. A missing
// percentile on a small sample must never be interpreted as the lowest rate.
export function challengeSuccessStyle(rate, attempts) {
  if (!Number.isFinite(rate) || !(Number(attempts) > 0)) return undefined;
  const hue = Math.max(0, Math.min(1, rate)) * 138;
  return {
    backgroundColor: `hsl(${hue} 70% 22% / 0.58)`,
    borderColor: `hsl(${hue} 70% 48% / 0.58)`,
    color: `hsl(${hue} 88% 82%)`,
  };
}
