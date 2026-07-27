import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const atomicSql = readFileSync(new URL("../supabase/account_data_atomic.sql", import.meta.url), "utf8");
const storageSql = readFileSync(new URL("../supabase/graphic_headshots_storage.sql", import.meta.url), "utf8");
const rosterSnapshotsSql = readFileSync(new URL("../supabase/roster_feed_snapshots.sql", import.meta.url), "utf8");
const gameLiveStateSql = readFileSync(new URL("../supabase/game_live_state.sql", import.meta.url), "utf8");

test("account-data migration defines atomic version, share, and revision contracts", () => {
  [
    "create_user_note_atomic",
    "update_user_note_atomic",
    "replace_user_note_shares_atomic",
    "create_user_drawing_atomic",
    "update_user_drawing_atomic",
    "replace_user_drawing_shares_atomic",
    "save_user_tool_record_atomic",
    "TOOL_RECORD_CONFLICT",
  ].forEach((value) => assert.match(atomicSql, new RegExp(value)));
  assert.match(atomicSql, /add column if not exists revision integer not null default 1/i);
});

test("graphic headshot bucket enforces owner folders and PNG size limits", () => {
  assert.match(storageSql, /'graphic-headshots'/);
  assert.match(storageSql, /5242880/);
  assert.match(storageSql, /array\['image\/png'\]/);
  assert.match(storageSql, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
});

test("roster snapshots are service-role-only and support both leagues", () => {
  assert.match(rosterSnapshotsSql, /create table if not exists public\.roster_feed_snapshots/i);
  assert.match(rosterSnapshotsSql, /league in \('nba', 'gleague'\)/i);
  assert.match(rosterSnapshotsSql, /revoke all on table public\.roster_feed_snapshots from anon, authenticated/i);
});

test("game live state stores compact authenticated-readable snapshots", () => {
  assert.match(gameLiveStateSql, /create table if not exists public\.game_live_state/i);
  assert.match(gameLiveStateSql, /source_signature text not null/i);
  assert.match(gameLiveStateSql, /payload jsonb not null/i);
  assert.match(gameLiveStateSql, /diagnostics jsonb not null/i);
  assert.match(gameLiveStateSql, /league in \('nba', 'gleague', 'summer', 'unknown'\)/i);
  assert.match(gameLiveStateSql, /for select\s+to authenticated\s+using \(true\)/i);
});
