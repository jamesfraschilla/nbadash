import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import wizardsLogoUrl from "../assets/WWizards_Primary_Icon.png";
import { teamLogoUrl } from "../api.js";
import { useAuth } from "../auth/useAuth.js";
import { GLEAGUE_TEAMS, NBA_TEAMS } from "../data/nbaTeams.js";
import {
  COVERAGE_MAX_COLUMNS,
  COVERAGE_MIN_COLUMNS,
  buildEmptyCoverageSlots,
  coverageSlotHasContent,
  hydrateCoveragePayload,
  serializeCoverageSlots,
} from "../coverageGraphic.js";
import {
  deleteSavedToolRecord,
  deleteSavedToolRecordRemote,
  getSavedToolRecord,
  getSavedToolRecordRemote,
  saveToolRecord,
  saveToolRecordRemote,
  TOOL_RECORD_TYPES,
} from "../toolVault.js";
import {
  COVERAGE_EXPORT_SIZE,
  COVERAGE_ICON_OPTIONS,
  exportCoverageGraphic,
  renderCoverageGraphicCanvas,
} from "./coverageGraphicExport.js";
import styles from "./Tools.module.css";

const WIZARDS_TEAM_ID = "1610612764";

function getTeamFileLabel(team) {
  return String(team?.tricode || team?.fullName || "coverage")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "coverage";
}

function buildCoverageTitle({ selectedTeam, league }) {
  const fallback = league === "gleague" ? "G League" : "NBA";
  return `${selectedTeam?.fullName || fallback} Coverage Graphic`;
}

