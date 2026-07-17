import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import fireTagUrl from "../assets/personnel/fire.png";
import coldTagUrl from "../assets/personnel/cold.png";
import drivesRightTagUrl from "../assets/personnel/drives-right.png";
import drivesLeftTagUrl from "../assets/personnel/drives-left.png";
import { fetchNbaPlayerStats } from "../api.js";
import { useAuth } from "../auth/useAuth.js";
import Dialog from "../components/ui/Dialog.jsx";
import { NBA_TEAMS } from "../data/nbaTeams.js";
import {
  DEFAULT_PERSONNEL_STAT_KEYS,
  PERSONNEL_SLOT_COUNT,
  PERSONNEL_STAT_OPTIONS,
  PERSONNEL_TAG_OPTIONS,
  PERSONNEL_THREE_POINT_COLOR_OPTIONS,
  createPersonnelDraft,
  createPersonnelRow,
  getCurrentPersonnelSeason,
  getPersonnelThreePointColorForPercentage,
  getPreviousPersonnelSeason,
  hasExactlyFourPersonnelStats,
  hydratePersonnelDraft,
  normalizePersonnelStatsMap,
  populatePersonnelDraftFromRoster,
  togglePersonnelRowStat,
  validatePersonnelDraftForExport,
} from "../personnelGraphic.js";
import {
  deleteSavedToolRecord,
  deleteSavedToolRecordRemote,
  getSavedToolRecord,
  getSavedToolRecordRemote,
  saveToolRecord,
  saveToolRecordRemote,
  TOOL_RECORD_TYPES,
} from "../toolVault.js";
import { exportPersonnelGraphics } from "./personnelGraphicExport.js";
import styles from "./PersonnelGraphicAdmin.module.css";

const TAG_IMAGE_URLS = {
  fire: fireTagUrl,
  cold: coldTagUrl,
  drives_right: drivesRightTagUrl,
  drives_left: drivesLeftTagUrl,
};

function formatPlayerOption(player) {
  const jersey = String(player?.jerseyNum || "").trim();
  const name = String(player?.fullName || "").trim();
  return jersey ? `#${jersey} ${name}` : name;
}

function formatSourceDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Live roster unavailable — using the local roster snapshot";
  return `Live roster updated ${date.toLocaleString()}`;
}

function formatStatsSource(value) {
  const source = String(value || "");
  if (source.includes("espn")) return " · ESPN fallback";
  if (source === "nba-web-fallback") return " · NBA.com";
  return source ? " · NBA API" : "";
}

function getValidationMessage(validation) {
  const firstError = validation?.errors?.[0];
  if (!firstError) return "Ready to export";
  return firstError.message || "Every exported player must have exactly four stats selected.";
}

function buildDraftTitle(team, season) {
  return `${team?.fullName || "NBA"} Personnel Graphics · ${season}`;
}

function buildExportItems(rows, rosterById, statsById) {
  return rows.map((row) => ({
    player: rosterById[row.personId] || row,
    stats: statsById[row.personId] || {},
    selectedStats: row.selectedStats,
    tags: row.tags,
    threePointColor: row.threePointColor,
  }));
}

