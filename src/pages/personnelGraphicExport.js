import fireTagUrl from "../assets/personnel/fire.png";
import coldTagUrl from "../assets/personnel/cold.png";
import drivesRightTagUrl from "../assets/personnel/drives-right.png";
import drivesLeftTagUrl from "../assets/personnel/drives-left.png";
import { teamLogoUrl } from "../api.js";
import {
  PERSONNEL_CUSTOM_STAT_KEY,
  PERSONNEL_THREE_POINT_COLOR_OPTIONS,
  normalizePersonnelCustomStatLabel,
  calculateThreePointAttemptRatio,
  formatPersonnelStatValue,
} from "../personnelGraphic.js";
import { PERSONNEL_LAYOUT } from "../personnelGraphicLayout.js";
import {
  BLACK,
  EXPORT_FONT_FAMILIES,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  WHITE,
  buildPlayerHeadshotCandidates,
  clearExportImageCache,
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
import { createStreamingZipDownload, StoredZipBuilder } from "../storedZip.js";

const STAT_LABELS = {
  ppg: "PPG",
  rpg: "RPG",
  threePointPercentage: "3P%",
  apg: "APG",
  bpg: "BPG",
  spg: "SPG",
  fta: "FTA",
  [PERSONNEL_CUSTOM_STAT_KEY]: "CUSTOM",
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

function getStatLabel(stats, statKey) {
  if (statKey === PERSONNEL_CUSTOM_STAT_KEY) {
    return normalizePersonnelCustomStatLabel(stats?.customStatLabel) || STAT_LABELS[PERSONNEL_CUSTOM_STAT_KEY];
  }
  return STAT_LABELS[statKey] || String(statKey || "").toUpperCase();
}

function drawStatsBox(context, stats, selectedStats) {
  const { x, y, width, height } = PERSONNEL_LAYOUT.statsBox;
  const typography = PERSONNEL_LAYOUT.stats;
  const slotWidth = width / 4;

  context.save();
  context.strokeStyle = WHITE;
  context.lineWidth = 3;
  context.strokeRect(x, y, width, height);

  selectedStats.slice(0, 4).forEach((statKey, index) => {
    const slotX = x + (slotWidth * index);
    const label = getStatLabel(stats, statKey);
    drawUnderlinedCenteredText(context, label, slotX, y + typography.labelInsetY, slotWidth, {
      size: typography.labelSize,
      minSize: typography.labelMinSize,
      family: EXPORT_FONT_FAMILIES.header,
      weight: 700,
      color: WHITE,
      underlineGap: typography.underlineGap,
    });

    drawCenteredText(context, formatPersonnelStatValue(stats, statKey), slotX, y + typography.valueInsetY, slotWidth, {
      size: typography.valueSize,
      minSize: typography.valueMinSize,
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
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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

export async function renderPersonnelGraphic({
  player,
  stats,
  selectedStats,
  tags,
  threePointColor,
  teamId,
  league = "nba",
  logoImage = null,
  tagImages = null,
  headshotImage = null,
}) {
  await ensureMatchupExportFonts();
  if (document.fonts?.ready) await document.fonts.ready;

  const [resolvedHeadshot, resolvedLogo, resolvedTags] = await Promise.all([
    headshotImage || loadFirstImage(buildPlayerHeadshotCandidates(player)),
    logoImage || loadFirstImage(teamId ? [teamLogoUrl(teamId, league)] : []),
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

export async function exportPersonnelGraphics({ items, team, teamId, league = "nba" }) {
  const exportItems = Array.isArray(items) ? items.filter((item) => item?.player) : [];
  if (!exportItems.length) return 0;

  const zipFileName = buildZipFileName(team);
  const streamingZip = exportItems.length > 1 ? await createStreamingZipDownload(zipFileName) : null;
  await ensureMatchupExportFonts();
  const [logoImage, tagImages] = await Promise.all([
    loadFirstImage(teamId ? [teamLogoUrl(teamId, league)] : []),
    loadTagImages(),
  ]);

  const zipBuilder = exportItems.length > 1
    ? (streamingZip || new StoredZipBuilder(new Date(), { maxBytes: 96 * 1024 * 1024 }))
    : null;
  try {
    for (const item of exportItems) {
      const canvas = await renderPersonnelGraphic({
        ...item,
        teamId,
        league,
        logoImage,
        tagImages,
      });
      const fileName = buildFileName(item.player, team);
      if (exportItems.length === 1) {
        downloadCanvas(canvas, fileName);
      } else {
        await zipBuilder.addFile(fileName, await canvasToPngBlob(canvas));
        canvas.width = 1;
        canvas.height = 1;
        clearExportImageCache();
      }
    }

    if (streamingZip) await streamingZip.close();
    else if (zipBuilder) downloadBlob(zipBuilder.toBlob(), zipFileName);
  } catch (error) {
    await streamingZip?.abort(error).catch(() => undefined);
    throw error;
  } finally {
    clearExportImageCache();
  }
  return exportItems.length;
}

export const PERSONNEL_EXPORT_SIZE = {
  width: EXPORT_WIDTH,
  height: EXPORT_HEIGHT,
};
