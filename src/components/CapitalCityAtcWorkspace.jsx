import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ATC_MAX_POINTS, ATC_MAX_STROKES, ATC_MAX_TEXT, CAPITAL_CITY_ATC_SCOPE,
  fetchCapitalCityAtcSection, normalizeAtcPayload, saveCapitalCityAtcSection,
} from "../capitalCityAtcState.js";
import Button from "./ui/Button.jsx";
import styles from "./CapitalCityAtcWorkspace.module.css";

// Same direct Pointer Events, 4px default, 2–18px range and round joins/caps
// as Court Drawing. Coordinates are normalized so resizing doesn't lose ink.
function DrawingBoard({ strokes, editing, saving, onChange, onActiveChange, onError }) {
  const canvasRef = useRef(null);
  const active = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#111111");
  const [size, setSize] = useState(4);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const paintRef = useRef(null);

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    [...strokesRef.current, ...(active.current ? [active.current.stroke] : [])].forEach(stroke => {
      context.save();
      context.lineCap = "round"; context.lineJoin = "round";
      context.lineWidth = stroke.size; context.strokeStyle = stroke.color; context.fillStyle = stroke.color;
      context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
      const point = stroke.points[0];
      if (stroke.points.length === 1) {
        context.beginPath(); context.arc(point.x * bounds.width, point.y * bounds.height, stroke.size / 2, 0, Math.PI * 2); context.fill();
      } else {
        context.beginPath();
        stroke.points.forEach((p, index) => { context[index ? "lineTo" : "moveTo"](p.x * bounds.width, p.y * bounds.height); });
        context.stroke();
      }
      context.restore();
    });
  };
  paintRef.current = paint;
  useLayoutEffect(() => { paintRef.current(); }, [strokes]);
  useEffect(() => {
    const observer = new ResizeObserver(() => paintRef.current());
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  const pointFor = event => {
    const bounds = canvasRef.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  };
  const drawLivePoint = (point, previous = null) => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    const stroke = active.current.stroke;
    context.save();
    context.lineJoin = "round"; context.lineCap = "round";
    context.lineWidth = stroke.size; context.strokeStyle = stroke.color; context.fillStyle = stroke.color;
    context.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
    context.beginPath();
    if (previous) {
      context.moveTo(previous.x * bounds.width, previous.y * bounds.height);
      context.lineTo(point.x * bounds.width, point.y * bounds.height); context.stroke();
    } else {
      context.arc(point.x * bounds.width, point.y * bounds.height, stroke.size / 2, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  };
  const finish = event => {
    if (active.current?.pointerId !== event.pointerId) return;
    const stroke = active.current.stroke;
    active.current = null;
    onChange([...strokesRef.current, stroke]);
    onActiveChange(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <>
    {editing ? <fieldset className={styles.toolbar} disabled={saving}>
      <legend className={styles.srOnly}>Drawing controls</legend>
      <Button size="sm" aria-pressed={tool === "pen"} onClick={() => setTool("pen")}>Pen</Button>
      <Button size="sm" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")}>Eraser</Button>
      <label>Color <input type="color" aria-label="Drawing color" value={color} disabled={tool === "eraser"} onChange={event => setColor(event.target.value)} /></label>
      <label>Thickness <input type="range" aria-label="Drawing thickness" min="2" max="18" value={size} onChange={event => setSize(Number(event.target.value))} /><span>{size}px</span></label>
      <Button size="sm" disabled={!strokes.length} onClick={() => onChange(strokes.slice(0, -1))}>Undo</Button>
      <Button size="sm" variant="danger" disabled={!strokes.length} onClick={() => {
        if (window.confirm("Clear this drawing? You can Cancel editing to keep the last saved version.")) onChange([]);
      }}>Clear</Button>
    </fieldset> : null}
    <canvas ref={canvasRef} className={`${styles.canvas} ${editing && !saving ? styles.canvasEditing : ""}`}
      aria-label="ATC drawing board" role="img" data-stroke-count={strokes.length} aria-description={editing ? "Draw with your finger, Pencil, or mouse." : "Saved drawing. Click Edit to draw."}
      onPointerDown={event => {
        if (!editing || saving || active.current || (event.pointerType === "mouse" && event.button !== 0)) return;
        if (strokes.length >= ATC_MAX_STROKES || strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) >= ATC_MAX_POINTS) {
          onError("Drawing limit reached. Undo or clear some strokes before adding more."); return;
        }
        event.preventDefault(); event.stopPropagation();
        active.current = { pointerId: event.pointerId, stroke: { tool, color, size, points: [pointFor(event)] },
          remaining: ATC_MAX_POINTS - strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) - 1 };
        event.currentTarget.setPointerCapture(event.pointerId);
        onActiveChange(true); drawLivePoint(active.current.stroke.points[0]);
      }}
      onPointerMove={event => {
        if (active.current?.pointerId !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        if (active.current.remaining <= 0) { onError("Drawing point limit reached. Lift your finger or Pencil, then save or undo."); return; }
        const point = pointFor(event);
        drawLivePoint(point, active.current.stroke.points.at(-1));
        active.current.stroke.points.push(point); active.current.remaining -= 1;
      }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    />
  </>;
}

function WorkspaceSection({ gameId, section, title }) {
  const client = useQueryClient();
  const queryKey = useMemo(() => [CAPITAL_CITY_ATC_SCOPE, gameId, section], [gameId, section]);
  const [draft, setDraft] = useState(null);
  const [version, setVersion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeStroke, setActiveStroke] = useState(false);
  const [error, setError] = useState("");
  const editing = draft !== null;
  const query = useQuery({ queryKey, queryFn: () => fetchCapitalCityAtcSection(gameId, section),
    refetchInterval: editing ? false : 15000, refetchOnWindowFocus: !editing });
  const payload = draft || query.data?.payload || normalizeAtcPayload(section);
  useEffect(() => {
    if (!editing) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing]);

  const save = async () => {
    if (!draft || saving || activeStroke) return;
    setSaving(true); setError("");
    try {
      await client.cancelQueries({ queryKey });
      const saved = await saveCapitalCityAtcSection(gameId, section, draft, version);
      client.setQueryData(queryKey, saved); setDraft(null); setVersion(saved.version);
    } catch (cause) {
      setError(cause?.code === "SHARED_STATE_CONFLICT"
        ? "Another user saved changes. Your draft is preserved. Cancel to reload their saved version before editing again."
        : `Unable to save. Your draft is preserved. ${cause?.message || "Please retry."}`);
    } finally { setSaving(false); }
  };
  return <section className={styles.section} aria-label={title}>
    <div className={styles.heading}>
      <h2>{title}</h2>
      <div className={styles.actions}>
        {editing ? <Button size="sm" disabled={saving || activeStroke} onClick={() => {
          if (!window.confirm("Discard your unsaved edits?")) return;
          setDraft(null); setError(""); void query.refetch();
        }}>Cancel</Button> : null}
        <Button size="sm" variant="primary" disabled={saving || activeStroke || (!editing && (query.isFetching || !query.data || Boolean(query.error)))} onClick={() => {
          if (editing) { void save(); return; }
          setDraft(structuredClone(query.data.payload)); setVersion(query.data.version); setError("");
        }}>{saving ? "Saving…" : editing ? "Save" : "Edit"}</Button>
      </div>
    </div>
    <p className={styles.hint}>{editing ? "Editing — click Save to share and lock your changes." : "Shared for this game. Click Edit to make changes."}</p>
    {query.isPending ? <p role="status">Loading…</p> : null}
    {(error || query.error) ? <p role="alert" className={styles.error}>{error || "Unable to load saved content. Editing is disabled to protect existing data."}</p> : null}
    {section === "text" ? <textarea aria-label="ATC text" readOnly={!editing} disabled={saving} rows={7} maxLength={ATC_MAX_TEXT}
      className={styles.text} value={payload.text} placeholder="Game notes…" onChange={event => setDraft({ ...payload, text: event.target.value })} />
      : <DrawingBoard strokes={payload.strokes} editing={editing} saving={saving} onActiveChange={setActiveStroke} onError={setError}
        onChange={strokes => setDraft({ ...payload, strokes })} />}
  </section>;
}

export default function CapitalCityAtcWorkspace({ gameId }) {
  return <div className={styles.workspace} role="group" aria-label="Capital City ATC workspace">
    <WorkspaceSection key={`${gameId}:text`} gameId={gameId} section="text" title="ATC Notes" />
    <WorkspaceSection key={`${gameId}:drawing`} gameId={gameId} section="drawing" title="ATC Drawing" />
  </div>;
}
