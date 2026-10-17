import assert from "node:assert/strict";
import test from "node:test";

import { correctedChallengeTeam } from "./officiatingCorrections.js";

test("returns reviewed team corrections only for the exact challenge event", () => {
  assert.equal(correctedChallengeTeam("0012600028", 2, "PT05M07.00S"), "SAC");
  assert.equal(correctedChallengeTeam("0012600028", 3, "PT05M07.00S"), "");
});
