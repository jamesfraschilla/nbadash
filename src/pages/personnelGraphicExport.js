import fireTagUrl from "../assets/personnel/fire.png";
import coldTagUrl from "../assets/personnel/cold.png";
import drivesRightTagUrl from "../assets/personnel/drives-right.png";
import drivesLeftTagUrl from "../assets/personnel/drives-left.png";
import { teamLogoUrl } from "../api.js";
import {
  PERSONNEL_THREE_POINT_COLOR_OPTIONS,
  calculateThreePointAttemptRatio,
  formatPersonnelStatValue,
} from "../personnelGraphic.js";
import {
  BLACK,
  EXPORT_FONT_FAMILIES,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  WHITE,
  buildPlayerHeadshotCandidates,
  downloadCanvas,
  drawBackdrop,
  drawCenteredText,
  drawContain,
  drawContainBottom,
  drawLogo,
  ensureMatchupExportFonts,
  loadFirstImage,
  makeCanvas,
} from "./matchupGraphicExport.js";

const STAT_LABELS = {
  ppg: "PPG",
  rpg: "RPG",
  threePointPercentage: "3P%",
  apg: "APG",
  bpg: "BPG",
  spg: "SPG",
  fta: "FTA",
};

const THREE_POINT_COLORS = Object.fromEntries(
  PERSONNEL_THREE_POINT_COLOR_OPTIONS.map((option) => [option.key, option.color])
);

const TAG_ASSET_URLS = {
  fire: fireTagUrl,
  cold: coldTagUrl,
  drives_right: drivesRightTagUrl,
  drives_left: drivesLeftTagUrl,
};

const PERSONNEL_LAYOUT = {
  headshot: { x: 560, y: 68, width: 800, height: 412 },
  name: { x: 455, y: 500, width: 1010 },
  statsBox: { x: 515, y: 620, width: 890, height: 190 },
  threePointBar: { labelX: 497, x: 577, y: 830, width: 767, height: 42 },
  tags: { y: 906, height: 78 },
};

function getThreePointRatio(stats) {
  return calculateThreePointAttemptRatio(stats);
}

function normalizeLastName(player) {
  const familyName = String(player?.familyName || "").trim();
  if (familyName) return familyName.toUpperCase();
  const parts = String(player?.fullName || "PLAYER").trim().split(/\s+/).filter(Boolean);
  return String(parts[parts.length - 1] || "PLAYER").toUpperCase();
}

function playerLabel(player) {
  const jersey = String(player?.jerseyNum || "").trim().replace(/^#+\s*/, "");
  return `${jersey ? `#${jersey} ` : ""}${normalizeLastName(player)}`;
}

function drawPlayerName(context, player) {
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.34)";
  context.shadowBlur = 14;
  context.shadowOffsetY = 5;
  drawCenteredText(
    context,
    playerLabel(player),
    PERSONNEL_LAYOUT.name.x,
    PERSONNEL_LAYOUT.name.y,
    PERSONNEL_LAYOUT.name.width,
    {
      size: 132,
      minSize: 72,
      family: EXPORT_FONT_FAMILIES.header,
      weight: 700,
      color: WHITE,
    }
  );
  context.restore();
}

function drawUnderlinedCenteredText(context, text, x, y, width, options) {
  const {
    underlineGap = 8,
    ...textOptions
  } = options;
  const finalSize = drawCenteredText(context, text, x, y, width, textOptions);
  const centerX = x + width / 2;
  const metrics = context.measureText(text);
  const measuredWidth = Math.max(
    metrics.width,
    Math.abs(metrics.actualBoundingBoxLeft || 0) + Math.abs(metrics.actualBoundingBoxRight || 0)
  );
  const underlineWidth = Math.ceil(measuredWidth) + 8;
  const underlineY = y + finalSize + underlineGap;

  context.save();
  context.strokeStyle = textOptions.color;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(centerX - underlineWidth / 2, underlineY);
  context.lineTo(centerX + underlineWidth / 2, underlineY);
  context.stroke();
  context.restore();
  return finalSize;
}

function drawStatsBox(context, stats, selectedStats) {
  const { x, y, width, height } = PERSONNEL_LAYOUT.statsBox;
  const slotWidth = width / 4;

  context.save();
  context.strokeStyle = WHITE;
  context.lineWidth = 3;
  context.strokeRect(x, y, width, height);

  selectedStats.slice(0, 4).forEach((statKey, index) => {
    const slotX = x + (slotWidth * index);
    const label = STAT_LABELS[statKey] || String(statKey || "").toUpperCase();
    drawUnderlinedCenteredText(context, label, slotX, y + 33, slotWidth, {
      size: 52,
      minSize: 34,
      family: EXPORT_FONT_FAMILIES.header,
      weight: 700,
      color: WHITE,
      underlineGap: 5,
    });

    drawCenteredText(context, formatPersonnelStatValue(stats, statKey), slotX, y + 113, slotWidth, {
      size: 72,
      minSize: 48,
      family: EXPORT_FONT_FAMILIES.header,
      weight: 700,
      color: WHITE,
    });
  });
  context.restore();
}

