import { supabase } from "./supabaseClient.js";

export const GRAPHIC_HEADSHOT_BUCKET = "graphic-headshots";
export const GRAPHIC_HEADSHOT_SOURCE_LIMIT_BYTES = 10 * 1024 * 1024;
export const GRAPHIC_HEADSHOT_OUTPUT_LIMIT_BYTES = 5 * 1024 * 1024;
export const GRAPHIC_HEADSHOT_MAX_DIMENSION = 1600;
export const GRAPHIC_HEADSHOT_SOURCE_MAX_DIMENSION = 8192;
export const GRAPHIC_HEADSHOT_SOURCE_MAX_PIXELS = 40_000_000;

export function validateGraphicHeadshotFile(file) {
  if (!file) throw new Error("Choose a PNG headshot.");
  if (file.type !== "image/png") throw new Error("Use a PNG headshot.");
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error("The selected headshot is empty.");
  if (file.size > GRAPHIC_HEADSHOT_SOURCE_LIMIT_BYTES) {
    throw new Error("Headshots must be 10 MB or smaller.");
  }
  return true;
}

export function validateGraphicHeadshotDimensions(width, height) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isInteger(safeWidth) || !Number.isInteger(safeHeight) || safeWidth <= 0 || safeHeight <= 0) {
    throw new Error("The selected PNG has invalid dimensions.");
  }
  if (
    safeWidth > GRAPHIC_HEADSHOT_SOURCE_MAX_DIMENSION
    || safeHeight > GRAPHIC_HEADSHOT_SOURCE_MAX_DIMENSION
    || safeWidth * safeHeight > GRAPHIC_HEADSHOT_SOURCE_MAX_PIXELS
  ) {
    throw new Error("The selected PNG dimensions are too large.");
  }
  return true;
}

async function readPngDimensions(file) {
  const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) {
    throw new Error("The selected file is not a valid PNG.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

async function loadImage(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected PNG could not be decoded."));
    };
    image.src = url;
  });
}

async function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The headshot could not be resized."));
    }, "image/png");
  });
}

export async function prepareGraphicHeadshot(file) {
  validateGraphicHeadshotFile(file);
  const sourceDimensions = await readPngDimensions(file);
  validateGraphicHeadshotDimensions(sourceDimensions.width, sourceDimensions.height);
  const image = await loadImage(file);
  const width = Number(image.width || image.naturalWidth || 0);
  const height = Number(image.height || image.naturalHeight || 0);
  validateGraphicHeadshotDimensions(width, height);
  const scale = Math.min(1, GRAPHIC_HEADSHOT_MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Headshot resizing is unavailable in this browser.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  const blob = await canvasToPngBlob(canvas);
  canvas.width = 1;
  canvas.height = 1;
  if (blob.size > GRAPHIC_HEADSHOT_OUTPUT_LIMIT_BYTES) {
    throw new Error("The resized headshot is still over 5 MB. Use a simpler or smaller PNG.");
  }
  return blob;
}

function safePathPart(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

export async function uploadGraphicHeadshot({ userId, file, toolType, slotKey, previousPath = "" }) {
  if (!supabase || !userId) throw new Error("Sign in before uploading a custom headshot.");
  const blob = await prepareGraphicHeadshot(file);
  const path = [
    String(userId),
    safePathPart(toolType, "graphic"),
    `${safePathPart(slotKey, "player")}-${crypto.randomUUID()}.png`,
  ].join("/");
  const { error } = await supabase.storage.from(GRAPHIC_HEADSHOT_BUCKET).upload(path, blob, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(GRAPHIC_HEADSHOT_BUCKET).getPublicUrl(path);
  const publicUrl = String(data?.publicUrl || "").trim();
  if (!publicUrl) throw new Error("Supabase did not return the uploaded headshot URL.");

  const oldPath = String(previousPath || "").trim();
  if (oldPath && oldPath.startsWith(`${userId}/`) && oldPath !== path) {
    void supabase.storage.from(GRAPHIC_HEADSHOT_BUCKET).remove([oldPath]);
  }
  return { storagePath: path, publicUrl };
}

export function getGraphicHeadshotPublicUrl(storagePath) {
  const path = String(storagePath || "").trim();
  if (!supabase || !path) return "";
  const { data } = supabase.storage.from(GRAPHIC_HEADSHOT_BUCKET).getPublicUrl(path);
  return String(data?.publicUrl || "").trim();
}

export async function uploadLegacyGraphicHeadshot({ userId, dataUrl, toolType, slotKey }) {
  const value = String(dataUrl || "").trim();
  if (!/^data:image\/png;base64,/i.test(value)) {
    throw new Error("A legacy custom headshot is not a valid PNG and must be replaced.");
  }
  const approximateBytes = Math.floor((value.length - value.indexOf(",") - 1) * 0.75);
  if (approximateBytes > GRAPHIC_HEADSHOT_SOURCE_LIMIT_BYTES) {
    throw new Error("A legacy custom headshot is over 10 MB and must be replaced.");
  }
  const response = await fetch(value);
  const blob = await response.blob();
  return uploadGraphicHeadshot({ userId, file: blob, toolType, slotKey });
}

export async function deleteGraphicHeadshot(userId, storagePath) {
  const path = String(storagePath || "").trim();
  if (!supabase || !userId || !path.startsWith(`${userId}/`)) return;
  const { error } = await supabase.storage.from(GRAPHIC_HEADSHOT_BUCKET).remove([path]);
  if (error) throw error;
}
