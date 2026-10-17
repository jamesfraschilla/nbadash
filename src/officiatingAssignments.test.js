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
  assert.equal(assignments[3].role_key, "umpire");
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

test("a listed alternate who worked as the third official is assigned the missing umpire role", () => {
  const assignments = [
    { game_id: "game-3", official_id: "1", assignment_order: 1, role_key: "crewChief", is_alternate: false },
    { game_id: "game-3", official_id: "2", assignment_order: 2, role_key: "referee", is_alternate: false },
    { game_id: "game-3", official_id: "3", assignment_order: 3, role_key: "alternate", is_alternate: true },
  ];
  const calls = [1, 2, 3].map((id) => ({ game_id: "game-3", official_id: String(id) }));

  markParticipatingAssignments(assignments, calls);

  assert.deepEqual(assignments.map((row) => row.role_key), ["crewChief", "referee", "umpire"]);
  assert.equal(assignments[2].is_alternate, false);
});
