const STORAGE_KEY = "nba-dashboard:notes";

const readNotes = () => {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeNotes = (notes) => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
};

export const loadNotes = () => readNotes();

export const loadNotesForGame = (gameId) =>
  readNotes().filter((note) => note.gameId === gameId);

export const saveNote = (note) => {
  const notes = readNotes();
  notes.push(note);
  writeNotes(notes);
  return notes;
};

export const deleteNote = (id) => {
  const notes = readNotes();
  const next = notes.filter((note) => note.id !== id);
  writeNotes(next);
  return next;
};

export const updateNote = (id, updates) => {
  const notes = readNotes();
  const next = notes.map((note) => (note.id === id ? { ...note, ...updates } : note));
  writeNotes(next);
  return next;
};
