import { fetchNbaPlayerStats } from "./api.js";
import { buildEmptyCoverageSlots } from "./coverageGraphic.js";
import { renderCoverageGraphicCanvas } from "./pages/coverageGraphicExport.js";
import { renderMatchupGraphicCanvas } from "./pages/matchupGraphicExport.js";
import { exportPersonnelGraphics, renderPersonnelGraphic } from "./pages/personnelGraphicExport.js";
import {
  clearPersonnelStatOverridesForSeason,
  createPersonnelDraft,
  populatePersonnelDraftFromRoster,
} from "./personnelGraphic.js";
import { PERSONNEL_LAYOUT } from "./personnelGraphicLayout.js";
import { createSerialTaskQueue } from "./serialTaskQueue.js";
import { saveToolRecordRemote } from "./toolVault.js";
import { buildGameAlerts, selectPrimaryGameAlert } from "./gameAlerts.js";
import { resolveFeatureAccess } from "./featureAccess.js";

const player = {
  personId: "",
  jerseyNum: "27",
  fullName: "Alex Riley",
  familyName: "Riley",
};
const stats = {
  pointsPerGame: 10.3,
  reboundsPerGame: 2.9,
  threePointPercentage: 31.6,
  assistsPerGame: 2,
  fieldGoalAttemptsPerGame: 8.2,
  threePointAttemptsPerGame: 3.2,
};
const selectedStats = ["ppg", "threePointPercentage", "rpg", "apg"];

window.runLiveAlertRegression = () => {
  const awayTeam = { teamId: "1", teamName: "Nets", teamTricode: "BKN" };
  const homeTeam = { teamId: "2", teamName: "Thunder", teamTricode: "OKC" };
  const unfinishedActions = [
    { actionNumber: 1, orderNumber: 1, period: 1, clock: "PT09M00.00S", possession: "1", teamId: "1", actionType: "turnover", personId: 101 },
    { actionNumber: 2, orderNumber: 2, period: 1, clock: "PT08M45.00S", possession: "2", teamId: "2", actionType: "2pt", shotResult: "Made", scoreAway: "0", scoreHome: "2", personId: 201 },
    { actionNumber: 3, orderNumber: 3, period: 1, clock: "PT08M20.00S", possession: "1", teamId: "1", actionType: "turnover", personId: 101 },
    { actionNumber: 4, orderNumber: 4, period: 1, clock: "PT08M00.00S", possession: "2", teamId: "2", actionType: "2pt", shotResult: "Made", scoreAway: "0", scoreHome: "4", personId: 201 },
    { actionNumber: 5, orderNumber: 5, period: 1, clock: "PT07M40.00S", possession: "1", teamId: "1", actionType: "2pt", shotResult: "Missed", personId: 101 },
    { actionNumber: 6, orderNumber: 6, period: 1, clock: "PT07M38.00S", possession: "1", teamId: "1", actionType: "rebound", subType: "offensive", personId: 101 },
  ];
  const unfinishedAlerts = buildGameAlerts({
    game: { gameId: "0022600001", gameStatus: 2, period: 1, gameClock: "PT07M38.00S", playByPlayActions: unfinishedActions },
    awayTeam,
    homeTeam,
  });
  const halftimeActions = [
    { actionNumber: 1, orderNumber: 1, period: 1, clock: "PT08M00.00S", teamId: "1", actionType: "2pt", shotResult: "Made", scoreAway: "2", scoreHome: "0", personId: 101 },
    { actionNumber: 2, orderNumber: 2, period: 2, clock: "PT08M00.00S", teamId: "2", actionType: "2pt", shotResult: "Made", scoreAway: "2", scoreHome: "2", personId: 201 },
    { actionNumber: 3, orderNumber: 3, period: 2, clock: "PT00M00.00S", actionType: "period", subType: "end", scoreAway: "2", scoreHome: "2" },
  ];
  const halftimeAlerts = buildGameAlerts({
    game: { gameId: "0012600009", gameStatus: 2, period: 2, gameClock: "PT08M51.00S", playByPlayActions: halftimeActions },
    awayTeam,
    homeTeam,
  });
  return {
    unfinishedHasEmptyAlert: unfinishedAlerts.some((alert) => alert.category === "Empty Possessions" || alert.category === "Kill"),
    halftimePrimaryCategory: selectPrimaryGameAlert(halftimeAlerts)?.category || "",
  };
};

window.runFeatureAccessRegression = () => {
  const flags = new Set(["graphics"]);
  return resolveFeatureAccess({ accountsEnabled: true, hasFeature: (flag) => flags.has(flag) });
};

