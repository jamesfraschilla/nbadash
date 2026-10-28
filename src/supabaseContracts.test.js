import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const atomicSql = readFileSync(new URL("../supabase/account_data_atomic.sql", import.meta.url), "utf8");
const storageSql = readFileSync(new URL("../supabase/graphic_headshots_storage.sql", import.meta.url), "utf8");
const rosterSnapshotsSql = readFileSync(new URL("../supabase/roster_feed_snapshots.sql", import.meta.url), "utf8");
const gameLiveStateSql = readFileSync(new URL("../supabase/game_live_state.sql", import.meta.url), "utf8");
const gameLiveStateAtomicSql = readFileSync(new URL("../supabase/game_live_state_atomic.sql", import.meta.url), "utf8");
const operationalSql = readFileSync(new URL("../supabase/operational_hardening.sql", import.meta.url), "utf8");
const playcallSql = readFileSync(new URL("../supabase/playcall_note_sharing.sql", import.meta.url), "utf8");
const refereeIdentitySql = readFileSync(new URL("../supabase/referee_identity_registry.sql", import.meta.url), "utf8");
const notesRealtimeSql = readFileSync(new URL("../supabase/user_notes_realtime.sql", import.meta.url), "utf8");

test("Playcall sharing preserves note ownership, revision checks and versions and verifies existing content", () => {
  assert.match(playcallSql, /or 'Playcall' = any\(n\.tags\)/);
  assert.match(playcallSql, /existing\.owner_id <> actor and not public\.is_admin_user\(actor\)/);
  assert.match(playcallSql, /NOTE_CONFLICT/);
  assert.match(playcallSql, /insert into public\.user_note_versions/);
  assert.match(playcallSql, /current_hash <> saved\.content_hash/);
  assert.match(playcallSql, /'user_notes', 'user_note_versions', 'user_note_shares'/);
  assert.match(playcallSql, /on commit drop/);
});

test("note realtime publishes notes and shares without rewriting saved content", () => {
  assert.match(notesRealtimeSql, /alter publication supabase_realtime add table public\.user_notes/i);
  assert.match(notesRealtimeSql, /alter publication supabase_realtime add table public\.user_note_shares/i);
  assert.doesNotMatch(notesRealtimeSql, /\b(update|delete|truncate)\s+public\.user_notes\b/i);
});

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
  assert.match(atomicSql, /alter table public\.user_notes\s+add column if not exists revision/i);
  assert.match(atomicSql, /alter table public\.user_drawings\s+add column if not exists revision/i);
  assert.match(atomicSql, /NOTE_CONFLICT/);
  assert.match(atomicSql, /DRAWING_CONFLICT/);
});

test("revision repair is additive and fingerprints existing notes, drawings, versions, and shares", () => {
  const sql = readFileSync(new URL("../supabase/account_revision_columns.sql", import.meta.url), "utf8");
  for (const table of ["user_notes", "user_drawings"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} add column if not exists revision integer not null default 1`, "i"));
  }
  for (const table of ["user_notes", "user_note_versions", "user_note_shares", "user_drawings", "user_drawing_versions", "user_drawing_shares"]) {
    assert.ok(sql.includes(`'${table}'`));
  }
  assert.match(sql, /current_hash <> saved\.content_hash/);
  assert.match(sql, /to_jsonb\(t\) - ''revision''/);
  assert.match(sql, /on commit drop/);
  assert.doesNotMatch(sql, /\b(?:update|delete|truncate|drop table)\s+public\./i);
  assert.doesNotMatch(sql, /create or replace function|alter policy|disable row level security/i);
});

test("deployment applies revision repair and tests real RPCs before attesting schema", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-supabase.yml", import.meta.url), "utf8");
  const repair = workflow.indexOf("--rawfile query supabase/account_revision_columns.sql");
  const verify = workflow.indexOf("--rawfile query scripts/verify-note-edit-rollback.sql");
  const attest = workflow.indexOf("- name: Attest database after automatic migrations succeed");
  assert.ok(repair > 0 && verify > repair && attest > verify);
  const verification = readFileSync(new URL("../scripts/verify-note-edit-rollback.sql", import.meta.url), "utf8");
  assert.match(verification, /NOTE_CONFLICT/);
  assert.match(verification, /DRAWING_CONFLICT/);
  assert.match(verification, /Unauthorized note edit was not rejected/);
  assert.match(verification, /rollback;\s*$/i);
  assert.doesNotMatch(verification, /\bcommit\s*;/i);
  const productionCheck = readFileSync(new URL("../scripts/verify-supabase-production.mjs", import.meta.url), "utf8");
  assert.match(productionCheck, /select=revision&limit=0/);
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

test("game live state writes are atomically deduplicated across viewers", () => {
  assert.match(gameLiveStateAtomicSql, /upsert_game_live_state_if_changed/i);
  assert.match(gameLiveStateAtomicSql, /pg_advisory_xact_lock/i);
  assert.match(gameLiveStateAtomicSql, /existing\.source_signature = incoming_signature/i);
  assert.match(gameLiveStateAtomicSql, /grant execute .* to service_role/is);
  assert.match(gameLiveStateAtomicSql, /revoke all .* from authenticated/is);
});

test("operational hardening atomically rate-limits Edge requests and records deployments", () => {
  assert.match(operationalSql, /consume_edge_request_limit/i);
  assert.match(operationalSql, /on conflict \(user_id, function_name, window_start\)/i);
  assert.match(operationalSql, /grant execute .* to service_role/is);
  assert.match(operationalSql, /supabase_deployment_state/i);
  assert.match(operationalSql, /revoke all .* from public, anon, authenticated/is);
});

test("referee identity registry is compact, ID-based, and service-role maintained", () => {
  assert.match(refereeIdentitySql, /official_id text primary key/i);
  assert.match(refereeIdentitySql, /name_aliases text\[\]/i);
  assert.match(refereeIdentitySql, /jersey_number_history text\[\]/i);
  assert.match(refereeIdentitySql, /observe_nba_official_identities/i);
  assert.match(refereeIdentitySql, /revoke all .* from public, anon, authenticated/is);
  assert.doesNotMatch(refereeIdentitySql, /source_payload jsonb/i);
});
