import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";
import {
  deleteSavedToolRecord,
  deleteSavedToolRecordRemote,
  listSavedToolRecords,
  listSavedToolRecordsRemote,
  saveToolRecord,
  saveToolRecordRemote,
  TOOL_RECORD_TYPES,
} from "../toolVault.js";
import {
  deleteVisualDrillImage,
  listVisualDrillImages,
  uploadVisualDrillImage,
} from "../visualDrillStorage.js";
import {
  clampInteger,
  DRILL_SHAPES,
  generateVisualDrill,
  hasVisibleComponentCombination,
  randomIntegerInRange,
} from "../visualDrillGenerator.js";
import styles from "./VisualDrillGenerator.module.css";

const DEFAULT_CONFIG = {
  backgroundColorCount: 1,
  backgroundColors: ["#000000"],
  minimumSpaces: 1,
  maximumSpaces: 4,
  useDigits: true,
  useShapes: true,
  useImages: false,
  minimumDigit: 0,
  maximumDigit: 9,
  digitColorCount: 3,
  digitColors: ["#106df3", "#00e600", "#ffd400"],
  shapes: [...DRILL_SHAPES],
  shapeColorCount: 3,
  shapeColors: ["#ff1010", "#00e600", "#106df3"],
  images: [],
  selfTimerEnabled: false,
  minimumInterval: 3,
  maximumInterval: 5,
};

const COLOR_FALLBACKS = ["#ffffff", "#000000", "#ff1010", "#106df3", "#00e600"];

function normalizePalette(colors, count) {
  const values = Array.isArray(colors) ? colors : [];
  return Array.from({ length: count }, (_, index) => values[index] || COLOR_FALLBACKS[index]);
}

function normalizeImageRecord(image) {
  if (!image || typeof image !== "object") return null;
  const path = String(image.path || "").trim();
  const url = String(image.url || "").trim();
  if (!path && !url) return null;
  return {
    id: String(image.id || path || url).trim(),
    name: String(image.name || "Uploaded image").trim() || "Uploaded image",
    path,
    url,
    contentType: String(image.contentType || "").trim(),
  };
}

function normalizeConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const backgroundColorCount = clampInteger(source.backgroundColorCount ?? DEFAULT_CONFIG.backgroundColorCount, 1, 5);
  const digitColorCount = clampInteger(source.digitColorCount ?? DEFAULT_CONFIG.digitColorCount, 1, 5);
  const shapeColorCount = clampInteger(source.shapeColorCount ?? DEFAULT_CONFIG.shapeColorCount, 1, 5);
  const minimumSpaces = clampInteger(source.minimumSpaces ?? DEFAULT_CONFIG.minimumSpaces, 0, 5);
  const maximumSpaces = Math.max(minimumSpaces, clampInteger(source.maximumSpaces ?? DEFAULT_CONFIG.maximumSpaces, 0, 5));
  const minimumDigit = clampInteger(source.minimumDigit ?? DEFAULT_CONFIG.minimumDigit, 0, 9);
  const maximumDigit = Math.max(minimumDigit, clampInteger(source.maximumDigit ?? DEFAULT_CONFIG.maximumDigit, 0, 9));
  const minimumInterval = clampInteger(source.minimumInterval ?? DEFAULT_CONFIG.minimumInterval, 1, 20);
  const maximumInterval = Math.max(minimumInterval, clampInteger(source.maximumInterval ?? DEFAULT_CONFIG.maximumInterval, 1, 20));
  const hasShapeSelection = Array.isArray(source.shapes);
  const shapes = (hasShapeSelection ? source.shapes : DEFAULT_CONFIG.shapes)
    .filter((shape) => DRILL_SHAPES.includes(shape));

  return {
    ...DEFAULT_CONFIG,
    backgroundColorCount,
    backgroundColors: normalizePalette(source.backgroundColors || DEFAULT_CONFIG.backgroundColors, backgroundColorCount),
    minimumSpaces,
    maximumSpaces,
    useDigits: source.useDigits !== false,
    useShapes: source.useShapes !== false,
    useImages: Boolean(source.useImages),
    minimumDigit,
    maximumDigit,
    digitColorCount,
    digitColors: normalizePalette(source.digitColors || DEFAULT_CONFIG.digitColors, digitColorCount),
    shapes,
    shapeColorCount,
    shapeColors: normalizePalette(source.shapeColors || DEFAULT_CONFIG.shapeColors, shapeColorCount),
    images: (Array.isArray(source.images) ? source.images : []).map(normalizeImageRecord).filter(Boolean),
    selfTimerEnabled: Boolean(source.selfTimerEnabled),
    minimumInterval,
    maximumInterval,
  };
}

