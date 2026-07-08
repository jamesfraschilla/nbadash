import { playerHeadshotUrls } from "../api.js";

export const DEPTH_CHART_EXPORT_SIZE = 400;
const DEPTH_CHART_EXPORT_SCALE = 4;

const COURT_FILL = "#c9d4e8";
const COURT_LINE = "#f8fbff";
const CELL_FILL = "#0e2b55";
const CELL_OUTLINE = "#24456f";
const NAVY = "#071f41";
const RED = "#e31837";
const WHITE = "#f8fafc";
const PLATE_FILL = "rgba(42, 48, 58, 0.74)";
const PLATE_OUTLINE = "rgba(248, 250, 252, 0.4)";
const SUPABASE_FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "")}/functions/v1`
  : "";

const loadedImageCache = new Map();
const NAME_SUFFIXES = new Set([
  "JR",
  "JUNIOR",
  "SR",
  "SENIOR",
  "II",
  "III",
  "IV",
  "V",
  "VI",
]);

function setFont(context, size, weight = 700) {
  context.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
}

function fitTextSize(context, text, maxWidth, baseSize, minSize, weight = 700) {
  let size = baseSize;
  while (size > minSize) {
    setFont(context, size, weight);
    if (context.measureText(text).width <= maxWidth) return size;
    size -= 0.5;
  }
  return minSize;
}

function drawCenteredText(context, text, x, y, width, options) {
  const safeText = String(text || "").trim();
  if (!safeText) return options.size;
  const size = fitTextSize(
    context,
    safeText,
    width,
    options.size,
    options.minSize ?? options.size,
    options.weight ?? 700
  );
  setFont(context, size, options.weight ?? 700);
  context.fillStyle = options.color || WHITE;
  context.textAlign = "center";
  context.textBaseline = options.baseline || "middle";
  if (options.strokeColor && options.strokeWidth) {
    context.lineWidth = options.strokeWidth;
    context.strokeStyle = options.strokeColor;
    context.strokeText(safeText, x + width / 2, y);
  }
  context.fillText(safeText, x + width / 2, y);
  return size;
}

function drawRoundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawRoundedFill(context, x, y, width, height, radius, fill, outline = null) {
  drawRoundRect(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (outline) {
    context.strokeStyle = outline;
    context.lineWidth = 1;
    context.stroke();
  }
}

function getLastName(slot) {
  const explicit = String(slot?.lastName || "").trim();
  if (explicit && !isNameSuffix(explicit)) return explicit.toUpperCase();
  const fullName = String(slot?.fullName || "").trim();
  const parsed = parseLastName(fullName);
  return String(parsed || explicit || "").toUpperCase();
}

function normalizeNameToken(value) {
  return String(value || "").trim().replace(/[.,]/g, "").toUpperCase();
}

function isNameSuffix(value) {
  return NAME_SUFFIXES.has(normalizeNameToken(value));
}

function parseLastName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && isNameSuffix(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts[parts.length - 1] || "";
}

function getNumberLabel(slot) {
  const jersey = String(slot?.jerseyNum || slot?.number || "").trim();
  return jersey ? `#${jersey}` : "";
}

function buildHeadshotCandidates(slot) {
  const customUrl = String(slot?.headshotDataUrl || "").trim();
  if (customUrl) return [customUrl];
  const personId = String(slot?.personId || "").trim();
  if (!personId) return [];
  const candidates = playerHeadshotUrls(personId, slot?.teamId);
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
  const safeUrl = String(url || "").trim();
  if (!safeUrl) return Promise.resolve(null);
  if (loadedImageCache.has(safeUrl)) return loadedImageCache.get(safeUrl);

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = safeUrl;
  });

  loadedImageCache.set(safeUrl, promise);
  return promise;
}

async function loadFirstImage(urls) {
  for (const url of urls) {
    const image = await loadImage(buildProxyUrl(url));
    if (image) return image;
  }
  return null;
}

