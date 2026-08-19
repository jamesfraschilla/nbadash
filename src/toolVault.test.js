import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  listSavedToolRecords,
  replaceSavedToolRecords,
  saveToolRecord,
  TOOL_RECORD_TYPES,
} from "./toolVault.js";

afterEach(() => {
  delete global.window;
});

function installMockLocalStorage({ failFirstToolVaultWrite = false } = {}) {
  const store = new Map();
  const storage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (failFirstToolVaultWrite && String(key).startsWith("nba-dashboard:tool-vault:v1:")) {
        failFirstToolVaultWrite = false;
        throw new Error("quota exceeded");
      }
      store.set(key, String(value));
      this[key] = String(value);
    },
    removeItem(key) {
      store.delete(key);
      delete this[key];
    },
  };
  global.window = { localStorage: storage };
  return storage;
}

test("tool vault saves and lists local records", () => {
  installMockLocalStorage();

  const saved = saveToolRecord("guest", {
    id: "draft-1",
    type: TOOL_RECORD_TYPES.MATCHUP_GRAPHIC,
    title: "Saved Match-Up",
    payload: { leftTeamId: "1" },
  });

  assert.equal(saved?.id, "draft-1");
  assert.deepEqual(listSavedToolRecords("guest").map((record) => record.id), ["draft-1"]);
});

test("tool vault retries after clearing bulky cache entries", () => {
  const storage = installMockLocalStorage({ failFirstToolVaultWrite: true });
  storage.setItem("nba-dashboard-season-games:2025-26", "cached season data");

  const saved = saveToolRecord("guest", {
    id: "draft-2",
    type: TOOL_RECORD_TYPES.DEPTH_CHART_GRAPHIC,
    title: "Saved Depth Chart",
    payload: { teamId: "1610612764" },
  });

  assert.equal(saved?.id, "draft-2");
  assert.equal(storage.getItem("nba-dashboard-season-games:2025-26"), null);
  assert.deepEqual(listSavedToolRecords("guest").map((record) => record.id), ["draft-2"]);
});

test("tool vault reports failed local writes", () => {
  global.window = {
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {},
    },
  };

  const saved = saveToolRecord("guest", {
    id: "draft-3",
    type: TOOL_RECORD_TYPES.MATCHUP_GRAPHIC,
    title: "Blocked",
    payload: {},
  });

  assert.equal(saved, null);
});

test("tool vault filters local records by type and limit", () => {
  installMockLocalStorage();

  saveToolRecord("coach", {
    id: "visual-new",
    type: TOOL_RECORD_TYPES.VISUAL_DRILL_PRESET,
    title: "New Visual Drill",
    payload: {},
    updatedAt: "2026-08-18T14:00:00.000Z",
  });
  saveToolRecord("coach", {
    id: "matchup",
    type: TOOL_RECORD_TYPES.MATCHUP_GRAPHIC,
    title: "Match-Up",
    payload: {},
    updatedAt: "2026-08-18T13:00:00.000Z",
  });
  saveToolRecord("coach", {
    id: "visual-old",
    type: TOOL_RECORD_TYPES.VISUAL_DRILL_PRESET,
    title: "Old Visual Drill",
    payload: {},
    updatedAt: "2026-08-18T12:00:00.000Z",
  });

  const records = listSavedToolRecords("coach", {
    types: [TOOL_RECORD_TYPES.VISUAL_DRILL_PRESET],
    limit: 1,
  });

  assert.deepEqual(records.map((record) => record.id), ["visual-new"]);
});

test("a successful remote snapshot replaces stale local records", () => {
  installMockLocalStorage();
  saveToolRecord("coach", {
    id: "deleted-remotely",
    type: TOOL_RECORD_TYPES.MATCHUP_GRAPHIC,
    title: "Stale local draft",
    payload: {},
  });

  const records = replaceSavedToolRecords("coach", [{
    id: "remote-draft",
    type: TOOL_RECORD_TYPES.PERSONNEL_GRAPHIC,
    title: "Remote draft",
    payload: {},
    updatedAt: "2026-07-18T12:00:00.000Z",
  }]);

  assert.deepEqual(records.map((record) => record.id), ["remote-draft"]);
  assert.deepEqual(listSavedToolRecords("coach").map((record) => record.id), ["remote-draft"]);
});

test("local updates preserve creation time and the newest known revision", () => {
  installMockLocalStorage();
  saveToolRecord("coach", {
    id: "versioned",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    revision: 3,
    payload: { value: 1 },
  });
  const saved = saveToolRecord("coach", {
    id: "versioned",
    createdAt: "2026-07-21T12:00:00.000Z",
    updatedAt: "2026-07-21T12:00:00.000Z",
    revision: 2,
    payload: { value: 2 },
  });
  assert.equal(saved.createdAt, "2026-07-01T12:00:00.000Z");
  assert.equal(saved.revision, 3);
});
