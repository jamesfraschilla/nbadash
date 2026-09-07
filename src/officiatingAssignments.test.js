import assert from "node:assert/strict";
import test from "node:test";

import { markParticipatingAssignments } from "./officiatingAssignments.js";

test("replacement officials with calls become active and the zero-call original becomes alternate", () => {
  const assignments = [1, 2, 3, 4].map((order) => ({
    game_id: "game-1",
    official_id: String(order),
    official_name: `Official ${order}`,
    assignment_order: order,
    role_key: order === 1 ? "crewChief" : order === 4 ? "alternate" : "",
    is_alternate: order === 4,
  }));
  const calls = [1, 2, 4].map((id) => ({ game_id: "game-1", official_id: String(id) }));

  markParticipatingAssignments(assignments, calls);

  assert.deepEqual(assignments.map((row) => row.is_alternate), [false, false, true, false]);
  assert.equal(assignments[3].role_key, "");
});

test("all four officials remain participants when all four made calls", () => {
  const assignments = [1, 2, 3, 4].map((order) => ({
    game_id: "game-2",
    official_id: String(order),
    assignment_order: order,
    role_key: order === 4 ? "alternate" : "",
    is_alternate: order === 4,
  }));
  const calls = [1, 2, 3, 4].map((id) => ({ game_id: "game-2", official_id: String(id) }));

  markParticipatingAssignments(assignments, calls);

  assert.equal(assignments.every((row) => !row.is_alternate), true);
});