function CoverageSlotEditor({ slot, iconOptions, onChange }) {
  const selectedIcon = iconOptions.find((option) => option.key === slot.iconKey) || null;
  const slotNumber = `${slot.column + 1}.${slot.row + 1}`;

  return (
    <div className={styles.coverageSlotCard}>
      <div className={styles.coverageSlotTitle}>Space {slotNumber}</div>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Title text</span>
        <input
          className={styles.select}
          type="text"
          value={slot.title}
          onChange={(event) => onChange(slot.id, { title: event.target.value })}
          placeholder={slot.row === 0 ? "P/R" : ""}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Text above icon</span>
        <input
          className={styles.select}
          type="text"
          value={slot.subtitle}
          onChange={(event) => onChange(slot.id, { subtitle: event.target.value })}
          placeholder={slot.row === 0 ? "5" : "1-4"}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Coverage icon</span>
        <select
          className={styles.select}
          value={slot.iconKey}
          onChange={(event) => onChange(slot.id, { iconKey: event.target.value })}
        >
          <option value="">No icon</option>
          {iconOptions.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
      </label>
      {selectedIcon ? (
        <div className={styles.coverageIconPreview}>
          <img src={selectedIcon.url} alt="" />
          <span>{selectedIcon.label}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function CoverageGraphicAdmin() {
  const { accountsEnabled, user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const previewCanvasRef = useRef(null);
  const previewRenderIdRef = useRef(0);
  const [league, setLeague] = useState("nba");
  const [logoTeamId, setLogoTeamId] = useState(WIZARDS_TEAM_ID);
  const [columnCount, setColumnCount] = useState(COVERAGE_MAX_COLUMNS);
  const [slots, setSlots] = useState(() => buildEmptyCoverageSlots());
  const [status, setStatus] = useState("");
  const [recordId, setRecordId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const coverageParam = String(params.get("coverage") || "").trim();
  const vaultUserId = user?.id || (!accountsEnabled ? "guest" : "");

  const teams = league === "gleague" ? GLEAGUE_TEAMS : NBA_TEAMS;
  const selectedTeam = useMemo(
    () => teams.find((team) => String(team.teamId) === String(logoTeamId)) || null,
    [logoTeamId, teams]
  );
  const activeSlots = useMemo(
    () => slots.filter((slot) => Number(slot.column) < columnCount),
    [columnCount, slots]
  );
  const hasCoverageContent = useMemo(
    () => activeSlots.some(coverageSlotHasContent),
    [activeSlots]
  );
  const exportReady = Boolean(hasCoverageContent && logoTeamId);
  const logoPreviewUrl = String(logoTeamId) === WIZARDS_TEAM_ID
    ? wizardsLogoUrl
    : logoTeamId
      ? teamLogoUrl(logoTeamId, league)
      : "";

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return undefined;
    const renderId = previewRenderIdRef.current + 1;
    previewRenderIdRef.current = renderId;

    renderCoverageGraphicCanvas({
      slots,
      columnCount,
      logoTeamId,
      league,
      outputWidth: 960,
      outputHeight: 540,
    })
      .then((renderedCanvas) => {
        if (previewRenderIdRef.current !== renderId || !previewCanvasRef.current) return;
        canvas.width = renderedCanvas.width;
        canvas.height = renderedCanvas.height;
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, canvas.width, canvas.height);
        context?.drawImage(renderedCanvas, 0, 0);
        renderedCanvas.width = 1;
        renderedCanvas.height = 1;
      })
      .catch((error) => {
        if (previewRenderIdRef.current === renderId) {
          setStatus(error?.message || "Unable to render preview.");
        }
      });

    return () => {
      if (previewRenderIdRef.current === renderId) previewRenderIdRef.current += 1;
    };
  }, [columnCount, league, logoTeamId, slots]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedCoverage() {
      if (!coverageParam || !vaultUserId) {
        if (cancelled) return;
        setRecordId("");
        return;
      }

      let savedRecord = null;
      try {
        savedRecord = accountsEnabled && user?.id
          ? await getSavedToolRecordRemote(user.id, coverageParam)
          : getSavedToolRecord(vaultUserId, coverageParam);
      } catch (error) {
        console.error("Failed to load remote coverage draft, falling back to local storage.", error);
        savedRecord = getSavedToolRecord(vaultUserId, coverageParam);
      }

      if (cancelled) return;
      if (!savedRecord?.payload || savedRecord.type !== TOOL_RECORD_TYPES.COVERAGE_GRAPHIC) {
        setRecordId("");
        setStatus("Saved coverage graphic not found.");
        return;
      }

      const hydrated = hydrateCoveragePayload(savedRecord.payload);
      setRecordId(savedRecord.id);
      setLeague(hydrated.league);
      setLogoTeamId(hydrated.logoTeamId);
      setColumnCount(hydrated.columnCount);
      setSlots(hydrated.slots);
      setStatus(`Loaded ${savedRecord.title}`);
    }

    loadSavedCoverage();

    return () => {
      cancelled = true;
    };
  }, [accountsEnabled, coverageParam, user?.id, vaultUserId]);

  const buildSavedPayload = (sourceSlots = slots) => ({
    league,
    logoTeamId,
    columnCount,
    slots: serializeCoverageSlots(sourceSlots),
  });

  const updateSlot = (slotId, patch) => {
    setSlots((current) => current.map((slot) => (
      slot.id === slotId ? { ...slot, ...patch } : slot
    )));
    setStatus("");
  };

  const handleLeagueChange = (nextLeague) => {
    const normalizedLeague = nextLeague === "gleague" ? "gleague" : "nba";
    setLeague(normalizedLeague);
    setLogoTeamId(normalizedLeague === "nba" ? WIZARDS_TEAM_ID : "");
    setRecordId("");
    setStatus("");
  };

  const handleRemoveThirdColumn = () => {
    setColumnCount(COVERAGE_MIN_COLUMNS);
    setSlots((current) => current.map((slot) => (
      Number(slot.column) === 2 ? { ...slot, title: "", subtitle: "", iconKey: "" } : slot
    )));
    setStatus("");
  };

  const handleAddThirdColumn = () => {
    setColumnCount(COVERAGE_MAX_COLUMNS);
    setStatus("");
  };

  const handleReset = () => {
    setLeague("nba");
    setLogoTeamId(WIZARDS_TEAM_ID);
    setColumnCount(COVERAGE_MAX_COLUMNS);
    setSlots(buildEmptyCoverageSlots());
    setRecordId("");
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", "graphics");
    nextParams.set("graphic", "coverage");
    nextParams.delete("coverage");
    setParams(nextParams, { replace: true });
    setStatus("Reset coverage graphic.");
  };

  const handleExport = async () => {
    if (!exportReady) {
      setStatus("Choose a logo and add at least one coverage space.");
      return;
    }
    setBusyAction("export");
    setStatus("Rendering PNG...");
    try {
      await exportCoverageGraphic({
        slots,
        columnCount,
        logoTeamId,
        league,
        team: selectedTeam,
        fileName: `${getTeamFileLabel(selectedTeam)}-coverage-graphic.png`,
      });
      setStatus(`PNG exported at ${COVERAGE_EXPORT_SIZE.width}x${COVERAGE_EXPORT_SIZE.height}.`);
    } catch (error) {
      setStatus(error?.message || "Unable to export PNG.");
    } finally {
      setBusyAction("");
    }
  };

  const handleSave = async () => {
    if (!vaultUserId) {
      setStatus("Sign in to save this coverage graphic.");
      return;
    }
    if (!exportReady || busyAction) {
      setStatus("Choose a logo and add at least one coverage space.");
      return;
    }
    setBusyAction("save");
    const id = recordId || crypto.randomUUID();
    const timestamp = new Date().toISOString();

    try {
      const record = {
        id,
        type: TOOL_RECORD_TYPES.COVERAGE_GRAPHIC,
        title: buildCoverageTitle({ selectedTeam, league }),
        updatedAt: timestamp,
        createdAt: timestamp,
        payload: buildSavedPayload(),
      };
      const savedRecord = accountsEnabled && user?.id
        ? await saveToolRecordRemote(user.id, record)
        : saveToolRecord(vaultUserId, record);
      if (!savedRecord) {
        setStatus("Unable to save this coverage graphic. Try deleting older browser data or sign in again.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "graphics");
      nextParams.set("graphic", "coverage");
      nextParams.set("coverage", savedRecord.id);
      setParams(nextParams, { replace: true });
      setStatus(`Saved to My Vault as ${savedRecord.title}`);
    } catch (error) {
      console.error("Failed to save coverage draft.", error);
      setStatus(error?.message || "Unable to save this coverage graphic to Supabase. It was not saved; try again.");
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async () => {
    if (!vaultUserId || !recordId || busyAction) return;
    const confirmed = window.confirm("Delete this saved coverage graphic draft?");
    if (!confirmed) return;
    setBusyAction("delete");
    try {
      if (accountsEnabled && user?.id) {
        await deleteSavedToolRecordRemote(user.id, recordId);
      } else {
        deleteSavedToolRecord(vaultUserId, recordId);
      }
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      setRecordId("");
      setLeague("nba");
      setLogoTeamId(WIZARDS_TEAM_ID);
      setSlots(buildEmptyCoverageSlots());
      setColumnCount(COVERAGE_MAX_COLUMNS);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "graphics");
      nextParams.set("graphic", "coverage");
      nextParams.delete("coverage");
      setParams(nextParams, { replace: true });
      setStatus("Deleted saved coverage graphic.");
    } catch (error) {
      console.error("Failed to delete remote coverage draft.", error);
      setStatus("Unable to delete this Supabase draft. It has not been removed; try again.");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className={styles.coveragePanel}>
      <div className={styles.coverageSetupCard}>
        <div className={styles.coverageSetupGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>League</span>
            <select className={styles.select} value={league} onChange={(event) => handleLeagueChange(event.target.value)}>
              <option value="nba">NBA</option>
              <option value="gleague">G League</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Logo</span>
            <select className={styles.select} value={logoTeamId} onChange={(event) => setLogoTeamId(event.target.value)}>
              <option value="">No logo</option>
              {teams.map((team) => (
                <option key={team.teamId} value={team.teamId}>{team.fullName}</option>
              ))}
            </select>
          </label>
          {logoPreviewUrl ? (
            <div className={styles.coverageLogoPreview}>
              <img
                src={logoPreviewUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.coverageBuilder}>
        <div className={styles.coverageControls}>
          <div className={styles.coverageToolbar}>
            <div>
              <div className={styles.coverageSectionTitle}>Coverage spaces</div>
              <div className={styles.statusNote}>
                The export uses 2 columns when column 3 has no text or icon.
              </div>
            </div>
            {columnCount === COVERAGE_MIN_COLUMNS ? (
              <button type="button" className={styles.secondaryButton} onClick={handleAddThirdColumn}>
                + Column
              </button>
            ) : null}
          </div>

          <div className={styles.coverageColumnGrid} style={{ "--coverage-columns": columnCount }}>
            {Array.from({ length: columnCount }, (_, columnIndex) => {
              const columnSlots = slots.filter((slot) => Number(slot.column) === columnIndex);
              return (
                <section key={columnIndex} className={styles.coverageColumnCard}>
                  <div className={styles.coverageColumnHeader}>
                    <span>Column {columnIndex + 1}</span>
                    {columnIndex === 2 ? (
                      <button
                        type="button"
                        className={styles.coverageRemoveColumnButton}
                        onClick={handleRemoveThirdColumn}
                        aria-label="Remove third coverage column"
                      >
                        X
                      </button>
                    ) : null}
                  </div>
                  {columnSlots.map((slot) => (
                    <CoverageSlotEditor
                      key={slot.id}
                      slot={slot}
                      iconOptions={COVERAGE_ICON_OPTIONS}
                      onChange={updateSlot}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        </div>

        <aside className={styles.coveragePreviewPanel}>
          <div className={styles.coveragePreviewFrame}>
            <canvas ref={previewCanvasRef} className={styles.coveragePreviewCanvas} width="960" height="540" />
          </div>
          <div className={styles.coveragePreviewActions}>
            <Link className={styles.secondaryButton} to="/me?tab=graphics&graphic=coverage">
              My Vault
            </Link>
            {recordId ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={Boolean(busyAction)}
                onClick={handleDelete}
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={Boolean(busyAction)}
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!exportReady || Boolean(busyAction)}
              onClick={handleSave}
            >
              {busyAction === "save" ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={!exportReady || Boolean(busyAction)}
              onClick={handleExport}
            >
              {busyAction === "export" ? "Exporting..." : "Export PNG"}
            </button>
          </div>
          {status ? (
            <div className={styles.statusNote}>
              {status}
              {recordId && status.startsWith("Saved") ? (
                <>
                  {" "}
                  <Link className={styles.inlineStatusLink} to="/me?tab=graphics&graphic=coverage">View in My Vault</Link>
                </>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
