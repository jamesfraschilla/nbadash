import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlayerHeadshotUploadFormat,
  normalizePlayerHeadshotKey,
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

test("current NBA roster headshot gaps have shared external fallbacks", () => {
  assert.deepEqual(
    resolvePlayerHeadshotOverrideUrls("1643539", "/nbadash/"),
    ["https://a.espncdn.com/i/headshots/nba/players/full/5105571.png"]
  );
  assert.deepEqual(
    resolvePlayerHeadshotOverrideUrls("1641759", "/nbadash/"),
    ["https://a.espncdn.com/i/headshots/nba/players/full/5106283.png"]
  );
  assert.deepEqual(
    resolvePlayerHeadshotOverrideUrls("1643022", "/nbadash/"),
    ["https://a.espncdn.com/i/headshots/mens-college-basketball/players/full/4683730.png"]
  );
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

test("player headshot overrides accept manual roster keys", () => {
  const manualKey = "manual:1610612764:norris-agbakoko-row";
  playerHeadshotOverrides[manualKey] = "player-headshots/norris-agbakoko.png";

  try {
    assert.equal(normalizePlayerHeadshotKey("PERSON:1643407"), "1643407");
    assert.equal(normalizePlayerHeadshotKey("Manual:1610612764:Norris Agbakoko Row"), manualKey);
    const urls = resolvePlayerHeadshotOverrideUrls(manualKey, "/nbadash/");
    assert.deepEqual(urls, ["/nbadash/player-headshots/norris-agbakoko.png"]);
  } finally {
    delete playerHeadshotOverrides[manualKey];
  }
});

test("player headshot upload formats preserve alpha-capable image types", () => {
  assert.deepEqual(getPlayerHeadshotUploadFormat("image/png"), {
    contentType: "image/png",
    extension: "png",
  });
  assert.deepEqual(getPlayerHeadshotUploadFormat("image/webp"), {
    contentType: "image/webp",
    extension: "webp",
  });
  assert.deepEqual(getPlayerHeadshotUploadFormat("image/jpg"), {
    contentType: "image/jpeg",
    extension: "jpg",
  });
  assert.deepEqual(getPlayerHeadshotUploadFormat("application/octet-stream"), {
    contentType: "image/jpeg",
    extension: "jpg",
  });
});
