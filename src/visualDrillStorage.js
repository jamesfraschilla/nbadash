import { supabase } from "./supabaseClient.js";

export const VISUAL_DRILL_IMAGE_BUCKET = "visual-drill-images";
export const VISUAL_DRILL_IMAGE_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES = 512 * 1024;
export const VISUAL_DRILL_IMAGE_MAX_DIMENSION = 900;
const VISUAL_DRILL_IMAGE_CROP_PADDING_RATIO = 0.1;

const IMAGE_FORMATS = {
  "image/jpeg": { contentType: "image/jpeg", extension: "jpg" },
  "image/png": { contentType: "image/png", extension: "png" },
  "image/webp": { contentType: "image/webp", extension: "webp" },
};

const COMPRESSION_QUALITIES = [0.82, 0.72, 0.62, 0.52];

function requireStorage(userId) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!userId) throw new Error("Sign in before uploading images.");
}

export function sanitizeVisualDrillImageName(value) {
  const name = String(value || "image")
    .replace(/\.[^.]+$/, "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return name || "image";
}

export function visualDrillImageDisplayName(path) {
  const fileName = String(path || "").split("/").pop() || "Image";
  return fileName
    .replace(/^[0-9a-f-]{36}--/i, "")
    .replace(/\.[^.]+$/, "")
    .replace(/-/g, " ")
    .trim() || "Image";
}

function formatStorageSize(bytes) {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function canvasToBlob(canvas, contentType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), contentType, quality);
  });
}

function loadImageSource(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  if (
    typeof Image === "undefined"
    || typeof URL === "undefined"
    || typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read this image."));
    };
    image.src = objectUrl;
  });
}

function imageSourceSize(imageSource) {
  return {
    width: imageSource.width || imageSource.naturalWidth || 0,
    height: imageSource.height || imageSource.naturalHeight || 0,
  };
}

function pixelOffset(width, x, y) {
  return (y * width + x) * 4;
}

function readPixel(data, width, x, y) {
  const offset = pixelOffset(width, x, y);
  return {
    red: data[offset] || 0,
    green: data[offset + 1] || 0,
    blue: data[offset + 2] || 0,
    alpha: data[offset + 3] || 0,
  };
}

function colorDistanceSquared(left, right) {
  return ((left.red - right.red) ** 2)
    + ((left.green - right.green) ** 2)
    + ((left.blue - right.blue) ** 2);
}

function averageColors(colors) {
  return colors.reduce((acc, color) => ({
    red: acc.red + color.red / colors.length,
    green: acc.green + color.green / colors.length,
    blue: acc.blue + color.blue / colors.length,
    alpha: acc.alpha + color.alpha / colors.length,
  }), { red: 0, green: 0, blue: 0, alpha: 0 });
}

function inferUniformBackgroundColor(data, width, height, alphaThreshold) {
  const samples = [
    readPixel(data, width, 0, 0),
    readPixel(data, width, width - 1, 0),
    readPixel(data, width, 0, height - 1),
    readPixel(data, width, width - 1, height - 1),
  ];
  if (samples.some((sample) => sample.alpha <= alphaThreshold)) return null;

  const background = averageColors(samples);
  const maxCornerDistance = Math.max(
    ...samples.map((sample) => colorDistanceSquared(sample, background))
  );
  return maxCornerDistance <= 24 ** 2 ? background : null;
}

