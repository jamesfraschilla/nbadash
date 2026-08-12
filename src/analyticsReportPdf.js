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
  white: rgb(1, 1, 1),
  elite: rgb(0, 0.5, 0.04),
  good: rgb(0.56, 0.93, 0.57),
  concern: rgb(1, 0.64, 0),
  poor: rgb(0.82, 0, 0),
};

function pdfText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

function rankColor(rank) {
  const value = Number(rank);
  if (!Number.isFinite(value)) return { fill: COLORS.lightGray, text: COLORS.black };
  if (value <= 10) return { fill: COLORS.elite, text: COLORS.white };
  if (value <= 40) return { fill: COLORS.good, text: COLORS.black };
  if (value <= 60) return { fill: COLORS.lightGray, text: COLORS.black };
  if (value <= 90) return { fill: COLORS.concern, text: COLORS.black };
  return { fill: COLORS.poor, text: COLORS.white };
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

function drawHeader(page, fonts, { eyebrow, title, rightText = "" }) {
  page.drawRectangle({
    x: MARGIN_X,
    y: TOP_Y - 4,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: 2,
    color: COLORS.blue,
  });
  drawText(page, eyebrow, MARGIN_X, TOP_Y - 23, {
    font: fonts.bold,
    size: 7.2,
    color: COLORS.muted,
  });
  drawText(page, title, MARGIN_X, TOP_Y - 40, {
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
    textWidth = 372,
    rankWidth = 34,
    valueWidth = 76,
    categoryWidth = 92,
    rowHeight = 17.4,
    textSize = 7.15,
    stripe = false,
  } = options;
  const rankX = x + textWidth + 8;
  const valueX = rankX + rankWidth + 8;
  const categoryX = valueX + valueWidth + 8;
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
    drawText(page, line, x + 4, y + 6 - index * (textSize + 1), {
      font: fonts.regular,
      size: textSize,
      color: COLORS.black,
    });
  });
  const rankStyle = rankColor(row?.rank);
  drawPill(page, fonts, {
    x: rankX,
    y: y + 1,
    width: rankWidth,
    height: 13,
    text: row?.rank ?? "-",
    fill: rankStyle.fill,
    color: rankStyle.text,
    size: 7.2,
  });
  drawText(page, truncateText(row?.displayValue || "-", fonts.bold, 7.4, valueWidth), valueX, y + 4, {
    font: fonts.bold,
    size: 7.4,
    color: COLORS.black,
  });
  drawPill(page, fonts, {
    x: categoryX,
    y: y + 1,
    width: categoryWidth,
    height: 13,
    text: row?.statLabel || row?.category || "",
    fill: COLORS.black,
    color: COLORS.white,
    size: 6.6,
  });
  return y - rowHeight;
}

function drawReportSections(page, fonts, sections, startY, options = {}) {
  let y = startY;
  const rowOptions = options.rowOptions || {};
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

function drawCover(pdfDoc, fonts, report) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const team = report.team || {};
  page.drawRectangle({
    x: MARGIN_X,
    y: TOP_Y - 5,
    width: PAGE_WIDTH - MARGIN_X * 2,
    height: 2.5,
    color: COLORS.blue,
  });
  drawText(page, pdfText(team.fullName || "NBA"), MARGIN_X, TOP_Y - 45, {
    font: fonts.bold,
    size: 21,
    color: COLORS.black,
  });
  drawText(page, "Advanced Insights Report", MARGIN_X, TOP_Y - 82, {
    font: fonts.bold,
    size: 34,
    color: COLORS.black,
  });
  drawText(page, report.selection?.rangeLabel || "", MARGIN_X, TOP_Y - 105, {
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

function drawTeamLikePage(pdfDoc, fonts, report, { title, eyebrow, sections }) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const y = drawHeader(page, fonts, {
    eyebrow,
    title,
    rightText: report.selection?.rangeLabel || "",
  });
  drawReportSections(page, fonts, sections, y, {
    rowOptions: {
      rowHeight: 16.5,
      textSize: 6.95,
      textWidth: 372,
      valueWidth: 76,
      categoryWidth: 92,
    },
    afterHeading: 13,
    sectionGap: 7,
    headingSize: 11.2,
  });
}

function drawCards(page, fonts, cards, y) {
  const cardWidth = 105;
  const gap = 8;
  cards.slice(0, 5).forEach((card, index) => {
    const x = MARGIN_X + index * (cardWidth + gap);
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

function drawPlayerPage(pdfDoc, fonts, report, playerReport) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const player = playerReport.player || {};
  let y = drawHeader(page, fonts, {
    eyebrow: `${report.team?.fullName || "NBA"} ${report.selection?.season || ""}`,
    title: player.name || "Player Report",
    rightText: `${report.selection?.lastNGames || ""} Games`,
  });

  y = drawCards(page, fonts, playerReport.cards || [], y + 8);
  y = drawSplitTable(page, fonts, playerReport.splitRows || [], y);
  drawReportSections(page, fonts, playerReport.sections || [], y - 3, {
    rowOptions: {
      rowHeight: 14.7,
      textSize: 6.25,
      textWidth: 358,
      rankWidth: 30,
      valueWidth: 82,
      categoryWidth: 84,
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

export async function createAnalyticsReportPdfBytes(report) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${report.team?.fullName || "NBA"} Insight Report`);
  pdfDoc.setSubject(report.selection?.rangeLabel || "Analytics Report");
  pdfDoc.setCreator("NBA Dash");
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  drawCover(pdfDoc, fonts, report);
  drawTeamLikePage(pdfDoc, fonts, report, {
    eyebrow: "Team Breakdown",
    title: `${report.team?.fullName || "Team"} Team Report`,
    sections: report.teamReport?.sections || [],
  });
  drawTeamLikePage(pdfDoc, fonts, report, {
    eyebrow: "Defensive Breakdown",
    title: "Opponent Report",
    sections: report.opponentReport?.sections || [],
  });
  (Array.isArray(report.playerReports) ? report.playerReports : []).forEach((playerReport) => {
    drawPlayerPage(pdfDoc, fonts, report, playerReport);
  });

  return pdfDoc.save();
}

export async function downloadAnalyticsReportPdf(report) {
  if (!report || typeof document === "undefined" || typeof URL === "undefined") return;
  const bytes = await createAnalyticsReportPdfBytes(report);
  const teamName = report.team?.fullName || "NBA";
  const games = report.selection?.lastNGames || "Selected";
  const fileName = `${safeFileName(teamName)} Insight Report - ${games} Games.pdf`;
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
