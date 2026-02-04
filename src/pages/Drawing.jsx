import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Drawing.module.css";

const TOOL_PEN = "pen";
const TOOL_ERASER = "eraser";

const defaultColors = ["#111111", "#1f6feb", "#dc2626", "#16a34a", "#f59e0b", "#7c3aed"];

export default function Drawing() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const snapshotRef = useRef(null);

  const [tool, setTool] = useState(TOOL_PEN);
  const [color, setColor] = useState(defaultColors[0]);
  const [size, setSize] = useState(4);

  const effectiveColor = tool === TOOL_ERASER ? "#000000" : color;

  const applyCanvasSize = (canvas, width, height) => {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const restoreSnapshot = (canvas, snapshot) => {
    if (!snapshot) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
    };
    img.src = snapshot;
  };

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return undefined;
    const canvas = canvasRef.current;
    const container = containerRef.current;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const snapshot = canvas.toDataURL("image/png");
      applyCanvasSize(canvas, rect.width, rect.height);
      restoreSnapshot(canvas, snapshot);
      snapshotRef.current = snapshot;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => observer.disconnect();
  }, []);

  const drawLine = (start, end) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = effectiveColor;
    ctx.lineWidth = size;
    ctx.globalCompositeOperation = tool === TOOL_ERASER ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  };

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const point = getPoint(event);
    if (!point) return;
    drawingRef.current = true;
    lastPointRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current) return;
    const point = getPoint(event);
    if (!point || !lastPointRef.current) return;
    drawLine(lastPointRef.current, point);
    lastPointRef.current = point;
  };

  const handlePointerUp = (event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const toolLabel = useMemo(() => (tool === TOOL_PEN ? "Pen" : "Eraser"), [tool]);

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <Link className={styles.backButton} to="/">
          Back
        </Link>
        <h1 className={styles.title}>Court Board</h1>
      </div>

      <div className={styles.controls}>
        <div className={styles.toolGroup}>
          <span className={styles.toolLabel}>Tool</span>
          <button
            type="button"
            className={`${styles.toolButton} ${tool === TOOL_PEN ? styles.toolActive : ""}`}
            onClick={() => setTool(TOOL_PEN)}
          >
            Pen
          </button>
          <button
            type="button"
            className={`${styles.toolButton} ${tool === TOOL_ERASER ? styles.toolActive : ""}`}
            onClick={() => setTool(TOOL_ERASER)}
          >
            Eraser
          </button>
          <span className={styles.toolChip}>{toolLabel}</span>
        </div>

        <div className={styles.toolGroup}>
          <span className={styles.toolLabel}>Thickness</span>
          <input
            type="range"
            min="2"
            max="18"
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          />
          <span className={styles.toolChip}>{size}px</span>
        </div>

        <div className={styles.toolGroup}>
          <span className={styles.toolLabel}>Color</span>
          <div className={styles.colorSwatches}>
            {defaultColors.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`${styles.colorButton} ${color === swatch ? styles.colorActive : ""}`}
                style={{ backgroundColor: swatch }}
                onClick={() => setColor(swatch)}
                aria-label={`Use color ${swatch}`}
              />
            ))}
            <input
              className={styles.colorPicker}
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              disabled={tool === TOOL_ERASER}
              aria-label="Pick custom color"
            />
          </div>
        </div>

        <button type="button" className={styles.clearButton} onClick={clearCanvas}>
          Clear
        </button>
      </div>

      <div className={styles.courtWrap} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div className={styles.hint}>Draw plays directly on the court.</div>
      </div>
    </div>
  );
}
