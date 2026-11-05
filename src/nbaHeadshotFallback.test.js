import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNbaFallbackHeadshotUrl,
  pixelBuffersMatch,
  headshotFingerprintsMatch,
} from "./nbaHeadshotFallback.js";

test("buildNbaFallbackHeadshotUrl maps official NBA headshots to the matching fallback size", () => {
  assert.equal(
    buildNbaFallbackHeadshotUrl("https://cdn.nba.com/headshots/nba/latest/260x190/1642844.png"),
    "https://cdn.nba.com/headshots/nba/latest/260x190/fallback.png"
  );
  assert.equal(
    buildNbaFallbackHeadshotUrl("https://cdn.nba.com/headshots/nba/latest/1040x760/1642844.png?cache=1"),
    "https://cdn.nba.com/headshots/nba/latest/1040x760/fallback.png"
  );
});
test("resized silhouette fingerprints tolerate only near-exact interpolation differences",()=>{
  const reference=new Uint8ClampedArray([160,160,160,255,0,0,0,0]);
  assert.equal(headshotFingerprintsMatch(reference,new Uint8ClampedArray([161,161,161,255,255,255,255,0])),true);
  assert.equal(headshotFingerprintsMatch(reference,new Uint8ClampedArray([200,100,50,255,0,0,0,0])),false);
  assert.equal(headshotFingerprintsMatch(reference,new Uint8ClampedArray([160,160,160,0,0,0,0,0])),false);
  assert.equal(headshotFingerprintsMatch(null,reference),false);
});

test("buildNbaFallbackHeadshotUrl ignores custom and unrelated images", () => {
  assert.equal(buildNbaFallbackHeadshotUrl("data:image/png;base64,abc"), "");
  assert.equal(buildNbaFallbackHeadshotUrl("https://example.com/headshots/nba/latest/260x190/1.png"), "");
  assert.equal(buildNbaFallbackHeadshotUrl("https://cdn.nba.com/logos/nba/1610612764/primary/L/logo.svg"), "");
  assert.equal(buildNbaFallbackHeadshotUrl(""), "");
});

test("pixelBuffersMatch requires an exact same-length pixel match", () => {
  assert.equal(pixelBuffersMatch(new Uint8ClampedArray([1, 2, 3]), new Uint8ClampedArray([1, 2, 3])), true);
  assert.equal(pixelBuffersMatch(new Uint8ClampedArray([1, 2, 3]), new Uint8ClampedArray([1, 2, 4])), false);
  assert.equal(pixelBuffersMatch(new Uint8ClampedArray([1, 2]), new Uint8ClampedArray([1, 2, 3])), false);
});
