import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KPI_TABLE_COLUMNS,
  KPI_TABLE_COLORS,
  KPI_TABLE_SCOPE,
  KPI_VALUE_FIELDS,
  createDefaultKpiTablePayload,
  fetchSharedKpiTableState,
  fetchSharedKpiTables,
  saveSharedKpiTableDraft,
  updateKpiTableField,
} from "../kpiTableState.js";
import styles from "./KpiTables.module.css";

const SECTION_LABELS = { defense: "Defense", offense: "Offense" };

function KpiTable({ section, rows, editable, disabled, onChange }) {
  return <section className={styles.tableSection}>
    <h3>{SECTION_LABELS[section]}</h3>
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <colgroup><col className={styles.labelColumn} />{KPI_TABLE_COLUMNS.map((column) => <col key={column} />)}</colgroup>
        <thead><tr><th className={styles.labelHeader} aria-label="KPI name" />
          {KPI_TABLE_COLUMNS.map((column) => <th key={column} scope="col">{column}</th>)}
        </tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={row.id}>
          <th scope="row" className={styles.rowLabel}>{editable
            ? <div className={styles.labelEditor}><input aria-label={`${SECTION_LABELS[section]} row ${rowIndex + 1} label`} value={row.label} disabled={disabled}
              maxLength={100} placeholder="KPI" onChange={(event) => onChange(rowIndex, "label", event.target.value)} />
              <label className={styles.colorLabel}>Full Screen color
                <select aria-label={`${SECTION_LABELS[section]} row ${rowIndex + 1} Full Screen color`} value={row.color} disabled={disabled}
                  onChange={(event) => onChange(rowIndex, "color", event.target.value)}>
                  {KPI_TABLE_COLORS.map((color) => <option key={color} value={color}>{color === "default" ? "Gray" : color[0].toUpperCase() + color.slice(1)}</option>)}
                </select>
              </label></div>
            : row.label || <span aria-hidden="true">—</span>}</th>
          {KPI_VALUE_FIELDS.map((field, columnIndex) => <td key={field} className={field === "total" ? styles.totalCell : undefined}>{editable
            ? <input aria-label={`${SECTION_LABELS[section]} row ${rowIndex + 1} ${KPI_TABLE_COLUMNS[columnIndex]}`}
              value={row[field]} disabled={disabled} maxLength={100}
              onChange={(event) => onChange(rowIndex, field, event.target.value)} />
            : row[field]}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

export function KpiTablesEditor({ gameId }) {
  const fullscreenRef = useRef(null);
  const client = useQueryClient();
  const queryKey = useMemo(() => [KPI_TABLE_SCOPE, gameId, "editor-state"], [gameId]);
  const dashboardQueryKey = useMemo(() => [KPI_TABLE_SCOPE, gameId], [gameId]);
  const [draft, setDraft] = useState(null);
  const [version, setVersion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey,
    queryFn: () => fetchSharedKpiTableState(gameId),
    refetchInterval: draft ? false : 5_000,
    refetchOnWindowFocus: !draft,
  });

  useEffect(() => {
    if (!draft) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  const update = (section, rowIndex, field, value) => {
    setDraft((current) => updateKpiTableField(current, section, rowIndex, field, value));
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    try {
      await client.cancelQueries({ queryKey });
      const saved = await saveSharedKpiTableDraft(gameId, draft, version);
      client.setQueryData(queryKey, saved);
      client.setQueryData(dashboardQueryKey, saved.payload);
      setDraft(null);
      setVersion(saved.version);
      setError(saved.defaultsError || "");
    } catch (cause) {
      setError(cause?.code === "SHARED_STATE_CONFLICT"
        ? "Another user saved changes while you were editing. Your draft is preserved. Cancel and reload before trying again."
        : `Unable to save. Your draft is preserved. ${cause?.message || "Please try again."}`);
    } finally {
      setSaving(false);
    }
  };

  const payload = draft || query.data?.payload || createDefaultKpiTablePayload();

  const openFullscreen = async () => {
    try {
      await fullscreenRef.current?.requestFullscreen();
    } catch (cause) {
      setError(`Unable to open Full Screen. ${cause?.message || "Please try again."}`);
    }
  };

  return <section ref={fullscreenRef} className={styles.editor} aria-label="Shared KPI tables editor">
    <div className={styles.editorHeading}>
      <div><h2>Game KPI Tables</h2><p>{draft ? "Editing — changes are shared only after you click Save." : "Shared game KPIs. Click Edit to make changes."}</p></div>
      <div className={styles.editorActions}>
        <button type="button" className={styles.cancelButton} onClick={openFullscreen}
          disabled={Boolean(draft) || query.isPending || Boolean(query.error)}
          title={draft ? "Save or cancel your edits before opening Full Screen." : "Show Defense and Offense totals"}>Full Screen</button>
        {draft ? <button type="button" className={styles.cancelButton} disabled={saving} onClick={() => {
          if (!window.confirm("Discard your unpublished KPI edits?")) return;
          setDraft(null); setError(""); void query.refetch();
        }}>Cancel</button> : null}
        <button type="button" className={styles.editButton}
          disabled={saving || (!draft && (query.isFetching || query.isPending || Boolean(query.error)))}
          onClick={() => {
            if (draft) { void save(); return; }
            setVersion(query.data?.version || null);
            setDraft(structuredClone(query.data?.payload || createDefaultKpiTablePayload()));
            setError("");
          }}>{saving ? "Saving…" : draft ? "Save" : "Edit"}</button>
      </div>
    </div>
    {(error || query.error) ? <div className={styles.error} role="alert">{error || "Unable to load shared KPI tables."}</div> : null}
    <div className={styles.tableStack}>
      {Object.keys(SECTION_LABELS).map((section) => <KpiTable key={section} section={section} rows={payload[section]}
        editable={Boolean(draft)} disabled={saving} onChange={(rowIndex, field, value) => update(section, rowIndex, field, value)} />)}
    </div>
    <div className={styles.fullscreenOutput} aria-label="Defense and Offense KPI totals">
      <button type="button" className={styles.exitFullscreen} onClick={() => { void document.exitFullscreen(); }}>Exit Full Screen</button>
      {Object.keys(SECTION_LABELS).map((section) => <section key={section} className={styles.fullscreenSection}>
        <h2>{SECTION_LABELS[section]}</h2>
        <div className={styles.fullscreenMetrics}>
          {payload[section].map((row, index) => <article key={row.id} className={styles.fullscreenMetric}>
            <h3>{row.label || `KPI ${index + 1}`}</h3>
            <div className={`${styles.fullscreenValue} ${styles[`fill_${row.color}`] || ""}`}>
              <span className={row.total.length > 12 ? styles.longValue : row.total.length > 6 ? styles.mediumValue : undefined}>{row.total || "\u00a0"}</span>
            </div>
          </article>)}
        </div>
      </section>)}
    </div>
  </section>;
}

export function GameKpiTables({ gameId }) {
  const [collapsed, setCollapsed] = useState(true);
  const { data, isPending, error } = useQuery({
    queryKey: [KPI_TABLE_SCOPE, gameId],
    queryFn: () => fetchSharedKpiTables(gameId),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
  const payload = data || createDefaultKpiTablePayload();
  return <section className={styles.dashboard} aria-label="KPIs">
    <button type="button" className={styles.toggleButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
      <span>KPIs</span><span aria-hidden="true">{collapsed ? "+" : "−"}</span>
    </button>
    {collapsed ? null : <div className={styles.dashboardBody}>
      {error ? <p role="alert">Unable to load shared KPIs.</p> : null}
      <div className={styles.tableStack} aria-busy={isPending}>
        {Object.keys(SECTION_LABELS).map((section) => <KpiTable key={section} section={section} rows={payload[section]} />)}
      </div>
    </div>}
  </section>;
}
