import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/useAuth.js";
import { GLEAGUE_TEAMS, NBA_TEAMS } from "../data/nbaTeams.js";
import {
  deleteSavedToolRecord,
  deleteSavedToolRecordRemote,
  getSavedToolRecord,
  getSavedToolRecordRemote,
  saveToolRecord,
  saveToolRecordRemote,
  TOOL_RECORD_TYPES,
} from "../toolVault.js";
import { DEPTH_CHART_EXPORT_SIZE, exportDepthChartGraphic, renderDepthChartGraphic } from "./depthChartGraphicExport.js";
import styles from "./Tools.module.css";

const CUSTOM_VALUE = "__custom__";
const POSITION_VALUES = ["1", "2", "3", "4", "5"];
const NAME_SUFFIXES = new Set([
  "JR",
  "JUNIOR",
  "SR",
  "SENIOR",
  "II",
  "III",
  "IV",
  "V",
  "VI",
]);

function buildSlot(id, position, group) {
  return {
    id,
    position,
    group,
    selection: "",
    customNumber: "",
    customLastName: "",
    customHeadshotDataUrl: "",
  };
}

function buildEmptySlots() {
  return [
    ...POSITION_VALUES.map((position) => buildSlot(`starter-${position}`, position, "starter")),
    ...POSITION_VALUES.map((position) => buildSlot(`bench-1-${position}`, position, "bench")),
    ...POSITION_VALUES.map((position) => buildSlot(`bench-2-${position}`, position, "bench")),
  ];
}

function hydrateDepthChartSlots(value) {
  const incomingSlots = Array.isArray(value) ? value : [];
  const byId = new Map(incomingSlots.map((slot) => [String(slot?.id || "").trim(), slot]));
  return buildEmptySlots().map((emptySlot) => {
    const savedSlot = byId.get(emptySlot.id) || {};
    return {
      ...emptySlot,
      selection: String(savedSlot?.selection || "").trim(),
      customNumber: String(savedSlot?.customNumber || "").trim(),
      customLastName: String(savedSlot?.customLastName || "").trim(),
      customHeadshotDataUrl: String(savedSlot?.customHeadshotDataUrl || "").trim(),
    };
  });
}

function hydrateDepthChartPayload(payload) {
  return {
    league: String(payload?.league || "nba").trim() === "gleague" ? "gleague" : "nba",
    teamId: String(payload?.teamId || "").trim(),
    slots: hydrateDepthChartSlots(payload?.slots),
  };
}

