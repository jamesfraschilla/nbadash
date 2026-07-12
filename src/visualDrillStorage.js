import { supabase } from "./supabaseClient.js";

export const VISUAL_DRILL_IMAGE_BUCKET = "visual-drill-images";
export const VISUAL_DRILL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const IMAGE_FORMATS = {
  "image/jpeg": { contentType: "image/jpeg", extension: "jpg" },
  "image/png": { contentType: "image/png", extension: "png" },
  "image/webp": { contentType: "image/webp", extension: "webp" },
};

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
  const format = IMAGE_FORMATS[String(file?.type || "").toLowerCase()];
  if (!format) throw new Error("Use a PNG, JPG, or WebP image.");
  if (!file?.size) throw new Error("Choose a non-empty image.");
  if (file.size > VISUAL_DRILL_IMAGE_MAX_BYTES) throw new Error("Images must be 5 MB or smaller.");

  const id = crypto.randomUUID();
  const name = sanitizeVisualDrillImageName(file.name);
  const path = `${userId}/${id}--${name}.${format.extension}`;
  const { error } = await supabase.storage.from(VISUAL_DRILL_IMAGE_BUCKET).upload(path, file, {
    contentType: format.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;

  return {
    id,
    name: String(file.name || name).replace(/\.[^.]+$/, "") || name,
    path,
    url: await signedImageUrl(path),
    contentType: format.contentType,
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
