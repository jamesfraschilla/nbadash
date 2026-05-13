export const REFEREE_HEADSHOT_OVERRIDE_STORAGE_KEY = "referee_headshot_overrides_v1";

export const DEFAULT_REFEREE_HEADSHOT_OVERRIDES = {
  "ericlewis": {
    scale: 1.08,
    offsetX: 0,
    offsetY: 4,
    scaleX: 1,
    scaleY: 1,
    exportScale: 1.12,
    exportOffsetYPortrait: 6,
    exportOffsetYLandscape: 8.5,
  },
};

export function normalizeNameKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

export function getRefereeHeadshotOverride(fullName, overrides = DEFAULT_REFEREE_HEADSHOT_OVERRIDES) {
  const key = normalizeNameKey(fullName);
  const raw = overrides?.[key];
  if (!raw || typeof raw !== "object") return null;
  return {
    scale: Number.isFinite(raw.scale) ? raw.scale : 1,
    offsetX: Number.isFinite(raw.offsetX) ? raw.offsetX : 0,
    offsetY: Number.isFinite(raw.offsetY) ? raw.offsetY : 0,
    scaleX: Number.isFinite(raw.scaleX) ? raw.scaleX : 1,
    scaleY: Number.isFinite(raw.scaleY) ? raw.scaleY : 1,
    exportScale: Number.isFinite(raw.exportScale) ? raw.exportScale : null,
    exportOffsetYPortrait: Number.isFinite(raw.exportOffsetYPortrait) ? raw.exportOffsetYPortrait : null,
    exportOffsetYLandscape: Number.isFinite(raw.exportOffsetYLandscape) ? raw.exportOffsetYLandscape : null,
  };
}

export function buildRefereeHeadshotTransform(override) {
  const safe = {
    scale: Number.isFinite(override?.scale) ? override.scale : 1,
    offsetX: Number.isFinite(override?.offsetX) ? override.offsetX : 0,
    offsetY: Number.isFinite(override?.offsetY) ? override.offsetY : 0,
    scaleX: Number.isFinite(override?.scaleX) ? override.scaleX : 1,
    scaleY: Number.isFinite(override?.scaleY) ? override.scaleY : 1,
  };
  return `translate(${safe.offsetX}px, ${safe.offsetY}px) scale(${safe.scale * safe.scaleX}, ${safe.scale * safe.scaleY})`;
}

export function buildCanvasAvatarPlacement({
  sourceWidth,
  sourceHeight,
  targetX,
  targetY,
  targetSize,
  override,
  variant,
}) {
  const safeWidth = Math.max(1, Number(sourceWidth) || 1);
  const safeHeight = Math.max(1, Number(sourceHeight) || 1);
  const coverScale = Math.max(targetSize / safeWidth, targetSize / safeHeight);
  const baseScale = Number.isFinite(override?.exportScale)
    ? override.exportScale
    : (Number.isFinite(override?.scale) ? override.scale : 1);
  const scaleX = Number.isFinite(override?.scaleX) ? override.scaleX : 1;
  const scaleY = Number.isFinite(override?.scaleY) ? override.scaleY : 1;
  const offsetX = Number.isFinite(override?.offsetX) ? override.offsetX : 0;
  let offsetY = Number.isFinite(override?.offsetY) ? override.offsetY : 0;

  if (variant === "portrait" && Number.isFinite(override?.exportOffsetYPortrait)) {
    offsetY = override.exportOffsetYPortrait;
  } else if (variant === "landscape" && Number.isFinite(override?.exportOffsetYLandscape)) {
    offsetY = override.exportOffsetYLandscape;
  }

  const drawWidth = safeWidth * coverScale * baseScale * scaleX;
  const drawHeight = safeHeight * coverScale * baseScale * scaleY;

  return {
    drawWidth,
    drawHeight,
    drawX: targetX + (targetSize - drawWidth) / 2 + offsetX,
    drawY: targetY + offsetY,
  };
}

export function sanitizeRefereeHeadshotOverrides(rawOverrides) {
  if (!rawOverrides || typeof rawOverrides !== "object" || Array.isArray(rawOverrides)) {
    return {};
  }

  const next = {};
  Object.entries(rawOverrides).forEach(([key, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const normalizedKey = normalizeNameKey(key);
    if (!normalizedKey) return;
    const normalized = {};
    [
      "scale",
      "offsetX",
      "offsetY",
      "scaleX",
      "scaleY",
      "exportScale",
      "exportOffsetYPortrait",
      "exportOffsetYLandscape",
    ].forEach((field) => {
      const parsed = Number(value[field]);
      if (Number.isFinite(parsed)) {
        normalized[field] = parsed;
      }
    });
    if (Object.keys(normalized).length) {
      next[normalizedKey] = normalized;
    }
  });

  return next;
}

export function serializeRefereeHeadshotOverrides(overrides) {
  return JSON.stringify(sanitizeRefereeHeadshotOverrides(overrides), null, 2);
}
