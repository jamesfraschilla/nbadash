import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { createAnalyticsReportPdfBytes } from "./analyticsReportPdf.js";

function metric(text, rank = 12) {
  return {
    text,
    rank,
    displayValue: "54.2%",
    statLabel: "Shooting",
    category: "Shooting",
  };
}

function section(title, count) {
  return {
    title,
    rows: Array.from({ length: count }, (_, index) => metric(`${title} row ${index + 1}.`, index + 1)),
  };
}

function playerReport(name, playerId) {
  return {
    player: {
      playerId,
      name,
    },
    cards: [
      { label: "% of Poss", value: "31.4%", rank: 8 },
      { label: "Usage %", value: "25.2%", rank: 12 },
      { label: "EFG%", value: "58.9%", rank: 18 },
      { label: "TS%", value: "61.5%", rank: 16 },
      { label: "On Court +/-", value: "0.11 PPP", rank: 20 },
    ],
    splitRows: [
      { label: "Overall", mpg: "28.2", ppg: "18.0", fgmA: "7.0/11.1", fgPct: "63.4%", threePmA: "0.0/0.0", threePct: "0.0%", ftmA: "4.0/5.4", ftPct: "73.1%", off: "3.8", def: "6.9", tot: "10.7", apg: "1.8", to: "1.9", blk: "0.8", stl: "0.9", pf: "2.9" },
    ],
    sections: [
      section("About Player", 8),
      section("How They Score", 6),
      section("How They Play", 6),
    ],
  };
}

test("analytics report PDF uses one page for each major report section", async () => {
  const report = {
    team: {
      fullName: "Washington Wizards",
    },
    selection: {
      rangeLabel: "2025-26 Statistics | 10 Games",
      season: "2025-26",
      lastNGames: 10,
    },
    teamReport: {
      sections: [
        section("About Team", 7),
        section("How They Score Offensively", 7),
        section("How They Play", 11),
      ],
    },
    opponentReport: {
      sections: [
        section("About Opponent", 7),
        section("How Opponents Score", 7),
        section("How Opponents Play", 11),
      ],
    },
    playerReports: [
      playerReport("Player One", "1"),
      playerReport("Player Two", "2"),
      playerReport("Player Three", "3"),
    ],
  };

  const bytes = await createAnalyticsReportPdfBytes(report);
  const pdf = await PDFDocument.load(bytes);

  assert.equal(pdf.getPageCount(), 6);
});
