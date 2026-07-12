export const DRILL_SHAPES = ["triangle", "square", "circle", "star"];

function randomIndex(length, random) {
  return Math.floor(random() * length);
}

function pick(values, random) {
  return values[randomIndex(values.length, random)];
}

export function clampInteger(value, minimum, maximum) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function generateVisualDrill(config, random = Math.random) {
  const minimumSpaces = clampInteger(config.minimumSpaces, 0, 5);
  const maximumSpaces = Math.max(minimumSpaces, clampInteger(config.maximumSpaces, 0, 5));
  const spaceCount = minimumSpaces + randomIndex((maximumSpaces - minimumSpaces) + 1, random);
  const backgroundColors = config.backgroundColors.filter(Boolean);
  const enabledTypes = [
    config.useDigits ? "digit" : null,
    config.useShapes ? "shape" : null,
  ].filter(Boolean);

  const components = Array.from({ length: enabledTypes.length ? spaceCount : 0 }, () => {
    const type = pick(enabledTypes, random);
    if (type === "digit") {
      const minimumDigit = clampInteger(config.minimumDigit, 0, 9);
      const maximumDigit = Math.max(minimumDigit, clampInteger(config.maximumDigit, 0, 9));
      return {
        type,
        value: minimumDigit + randomIndex((maximumDigit - minimumDigit) + 1, random),
        color: pick(config.digitColors.filter(Boolean), random),
      };
    }

    return {
      type,
      value: pick(config.shapes, random),
      color: pick(config.shapeColors.filter(Boolean), random),
    };
  });

  return {
    backgroundColor: pick(backgroundColors, random),
    components,
  };
}
