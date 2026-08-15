import fistIconUrl from "../assets/coverage/fist.png";
import mixIconUrl from "../assets/coverage/mix.png";
import odbIconUrl from "../assets/coverage/odb.png";
import redIconUrl from "../assets/coverage/red.png";
import showIconUrl from "../assets/coverage/show.png";
import thruIconUrl from "../assets/coverage/thru.png";
import volOneIconUrl from "../assets/coverage/vol-1.png";
import volTwoIconUrl from "../assets/coverage/vol-2.png";
import volThreeIconUrl from "../assets/coverage/vol-3.png";
import warIconUrl from "../assets/coverage/war.png";
import whiteIconUrl from "../assets/coverage/white.png";
import { teamLogoUrl } from "../api.js";
import {
  COVERAGE_ROW_COUNT,
  getCoverageExportColumnCount,
  hydrateCoverageColumnHeaders,
  hydrateCoverageSlots,
} from "../coverageGraphic.js";
import {
  BLACK,
  EXPORT_FONT_FAMILIES,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  WHITE,
  downloadCanvas,
  drawBackdrop,
  drawCenteredText,
  drawContain,
  drawLogo,
  ensureMatchupExportFonts,
  loadExportBackgroundImage,
  loadFirstImage,
  makeCanvas,
} from "./matchupGraphicExport.js";

export const COVERAGE_ICON_OPTIONS = Object.freeze([
  Object.freeze({ key: "vol-1", label: "Vol 1", url: volOneIconUrl }),
  Object.freeze({ key: "vol-2", label: "Vol 2", url: volTwoIconUrl }),
  Object.freeze({ key: "vol-3", label: "Vol 3", url: volThreeIconUrl }),
  Object.freeze({ key: "red", label: "Red", url: redIconUrl }),
  Object.freeze({ key: "war", label: "War", url: warIconUrl }),
  Object.freeze({ key: "show", label: "Show", url: showIconUrl }),
  Object.freeze({ key: "thru", label: "Thru", url: thruIconUrl }),
  Object.freeze({ key: "mix", label: "Mix", url: mixIconUrl }),
  Object.freeze({ key: "odb", label: "ODB", url: odbIconUrl }),
  Object.freeze({ key: "white", label: "White", url: whiteIconUrl }),
  Object.freeze({ key: "fist", label: "Fist", url: fistIconUrl }),
]);

const COVERAGE_ICON_URLS = Object.freeze(Object.fromEntries(
  COVERAGE_ICON_OPTIONS.map((option) => [option.key, option.url])
));

const COLUMN_LAYOUTS = Object.freeze({
  2: Object.freeze({
    left: 345,
    right: 1575,
    separatorTop: 165,
    separatorBottom: 920,
  }),
  3: Object.freeze({
    left: 145,
    right: 1775,
    separatorTop: 172,
    separatorBottom: 922,
  }),
});

const ROW_LAYOUTS = Object.freeze([
  Object.freeze({
    subtitleY: 300,
    iconY: 350,
    iconSize: 242,
    subtitleSize: 36,
    subtitleMinSize: 25,
  }),
  Object.freeze({
    subtitleY: 660,
    iconY: 700,
    iconSize: 242,
    subtitleSize: 36,
    subtitleMinSize: 25,
  }),
]);

const COLUMN_HEADER_LAYOUT = Object.freeze({
  y: 174,
  size: 58,
  minSize: 36,
});

function safeFilePart(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function buildFileName(team) {
  return `${safeFilePart(team?.tricode || team?.fullName, "coverage")}-coverage-graphic.png`;
}

function getColumnGeometry(columnCount) {
  const layout = COLUMN_LAYOUTS[columnCount] || COLUMN_LAYOUTS[2];
  const width = layout.right - layout.left;
  const columnWidth = width / columnCount;
  return {
    ...layout,
    columnWidth,
    centers: Array.from({ length: columnCount }, (_, index) => layout.left + columnWidth * index + columnWidth / 2),
    separators: Array.from({ length: columnCount - 1 }, (_, index) => layout.left + columnWidth * (index + 1)),
  };
}

async function loadCoverageIconImages(slots) {
  const iconKeys = Array.from(new Set(
    hydrateCoverageSlots(slots)
      .map((slot) => String(slot.iconKey || "").trim())
      .filter((iconKey) => COVERAGE_ICON_URLS[iconKey])
  ));
  const entries = await Promise.all(iconKeys.map(async (iconKey) => (
    [iconKey, await loadFirstImage([COVERAGE_ICON_URLS[iconKey]])]
  )));
  return Object.fromEntries(entries.filter(([, image]) => Boolean(image)));
}

function getSlot(slots, columnIndex, rowIndex) {
  return hydrateCoverageSlots(slots).find((slot) => slot.column === columnIndex && slot.row === rowIndex)
    || { subtitle: "", iconKey: "" };
}

function formatExportText(value) {
  return String(value || "").trim().toUpperCase();
}

function drawColumnHeader(context, header, centerX, width) {
  const title = formatExportText(header);
  if (!title) return;
  const textWidth = width - 80;
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.38)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 4;
  drawCenteredText(context, title, centerX - textWidth / 2, COLUMN_HEADER_LAYOUT.y, textWidth, {
    size: COLUMN_HEADER_LAYOUT.size,
    minSize: COLUMN_HEADER_LAYOUT.minSize,
    family: EXPORT_FONT_FAMILIES.header,
    weight: 700,
    color: WHITE,
  });
  context.restore();
}

