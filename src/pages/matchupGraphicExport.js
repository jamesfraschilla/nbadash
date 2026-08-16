import dinFontUrl from "../assets/fonts/DIN.ttf";
import dinAltFontUrl from "../assets/fonts/DINalt.ttf";
import slideBackgroundUrl from "../assets/graphics/slide-background.png";
import { playerHeadshotUrls, teamLogoUrl } from "../api.js";
import {
  buildNbaFallbackHeadshotUrl,
  pixelBuffersMatch,
} from "../nbaHeadshotFallback.js";

export const EXPORT_WIDTH = 1920;
export const EXPORT_HEIGHT = 1080;
export const BLACK = "#000000";
export const WHITE = "#ffffff";
const SHADOW = "rgba(0, 0, 0, 0.28)";
export const EXPORT_FONT_FAMILIES = {
  header: "\"DIN\"",
  body: "\"DINalt\", sans-serif",
};
export const TEAM_LOGO_EXPORT_BOX = Object.freeze({
  x: 83,
  y: 53,
  width: 140,
  height: 140,
});
const SUPABASE_FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "")}/functions/v1`
  : "";

const loadedImageCache = new Map();
const imageFingerprintCache = new WeakMap();
let exportFontsPromise = null;

function setCanvasFont(context, { weight, size, family }) {
  context.font = `${weight} ${size}px ${family}`;
}

function fitTextSize(context, text, maxWidth, baseSize, minSize, family, weight) {
  let size = baseSize;
  while (size > minSize) {
    setCanvasFont(context, { weight, size, family });
    if (context.measureText(text).width <= maxWidth) {
      return size;
    }
    size -= 0.5;
  }
  return minSize;
}

export function drawCenteredText(context, text, x, y, width, options) {
  const {
    size,
    minSize = size,
    family,
    weight,
    color,
    baseline = "top",
  } = options;
  const finalSize = fitTextSize(context, text, width, size, minSize, family, weight);
  setCanvasFont(context, { weight, size: finalSize, family });
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = baseline;
  context.fillText(text, x + width / 2, y);
  return finalSize;
}

export function makeCanvas(width, height, background) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  return { canvas, context };
}

export function drawContainBottom(context, source, targetX, targetY, targetWidth, targetHeight) {
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = targetX + (targetWidth - drawWidth) / 2;
  const drawY = targetY + targetHeight - drawHeight;
  context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
}

export function drawContain(context, source, targetX, targetY, targetWidth, targetHeight) {
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = targetX + (targetWidth - drawWidth) / 2;
  const drawY = targetY + (targetHeight - drawHeight) / 2;
  context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
}

function drawCover(context, source, targetX, targetY, targetWidth, targetHeight) {
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = targetX + (targetWidth - drawWidth) / 2;
  const drawY = targetY + (targetHeight - drawHeight) / 2;
  context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
}

function normalizeLastName(player) {
  const explicitLast = String(player?.familyName || "").trim();
  if (explicitLast) return explicitLast.toUpperCase();
  const fullName = String(player?.fullName || "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  return String(parts[parts.length - 1] || fullName || "PLAYER").toUpperCase();
}

function getPlayerExportLabel(player) {
  const jersey = String(player?.jerseyNum || "").trim().replace(/^#+\s*/, "");
  const lastName = normalizeLastName(player);
  return `${jersey ? `#${jersey} ` : ""}${lastName}`.trim();
}

export function buildPlayerHeadshotCandidates(player) {
  const customUrl = String(player?.headshotDataUrl || player?.headshotUrl || "").trim();
  if (customUrl) return [customUrl];
  const personId = String(player?.personId || "").trim();
  if (!personId) return [];
  const candidates = [
    ...playerHeadshotUrls(personId, player?.teamId),
    `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`,
  ].filter((url, index, urls) => url && urls.indexOf(url) === index);
  const isOfficialNbaHeadshot = (url) => /cdn\.nba\.com\/headshots\/nba\/latest\/(260x190|1040x760)\//i.test(String(url || ""));
  return [
    ...candidates.filter((url) => !isOfficialNbaHeadshot(url)),
    ...candidates.filter((url) => isOfficialNbaHeadshot(url) && String(url || "").includes("/1040x760/")),
    ...candidates.filter((url) => isOfficialNbaHeadshot(url) && !String(url || "").includes("/1040x760/")),
  ];
}

function buildProxyUrl(url) {
  const safeUrl = String(url || "").trim();
  if (!safeUrl || !SUPABASE_FUNCTIONS_BASE || !/^https?:\/\//i.test(safeUrl)) return safeUrl;
  return `${SUPABASE_FUNCTIONS_BASE}/export-image?url=${encodeURIComponent(safeUrl)}`;
}

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (loadedImageCache.has(url)) return loadedImageCache.get(url);

  const promise = new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (!value) loadedImageCache.delete(url);
      resolve(value);
    };
    const timeoutId = setTimeout(() => finish(null), 12_000);
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = url;
  });

  loadedImageCache.set(url, promise);
  return promise;
}

export function clearExportImageCache() {
  loadedImageCache.clear();
}

export async function loadFirstImage(urls) {
  for (const url of urls) {
    const image = await loadImage(buildProxyUrl(url));
    if (!image) continue;
    const fallbackUrl = buildNbaFallbackHeadshotUrl(url);
    if (fallbackUrl) {
      const fallbackImage = await loadImage(buildProxyUrl(fallbackUrl));
      if (fallbackImage && imagesMatch(image, fallbackImage)) continue;
    }
    return image;
  }
  return null;
}

export function loadExportBackgroundImage() {
  return loadImage(slideBackgroundUrl);
}

function imageFingerprint(image) {
  if (imageFingerprintCache.has(image)) return imageFingerprintCache.get(image);
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 24;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  imageFingerprintCache.set(image, pixels);
  return pixels;
}

function imagesMatch(left, right) {
  try {
    const leftWidth = left.naturalWidth || left.width;
    const leftHeight = left.naturalHeight || left.height;
    const rightWidth = right.naturalWidth || right.width;
    const rightHeight = right.naturalHeight || right.height;
    if (leftWidth !== rightWidth || leftHeight !== rightHeight) return false;
    return pixelBuffersMatch(imageFingerprint(left), imageFingerprint(right));
  } catch {
    return false;
  }
}

function drawArrow(context, centerX, startY, endY) {
  const headHeight = 28;
  const stemWidth = 14;
  context.save();
  context.fillStyle = WHITE;
  context.shadowColor = SHADOW;
  context.shadowBlur = 12;
  context.shadowOffsetY = 4;
  context.fillRect(centerX - stemWidth / 2, startY, stemWidth, endY - startY - headHeight);
  context.beginPath();
  context.moveTo(centerX, endY);
  context.lineTo(centerX - 26, endY - headHeight);
  context.lineTo(centerX + 26, endY - headHeight);
  context.closePath();
  context.fill();
  context.restore();
}

export function drawBackdrop(context, backgroundImage = null) {
  context.fillStyle = BLACK;
  context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

  if (backgroundImage) {
    drawCover(context, backgroundImage, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  }
}

function drawHeader(context) {
  context.save();
  context.shadowColor = SHADOW;
  context.shadowBlur = 24;
  context.shadowOffsetY = 6;
  drawCenteredText(context, "MATCH-UPS", 0, 96, EXPORT_WIDTH, {
    size: 122,
    minSize: 72,
    family: EXPORT_FONT_FAMILIES.header,
    weight: 700,
    color: WHITE,
  });
  context.restore();
}

function drawPlayerRow(context, players, images, headshotY, labelY) {
  const leftPadding = 72;
  const usableWidth = EXPORT_WIDTH - leftPadding * 2;
  const slotWidth = usableWidth / 5;
  const headshotWidth = 282;
  const headshotHeight = 190;

  (Array.isArray(players) ? players : []).forEach((player, index) => {
    if (!player || typeof player !== "object") return;
    const centerX = leftPadding + slotWidth * index + slotWidth / 2;
    const headshotX = centerX - headshotWidth / 2;
    const image = images[index];
    const label = getPlayerExportLabel(player);

    if (image) drawContainBottom(context, image, headshotX, headshotY, headshotWidth, headshotHeight);

    context.save();
    context.shadowColor = SHADOW;
    context.shadowBlur = 14;
    context.shadowOffsetY = 5;
    drawCenteredText(context, label, centerX - slotWidth / 2, labelY, slotWidth, {
      size: 42,
      minSize: 24,
      family: EXPORT_FONT_FAMILIES.body,
      weight: 700,
      color: WHITE,
    });
    context.restore();
  });
}

export function drawLogo(context, logoImage) {
  if (!logoImage) return;
  drawContain(
    context,
    logoImage,
    TEAM_LOGO_EXPORT_BOX.x,
    TEAM_LOGO_EXPORT_BOX.y,
    TEAM_LOGO_EXPORT_BOX.width,
    TEAM_LOGO_EXPORT_BOX.height
  );
}

function buildFileName({ leftTeam, rightTeam }) {
  const left = String(leftTeam?.tricode || leftTeam?.teamAbbreviation || leftTeam?.fullName || "LEFT")
    .trim()
    .replace(/\s+/g, "-");
  const right = String(rightTeam?.tricode || rightTeam?.teamAbbreviation || rightTeam?.fullName || "RIGHT")
    .trim()
    .replace(/\s+/g, "-");
  return `${left}-vs-${right}-matchups.png`.toLowerCase();
}

export function downloadCanvas(canvas, fileName) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}

export function ensureMatchupExportFonts() {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return Promise.resolve();
  }
  if (exportFontsPromise) return exportFontsPromise;

  const waitForFont = async (family) => {
    if (!document.fonts?.load || !document.fonts?.check) return;
    await document.fonts.load(`16px "${family}"`);
    if (document.fonts.ready) {
      await document.fonts.ready;
    }
    if (!document.fonts.check(`16px "${family}"`)) {
      throw new Error(`${family} font did not finish loading.`);
    }
  };

  const loadFont = async (family, url) => {
    const alreadyLoaded = Array.from(document.fonts || []).some(
      (fontFace) => fontFace.family === family && fontFace.status === "loaded"
    );
    if (!alreadyLoaded) {
      const fontFace = new FontFace(family, `url(${url})`);
      await fontFace.load();
      document.fonts.add(fontFace);
    }
    await waitForFont(family);
  };

  exportFontsPromise = Promise.all([
    loadFont("DIN", dinFontUrl),
    loadFont("DINalt", dinAltFontUrl),
  ]).then(() => undefined);

  return exportFontsPromise;
}

export async function renderMatchupGraphicCanvas({
  league = "nba",
  leftPlayers,
  rightPlayers,
  logoTeamId,
  width = EXPORT_WIDTH,
  height = EXPORT_HEIGHT,
}) {
  await ensureMatchupExportFonts();
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  const resolvedLeftPlayers = Array.isArray(leftPlayers) ? leftPlayers : [];
  const resolvedRightPlayers = Array.isArray(rightPlayers) ? rightPlayers : [];

  const [leftImages, rightImages, logoImage, backgroundImage] = await Promise.all([
    Promise.all(resolvedLeftPlayers.map((player) => loadFirstImage(buildPlayerHeadshotCandidates(player)))),
    Promise.all(resolvedRightPlayers.map((player) => loadFirstImage(buildPlayerHeadshotCandidates(player)))),
    loadImage(logoTeamId ? buildProxyUrl(teamLogoUrl(logoTeamId, league)) : null),
    loadExportBackgroundImage(),
  ]);

  const outputWidth = Math.max(1, Math.round(Number(width) || EXPORT_WIDTH));
  const outputHeight = Math.max(1, Math.round(Number(height) || EXPORT_HEIGHT));
  const { canvas, context } = makeCanvas(outputWidth, outputHeight, BLACK);
  if (outputWidth !== EXPORT_WIDTH || outputHeight !== EXPORT_HEIGHT) {
    context.scale(outputWidth / EXPORT_WIDTH, outputHeight / EXPORT_HEIGHT);
  }
  drawBackdrop(context, backgroundImage);
  drawHeader(context);
  drawLogo(context, logoImage);
  drawPlayerRow(context, resolvedLeftPlayers, leftImages, 286, 484);
  drawPlayerRow(context, resolvedRightPlayers, rightImages, 700, 896);

  const leftPadding = 72;
  const usableWidth = EXPORT_WIDTH - leftPadding * 2;
  const slotWidth = usableWidth / 5;
  Array.from({ length: 5 }, (_, index) => {
    const centerX = leftPadding + slotWidth * index + slotWidth / 2;
    drawArrow(context, centerX, 566, 640);
  });

  return canvas;
}

export async function exportMatchupGraphic({ league = "nba", leftPlayers, rightPlayers, logoTeamId, leftTeam, rightTeam }) {
  const canvas = await renderMatchupGraphicCanvas({
    league,
    leftPlayers,
    rightPlayers,
    logoTeamId,
  });
  downloadCanvas(canvas, buildFileName({ leftTeam, rightTeam }));
}