function buildSortableJersey(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function formatPlayerOption(player) {
  const jersey = String(player?.jerseyNum || "").trim();
  const name = String(player?.fullName || "").trim();
  return jersey ? `#${jersey} ${name}` : name;
}

function getPlayerLastName(player) {
  const familyName = String(player?.familyName || "").trim();
  if (hasNameBeforeSuffix(familyName)) return familyName;
  const fullName = String(player?.fullName || "").trim();
  return parseLastNameLabel(fullName) || fullName;
}

function normalizeNameToken(value) {
  return String(value || "").trim().replace(/[.,]/g, "").toUpperCase();
}

function isNameSuffix(value) {
  return NAME_SUFFIXES.has(normalizeNameToken(value));
}

function hasNameBeforeSuffix(value) {
  return String(value || "").trim().split(/\s+/).some((part) => !isNameSuffix(part));
}

function parseLastNameLabel(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  const suffixes = [];
  while (parts.length > 1 && isNameSuffix(parts[parts.length - 1])) {
    suffixes.unshift(parts.pop());
  }
  const lastName = parts[parts.length - 1] || "";
  return lastName && !isNameSuffix(lastName) ? [lastName, ...suffixes].join(" ") : "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function getTeamFileLabel(team) {
  return String(team?.tricode || team?.fullName || "team")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "team";
}

function buildDepthChartTitle({ selectedTeam, league }) {
  const fallback = league === "gleague" ? "G League" : "NBA";
  return `${selectedTeam?.fullName || fallback} Depth Chart`;
}

function SlotEditor({
  slot,
  roster,
  selectedRosterIds,
  onSelectionChange,
  onCustomChange,
  onHeadshotChange,
}) {
  const isCustom = slot.selection === CUSTOM_VALUE;
  const isStarter = slot.group === "starter";

  return (
    <div className={styles.depthChartSlotCard}>
      <div className={styles.depthChartSlotTitle}>
        {isStarter ? "Starter" : "Bench"} {slot.position}
      </div>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Player</span>
        <select className={styles.select} value={slot.selection} onChange={(event) => onSelectionChange(slot.id, event.target.value)}>
          <option value="">Select player</option>
          {roster.map((player) => (
            <option
              key={player.personId}
              value={player.personId}
              disabled={selectedRosterIds.has(player.personId) && slot.selection !== player.personId}
            >
              {formatPlayerOption(player)}
            </option>
          ))}
          <option value={CUSTOM_VALUE}>Custom</option>
        </select>
      </label>

      {isCustom ? (
        <div className={styles.depthChartCustomFields}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Number</span>
            <input
              className={styles.select}
              type="text"
              value={slot.customNumber}
              onChange={(event) => onCustomChange(slot.id, { customNumber: event.target.value })}
              placeholder="22"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Last name</span>
            <input
              className={styles.select}
              type="text"
              value={slot.customLastName}
              onChange={(event) => onCustomChange(slot.id, { customLastName: event.target.value })}
              placeholder="PETERSON"
            />
          </label>
          {isStarter ? (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Headshot PNG</span>
              <input
                className={styles.select}
                type="file"
                accept="image/png"
                onChange={(event) => onHeadshotChange(slot.id, event.target.files?.[0] || null)}
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function DepthChartGraphicAdmin({ rosterSources }) {
  const { accountsEnabled, user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const previewCanvasRef = useRef(null);
  const [league, setLeague] = useState("nba");
  const [teamId, setTeamId] = useState("");
  const [slots, setSlots] = useState(() => buildEmptySlots());
  const [status, setStatus] = useState("");
  const [recordId, setRecordId] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const depthChartParam = String(params.get("depthChart") || "").trim();

  const teams = league === "gleague" ? GLEAGUE_TEAMS : NBA_TEAMS;
  const selectedTeam = teams.find((team) => String(team.teamId) === String(teamId)) || null;
  const roster = useMemo(() => {
    const players = Array.isArray(rosterSources?.[league]?.[teamId]) ? rosterSources[league][teamId] : [];
    return [...players].sort((a, b) => {
      const jerseyCompare = buildSortableJersey(a.jerseyNum) - buildSortableJersey(b.jerseyNum);
      if (jerseyCompare !== 0) return jerseyCompare;
      return String(a.fullName || "").localeCompare(String(b.fullName || ""));
    });
  }, [league, rosterSources, teamId]);

  const rosterById = useMemo(() => (
    Object.fromEntries(roster.map((player) => [String(player.personId), player]))
  ), [roster]);

  const selectedRosterIds = useMemo(() => new Set(
    slots
      .map((slot) => String(slot.selection || "").trim())
      .filter((value) => value && value !== CUSTOM_VALUE)
  ), [slots]);

  const exportSlots = useMemo(() => slots.map((slot) => {
    const isCustom = slot.selection === CUSTOM_VALUE;
    const player = isCustom ? null : rosterById[slot.selection];
    return {
      id: slot.id,
      position: slot.position,
      personId: player?.personId || "",
      teamId: player?.teamId || teamId,
      jerseyNum: isCustom ? slot.customNumber : (player?.jerseyNum || ""),
      lastName: isCustom ? slot.customLastName : getPlayerLastName(player),
      fullName: player?.fullName || "",
      headshotDataUrl: isCustom && slot.group === "starter" ? slot.customHeadshotDataUrl : "",
    };
  }), [rosterById, slots, teamId]);

  const hasSelectedPlayer = exportSlots.some((slot) => String(slot.lastName || "").trim());

  useEffect(() => {
    let active = true;
    const canvas = previewCanvasRef.current;
    if (!canvas) return undefined;

    renderDepthChartGraphic(canvas, { slots: exportSlots })
      .then(() => undefined)
      .catch((error) => {
        if (active) setStatus(error?.message || "Unable to render preview.");
      });

    return () => {
      active = false;
    };
  }, [exportSlots]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedDepthChart() {
      if (!depthChartParam || !user?.id) {
        if (cancelled) return;
        setRecordId("");
        return;
      }

      let savedRecord = null;
      try {
        savedRecord = accountsEnabled
          ? await getSavedToolRecordRemote(user.id, depthChartParam)
          : getSavedToolRecord(user.id, depthChartParam);
      } catch (error) {
        console.error("Failed to load remote depth chart draft, falling back to local storage.", error);
        savedRecord = getSavedToolRecord(user.id, depthChartParam);
      }

      if (cancelled) return;

      if (!savedRecord?.payload || savedRecord.type !== TOOL_RECORD_TYPES.DEPTH_CHART_GRAPHIC) {
        setRecordId("");
        setStatus("Saved depth chart not found.");
        return;
      }

      const hydrated = hydrateDepthChartPayload(savedRecord.payload);
      setRecordId(savedRecord.id);
      setLeague(hydrated.league);
      setTeamId(hydrated.teamId);
      setSlots(hydrated.slots);
      setStatus(`Loaded ${savedRecord.title}`);
    }

    loadSavedDepthChart();

    return () => {
      cancelled = true;
    };
  }, [accountsEnabled, depthChartParam, user?.id]);

  const buildSavedPayload = () => ({
    league,
    teamId,
    slots,
  });

  const updateSlot = (slotId, patch) => {
    setSlots((current) => current.map((slot) => (
      slot.id === slotId ? { ...slot, ...patch } : slot
    )));
  };

  const handleLeagueChange = (nextLeague) => {
    setLeague(nextLeague === "gleague" ? "gleague" : "nba");
    setTeamId("");
    setSlots(buildEmptySlots());
    setRecordId("");
    setStatus("");
  };

  const handleTeamChange = (nextTeamId) => {
    setTeamId(nextTeamId);
    setSlots(buildEmptySlots());
    setRecordId("");
    setStatus("");
  };

  const handleSelectionChange = (slotId, selection) => {
    updateSlot(slotId, { selection });
    setStatus("");
  };

  const handleCustomChange = (slotId, patch) => {
    updateSlot(slotId, patch);
    setStatus("");
  };

  const handleHeadshotChange = async (slotId, file) => {
    if (!file) {
      updateSlot(slotId, { customHeadshotDataUrl: "" });
      return;
    }
    if (file.type && file.type !== "image/png") {
      setStatus("Use a transparent PNG headshot.");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateSlot(slotId, { customHeadshotDataUrl: dataUrl });
      setStatus("");
    } catch (error) {
      setStatus(error?.message || "Unable to load headshot.");
    }
  };

  const handleExport = async () => {
    if (!hasSelectedPlayer) {
      setStatus("Select at least one player.");
      return;
    }
    setStatus("Rendering PNG...");
    try {
      await exportDepthChartGraphic({
        slots: exportSlots,
        fileName: `${getTeamFileLabel(selectedTeam)}-depth-chart.png`,
      });
      setStatus(`PNG exported at ${DEPTH_CHART_EXPORT_SIZE}x${DEPTH_CHART_EXPORT_SIZE}.`);
    } catch (error) {
      setStatus(error?.message || "Unable to export PNG.");
    }
  };

  const handleSave = async () => {
    if (!user?.id) {
      setStatus("Sign in to save this depth chart.");
      return;
    }
    if (!hasSelectedPlayer || busyAction) {
      setStatus("Select at least one player.");
      return;
    }
    setBusyAction("save");
    const id = recordId || crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const record = {
      id,
      type: TOOL_RECORD_TYPES.DEPTH_CHART_GRAPHIC,
      title: buildDepthChartTitle({ selectedTeam, league }),
      updatedAt: timestamp,
      createdAt: timestamp,
      payload: buildSavedPayload(),
    };

    try {
      const savedRecord = accountsEnabled
        ? await saveToolRecordRemote(user.id, record)
        : saveToolRecord(user.id, record);
      if (!savedRecord) return;
      queryClient.invalidateQueries({ queryKey: ["owned-tools", user.id] });
      setRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "depth-chart");
      nextParams.set("depthChart", savedRecord.id);
      setParams(nextParams, { replace: true });
      setStatus(`Saved to My Vault as ${savedRecord.title}`);
    } catch (error) {
      console.error("Failed to save depth chart draft remotely, falling back to local storage.", error);
      const savedRecord = saveToolRecord(user.id, record);
      if (!savedRecord) return;
      queryClient.invalidateQueries({ queryKey: ["owned-tools", user.id] });
      setRecordId(savedRecord.id);
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "depth-chart");
      nextParams.set("depthChart", savedRecord.id);
      setParams(nextParams, { replace: true });
      setStatus(`Saved locally as ${savedRecord.title}`);
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async () => {
    if (!user?.id || !recordId || busyAction) return;
    const confirmed = window.confirm("Delete this saved depth chart draft?");
    if (!confirmed) return;
    setBusyAction("delete");
    try {
      if (accountsEnabled) {
        await deleteSavedToolRecordRemote(user.id, recordId);
      } else {
        deleteSavedToolRecord(user.id, recordId);
      }
      queryClient.invalidateQueries({ queryKey: ["owned-tools", user.id] });
      setRecordId("");
      setLeague("nba");
      setTeamId("");
      setSlots(buildEmptySlots());
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "depth-chart");
      nextParams.delete("depthChart");
      setParams(nextParams, { replace: true });
      setStatus("Deleted saved depth chart.");
    } catch (error) {
      console.error("Failed to delete remote depth chart draft, falling back to local storage.", error);
      deleteSavedToolRecord(user.id, recordId);
      queryClient.invalidateQueries({ queryKey: ["owned-tools", user.id] });
      setRecordId("");
      const nextParams = new URLSearchParams(params);
      nextParams.set("tab", "depth-chart");
      nextParams.delete("depthChart");
      setParams(nextParams, { replace: true });
      setStatus("Deleted saved depth chart locally.");
    } finally {
      setBusyAction("");
    }
  };

  const handleReset = () => {
    setRecordId("");
    setLeague("nba");
    setTeamId("");
    setSlots(buildEmptySlots());
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", "depth-chart");
    nextParams.delete("depthChart");
    setParams(nextParams, { replace: true });
    setStatus("Reset depth chart.");
  };

  const starterSlots = slots.filter((slot) => slot.group === "starter");
  const benchRowOne = slots.filter((slot) => slot.id.startsWith("bench-1-"));
  const benchRowTwo = slots.filter((slot) => slot.id.startsWith("bench-2-"));

  return (
    <div className={styles.depthChartPanel}>
      <div className={styles.depthChartSetupCard}>
        <div className={styles.depthChartSetupGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>League</span>
            <select className={styles.select} value={league} onChange={(event) => handleLeagueChange(event.target.value)}>
              <option value="nba">NBA</option>
              <option value="gleague">G League</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Team</span>
            <select className={styles.select} value={teamId} onChange={(event) => handleTeamChange(event.target.value)}>
              <option value="">Select team</option>
              {teams.map((team) => (
                <option key={team.teamId} value={team.teamId}>{team.fullName}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className={styles.depthChartBuilder}>
        <div className={styles.depthChartControls}>
          <div className={styles.depthChartSlotSection}>
            <div className={styles.depthChartSectionTitle}>Starters</div>
            <div className={styles.depthChartSlotGrid}>
              {starterSlots.map((slot) => (
                <SlotEditor
                  key={slot.id}
                  slot={slot}
                  roster={roster}
                  selectedRosterIds={selectedRosterIds}
                  onSelectionChange={handleSelectionChange}
                  onCustomChange={handleCustomChange}
                  onHeadshotChange={handleHeadshotChange}
                />
              ))}
            </div>
          </div>

          <div className={styles.depthChartSlotSection}>
            <div className={styles.depthChartSectionTitle}>Bench row 1</div>
            <div className={styles.depthChartSlotGrid}>
              {benchRowOne.map((slot) => (
                <SlotEditor
                  key={slot.id}
                  slot={slot}
                  roster={roster}
                  selectedRosterIds={selectedRosterIds}
                  onSelectionChange={handleSelectionChange}
                  onCustomChange={handleCustomChange}
                  onHeadshotChange={handleHeadshotChange}
                />
              ))}
            </div>
          </div>

          <div className={styles.depthChartSlotSection}>
            <div className={styles.depthChartSectionTitle}>Bench row 2</div>
            <div className={styles.depthChartSlotGrid}>
              {benchRowTwo.map((slot) => (
                <SlotEditor
                  key={slot.id}
                  slot={slot}
                  roster={roster}
                  selectedRosterIds={selectedRosterIds}
                  onSelectionChange={handleSelectionChange}
                  onCustomChange={handleCustomChange}
                  onHeadshotChange={handleHeadshotChange}
                />
              ))}
            </div>
          </div>
        </div>

        <aside className={styles.depthChartPreviewPanel}>
          <div className={styles.depthChartPreviewFrame}>
            <canvas ref={previewCanvasRef} className={styles.depthChartPreviewCanvas} width="400" height="400" />
          </div>
          <div className={styles.depthChartPreviewActions}>
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
              disabled={!hasSelectedPlayer || Boolean(busyAction)}
              onClick={handleSave}
            >
              {busyAction === "save" ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={!hasSelectedPlayer || Boolean(busyAction)}
              onClick={handleExport}
            >
              Export PNG
            </button>
          </div>
          {status ? <div className={styles.statusNote}>{status}</div> : null}
        </aside>
      </div>
    </div>
  );
}
