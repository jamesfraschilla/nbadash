import { supabase } from "./supabaseClient.js";
import { loadLegacyLocalNotes } from "./notesStorage.js";

const DEFAULT_ACCOUNT_RECORD_LIMIT = 200;
const MAX_ACCOUNT_RECORD_LIMIT = 500;

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
}

function normalizeAccountRecordLimit(limit) {
  const value = Number(limit);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_ACCOUNT_RECORD_LIMIT;
  return Math.min(MAX_ACCOUNT_RECORD_LIMIT, Math.floor(value));
}

function normalizeTextArray(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

const PUBLIC_NOTE_TAG = "Halftime";
const LEGACY_PUBLIC_NOTE_TAG = "Concept";

function normalizeNoteTags(values) {
  return Array.from(
    new Set(
      normalizeTextArray(values).map((tag) => (
        tag === LEGACY_PUBLIC_NOTE_TAG ? PUBLIC_NOTE_TAG : tag
      ))
    )
  );
}

function hasPublicNoteTag(tags) {
  return normalizeNoteTags(tags).includes(PUBLIC_NOTE_TAG);
}

function normalizeNoteRow(note) {
  if (!note) return note;
  return {
    ...note,
    tags: normalizeNoteTags(note.tags),
  };
}

function resolveNoteSharingScope(tags, requestedScope) {
  if (hasPublicNoteTag(tags)) return "shared";
  return requestedScope === "shared" ? "shared" : "private";
}

function normalizeNoteSourceMeta(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next = {};
  const type = String(value.type || "").trim();
  const clipUrl = String(value.clip_url || "").trim();
  const actionNumber = Number(value.action_number);
  const videoEventId = Number(value.video_event_id);

  if (type) next.type = type;
  if (clipUrl) next.clip_url = clipUrl;
  if (!Number.isNaN(actionNumber)) next.action_number = actionNumber;
  if (!Number.isNaN(videoEventId)) next.video_event_id = videoEventId;
  return next;
}

function assignIfDefined(target, key, value) {
  if (value !== undefined) {
    target[key] = value;
  }
}

async function insertAuditLog(actorId, entityType, entityId, action, detail = {}) {
  if (!supabase || !actorId) return;
  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    detail,
  });
}

async function invokeAtomicRpc(name, args) {
  requireSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (String(error.message || "").includes("Could not find the function")) {
      throw new Error("The latest account-data Supabase migration has not been applied.");
    }
    throw error;
  }
  return data;
}