function configForPersistence(config) {
  return {
    ...config,
    images: config.images.map(({ url: _temporaryUrl, ...image }) => image),
  };
}

function reconcileConfigImages(config, imageLibrary, libraryLoaded) {
  if (!config.images.length || !libraryLoaded) return config;
  const images = config.images
    .map((savedImage) => imageLibrary.find((image) => (
      (savedImage.path && image.path === savedImage.path) || image.id === savedImage.id
    )))
    .filter(Boolean);
  return normalizeConfig({ ...config, images });
}

function upsertFavoriteRecord(records, record) {
  return [record, ...records.filter((favorite) => favorite.id !== record.id)]
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

function RangeSelect({ minimum, maximum, lowerBound, upperBound, unit = "", onChange }) {
  const options = Array.from({ length: (upperBound - lowerBound) + 1 }, (_, index) => lowerBound + index);
  const optionLabel = (value) => `${value}${unit ? ` ${unit}${value === 1 ? "" : "s"}` : ""}`;
  return (
    <div className={styles.rangeGrid}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Minimum</span>
        <select className={styles.select} value={minimum} onChange={(event) => {
          const nextMinimum = Number(event.target.value);
          onChange(nextMinimum, Math.max(nextMinimum, maximum));
        }}>
          {options.map((value) => <option key={`minimum-${value}`} value={value}>{optionLabel(value)}</option>)}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Maximum</span>
        <select className={styles.select} value={maximum} onChange={(event) => onChange(minimum, Number(event.target.value))}>
          {options.filter((value) => value >= minimum).map((value) => <option key={`maximum-${value}`} value={value}>{optionLabel(value)}</option>)}
        </select>
      </label>
    </div>
  );
}

function ColorPalette({ label, count, colors, onCountChange, onColorChange }) {
  return (
    <div className={styles.paletteField}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{label}</span>
        <select className={styles.select} value={count} onChange={(event) => onCountChange(Number(event.target.value))}>
          {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <div className={styles.colorGrid} aria-label={`${label} choices`}>
        {colors.slice(0, count).map((color, index) => (
          <label className={styles.colorField} key={`${label}-${index}`}>
            <span>Color {index + 1}</span>
            <input type="color" value={color} onChange={(event) => onColorChange(index, event.target.value)} />
            <code>{color.toUpperCase()}</code>
          </label>
        ))}
      </div>
    </div>
  );
}

function Shape({ name, color }) {
  if (name === "circle") return <span className={`${styles.shape} ${styles.circle}`} style={{ backgroundColor: color }} />;
  if (name === "triangle") return <span className={`${styles.shape} ${styles.triangle}`} style={{ backgroundColor: color }} />;
  if (name === "star") return <span className={`${styles.shape} ${styles.star}`} style={{ backgroundColor: color }} />;
  return <span className={`${styles.shape} ${styles.square}`} style={{ backgroundColor: color }} />;
}

function Graphic({ graphic }) {
  return (
    <div className={styles.graphic} style={{ backgroundColor: graphic.backgroundColor }}>
      <div className={styles.components} data-count={graphic.components.length}>
        {graphic.components.map((component, index) => (
          <div className={styles.componentSpace} key={`${component.type}-${component.value}-${index}`}>
            {component.type === "digit" ? (
              <span className={styles.digit} style={{ color: component.color }}>{component.value}</span>
            ) : component.type === "image" ? (
              <img className={styles.componentImage} src={component.url} alt={component.label || ""} />
            ) : (
              <Shape name={component.value} color={component.color} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VisualDrillGenerator() {
  const { accountsEnabled, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const presetParam = String(searchParams.get("preset") || "").trim();
  const vaultUserId = user?.id || (!accountsEnabled ? "guest" : "");
  const [config, setConfig] = useState(() => normalizeConfig(DEFAULT_CONFIG));
  const [graphic, setGraphic] = useState(() => generateVisualDrill(DEFAULT_CONFIG));
  const [drillMode, setDrillMode] = useState(false);
  const [nextInterval, setNextInterval] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [favoriteId, setFavoriteId] = useState("");
  const [favoriteName, setFavoriteName] = useState("");
  const [favoriteStatus, setFavoriteStatus] = useState("");
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [imageLibrary, setImageLibrary] = useState([]);
  const [imageLibraryLoaded, setImageLibraryLoaded] = useState(false);
  const [imageStatus, setImageStatus] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const drillRef = useRef(null);
  const loadedPresetRef = useRef("");

  const configuredTypes = [
    config.useDigits,
    config.useShapes && config.shapes.length > 0,
    config.useImages && config.images.some((image) => image.url),
  ].filter(Boolean).length;
  const canGenerate = hasVisibleComponentCombination(config);
  const validationMessage = canGenerate
    ? ""
    : configuredTypes > 0
      ? "Add at least one digit or shape color that differs from an available background color."
      : config.useImages && !config.images.some((image) => image.url)
      ? "Upload and select at least one image, or enable another component type."
      : "Select Digits, Shapes / Symbols, Images, or a combination.";
  const accountFavoritesEnabled = accountsEnabled && Boolean(user?.id);
  const favoriteSaveDisabled = !favoriteName.trim()
    || favoriteBusy
    || (accountsEnabled ? !user?.id : !vaultUserId);
  const favoriteStorageNote = accountsEnabled
    ? accountFavoritesEnabled
      ? "Favorites save to your account."
      : "Sign in to save favorites to your account."
    : "Supabase accounts are not configured, so favorites save in this browser.";

  const updateConfig = (patch) => setConfig((current) => normalizeConfig({ ...current, ...patch }));
  const updatePaletteCount = (countKey, colorsKey, count) => setConfig((current) => normalizeConfig({
    ...current,
    [countKey]: count,
    [colorsKey]: normalizePalette(current[colorsKey], count),
  }));
  const updatePaletteColor = (colorsKey, index, color) => setConfig((current) => normalizeConfig({
    ...current,
    [colorsKey]: current[colorsKey].map((value, colorIndex) => colorIndex === index ? color : value),
  }));

  const generate = useCallback(() => setGraphic(generateVisualDrill(config)), [config]);

  const refreshFavorites = useCallback(async () => {
    if (!vaultUserId) {
      setFavorites([]);
      return;
    }
    let records;
    try {
      records = accountsEnabled && user?.id
        ? await listSavedToolRecordsRemote(user.id)
        : listSavedToolRecords(vaultUserId);
    } catch (error) {
      console.error("Failed to load Visual Drill favorites remotely.", error);
      if (accountsEnabled && user?.id) {
        setFavorites([]);
        setFavoriteStatus(error?.message || "Unable to load account favorites.");
        return;
      }
      records = listSavedToolRecords(vaultUserId);
      setFavoriteStatus("Showing saved browser favorites.");
    }
    setFavorites(records.filter((record) => record.type === TOOL_RECORD_TYPES.VISUAL_DRILL_PRESET));
  }, [accountsEnabled, user?.id, vaultUserId]);

  useEffect(() => {
    refreshFavorites();
  }, [refreshFavorites]);

  useEffect(() => {
    let cancelled = false;
    async function loadImages() {
      setImageLibraryLoaded(false);
      setImageLibrary([]);
      setConfig((current) => normalizeConfig({ ...current, images: [] }));
      if (!user?.id) {
        setImageLibraryLoaded(true);
        return;
      }
      try {
        const images = await listVisualDrillImages(user.id);
        if (!cancelled) {
          setImageLibrary(images);
          setImageLibraryLoaded(true);
        }
      } catch (error) {
        if (!cancelled) {
          setImageLibraryLoaded(true);
          setImageStatus(error?.message || "Unable to load uploaded images.");
        }
      }
    }
    loadImages();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!imageLibraryLoaded) return;
    setConfig((current) => reconcileConfigImages(current, imageLibrary, true));
  }, [imageLibrary, imageLibraryLoaded]);

  const enterDrillMode = async () => {
    if (!canGenerate) return;
    generate();
    setDrillMode(true);
    try {
      await drillRef.current?.requestFullscreen?.();
      await globalThis.screen?.orientation?.lock?.("landscape");
    } catch {
      // Full-screen and orientation locking depend on browser/device permissions.
    }
  };

  const exitDrillMode = useCallback(async () => {
    setDrillMode(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // The fixed overlay still exits if the browser owns full-screen state.
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setDrillMode(false);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!drillMode) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") exitDrillMode();
      if (event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        generate();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drillMode, exitDrillMode, generate]);

  useEffect(() => {
    if (!drillMode || !config.selfTimerEnabled) {
      setNextInterval(null);
      return undefined;
    }
    const seconds = randomIntegerInRange(config.minimumInterval, config.maximumInterval, 1, 20);
    setNextInterval(seconds);
    const timer = window.setTimeout(generate, seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [config.maximumInterval, config.minimumInterval, config.selfTimerEnabled, drillMode, generate, graphic]);

  const componentSummary = useMemo(() => [
    config.useDigits ? "digits" : null,
    config.useShapes ? "shapes" : null,
    config.useImages ? "images" : null,
  ].filter(Boolean).join(" + "), [config.useDigits, config.useImages, config.useShapes]);

  const handleFavoriteSelection = (id) => {
    setFavoriteId(id);
    const favorite = favorites.find((record) => record.id === id);
    if (!favorite) {
      setFavoriteName("");
      return;
    }
    const savedConfig = normalizeConfig(favorite.payload?.config || favorite.payload);
    const missingImageCount = savedConfig.images.length - reconcileConfigImages(savedConfig, imageLibrary, imageLibraryLoaded).images.length;
    const nextConfig = reconcileConfigImages(savedConfig, imageLibrary, imageLibraryLoaded);
    setFavoriteName(favorite.title);
    setConfig(nextConfig);
    setGraphic(generateVisualDrill(nextConfig));
    setFavoriteStatus(missingImageCount > 0
      ? `Loaded ${favorite.title}; ${missingImageCount} unavailable image${missingImageCount === 1 ? " was" : "s were"} removed.`
      : `Loaded ${favorite.title}.`);
  };

  useEffect(() => {
    if (!presetParam || !imageLibraryLoaded || loadedPresetRef.current === presetParam) return;
    const favorite = favorites.find((record) => record.id === presetParam);
    if (!favorite) return;
    loadedPresetRef.current = presetParam;
    const savedConfig = normalizeConfig(favorite.payload?.config || favorite.payload);
    const nextConfig = reconcileConfigImages(savedConfig, imageLibrary, true);
    const missingImageCount = savedConfig.images.length - nextConfig.images.length;
    setFavoriteId(favorite.id);
    setFavoriteName(favorite.title);
    setConfig(nextConfig);
    setGraphic(generateVisualDrill(nextConfig));
    setFavoriteStatus(missingImageCount > 0
      ? `Loaded ${favorite.title}; ${missingImageCount} unavailable image${missingImageCount === 1 ? " was" : "s were"} removed.`
      : `Loaded ${favorite.title}.`);
  }, [favorites, imageLibrary, imageLibraryLoaded, presetParam]);

  const handleNewFavorite = () => {
    setFavoriteId("");
    setFavoriteName("");
    setFavoriteStatus("");
  };

  const handleSaveFavorite = async () => {
    const title = String(favoriteName || "").trim();
    if (accountsEnabled && !user?.id) {
      setFavoriteStatus("Sign in to save favorite settings to your account.");
      return;
    }
    if (!title || !vaultUserId || favoriteBusy) return;
    setFavoriteBusy(true);
    setFavoriteStatus("");
    const existing = favorites.find((record) => record.id === favoriteId);
    const timestamp = new Date().toISOString();
    const record = {
      id: existing?.id || crypto.randomUUID(),
      type: TOOL_RECORD_TYPES.VISUAL_DRILL_PRESET,
      title,
      payload: { schemaVersion: 1, config: configForPersistence(config) },
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
    try {
      const saved = accountsEnabled && user?.id
        ? await saveToolRecordRemote(user.id, record)
        : saveToolRecord(vaultUserId, record);
      if (!saved) {
        throw new Error(accountsEnabled
          ? "Supabase did not return a saved favorite."
          : "The browser could not write this favorite. Its local storage may be full or unavailable.");
      }

      setFavorites((current) => upsertFavoriteRecord(current, saved));
      setFavoriteId(saved.id);
      setFavoriteStatus(accountsEnabled
        ? `Saved ${saved.title} to your account.`
        : `Saved ${saved.title} in this browser.`);
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] }).catch(() => {});
    } catch (error) {
      console.error("Failed to save Visual Drill favorite.", error);
      setFavoriteStatus(error?.message || "Unable to save this favorite.");
    } finally {
      setFavoriteBusy(false);
    }
  };

  const handleDeleteFavorite = async () => {
    if (!favoriteId || !vaultUserId || favoriteBusy) return;
    const favorite = favorites.find((record) => record.id === favoriteId);
    if (!window.confirm(`Delete “${favorite?.title || "this favorite"}”?`)) return;
    setFavoriteBusy(true);
    try {
      if (accountsEnabled && user?.id) await deleteSavedToolRecordRemote(user.id, favoriteId);
      else deleteSavedToolRecord(vaultUserId, favoriteId);
      await queryClient.invalidateQueries({ queryKey: ["owned-tools", vaultUserId] });
      handleNewFavorite();
      await refreshFavorites();
    } catch (error) {
      console.error("Failed to delete Visual Drill favorite remotely.", error);
      setFavoriteStatus("Unable to delete this Supabase favorite. It has not been removed; try again.");
    } finally {
      setFavoriteBusy(false);
    }
  };

  const handleImageUpload = async (files) => {
    const selectedFiles = [...(files || [])];
    if (!selectedFiles.length || !user?.id || imageBusy) return;
    setImageBusy(true);
    setImageStatus("");
    const uploaded = [];
    try {
      for (const file of selectedFiles) uploaded.push(await uploadVisualDrillImage(user.id, file));
      setImageStatus(`Uploaded ${uploaded.length} image${uploaded.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error("Failed to upload Visual Drill image.", error);
      setImageStatus(uploaded.length
        ? `Uploaded ${uploaded.length} image${uploaded.length === 1 ? "" : "s"}; another upload failed: ${error?.message || "unknown error"}`
        : error?.message || "Unable to upload this image.");
    } finally {
      if (uploaded.length) {
        setImageLibrary((current) => [...uploaded, ...current]);
        setConfig((current) => normalizeConfig({
          ...current,
          useImages: true,
          images: [...current.images, ...uploaded],
        }));
      }
      setImageBusy(false);
    }
  };

  const toggleImageSelection = (image, selected) => setConfig((current) => normalizeConfig({
    ...current,
    images: selected
      ? [...current.images.filter((entry) => entry.path !== image.path), image]
      : current.images.filter((entry) => entry.path !== image.path),
  }));

  const handleImageDelete = async (image) => {
    if (!user?.id || imageBusy || !window.confirm(`Delete “${image.name}” from your image library? Saved favorites that use it will no longer include it.`)) return;
    setImageBusy(true);
    setImageStatus("");
    try {
      await deleteVisualDrillImage(user.id, image);
      setImageLibrary((current) => current.filter((entry) => entry.path !== image.path));
      setConfig((current) => normalizeConfig({
        ...current,
        images: current.images.filter((entry) => entry.path !== image.path),
      }));
      setImageStatus(`Deleted ${image.name}.`);
    } catch (error) {
      setImageStatus(error?.message || "Unable to delete this image.");
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <div className={styles.builder}>
      <div className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>Visual recognition generator</span>
          <h2>Visual Drill</h2>
          <p>Build a reusable filter set, then generate an endless randomized drill.</p>
        </div>
      </div>

      <div className={styles.workflowShell}>
        <div className={styles.settingsColumn}>
          <section className={`${styles.setupCard} ${styles.favoriteCard}`}>
            <div className={styles.favoriteHeading}>
              <div>
                <span className={styles.eyebrow}>Favorites</span>
                <h3>Saved settings</h3>
                <p className={styles.accountNote}>{favoriteStorageNote}</p>
              </div>
              <button
                type="button"
                className={styles.textButton}
                onClick={handleNewFavorite}
                disabled={favoriteBusy || (accountsEnabled && !user?.id)}
              >
                + New favorite
              </button>
            </div>
            <div className={styles.favoriteGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Load favorite</span>
                <select
                  className={styles.select}
                  value={favoriteId}
                  onChange={(event) => handleFavoriteSelection(event.target.value)}
                  disabled={accountsEnabled && !user?.id}
                >
                  <option value="">Select saved settings</option>
                  {favorites.map((favorite) => <option key={favorite.id} value={favorite.id}>{favorite.title}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Favorite name</span>
                <input
                  className={styles.select}
                  value={favoriteName}
                  maxLength={80}
                  onChange={(event) => setFavoriteName(event.target.value)}
                  placeholder="Warm-up set"
                  disabled={accountsEnabled && !user?.id}
                />
              </label>
              <div className={styles.favoriteActions}>
                {favoriteId ? <button type="button" className={styles.deleteButton} onClick={handleDeleteFavorite} disabled={favoriteBusy}>Delete</button> : null}
                <button type="button" className={styles.saveButton} onClick={handleSaveFavorite} disabled={favoriteSaveDisabled}>{favoriteBusy ? "Saving…" : favoriteId ? "Update Favorite" : "Save Favorite"}</button>
              </div>
            </div>
            {favoriteStatus ? <p className={styles.status}>{favoriteStatus}</p> : null}
          </section>

          <div className={styles.setupFlow}>
            <section className={styles.setupCard}>
              <div className={styles.stepNumber}>01</div>
              <h3>Background</h3>
              <ColorPalette label="Possible colors" count={config.backgroundColorCount} colors={config.backgroundColors} onCountChange={(count) => updatePaletteCount("backgroundColorCount", "backgroundColors", count)} onColorChange={(index, color) => updatePaletteColor("backgroundColors", index, color)} />
            </section>

            <section className={styles.setupCard}>
              <div className={styles.stepNumber}>02</div>
              <h3>Spaces / columns</h3>
              <RangeSelect minimum={config.minimumSpaces} maximum={config.maximumSpaces} lowerBound={0} upperBound={5} onChange={(minimumSpaces, maximumSpaces) => updateConfig({ minimumSpaces, maximumSpaces })} />
              <p className={styles.hint}>Each refresh chooses a number within this range.</p>
            </section>

            <section className={styles.setupCard}>
              <div className={styles.stepNumber}>03</div>
              <h3>Components</h3>
              <div className={styles.componentChecks}>
                <label className={`${styles.checkOption} ${config.maximumSpaces === 0 ? styles.checkOptionDisabled : ""}`}><input type="checkbox" checked={config.useDigits} disabled={config.maximumSpaces === 0} onChange={(event) => updateConfig({ useDigits: event.target.checked })} /><span>Digits</span></label>
                <label className={`${styles.checkOption} ${config.maximumSpaces === 0 ? styles.checkOptionDisabled : ""}`}><input type="checkbox" checked={config.useShapes} disabled={config.maximumSpaces === 0} onChange={(event) => updateConfig({ useShapes: event.target.checked })} /><span>Shapes / Symbols</span></label>
                <label className={`${styles.checkOption} ${config.maximumSpaces === 0 ? styles.checkOptionDisabled : ""}`}><input type="checkbox" checked={config.useImages} disabled={config.maximumSpaces === 0} onChange={(event) => updateConfig({ useImages: event.target.checked })} /><span>Images</span></label>
              </div>
              {config.maximumSpaces === 0 ? <p className={styles.hint}>Background-only mode.</p> : validationMessage ? <p className={styles.validation}>{validationMessage}</p> : <p className={styles.hint}>Current mix: {componentSummary}</p>}
            </section>

            <section className={styles.setupCard}>
              <div className={styles.stepNumber}>04</div>
              <h3>Self timer</h3>
              <label className={styles.toggleOption}><input type="checkbox" checked={config.selfTimerEnabled} onChange={(event) => updateConfig({ selfTimerEnabled: event.target.checked })} /><span><strong>Automatically refresh</strong><small>Runs during Drill Mode</small></span></label>
              {config.selfTimerEnabled ? <RangeSelect minimum={config.minimumInterval} maximum={config.maximumInterval} lowerBound={1} upperBound={20} unit="second" onChange={(minimumInterval, maximumInterval) => updateConfig({ minimumInterval, maximumInterval })} /> : null}
              <p className={styles.hint}>{config.selfTimerEnabled ? "Each refresh uses a random interval in this range." : "Manual refresh remains available."}</p>
            </section>
          </div>

          {config.maximumSpaces > 0 && (config.useDigits || config.useShapes || config.useImages) ? (
            <div className={styles.subfilterGrid}>
              {config.useDigits ? (
                <section className={styles.setupCard}>
                  <div className={styles.stepNumber}>D</div>
                  <h3>Digit options</h3>
                  <RangeSelect minimum={config.minimumDigit} maximum={config.maximumDigit} lowerBound={0} upperBound={9} onChange={(minimumDigit, maximumDigit) => updateConfig({ minimumDigit, maximumDigit })} />
                  <ColorPalette label="Possible digit colors" count={config.digitColorCount} colors={config.digitColors} onCountChange={(count) => updatePaletteCount("digitColorCount", "digitColors", count)} onColorChange={(index, color) => updatePaletteColor("digitColors", index, color)} />
                </section>
              ) : null}

              {config.useShapes ? (
                <section className={styles.setupCard}>
                  <div className={styles.stepNumber}>S</div>
                  <h3>Shape / symbol options</h3>
                  <div className={styles.shapeOptions}>
                    {DRILL_SHAPES.map((shape) => (
                      <label className={styles.checkOption} key={shape}><input type="checkbox" checked={config.shapes.includes(shape)} onChange={(event) => {
                        const shapes = event.target.checked ? [...config.shapes, shape] : config.shapes.filter((value) => value !== shape);
                        updateConfig({ shapes });
                      }} /><span>{shape[0].toUpperCase() + shape.slice(1)}</span></label>
                    ))}
                  </div>
                  <ColorPalette label="Possible shape colors" count={config.shapeColorCount} colors={config.shapeColors} onCountChange={(count) => updatePaletteCount("shapeColorCount", "shapeColors", count)} onColorChange={(index, color) => updatePaletteColor("shapeColors", index, color)} />
                </section>
              ) : null}

              {config.useImages ? (
                <section className={`${styles.setupCard} ${styles.imageCard}`}>
                  <div className={styles.stepNumber}>I</div>
                  <h3>Image options</h3>
                  <label className={`${styles.uploadButton} ${!user?.id || imageBusy ? styles.uploadButtonDisabled : ""}`}>
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={!user?.id || imageBusy} onChange={(event) => {
                      handleImageUpload(event.target.files);
                      event.target.value = "";
                    }} />
                    {imageBusy ? "Uploading…" : "+ Upload Images"}
                  </label>
                  {!user?.id ? <p className={styles.hint}>Sign in to upload persistent images to Supabase.</p> : null}
                  {imageStatus ? <p className={styles.status}>{imageStatus}</p> : null}
                  {imageLibrary.length ? (
                    <div className={styles.imageGrid}>
                      {imageLibrary.map((image) => {
                        const selected = config.images.some((entry) => entry.path === image.path);
                        return (
                          <article className={`${styles.imageTile} ${selected ? styles.imageTileSelected : ""}`} key={image.path}>
                            <label>
                              <input type="checkbox" checked={selected} onChange={(event) => toggleImageSelection(image, event.target.checked)} />
                              <img src={image.url} alt="" />
                              <span title={image.name}>{image.name}</span>
                            </label>
                            <button type="button" onClick={() => handleImageDelete(image)} disabled={imageBusy} aria-label={`Delete ${image.name}`}>×</button>
                          </article>
                        );
                      })}
                    </div>
                  ) : <p className={styles.emptyState}>No uploaded images yet.</p>}
                </section>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className={styles.previewColumn}>
          <section className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <div><span className={styles.eyebrow}>Live preview</span><h3>Next graphic</h3></div>
            </div>
            <div className={styles.previewFrame}><Graphic graphic={graphic} /></div>
            <div className={styles.previewActions}>
              <button type="button" className={styles.previewRefresh} onClick={generate} disabled={!canGenerate}>↻ Refresh</button>
              <button type="button" className={styles.startButton} onClick={enterDrillMode} disabled={!canGenerate}>Start Drill Mode</button>
            </div>
          </section>
        </aside>
      </div>

      <div ref={drillRef} className={`${styles.drillMode} ${drillMode ? styles.drillModeOpen : ""}`} aria-hidden={!drillMode}>
        <Graphic graphic={graphic} />
        <button type="button" className={styles.exitButton} onClick={exitDrillMode} aria-label="Exit Drill Mode">×</button>
        {nextInterval ? <div className={styles.timerBadge}>Auto · {nextInterval}s interval</div> : null}
        <button type="button" className={styles.refreshButton} onClick={generate}><span aria-hidden="true">↻</span> Refresh</button>
      </div>
    </div>
  );
}
