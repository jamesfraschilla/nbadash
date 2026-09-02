import {
  BLACK,
  EXPORT_FONT_FAMILIES,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  WHITE,
  downloadCanvas,
  drawBackdrop,
  drawLogo,
  ensureMatchupExportFonts,
  loadFirstImage,
  loadExportBackgroundImage,
  makeCanvas,
} from "./matchupGraphicExport.js";
import wizardsLogoUrl from "../assets/WWizards_Primary_Icon.png";
import {
  getTableGraphicExportColumns,
  getTableGraphicExportRows,
} from "../tableGraphic.js";

const TABLE_EXPORT_SCALE = 2;
const GRID_LINE = "rgba(255, 255, 255, 0.72)";
const HEADER_FILL = "rgba(255, 255, 255, 0.16)";
const ROW_FILL = "rgba(0, 0, 0, 0.34)";
const TEAM_FILL = "rgba(227, 24, 55, 0.24)";

function setFont(context, { size, weight = 800, family = EXPORT_FONT_FAMILIES.body }) {
  context.font = `${weight} ${size}px ${family}`;
}

function fitText(context, text, maxWidth, size, minSize, weight = 800) {
  let nextSize = size;
  while (nextSize > minSize) {
    setFont(context, { size: nextSize, weight });
    if (context.measureText(text).width <= maxWidth) return nextSize;
    nextSize -= 1;
  }
  return minSize;
}

function drawCellText(context, text, x, y, width, height, options = {}) {
  const value = String(text || "").trim();
  if (!value) return;
  const {
    align = "center",
    color = WHITE,
    size = 42,
    minSize = 24,
    weight = 800,
  } = options;
  const padding = Math.min(32, Math.max(16, width * 0.08));
  const textWidth = Math.max(20, width - padding * 2);
  const finalSize = fitText(context, value, textWidth, size, minSize, weight);
  setFont(context, { size: finalSize, weight });
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.textAlign = align;
  const textX = align === "left" ? x + padding : align === "right" ? x + width - padding : x + width / 2;
  context.fillText(value, textX, y + height / 2);
}

export function computeTableGraphicLayout({ rowCount, columnCount }) {
  const safeRows = Math.max(2, Number(rowCount) || 2);
  const safeColumns = Math.max(2, Number(columnCount) || 2);
  const maxTableWidth = 1500;
  const maxTableHeight = 820;
  const minRowHeight = 40;
  const maxRowHeight = 88;
  const rowHeight = Math.max(minRowHeight, Math.min(maxRowHeight, Math.floor(maxTableHeight / (safeRows + 1))));
  const tableHeight = rowHeight * (safeRows + 1);
  const preferredWidth = Math.min(maxTableWidth, 430 + safeColumns * 210);
  const tableWidth = Math.max(840, preferredWidth);
  const firstColumnWidth = Math.min(360, Math.max(260, tableWidth * 0.3));
  const statColumnWidth = (tableWidth - firstColumnWidth) / (safeColumns - 1);
  const fontSize = Math.max(28, Math.min(54, rowHeight * 0.55, statColumnWidth * 0.24));
  const headerFontSize = Math.max(23, Math.min(40, fontSize * 0.92));
  return {
    x: (EXPORT_WIDTH - tableWidth) / 2,
    y: 170 + Math.max(0, (maxTableHeight - tableHeight) / 2),
    tableWidth,
    tableHeight,
    rowHeight,
    firstColumnWidth,
    statColumnWidth,
    fontSize,
    headerFontSize,
  };
}

function drawTitle(context, title) {
  const safeTitle = String(title || "").trim().toUpperCase();
  if (!safeTitle) return;
  context.save();
  context.fillStyle = WHITE;
  context.textAlign = "center";
  context.textBaseline = "top";
  const titleSize = fitText(context, safeTitle, 1120, 54, 32, 900);
  setFont(context, { size: titleSize, weight: 900, family: EXPORT_FONT_FAMILIES.header });
  context.fillText(safeTitle, EXPORT_WIDTH / 2, 86);
  context.restore();
}

