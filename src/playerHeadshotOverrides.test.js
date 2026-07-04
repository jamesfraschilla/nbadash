import assert from "node:assert/strict";
import test from "node:test";
import {
  playerHeadshotOverrides,
  resolvePlayerHeadshotOverrideUrls,
} from "./playerHeadshotOverrides.js";

test("player headshot overrides are resolved by personId and base-path normalized", () => {
  playerHeadshotOverrides["999999"] = "player-headshots/999999.png";

  try {
    const urls = resolvePlayerHeadshotOverrideUrls("999999", "/nbadash/");
    assert.equal(urls[0], "/nbadash/player-headshots/999999.png");
  } finally {
    delete playerHeadshotOverrides["999999"];
  }
});

test("player headshot overrides accept ordered external candidates", () => {
  playerHeadshotOverrides["999998"] = [
    "https://example.com/primary.png",
    "https://example.com/backup.png",
  ];

  try {
    const urls = resolvePlayerHeadshotOverrideUrls("999998", "/nbadash/");
    assert.deepEqual(urls, [
      "https://example.com/primary.png",
      "https://example.com/backup.png",
    ]);
  } finally {
    delete playerHeadshotOverrides["999998"];
  }
});