export async function fetchProfile(userId) {
  requireSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function touchProfileLastLogin(userId) {
  requireSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

export async function fetchVisibleProfiles() {
  requireSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,display_name,role,team_scopes,status,feature_flags,last_login_at,created_at,updated_at")
    .order("display_name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function updateProfile(profileId, updates, actorId) {
  requireSupabase();
  const payload = {};
  assignIfDefined(payload, "display_name", updates.display_name);
  assignIfDefined(payload, "email", updates.email);
  assignIfDefined(payload, "role", updates.role);
  assignIfDefined(payload, "status", updates.status);
  if (updates.team_scopes !== undefined) {
    payload.team_scopes = normalizeTextArray(updates.team_scopes);
  }
  if (updates.feature_flags !== undefined) {
    payload.feature_flags = normalizeTextArray(updates.feature_flags);
  }
  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", profileId)
    .select("*")
    .single();
  if (error) throw error;
  await insertAuditLog(actorId, "profile", profileId, "updated", payload);
  return data;
}

export async function fetchPendingInvites() {
  requireSupabase();
  const { data, error } = await supabase
    .from("account_invites")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getCurrentAccessToken(explicitAccessToken) {
  if (explicitAccessToken) return explicitAccessToken;
  requireSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.access_token || "";
}

export async function createUserInvite({ accessToken, email, displayName, role, teamScopes }) {
  requireSupabase();
  const currentAccessToken = await getCurrentAccessToken(accessToken);
  const { data, error } = await supabase.functions.invoke("admin-users", {
    headers: currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : undefined,
    body: {
      action: "invite",
      email,
      displayName,
      role,
      teamScopes,
    },
  });
  if (error) {
    throw new Error(error.message || "Unable to create invite.");
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

export async function createManagedUser({ accessToken, email, password, displayName, role, teamScopes }) {
  requireSupabase();
  const currentAccessToken = await getCurrentAccessToken(accessToken);
  const { data, error } = await supabase.functions.invoke("admin-users", {
    headers: currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : undefined,
    body: {
      action: "create_user",
      email,
      password,
      displayName,
      role,
      teamScopes,
    },
  });
  if (error) {
    throw new Error(error.message || "Unable to create user.");
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

export async function listNotesForGame(gameId, actorId) {
  requireSupabase();
  if (!actorId) return [];
  const { data, error } = await supabase
    .from("user_notes")
    .select("*")
    .eq("game_id", gameId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const notes = (data || []).map(normalizeNoteRow);
  const sharedCandidateIds = notes
    .filter((note) => note.owner_id !== actorId && !hasPublicNoteTag(note.tags))
    .map((note) => note.id);

  if (!sharedCandidateIds.length) {
    return notes.filter((note) => note.owner_id === actorId || hasPublicNoteTag(note.tags));
  }

  const { data: sharedRows, error: sharedError } = await supabase
    .from("user_note_shares")
    .select("note_id")
    .eq("user_id", actorId)
    .in("note_id", sharedCandidateIds);
  if (sharedError) throw sharedError;

  const sharedNoteIds = new Set((sharedRows || []).map((row) => row.note_id));
  return notes.filter((note) => (
    note.owner_id === actorId ||
    hasPublicNoteTag(note.tags) ||
    sharedNoteIds.has(note.id)
  ));
}

export async function listOwnedNotes(actorId, options = {}) {
  requireSupabase();
  const limit = normalizeAccountRecordLimit(options.limit);
  const { data, error } = await supabase
    .from("user_notes")
    .select("*")
    .eq("owner_id", actorId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(normalizeNoteRow);
}

export async function createNote(note, actorId) {
  requireSupabase();
  const noteId = String(note.id || (typeof crypto !== "undefined" ? crypto.randomUUID() : `note-${Date.now()}`));
  const createdAtIso = note.createdAtIso || new Date().toISOString();
  const tags = normalizeNoteTags(note.tags);
  const payload = {
    id: noteId,
    owner_id: actorId,
    legacy_local_id: note.legacyLocalId || null,
    game_id: String(note.gameId || ""),
    period_label: note.periodLabel || null,
    minutes: note.minutes ?? null,
    seconds: note.seconds ?? null,
    text: String(note.text || "").trim(),
    tags,
    source_meta: normalizeNoteSourceMeta(note.sourceMeta),
    sharing_scope: resolveNoteSharingScope(tags, note.sharingScope),
    created_at: createdAtIso,
    updated_at: createdAtIso,
  };
  const saved = await invokeAtomicRpc("create_user_note_atomic", { p_note: payload });
  return normalizeNoteRow(saved);
}

export async function importLegacyLocalNotes(actorId) {
  requireSupabase();
  const localNotes = loadLegacyLocalNotes();
  if (!actorId) {
    throw new Error("A signed-in user is required to import notes.");
  }
  if (!localNotes.length) {
    return { importedCount: 0, skippedCount: 0 };
  }

  const rows = localNotes.map((note, index) => {
    const createdAt = Number(note?.createdAt || 0);
    const createdAtIso = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();
    const legacyLocalId = String(note?.id || `${note?.gameId || "game"}-${createdAt || Date.now()}-${index}`);
    return {
      owner_id: actorId,
      legacy_local_id: legacyLocalId,
      game_id: String(note?.gameId || ""),
      period_label: note?.periodLabel || null,
      minutes: note?.minutes ?? null,
      seconds: note?.seconds ?? null,
      text: String(note?.text || "").trim(),
      tags: normalizeNoteTags(note?.tags),
      sharing_scope: resolveNoteSharingScope(note?.tags, "private"),
      created_at: createdAtIso,
      updated_at: createdAtIso,
    };
  });

  const dedupedRows = Array.from(
    new Map(rows.map((row) => [row.legacy_local_id, row])).values()
  );

  const legacyIds = dedupedRows
    .map((row) => row.legacy_local_id)
    .filter(Boolean);

  const { data: existingRows, error: existingError } = await supabase
    .from("user_notes")
    .select("legacy_local_id")
    .eq("owner_id", actorId)
    .in("legacy_local_id", legacyIds);

  if (existingError) throw existingError;

  const existingLegacyIds = new Set((existingRows || []).map((row) => row.legacy_local_id));
  const rowsToInsert = dedupedRows.filter((row) => !existingLegacyIds.has(row.legacy_local_id));

  if (!rowsToInsert.length) {
    return {
      importedCount: 0,
      skippedCount: dedupedRows.length,
    };
  }

  const importedNotes = [];
  for (const row of rowsToInsert) {
    const importedNote = await createNote({
      legacyLocalId: row.legacy_local_id,
      gameId: row.game_id,
      periodLabel: row.period_label,
      minutes: row.minutes,
      seconds: row.seconds,
      text: row.text,
      tags: row.tags,
      sourceMeta: row.source_meta,
      sharingScope: row.sharing_scope,
      createdAtIso: row.created_at,
    }, actorId);
    importedNotes.push(importedNote);
  }

  await insertAuditLog(actorId, "note_import", null, "imported_legacy_local_notes", {
    importedCount: importedNotes.length,
    sourceCount: localNotes.length,
  });

  return {
    importedCount: importedNotes.length,
    skippedCount: Math.max(0, dedupedRows.length - importedNotes.length),
  };
}

export async function updateNoteRecord(noteId, updates, actorId) {
  requireSupabase();
  const payload = {};
  if (updates.text !== undefined) payload.text = String(updates.text || "").trim();
  if (updates.tags !== undefined) payload.tags = normalizeNoteTags(updates.tags);
  if (updates.periodLabel !== undefined) payload.period_label = updates.periodLabel;
  if (updates.minutes !== undefined) payload.minutes = updates.minutes;
  if (updates.seconds !== undefined) payload.seconds = updates.seconds;
  if (updates.sourceMeta !== undefined) payload.source_meta = normalizeNoteSourceMeta(updates.sourceMeta);
  if (updates.sharingScope !== undefined) payload.sharing_scope = updates.sharingScope;
  const saved = await invokeAtomicRpc("update_user_note_atomic", {
    p_note_id: noteId,
    p_updates: payload,
  });
  return normalizeNoteRow(saved);
}

export async function deleteNoteRecord(noteId, actorId) {
  requireSupabase();
  const deleted = await invokeAtomicRpc("delete_user_note_atomic", { p_note_id: noteId });
  if (!deleted) throw new Error("Supabase did not confirm that the note was deleted.");
}

export async function listNoteVersions(noteId) {
  requireSupabase();
  const { data, error } = await supabase
    .from("user_note_versions")
    .select("*")
    .eq("note_id", noteId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listNoteShares(noteId) {
  requireSupabase();
  const { data, error } = await supabase
    .from("user_note_shares")
    .select("user_id")
    .eq("note_id", noteId);
  if (error) throw error;
  return (data || []).map((row) => row.user_id);
}

export async function updateNoteShares(noteId, userIds, actorId) {
  requireSupabase();
  const normalizedUserIds = normalizeTextArray(userIds);
  await invokeAtomicRpc("replace_user_note_shares_atomic", {
    p_note_id: noteId,
    p_user_ids: normalizedUserIds,
  });
}

export async function listDrawings(gameId = null) {
  requireSupabase();
  let query = supabase
    .from("user_drawings")
    .select("*")
    .order("updated_at", { ascending: false });
  if (gameId) query = query.eq("game_id", gameId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function listOwnedDrawings(actorId, options = {}) {
  requireSupabase();
  const limit = normalizeAccountRecordLimit(options.limit);
  const { data, error } = await supabase
    .from("user_drawings")
    .select("*")
    .eq("owner_id", actorId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function createDrawing(drawing, actorId) {
  requireSupabase();
  const drawingId = String(drawing.id || (typeof crypto !== "undefined" ? crypto.randomUUID() : `drawing-${Date.now()}`));
  const createdAtIso = drawing.createdAtIso || new Date().toISOString();
  const payload = {
    id: drawingId,
    owner_id: actorId,
    game_id: drawing.gameId || null,
    title: String(drawing.title || "").trim() || "Untitled",
    court_mode: drawing.courtMode === "full" ? "full" : "half",
    strokes: Array.isArray(drawing.strokes) ? drawing.strokes : [],
    sharing_scope: drawing.sharingScope === "shared" ? "shared" : "private",
    created_at: createdAtIso,
    updated_at: createdAtIso,
  };
  return invokeAtomicRpc("create_user_drawing_atomic", { p_drawing: payload });
}

export async function updateDrawingRecord(drawingId, updates, actorId) {
  requireSupabase();
  const payload = {};
  if (updates.title !== undefined) payload.title = String(updates.title || "").trim() || "Untitled";
  if (updates.courtMode !== undefined) payload.court_mode = updates.courtMode === "full" ? "full" : "half";
  if (updates.strokes !== undefined) payload.strokes = Array.isArray(updates.strokes) ? updates.strokes : [];
  if (updates.sharingScope !== undefined) payload.sharing_scope = updates.sharingScope;
  return invokeAtomicRpc("update_user_drawing_atomic", {
    p_drawing_id: drawingId,
    p_updates: payload,
  });
}

export async function deleteDrawingRecord(drawingId, actorId) {
  requireSupabase();
  const deleted = await invokeAtomicRpc("delete_user_drawing_atomic", { p_drawing_id: drawingId });
  if (!deleted) throw new Error("Supabase did not confirm that the drawing was deleted.");
}

export async function listDrawingVersions(drawingId) {
  requireSupabase();
  const { data, error } = await supabase
    .from("user_drawing_versions")
    .select("*")
    .eq("drawing_id", drawingId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listDrawingShares(drawingId) {
  requireSupabase();
  const { data, error } = await supabase
    .from("user_drawing_shares")
    .select("user_id")
    .eq("drawing_id", drawingId);
  if (error) throw error;
  return (data || []).map((row) => row.user_id);
}

export async function updateDrawingShares(drawingId, userIds, actorId) {
  requireSupabase();
  const normalizedUserIds = normalizeTextArray(userIds);
  await invokeAtomicRpc("replace_user_drawing_shares_atomic", {
    p_drawing_id: drawingId,
    p_user_ids: normalizedUserIds,
  });
}