function drawSlotText(context, slot, centerX, width, rowLayout) {
  const subtitle = formatExportText(slot.subtitle);
  if (!subtitle) return;
  const textWidth = width - 80;
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.38)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 4;

  drawCenteredText(context, subtitle, centerX - textWidth / 2, rowLayout.subtitleY, textWidth, {
    size: rowLayout.subtitleSize,
    minSize: rowLayout.subtitleMinSize,
    family: EXPORT_FONT_FAMILIES.header,
    weight: 700,
    color: WHITE,
  });
  context.restore();
}

function drawCoverageSeparators(context, geometry) {
  context.save();
  context.strokeStyle = WHITE;
  context.lineWidth = 6;
  context.lineCap = "round";
  geometry.separators.forEach((x) => {
    context.beginPath();
    context.moveTo(x, geometry.separatorTop);
    context.lineTo(x, geometry.separatorBottom);
    context.stroke();
  });
  context.restore();
}

function drawCoverageSlots(context, slots, columnHeaders, columnCount, iconImages) {
  const geometry = getColumnGeometry(columnCount);
  drawCoverageSeparators(context, geometry);

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    drawColumnHeader(context, columnHeaders[columnIndex], geometry.centers[columnIndex], geometry.columnWidth);
    for (let rowIndex = 0; rowIndex < COVERAGE_ROW_COUNT; rowIndex += 1) {
      const slot = getSlot(slots, columnIndex, rowIndex);
      const rowLayout = ROW_LAYOUTS[rowIndex];
      const centerX = geometry.centers[columnIndex];
      const iconImage = iconImages[String(slot.iconKey || "").trim()];
      drawSlotText(context, slot, centerX, geometry.columnWidth, rowLayout);
      if (iconImage) {
        drawContain(
          context,
          iconImage,
          centerX - rowLayout.iconSize / 2,
          rowLayout.iconY,
          rowLayout.iconSize,
          rowLayout.iconSize
        );
      }
    }
  }
}

export async function renderCoverageGraphicCanvas({
  slots = [],
  columnHeaders = [],
  columnCount = 3,
  logoTeamId = "",
  league = "nba",
  outputWidth = EXPORT_WIDTH,
  outputHeight = EXPORT_HEIGHT,
  logoImage = null,
  iconImages = null,
} = {}) {
  await ensureMatchupExportFonts();
  if (document.fonts?.ready) await document.fonts.ready;

  const hydratedSlots = hydrateCoverageSlots(slots);
  const hydratedColumnHeaders = hydrateCoverageColumnHeaders(columnHeaders);
  const resolvedColumnCount = getCoverageExportColumnCount(hydratedSlots, columnCount, hydratedColumnHeaders);
  const [resolvedLogo, resolvedIcons, backgroundImage] = await Promise.all([
    logoImage || loadFirstImage(logoTeamId ? [teamLogoUrl(logoTeamId, league)] : []),
    iconImages || loadCoverageIconImages(hydratedSlots),
    loadExportBackgroundImage(),
  ]);

  const width = Math.max(1, Math.round(Number(outputWidth) || EXPORT_WIDTH));
  const height = Math.max(1, Math.round(Number(outputHeight) || EXPORT_HEIGHT));
  const { canvas, context } = makeCanvas(width, height, BLACK);
  if (width !== EXPORT_WIDTH || height !== EXPORT_HEIGHT) {
    context.scale(width / EXPORT_WIDTH, height / EXPORT_HEIGHT);
  }
  drawBackdrop(context, backgroundImage);
  drawLogo(context, resolvedLogo);
  drawCoverageSlots(context, hydratedSlots, hydratedColumnHeaders, resolvedColumnCount, resolvedIcons);
  return canvas;
}

export async function exportCoverageGraphic({
  slots,
  columnHeaders,
  columnCount,
  logoTeamId,
  league = "nba",
  team = null,
  fileName = "",
}) {
  const canvas = await renderCoverageGraphicCanvas({ slots, columnHeaders, columnCount, logoTeamId, league });
  downloadCanvas(canvas, fileName || buildFileName(team));
}

export const COVERAGE_EXPORT_SIZE = {
  width: EXPORT_WIDTH,
  height: EXPORT_HEIGHT,
};