function drawTable(context, rows, columns, layout) {
  const { x, y, tableWidth, tableHeight, rowHeight, firstColumnWidth, statColumnWidth, fontSize, headerFontSize } = layout;
  context.save();
  context.fillStyle = ROW_FILL;
  context.fillRect(x, y, tableWidth, tableHeight);
  context.strokeStyle = GRID_LINE;
  context.lineWidth = 2;
  context.strokeRect(x, y, tableWidth, tableHeight);

  context.fillStyle = HEADER_FILL;
  context.fillRect(x, y, tableWidth, rowHeight);

  columns.forEach((column, index) => {
    const cellX = index === 0 ? x : x + firstColumnWidth + statColumnWidth * (index - 1);
    const cellWidth = index === 0 ? firstColumnWidth : statColumnWidth;
    drawCellText(context, column.header || (index === 0 ? "PLAYER" : ""), cellX, y, cellWidth, rowHeight, {
      size: headerFontSize,
      minSize: 18,
      weight: 900,
      align: "center",
    });
  });

  rows.forEach((row, rowIndex) => {
    const cellY = y + rowHeight * (rowIndex + 1);
    if (row.isTeam) {
      context.fillStyle = TEAM_FILL;
      context.fillRect(x, cellY, tableWidth, rowHeight);
    }
    drawCellText(context, String(row.label || "").toUpperCase(), x, cellY, firstColumnWidth, rowHeight, {
      size: fontSize,
      minSize: 20,
      weight: row.isTeam ? 900 : 800,
      align: "center",
    });
    row.values.forEach((value, valueIndex) => {
      drawCellText(context, value, x + firstColumnWidth + statColumnWidth * valueIndex, cellY, statColumnWidth, rowHeight, {
        size: fontSize,
        minSize: 18,
        weight: 900,
      });
    });
  });

  context.beginPath();
  for (let index = 1; index < columns.length; index += 1) {
    const lineX = index === 1 ? x + firstColumnWidth : x + firstColumnWidth + statColumnWidth * (index - 1);
    context.moveTo(lineX, y);
    context.lineTo(lineX, y + tableHeight);
  }
  for (let index = 1; index <= rows.length; index += 1) {
    const lineY = y + rowHeight * index;
    context.moveTo(x, lineY);
    context.lineTo(x + tableWidth, lineY);
  }
  context.stroke();
  context.restore();
}

export async function renderTableGraphicCanvas({ draft, roster, width = EXPORT_WIDTH, height = EXPORT_HEIGHT }) {
  await ensureMatchupExportFonts();
  if (document.fonts?.ready) await document.fonts.ready;
  const rows = getTableGraphicExportRows(draft, roster);
  const columns = getTableGraphicExportColumns(draft);
  const outputWidth = Math.max(1, Math.round(Number(width) || EXPORT_WIDTH));
  const outputHeight = Math.max(1, Math.round(Number(height) || EXPORT_HEIGHT));
  const [backgroundImage, logoImage] = await Promise.all([
    loadExportBackgroundImage(),
    loadFirstImage([wizardsLogoUrl]),
  ]);
  const { canvas, context } = makeCanvas(outputWidth, outputHeight, BLACK);
  if (outputWidth !== EXPORT_WIDTH || outputHeight !== EXPORT_HEIGHT) {
    context.scale(outputWidth / EXPORT_WIDTH, outputHeight / EXPORT_HEIGHT);
  }
  drawBackdrop(context, backgroundImage);
  drawLogo(context, logoImage);
  drawTitle(context, draft?.title);
  drawTable(context, rows, columns, computeTableGraphicLayout({ rowCount: rows.length, columnCount: columns.length }));
  return canvas;
}

export async function exportTableGraphic({ draft, roster }) {
  const canvas = await renderTableGraphicCanvas({
    draft,
    roster,
    width: EXPORT_WIDTH * TABLE_EXPORT_SCALE,
    height: EXPORT_HEIGHT * TABLE_EXPORT_SCALE,
  });
  downloadCanvas(canvas, "wizards-table-graphic.png");
}