async function makeDeterministicHeadshot() {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 500;
  const context = canvas.getContext("2d");
  context.fillStyle = "#c41e3a";
  context.fillRect(120, 260, 360, 240);
  context.fillStyle = "#8b5a3c";
  context.beginPath();
  context.arc(300, 170, 105, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#171717";
  context.beginPath();
  context.arc(300, 145, 108, Math.PI, Math.PI * 2);
  context.fill();
  return createImageBitmap(canvas);
}

window.renderPersonnelGolden = async () => {
  const canvas = await renderPersonnelGraphic({
    player,
    stats,
    selectedStats,
    tags: [],
    threePointColor: "dark_green",
    teamId: "",
    logoImage: null,
    tagImages: {},
    headshotImage: await makeDeterministicHeadshot(),
  });
  canvas.toDataURL("image/png");
  canvas.id = "personnel-golden";
  document.querySelector("#root").replaceChildren(canvas);
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
};

window.exportPersonnelGoldenZip = () => exportPersonnelGraphics({
  team: { tricode: "TST", fullName: "Test Team" },
  teamId: "",
  items: [
    { player, stats, selectedStats, tags: [], threePointColor: "dark_green" },
    {
      player: { ...player, jerseyNum: "5", familyName: "Sample", fullName: "Jamie Sample" },
      stats: { ...stats, pointsPerGame: 12.1 },
      selectedStats,
      tags: [],
      threePointColor: "bright_green",
    },
  ],
});

window.renderPersonnelFireColorRegression = async () => {
  const canvas = await renderPersonnelGraphic({
    player,
    stats,
    selectedStats,
    tags: ["fire"],
    threePointColor: "red",
    teamId: "",
    logoImage: null,
    tagImages: {},
    headshotImage: await makeDeterministicHeadshot(),
  });
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { x, y, height } = PERSONNEL_LAYOUT.threePointBar;
  const [r, g, b, a] = context.getImageData(x + 12, y + Math.floor(height / 2), 1, 1).data;
  return { r, g, b, a };
};

function readPixel(canvas, x, y) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
  return { r, g, b, a };
}

function countPixelMismatches(leftCanvas, rightCanvas) {
  const leftContext = leftCanvas.getContext("2d", { willReadFrequently: true });
  const rightContext = rightCanvas.getContext("2d", { willReadFrequently: true });
  const leftPixels = leftContext.getImageData(0, 0, leftCanvas.width, leftCanvas.height).data;
  const rightPixels = rightContext.getImageData(0, 0, rightCanvas.width, rightCanvas.height).data;
  if (leftPixels.length !== rightPixels.length) return Number.POSITIVE_INFINITY;
  let mismatches = 0;
  for (let index = 0; index < leftPixels.length; index += 1) {
    if (leftPixels[index] !== rightPixels[index]) mismatches += 1;
  }
  return mismatches;
}

window.renderCoverageColumnRegression = async () => {
  const twoColumnSlots = buildEmptyCoverageSlots();
  twoColumnSlots[0] = { ...twoColumnSlots[0], subtitle: "5", iconKey: "vol-1" };
  twoColumnSlots[2] = { ...twoColumnSlots[2], subtitle: "Peterson / Hinson", iconKey: "war" };
  const twoColumnCanvas = await renderCoverageGraphicCanvas({
    slots: twoColumnSlots,
    columnHeaders: ["P/R", "DHO + C&S", ""],
    columnCount: 3,
    logoTeamId: "",
    outputWidth: 960,
    outputHeight: 540,
  });

  const threeColumnSlots = buildEmptyCoverageSlots();
  threeColumnSlots[0] = { ...threeColumnSlots[0], subtitle: "5", iconKey: "vol-1" };
  threeColumnSlots[2] = { ...threeColumnSlots[2], subtitle: "Peterson / Hinson", iconKey: "war" };
  threeColumnSlots[4] = { ...threeColumnSlots[4], subtitle: "Jamir on Peterson" };
  const threeColumnCanvas = await renderCoverageGraphicCanvas({
    slots: threeColumnSlots,
    columnHeaders: ["P/R", "DHO + C&S", "MISC"],
    columnCount: 3,
    logoTeamId: "",
    outputWidth: 960,
    outputHeight: 540,
  });

  return {
    twoColumnMiddleSeparator: readPixel(twoColumnCanvas, 480, 270),
    twoColumnFirstThirdSeparator: readPixel(twoColumnCanvas, 344, 270),
    threeColumnFirstSeparator: readPixel(threeColumnCanvas, 344, 270),
    threeColumnSecondSeparator: readPixel(threeColumnCanvas, 616, 270),
  };
};

window.renderPartialMatchupSlotRegression = async () => {
  const emptyCanvas = await renderMatchupGraphicCanvas({
    leftPlayers: [],
    rightPlayers: [],
    logoTeamId: "",
    width: 480,
    height: 270,
  });
  const nullSlotCanvas = await renderMatchupGraphicCanvas({
    leftPlayers: [null, null, null, null, null],
    rightPlayers: [null, null, null, null, null],
    logoTeamId: "",
    width: 480,
    height: 270,
  });
  return {
    mismatches: countPixelMismatches(emptyCanvas, nullSlotCanvas),
  };
};

window.fetchPersonnelStatsForTest = (options) => fetchNbaPlayerStats(options);

window.runPersonnelStateRegression = () => {
  const draft = populatePersonnelDraftFromRoster(
    createPersonnelDraft({ league: "gleague", teamId: "1612709928", season: "2025-26" }),
    [{ personId: "g-1", teamId: "1612709928", fullName: "G League Player" }],
    { league: "gleague", teamId: "1612709928" }
  );
  draft.rows[0].statOverrides = { ppg: "14.2" };
  const changed = clearPersonnelStatOverridesForSeason(draft, "2026-27");
  return {
    league: changed.league,
    teamId: changed.teamId,
    season: changed.season,
    personId: changed.rows[0].personId,
    statOverrides: changed.rows[0].statOverrides,
  };
};

window.runAutosaveOrderRegression = async () => {
  const queue = createSerialTaskQueue();
  const values = [];
  queue.run(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    values.push("first");
  });
  queue.run(async () => values.push("second"));
  await queue.wait();
  return values;
};

window.runToolConflictRegression = async () => {
  try {
    await saveToolRecordRemote("00000000-0000-0000-0000-000000000001", {
      id: "00000000-0000-0000-0000-000000000002",
      type: "personnel_graphic",
      title: "Conflict test",
      payload: {},
      revision: 1,
    });
    return "no conflict";
  } catch (error) {
    return error?.message || String(error);
  }
};
