import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 24;
const TOP_Y = PAGE_HEIGHT - 24;
const BOTTOM_Y = 24;

const COLORS = {
  black: rgb(0.04, 0.04, 0.04),
  muted: rgb(0.48, 0.48, 0.48),
  line: rgb(0.28, 0.28, 0.28),
  lightLine: rgb(0.82, 0.82, 0.82),
  blue: rgb(0.08, 0.47, 0.79),
  lightGray: rgb(0.94, 0.94, 0.94),
  headerGray: rgb(0.88, 0.88, 0.88),
  white: rgb(1, 1, 1),
  elite: rgb(0, 0.5, 0.04),
  good: rgb(0.56, 0.93, 0.57),
  concern: rgb(1, 0.64, 0),
  poor: rgb(0.82, 0, 0),
  darkGreen: rgb(0.10, 0.32, 0.12),
  orange: rgb(1, 0.58, 0.25),
  pink: rgb(0.93, 0.29, 0.48),
  gray: rgb(0.56, 0.56, 0.56),
  cyan: rgb(0.06, 0.62, 0.86),
  teal: rgb(0.19, 0.72, 0.69),
};

const pdfEnv = import.meta.env || {};
const SUPABASE_FUNCTIONS_BASE = pdfEnv.VITE_SUPABASE_URL
  ? `${String(pdfEnv.VITE_SUPABASE_URL).replace(/\/$/, "")}/functions/v1`
  : "";
const loadedImageBytesCache = new Map();

function pdfText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

function buildProxyUrl(url) {
  const safeUrl = String(url || "").trim();
  if (!safeUrl || !SUPABASE_FUNCTIONS_BASE || !/^https?:\/\//i.test(safeUrl)) return safeUrl;
  return `${SUPABASE_FUNCTIONS_BASE}/export-image?url=${encodeURIComponent(safeUrl)}`;
}

function loadImageElement(url) {
  if (!url || typeof Image === "undefined") return Promise.resolve(null);
  if (loadedImageBytesCache.has(url)) return loadedImageBytesCache.get(url);
  const promise = new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (!value) loadedImageBytesCache.delete(url);
      resolve(value);
    };
    const timeoutId = setTimeout(() => finish(null), 10_000);
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = buildProxyUrl(url);
  });
  loadedImageBytesCache.set(url, promise);
  return promise;
}

async function canvasToPngBytes(canvas) {
  if (typeof canvas.toBlob === "function") {
    const blob = await new Promise((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), "image/png");
    });
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  }
  const response = await fetch(canvas.toDataURL("image/png"));
  return new Uint8Array(await response.arrayBuffer());
}

async function loadImagePngBytes(url, { maxWidth = 256, maxHeight = 256 } = {}) {
  if (typeof document === "undefined") return null;
  const image = await loadImageElement(url);
  if (!image) return null;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToPngBytes(canvas);
}

async function loadFirstImagePngBytes(urls, options = {}) {
  for (const url of urls) {
    const bytes = await loadImagePngBytes(url, options);
    if (bytes?.length) return bytes;
  }
  return null;
}

async function embedPngBytes(pdfDoc, bytes) {
  if (!bytes?.length) return null;
  try {
    return await pdfDoc.embedPng(bytes);
  } catch {
    return null;
  }
}

async function loadReportAssets(pdfDoc, report) {
  const playerReports = Array.isArray(report.playerReports) ? report.playerReports : [];
  const teamId = report.team?.teamId || playerReports[0]?.player?.teamId || "";
  const [teamLogoBytes, headshotEntries] = await Promise.all([
    teamId ? loadFirstImagePngBytes([teamLogoPdfUrl(teamId)], { maxWidth: 180, maxHeight: 180 }) : null,
    Promise.all(playerReports.map(async (playerReport) => {
      const player = playerReport.player || {};
      const playerId = String(player.playerId || "").trim();
      if (!playerId) return [playerId, null];
      const bytes = await loadFirstImagePngBytes(playerHeadshotPdfUrls(playerId), {
        maxWidth: 240,
        maxHeight: 240,
      });
      return [playerId, await embedPngBytes(pdfDoc, bytes)];
    })),
  ]);
  return {
    teamLogo: await embedPngBytes(pdfDoc, teamLogoBytes),
    playerHeadshots: new Map(headshotEntries),
  };
}

