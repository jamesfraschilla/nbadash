import test from "node:test";
import assert from "node:assert/strict";
import { ATC_MAX_TEXT, capitalCityAtcKey, normalizeAtcPayload } from "./capitalCityAtcState.js";

test("Capital City ATC text and drawing have independent per-game keys", () => {
  assert.equal(capitalCityAtcKey("2022600001", "text"), "2022600001:text");
  assert.notEqual(capitalCityAtcKey("2022600001", "text"), capitalCityAtcKey("2022600001", "drawing"));
  assert.notEqual(capitalCityAtcKey("2022600001", "text"), capitalCityAtcKey("2022600002", "text"));
  assert.throws(() => capitalCityAtcKey("", "text"));
  assert.throws(() => capitalCityAtcKey("2022600001", "rotations"));
});

test("ATC payloads preserve text, normalized drawing coordinates and Pencil-size settings", () => {
  const text = { version: 1, text: "Defend the paint\nSwitch the last screen" };
  assert.deepEqual(normalizeAtcPayload("text", text), text);
  assert.deepEqual(normalizeAtcPayload("text"), { version: 1, text: "" });
  assert.deepEqual(normalizeAtcPayload("drawing"), { version: 1, strokes: [] });
  const drawing = { version: 1, strokes: [
    { tool: "pen", size: 4, color: "#111111", points: [{ x: 0, y: 1 }, { x: 0.525, y: 0.2 }] },
    { tool: "eraser", size: 18, color: "#ff0000", points: [{ x: 1, y: 0 }] },
  ] };
  const restored = normalizeAtcPayload("drawing", JSON.parse(JSON.stringify(drawing)));
  assert.deepEqual(restored, drawing);
  restored.strokes[0].points[0].x = 0.5;
  assert.equal(drawing.strokes[0].points[0].x, 0);
});

test("invalid or oversized ATC content fails visibly instead of becoming an editable blank", () => {
  assert.throws(() => normalizeAtcPayload("text", { version: 2, text: "existing" }));
  assert.throws(() => normalizeAtcPayload("text", { text: "x".repeat(ATC_MAX_TEXT + 1) }));
  assert.throws(() => normalizeAtcPayload("drawing", { strokes: "invalid" }));
  const stroke = { tool: "pen", size: 4, color: "#111111", points: [{ x: NaN, y: 0 }] };
  assert.throws(() => normalizeAtcPayload("drawing", { strokes: [stroke] }));
  assert.throws(() => normalizeAtcPayload("drawing", { strokes: [{ ...stroke, points: [] }] }));
  assert.throws(() => normalizeAtcPayload("drawing", { strokes: [{ ...stroke, points: [{ x: 2, y: 0 }] }] }));
});