function drawThreePointBar(context, stats, colorKey) {
  const { labelX, x, y, width, height } = PERSONNEL_LAYOUT.threePointBar;
  const ratio = getThreePointRatio(stats);

  drawCenteredText(context, "3P", labelX, y + 3, 82, {
    size: 42,
    minSize: 36,
    family: EXPORT_FONT_FAMILIES.header,
    weight: 700,
    color: WHITE,
  });

  context.save();
  context.fillStyle = WHITE;
  context.fillRect(x, y, width, height);
  context.fillStyle = THREE_POINT_COLORS[colorKey] || THREE_POINT_COLORS.bright_green;
  context.fillRect(x, y, width * ratio, height);

  context.strokeStyle = "#161616";
  context.lineWidth = 1.5;
  context.strokeRect(x, y, width, height);
  context.restore();
}

function drawTags(context, tags, tagImages) {
  const selectedTags = (Array.isArray(tags) ? tags : []).filter((tag) => tagImages[tag]);
  if (!selectedTags.length) return;
  const boxHeight = PERSONNEL_LAYOUT.tags.height;
  const gap = 18;
  const tagWidths = selectedTags.map((tag) => {
    const image = tagImages[tag];
    if (!tag.startsWith("drives_")) return 78;
    const sourceWidth = image.width || image.naturalWidth || 1;
    const sourceHeight = image.height || image.naturalHeight || 1;
    return Math.round((sourceWidth / (sourceHeight * 0.76)) * boxHeight);
  });
  const totalWidth = tagWidths.reduce((sum, width) => sum + width, 0) + ((selectedTags.length - 1) * gap);
  const startX = (EXPORT_WIDTH - totalWidth) / 2;
  let nextX = startX;
  selectedTags.forEach((tag, index) => {
    const image = tagImages[tag];
    const tagWidth = tagWidths[index];
    if (tag.startsWith("drives_")) {
      const sourceWidth = image.width || image.naturalWidth;
      const sourceHeight = image.height || image.naturalHeight;
      const cropY = sourceHeight * 0.12;
      context.drawImage(
        image,
        0,
        cropY,
        sourceWidth,
        sourceHeight * 0.76,
        nextX,
        PERSONNEL_LAYOUT.tags.y,
        tagWidth,
        boxHeight
      );
    } else {
      drawContain(context, image, nextX, PERSONNEL_LAYOUT.tags.y, tagWidth, boxHeight);
    }
    nextX += tagWidth + gap;
  });
}

async function loadTagImages() {
  const entries = await Promise.all(Object.entries(TAG_ASSET_URLS).map(async ([key, url]) => (
    [key, await loadFirstImage([url])]
  )));
  return Object.fromEntries(entries.filter(([, image]) => Boolean(image)));
}

function safeFilePart(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function buildFileName(player, team) {
  const teamPart = safeFilePart(team?.tricode || team?.fullName, "team");
  const jerseyPart = safeFilePart(player?.jerseyNum, "no-number");
  const playerPart = safeFilePart(player?.familyName || player?.fullName, "player");
  return `${teamPart}-${jerseyPart}-${playerPart}-personnel.png`;
}

function buildZipFileName(team) {
  const teamPart = safeFilePart(team?.tricode || team?.fullName, "team");
  return `${teamPart}-personnel-graphics.zip`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body?.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function canvasToPngBlob(canvas) {
  if (typeof canvas.toBlob !== "function") {
    const response = await fetch(canvas.toDataURL("image/png"));
    return response.blob();
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to render personnel graphic PNG."));
    }, "image/png");
  });
}

