import test from "node:test";
import assert from "node:assert/strict";
import {
  generateVisualDrill,
  hasVisibleComponentCombination,
  randomIntegerInRange,
} from "./visualDrillGenerator.js";

const config = {
  minimumSpaces: 2, maximumSpaces: 4, backgroundColors: ["#fff"],
  useDigits: true, useShapes: false, minimumDigit: 3, maximumDigit: 7,
  digitColors: ["#123456"], shapes: ["circle"], shapeColors: ["#abcdef"],
};

test("generates within the configured ranges", () => {
  const graphic = generateVisualDrill(config, () => 0.999);
  assert.equal(graphic.components.length, 4);
  assert.deepEqual(graphic.components.map((item) => item.value), [7, 7, 7, 7]);
  assert.ok(graphic.components.every((item) => item.color === "#123456"));
});

test("supports background-only drills", () => {
  const graphic = generateVisualDrill({ ...config, minimumSpaces: 0, maximumSpaces: 0 }, () => 0);
  assert.deepEqual(graphic, { backgroundColor: "#fff", components: [] });
});

test("does not generate a fallback symbol when no shapes are selected", () => {
  const graphic = generateVisualDrill({
    ...config,
    minimumSpaces: 2,
    maximumSpaces: 2,
    useDigits: false,
    useShapes: true,
    shapes: [],
  }, () => 0);
  assert.deepEqual(graphic.components, []);
});

test("generates uploaded image components", () => {
  const graphic = generateVisualDrill({
    ...config,
    minimumSpaces: 1,
    maximumSpaces: 1,
    useDigits: false,
    useImages: true,
    images: [{ id: "logo", name: "Logo", url: "https://example.com/logo.png" }],
  }, () => 0);
  assert.deepEqual(graphic.components[0], {
    type: "image",
    value: "logo",
    label: "Logo",
    url: "https://example.com/logo.png",
  });
});

test("random integer ranges support fixed and variable intervals", () => {
  assert.equal(randomIntegerInRange(5, 5, 1, 20, () => 0.9), 5);
  assert.equal(randomIntegerInRange(1, 20, 1, 20, () => 0.999), 20);
});

test("never generates a digit matching the selected background", () => {
  const graphic = generateVisualDrill({
    ...config,
    minimumSpaces: 3,
    maximumSpaces: 3,
    backgroundColors: ["#ff0000", "#0000ff"],
    digitColors: ["#ff0000", "#00ff00"],
  }, () => 0);

  assert.equal(graphic.backgroundColor, "#ff0000");
  assert.deepEqual(graphic.components.map((item) => item.color), ["#00ff00", "#00ff00", "#00ff00"]);
});

test("chooses a compatible background when a component has one possible color", () => {
  const graphic = generateVisualDrill({
    ...config,
    minimumSpaces: 1,
    maximumSpaces: 1,
    backgroundColors: ["#ff0000", "#0000ff"],
    digitColors: ["#ff0000"],
  }, () => 0);

  assert.equal(graphic.backgroundColor, "#0000ff");
  assert.equal(graphic.components[0].color, "#ff0000");
});

test("color collision checks are case-insensitive", () => {
  const graphic = generateVisualDrill({
    ...config,
    minimumSpaces: 1,
    maximumSpaces: 1,
    useDigits: false,
    useShapes: true,
    backgroundColors: ["#FF0000"],
    shapeColors: ["#ff0000", "#00ff00"],
  }, () => 0);

  assert.equal(graphic.components[0].color, "#00ff00");
});

test("reports impossible same-color-only filter sets", () => {
  assert.equal(hasVisibleComponentCombination({
    ...config,
    maximumSpaces: 2,
    backgroundColors: ["#ff0000"],
    digitColors: ["#FF0000"],
  }), false);
});
