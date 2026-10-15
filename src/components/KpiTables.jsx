import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KPI_QUARTER_FIELDS,
  KPI_TABLE_COLUMNS,
  KPI_TABLE_SCOPE,
  calculateKpiRowTotal,
  createDefaultKpiTablePayload,
  fetchSharedKpiTables,
  mergeKpiTablePayload,
  saveSharedKpiTables,
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
            ? <input aria-label={`${SECTION_LABELS[section]} row ${rowIndex + 1} label`} value={row.label} disabled={disabled}
              maxLength={100} placeholder="KPI" onChange={(event) => onChange(rowIndex, "label", event.target.value)} />
            : row.label || <span aria-hidden="true">—</span>}</th>
          {KPI_QUARTER_FIELDS.map((field, columnIndex) => <td key={field}>{editable
            ? <input aria-label={`${SECTION_LABELS[section]} row ${rowIndex + 1} ${KPI_TABLE_COLUMNS[columnIndex]}`}
              value={row[field]} disabled={disabled} inputMode="decimal" maxLength={16}
              onChange={(event) => {
                if (/^-?\d*(?:\.\d*)?$/.test(event.target.value)) onChange(rowIndex, field, event.target.value);
              }} />
            : row[field]}</td>)}
          <td className={styles.totalCell}>{calculateKpiRowTotal(row)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

export function KpiTablesEditor({ gameId }) {
  const client = useQueryClient();
  const queryKey = useMemo(() => [KPI_TABLE_SCOPE, gameId], [gameId]);
  const [payload, setPayload] = useState(createDefaultKpiTablePayload);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const revisionRef = useRef(0);
  const query = useQuery({
    queryKey,
    queryFn: () => fetchSharedKpiTables(gameId),
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!query.data) return;
    setPayload((current) => mergeKpiTablePayload(current, query.data));
  }, [query.data]);

  useEffect(() => {
    if (!revision) return undefined;
    const snapshotRevision = revision;
    const timeoutId = window.setTimeout(() => {
      setSaving(true);
      setError("");
      saveSharedKpiTables(gameId, payload)
        .then((saved) => {
          client.setQueryData(queryKey, saved);
          setPayload((current) => mergeKpiTablePayload(current, saved));
          if (revisionRef.current === snapshotRevision) setRevision(0);
        })
        .catch((cause) => setError(cause?.message || "Unable to save shared KPI tables."))
        .finally(() => setSaving(false));
    }, 750);
    return () => window.clearTimeout(timeoutId);
  }, [client, gameId, payload, queryKey, revision]);

  const update = (section, rowIndex, field, value) => {
    setPayload((current) => updateKpiTableField(current, section, rowIndex, field, value));
    revisionRef.current += 1;
    setRevision(revisionRef.current);
  };

  return <section className={styles.editor} aria-label="Shared KPI tables editor">
    <div className={styles.editorHeading}>
      <div><h2>Game KPI Tables</h2><p>Changes are shared with everyone and appear on the main game dashboard.</p></div>
      <span className={styles.saveStatus}>{saving ? "Saving…" : revision ? "Unsaved changes" : query.isPending ? "Loading…" : "Saved"}</span>
    </div>
    {(error || query.error) ? <div className={styles.error} role="alert">{error || "Unable to load shared KPI tables."}</div> : null}
    <div className={styles.tableStack}>
      {Object.keys(SECTION_LABELS).map((section) => <KpiTable key={section} section={section} rows={payload[section]}
        editable disabled={saving} onChange={(rowIndex, field, value) => update(section, rowIndex, field, value)} />)}
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
