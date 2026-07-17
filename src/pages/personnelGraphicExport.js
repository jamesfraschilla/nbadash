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
  drawCenteredText(context, playerLabel(player), 455, 470, 1010, {
    size: 132,
    minSize: 72,
    family: EXPORT_FONT_FAMILIES.header,
    weight: 700,
    color: WHITE,
  });
  context.restore();
}

function drawStatsBox(context, stats, selectedStats) {
  const x = 515;
  const y = 650;
  const width = 890;
  const height = 190;
  const slotWidth = width / 4;

  context.save();
  context.strokeStyle = WHITE;
  context.lineWidth = 3;
  context.strokeRect(x, y, width, height);

  selectedStats.slice(0, 4).forEach((statKey, index) => {
    const slotX = x + (slotWidth * index);
    const centerX = slotX + (slotWidth / 2);
    const label = STAT_LABELS[statKey] || String(statKey || "").toUpperCase();
    drawCenteredText(context, label, slotX, y + 18, slotWidth, {
      size: 49,
      minSize: 34,
      family: EXPORT_FONT_FAMILIES.body,
      weight: 700,
      color: WHITE,
    });

    context.strokeStyle = WHITE;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(centerX - 33, y + 64);
    context.lineTo(centerX + 33, y + 64);
    context.stroke();

    drawCenteredText(context, formatPersonnelStatValue(stats, statKey), slotX, y + 88, slotWidth, {
      size: 65,
      minSize: 48,
      family: EXPORT_FONT_FAMILIES.body,
      weight: 700,
      color: WHITE,
    });
  });
  context.restore();
}

function drawThreePointBar(context, stats, colorKey) {
  const x = 577;
  const y = 860;
  const width = 767;
  const height = 42;
  const ratio = getThreePointRatio(stats);

  drawCenteredText(context, "3P", 485, y + 3, 82, {
    size: 42,
    minSize: 36,
    family: EXPORT_FONT_FAMILIES.body,
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
  for (let index = 1; index < 10; index += 1) {
    const segmentX = x + ((width / 10) * index);
    context.beginPath();
    context.moveTo(segmentX, y);
    context.lineTo(segmentX, y + height);
    context.stroke();
  }
  context.restore();
}

function drawTags(context, tags, tagImages) {
  const selectedTags = (Array.isArray(tags) ? tags : []).filter((tag) => tagImages[tag]);
  if (!selectedTags.length) return;
  const boxHeight = 78;
  const gap = 18;
  const tagWidths = selectedTags.map((tag) => (tag.startsWith("drives_") ? 132 : 78));
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
        936,
        tagWidth,
        boxHeight
      );
    } else {
      drawContain(context, image, nextX, 936, tagWidth, boxHeight);
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

  if (resolvedHeadshot) drawContainBottom(context, resolvedHeadshot, 560, 42, 800, 412);

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

  for (const item of exportItems) {
    const canvas = await renderPersonnelGraphic({
      ...item,
      teamId,
      logoImage,
      tagImages,
    });
    downloadCanvas(canvas, buildFileName(item.player, team));
  }
  return exportItems.length;
}

export const PERSONNEL_EXPORT_SIZE = {
  width: EXPORT_WIDTH,
  height: EXPORT_HEIGHT,
};