function teamLogoPdfUrl(teamId) {
  return `https://cdn.nba.com/logos/nba/${String(teamId || "").trim()}/primary/L/logo.svg`;
}

function playerHeadshotPdfUrls(playerId) {
  const safePlayerId = String(playerId || "").trim();
  if (!/^\d+$/.test(safePlayerId)) return [];
  return [
    `https://cdn.nba.com/headshots/nba/latest/260x190/${safePlayerId}.png`,
    `https://cdn.nba.com/headshots/nba/latest/1040x760/${safePlayerId}.png`,
  ];
}

function rankColor(rank, options = {}) {
  if (options.mode === "ordinal") return ordinalRankColor(rank, options.maxRank);
  const value = Number(rank);
  if (!Number.isFinite(value)) return { fill: COLORS.lightGray, text: COLORS.black };
  if (value <= 10) return { fill: COLORS.elite, text: COLORS.white };
  if (value <= 40) return { fill: COLORS.good, text: COLORS.black };
  if (value <= 60) return { fill: COLORS.lightGray, text: COLORS.black };
  if (value <= 90) return { fill: COLORS.concern, text: COLORS.black };
  return { fill: COLORS.poor, text: COLORS.white };
}

function ordinalRankColor(rank, maxRank) {
  const value = Number(rank);
  const max = Math.max(1, Number(maxRank) || value || 1);
  if (!Number.isFinite(value)) return { fill: COLORS.lightGray, text: COLORS.black };
  if (max <= 1 || value <= 1) return { fill: COLORS.elite, text: COLORS.white };
  const percentile = (value - 1) / Math.max(1, max - 1);
  if (percentile <= 0.18) return { fill: COLORS.elite, text: COLORS.white };
  if (percentile <= 0.42) return { fill: COLORS.good, text: COLORS.black };
  if (percentile <= 0.62) return { fill: COLORS.lightGray, text: COLORS.black };
  if (percentile <= 0.84) return { fill: COLORS.concern, text: COLORS.black };
  return { fill: COLORS.poor, text: COLORS.white };
}

function categoryColor(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (normalized === "3pt" || normalized === "3pt allowed") return COLORS.orange;
  if (normalized === "atr" || normalized === "rim") return COLORS.pink;
  if (normalized === "ft line") return COLORS.gray;
  if (normalized === "non-rim paint") return COLORS.cyan;
  if (normalized === "long 2") return COLORS.teal;
  if (normalized === "scoring") return COLORS.darkGreen;
  return COLORS.black;
}

function measure(font, text, size) {
  return font.widthOfTextAtSize(pdfText(text), size);
}

