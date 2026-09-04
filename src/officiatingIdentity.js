const OFFICIAL_ID_ALIASES = new Map([
  ["11629177", "1629177"],
  ["196295108", "1629171"],
]);

const OFFICIAL_IDENTITY_OVERRIDES = new Map([
  ["1629177", { name: "Biniam Maru", jerseyNumber: "94" }],
  ["1629171", { name: "Agon Abazi", jerseyNumber: "" }],
]);

export function canonicalOfficialId(value) {
  const id = String(value || "").trim();
  return OFFICIAL_ID_ALIASES.get(id) || id;
}

export function canonicalOfficialIdentity({ officialId, officialName, jerseyNumber } = {}) {
  const id = canonicalOfficialId(officialId);
  const override = OFFICIAL_IDENTITY_OVERRIDES.get(id);
  return {
    officialId: id,
    officialName: override?.name || String(officialName || "").trim(),
    jerseyNumber: override?.jerseyNumber || String(jerseyNumber || "").trim(),
  };
}
