export const DRILL_SHAPES = ["triangle", "square", "circle", "star"];

function randomIndex(length, random) {
  return Math.floor(random() * length);
}

function pick(values, random) {
  if (!values.length) return null;
  return values[randomIndex(values.length, random)];
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
  const backgroundColors = config.backgroundColors.filter(Boolean);
  const images = Array.isArray(config.images) ? config.images.filter((image) => image?.url) : [];
  const shapes = Array.isArray(config.shapes) ? config.shapes.filter(Boolean) : [];
  const enabledTypes = [
    config.useDigits ? "digit" : null,
    config.useShapes && shapes.length ? "shape" : null,
    config.useImages && images.length ? "image" : null,
  ].filter(Boolean);

  const components = Array.from({ length: enabledTypes.length ? spaceCount : 0 }, () => {
    const type = pick(enabledTypes, random);
    if (type === "digit") {
      return {
        type,
        value: randomIntegerInRange(config.minimumDigit, config.maximumDigit, 0, 9, random),
        color: pick(config.digitColors.filter(Boolean), random),
      };
    }

    if (type === "image") {
      const image = pick(images, random);
      return {
        type,
        value: image.id || image.path || image.url,
        url: image.url,
        label: image.name || "Uploaded image",
      };
    }

    return {
      type,
      value: pick(shapes, random),
      color: pick(config.shapeColors.filter(Boolean), random),
    };
  });

  return {
    backgroundColor: pick(backgroundColors, random) || "#ffffff",
    components,
  };
}
