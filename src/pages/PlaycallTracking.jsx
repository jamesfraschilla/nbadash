import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { NBA_TEAMS } from "../data/nbaTeams.js";
import { fetchSharedStateRow, saveSharedStateRow } from "../sharedState.js";
import styles from "./PlaycallTracking.module.css";

const SCOPE = "playcall_tracking";
const columns = ["Playcall", "Action", "Description"];
const blankRow = () => ({ playcall: "", action: "", description: "" });
const fields = ["playcall", "action", "description"];

function TeamTable({ team, onEditingChange, onSavingChange }) {
  const client = useQueryClient();
  const queryKey = [SCOPE, team.teamId];
  const [draft, setDraft] = useState(null);
  const [version, setVersion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    onEditingChange(Boolean(draft));
    if (!draft) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); onEditingChange(false); };
  }, [draft, onEditingChange]);
  useEffect(() => { onSavingChange(saving); }, [saving, onSavingChange]);
  const query = useQuery({
    queryKey,
    queryFn: () => fetchSharedStateRow(SCOPE, team.teamId),
    staleTime: 0,
    refetchInterval: draft ? false : 30_000,
    refetchOnWindowFocus: !draft,
  });
  const rows = Array.isArray(query.data?.payload?.rows) ? query.data.payload.rows : [];
  async function save() {
    setSaving(true);
    setError("");
    try {
      await client.cancelQueries({ queryKey });
      const result = await saveSharedStateRow({
        scopeType: SCOPE, scopeKey: team.teamId,
        payload: { rows: draft }, expectedVersion: version,
      });
      if (!result) throw new Error("Shared storage is unavailable.");
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, result);
      setDraft(null);
    } catch (cause) {
      setError(cause.code === "SHARED_STATE_CONFLICT"
        ? "Another user saved changes while you were editing. Your draft is preserved. Copy your edits, then cancel and reload before trying again."
        : `Unable to save. Your draft is preserved. ${cause.message || "Please try again."}`);
    } finally {
      setSaving(false);
    }
  }
  return <section>
    <div className={styles.heading}>
      <h2>{team.fullName}</h2>
      <div className={styles.buttons}>
        {draft && <button type="button" disabled={saving} onClick={() => {
          if (!window.confirm("Discard your unpublished edits?")) return;
          setDraft(null); setError(""); void query.refetch();
        }}>Cancel</button>}
        <button type="button" disabled={saving || (!draft && (query.isFetching || query.isPending || Boolean(query.error)))} onClick={() => {
          if (draft) { void save(); return; }
          setVersion(query.data?.version || null);
          setDraft(rows.length ? rows.map((row) => ({ ...row })) : Array.from({ length: 5 }, blankRow));
          setError("");
        }}>{saving ? "Saving…" : draft ? "Save" : "Edit"}</button>
      </div>
    </div>
    <p>{draft ? "Editing — changes are shared only after you click Save." : "Shared team playcalls. Click Edit to make changes."}</p>
    {(error || query.error) && <p role="alert">{error || "Unable to load shared playcalls. Please retry."}</p>}
    {query.error && <button type="button" onClick={() => void query.refetch()}>Retry</button>}
    {query.isPending ? <p>Loading playcalls…</p> : <div className={styles.tableWrap}>
      <table className={styles.table}>
        <colgroup><col className={styles.shortColumn} /><col className={styles.shortColumn} /><col /></colgroup>
        <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{(draft || rows).map((row, index) => <tr key={index}>
          {fields.map((field, column) => <td key={field}>{draft
            ? <textarea aria-label={`${columns[column]} row ${index + 1}`} value={row[field] || ""} disabled={saving} rows={3} maxLength={4000}
              onChange={(event) => setDraft((current) => current.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item))} />
            : <span>{row[field] || ""}</span>}</td>)}
        </tr>)}</tbody>
      </table>
      {!draft && !rows.length && !query.error && <p>No playcalls saved yet. Click Edit to get started.</p>}
    </div>}
    {draft && <button type="button" disabled={saving} onClick={() => setDraft((current) => [...current, blankRow()])}>Add row</button>}
  </section>;
}

export default function PlaycallTracking({ onEditingChange }) {
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { onEditingChange(editing); return () => onEditingChange(false); }, [editing, onEditingChange]);
  const team = NBA_TEAMS.find((item) => item.teamId === params.get("team"));
  return <section className={styles.workspace}>
    <h2>Playcall Tracking</h2>
    <label className={styles.teamPicker}>NBA Team
      <select disabled={saving} value={team?.teamId || ""} onChange={(event) => {
        if (editing && !window.confirm("Leave this team and discard unpublished edits?")) return;
        const next = new URLSearchParams(params);
        if (event.target.value) next.set("team", event.target.value); else next.delete("team");
        setParams(next);
      }}>
        <option value="">Select a team</option>
        {NBA_TEAMS.map((item) => <option key={item.teamId} value={item.teamId}>{item.fullName}</option>)}
      </select>
    </label>
    {team ? <TeamTable key={team.teamId} team={team} onEditingChange={setEditing} onSavingChange={setSaving} /> : <p>Select a team to view its playcalls.</p>}
  </section>;
}