function truncateText(text, font, size, maxWidth) {
  const safe = pdfText(text);
  if (measure(font, safe, size) <= maxWidth) return safe;
  let next = safe;
  while (next.length > 1 && measure(font, `${next}...`, size) > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next.trimEnd()}...`;
}

function wrapText(text, font, size, maxWidth, maxLines = 2) {
  const words = pdfText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(font, candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) return lines.slice(0, maxLines);
  if (words.length && lines.length === maxLines) {
    const usedWords = lines.join(" ").split(/\s+/).length;
    if (usedWords < words.length) {
      lines[maxLines - 1] = truncateText(lines[maxLines - 1], font, size, maxWidth);
    }
  }
  return lines.length ? lines : [""];
}

function drawText(page, text, x, y, options) {
  page.drawText(pdfText(text), {
    x,
    y,
    ...options,
  });
}

function drawImageContain(page, image, x, y, width, height) {
  if (!image) return;
  const scaled = image.scaleToFit(width, height);
  page.drawImage(image, {
    x: x + (width - scaled.width) / 2,
    y: y + (height - scaled.height) / 2,
    width: scaled.width,
    height: scaled.height,
  });
}

function playerInitials(player) {
  return String(player?.name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "NBA";
}

function drawHeadshotFallback(page, fonts, player, x, y, width, height) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: COLORS.lightGray,
    borderColor: COLORS.lightLine,
    borderWidth: 0.8,
  });
  drawCenteredText(page, fonts, playerInitials(player), x, y + height / 2 - 6, width, {
    font: fonts.bold,
    size: 14,
    color: COLORS.muted,
  });
}

function drawCenteredText(page, fonts, text, x, y, width, options) {
  const size = options.size || 7;
  const font = options.font || fonts.regular;
  const safe = truncateText(text, font, size, width - 2);
  const textWidth = measure(font, safe, size);
  drawText(page, safe, x + Math.max(1, (width - textWidth) / 2), y, options);
}

function drawHeader(page, fonts, { eyebrow, title, rightText = "", logo = null }) {
  page.drawRectangle({
    x: MARGIN_X,
    y: TOP_Y - 4,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: 2,
    color: COLORS.blue,
  });
  const textX = logo ? MARGIN_X + 42 : MARGIN_X;
  if (logo) drawImageContain(page, logo, MARGIN_X, TOP_Y - 43, 31, 31);
  drawText(page, eyebrow, textX, TOP_Y - 23, {
    font: fonts.bold,
    size: 7.2,
    color: COLORS.muted,
  });
  drawText(page, title, textX, TOP_Y - 40, {
    font: fonts.bold,
    size: 15,
    color: COLORS.black,
  });
  if (rightText) {
    const width = measure(fonts.bold, rightText, 8.5);
    drawText(page, rightText, PAGE_WIDTH - MARGIN_X - width, TOP_Y - 31, {
      font: fonts.bold,
      size: 8.5,
      color: COLORS.black,
    });
  }
  page.drawLine({
    start: { x: MARGIN_X, y: TOP_Y - 52 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: TOP_Y - 52 },
    thickness: 0.7,
    color: COLORS.lightLine,
  });
  return TOP_Y - 70;
}

function metricLayout(x, options = {}) {
  const {
    textWidth = 354,
    rankWidth = 34,
    valueWidth = 72,
    categoryWidth = 80,
    columnGap = 6,
  } = options;
  const rankX = x + textWidth + columnGap;
  const valueX = rankX + rankWidth + columnGap;
  const categoryX = valueX + valueWidth + columnGap;
  return {
    textWidth,
    rankWidth,
    valueWidth,
    categoryWidth,
    columnGap,
    rankX,
    valueX,
    categoryX,
  };
}

function drawColumnHeaders(page, fonts, x, y, rowOptions, labels) {
  const layout = metricLayout(x, rowOptions);
  drawCenteredText(page, fonts, labels.rankTop, layout.rankX, y, layout.rankWidth, {
    font: fonts.bold,
    size: 6.7,
    color: COLORS.black,
  });
  drawCenteredText(page, fonts, labels.rankBottom, layout.rankX, y - 8, layout.rankWidth, {
    font: fonts.bold,
    size: 6.1,
    color: COLORS.headerGray,
  });
  drawCenteredText(
    page,
    fonts,
    labels.keyTop,
    layout.valueX,
    y,
    layout.valueWidth + layout.columnGap + layout.categoryWidth,
    {
      font: fonts.bold,
      size: 6.7,
      color: COLORS.black,
    },
  );
  drawCenteredText(
    page,
    fonts,
    labels.keyBottom,
    layout.valueX,
    y - 8,
    layout.valueWidth + layout.columnGap + layout.categoryWidth,
    {
      font: fonts.bold,
      size: 6.1,
      color: COLORS.headerGray,
    },
  );
  return y - 22;
}

function drawPill(page, fonts, { x, y, width, height, text, fill, color = COLORS.white, size = 7.2 }) {
  page.drawRectangle({ x, y, width, height, color: fill });
  const safe = truncateText(text, fonts.bold, size, width - 6);
  const textWidth = measure(fonts.bold, safe, size);
  drawText(page, safe, x + Math.max(3, (width - textWidth) / 2), y + (height - size) / 2 + 1, {
    font: fonts.bold,
    size,
    color,
  });
}

function drawMetricRow(page, fonts, row, x, y, options = {}) {
  const {
    width = PAGE_WIDTH - MARGIN_X * 2,
    textWidth = 354,
    rankWidth = 34,
    valueWidth = 72,
    categoryWidth = 80,
    columnGap = 6,
    rowHeight = 17.4,
    textSize = 7.15,
    stripe = false,
    rankMode = "percentile",
    maxRank = null,
  } = options;
  const layout = metricLayout(x, { textWidth, rankWidth, valueWidth, categoryWidth, columnGap });
  if (stripe) {
    page.drawRectangle({ x, y: y - 3, width, height: rowHeight, color: COLORS.lightGray });
  }
  page.drawLine({
    start: { x, y: y - 3 },
    end: { x: x + width, y: y - 3 },
    thickness: 0.55,
    color: COLORS.line,
  });
  const textLines = wrapText(row?.text || "", fonts.regular, textSize, textWidth, 2);
  textLines.forEach((line, index) => {
    drawText(page, line, x + 4, y + 5.8 - index * (textSize + 1), {
      font: fonts.regular,
      size: textSize,
      color: COLORS.black,
    });
  });
  const rankStyle = rankColor(row?.rank, { mode: rankMode, maxRank });
  drawPill(page, fonts, {
    x: layout.rankX,
    y: y + 1,
    width: rankWidth,
    height: 13,
    text: row?.rank ?? "-",
    fill: rankStyle.fill,
    color: rankStyle.text,
    size: 7.2,
  });
  drawText(page, truncateText(row?.displayValue || "-", fonts.bold, 7.4, valueWidth), layout.valueX, y + 4, {
    font: fonts.bold,
    size: 7.4,
    color: COLORS.black,
  });
  const categoryLabel = row?.statLabel || row?.category || "";
  drawPill(page, fonts, {
    x: layout.categoryX,
    y: y + 1,
    width: categoryWidth,
    height: 13,
    text: categoryLabel,
    fill: categoryColor(categoryLabel),
    color: COLORS.white,
    size: 6.15,
  });
  return y - rowHeight;
}

function drawReportSections(page, fonts, sections, startY, options = {}) {
  let y = startY;
  const rowOptions = options.rowOptions || {};
  if (options.columnHeader) {
    y = drawColumnHeaders(page, fonts, MARGIN_X, y + 3, rowOptions, options.columnHeader);
    y -= options.afterColumnHeader || 3;
  }
  sections.forEach((section) => {
    drawText(page, section.title, MARGIN_X, y, {
      font: fonts.bold,
      size: options.headingSize || 11.5,
      color: COLORS.black,
    });
    y -= options.afterHeading || 14;
    const rows = Array.isArray(section.rows) ? section.rows : [];
    rows.forEach((row, index) => {
      y = drawMetricRow(page, fonts, row, MARGIN_X, y, {
        ...rowOptions,
        stripe: index % 2 === 1,
      });
    });
    y -= options.sectionGap || 8;
  });
  return y;
}

function drawCover(pdfDoc, fonts, report, assets = {}) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const team = report.team || {};
  page.drawRectangle({
    x: MARGIN_X,
    y: TOP_Y - 5,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: 2.5,
    color: COLORS.blue,
  });
  drawImageContain(page, assets.teamLogo, MARGIN_X, TOP_Y - 73, 54, 54);
  const titleX = assets.teamLogo ? MARGIN_X + 70 : MARGIN_X;
  drawText(page, pdfText(team.fullName || "NBA"), titleX, TOP_Y - 45, {
    font: fonts.bold,
    size: 21,
    color: COLORS.black,
  });
  drawText(page, "Advanced Insights Report", titleX, TOP_Y - 82, {
    font: fonts.bold,
    size: 34,
    color: COLORS.black,
  });
  drawText(page, report.selection?.rangeLabel || "", titleX, TOP_Y - 105, {
    font: fonts.bold,
    size: 12,
    color: COLORS.muted,
  });

  const cardY = TOP_Y - 210;
  [
    ["Team Breakdown", "Team offense, scoring mix, shot profile, opponent tendencies, rank context, and key stats."],
    ["Player Breakdowns", "Split tables, usage indicators, scoring mix, shooting zones, on/off impact, and team rank context."],
  ].forEach(([title, body], index) => {
    const x = MARGIN_X + index * 282;
    page.drawLine({
      start: { x, y: cardY },
      end: { x: x + 248, y: cardY },
      thickness: 1.4,
      color: COLORS.black,
    });
    drawText(page, title, x, cardY - 26, {
      font: fonts.bold,
      size: 16,
      color: COLORS.black,
    });
    wrapText(body, fonts.regular, 10.5, 240, 3).forEach((line, lineIndex) => {
      drawText(page, line, x, cardY - 50 - lineIndex * 14, {
        font: fonts.regular,
        size: 10.5,
        color: COLORS.black,
      });
    });
  });

  drawText(page, "Situational Points Per Possession is excluded until Synergy access is available.", MARGIN_X, BOTTOM_Y + 18, {
    font: fonts.regular,
    size: 9,
    color: COLORS.muted,
  });
}

function drawTeamLikePage(pdfDoc, fonts, report, { title, eyebrow, sections }, assets = {}) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const y = drawHeader(page, fonts, {
    eyebrow,
    title,
    rightText: report.selection?.rangeLabel || "",
    logo: assets.teamLogo,
  });
  drawReportSections(page, fonts, sections, y, {
    columnHeader: {
      rankTop: "%RANK",
      rankBottom: "NBA",
      keyTop: "KEY STATS",
      keyBottom: reportWindowLabel(report.selection).toUpperCase(),
    },
    rowOptions: {
      rowHeight: 17.2,
      textSize: 6.85,
      textWidth: 354,
      rankWidth: 34,
      valueWidth: 72,
      categoryWidth: 80,
      columnGap: 6,
    },
    afterHeading: 13,
    sectionGap: 8,
    headingSize: 11.2,
  });
}

function drawCards(page, fonts, cards, y, options = {}) {
  const startX = options.x ?? MARGIN_X;
  const cardWidth = options.cardWidth ?? 105;
  const gap = 8;
  cards.slice(0, 5).forEach((card, index) => {
    const x = startX + index * (cardWidth + gap);
    page.drawRectangle({ x, y: y - 35, width: cardWidth, height: 35, color: COLORS.lightGray });
    drawText(page, card.label || "", x + 6, y - 12, {
      font: fonts.bold,
      size: 6.4,
      color: COLORS.muted,
    });
    drawText(page, card.value || "-", x + 6, y - 27, {
      font: fonts.bold,
      size: 11,
      color: COLORS.black,
    });
  });
  return y - 46;
}

function drawSplitTable(page, fonts, rows, y) {
  const columns = [
    ["Split", 52, "label"],
    ["MPG", 27, "mpg"],
    ["PPG", 27, "ppg"],
    ["FGM/A", 44, "fgmA"],
    ["FG%", 34, "fgPct"],
    ["3PM/A", 44, "threePmA"],
    ["3P%", 34, "threePct"],
    ["FTM/A", 44, "ftmA"],
    ["FT%", 34, "ftPct"],
    ["OFF", 24, "off"],
    ["DEF", 24, "def"],
    ["TOT", 24, "tot"],
    ["APG", 24, "apg"],
    ["TO", 22, "to"],
    ["BLK", 22, "blk"],
    ["STL", 22, "stl"],
    ["PF", 22, "pf"],
  ];
  let x = MARGIN_X;
  page.drawRectangle({ x: MARGIN_X, y: y - 11, width: PAGE_WIDTH - MARGIN_X * 2, height: 13, color: COLORS.lightGray });
  columns.forEach(([label, width]) => {
    drawText(page, label, x + 2, y - 7, {
      font: fonts.bold,
      size: 5.6,
      color: COLORS.black,
    });
    x += Number(width);
  });
  y -= 18;
  (Array.isArray(rows) ? rows : []).slice(0, 5).forEach((row) => {
    x = MARGIN_X;
    columns.forEach(([, width, key]) => {
      drawText(page, truncateText(row?.[key] || "-", fonts.regular, 5.8, Number(width) - 3), x + 2, y, {
        font: fonts.regular,
        size: 5.8,
        color: COLORS.black,
      });
      x += Number(width);
    });
    page.drawLine({
      start: { x: MARGIN_X, y: y - 4 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: y - 4 },
      thickness: 0.35,
      color: COLORS.lightLine,
    });
    y -= 12;
  });
  return y - 4;
}

function drawPlayerPage(pdfDoc, fonts, report, playerReport, assets = {}, maxRank = null) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const player = playerReport.player || {};
  let y = drawHeader(page, fonts, {
    eyebrow: `${report.team?.fullName || "NBA"} ${report.selection?.season || ""}`,
    title: player.name || "Player Report",
    rightText: reportWindowLabel(report.selection),
    logo: assets.teamLogo,
  });

  const headshot = assets.playerHeadshots?.get(String(player.playerId || ""));
  const headshotBottom = y - 42;
  if (headshot) drawImageContain(page, headshot, MARGIN_X, headshotBottom, 72, 72);
  else drawHeadshotFallback(page, fonts, player, MARGIN_X, headshotBottom, 72, 72);
  y = drawCards(page, fonts, playerReport.cards || [], y + 8, {
    x: MARGIN_X + 88,
    cardWidth: 86.5,
  });
  y = Math.min(y, headshotBottom - 8);
  y = drawSplitTable(page, fonts, playerReport.splitRows || [], y);
  drawReportSections(page, fonts, playerReport.sections || [], y - 3, {
    columnHeader: {
      rankTop: "RANK",
      rankBottom: "TEAM",
      keyTop: "KEY STATS",
      keyBottom: reportWindowLabel(report.selection).toUpperCase(),
    },
    rowOptions: {
      rowHeight: 15.2,
      textSize: 6.15,
      textWidth: 342,
      rankWidth: 30,
      valueWidth: 78,
      categoryWidth: 78,
      columnGap: 6,
      rankMode: "ordinal",
      maxRank,
    },
    afterHeading: 11,
    sectionGap: 5,
    headingSize: 10.3,
  });
}

function safeFileName(value) {
  return pdfText(value)
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "NBA Insight Report";
}

function reportWindowLabel(selection = {}) {
  const games = Number(selection.lastNGames);
  if (games === 0) return "All Games";
  if (Number.isFinite(games) && games > 0) return `${games} Games`;
  return "Selected Games";
}

function maxPlayerRank(playerReports) {
  const ranks = (Array.isArray(playerReports) ? playerReports : [])
    .flatMap((playerReport) => (Array.isArray(playerReport.sections) ? playerReport.sections : []))
    .flatMap((section) => (Array.isArray(section.rows) ? section.rows : []))
    .map((row) => Number(row?.rank))
    .filter((rank) => Number.isFinite(rank) && rank > 0);
  return Math.max(playerReports.length || 1, ...ranks);
}

export async function createAnalyticsReportPdfBytes(report) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${report.team?.fullName || "NBA"} Insight Report`);
  pdfDoc.setSubject(report.selection?.rangeLabel || "Analytics Report");
  pdfDoc.setCreator("NBA Dash");
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  const assets = await loadReportAssets(pdfDoc, report);
  const playerReports = Array.isArray(report.playerReports) ? report.playerReports : [];

  drawCover(pdfDoc, fonts, report, assets);
  drawTeamLikePage(pdfDoc, fonts, report, {
    eyebrow: "Team Breakdown",
    title: `${report.team?.fullName || "Team"} Team Report`,
    sections: report.teamReport?.sections || [],
  }, assets);
  drawTeamLikePage(pdfDoc, fonts, report, {
    eyebrow: "Defensive Breakdown",
    title: "Opponent Report",
    sections: report.opponentReport?.sections || [],
  }, assets);
  const playerRankMax = maxPlayerRank(playerReports);
  playerReports.forEach((playerReport) => {
    drawPlayerPage(pdfDoc, fonts, report, playerReport, assets, playerRankMax);
  });

  return pdfDoc.save();
}

export async function downloadAnalyticsReportPdf(report) {
  if (!report || typeof document === "undefined" || typeof URL === "undefined") return;
  const bytes = await createAnalyticsReportPdfBytes(report);
  const teamName = report.team?.fullName || "NBA";
  const fileName = `${safeFileName(teamName)} Insight Report - ${safeFileName(reportWindowLabel(report.selection))}.pdf`;
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
