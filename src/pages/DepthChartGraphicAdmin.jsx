import { useEffect, useMemo, useRef, useState } from "react";
import { GLEAGUE_TEAMS, NBA_TEAMS } from "../data/nbaTeams.js";
import { exportDepthChartGraphic, renderDepthChartGraphic } from "./depthChartGraphicExport.js";
import styles from "./Admin.module.css";

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
  if (familyName && !isNameSuffix(familyName)) return familyName;
  const fullName = String(player?.fullName || "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  while (parts.length > 1 && isNameSuffix(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts[parts.length - 1] || fullName;
}

function normalizeNameToken(value) {
  return String(value || "").trim().replace(/[.,]/g, "").toUpperCase();
}

function isNameSuffix(value) {
  return NAME_SUFFIXES.has(normalizeNameToken(value));
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
        <span>Player</span>
        <select value={slot.selection} onChange={(event) => onSelectionChange(slot.id, event.target.value)}>
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
            <span>Number</span>
            <input
              type="text"
              value={slot.customNumber}
              onChange={(event) => onCustomChange(slot.id, { customNumber: event.target.value })}
              placeholder="22"
            />
          </label>
          <label className={styles.field}>
            <span>Last name</span>
            <input
              type="text"
              value={slot.customLastName}
              onChange={(event) => onCustomChange(slot.id, { customLastName: event.target.value })}
              placeholder="PETERSON"
            />
          </label>
          {isStarter ? (
            <label className={styles.field}>
              <span>Headshot PNG</span>
              <input
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
  const previewCanvasRef = useRef(null);
  const [league, setLeague] = useState("nba");
  const [teamId, setTeamId] = useState("");
  const [slots, setSlots] = useState(() => buildEmptySlots());
  const [status, setStatus] = useState("");

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
      .then(() => {
        if (active) setStatus("");
      })
      .catch((error) => {
        if (active) setStatus(error?.message || "Unable to render preview.");
      });

    return () => {
      active = false;
    };
  }, [exportSlots]);

  const updateSlot = (slotId, patch) => {
    setSlots((current) => current.map((slot) => (
      slot.id === slotId ? { ...slot, ...patch } : slot
    )));
  };

  const handleLeagueChange = (nextLeague) => {
    setLeague(nextLeague === "gleague" ? "gleague" : "nba");
    setTeamId("");
    setSlots(buildEmptySlots());
    setStatus("");
  };

  const handleTeamChange = (nextTeamId) => {
    setTeamId(nextTeamId);
    setSlots(buildEmptySlots());
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
      setStatus("PNG exported.");
    } catch (error) {
      setStatus(error?.message || "Unable to export PNG.");
    }
  };

  const starterSlots = slots.filter((slot) => slot.group === "starter");
  const benchRowOne = slots.filter((slot) => slot.id.startsWith("bench-1-"));
  const benchRowTwo = slots.filter((slot) => slot.id.startsWith("bench-2-"));

  return (
    <div className={styles.depthChartPanel}>
      <div className={styles.inviteCard}>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>League</span>
            <select value={league} onChange={(event) => handleLeagueChange(event.target.value)}>
              <option value="nba">NBA</option>
              <option value="gleague">G League</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Team</span>
            <select value={teamId} onChange={(event) => handleTeamChange(event.target.value)}>
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
            <div className={styles.scopeLabel}>Starters</div>
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
            <div className={styles.scopeLabel}>Bench row 1</div>
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
            <div className={styles.scopeLabel}>Bench row 2</div>
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
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!hasSelectedPlayer}
              onClick={handleExport}
            >
              Export PNG
            </button>
          </div>
          {status ? <div className={styles.message}>{status}</div> : null}
        </aside>
      </div>
    </div>
  );
}