function drawContainBottom(context, image, x, y, width, height) {
  if (!image) return;
  const sourceWidth = image.width || image.naturalWidth;
  const sourceHeight = image.height || image.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + height - drawHeight;
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawNbaHalfCourt(context) {
  const courtHeight = 280;
  const courtWidth = Math.round((courtHeight * 50) / 47);
  const courtLeft = (DEPTH_CHART_EXPORT_SIZE - courtWidth) / 2;
  const courtTop = 3;
  const scale = courtWidth / 50;

  const point = (xFeet, yFeet) => ({
    x: courtLeft + (xFeet + 25) * scale,
    y: courtTop + yFeet * scale,
  });

  const arc = (xFeet, yFeet, radiusFeet, start, end, anticlockwise = false) => {
    const center = point(xFeet, yFeet);
    context.beginPath();
    context.arc(center.x, center.y, radiusFeet * scale, start, end, anticlockwise);
    context.stroke();
  };

  const line = (points) => {
    context.beginPath();
    points.forEach(([xFeet, yFeet], index) => {
      const mapped = point(xFeet, yFeet);
      if (index === 0) context.moveTo(mapped.x, mapped.y);
      else context.lineTo(mapped.x, mapped.y);
    });
    context.stroke();
  };

  context.save();
  context.fillStyle = COURT_FILL;
  context.strokeStyle = COURT_LINE;
  context.lineWidth = 1.6;
  context.fillRect(courtLeft, courtTop, courtWidth, courtHeight);
  context.strokeRect(courtLeft, courtTop, courtWidth, courtHeight);

  line([[-25, 47], [25, 47]]);
  line([[-8, 0], [-8, 19], [8, 19], [8, 0]]);

  arc(0, 19, 6, Math.PI, Math.PI * 2);
  for (let angle = 0; angle < Math.PI; angle += Math.PI / 10) {
    arc(0, 19, 6, angle, Math.min(angle + Math.PI / 24, Math.PI));
  }

  arc(0, 5.25, 4, 0, Math.PI);
  line([[-3, 4], [3, 4]]);
  const rim = point(0, 5.25);
  context.beginPath();
  context.arc(rim.x, rim.y, 0.75 * scale, 0, Math.PI * 2);
  context.stroke();

  const cornerX = 22;
  const radiusThree = 23.75;
  const rimY = 5.25;
  const yIntersect = rimY + Math.sqrt(radiusThree ** 2 - cornerX ** 2);
  line([[-cornerX, 0], [-cornerX, yIntersect]]);
  line([[cornerX, 0], [cornerX, yIntersect]]);
  const start = Math.atan2(yIntersect - rimY, cornerX);
  const end = Math.PI - start;
  arc(0, rimY, radiusThree, start, end);

  arc(0, 47, 6, Math.PI, Math.PI * 2);

  [-1, 1].forEach((side) => {
    [7, 8.5, 11, 14].forEach((yFeet) => {
      line([[side * 8, yFeet], [side * 9.2, yFeet]]);
    });
  });

  context.restore();

  return { point };
}

function drawStarterNamePlate(context, x, y, slot) {
  const number = getNumberLabel(slot);
  const lastName = getLastName(slot);
  if (!number && !lastName) return;

  const maxWidth = 89;
  const numberSize = fitTextSize(context, number, maxWidth - 6, 6.5, 4.5);
  const lastSize = fitTextSize(context, lastName, maxWidth - 6, 11.5, 6.5);
  setFont(context, numberSize, 700);
  const numberWidth = context.measureText(number).width;
  setFont(context, lastSize, 700);
  const lastWidth = context.measureText(lastName).width;
  const plateWidth = Math.min(maxWidth, Math.max(52, numberWidth + 12, lastWidth + 12));
  const plateHeight = 21;
  const plateX = x - plateWidth / 2;

  context.save();
  drawRoundedFill(context, plateX, y, plateWidth, plateHeight, 3, PLATE_FILL, PLATE_OUTLINE);
  drawCenteredText(context, number, plateX + 3, y + 6.6, plateWidth - 6, {
    size: numberSize,
    minSize: numberSize,
    color: WHITE,
    baseline: "middle",
  });
  drawCenteredText(context, lastName, plateX + 3, y + 15.2, plateWidth - 6, {
    size: lastSize,
    minSize: lastSize,
    color: WHITE,
    baseline: "middle",
  });
  context.restore();
}

function drawStarter(context, slot, image, courtPoint) {
  const positions = {
    "1": [0, 40.8],
    "2": [-18.8, 31],
    "3": [18.8, 31],
    "4": [0, 22.5],
    "5": [0, 8.8],
  };
  const mapped = courtPoint(...(positions[slot.position] || [0, 0]));
  const headshotHeight = 49;
  const headshotWidth = 70;

  context.save();
  setFont(context, 10, 700);
  context.fillStyle = RED;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(slot.position, mapped.x - 31, mapped.y - 33);
  if (image) {
    drawContainBottom(
      context,
      image,
      mapped.x - headshotWidth / 2,
      mapped.y - 32,
      headshotWidth,
      headshotHeight
    );
  }
  drawStarterNamePlate(context, mapped.x, mapped.y + 21, slot);
  context.restore();
}

function drawBenchCellName(context, slot, x, y, width, height) {
  const number = getNumberLabel(slot);
  const lastName = getLastName(slot);
  drawCenteredText(context, number, x + 3, y + 9.5, width - 6, {
    size: 7.5,
    minSize: 5,
    color: WHITE,
    baseline: "middle",
  });
  drawCenteredText(context, lastName, x + 3, y + 23.5, width - 6, {
    size: 13.5,
    minSize: 7,
    color: WHITE,
    baseline: "middle",
  });
}

function drawBenchRows(context, slotsById) {
  const left = 1;
  const gap = 2;
  const columnWidth = (DEPTH_CHART_EXPORT_SIZE - left * 2 - gap * 4) / 5;
  const headerY = 298;
  const rowTop = 314;
  const rowHeight = 35;
  const rowGap = 5;

  for (let position = 1; position <= 5; position += 1) {
    const x = left + (position - 1) * (columnWidth + gap);
    drawCenteredText(context, String(position), x, headerY + 6, columnWidth, {
      size: 10,
      minSize: 10,
      color: WHITE,
      strokeColor: NAVY,
      strokeWidth: 1.2,
      baseline: "middle",
    });
  }

  [1, 2].forEach((depthIndex, rowIndex) => {
    const y = rowTop + rowIndex * (rowHeight + rowGap);
    for (let position = 1; position <= 5; position += 1) {
      const x = left + (position - 1) * (columnWidth + gap);
      const slot = slotsById[`bench-${depthIndex}-${position}`] || {};
      context.save();
      context.fillStyle = CELL_FILL;
      context.strokeStyle = CELL_OUTLINE;
      context.lineWidth = 1;
      context.fillRect(x, y, columnWidth, rowHeight);
      context.strokeRect(x, y, columnWidth, rowHeight);
      drawBenchCellName(context, slot, x, y, columnWidth, rowHeight);
      context.restore();
    }
  });
}

function getSlotsById(slots) {
  return (Array.isArray(slots) ? slots : []).reduce((accumulator, slot) => {
    accumulator[slot.id] = slot;
    return accumulator;
  }, {});
}

export async function renderDepthChartGraphic(canvas, { slots = [], scale = 1 } = {}) {
  if (!canvas) return null;
  const renderScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const starters = [1, 2, 3, 4, 5].map((position) => (
    slots.find((slot) => slot.id === `starter-${position}`) || { id: `starter-${position}`, position: String(position) }
  ));
  const images = await Promise.all(starters.map((slot) => loadFirstImage(buildHeadshotCandidates(slot))));

  const drawGraphic = (targetContext) => {
    const { point } = drawNbaHalfCourt(targetContext);
    starters.forEach((slot, index) => {
      drawStarter(targetContext, slot, images[index], point);
    });
    drawBenchRows(targetContext, getSlotsById(slots));
  };

  canvas.width = DEPTH_CHART_EXPORT_SIZE;
  canvas.height = DEPTH_CHART_EXPORT_SIZE;
  const context = canvas.getContext("2d");
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, DEPTH_CHART_EXPORT_SIZE, DEPTH_CHART_EXPORT_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (renderScale === 1) {
    drawGraphic(context);
    return canvas;
  }

  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = DEPTH_CHART_EXPORT_SIZE * renderScale;
  offscreenCanvas.height = DEPTH_CHART_EXPORT_SIZE * renderScale;
  const offscreenContext = offscreenCanvas.getContext("2d");
  offscreenContext.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  offscreenContext.clearRect(0, 0, DEPTH_CHART_EXPORT_SIZE, DEPTH_CHART_EXPORT_SIZE);
  offscreenContext.imageSmoothingEnabled = true;
  offscreenContext.imageSmoothingQuality = "high";
  drawGraphic(offscreenContext);

  context.drawImage(offscreenCanvas, 0, 0, DEPTH_CHART_EXPORT_SIZE, DEPTH_CHART_EXPORT_SIZE);
  return canvas;
}

export function downloadCanvas(canvas, fileName) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}

export async function exportDepthChartGraphic({ slots, fileName = "depth-chart.png" }) {
  const canvas = document.createElement("canvas");
  await renderDepthChartGraphic(canvas, { slots, scale: DEPTH_CHART_EXPORT_SCALE });
  downloadCanvas(canvas, fileName);
}
