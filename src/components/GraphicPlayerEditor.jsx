import { useEffect, useRef, useState } from "react";
import { applyGraphicPlayerOverride, normalizeGraphicPlayerOverride } from "../graphicPlayerOverrides.js";
import { uploadGraphicHeadshot, deleteGraphicHeadshot } from "../graphicHeadshotStorage.js";
import { buildPlayerHeadshotCandidates, loadFirstImage } from "../pages/matchupGraphicExport.js";
import styles from "./GraphicPlayerEditor.module.css";

export default function GraphicPlayerEditor({ player, value, onChange, userId, toolType, slotKey }) {
  const [image, setImage] = useState(null);
  const [state, setState] = useState("checking");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const override = normalizeGraphicPlayerOverride(value);
  const latestOverride = useRef(override);
  latestOverride.current = override;
  const effective = applyGraphicPlayerOverride(player, override);
  const sources = JSON.stringify(buildPlayerHeadshotCandidates(effective));
  const hidden = override.hideHeadshot;
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setState(hidden ? "hidden" : "checking");
    if (!hidden) loadFirstImage(JSON.parse(sources), {headshot:true}).then(result => {
      if (!cancelled) { setImage(result); setState(result ? "ready" : "missing"); }
    }).catch(() => { if (!cancelled) setState("missing"); });
    return () => { cancelled = true; };
  }, [sources, hidden]);

  const patch = next => onChange({ ...latestOverride.current, ...next });
  const upload = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setUploading(true); setError("");
    try {
      // Existing saved graphics may still reference the previous file. Retain
      // it rather than deleting an asset before the new draft has been saved.
      const result = await uploadGraphicHeadshot({ userId, file, toolType, slotKey });
      if (!mounted.current) { await deleteGraphicHeadshot(userId, result.storagePath); return; }
      patch({ headshotUrl: result.publicUrl, headshotStoragePath: result.storagePath, hideHeadshot: false });
    } catch (failure) { setError(failure?.message || "Unable to upload headshot."); }
    finally { setUploading(false); }
  };
  const name = player?.fullName || "player";
  return <div className={styles.editor}>
    <span className={`${styles.status} ${state === "missing" ? styles.missing : ""}`} role="status">
      {state === "missing" ? "Headshot missing/unavailable — exports blank" : state === "hidden" ? "Headshot hidden — exports blank" : state === "checking" ? "Checking headshot…" : "Headshot available"}
    </span>
    <details><summary>Number &amp; headshot</summary><div className={styles.fields}>
      <label className={styles.number}>Jersey #<input aria-label={`Jersey number for ${name}`} inputMode="numeric" maxLength={3}
        value={effective?.jerseyNum ?? ""} onChange={event => { if (/^\d{0,3}$/.test(event.target.value)) patch({ jerseyNum: event.target.value }); }} /></label>
      {override.jerseyNum !== null ? <button type="button" onClick={() => patch({ jerseyNum: null })}>Use roster number</button> : null}
      {image ? <img src={image.src} alt={`${name} headshot preview`} className={styles.preview} /> : null}
      <label>Upload headshot PNG<input aria-label={`Upload headshot for ${name}`} type="file" accept="image/png" disabled={uploading || !userId} onChange={upload} /></label>
      {!userId ? <span className={styles.status}>Sign in to upload a headshot.</span> : null}
      {uploading ? <span role="status">Uploading headshot…</span> : null}
      {override.headshotUrl ? <button type="button" disabled={uploading} onClick={() => patch({ headshotUrl: "", headshotStoragePath: "" })}>Use roster headshot</button> : null}
      <label><input type="checkbox" aria-label={`Leave headshot blank for ${name}`} checked={override.hideHeadshot} onChange={event => patch({ hideHeadshot: event.target.checked })} /> Leave headshot blank</label>
      {error ? <span role="alert" className={styles.error}>{error}</span> : null}
    </div></details>
  </div>;
}
