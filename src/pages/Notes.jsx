import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { deleteNote, loadNotesForGame } from "../notesStorage.js";
import styles from "./Notes.module.css";

const periodOrder = {
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4,
  OT: 5,
};

const getPeriodOrder = (note) => periodOrder[note.periodLabel] || 99;

const getRemainingSeconds = (note) => {
  if (note.minutes == null || note.seconds == null) return -1;
  return Number(note.minutes) * 60 + Number(note.seconds);
};

const formatClock = (note) => {
  if (note.minutes == null || note.seconds == null) return "--";
  return `${note.minutes}:${String(note.seconds).padStart(2, "0")}`;
};

export default function Notes() {
  const { gameId } = useParams();
  const [params] = useSearchParams();
  const dateParam = params.get("d");
  const [notes, setNotes] = useState(() => loadNotesForGame(gameId));

  useEffect(() => {
    setNotes(loadNotesForGame(gameId));
  }, [gameId]);

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      const periodDiff = getPeriodOrder(a) - getPeriodOrder(b);
      if (periodDiff) return periodDiff;
      const remainingDiff = getRemainingSeconds(b) - getRemainingSeconds(a);
      if (remainingDiff) return remainingDiff;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }, [notes]);

  const handleDelete = (id) => {
    const confirmed = window.confirm("Delete this note?");
    if (!confirmed) return;
    setNotes(deleteNote(id).filter((note) => note.gameId === gameId));
  };

  return (
    <div className={styles.container}>
      <div className={styles.backRow}>
        <Link
          className={styles.backButton}
          to={dateParam ? `/g/${gameId}/atc?d=${dateParam}` : `/g/${gameId}/atc`}
        >
          Back
        </Link>
      </div>

      <h2 className={styles.title}>Notes</h2>

      {sortedNotes.length === 0 ? (
        <div className={styles.empty}>No notes saved yet.</div>
      ) : (
        <div className={styles.list}>
          {sortedNotes.map((note) => (
            <div key={note.id} className={styles.noteRow}>
              <button
                type="button"
                className={styles.noteDelete}
                onClick={() => handleDelete(note.id)}
                aria-label="Delete note"
              >
                ×
              </button>
              <div className={styles.noteMeta}>
                <span className={styles.notePeriod}>{note.periodLabel || "--"}</span>
                <span className={styles.noteClock}>{formatClock(note)}</span>
              </div>
              <div className={styles.noteBody}>{note.text || "—"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
