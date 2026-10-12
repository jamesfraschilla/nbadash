import test from "node:test";
import assert from "node:assert/strict";
import { NOTE_TAG_OPTIONS, hasPublicNoteTag, normalizeNoteTags, toggleNewNoteTag } from "./noteTags.js";

test("Playcall and Halftime are public; Officiating and legacy Reminder remain private", () => {
  assert.equal(NOTE_TAG_OPTIONS[0], "Playcall");
  assert.equal(NOTE_TAG_OPTIONS[1], "Officiating");
  assert.equal(hasPublicNoteTag(["Playcall"]), true);
  assert.equal(hasPublicNoteTag(["Halftime"]), true);
  assert.equal(hasPublicNoteTag(["Concept"]), true);
  assert.equal(hasPublicNoteTag(["Reminder"]), false);
  assert.equal(hasPublicNoteTag(["Officiating"]), false);
  assert.deepEqual(normalizeNoteTags(["Reminder", "Officiating", "custom"]), ["Officiating", "custom"]);
});

test("Playcall clears automatic play text while other tags and authored text are preserved", () => {
  const form = { text: "Davis Jump Shot", tags: [], minutes: "6", seconds: "55" };
  const playcall = toggleNewNoteTag(form, "Playcall", true, form.text);
  assert.equal(playcall.text, "");
  assert.equal(playcall.minutes, "6");
  assert.equal(toggleNewNoteTag(playcall, "Playcall", false, form.text).text, form.text);
  assert.equal(toggleNewNoteTag(form, "Officiating", true, form.text).text, form.text);
  assert.equal(toggleNewNoteTag({ ...form, text: "My custom note" }, "Playcall", true, form.text).text, "My custom note");
  assert.equal(form.text, "Davis Jump Shot");
});
