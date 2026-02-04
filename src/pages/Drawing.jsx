import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import styles from "./Drawing.module.css";

const TOOL_PEN = "pen";
const TOOL_ERASER = "eraser";

const defaultColors = ["#111111", "#1f6feb", "#dc2626", "#16a34a", "#f59e0b", "#7c3aed"];

export default function Drawing() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const currentStrokeRef = useRef(null);
  const strokesRef = useRef([]);
  const canvasSizeRef = useRef({ width: 1, height: 1 });

  const [params] = useSearchParams();
  const [tool, setTool] = useState(TOOL_PEN);
  const [color, setColor] = useState(defaultColors[0]);
  const [size, setSize] = useState(4);
  const [courtMode, setCourtMode] = useState("half");
  const [undoCount, setUndoCount] = useState(0);

  const backParam = params.get("back");
  const backUrl = backParam && backParam.startsWith("/") ? backParam : "/";

  const applyCanvasSize = (canvas, width, height) => {
    const ratio = window.devicePixelRatio || 1;
    canvasSizeRef.current = { width, height };
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return undefined;
    const canvas = canvasRef.current;
    const container = containerRef.current;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      applyCanvasSize(canvas, rect.width, rect.height);
      redrawAll();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => observer.disconnect();
  }, [courtMode]);

  const drawLine = (start, end, stroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = stroke.tool === TOOL_ERASER ? "#000000" : stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.globalCompositeOperation = stroke.tool === TOOL_ERASER ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  };

  const drawStrokePath = (stroke) => {
    const canvas = canvasRef.current;
    if (!canvas || !stroke || !stroke.points.length) return;
    const ctx = canvas.getContext("2d");
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = stroke.tool === TOOL_ERASER ? "#000000" : stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.globalCompositeOperation = stroke.tool === TOOL_ERASER ? "destination-out" : "source-over";
    const { width, height } = canvasSizeRef.current;
    ctx.beginPath();
    stroke.points.forEach((pt, index) => {
      const x = pt.x * width;
      const y = pt.y * height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  };

  const redrawAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach((stroke) => drawStrokePath(stroke));
  };

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const getNormalizedPoint = (point) => {
    const { width, height } = canvasSizeRef.current;
    if (!width || !height) return { x: 0, y: 0 };
    return { x: point.x / width, y: point.y / height };
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    const point = getPoint(event);
    if (!point) return;
    drawingRef.current = true;
    lastPointRef.current = point;
    const newStroke = {
      tool,
      color,
      size,
      points: [getNormalizedPoint(point)],
    };
    currentStrokeRef.current = newStroke;
    drawLine(point, point, newStroke);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const point = getPoint(event);
    if (!point || !lastPointRef.current) return;
    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    drawLine(lastPointRef.current, point, stroke);
    stroke.points.push(getNormalizedPoint(point));
    lastPointRef.current = point;
  };

  const handlePointerUp = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    drawingRef.current = false;
    lastPointRef.current = null;
    const stroke = currentStrokeRef.current;
    if (stroke && stroke.points.length) {
      strokesRef.current.push(stroke);
      setUndoCount(strokesRef.current.length);
    }
    currentStrokeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    setUndoCount(0);
  };

  const undoLast = () => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    setUndoCount(strokesRef.current.length);
    redrawAll();
  };

  const toolLabel = useMemo(() => (tool === TOOL_PEN ? "Pen" : "Eraser"), [tool]);

  const courtClass = courtMode === "full" ? styles.courtFull : styles.courtHalf;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <Link className={styles.backButton} to={backUrl}>
          Back
        </Link>
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

        <button
          type="button"
          className={styles.iconButton}
          onClick={undoLast}
          disabled={undoCount === 0}
          aria-label="Undo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
            <path
              d="M12.5 6.5c-2.8 0-5.1 1.4-6.5 3.5V7H3v8h8v-3H7.7c1-1.6 2.7-2.7 4.8-2.7 3 0 5.5 2.5 5.5 5.5 0 1.9-.9 3.6-2.4 4.6l1.8 2.3C19.6 20.2 21 18 21 15.5c0-5-4.1-9-9.1-9z"
              fill="currentColor"
            />
          </svg>
        </button>
        <button type="button" className={styles.clearButton} onClick={clearCanvas}>
          Clear
        </button>
      </div>

      <div className={`${styles.courtWrap} ${courtClass}`} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>

      <div className={styles.courtToggle}>
        <button
          type="button"
          className={`${styles.toggleButton} ${courtMode === "half" ? styles.toggleActive : ""}`}
          onClick={() => setCourtMode("half")}
        >
          Half Court
        </button>
        <button
          type="button"
          className={`${styles.toggleButton} ${courtMode === "full" ? styles.toggleActive : ""}`}
          onClick={() => setCourtMode("full")}
        >
          Full Court
        </button>
      </div>
    </div>
  );
}