export default function PersonnelGraphicAdmin({ rosterMap, rosterFetchedAt, rosterSeason }) {
  const { accountsEnabled, user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(() => createPersonnelDraft());
  const [recordId, setRecordId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState(null);
  const vaultUserId = user?.id || (!accountsEnabled ? "guest" : "");
  const personnelParam = String(params.get("personnel") || "").trim();
  const teamId = String(draft.teamId || "").trim();
  const season = String(draft.season || "").trim();
  const currentStatsSeason = useMemo(() => getCurrentPersonnelSeason(), []);
  const previousStatsSeason = useMemo(
    () => getPreviousPersonnelSeason(currentStatsSeason),
    [currentStatsSeason]
  );
  const seasonOptions = useMemo(() => (
    [...new Set([currentStatsSeason, previousStatsSeason, season].filter(Boolean))]
  ), [currentStatsSeason, previousStatsSeason, season]);
  const selectedTeam = NBA_TEAMS.find((team) => team.teamId === teamId) || null;
  const roster = useMemo(() => (
    Array.isArray(rosterMap?.[teamId]) ? rosterMap[teamId] : []
  ), [rosterMap, teamId]);
  const rosterById = useMemo(() => (
    Object.fromEntries(roster.map((player) => [String(player.personId), player]))
  ), [roster]);
  const statsPlayers = useMemo(() => draft.rows
    .filter((row) => row.personId)
    .map((row) => rosterById[row.personId] || row), [draft.rows, rosterById]);
  const statsPlayerKey = statsPlayers.map((player) => player.personId).join(",");

  const {
    data: statsPayload,
    isLoading: statsLoading,
    isFetching: statsFetching,
    isSuccess: statsLoaded,
    error: statsError,
  } = useQuery({
    queryKey: ["personnel-player-stats", season, teamId, statsPlayerKey],
    queryFn: () => fetchNbaPlayerStats({
      season,
      teamId,
      players: statsPlayers,
    }),
    enabled: Boolean(teamId),
    staleTime: 6 * 60 * 60 * 1000,
    retry: 0,
  });
  const statsById = useMemo(
    () => normalizePersonnelStatsMap(statsPayload, roster),
    [roster, statsPayload]
  );
  const statsReady = Boolean(teamId && statsLoaded && !statsError);
  const selectedValidation = useMemo(
    () => validatePersonnelDraftForExport(draft, { mode: "selected" }),
    [draft]
  );
  const allValidation = useMemo(
    () => validatePersonnelDraftForExport(draft, { mode: "all" }),
    [draft]
  );
  const selectedExportReady = selectedValidation.valid && statsReady;
  const allExportReady = allValidation.valid && statsReady;
  const populatedRows = useMemo(() => draft.rows.filter((row) => row.personId), [draft.rows]);
  const allPopulatedRowsEnabled = populatedRows.length > 0 && populatedRows.every((row) => row.enabled);

  useEffect(() => {
    if (!teamId || !roster.length) return;
    setDraft((current) => populatePersonnelDraftFromRoster(current, roster, { teamId }));
  }, [roster, teamId]);

  useEffect(() => {
    if (!statsReady) return;
    setDraft((current) => {
      let changed = false;
      const rows = current.rows.map((row) => {
        if (!row.personId || row.threePointColorEdited) return row;
        const rowStats = statsById[row.personId];
        if (!rowStats || rowStats.threePointPercentage === null || rowStats.threePointPercentage === undefined) {
          return row;
        }
        const defaultColor = getPersonnelThreePointColorForPercentage(rowStats.threePointPercentage);
        if (row.threePointColor === defaultColor) return row;
        changed = true;
        return { ...row, threePointColor: defaultColor };
      });
      return changed ? { ...current, rows } : current;
    });
  }, [statsById, statsReady]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedDraft() {
      if (!personnelParam || !vaultUserId) {
        if (!cancelled) setRecordId("");
        return;
      }

      let savedRecord = null;
      try {
        savedRecord = accountsEnabled && user?.id
          ? await getSavedToolRecordRemote(user.id, personnelParam)
          : getSavedToolRecord(vaultUserId, personnelParam);
      } catch (error) {
        console.error("Failed to load the remote personnel draft, falling back to local storage.", error);
        savedRecord = getSavedToolRecord(vaultUserId, personnelParam);
      }

      if (cancelled) return;
      if (!savedRecord?.payload || savedRecord.type !== TOOL_RECORD_TYPES.PERSONNEL_GRAPHIC) {
        setRecordId("");
        setStatus("Saved personnel draft not found.");
        return;
      }

      setRecordId(savedRecord.id);
      setDraft(hydratePersonnelDraft(savedRecord.payload));
      setStatus(`Loaded ${savedRecord.title}`);
    }

    loadSavedDraft();
    return () => {
      cancelled = true;
    };
  }, [accountsEnabled, personnelParam, user?.id, vaultUserId]);

  const updateRow = (index, updater) => {
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => (
        rowIndex === index
          ? (typeof updater === "function" ? updater(row) : { ...row, ...updater })
          : row
      )),
    }));
    setStatus("");
  };

  const handleTeamChange = (nextTeamId) => {
    const nextRoster = Array.isArray(rosterMap?.[nextTeamId]) ? rosterMap[nextTeamId] : [];
    const emptyDraft = createPersonnelDraft({ teamId: nextTeamId, season });
    setDraft(populatePersonnelDraftFromRoster(emptyDraft, nextRoster, { teamId: nextTeamId }));
    setRecordId("");
    setDialog(null);
    setStatus(nextTeamId && !nextRoster.length ? "Waiting for this team's roster..." : "");
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", "personnel");
    nextParams.delete("personnel");
    setParams(nextParams, { replace: true });
  };

  const handleSeasonChange = (nextSeason) => {
    setDraft((current) => ({ ...current, season: nextSeason }));
    setStatus("");
  };

  const handlePlayerChange = (index, nextPersonId) => {
    const player = rosterById[nextPersonId];
    updateRow(index, player
      ? createPersonnelRow(index, {
        ...player,
        enabled: true,
        selectedStats: DEFAULT_PERSONNEL_STAT_KEYS,
        threePointColor: getPersonnelThreePointColorForPercentage(
          statsById[nextPersonId]?.threePointPercentage
        ),
        threePointColorEdited: false,
      })
      : createPersonnelRow(index));
  };

  const handleToggleAllRows = () => {
    const nextEnabled = !allPopulatedRowsEnabled;
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => (
        row.personId ? { ...row, enabled: nextEnabled } : row
      )),
    }));
    setStatus("");
  };

  const handleToggleTag = (index, tagKey) => {
    updateRow(index, (row) => ({
      ...row,
      tags: row.tags.includes(tagKey)
        ? row.tags.filter((key) => key !== tagKey)
        : [...row.tags, tagKey],
    }));
  };

  const handleSave = async () => {
    if (!vaultUserId || busyAction || !teamId) {
      if (!teamId) setStatus("Select a team before saving.");
      return;
    }
    setBusyAction("save");
    const id = recordId || crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const record = {
      id,
      type: TOOL_RECORD_TYPES.PERSONNEL_GRAPHIC,
      title: buildDraftTitle(selectedTeam, season),
      createdAt: timestamp,
      updatedAt: timestamp,
      payload: draft,
    };

    try {
      const localRecord = saveToolRecord(vaultUserId, record);
      const savedRecord = accountsEnabled && user?.id
        ? await saveToolRecordRemote(user.id, record)
        : localRecord;
      if (!savedRecord) throw new Error("The draft could not be saved.");
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "personnel");
      nextParams.set("personnel", savedRecord.id);
      setParams(nextParams, { replace: true });
      setStatus(`Saved to My Vault as ${savedRecord.title}`);
    } catch (error) {
      console.error("Failed to save the remote personnel draft, falling back to local storage.", error);
      const savedRecord = getSavedToolRecord(vaultUserId, id) || saveToolRecord(vaultUserId, record);
      if (!savedRecord) {
        setStatus("Unable to save this draft. Try deleting older browser data or sign in again.");
      } else {
        await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
        setRecordId(savedRecord.id);
        const nextParams = new URLSearchParams(params);
        nextParams.set("tab", "personnel");
        nextParams.set("personnel", savedRecord.id);
        setParams(nextParams, { replace: true });
        setStatus(`Saved locally as ${savedRecord.title}`);
      }
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async () => {
    if (!vaultUserId || !recordId || busyAction) return;
    if (!window.confirm("Delete this saved personnel graphics draft?")) return;
    setBusyAction("delete");
    try {
      if (accountsEnabled && user?.id) {
        await deleteSavedToolRecordRemote(user.id, recordId);
      } else {
        deleteSavedToolRecord(vaultUserId, recordId);
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setRecordId("");
      setDraft(createPersonnelDraft());
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "personnel");
      nextParams.delete("personnel");
      setParams(nextParams, { replace: true });
      setStatus("Deleted saved personnel draft.");
    } catch (error) {
      console.error("Failed to delete the remote personnel draft, falling back to local storage.", error);
      deleteSavedToolRecord(vaultUserId, recordId);
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setRecordId("");
      setDraft(createPersonnelDraft());
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "personnel");
      nextParams.delete("personnel");
      setParams(nextParams, { replace: true });
      setStatus("Deleted saved personnel draft locally.");
    } finally {
      setBusyAction("");
    }
  };

  const handleReset = () => {
    if (teamId && !window.confirm("Reset all personnel graphic selections?")) return;
    setDraft(createPersonnelDraft());
    setRecordId("");
    setDialog(null);
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", "personnel");
    nextParams.delete("personnel");
    setParams(nextParams, { replace: true });
    setStatus("Reset personnel graphics.");
  };

  const handleExport = async (mode) => {
    const validation = mode === "all" ? allValidation : selectedValidation;
    if (!validation.valid) {
      setStatus(getValidationMessage(validation));
      return;
    }
    if (!statsReady) {
      setStatus(`${season} NBA stats must finish loading before export.`);
      return;
    }
    if (busyAction) return;

    setBusyAction(`export-${mode}`);
    setStatus(`Rendering ${validation.rows.length} personnel graphic${validation.rows.length === 1 ? "" : "s"}...`);
    try {
      const exportedCount = await exportPersonnelGraphics({
        items: buildExportItems(validation.rows, rosterById, statsById),
        team: selectedTeam,
        teamId,
      });
      setStatus(`Exported ${exportedCount} personnel PNG${exportedCount === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error("Failed to export personnel graphics.", error);
      setStatus(error?.message || "Unable to export personnel graphics.");
    } finally {
      setBusyAction("");
    }
  };

  const usedPersonIds = useMemo(() => new Set(
    draft.rows.map((row) => row.personId).filter(Boolean)
  ), [draft.rows]);
  const activeDialogRow = dialog ? draft.rows[dialog.rowIndex] : null;
  const currentColor = PERSONNEL_THREE_POINT_COLOR_OPTIONS.find(
    (option) => option.key === activeDialogRow?.threePointColor
  );

  return (
    <div className={styles.panel}>
      <div className={styles.setupCard}>
        <div className={styles.setupFields}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>NBA Team</span>
            <select className={styles.select} value={teamId} onChange={(event) => handleTeamChange(event.target.value)}>
              <option value="">Select team</option>
              {NBA_TEAMS.map((team) => (
                <option key={team.teamId} value={team.teamId}>{team.fullName}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Stats Season</span>
            <select className={styles.select} value={season} onChange={(event) => handleSeasonChange(event.target.value)}>
              {seasonOptions.map((option) => (
                <option key={option} value={option}>
                  {option}{option === currentStatsSeason ? " (Current)" : option === previousStatsSeason ? " (Previous)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.secondaryButton} onClick={handleReset} disabled={Boolean(busyAction)}>
            Reset
          </button>
        </div>
        <div className={styles.sourceMeta}>
          <strong>{rosterSeason ? `Roster season ${rosterSeason}` : "NBA roster"}</strong>
          <span>{formatSourceDate(rosterFetchedAt)}</span>
          {statsPayload?.season ? (
            <span>Stats: {statsPayload.season} regular season{formatStatsSource(statsPayload.source)}</span>
          ) : null}
        </div>
      </div>

      {!teamId ? (
        <p className={styles.notice}>Select a team to populate all {PERSONNEL_SLOT_COUNT} player slots.</p>
      ) : statsError ? (
        <p className={styles.errorNotice}>{season} player stats could not be loaded. Try again before exporting.</p>
      ) : statsLoading || statsFetching ? (
        <p className={styles.notice}>Loading {season} NBA player stats...</p>
      ) : null}

      <div className={styles.tableShell}>
        <div className={styles.table} role="table" aria-label="Personnel graphic player settings">
          <div className={styles.headerRow} role="row">
            <span aria-label="Include">Use</span>
            <span>Player</span>
            {PERSONNEL_STAT_OPTIONS.map((option) => <span key={option.key}>{option.label}</span>)}
            <span>Tags</span>
            <span>3P Color</span>
          </div>

          {draft.rows.map((row, index) => {
            const statCountValid = hasExactlyFourPersonnelStats(row);
            const missingStats = Boolean(row.personId && statsReady && !statsById[row.personId]);
            const selectedColor = PERSONNEL_THREE_POINT_COLOR_OPTIONS.find((option) => option.key === row.threePointColor)
              || PERSONNEL_THREE_POINT_COLOR_OPTIONS[0];
            return (
              <div
                key={row.id}
                className={`${styles.playerRow} ${row.personId && !statCountValid ? styles.playerRowInvalid : ""}`}
                role="row"
              >
                <label className={styles.rowToggle} title={row.personId ? "Include in Export Selected" : "Select a player first"}>
                  <input
                    type="checkbox"
                    checked={Boolean(row.enabled && row.personId)}
                    disabled={!row.personId}
                    onChange={(event) => updateRow(index, { enabled: event.target.checked })}
                    aria-label={`Include slot ${index + 1} in selected export`}
                  />
                </label>
                <div className={styles.playerCell}>
                  <span className={styles.slotNumber}>{index + 1}</span>
                  <div className={styles.playerSelection}>
                    <select
                      className={styles.rowSelect}
                      value={row.personId}
                      onChange={(event) => handlePlayerChange(index, event.target.value)}
                      disabled={!teamId}
                      aria-label={`Player slot ${index + 1}`}
                    >
                      <option value="">Player</option>
                      {roster.map((player) => (
                        <option
                          key={player.personId}
                          value={player.personId}
                          disabled={usedPersonIds.has(player.personId) && row.personId !== player.personId}
                        >
                          {formatPlayerOption(player)}
                        </option>
                      ))}
                    </select>
                    {missingStats ? <span className={styles.missingStats}>No {season} stats available</span> : null}
                  </div>
                </div>
                {PERSONNEL_STAT_OPTIONS.map((option) => {
                  const checked = row.selectedStats.includes(option.key);
                  const atMaximum = row.selectedStats.length >= 4;
                  return (
                    <label key={option.key} className={styles.statToggle}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!row.personId || (!checked && atMaximum)}
                        onChange={() => updateRow(index, (currentRow) => togglePersonnelRowStat(currentRow, option.key))}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
                <button
                  type="button"
                  className={styles.popupButton}
                  onClick={() => setDialog({ type: "tags", rowIndex: index })}
                  disabled={!row.personId}
                >
                  <span>{row.tags.length ? `Tags (${row.tags.length})` : "Tags"}</span>
                  <span aria-hidden="true">▾</span>
                </button>
                <button
                  type="button"
                  className={styles.popupButton}
                  onClick={() => setDialog({ type: "color", rowIndex: index })}
                  disabled={!row.personId}
                >
                  <span>{selectedColor.label}</span>
                  <span className={styles.colorSwatch} style={{ background: selectedColor.color }} aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <div className={styles.bulkRow} role="row">
            <label className={styles.rowToggle} title={allPopulatedRowsEnabled ? "Deselect all players" : "Select all players"}>
              <input
                type="checkbox"
                checked={allPopulatedRowsEnabled}
                disabled={!populatedRows.length}
                onChange={handleToggleAllRows}
                aria-label={allPopulatedRowsEnabled ? "Deselect all players" : "Select all players"}
              />
            </label>
            <span className={styles.bulkLabel}>{allPopulatedRowsEnabled ? "Deselect All" : "Select All"}</span>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.status}>
          {status || (teamId
            ? `${selectedValidation.rows.length} selected · exactly 4 stats required per exported player`
            : "Choose a team to begin")}
          {recordId && status.startsWith("Saved") ? (
            <> · <Link to="/me?tab=tools">View in My Vault</Link></>
          ) : null}
        </div>
        <div className={styles.actionGroup}>
          {recordId ? (
            <button type="button" className={styles.secondaryButton} onClick={handleDelete} disabled={Boolean(busyAction)}>
              Delete
            </button>
          ) : null}
          <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={!teamId || Boolean(busyAction)}>
            {busyAction === "save" ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => handleExport("selected")}
            disabled={!selectedExportReady || Boolean(busyAction)}
            title={!selectedValidation.valid
              ? getValidationMessage(selectedValidation)
              : !statsReady
                ? `${season} NBA stats must finish loading before export`
                : "Export checked players"}
          >
            {busyAction === "export-selected" ? "Exporting..." : "Export Selected"}
          </button>
          <button
            type="button"
            className={styles.exportAllButton}
            onClick={() => handleExport("all")}
            disabled={!allExportReady || Boolean(busyAction)}
            title={!allValidation.valid
              ? getValidationMessage(allValidation)
              : !statsReady
                ? `${season} NBA stats must finish loading before export`
                : "Export every populated roster slot"}
          >
            {busyAction === "export-all" ? "Exporting..." : "Export All"}
          </button>
        </div>
      </div>

      <Dialog
        open={Boolean(dialog && activeDialogRow)}
        title={dialog?.type === "tags" ? "Personnel Tags" : "3P Bar Color"}
        kicker={activeDialogRow ? (rosterById[activeDialogRow.personId]?.fullName || activeDialogRow.fullName) : ""}
        onClose={() => setDialog(null)}
        width="600px"
      >
        {dialog?.type === "tags" ? (
          <>
            <p className={styles.dialogHint}>Select any tags to place below this player&apos;s 3P bar.</p>
            <div className={styles.dialogGrid}>
              {PERSONNEL_TAG_OPTIONS.map((option) => (
                <label key={option.key} className={styles.dialogOption}>
                  <input
                    type="checkbox"
                    checked={activeDialogRow?.tags.includes(option.key) || false}
                    onChange={() => handleToggleTag(dialog.rowIndex, option.key)}
                  />
                  <img className={styles.tagPreview} src={TAG_IMAGE_URLS[option.key]} alt="" />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className={styles.dialogHint}>Choose one color. Fill length always comes from 3PA ÷ FGA.</p>
            <div className={styles.dialogGrid}>
              {PERSONNEL_THREE_POINT_COLOR_OPTIONS.map((option) => (
                <label key={option.key} className={styles.dialogOption}>
                  <input
                    type="checkbox"
                    checked={currentColor?.key === option.key}
                    onChange={() => updateRow(dialog.rowIndex, {
                      threePointColor: option.key,
                      threePointColorEdited: true,
                    })}
                  />
                  <span className={styles.dialogColorSwatch} style={{ background: option.color }} aria-hidden="true" />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
