import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/useAuth.js";
import { getNbaTeamRoster } from "../data/nbaTeams.js";
import {
  TABLE_GRAPHIC_MAX_COLUMNS,
  TABLE_GRAPHIC_MAX_ROWS,
  TABLE_GRAPHIC_CELL_MODES,
  TABLE_GRAPHIC_MIN_COLUMNS,
  TABLE_GRAPHIC_MIN_ROWS,
  addTableGraphicColumn,
  addTableGraphicRow,
  createTableGraphicDraft,
  getTableGraphicExportRows,
  normalizeTableGraphicDraft,
  removeTableGraphicColumn,
  removeTableGraphicRow,
  resolveTableGraphicCellValue,
} from "../tableGraphic.js";
import {
  deleteSavedToolRecord,
  deleteSavedToolRecordRemote,
  getSavedToolRecord,
  getSavedToolRecordRemote,
  saveToolRecord,
  saveToolRecordRemote,
  TOOL_RECORD_TYPES,
} from "../toolVault.js";
import { exportTableGraphic } from "./tableGraphicExport.js";
import styles from "./TableGraphicAdmin.module.css";

const WIZARDS_TEAM_ID = "1610612764";

function rosterLabel(player) {
  const jersey = String(player?.jerseyNum || "").trim();
  const name = String(player?.fullName || "").trim();
  return jersey ? `#${jersey} ${name}` : name;
}

