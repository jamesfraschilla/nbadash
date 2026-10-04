export function resolveFeatureAccess({ accountsEnabled, hasFeature }) {
  const enabled = (flag) => !accountsEnabled || Boolean(hasFeature?.(flag));
  const tools = enabled("tools");
  return {
    tools,
    graphics: enabled("graphics") || tools,
  };
}
