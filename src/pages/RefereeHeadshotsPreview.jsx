import { useEffect, useMemo, useState } from "react";
import {
  buildRefereeHeadshotTransform,
  DEFAULT_REFEREE_HEADSHOT_OVERRIDES,
  normalizeNameKey,
  REFEREE_HEADSHOT_OVERRIDE_STORAGE_KEY,
  sanitizeRefereeHeadshotOverrides,
  serializeRefereeHeadshotOverrides,
} from "../refereeHeadshots.js";
import styles from "./RefereeHeadshotsPreview.module.css";

const DUPLICATE_FILE_NAMES = new Set([
  "Agon Abazi.jpg",
  "Marcy Williams.jpg",
  "Tyler Mirkovich.jpg",
]);

const IMAGE_MODULES = import.meta.glob(
  [
    "../assets/referees/*.jpg",
    "../assets/referees/*.jpeg",
    "../assets/referees/*.JPG",
    "../assets/referees/*.JPEG",
    "../assets/referees_review_duplicates/*.jpg",
    "../assets/referees_review_duplicates/*.jpeg",
    "../assets/referees_review_duplicates/*.JPG",
    "../assets/referees_review_duplicates/*.JPEG",
  ],
  { eager: true, import: "default" }
);

function readInitialOverrides() {
  if (typeof window === "undefined") return DEFAULT_REFEREE_HEADSHOT_OVERRIDES;
  try {
    const raw = window.localStorage.getItem(REFEREE_HEADSHOT_OVERRIDE_STORAGE_KEY);
    if (!raw) return DEFAULT_REFEREE_HEADSHOT_OVERRIDES;
    return {
      ...DEFAULT_REFEREE_HEADSHOT_OVERRIDES,
      ...sanitizeRefereeHeadshotOverrides(JSON.parse(raw)),
    };
  } catch {
    return DEFAULT_REFEREE_HEADSHOT_OVERRIDES;
  }
}

function buildImageItems() {
  return Object.entries(IMAGE_MODULES)
    .map(([path, url]) => {
      const fileName = path.split("/").pop() || "";
      const displayName = fileName.replace(/\.(jpe?g)$/i, "");
      const isDuplicate = path.includes("/referees_review_duplicates/");
      return {
        id: `${isDuplicate ? "duplicate" : "primary"}:${fileName}`,
        fullName: displayName,
        fileName,
        nameKey: normalizeNameKey(displayName),
        url,
        source: isDuplicate ? "duplicate review" : "production",
        isDuplicate,
        isIncomingWnba: DUPLICATE_FILE_NAMES.has(fileName) || !path.includes("/referees_review_duplicates/"),
      };
    })
    .sort((a, b) => {
      if (a.isDuplicate !== b.isDuplicate) return a.isDuplicate ? 1 : -1;
      return a.fullName.localeCompare(b.fullName);
    });
}