export default function TableGraphicAdmin() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { accountsEnabled, profile, user } = useAuth();
  const vaultUserId = user?.id || profile?.id || "local";
  const tableParam = String(params.get("table") || "").trim();
  const roster = useMemo(() => getNbaTeamRoster(WIZARDS_TEAM_ID), []);
  const [draft, setDraft] = useState(() => createTableGraphicDraft());
  const [recordId, setRecordId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const normalized = normalizeTableGraphicDraft(draft);
  const exportRows = getTableGraphicExportRows(normalized, roster);
  const canRemoveRow = normalized.rows.length > TABLE_GRAPHIC_MIN_ROWS;
  const canAddRow = normalized.rows.length < TABLE_GRAPHIC_MAX_ROWS;
  const canRemoveColumn = normalized.columns.length > TABLE_GRAPHIC_MIN_COLUMNS;
  const canAddColumn = normalized.columns.length < TABLE_GRAPHIC_MAX_COLUMNS;

  const updateTitle = (title) => {
    setDraft((current) => ({
      ...normalizeTableGraphicDraft(current),
      title,
    }));
    setStatus("");
  };

  useEffect(() => {
    let cancelled = false;
    async function loadSavedTable() {
      if (!tableParam || !vaultUserId) return;
      let savedRecord = null;
      try {
        savedRecord = accountsEnabled && user?.id
          ? await getSavedToolRecordRemote(user.id, tableParam)
          : getSavedToolRecord(vaultUserId, tableParam);
      } catch (error) {
        console.error("Failed to load remote table graphic, falling back to local storage.", error);
        savedRecord = getSavedToolRecord(vaultUserId, tableParam);
      }
      if (cancelled) return;
      if (!savedRecord?.payload || savedRecord.type !== TOOL_RECORD_TYPES.TABLE_GRAPHIC) {
        setRecordId("");
        setStatus("Saved table graphic not found.");
        return;
      }
      setDraft(normalizeTableGraphicDraft(savedRecord.payload));
      setRecordId(savedRecord.id);
      setStatus(`Loaded ${savedRecord.title}`);
    }
    loadSavedTable();
    return () => {
      cancelled = true;
    };
  }, [accountsEnabled, tableParam, user?.id, vaultUserId]);

  const updateColumnHeader = (columnIndex, header) => {
    setDraft((current) => {
      const next = normalizeTableGraphicDraft(current);
      next.columns[columnIndex] = { ...next.columns[columnIndex], header };
      return next;
    });
    setStatus("");
  };

  const updateRowPlayer = (rowIndex, playerId) => {
    setDraft((current) => {
      const next = normalizeTableGraphicDraft(current);
      next.rows[rowIndex] = { ...next.rows[rowIndex], playerId };
      return next;
    });
    setStatus("");
  };

  const updateCellValue = (rowIndex, valueIndex, value) => {
    setDraft((current) => {
      const next = normalizeTableGraphicDraft(current);
      const row = next.rows[rowIndex];
      next.rows[rowIndex] = {
        ...row,
        values: row.values.map((currentValue, index) => (
          index === valueIndex ? { ...currentValue, value, mode: TABLE_GRAPHIC_CELL_MODES.MANUAL } : currentValue
        )),
      };
      return next;
    });
    setStatus("");
  };

  const updateCellMode = (rowIndex, valueIndex, mode) => {
    setDraft((current) => {
      const next = normalizeTableGraphicDraft(current);
      const row = next.rows[rowIndex];
      next.rows[rowIndex] = {
        ...row,
        values: row.values.map((currentValue, index) => (
          index === valueIndex ? { ...currentValue, mode } : currentValue
        )),
      };
      return next;
    });
    setStatus("");
  };

  const handleExport = async () => {
    setBusy(true);
    setStatus("");
    try {
      await exportTableGraphic({ draft: normalized, roster });
      setStatus(`Exported ${exportRows.length} visible row${exportRows.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error?.message || "Unable to export table graphic.");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!vaultUserId || busy) {
      setStatus("Sign in to save this table graphic.");
      return;
    }
    setBusy(true);
    setStatus("");
    const id = recordId || crypto.randomUUID();
    const timestamp = new Date().toISOString();
    try {
      const record = {
        id,
        type: TOOL_RECORD_TYPES.TABLE_GRAPHIC,
        title: normalized.title.trim() || "Wizards Table Graphic",
        updatedAt: timestamp,
        createdAt: timestamp,
        payload: normalized,
      };
      const savedRecord = accountsEnabled && user?.id
        ? await saveToolRecordRemote(user.id, record)
        : saveToolRecord(vaultUserId, record);
      if (!savedRecord) {
        setStatus("Unable to save this table graphic. Try deleting older browser data or sign in again.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "graphics");
      nextParams.set("graphic", "table");
      nextParams.set("table", savedRecord.id);
      setParams(nextParams, { replace: true });
      setStatus(`Saved to My Vault as ${savedRecord.title}`);
    } catch (error) {
      console.error("Failed to save table graphic.", error);
      setStatus(error?.message || "Unable to save this table graphic.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!vaultUserId || !recordId || busy) return;
    if (!window.confirm("Delete this saved table graphic?")) return;
    setBusy(true);
    try {
      if (accountsEnabled && user?.id) {
        await deleteSavedToolRecordRemote(user.id, recordId);
      } else {
        deleteSavedToolRecord(vaultUserId, recordId);
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setRecordId("");
      setDraft(createTableGraphicDraft());
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "graphics");
      nextParams.set("graphic", "table");
      nextParams.delete("table");
      setParams(nextParams, { replace: true });
      setStatus("Deleted saved table graphic.");
    } catch (error) {
      console.error("Failed to delete table graphic.", error);
      setStatus(error?.message || "Unable to delete this table graphic.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.tableTool}>
      <div className={styles.toolbar}>
        <div>
          <div className={styles.kicker}>Graphics</div>
          <h2 className={styles.title}>Table Graphic</h2>
        </div>
        <div className={styles.toolbarActions}>
          <Link className={styles.secondaryLink} to="/me?tab=graphics&graphic=table">
            My Vault
          </Link>
          {recordId ? (
            <button type="button" className={styles.secondaryButton} onClick={handleDelete} disabled={busy}>
              Delete
            </button>
          ) : null}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setDraft(createTableGraphicDraft());
              setStatus("");
            }}
            disabled={busy}
          >
            Reset
          </button>
          <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={busy}>
            Save
          </button>
          <button type="button" className={styles.primaryButton} onClick={handleExport} disabled={busy}>
            {busy ? "Exporting..." : "Export PNG"}
          </button>
        </div>
      </div>

      <label className={styles.titleField}>
        <span>Title</span>
        <input
          value={normalized.title}
          onChange={(event) => updateTitle(event.target.value)}
          placeholder="Add graphic title"
        />
      </label>

      <div className={styles.tableShell}>
        <div className={styles.columnControl}>
          <button type="button" onClick={() => setDraft(addTableGraphicColumn)} disabled={!canAddColumn || busy} aria-label="Add column">
            +
          </button>
          <button type="button" onClick={() => setDraft(removeTableGraphicColumn)} disabled={!canRemoveColumn || busy} aria-label="Remove column">
            -
          </button>
        </div>
        <div className={styles.tableScroller}>
          <table className={styles.editorTable}>
            <thead>
              <tr>
                {normalized.columns.map((column, columnIndex) => (
                  <th key={column.id}>
                    {columnIndex === 0 ? (
                      <span>PLAYER</span>
                    ) : (
                      <input
                        value={column.header}
                        onChange={(event) => updateColumnHeader(columnIndex, event.target.value)}
                        placeholder="Header"
                        aria-label={`Column ${columnIndex + 1} header`}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalized.rows.map((row, rowIndex) => {
                const isTeamRow = rowIndex === normalized.rows.length - 1;
                return (
                  <tr key={row.id} className={isTeamRow ? styles.teamRow : ""}>
                    <td>
                      {isTeamRow ? (
                        <span className={styles.teamLabel}>TEAM</span>
                      ) : (
                        <select
                          value={row.playerId}
                          onChange={(event) => updateRowPlayer(rowIndex, event.target.value)}
                          aria-label={`Row ${rowIndex + 1} player`}
                        >
                          <option value="">Select player</option>
                          {roster.map((player) => (
                            <option key={player.personId} value={player.personId}>{rosterLabel(player)}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    {row.values.map((cell, valueIndex) => {
                      const resolvedRow = exportRows.find((candidate) => candidate.id === row.id);
                      const resolvedValue = resolvedRow?.values?.[valueIndex]
                        ?? resolveTableGraphicCellValue(cell, normalized.rows, rowIndex, valueIndex);
                      const isFormula = cell.mode !== TABLE_GRAPHIC_CELL_MODES.MANUAL;
                      return (
                      <td key={`${row.id}-${valueIndex}`}>
                        <div className={styles.cellEditor}>
                          <input
                            value={isFormula ? resolvedValue : cell.value}
                            onChange={(event) => updateCellValue(rowIndex, valueIndex, event.target.value)}
                            disabled={isFormula}
                            aria-label={`${isTeamRow ? "Team" : `Row ${rowIndex + 1}`} column ${valueIndex + 2}`}
                          />
                          <select
                            className={styles.formulaSelect}
                            value={cell.mode}
                            onChange={(event) => updateCellMode(rowIndex, valueIndex, event.target.value)}
                            aria-label={`${isTeamRow ? "Team" : `Row ${rowIndex + 1}`} column ${valueIndex + 2} calculation`}
                          >
                            <option value={TABLE_GRAPHIC_CELL_MODES.MANUAL}>Manual</option>
                            <option value={TABLE_GRAPHIC_CELL_MODES.SUM}>Sum</option>
                            <option value={TABLE_GRAPHIC_CELL_MODES.AVERAGE}>Avg</option>
                          </select>
                        </div>
                      </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.rowControl}>
          <button type="button" onClick={() => setDraft(addTableGraphicRow)} disabled={!canAddRow || busy} aria-label="Add row">
            +
          </button>
          <button type="button" onClick={() => setDraft(removeTableGraphicRow)} disabled={!canRemoveRow || busy} aria-label="Remove row">
            -
          </button>
        </div>
      </div>

      <div className={styles.footerMeta}>
        <span>{normalized.rows.length} editor rows</span>
        <span>{normalized.columns.length} columns</span>
        <span>{exportRows.length} export rows</span>
      </div>
      {status ? <div className={styles.status}>{status}</div> : null}
    </div>
  );
}
