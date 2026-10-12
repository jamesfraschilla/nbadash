export const NOTE_TAG_OPTIONS = [
  "Playcall", "Officiating", "Injury", "Good", "Bad", "Offense", "Defense", "Halftime", "Misc",
];

export function normalizeNoteTags(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => {
    const tag = String(value || "").trim();
    if (tag === "Reminder") return "Officiating";
    if (tag === "Concept") return "Halftime";
    return tag;
  }).filter(Boolean))];
}

export function hasPublicNoteTag(tags) {
  return normalizeNoteTags(tags).some((tag) => tag === "Halftime" || tag === "Playcall");
}

// Only replace the automatic play description; preserve text the author typed.
export function toggleNewNoteTag(form, tag, checked, playText = null) {
  const tags = checked ? [...new Set([...form.tags, tag])] : form.tags.filter((value) => value !== tag);
  let text = form.text;
  if (tag === "Playcall" && playText != null) {
    if (checked && text === playText) text = "";
    else if (!checked && text === "") text = playText;
  }
  return { ...form, tags, text };
}
