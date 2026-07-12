import test from "node:test";
import assert from "node:assert/strict";
import { generateVisualDrill } from "./visualDrillGenerator.js";

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