function buildOverrideDraft(overrides, key) {
  const current = overrides?.[key] || {};
  return {
    scale: Number.isFinite(current.scale) ? current.scale : 1,
    offsetX: Number.isFinite(current.offsetX) ? current.offsetX : 0,
    offsetY: Number.isFinite(current.offsetY) ? current.offsetY : 0,
    scaleX: Number.isFinite(current.scaleX) ? current.scaleX : 1,
    scaleY: Number.isFinite(current.scaleY) ? current.scaleY : 1,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function RefereeHeadshotsPreview() {
  const [overrides, setOverrides] = useState(readInitialOverrides);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [showOnlyEdited, setShowOnlyEdited] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const allItems = useMemo(buildImageItems, []);

  useEffect(() => {
    const serialized = JSON.stringify(sanitizeRefereeHeadshotOverrides(overrides));
    window.localStorage.setItem(REFEREE_HEADSHOT_OVERRIDE_STORAGE_KEY, serialized);
  }, [overrides]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allItems.filter((item) => {
      if (showOnlyDuplicates && !item.isDuplicate) return false;
      if (showOnlyEdited && !overrides[item.nameKey]) return false;
      if (!query) return true;
      return item.fullName.toLowerCase().includes(query) || item.fileName.toLowerCase().includes(query);
    });
  }, [allItems, overrides, search, showOnlyDuplicates, showOnlyEdited]);

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedId("");
      return;
    }
    if (!filteredItems.some((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId]);

  const selectedItem = filteredItems.find((item) => item.id === selectedId) || allItems[0] || null;
  const selectedKey = selectedItem?.nameKey || "";
  const selectedDraft = buildOverrideDraft(overrides, selectedKey);
  const editedCount = Object.keys(sanitizeRefereeHeadshotOverrides(overrides)).length;

  const updateSelectedOverride = (field, rawValue) => {
    if (!selectedKey) return;
    const nextValue = (() => {
      const baseFallback = field.startsWith("offset") ? 0 : 1;
      const parsed = parseNumber(rawValue, baseFallback);
      if (field === "scale") return clamp(parsed, 0.6, 1.8);
      if (field === "scaleX" || field === "scaleY") return clamp(parsed, 0.7, 1.3);
      return clamp(parsed, -120, 120);
    })();

    setOverrides((current) => ({
      ...current,
      [selectedKey]: {
        ...current[selectedKey],
        [field]: nextValue,
      },
    }));
  };

  const resetSelected = () => {
    if (!selectedKey) return;
    setOverrides((current) => {
      const next = { ...current };
      if (DEFAULT_REFEREE_HEADSHOT_OVERRIDES[selectedKey]) {
        next[selectedKey] = { ...DEFAULT_REFEREE_HEADSHOT_OVERRIDES[selectedKey] };
      } else {
        delete next[selectedKey];
      }
      return next;
    });
  };

  const resetAll = () => {
    setOverrides(DEFAULT_REFEREE_HEADSHOT_OVERRIDES);
  };

  const handleCopy = async () => {
    const payload = serializeRefereeHeadshotOverrides(overrides);
    try {
      await navigator.clipboard.writeText(payload);
      setCopyMessage("Copied overrides JSON.");
    } catch {
      setCopyMessage("Clipboard copy failed.");
    }
  };

  useEffect(() => {
    if (!copyMessage) return undefined;
    const timeoutId = window.setTimeout(() => setCopyMessage(""), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copyMessage]);

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <h1 className={styles.title}>Referee Headshot Crop Tool</h1>
          <p className={styles.subtitle}>
            This page includes all current referee assets plus duplicate review files.
            Adjustments persist locally and use the same transform path as the officials panel.
          </p>
        </div>
        <div className={styles.summary}>
          <span>{allItems.length} total headshots</span>
          <span>{editedCount} edited override entries</span>
          <span>{DUPLICATE_FILE_NAMES.size} duplicate review names</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search headshots"
        />
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showOnlyEdited}
            onChange={(event) => setShowOnlyEdited(event.target.checked)}
          />
          <span>Edited only</span>
        </label>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showOnlyDuplicates}
            onChange={(event) => setShowOnlyDuplicates(event.target.checked)}
          />
          <span>Duplicate review only</span>
        </label>
        <button type="button" className={styles.secondaryButton} onClick={resetAll}>Reset All</button>
        <button type="button" className={styles.primaryButton} onClick={handleCopy}>Copy Overrides JSON</button>
        {copyMessage ? <span className={styles.copyMessage}>{copyMessage}</span> : null}
      </div>

      <div className={styles.workspace}>
        <aside className={styles.controls}>
          {selectedItem ? (
            <>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>{selectedItem.fullName}</div>
                <div className={styles.badges}>
                  <span className={styles.badge}>{selectedItem.source}</span>
                  {DUPLICATE_FILE_NAMES.has(selectedItem.fileName) ? <span className={styles.badgeWarn}>duplicate name</span> : null}
                </div>
              </div>

              <div className={styles.selectedPreview}>
                <div className={styles.selectedCropFrame}>
                  <img
                    src={selectedItem.url}
                    alt={selectedItem.fullName}
                    className={styles.cropImage}
                    style={{ transform: buildRefereeHeadshotTransform(selectedDraft) }}
                  />
                </div>
                <div className={styles.selectedRawFrame}>
                  <img src={selectedItem.url} alt={`${selectedItem.fullName} raw`} className={styles.rawImage} />
                </div>
              </div>

              <div className={styles.controlList}>
                <label className={styles.control}>
                  <span>Scale</span>
                  <input
                    type="range"
                    min="0.6"
                    max="1.8"
                    step="0.01"
                    value={selectedDraft.scale}
                    onChange={(event) => updateSelectedOverride("scale", event.target.value)}
                  />
                  <input
                    type="number"
                    min="0.6"
                    max="1.8"
                    step="0.01"
                    value={selectedDraft.scale}
                    onChange={(event) => updateSelectedOverride("scale", event.target.value)}
                  />
                </label>

                <label className={styles.control}>
                  <span>Offset X</span>
                  <input
                    type="range"
                    min="-120"
                    max="120"
                    step="1"
                    value={selectedDraft.offsetX}
                    onChange={(event) => updateSelectedOverride("offsetX", event.target.value)}
                  />
                  <input
                    type="number"
                    min="-120"
                    max="120"
                    step="1"
                    value={selectedDraft.offsetX}
                    onChange={(event) => updateSelectedOverride("offsetX", event.target.value)}
                  />
                </label>

                <label className={styles.control}>
                  <span>Offset Y</span>
                  <input
                    type="range"
                    min="-120"
                    max="120"
                    step="1"
                    value={selectedDraft.offsetY}
                    onChange={(event) => updateSelectedOverride("offsetY", event.target.value)}
                  />
                  <input
                    type="number"
                    min="-120"
                    max="120"
                    step="1"
                    value={selectedDraft.offsetY}
                    onChange={(event) => updateSelectedOverride("offsetY", event.target.value)}
                  />
                </label>

                <label className={styles.control}>
                  <span>Scale X</span>
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.01"
                    value={selectedDraft.scaleX}
                    onChange={(event) => updateSelectedOverride("scaleX", event.target.value)}
                  />
                  <input
                    type="number"
                    min="0.7"
                    max="1.3"
                    step="0.01"
                    value={selectedDraft.scaleX}
                    onChange={(event) => updateSelectedOverride("scaleX", event.target.value)}
                  />
                </label>

                <label className={styles.control}>
                  <span>Scale Y</span>
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.01"
                    value={selectedDraft.scaleY}
                    onChange={(event) => updateSelectedOverride("scaleY", event.target.value)}
                  />
                  <input
                    type="number"
                    min="0.7"
                    max="1.3"
                    step="0.01"
                    value={selectedDraft.scaleY}
                    onChange={(event) => updateSelectedOverride("scaleY", event.target.value)}
                  />
                </label>
              </div>

              <div className={styles.panelActions}>
                <button type="button" className={styles.secondaryButton} onClick={resetSelected}>Reset Selected</button>
              </div>
            </>
          ) : (
            <div className={styles.emptyPanel}>No headshots match the current filter.</div>
          )}
        </aside>

        <div className={styles.grid}>
          {filteredItems.map((item) => {
            const draft = buildOverrideDraft(overrides, item.nameKey);
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.card} ${item.id === selectedId ? styles.cardSelected : ""}`.trim()}
                onClick={() => setSelectedId(item.id)}
              >
                <div className={styles.cropFrame}>
                  <img
                    src={item.url}
                    alt={item.fullName}
                    className={styles.cropImage}
                    style={{ transform: buildRefereeHeadshotTransform(draft) }}
                  />
                </div>
                <div className={styles.meta}>
                  <div className={styles.name}>{item.fullName}</div>
                  <div className={styles.badges}>
                    <span className={styles.badge}>{item.source}</span>
                    {overrides[item.nameKey] ? <span className={styles.badgeEdited}>edited</span> : null}
                    {DUPLICATE_FILE_NAMES.has(item.fileName) ? <span className={styles.badgeWarn}>duplicate name</span> : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
