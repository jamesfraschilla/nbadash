export const DRILL_SHAPES = ["triangle", "square", "circle", "star"];

function randomIndex(length, random) {
  return Math.floor(random() * length);
}

function pick(values, random) {
  if (!values.length) return null;
  return values[randomIndex(values.length, random)];
}

function normalizeColor(value) {
  const color = String(value || "").trim().toLowerCase();
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(color);
  return shortHex
    ? `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`
    : color;
}

function colorsVisibleOnBackground(colors, backgroundColor) {
  const normalizedBackground = normalizeColor(backgroundColor);
  return (Array.isArray(colors) ? colors : [])
    .filter(Boolean)
    .filter((color) => normalizeColor(color) !== normalizedBackground);
}

function colorsExcluding(colors, excludedColor) {
  const normalizedExcludedColor = normalizeColor(excludedColor);
  if (!normalizedExcludedColor) return colors;
  return colors.filter((color) => normalizeColor(color) !== normalizedExcludedColor);
}

function componentTypesForPreviousDigit(enabledTypes, digitColors, previousDigitColor) {
  if (!previousDigitColor) return enabledTypes;
  if (colorsExcluding(digitColors, previousDigitColor).length) return enabledTypes;
  const nonDigitTypes = enabledTypes.filter((type) => type !== "digit");
  return nonDigitTypes.length ? nonDigitTypes : enabledTypes;
}

function componentOptionsForBackground(config, backgroundColor) {
  const images = Array.isArray(config.images) ? config.images.filter((image) => image?.url) : [];
  const shapes = Array.isArray(config.shapes) ? config.shapes.filter(Boolean) : [];
  const digitColors = colorsVisibleOnBackground(config.digitColors, backgroundColor);
  const shapeColors = colorsVisibleOnBackground(config.shapeColors, backgroundColor);
  const enabledTypes = [
    config.useDigits && digitColors.length ? "digit" : null,
    config.useShapes && shapes.length && shapeColors.length ? "shape" : null,
    config.useImages && images.length ? "image" : null,
  ].filter(Boolean);
  return { digitColors, enabledTypes, images, shapeColors, shapes };
}

export function eligibleVisualDrillBackgrounds(config) {
  const backgroundColors = (Array.isArray(config.backgroundColors) ? config.backgroundColors : []).filter(Boolean);
  return backgroundColors.filter((backgroundColor) => (
    componentOptionsForBackground(config, backgroundColor).enabledTypes.length > 0
  ));
}

export function hasVisibleComponentCombination(config) {
  if (clampInteger(config.maximumSpaces, 0, 5) === 0) return true;
  return eligibleVisualDrillBackgrounds(config).length > 0;
}

export function clampInteger(value, minimum, maximum) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function randomIntegerInRange(minimumValue, maximumValue, minimum, maximum, random = Math.random) {
  const minimumResult = clampInteger(minimumValue, minimum, maximum);
  const maximumResult = Math.max(minimumResult, clampInteger(maximumValue, minimum, maximum));
  return minimumResult + randomIndex((maximumResult - minimumResult) + 1, random);
}

export function generateVisualDrill(config, random = Math.random) {
  const spaceCount = randomIntegerInRange(config.minimumSpaces, config.maximumSpaces, 0, 5, random);
  const configuredBackgrounds = (Array.isArray(config.backgroundColors) ? config.backgroundColors : []).filter(Boolean);
  const eligibleBackgrounds = spaceCount > 0 ? eligibleVisualDrillBackgrounds(config) : configuredBackgrounds;
  const backgroundColor = pick(eligibleBackgrounds, random) || pick(configuredBackgrounds, random) || "#ffffff";
  const { digitColors, enabledTypes, images, shapeColors, shapes } = componentOptionsForBackground(config, backgroundColor);

  const components = [];
  let previousDigitColor = "";
  for (let index = 0; index < (enabledTypes.length ? spaceCount : 0); index += 1) {
    const type = pick(componentTypesForPreviousDigit(enabledTypes, digitColors, previousDigitColor), random);
    if (type === "digit") {
      const alternateDigitColors = colorsExcluding(digitColors, previousDigitColor);
      const color = pick(alternateDigitColors.length ? alternateDigitColors : digitColors, random);
      previousDigitColor = color;
      components.push({
        type,
        value: randomIntegerInRange(config.minimumDigit, config.maximumDigit, 0, 9, random),
        color,
      });
      continue;
    }

    previousDigitColor = "";
    if (type === "image") {
      const image = pick(images, random);
      components.push({
        type,
        value: image.id || image.path || image.url,
        url: image.url,
        label: image.name || "Uploaded image",
      });
      continue;
    }

    components.push({
      type,
      value: pick(shapes, random),
      color: pick(shapeColors, random),
    });
  }

  return {
    backgroundColor,
    components,
  };
}
