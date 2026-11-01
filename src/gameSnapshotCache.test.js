import test from "node:test";
import assert from "node:assert/strict";
import { readGameSnapshot, saveGameSnapshot } from "./gameSnapshotCache.js";
const game = id => ({ gameId: id, gameStatus: 2, homeTeam: { teamId: 1 }, awayTeam: { teamId: 2 }, playByPlayActions: [{ actionNumber: 1 }] });
const store = () => { const data = new Map(); return { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) }; };
test("public cache restores exact game and segment without saving private top-level data", () => {
  const s = store(), now = 1_000_000;
  assert.equal(saveGameSnapshot({ ...game("001"), user_notes: ["private"], session: "secret" }, null, { store: s, now }), true);
  const result = readGameSnapshot("001", null, { store: s, now });
  assert.equal(result.savedAt, now);
  assert.equal(result.game.user_notes, undefined);
  assert.equal(result.game.session, undefined);
  assert.equal(readGameSnapshot("002", null, { store: s, now }), null);
  assert.equal(readGameSnapshot("001", "Q1", { store: s, now }), null);
  assert.equal(readGameSnapshot("001", null, { store: s, now: now + 73 * 3600_000 }), null);
});
test("empty feeds cannot overwrite usable cache; count, quota, corruption and size stay bounded", () => {
  const s = store();
  for (let i = 1; i <= 3; i++) assert.equal(saveGameSnapshot(game(`bounded${i}`), null, { store: s, now: 2_000_000 + i * 31_000 }), true);
  assert.equal(readGameSnapshot("bounded1", null, { store: s, now: 2_100_000 }), null);
  assert.equal(saveGameSnapshot({ ...game("empty"), playByPlayActions: [] }, null, { store: s, now: 2_100_000 }), false);
  assert.equal(saveGameSnapshot(game("quota"), null, { store: { getItem: () => null, setItem: () => { throw Error("quota"); } }, now: 2_100_000 }), false);
  assert.equal(saveGameSnapshot({ ...game("huge"), playByPlayActions: [{ description: "x".repeat(1_200_001) }] }, null, { store: s, now: 2_100_000 }), false);
  assert.equal(readGameSnapshot("bad", null, { store: { getItem: () => "{" } }), null);
});
