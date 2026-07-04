import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/useAuth.js";
import PlayerHeadshot from "../components/PlayerHeadshot.jsx";
import {
  broadcastPlayerHeadshotChange,
  cacheStoredPlayerHeadshotOverrides,
  deleteUploadedPlayerHeadshotAsset,
  getPlayerHeadshotUploadFormat,
  loadRemotePlayerHeadshotState,
  readStoredPlayerHeadshotOverrides,
  saveRemotePlayerHeadshotState,
  sanitizePlayerHeadshotState,
  uploadPlayerHeadshotAsset,
} from "../playerHeadshotOverrides.js";
import styles from "./Admin.module.css";

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

async function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error("Unable to decode image file."));
    nextImage.src = src;
  });
}

function getPreferredUploadFormat(file) {
  const mimeType = String(file?.type || "").toLowerCase().split(";")[0].trim();
  if (mimeType === "image/png" || mimeType === "image/webp" || mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return getPlayerHeadshotUploadFormat(mimeType);
  }

  const fileName = String(file?.name || "").toLowerCase();
  if (fileName.endsWith(".png")) return getPlayerHeadshotUploadFormat("image/png");
  if (fileName.endsWith(".webp")) return getPlayerHeadshotUploadFormat("image/webp");
  return getPlayerHeadshotUploadFormat("image/jpeg");
}

async function renderCompressedImageBlob(file, { maxEdge, quality }) {
  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(rawDataUrl);
  const requestedFormat = getPreferredUploadFormat(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to encode image."));
        return;
      }
      const format = getPlayerHeadshotUploadFormat(blob.type || requestedFormat.contentType);
      resolve({
        blob,
        contentType: format.contentType,
      });
    }, requestedFormat.contentType, quality);
  });
}

function normalizePersonId(value) {
  return String(value || "").replace(/\D+/g, "").trim();
}

export default function PlayerHeadshotsAdmin() {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [records, setRecords] = useState(() => readStoredPlayerHeadshotOverrides());
  const [personId, setPersonId] = useState("");
  const [label, setLabel] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return () => {
      cancelled = true;
    };

    setLoading(true);
    loadRemotePlayerHeadshotState(user.id)
      .then((remoteRecords) => {
        if (cancelled || !remoteRecords) return;
        const sanitized = sanitizePlayerHeadshotState(remoteRecords);
        cacheStoredPlayerHeadshotOverrides(sanitized);
        setRecords(sanitized);
        broadcastPlayerHeadshotChange();
      })
      .catch((error) => {
        if (!cancelled) setStatus(error?.message || "Unable to load player headshots.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const sortedRecords = useMemo(() => (
    Object.values(records)
      .filter(Boolean)
      .sort((left, right) => {
        const labelCompare = String(left.label || "").localeCompare(String(right.label || ""));
        if (labelCompare !== 0) return labelCompare;
        return String(left.personId || "").localeCompare(String(right.personId || ""));
      })
  ), [records]);

  const selectedPersonId = normalizePersonId(personId);
  const selectedRecord = selectedPersonId ? records[selectedPersonId] || null : null;

  const persistRecords = async (nextRecords) => {
    const sanitized = sanitizePlayerHeadshotState(nextRecords);
    await saveRemotePlayerHeadshotState(user?.id, sanitized);
    cacheStoredPlayerHeadshotOverrides(sanitized);
    setRecords(sanitized);
    broadcastPlayerHeadshotChange();
    return sanitized;
  };

  const handleUpload = async () => {
    if (!selectedPersonId) {
      setStatus("Enter a player ID.");
      return;
    }
    if (!selectedFile) {
      setStatus("Choose an image.");
      return;
    }
    if (!user?.id) {
      setStatus("Sign in to upload player headshots.");
      return;
    }

    const previousRecord = records[selectedPersonId] || null;
    let uploadedRecord = null;
    try {
      setLoading(true);
      setStatus("Uploading...");
      const renderedImage = await renderCompressedImageBlob(selectedFile, { maxEdge: 1400, quality: 0.9 });
      uploadedRecord = await uploadPlayerHeadshotAsset({
        personId: selectedPersonId,
        label,
        originalFileName: selectedFile.name,
        blob: renderedImage.blob,
        contentType: renderedImage.contentType,
      });
      await persistRecords({
        ...records,
        [selectedPersonId]: uploadedRecord,
      });
      if (previousRecord) {
        await deleteUploadedPlayerHeadshotAsset(previousRecord);
      }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus(previousRecord ? "Headshot replaced." : "Headshot uploaded.");
    } catch (error) {
      if (uploadedRecord) {
        await deleteUploadedPlayerHeadshotAsset(uploadedRecord);
      }
      setStatus(error?.message || "Upload failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (record) => {
    if (!record?.personId || loading) return;
    try {
      setLoading(true);
      setStatus("Removing...");
      const nextRecords = { ...records };
      delete nextRecords[record.personId];
      await persistRecords(nextRecords);
      await deleteUploadedPlayerHeadshotAsset(record);
      if (selectedPersonId === record.personId) {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      setStatus("Headshot removed.");
    } catch (error) {
      setStatus(error?.message || "Unable to remove headshot.");
    } finally {
      setLoading(false);
    }
  };

  const selectRecord = (record) => {
    setPersonId(record.personId || "");
    setLabel(record.label || "");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className={styles.playerHeadshotPanel}>
      <div className={styles.playerHeadshotEditor}>
        <div className={styles.playerHeadshotPreview}>
          {selectedPersonId ? (
            <PlayerHeadshot
              personId={selectedPersonId}
              className={styles.playerHeadshotImage}
              alt={label || selectedPersonId}
              fallback={<div className={styles.playerHeadshotFallback}>No Image</div>}
            />
          ) : (
            <div className={styles.playerHeadshotFallback}>No Player</div>
          )}
        </div>

        <div className={styles.playerHeadshotForm}>
          <label className={styles.field}>
            <span>Player ID</span>
            <input
              value={personId}
              onChange={(event) => setPersonId(event.target.value)}
              placeholder="1642066"
              inputMode="numeric"
            />
          </label>
          <label className={styles.field}>
            <span>Name</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Player name"
            />
          </label>
          <label className={styles.field}>
            <span>Image</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
          </label>
          <div className={styles.playerHeadshotActions}>
            <button type="button" className={styles.primaryButton} disabled={loading} onClick={handleUpload}>
              {selectedRecord ? "Replace" : "Upload"}
            </button>
            {selectedRecord ? (
              <button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => handleRemove(selectedRecord)}>
                Remove
              </button>
            ) : null}
          </div>
          {status ? <div className={styles.noticeCard}>{status}</div> : null}
        </div>
      </div>

      <div className={styles.playerHeadshotList}>
        {sortedRecords.length ? sortedRecords.map((record) => (
          <div key={record.personId} className={styles.playerHeadshotRow}>
            <button type="button" className={styles.playerHeadshotRowButton} onClick={() => selectRecord(record)}>
              {record.url ? (
                <img className={styles.playerHeadshotThumb} src={record.url} alt={record.label || record.personId} />
              ) : (
                <span className={styles.playerHeadshotThumbFallback} />
              )}
              <span>
                <strong>{record.label || `Player ${record.personId}`}</strong>
                <span>{record.personId}</span>
              </span>
            </button>
            <button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => handleRemove(record)}>
              Remove
            </button>
          </div>
        )) : (
          <div className={styles.noticeCard}>
            {loading ? "Loading player headshots..." : "No player headshot overrides saved."}
          </div>
        )}
      </div>
    </div>
  );
}
