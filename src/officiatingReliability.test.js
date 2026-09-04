import test from "node:test";
import assert from "node:assert/strict";

import { canonicalOfficialId, canonicalOfficialIdentity } from "./officiatingIdentity.js";
import {
  CUMULATIVE_OFFICIATING_SEASON,
  currentOfficiatingSeasonDefault,
  defaultOfficiatingSeasonForTab,
  officiatingSeasonValues,
} from "./officiatingSeasons.js";

test("official identity aliases collapse known duplicate referee records", () => {
  assert.equal(canonicalOfficialId("11629177"), "1629177");
  assert.equal(canonicalOfficialId("196295108"), "1629171");
  assert.deepEqual(canonicalOfficialIdentity({
    officialId: "11629177",
    officialName: "B. Maru",
    jerseyNumber: "",
  }), {
    officialId: "1629177",
    officialName: "Biniam Maru",
    jerseyNumber: "94",
  });
});

test("officiating season defaults roll over on October 3 while officials stay cumulative", () => {
  const beforeRollover = new Date("2026-10-02T23:59:59-04:00");
  const afterRollover = new Date("2026-10-03T00:00:00-04:00");

  assert.equal(currentOfficiatingSeasonDefault(beforeRollover), "2025-26");
  assert.equal(currentOfficiatingSeasonDefault(afterRollover), "2026-27");
  assert.equal(defaultOfficiatingSeasonForTab("officials", afterRollover), CUMULATIVE_OFFICIATING_SEASON);
  assert.equal(defaultOfficiatingSeasonForTab("teams", afterRollover), "2026-27");
  assert.deepEqual(officiatingSeasonValues(CUMULATIVE_OFFICIATING_SEASON), ["2024-25", "2025-26", "2026-27"]);
});