const CRC_TABLE = Array.from({ length: 256 }, (_, tableIndex) => {
  let value = tableIndex;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function getCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (
    (date.getHours() << 11)
    | (date.getMinutes() << 5)
    | Math.floor(date.getSeconds() / 2)
  );
  const dosDate = (
    ((year - 1980) << 9)
    | ((date.getMonth() + 1) << 5)
    | date.getDate()
  );
  return { dosDate, dosTime };
}

function createZipHeader(byteLength) {
  const buffer = new ArrayBuffer(byteLength);
  return {
    bytes: new Uint8Array(buffer),
    view: new DataView(buffer),
  };
}

async function createStoredZipBlob(files) {
  const encoder = new TextEncoder();
  const { dosDate, dosTime } = getDosDateTime();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const file of files) {
    const fileBytes = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = encoder.encode(file.name);
    const crc32 = getCrc32(fileBytes);

    const localHeader = createZipHeader(30);
    localHeader.view.setUint32(0, 0x04034b50, true);
    localHeader.view.setUint16(4, 20, true);
    localHeader.view.setUint16(6, 0x0800, true);
    localHeader.view.setUint16(8, 0, true);
    localHeader.view.setUint16(10, dosTime, true);
    localHeader.view.setUint16(12, dosDate, true);
    localHeader.view.setUint32(14, crc32, true);
    localHeader.view.setUint32(18, fileBytes.byteLength, true);
    localHeader.view.setUint32(22, fileBytes.byteLength, true);
    localHeader.view.setUint16(26, nameBytes.byteLength, true);
    localHeader.view.setUint16(28, 0, true);
    localParts.push(localHeader.bytes, nameBytes, fileBytes);

    const centralHeader = createZipHeader(46);
    centralHeader.view.setUint32(0, 0x02014b50, true);
    centralHeader.view.setUint16(4, 20, true);
    centralHeader.view.setUint16(6, 20, true);
    centralHeader.view.setUint16(8, 0x0800, true);
    centralHeader.view.setUint16(10, 0, true);
    centralHeader.view.setUint16(12, dosTime, true);
    centralHeader.view.setUint16(14, dosDate, true);
    centralHeader.view.setUint32(16, crc32, true);
    centralHeader.view.setUint32(20, fileBytes.byteLength, true);
    centralHeader.view.setUint32(24, fileBytes.byteLength, true);
    centralHeader.view.setUint16(28, nameBytes.byteLength, true);
    centralHeader.view.setUint16(30, 0, true);
    centralHeader.view.setUint16(32, 0, true);
    centralHeader.view.setUint16(34, 0, true);
    centralHeader.view.setUint16(36, 0, true);
    centralHeader.view.setUint32(38, 0, true);
    centralHeader.view.setUint32(42, localOffset, true);
    centralParts.push(centralHeader.bytes, nameBytes);

    localOffset += localHeader.bytes.byteLength + nameBytes.byteLength + fileBytes.byteLength;
    centralSize += centralHeader.bytes.byteLength + nameBytes.byteLength;
  }

  const endHeader = createZipHeader(22);
  endHeader.view.setUint32(0, 0x06054b50, true);
  endHeader.view.setUint16(4, 0, true);
  endHeader.view.setUint16(6, 0, true);
  endHeader.view.setUint16(8, files.length, true);
  endHeader.view.setUint16(10, files.length, true);
  endHeader.view.setUint32(12, centralSize, true);
  endHeader.view.setUint32(16, localOffset, true);
  endHeader.view.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endHeader.bytes], { type: "application/zip" });
}

export async function renderPersonnelGraphic({
  player,
  stats,
  selectedStats,
  tags,
  threePointColor,
  teamId,
  logoImage = null,
  tagImages = null,
  headshotImage = null,
}) {
  await ensureMatchupExportFonts();
  if (document.fonts?.ready) await document.fonts.ready;

  const [resolvedHeadshot, resolvedLogo, resolvedTags] = await Promise.all([
    headshotImage || loadFirstImage(buildPlayerHeadshotCandidates(player)),
    logoImage || loadFirstImage(teamId ? [teamLogoUrl(teamId, "nba")] : []),
    tagImages || loadTagImages(),
  ]);

  const { canvas, context } = makeCanvas(EXPORT_WIDTH, EXPORT_HEIGHT, BLACK);
  drawBackdrop(context);
  drawLogo(context, resolvedLogo);

  if (resolvedHeadshot) {
    drawContainBottom(
      context,
      resolvedHeadshot,
      PERSONNEL_LAYOUT.headshot.x,
      PERSONNEL_LAYOUT.headshot.y,
      PERSONNEL_LAYOUT.headshot.width,
      PERSONNEL_LAYOUT.headshot.height
    );
  }

  drawPlayerName(context, player);
  drawStatsBox(context, stats, selectedStats);
  drawThreePointBar(context, stats, threePointColor);
  drawTags(context, tags, resolvedTags);
  return canvas;
}

export async function exportPersonnelGraphics({ items, team, teamId }) {
  const exportItems = Array.isArray(items) ? items.filter((item) => item?.player) : [];
  if (!exportItems.length) return 0;

  await ensureMatchupExportFonts();
  const [logoImage, tagImages] = await Promise.all([
    loadFirstImage(teamId ? [teamLogoUrl(teamId, "nba")] : []),
    loadTagImages(),
  ]);

  const renderedFiles = [];
  for (const item of exportItems) {
    const canvas = await renderPersonnelGraphic({
      ...item,
      teamId,
      logoImage,
      tagImages,
    });
    const fileName = buildFileName(item.player, team);
    if (exportItems.length === 1) {
      downloadCanvas(canvas, fileName);
    } else {
      renderedFiles.push({
        name: fileName,
        blob: await canvasToPngBlob(canvas),
      });
    }
  }

  if (renderedFiles.length) {
    downloadBlob(await createStoredZipBlob(renderedFiles), buildZipFileName(team));
  }
  return exportItems.length;
}

export const PERSONNEL_EXPORT_SIZE = {
  width: EXPORT_WIDTH,
  height: EXPORT_HEIGHT,
};
