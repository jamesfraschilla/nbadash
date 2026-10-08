import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  OFFICIALS_EXPORT_SPECS,
  exportOfficialsGraphic,
} from "../components/OfficialsExportPanel.jsx";
import { fetchOfficiatingInsightSimulatorOptions } from "../officiatingInsightsData.js";
import styles from "./RefereeGraphicAdmin.module.css";

const OFFICIAL_SLOTS = [
  { key: "crewChief", label: "Crew Chief" },
  { key: "refereeTwo", label: "Referee 2" },
  { key: "refereeThree", label: "Referee 3" },
];

function toExportOfficial(official, roleKey) {
  return {
    personId: official.id,
    name: official.name,
    jerseyNumber: official.jerseyNumber,
    roleKey,
  };
}

export default function RefereeGraphicAdmin() {
  const [selectedIds, setSelectedIds] = useState({
    crewChief: "",
    refereeTwo: "",
    refereeThree: "",
  });
  const [selectedFormats, setSelectedFormats] = useState(["portrait"]);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["referee-graphic-officials"],
    queryFn: fetchOfficiatingInsightSimulatorOptions,
    staleTime: 30 * 60 * 1000,
  });
  const officials = data?.officials || [];
  const officialsById = useMemo(
    () => new Map(officials.map((official) => [String(official.id), official])),
    [officials]
  );
  const chosenIds = Object.values(selectedIds).filter(Boolean);
  const exportReady = chosenIds.length === 3 &&
    new Set(chosenIds).size === 3 &&
    selectedFormats.length > 0 &&
    !exporting;

  const handleSelection = (slotKey, officialId) => {
    setSelectedIds((current) => ({ ...current, [slotKey]: officialId }));
    setStatus("");
  };

  const handleFormatSelection = (format, checked) => {
    setSelectedFormats((current) => (
      checked
        ? [...current, format]
        : current.filter((currentFormat) => currentFormat !== format)
    ));
    setStatus("");
  };

  const handleExport = async () => {
    if (!exportReady) return;
    setExporting(true);
    setStatus("Rendering export...");
    try {
      const exportOfficials = OFFICIAL_SLOTS.map((slot, index) => (
        toExportOfficial(
          officialsById.get(selectedIds[slot.key]),
          index === 0 ? "crewChief" : "referee"
        )
      ));
      for (const format of selectedFormats) {
        await exportOfficialsGraphic({
          officials: exportOfficials,
          publishedOrder: exportOfficials.map((official) => official.personId),
          format,
          fileName: "officials-custom",
        });
      }
      const formatLabels = selectedFormats.map((format) => OFFICIALS_EXPORT_SPECS[format].label);
      setStatus(`Exported ${formatLabels.join(", ")} referee graphic${formatLabels.length === 1 ? "" : "s"}.`);
    } catch (exportError) {
      console.error("Failed to export custom referee graphic.", exportError);
      setStatus(exportError?.message || "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.builder}>
      <div className={styles.intro}>
        <h2>Custom Referee Graphic</h2>
        <p>Select the three-person crew and export it in the same format used on game dashboards.</p>
      </div>

      {error ? <p className={styles.status}>Unable to load the referee list. Please try again.</p> : null}

      <div className={styles.refereeFields}>
        {OFFICIAL_SLOTS.map((slot) => (
          <label className={styles.field} key={slot.key}>
            <span>{slot.label}</span>
            <select
              value={selectedIds[slot.key]}
              onChange={(event) => handleSelection(slot.key, event.target.value)}
              disabled={isLoading || Boolean(error)}
            >
              <option value="">{isLoading ? "Loading referees..." : `Select ${slot.label.toLowerCase()}`}</option>
              {officials.map((official) => {
                const selectedElsewhere = Object.entries(selectedIds).some(
                  ([key, value]) => key !== slot.key && value === String(official.id)
                );
                return (
                  <option key={official.id} value={official.id} disabled={selectedElsewhere}>
                    {official.jerseyNumber ? `#${official.jerseyNumber} · ` : ""}{official.name}
                  </option>
                );
              })}
            </select>
          </label>
        ))}

      </div>

      <fieldset className={styles.formatFieldset}>
        <legend>Export Formats</legend>
        <div className={styles.formatOptions}>
          {Object.entries(OFFICIALS_EXPORT_SPECS).map(([key, spec]) => (
            <label className={styles.formatOption} key={key}>
              <input
                type="checkbox"
                checked={selectedFormats.includes(key)}
                onChange={(event) => handleFormatSelection(key, event.target.checked)}
              />
              <span>{spec.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.actions}>
        <button type="button" onClick={handleExport} disabled={!exportReady}>
          {exporting ? "Exporting..." : `Export PNG${selectedFormats.length === 1 ? "" : "s"}`}
        </button>
        {status ? <p className={styles.status} aria-live="polite">{status}</p> : null}
      </div>
    </div>
  );
}