function findBoundsByPixelTest(width, height, isContentPixel) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isContentPixel(x, y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function isFullCanvasBounds(bounds, width, height) {
  return bounds?.x === 0 && bounds?.y === 0 && bounds.width === width && bounds.height === height;
}

export function findVisualDrillImageContentBounds(imageData, width, height, alphaThreshold = 8) {
  const data = imageData?.data || imageData;
  if (!data || !width || !height) return null;

  const alphaBounds = findBoundsByPixelTest(width, height, (x, y) => {
    const alpha = data[pixelOffset(width, x, y) + 3] || 0;
    return alpha > alphaThreshold;
  });
  if (alphaBounds && !isFullCanvasBounds(alphaBounds, width, height)) {
    return alphaBounds;
  }

  const background = inferUniformBackgroundColor(data, width, height, alphaThreshold);
  if (!background) return alphaBounds;

  const backgroundBounds = findBoundsByPixelTest(width, height, (x, y) => {
    const pixel = readPixel(data, width, x, y);
    if (pixel.alpha <= alphaThreshold) return false;
    return colorDistanceSquared(pixel, background) > 34 ** 2;
  });
  return backgroundBounds || alphaBounds;
}

function trimTransparentCanvasPadding(canvas, context) {
  let bounds = null;
  try {
    bounds = findVisualDrillImageContentBounds(
      context.getImageData(0, 0, canvas.width, canvas.height),
      canvas.width,
      canvas.height
    );
  } catch {
    return canvas;
  }

  if (!bounds) return canvas;
  if (bounds.x === 0 && bounds.y === 0 && bounds.width === canvas.width && bounds.height === canvas.height) {
    return canvas;
  }

  const padding = Math.ceil(Math.max(bounds.width, bounds.height) * VISUAL_DRILL_IMAGE_CROP_PADDING_RATIO);
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = bounds.width + padding * 2;
  trimmedCanvas.height = bounds.height + padding * 2;
  const trimmedContext = trimmedCanvas.getContext("2d", { alpha: true });
  if (!trimmedContext) return canvas;
  trimmedContext.drawImage(
    canvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    padding,
    padding,
    bounds.width,
    bounds.height
  );
  return trimmedCanvas;
}

function validateImageFile(file) {
  const format = IMAGE_FORMATS[String(file?.type || "").toLowerCase()];
  if (!format) throw new Error("Use a PNG, JPG, or WebP image.");
  if (!file?.size) throw new Error("Choose a non-empty image.");
  if (file.size > VISUAL_DRILL_IMAGE_MAX_SOURCE_BYTES) {
    throw new Error(`Images must be ${formatStorageSize(VISUAL_DRILL_IMAGE_MAX_SOURCE_BYTES)} or smaller before compression.`);
  }
  return format;
}

export async function prepareVisualDrillImageUpload(file) {
  const originalFormat = validateImageFile(file);
  const fallbackUpload = {
    body: file,
    contentType: originalFormat.contentType,
    extension: originalFormat.extension,
  };

  if (typeof document === "undefined") {
    if (file.size <= VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES) return fallbackUpload;
    throw new Error(`Use a smaller image. Visual Drill uploads are capped at ${formatStorageSize(VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES)}.`);
  }

  let imageSource;
  try {
    imageSource = await loadImageSource(file);
  } catch {
    if (file.size <= VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES) return fallbackUpload;
    throw new Error("Unable to compress this image. Use a smaller PNG, JPG, or WebP image.");
  }
  if (!imageSource) {
    if (file.size <= VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES) return fallbackUpload;
    throw new Error(`Use a smaller image. Visual Drill uploads are capped at ${formatStorageSize(VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES)}.`);
  }

  try {
    const { width: sourceWidth, height: sourceHeight } = imageSourceSize(imageSource);
    if (!sourceWidth || !sourceHeight) throw new Error("Unable to read this image size.");
    const scale = Math.min(1, VISUAL_DRILL_IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Unable to prepare this image for upload.");
    context.drawImage(imageSource, 0, 0, canvas.width, canvas.height);
    const outputCanvas = trimTransparentCanvasPadding(canvas, context);

    let smallestBlob = null;
    for (const quality of COMPRESSION_QUALITIES) {
      const blob = await canvasToBlob(outputCanvas, "image/webp", quality);
      if (!blob) continue;
      if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
      if (blob.size <= VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES) {
        return { body: blob, contentType: "image/webp", extension: "webp" };
      }
    }

    if (file.size <= VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES && (!smallestBlob || file.size <= smallestBlob.size)) return fallbackUpload;
    throw new Error(`Use a smaller image. Compressed uploads are capped at ${formatStorageSize(VISUAL_DRILL_IMAGE_MAX_UPLOAD_BYTES)}.`);
  } finally {
    imageSource.close?.();
  }
}

async function signedImageUrl(path) {
  if (!supabase || !path) return "";
  const { data, error } = await supabase.storage
    .from(VISUAL_DRILL_IMAGE_BUCKET)
    .createSignedUrl(path, 24 * 60 * 60);
  if (error) throw error;
  return String(data?.signedUrl || "").trim();
}

export async function uploadVisualDrillImage(userId, file) {
  requireStorage(userId);
  const upload = await prepareVisualDrillImageUpload(file);

  const id = crypto.randomUUID();
  const name = sanitizeVisualDrillImageName(file.name);
  const path = `${userId}/${id}--${name}.${upload.extension}`;
  const { error } = await supabase.storage.from(VISUAL_DRILL_IMAGE_BUCKET).upload(path, upload.body, {
    contentType: upload.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;

  return {
    id,
    name: String(file.name || name).replace(/\.[^.]+$/, "") || name,
    path,
    url: await signedImageUrl(path),
    contentType: upload.contentType,
  };
}

export async function listVisualDrillImages(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.storage
    .from(VISUAL_DRILL_IMAGE_BUCKET)
    .list(userId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw error;
  const files = (data || [])
    .filter((file) => file?.name && file.name !== ".emptyFolderPlaceholder");
  return Promise.all(files.map(async (file) => {
    const path = `${userId}/${file.name}`;
    return {
      id: String(file.name).split("--")[0],
      name: visualDrillImageDisplayName(path),
      path,
      url: await signedImageUrl(path),
      contentType: String(file?.metadata?.mimetype || ""),
    };
  }));
}

export async function deleteVisualDrillImage(userId, image) {
  requireStorage(userId);
  const path = String(image?.path || "").trim();
  if (!path.startsWith(`${userId}/`)) throw new Error("This image does not belong to the signed-in user.");
  const { error } = await supabase.storage.from(VISUAL_DRILL_IMAGE_BUCKET).remove([path]);
  if (error) throw error;
}
