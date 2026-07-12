import { useEffect, useMemo, useRef, useState } from "react";
import { DRILL_SHAPES, generateVisualDrill } from "../visualDrillGenerator.js";
import styles from "./VisualDrillGenerator.module.css";

const DEFAULT_CONFIG = {
  backgroundColorCount: 3,
  backgroundColors: ["#ffffff", "#000000", "#ff1010"],
  minimumSpaces: 1,
  maximumSpaces: 4,
  useDigits: true,
  useShapes: true,
  minimumDigit: 0,
  maximumDigit: 9,
  digitColorCount: 3,
  digitColors: ["#106df3", "#00e600", "#ffd400"],
  shapes: [...DRILL_SHAPES],
  shapeColorCount: 3,
  shapeColors: ["#ff1010", "#00e600", "#106df3"],
};

const COLOR_FALLBACKS = ["#ffffff", "#000000", "#ff1010", "#106df3", "#00e600"];

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
            ) : (
              <Shape name={component.value} color={component.color} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizePalette(colors, count) {
  return Array.from({ length: count }, (_, index) => colors[index] || COLOR_FALLBACKS[index]);
}

export default function VisualDrillGenerator() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [graphic, setGraphic] = useState(() => generateVisualDrill(DEFAULT_CONFIG));
  const [drillMode, setDrillMode] = useState(false);
  const drillRef = useRef(null);

  const canGenerate = config.minimumSpaces === 0 || config.useDigits || config.useShapes;
  const validationMessage = !canGenerate ? "Select Digits, Shapes / Symbols, or both." : "";

  const updateConfig = (patch) => setConfig((current) => ({ ...current, ...patch }));
  const updatePaletteCount = (countKey, colorsKey, count) => setConfig((current) => ({
    ...current,
    [countKey]: count,
    [colorsKey]: normalizePalette(current[colorsKey], count),
  }));
  const updatePaletteColor = (colorsKey, index, color) => setConfig((current) => ({
    ...current,
    [colorsKey]: current[colorsKey].map((value, colorIndex) => colorIndex === index ? color : value),
  }));

  const generate = () => setGraphic(generateVisualDrill(config));

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

  const exitDrillMode = async () => {
    setDrillMode(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // The fixed overlay still exits if the browser owns full-screen state.
    }
  };

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
  });

  const componentSummary = useMemo(() => [
    config.useDigits ? "digits" : null,
    config.useShapes ? "shapes" : null,
  ].filter(Boolean).join(" + "), [config.useDigits, config.useShapes]);

  return (
    <div className={styles.builder}>
      <div className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>Visual recognition generator</span>
          <h2>Visual Drill</h2>
          <p>Set the available colors and components, then generate an endless randomized drill.</p>
        </div>
        <button type="button" className={styles.startButton} onClick={enterDrillMode} disabled={!canGenerate}>Start Drill Mode</button>
      </div>

      <div className={styles.setupGrid}>
        <section className={styles.setupCard}>
          <div className={styles.stepNumber}>01</div>
          <h3>Background palette</h3>
          <ColorPalette
            label="Possible colors"
            count={config.backgroundColorCount}
            colors={config.backgroundColors}
            onCountChange={(count) => updatePaletteCount("backgroundColorCount", "backgroundColors", count)}
            onColorChange={(index, color) => updatePaletteColor("backgroundColors", index, color)}
          />
        </section>

        <section className={styles.setupCard}>
          <div className={styles.stepNumber}>02</div>
          <h3>Spaces / columns</h3>
          <div className={styles.rangeGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Minimum</span>
              <input className={styles.select} type="number" min="0" max="5" value={config.minimumSpaces} onChange={(event) => {
                const minimumSpaces = Math.min(5, Math.max(0, Number(event.target.value)));
                updateConfig({ minimumSpaces, maximumSpaces: Math.max(minimumSpaces, config.maximumSpaces) });
              }} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Maximum</span>
              <input className={styles.select} type="number" min={config.minimumSpaces} max="5" value={config.maximumSpaces} onChange={(event) => updateConfig({ maximumSpaces: Math.min(5, Math.max(config.minimumSpaces, Number(event.target.value))) })} />
            </label>
          </div>
          <p className={styles.hint}>Each refresh chooses a number within this range.</p>
        </section>

        {config.maximumSpaces > 0 ? (
          <section className={styles.setupCard}>
            <div className={styles.stepNumber}>03</div>
            <h3>Components</h3>
            <div className={styles.checkGrid}>
              <label className={styles.checkOption}><input type="checkbox" checked={config.useDigits} onChange={(event) => updateConfig({ useDigits: event.target.checked })} /><span>Digits</span></label>
              <label className={styles.checkOption}><input type="checkbox" checked={config.useShapes} onChange={(event) => updateConfig({ useShapes: event.target.checked })} /><span>Shapes / Symbols</span></label>
            </div>
            {validationMessage ? <p className={styles.validation}>{validationMessage}</p> : <p className={styles.hint}>Current mix: {componentSummary}</p>}
          </section>
        ) : null}
      </div>

      {config.maximumSpaces > 0 && (config.useDigits || config.useShapes) ? (
        <div className={styles.subfilterGrid}>
          {config.useDigits ? (
            <section className={styles.setupCard}>
              <div className={styles.stepNumber}>D</div>
              <h3>Digit options</h3>
              <div className={styles.rangeGrid}>
                <label className={styles.field}><span className={styles.fieldLabel}>Minimum digit</span><input className={styles.select} type="number" min="0" max="9" value={config.minimumDigit} onChange={(event) => {
                  const minimumDigit = Math.min(9, Math.max(0, Number(event.target.value)));
                  updateConfig({ minimumDigit, maximumDigit: Math.max(minimumDigit, config.maximumDigit) });
                }} /></label>
                <label className={styles.field}><span className={styles.fieldLabel}>Maximum digit</span><input className={styles.select} type="number" min={config.minimumDigit} max="9" value={config.maximumDigit} onChange={(event) => updateConfig({ maximumDigit: Math.min(9, Math.max(config.minimumDigit, Number(event.target.value))) })} /></label>
              </div>
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
                    if (shapes.length) updateConfig({ shapes });
                  }} /><span>{shape[0].toUpperCase() + shape.slice(1)}</span></label>
                ))}
              </div>
              <ColorPalette label="Possible shape colors" count={config.shapeColorCount} colors={config.shapeColors} onCountChange={(count) => updatePaletteCount("shapeColorCount", "shapeColors", count)} onColorChange={(index, color) => updatePaletteColor("shapeColors", index, color)} />
            </section>
          ) : null}
        </div>
      ) : null}

      <section className={styles.previewCard}>
        <div className={styles.previewHeader}><div><span className={styles.eyebrow}>Live preview</span><h3>Next graphic</h3></div><button type="button" className={styles.previewRefresh} onClick={generate} disabled={!canGenerate}>↻ Refresh</button></div>
        <div className={styles.previewFrame}><Graphic graphic={graphic} /></div>
      </section>

      <div ref={drillRef} className={`${styles.drillMode} ${drillMode ? styles.drillModeOpen : ""}`} aria-hidden={!drillMode}>
        <Graphic graphic={graphic} />
        <button type="button" className={styles.exitButton} onClick={exitDrillMode} aria-label="Exit Drill Mode">×</button>
        <button type="button" className={styles.refreshButton} onClick={generate}><span aria-hidden="true">↻</span> Refresh</button>
      </div>
    </div>
  );
}
