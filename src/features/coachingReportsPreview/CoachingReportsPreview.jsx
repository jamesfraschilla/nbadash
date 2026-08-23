"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import "./CoachingReportsPreview.css";
import wizardsLogoUrl from "./assets/wizards-primary-icon.png";

const teamLogoModules = import.meta.glob("./assets/team-logos/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

const teamLogoUrls = Object.fromEntries(
  Object.entries(teamLogoModules).map(([path, url]) => [
    path.match(/\/([A-Z]{2,3})\.svg$/)?.[1],
    url,
  ]),
);

function getTeamLogoUrl(teamAbbreviation) {
  return teamLogoUrls[teamAbbreviation] || wizardsLogoUrl;
}

const players = [
  { number: "7", name: "Bub Carrington", position: "G", crashCount: 14, crashOpps: 25, crashPct: 56, disruptions: 5, steals: 2, blocks: 1, charges: 0, deflections: 2, scoringPasses: 13, turnovers: 3, scoringPassesPerTo: 4.3, kickAheads: 2.6, strikes: 1.4, paintTouches: 7, passes: 62 },
  { number: "27", name: "Will Riley", position: "F", crashCount: 20, crashOpps: 30, crashPct: 67, disruptions: 3.2, steals: 1.1, blocks: 0.4, charges: 0.2, deflections: 1.5, scoringPasses: 5, turnovers: 2, scoringPassesPerTo: 2.5, kickAheads: 2.2, strikes: 1.1, paintTouches: 8, passes: 42 },
  { number: "5", name: "Jamir Watkins", position: "F", crashCount: 11, crashOpps: 21, crashPct: 52, disruptions: 2.6, steals: 1, blocks: 0.7, charges: 0.1, deflections: 0.8, scoringPasses: 4, turnovers: 1, scoringPassesPerTo: 4, kickAheads: 2, strikes: 0.8, paintTouches: 5, passes: 28 },
  { number: "16", name: "Justin Champagnie", position: "F", crashCount: 20, crashOpps: 24, crashPct: 83, disruptions: 9, steals: 3, blocks: 0, charges: 0, deflections: 6, scoringPasses: 2, turnovers: 2, scoringPassesPerTo: 1, kickAheads: 1.8, strikes: 2, paintTouches: 5, passes: 36 },
  { number: "0", name: "Bilal Coulibaly", position: "G", crashCount: 12, crashOpps: 22, crashPct: 55, disruptions: 4.8, steals: 1.7, blocks: 0.8, charges: 0.2, deflections: 2.1, scoringPasses: 10, turnovers: 3, scoringPassesPerTo: 3.3, kickAheads: 2.5, strikes: 1.5, paintTouches: 7.5, passes: 48 },
  { number: "00", name: "Tristan Vukcevic", position: "F", crashCount: 16, crashOpps: 20, crashPct: 80, disruptions: 2.4, steals: 0.4, blocks: 1.1, charges: 0.1, deflections: 0.8, scoringPasses: 3, turnovers: 2, scoringPassesPerTo: 1.5, kickAheads: 0.8, strikes: 0.5, paintTouches: 6.5, passes: 24 },
  { number: "1", name: "Cam Whitmore", position: "F", crashCount: 17, crashOpps: 26, crashPct: 65, disruptions: 3.1, steals: 1.2, blocks: 0.5, charges: 0.1, deflections: 1.3, scoringPasses: 5, turnovers: 3, scoringPassesPerTo: 1.7, kickAheads: 1.4, strikes: 1.3, paintTouches: 9, passes: 30 },
  { number: "3", name: "Trae Young", position: "G", crashCount: 3, crashOpps: 11, crashPct: 27, disruptions: 2.8, steals: 1.2, blocks: 0.1, charges: 0, deflections: 1.5, scoringPasses: 18, turnovers: 4, scoringPassesPerTo: 4.5, kickAheads: 3.8, strikes: 2.4, paintTouches: 11, passes: 71 },
  { number: "4", name: "AJ Dybantsa", position: "F", crashCount: 15, crashOpps: 23, crashPct: 65, disruptions: 3.7, steals: 1.1, blocks: 0.8, charges: 0.2, deflections: 1.6, scoringPasses: 6, turnovers: 2, scoringPassesPerTo: 3, kickAheads: 1.9, strikes: 1.6, paintTouches: 8.5, passes: 34 },
  { number: "5", name: "Deandre Ayton", position: "C", crashCount: 19, crashOpps: 27, crashPct: 70, disruptions: 3.9, steals: 0.8, blocks: 1.5, charges: 0.2, deflections: 1.4, scoringPasses: 4, turnovers: 2, scoringPassesPerTo: 2, kickAheads: 0.7, strikes: 0.6, paintTouches: 10.5, passes: 27 },
  { number: "18", name: "Kyshawn George", position: "F", crashCount: 13, crashOpps: 24, crashPct: 54, disruptions: 4.2, steals: 1.3, blocks: 0.6, charges: 0.1, deflections: 2.2, scoringPasses: 8, turnovers: 2, scoringPassesPerTo: 4, kickAheads: 2.3, strikes: 1.2, paintTouches: 6, passes: 44 },
  { number: "20", name: "Khris Middleton", position: "F", crashCount: 9, crashOpps: 18, crashPct: 50, disruptions: 2.2, steals: 0.9, blocks: 0.2, charges: 0.1, deflections: 1, scoringPasses: 9, turnovers: 2, scoringPassesPerTo: 4.5, kickAheads: 1.7, strikes: 1, paintTouches: 4.5, passes: 46 },
  { number: "20", name: "Alex Sarr", position: "C", crashCount: 18, crashOpps: 25, crashPct: 72, disruptions: 5.4, steals: 1, blocks: 2.2, charges: 0.2, deflections: 2, scoringPasses: 5, turnovers: 2, scoringPassesPerTo: 2.5, kickAheads: 0.9, strikes: 0.7, paintTouches: 9.5, passes: 31 },
  { number: "23", name: "Anthony Davis", position: "F-C", crashCount: 21, crashOpps: 28, crashPct: 75, disruptions: 6.1, steals: 1.4, blocks: 2.4, charges: 0.3, deflections: 2, scoringPasses: 6, turnovers: 2, scoringPassesPerTo: 3, kickAheads: 0.6, strikes: 0.9, paintTouches: 12, passes: 35 },
  { number: "R", name: "Felix Okpara", position: "C", crashCount: 14, crashOpps: 20, crashPct: 70, disruptions: 3, steals: 0.6, blocks: 1.4, charges: 0.2, deflections: 0.8, scoringPasses: 2, turnovers: 1, scoringPassesPerTo: 2, kickAheads: 0.5, strikes: 0.4, paintTouches: 7, passes: 20 }
];
const kpis = [
  { id: "crash", title: "Crash %", description: "Offensive crash activity and conversion", primary: "crashPct", columns: [
    { key: "crashPct", label: "Correctly crashed", compactLabel: "Crash %", barMax: 100, suffix: "%" },
    { key: "crashCount", label: "Crash count", compactLabel: "Count" },
    { key: "crashOpps", label: "Opportunities", compactLabel: "Opps" }
  ] },
  { id: "disruptions", title: "Disruptions", description: "Steals, blocks, charges and deflections", primary: "disruptions", columns: [
    { key: "disruptions", label: "Per game", barMax: 10, decimals: 1 },
    { key: "steals", label: "Steals", compactLabel: "STL", decimals: 1 },
    { key: "blocks", label: "Blocks", compactLabel: "BLK", decimals: 1 },
    { key: "charges", label: "Charges", compactLabel: "CHG", decimals: 1 },
    { key: "deflections", label: "Deflections", compactLabel: "DEFL", decimals: 1 }
  ] },
  { id: "scoring-passes", title: "Scoring Passes per TO", description: "Playmaking efficiency relative to turnovers", primary: "scoringPassesPerTo", columns: [
    { key: "scoringPassesPerTo", label: "Passes / TO", barMax: 5, decimals: 1 },
    { key: "scoringPasses", label: "Scoring passes", compactLabel: "Passes" },
    { key: "turnovers", label: "Turnovers", compactLabel: "TO" }
  ] },
  { id: "kick-aheads", title: "Kick Aheads & Early Opposites", description: "Early offense advancement opportunities", primary: "kickAheads", columns: [
    { key: "kickAheads", label: "Per game", barMax: 4, decimals: 1 }
  ] },
  { id: "paint-touches", title: "HC Paint Touches", description: "Half-court touches inside the paint", primary: "paintTouches", columns: [
    { key: "paintTouches", label: "Per game", barMax: 12, decimals: 1 }
  ] },
  { id: "passes", title: "Passes", description: "Total passes made per game", primary: "passes", columns: [
    { key: "passes", label: "Per game", barMax: 72 }
  ] }
];
const teamNames = {
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards"
};
const teamKpis = [
  { id: "team-kick-aheads", title: "Kick Aheads & Early Opposites", label: "Per game", rows: [
    ["MIA", 16],
    ["CLE", 12],
    ["UTA", 11],
    ["MIN", 11],
    ["ORL", 11],
    ["TOR", 11],
    ["WAS", 11],
    ["LAL", 10],
    ["POR", 10],
    ["MEM", 10],
    ["GSW", 10],
    ["ATL", 10],
    ["CHI", 10],
    ["DEN", 10],
    ["IND", 10],
    ["PHX", 10],
    ["SAS", 10],
    ["NOP", 10],
    ["PHI", 10],
    ["DET", 10],
    ["NYK", 9],
    ["BKN", 9],
    ["BOS", 8],
    ["SAC", 8],
    ["DAL", 8],
    ["CHA", 8],
    ["OKC", 8],
    ["LAC", 7],
    ["MIL", 7],
    ["HOU", 7]
  ] },
  { id: "team-crash", title: "Crash %", label: "Crash %", suffix: "%", rows: [
    ["PHX", 86],
    ["MEM", 84],
    ["CLE", 83],
    ["POR", 81],
    ["BOS", 80],
    ["HOU", 80],
    ["DET", 80],
    ["CHA", 79],
    ["TOR", 79],
    ["MIA", 78],
    ["GSW", 77],
    ["ATL", 77],
    ["NYK", 76],
    ["WAS", 75],
    ["ORL", 75],
    ["NOP", 75],
    ["LAL", 74],
    ["OKC", 74],
    ["BKN", 73],
    ["SAS", 73],
    ["UTA", 73],
    ["SAC", 72],
    ["CHI", 70],
    ["LAC", 68],
    ["PHI", 67],
    ["DEN", 67],
    ["IND", 67],
    ["DAL", 66],
    ["MIN", 63],
    ["MIL", 59]
  ] },
  { id: "team-paint-touch", title: "HC Paint Touch %", label: "Paint touch %", suffix: "%", rows: [
    ["TOR", 67],
    ["MIA", 67],
    ["NOP", 66],
    ["CHI", 66],
    ["DET", 65],
    ["POR", 64],
    ["ATL", 64],
    ["HOU", 63],
    ["SAS", 62],
    ["OKC", 62],
    ["ORL", 62],
    ["DAL", 62],
    ["CLE", 61],
    ["NYK", 61],
    ["IND", 61],
    ["SAC", 60],
    ["LAC", 60],
    ["CHA", 60],
    ["BKN", 60],
    ["WAS", 58],
    ["MIN", 58],
    ["DEN", 58],
    ["GSW", 58],
    ["UTA", 58],
    ["MEM", 58],
    ["PHI", 57],
    ["BOS", 57],
    ["PHX", 57],
    ["LAL", 57],
    ["MIL", 57]
  ] },
  { id: "team-scoring-passes", title: "Scoring Passes per TO", label: "Passes / TO", decimals: 1, rows: [
    ["TOR", 4.5],
    ["DEN", 4.5],
    ["SAS", 4.5],
    ["GSW", 4.4],
    ["MIA", 4.4],
    ["CLE", 4.4],
    ["ATL", 4.3],
    ["OKC", 4.3],
    ["BOS", 4.1],
    ["IND", 4],
    ["NYK", 4],
    ["CHI", 4],
    ["UTA", 3.9],
    ["MEM", 3.8],
    ["ORL", 3.7],
    ["PHX", 3.7],
    ["DET", 3.7],
    ["PHI", 3.7],
    ["SAC", 3.6],
    ["MIL", 3.6],
    ["CHA", 3.6],
    ["HOU", 3.5],
    ["DAL", 3.4],
    ["MIN", 3.4],
    ["LAL", 3.4],
    ["BKN", 3.4],
    ["LAC", 3.4],
    ["NOP", 3.4],
    ["WAS", 3.2],
    ["POR", 3.2]
  ] },
  { id: "team-disruptions", title: "Disruptions", label: "Per game", decimals: 1, rows: [
    ["DET", 36.7],
    ["OKC", 35.9],
    ["PHI", 35.3],
    ["TOR", 33.9],
    ["GSW", 33],
    ["ATL", 32.9],
    ["PHX", 32.6],
    ["CLE", 32.4],
    ["NOP", 32.2],
    ["MIN", 31.1],
    ["MEM", 30.9],
    ["LAC", 30.7],
    ["WAS", 30.6],
    ["HOU", 30.4],
    ["ORL", 30],
    ["POR", 29.7],
    ["MIA", 29.6],
    ["BKN", 29.5],
    ["LAL", 29.4],
    ["NYK", 29.2],
    ["UTA", 29],
    ["SAS", 28.2],
    ["MIL", 27.6],
    ["SAC", 27.4],
    ["CHI", 27],
    ["BOS", 27],
    ["IND", 26.8],
    ["DAL", 26.4],
    ["CHA", 25],
    ["DEN", 24.5]
  ] },
  { id: "team-chokes", title: "Chokes", label: "Per game", decimals: 1, rows: [
    ["POR", 8.9],
    ["TOR", 8.5],
    ["MEM", 8.4],
    ["PHX", 8.2],
    ["IND", 8],
    ["NOP", 7.8],
    ["BKN", 7.8],
    ["CLE", 7.6],
    ["DET", 7.5],
    ["SAS", 7.3],
    ["PHI", 7.2],
    ["ORL", 7.1],
    ["ATL", 7.1],
    ["OKC", 7.1],
    ["WAS", 7],
    ["CHI", 6.9],
    ["SAC", 6.9],
    ["NYK", 6.8],
    ["HOU", 6.8],
    ["MIN", 6.6],
    ["DEN", 6.6],
    ["MIA", 6.6],
    ["GSW", 6.5],
    ["BOS", 6.4],
    ["DAL", 6.3],
    ["LAC", 6.3],
    ["MIL", 6.2],
    ["UTA", 6.1],
    ["CHA", 6],
    ["LAL", 6]
  ] },
  { id: "team-strikes", title: "Strikes", label: "Per game", decimals: 1, rows: [
    ["DET", 4.2],
    ["NOP", 3.8],
    ["ATL", 3.7],
    ["PHI", 3.6],
    ["MIN", 3.6],
    ["UTA", 3.5],
    ["HOU", 3.4],
    ["OKC", 3.3],
    ["TOR", 3.3],
    ["PHX", 3.3],
    ["LAC", 3.3],
    ["MIA", 3.2],
    ["LAL", 3.1],
    ["POR", 3.1],
    ["ORL", 3.1],
    ["CHI", 3],
    ["DAL", 3],
    ["CLE", 3],
    ["SAS", 2.9],
    ["GSW", 2.9],
    ["MEM", 2.9],
    ["NYK", 2.8],
    ["SAC", 2.8],
    ["IND", 2.8],
    ["WAS", 2.7],
    ["BKN", 2.6],
    ["DEN", 2.6],
    ["CHA", 2.4],
    ["MIL", 2.2],
    ["BOS", 2.2]
  ] },
  { id: "team-opponent-tov", title: "Opponent TOV%", label: "Opponent TOV%", suffix: "%", decimals: 1, rows: [
    ["DET", 16.8],
    ["PHX", 16.5],
    ["OKC", 16.5],
    ["TOR", 16.1],
    ["GSW", 15.8],
    ["ATL", 15.6],
    ["POR", 15.3],
    ["MEM", 15.2],
    ["PHI", 15.2],
    ["CLE", 14.8],
    ["BKN", 14.8],
    ["MIN", 14.7],
    ["LAL", 14.7],
    ["NYK", 14.7],
    ["ORL", 14.7],
    ["LAC", 14.6],
    ["MIA", 14.4],
    ["NOP", 14.2],
    ["UTA", 14],
    ["SAC", 13.9],
    ["HOU", 13.7],
    ["WAS", 13.4],
    ["MIL", 13.3],
    ["IND", 13.2],
    ["BOS", 13],
    ["CHA", 12.9],
    ["DAL", 12.9],
    ["SAS", 12.8],
    ["CHI", 12.5],
    ["DEN", 11.7]
  ] }
];
const advancedStatColumns = [
  { key: "gp", label: "GP" },
  { key: "wins", label: "W" },
  { key: "losses", label: "L" },
  { key: "ortg", label: "ORTG", decimals: 1 },
  { key: "drtg", label: "DRTG", decimals: 1 },
  { key: "net", label: "NET", decimals: 1 },
  { key: "efg", label: "EFG%", decimals: 1, suffix: "%" },
  { key: "tov", label: "TOV%", decimals: 1, suffix: "%" },
  { key: "ftr", label: "FTR", decimals: 3 },
  { key: "oreb", label: "OREB%", decimals: 1, suffix: "%" },
  { key: "dreb", label: "DREB%", decimals: 1, suffix: "%" },
  { key: "reb", label: "REB%", decimals: 1, suffix: "%" },
  { key: "ast", label: "AST%", decimals: 1, suffix: "%" },
  { key: "astTo", label: "AST/TO", decimals: 2 }
];
const fourFactorKeys = /* @__PURE__ */ new Set(["efg", "tov", "ftr", "oreb"]);
const advancedPreFactorColumns = advancedStatColumns.filter((column) => !fourFactorKeys.has(column.key) && ["gp", "wins", "losses", "ortg", "drtg", "net"].includes(column.key));
const advancedFourFactorColumns = advancedStatColumns.filter((column) => fourFactorKeys.has(column.key));
const advancedPostFactorColumns = advancedStatColumns.filter((column) => ["dreb", "reb", "ast", "astTo"].includes(column.key));
const advancedStats = Object.keys(teamNames).map((team, index) => {
  const gp = 82;
  const wins = 22 + index * 11 % 38;
  const strength = (wins - 22) / 37;
  const ortg = Number((109.4 + strength * 10.8 + (index % 3 - 1) * 0.3).toFixed(1));
  const drtg = Number((119.1 - strength * 9.8 + ((index + 1) % 3 - 1) * 0.3).toFixed(1));
  return {
    team,
    gp,
    wins,
    losses: gp - wins,
    ortg,
    drtg,
    net: Number((ortg - drtg).toFixed(1)),
    efg: Number((51.2 + strength * 7.1 + index % 2 * 0.2).toFixed(1)),
    tov: Number((15.2 - strength * 4.2 + index % 3 * 0.1).toFixed(1)),
    ftr: Number((0.19 + strength * 0.16 + index % 3 * 4e-3).toFixed(3)),
    oreb: Number((21.5 + strength * 9.3 + index % 2 * 0.3).toFixed(1)),
    dreb: Number((69 + strength * 9.5 + index % 3 * 0.2).toFixed(1)),
    reb: Number((47 + strength * 6 + index % 2 * 0.2).toFixed(1)),
    ast: Number((54 + strength * 11 + index % 3 * 0.3).toFixed(1)),
    astTo: Number((1.35 + strength + index % 2 * 0.04).toFixed(2))
  };
});
const shotSpectrumGroups = [
  { label: "Rim", attKey: "rimAtt", fgKey: "rimFg" },
  { label: "Paint", attKey: "paintAtt", fgKey: "paintFg" },
  { label: "Non-Paint 2", attKey: "nonPaint2Att", fgKey: "nonPaint2Fg" },
  { label: "3-PT", attKey: "threePtAtt", fgKey: "threePtFg" },
  { label: "3-PT (ATB)", attKey: "atbAtt", fgKey: "atbFg" },
  { label: "3-PT (COR)", attKey: "corAtt", fgKey: "corFg" },
  { label: "3-PT (C&S)", attKey: "catchShootAtt", fgKey: "catchShootFg" }
];
const shotSpectrumOffenseStats = advancedStats.map((row, index) => {
  const strength = (row.wins - 22) / 37;
  const threePtAtt = Math.round(2460 + strength * 920 + index % 4 * 34);
  const atbAtt = Math.round(threePtAtt * (0.73 + index % 3 * 0.01));
  return {
    team: row.team,
    efg: row.efg,
    shotQuality: Number((50.4 + strength * 7 + index % 3 * 0.2).toFixed(1)),
    rimAtt: Math.round(1720 + strength * 720 + index % 4 * 28),
    rimFg: Number((62 + strength * 10.2 + index % 3 * 0.3).toFixed(1)),
    paintAtt: Math.round(610 + strength * 520 + index % 3 * 24),
    paintFg: Number((41.5 + strength * 10 + index % 2 * 0.4).toFixed(1)),
    nonPaint2Att: Math.round(430 + (1 - strength) * 470 + index % 3 * 21),
    nonPaint2Fg: Number((36.2 + strength * 9.2 + index % 3 * 0.3).toFixed(1)),
    threePtAtt,
    threePtFg: Number((32.4 + strength * 7.2 + index % 2 * 0.2).toFixed(1)),
    atbAtt,
    atbFg: Number((31.8 + strength * 7.4 + index % 3 * 0.2).toFixed(1)),
    corAtt: threePtAtt - atbAtt,
    corFg: Number((35 + strength * 8.1 + index % 2 * 0.3).toFixed(1)),
    catchShootAtt: Math.round(1680 + strength * 760 + index % 4 * 31),
    catchShootFg: Number((34 + strength * 8.4 + index % 3 * 0.2).toFixed(1))
  };
});
const shotSpectrumDefenseStats = advancedStats.map((row, index) => {
  const strength = (row.wins - 22) / 37;
  const threePtAtt = Math.round(3380 - strength * 710 + index % 4 * 31);
  const atbAtt = Math.round(threePtAtt * (0.74 + index % 3 * 0.01));
  return {
    team: row.team,
    efg: Number((58.8 - strength * 7.6 + index % 2 * 0.2).toFixed(1)),
    shotQuality: Number((57.2 - strength * 6.8 + index % 3 * 0.2).toFixed(1)),
    rimAtt: Math.round(2450 - strength * 650 + index % 4 * 27),
    rimFg: Number((72.8 - strength * 9.7 + index % 3 * 0.3).toFixed(1)),
    paintAtt: Math.round(1110 - strength * 430 + index % 3 * 23),
    paintFg: Number((52 - strength * 9.4 + index % 2 * 0.4).toFixed(1)),
    nonPaint2Att: Math.round(880 - strength * 360 + index % 3 * 19),
    nonPaint2Fg: Number((45.2 - strength * 8.4 + index % 3 * 0.3).toFixed(1)),
    threePtAtt,
    threePtFg: Number((39.6 - strength * 6.8 + index % 2 * 0.2).toFixed(1)),
    atbAtt,
    atbFg: Number((39.2 - strength * 7 + index % 3 * 0.2).toFixed(1)),
    corAtt: threePtAtt - atbAtt,
    corFg: Number((42.5 - strength * 7.8 + index % 2 * 0.3).toFixed(1)),
    catchShootAtt: Math.round(2360 - strength * 620 + index % 4 * 29),
    catchShootFg: Number((41.2 - strength * 8 + index % 3 * 0.2).toFixed(1))
  };
});
const playTypeOptions = ["Play Type", "Transition", "P/R", "Off-Screen", "Off-Ball", "Spot-Up", "Isolation", "Post-Up", "Cut", "Handoffs"];
const playTypeColumns = [
  { key: "gp", label: "GP" },
  { key: "poss", label: "Poss" },
  { key: "freq", label: "Freq%", decimals: 1, suffix: "%" },
  { key: "ppp", label: "PPP", decimals: 2 },
  { key: "pts", label: "Pts" },
  { key: "fgm", label: "FGM" },
  { key: "fga", label: "FGA" },
  { key: "fgPct", label: "FG%", decimals: 1, suffix: "%" },
  { key: "threeFg", label: "3FG" },
  { key: "threeFga", label: "3FGA" },
  { key: "threeFgPct", label: "3FG%", decimals: 1, suffix: "%" },
  { key: "efgPct", label: "EFG%", decimals: 1, suffix: "%" },
  { key: "ftr", label: "FTR", decimals: 3 },
  { key: "tovPct", label: "TOV%", decimals: 1, suffix: "%" },
  { key: "sfPct", label: "SF%", decimals: 1, suffix: "%" },
  { key: "scorePct", label: "Score%", decimals: 1, suffix: "%" },
  { key: "percentile", label: "Percentile" }
];
const playTypeBasePoss = { "Play Type": 6800, Transition: 1350, "P/R": 1850, "Off-Screen": 620, "Off-Ball": 980, "Spot-Up": 1700, Isolation: 590, "Post-Up": 420, Cut: 650, Handoffs: 720 };
const playTypeBaseFreq = { "Play Type": 100, Transition: 16.5, "P/R": 22.8, "Off-Screen": 7.7, "Off-Ball": 12.1, "Spot-Up": 20.9, Isolation: 7.2, "Post-Up": 5.2, Cut: 8.1, Handoffs: 8.9 };
const playTypeBasePpp = { "Play Type": 1.08, Transition: 1.22, "P/R": 1.02, "Off-Screen": 1.08, "Off-Ball": 1.11, "Spot-Up": 1.13, Isolation: 0.94, "Post-Up": 0.98, Cut: 1.31, Handoffs: 1.06 };
const playTypeThreeShare = { "Play Type": 0.46, Transition: 0.38, "P/R": 0.43, "Off-Screen": 0.66, "Off-Ball": 0.58, "Spot-Up": 0.82, Isolation: 0.31, "Post-Up": 0.08, Cut: 0.04, Handoffs: 0.55 };
function createPlayTypeStats(playType) {
  const typeIndex = Math.max(0, playTypeOptions.indexOf(playType));
  return advancedStats.map((team, index) => {
    const strength = (team.wins - 22) / 37;
    const variance = ((index + typeIndex) % 5 - 2) * 0.012;
    const poss = Math.round(playTypeBasePoss[playType] * (0.88 + strength * 0.22 + variance));
    const freq = playType === "Play Type" ? 100 : Number((playTypeBaseFreq[playType] + strength * 2.1 + variance * 18).toFixed(1));
    const ppp = Number((playTypeBasePpp[playType] + strength * 0.19 + variance).toFixed(2));
    const tovPct = Number((15.5 - strength * 4 + variance * 14).toFixed(1));
    const fgPct = Number((43 + strength * 8.5 + typeIndex % 3 * 0.6 + variance * 18).toFixed(1));
    const fga = Math.round(poss * (0.82 - tovPct * 15e-4));
    const fgm = Math.round(fga * (fgPct / 100));
    const threeFga = Math.round(fga * playTypeThreeShare[playType]);
    const threeFgPct = Number((31.8 + strength * 8 + typeIndex % 4 * 0.4 + variance * 12).toFixed(1));
    const threeFg = Math.round(threeFga * (threeFgPct / 100));
    const efgPct = Number(((fgm + 0.5 * threeFg) / Math.max(1, fga) * 100).toFixed(1));
    return {
      team: team.team,
      gp: 82,
      poss,
      freq,
      ppp,
      pts: Math.round(poss * ppp),
      fgm,
      fga,
      fgPct,
      threeFg,
      threeFga,
      threeFgPct,
      efgPct,
      ftr: Number((0.18 + strength * 0.17 + typeIndex * 4e-3 + variance).toFixed(3)),
      tovPct,
      sfPct: Number((6.2 + strength * 5.8 + typeIndex % 3 * 0.5 + variance * 12).toFixed(1)),
      scorePct: Number((39 + strength * 12.5 + typeIndex % 4 * 0.4 + variance * 12).toFixed(1)),
      percentile: Math.max(1, Math.min(99, Math.round(4 + strength * 91 + typeIndex % 3 * 2 + variance * 60)))
    };
  });
}
const shotClockBands = ["24-18", "18-12", "12-6", "6-0"];
const shotClockCategories = [
  { id: "all", label: "All" },
  { id: "rim", label: "Rim" },
  { id: "paint", label: "Paint" },
  { id: "nonPaint2", label: "Non-Paint 2" },
  { id: "threePt", label: "3-PT" },
  { id: "atb", label: "3-PT (ATB)" },
  { id: "cor", label: "3-PT (COR)" },
  { id: "catchShoot", label: "3-PT (C&S)" }
];
const shotClockMetrics = [
  { id: "shotQuality", label: "SQ" },
  { id: "freq", label: "Freq%" },
  { id: "efg", label: "EFG%" }
];
function shotClockMetricKey(categoryId, metric) {
  return `${categoryId}-${metric}`;
}
function createShotClockStats(band) {
  const bandIndex = Math.max(0, shotClockBands.indexOf(band));
  const bandFrequency = [18.2, 27.6, 31.8, 22.4][bandIndex];
  const categoryFrequency = [100, 27, 13, 8, 52, 39, 13, 35];
  const categoryQuality = [0, 9.5, -2.2, -8, -4, -5, -0.8, -2.5];
  const categoryEfg = [0, 12, -4, -10, -2.8, -3.6, 1.8, -0.8];
  return advancedStats.map((team, teamIndex) => {
    const strength = (team.wins - 22) / 37;
    const metrics = {};
    shotClockCategories.forEach((category, categoryIndex) => {
      const variance = (teamIndex * 3 + categoryIndex + bandIndex) % 7 - 3;
      const frequencyBase = categoryIndex === 0 ? bandFrequency : categoryFrequency[categoryIndex];
      metrics[shotClockMetricKey(category.id, "shotQuality")] = Number((51 - bandIndex * 1.35 + categoryQuality[categoryIndex] + strength * 7.2 + variance * 0.18).toFixed(1));
      metrics[shotClockMetricKey(category.id, "freq")] = Number((frequencyBase + strength * (categoryIndex === 0 ? 2.1 : 3.2) + variance * 0.22).toFixed(1));
      metrics[shotClockMetricKey(category.id, "efg")] = Number((50.2 - bandIndex * 2.05 + categoryEfg[categoryIndex] + strength * 8 + variance * 0.22).toFixed(1));
    });
    return { team: team.team, metrics };
  });
}
const opponents = [
  "All Teams",
  "Atlanta Hawks",
  "Boston Celtics",
  "Brooklyn Nets",
  "Charlotte Hornets",
  "Chicago Bulls",
  "Cleveland Cavaliers",
  "Dallas Mavericks",
  "Denver Nuggets",
  "Detroit Pistons",
  "Golden State Warriors",
  "Houston Rockets",
  "Indiana Pacers",
  "LA Clippers",
  "Los Angeles Lakers",
  "Memphis Grizzlies",
  "Miami Heat",
  "Milwaukee Bucks",
  "Minnesota Timberwolves",
  "New Orleans Pelicans",
  "New York Knicks",
  "Oklahoma City Thunder",
  "Orlando Magic",
  "Philadelphia 76ers",
  "Phoenix Suns",
  "Portland Trail Blazers",
  "Sacramento Kings",
  "San Antonio Spurs",
  "Toronto Raptors",
  "Utah Jazz"
];
const leagueRankingPages = ["Advanced", "Shot Spectrum", "Play Type", "Shot Clock"];
const exportOptions = [
  { value: "cards", label: "KPI Cards" },
  { value: "matrix", label: "Player Matrix" },
  { value: "all", label: "All" }
];
const recentGames = [
  "APR 12 @ CLE",
  "APR 10 vs MIL",
  "APR 08 @ IND",
  "APR 05 vs BOS",
  "APR 03 @ ATL",
  "APR 01 vs CHI",
  "MAR 30 @ ORL",
  "MAR 28 vs BKN",
  "MAR 26 @ PHI",
  "MAR 24 vs NYK",
  "MAR 22 @ MIA",
  "MAR 20 vs TOR",
  "MAR 18 @ DET",
  "MAR 16 vs CHA",
  "MAR 14 @ MIL",
  "MAR 12 vs ATL",
  "MAR 10 @ BOS",
  "MAR 08 vs CLE",
  "MAR 06 @ CHI",
  "MAR 04 vs ORL",
  "MAR 02 @ BKN",
  "FEB 28 vs PHI",
  "FEB 26 @ NYK",
  "FEB 24 vs MIA",
  "FEB 22 @ TOR"
];
const gamePresetOptions = [
  "All Games",
  "Previous Game",
  ...Array.from({ length: 19 }, (_, index) => `Last ${index + 2} Games`)
];
const defaultFilters = {
  filterMode: "game",
  gamePreset: "All Games",
  dateFrom: "2026-04-01",
  dateTo: "2026-04-12",
  season: "2026-27",
  seasonType: "Regular Season",
  opponent: "All Teams",
  perMode: "Per game",
  period: "Full Game",
  playType: "Play Type",
  possession: "Offense"
};
function formatValue(value, column) {
  if (typeof value === "string") return value;
  const decimals = column.decimals ?? (Number.isInteger(value) ? 0 : 1);
  return `${value.toFixed(decimals)}${column.suffix ?? ""}`;
}
function PlayerCell({ player }) {
  return <div className="player-cell">
      <span className="player-copy"><strong>#{player.number} {player.name}</strong></span>
    </div>;
}
function MetricBar({ value, column }) {
  const width = Math.max(2, Math.min(100, value / (column.barMax ?? 100) * 100));
  const tone = getMetricTone(value, column);
  return <div className={`metric-bar ${tone}`}>
      <span className="metric-bar-track"><span className="metric-bar-fill" style={{ width: `${width}%` }} /></span>
      <strong>{formatValue(value, column)}</strong>
    </div>;
}
function getMetricTone(value, column) {
  const percentage = Math.max(2, Math.min(100, value / (column.barMax ?? 100) * 100));
  return percentage >= 72 ? "great" : percentage >= 48 ? "good" : percentage >= 28 ? "neutral" : "low";
}
function KpiCard({ config }) {
  const [sortKey, setSortKey] = useState(config.primary);
  const [direction, setDirection] = useState("desc");
  const sorted = useMemo(() => [...players].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return direction === "asc" ? comparison : -comparison;
  }), [sortKey, direction]);
  function sortBy(key) {
    if (key === sortKey) setDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDirection("desc");
    }
  }
  return <article className="kpi-card">
      <header className="kpi-card-header">
        <div><h2>{config.title}</h2></div>
        <button className="card-action" aria-label={`More options for ${config.title}`}>•••</button>
      </header>
      <div className="table-scroll">
        <table className="kpi-table">
          <colgroup>
            <col className="kpi-col-rank" />
            <col className="kpi-col-player" />
            {config.columns.map((column) => <col key={`col-${column.key}`} className={column.key === config.primary ? "kpi-col-primary" : "kpi-col-supporting"} />)}
          </colgroup>
          <thead><tr>
            <th className="rank-column">Rank</th>
            <th><button className="sort-button" onClick={() => sortBy("name")}>Player <span>{sortKey === "name" ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button></th>
            {config.columns.map((column) => <th key={column.key} className={column.key === config.primary ? "primary-metric-column" : "supporting-metric-column"}><button className="sort-button numeric" onClick={() => sortBy(column.key)}>{column.compactLabel ?? column.label} <span>{sortKey === column.key ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button></th>)}
          </tr></thead>
          <tbody>{sorted.map((player, index) => <tr key={`${config.id}-${player.name}`}>
            <td className="rank-column">{direction === "desc" ? index + 1 : sorted.length - index}</td>
            <td><PlayerCell player={player} /></td>
            {config.columns.map((column) => {
    const value = player[column.key];
    return <td key={column.key} className={`numeric-cell ${column.key === config.primary ? "primary-metric-column" : "supporting-metric-column"}`}>{column.barMax && typeof value === "number" ? <MetricBar value={value} column={column} /> : <strong>{formatValue(value, column)}</strong>}</td>;
  })}
          </tr>)}</tbody>
        </table>
      </div>
    </article>;
}
function formatTeamMetric(value, config) {
  const decimals = config.decimals ?? (Number.isInteger(value) ? 0 : 1);
  return `${value.toFixed(decimals)}${config.suffix ?? ""}`;
}
function TeamMetricBar({ value, config }) {
  const values = config.rows.map(([, metric]) => metric);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const normalized = maximum === minimum ? 1 : (value - minimum) / (maximum - minimum);
  const width = 12 + normalized * 88;
  const tone = normalized >= 0.72 ? "great" : normalized >= 0.48 ? "good" : normalized >= 0.28 ? "neutral" : "low";
  return <div className={`team-metric-bar ${tone}`}>
      <span className="team-metric-track"><span className="team-metric-fill" style={{ width: `${width}%` }} /></span>
      <strong>{formatTeamMetric(value, config)}</strong>
    </div>;
}
function TeamKpiCard({ config }) {
  const [sortKey, setSortKey] = useState("value");
  const [direction, setDirection] = useState("desc");
  const sorted = useMemo(() => config.rows.map(([abbreviation, value]) => ({ abbreviation, name: teamNames[abbreviation], value })).sort((a, b) => {
    const comparison = sortKey === "team" ? a.name.localeCompare(b.name) : a.value - b.value;
    return direction === "asc" ? comparison : -comparison;
  }), [config, sortKey, direction]);
  function sortBy(key) {
    if (key === sortKey) setDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDirection(key === "team" ? "asc" : "desc");
    }
  }
  return <article className="kpi-card team-kpi-card">
      <header className="kpi-card-header"><h2>{config.title}</h2><button className="card-action" aria-label={`More options for ${config.title}`}>•••</button></header>
      <div className="table-scroll">
        <table className="team-kpi-table">
          <colgroup><col className="team-col-rank" /><col className="team-col-name" /><col className="team-col-metric" /></colgroup>
          <thead><tr>
            <th className="rank-column">Rank</th>
            <th><button className="sort-button" onClick={() => sortBy("team")}>Team <span>{sortKey === "team" ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button></th>
            <th><button className="sort-button numeric" onClick={() => sortBy("value")}>{config.label} <span>{sortKey === "value" ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button></th>
          </tr></thead>
          <tbody>{sorted.map((team, index) => <tr key={`${config.id}-${team.abbreviation}`}>
            <td className="rank-column">{direction === "desc" ? index + 1 : sorted.length - index}</td>
            <td className="team-name-cell" title={team.name}><span className="team-identity"><img src={getTeamLogoUrl(team.abbreviation)} alt="" /><strong>{team.abbreviation}</strong></span></td>
            <td className="team-metric-cell"><TeamMetricBar value={team.value} config={config} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </article>;
}
function TeamKpiGrid({ printOnly = false }) {
  return <section className={`team-kpi-grid ${printOnly ? "print-team-kpi-grid" : "screen-team-grid"}`} aria-label="Team KPI league ranking tables">{teamKpis.map((config) => <TeamKpiCard key={`${printOnly ? "print-" : ""}${config.id}`} config={config} />)}</section>;
}
function formatAdvancedStat(value, column) {
  return `${value.toFixed(column.decimals ?? 0)}${column.suffix ?? ""}`;
}
const lowerIsBetterAdvancedStats = /* @__PURE__ */ new Set(["losses", "drtg", "tov"]);
function getAdvancedStatTone(key, value) {
  if (key === "gp") return "";
  const values = advancedStats.map((row) => row[key]).filter((metric) => typeof metric === "number");
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (maximum === minimum) return "";
  const rawScore = (value - minimum) / (maximum - minimum);
  const score = lowerIsBetterAdvancedStats.has(key) ? 1 - rawScore : rawScore;
  return score >= 0.72 ? "great" : score >= 0.48 ? "good" : score >= 0.28 ? "neutral" : "low";
}
function AdvancedStatsTable({ printOnly = false }) {
  const [sortKey, setSortKey] = useState("net");
  const [direction, setDirection] = useState("desc");
  const sorted = useMemo(() => [...advancedStats].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : teamNames[String(av)].localeCompare(teamNames[String(bv)]);
    return direction === "asc" ? comparison : -comparison;
  }), [sortKey, direction]);
  function sortBy(key) {
    if (key === sortKey) setDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDirection(key === "team" ? "asc" : "desc");
    }
  }
  function renderColumnHeader(column, rowSpan) {
    const factorIndex = advancedFourFactorColumns.findIndex((factor) => factor.key === column.key);
    const factorClass = factorIndex === 0 ? "factor-start" : factorIndex === advancedFourFactorColumns.length - 1 ? "factor-end" : "";
    return <th key={column.key} rowSpan={rowSpan} className={factorClass} aria-sort={sortKey === column.key ? direction === "desc" ? "descending" : "ascending" : "none"}><button className="sort-button numeric" onClick={() => sortBy(column.key)}>{column.label} <span>{sortKey === column.key ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button></th>;
  }
  return <article className={`advanced-table-card league-ranking-table-card ${printOnly ? "print-advanced-card" : "screen-advanced-card"}`}>
      <div className="advanced-table-scroll">
        <table className="advanced-table">
          <caption className="sr-only">Advanced league rankings</caption>
          <colgroup><col className="advanced-rank-col" /><col className="advanced-team-col" />{advancedStatColumns.map((column) => <col className={`advanced-stat-col advanced-${column.key}-col`} key={column.key} />)}</colgroup>
          <thead>
            <tr className="advanced-group-row">
              <th rowSpan={2} className="rank-column">Rank</th>
              <th rowSpan={2} aria-sort={sortKey === "team" ? direction === "desc" ? "descending" : "ascending" : "none"}><button className="sort-button" onClick={() => sortBy("team")}>Team <span>{sortKey === "team" ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button></th>
              {advancedPreFactorColumns.map((column) => renderColumnHeader(column, 2))}
              <th colSpan={4} className="four-factors-band">Four Factors</th>
              {advancedPostFactorColumns.map((column) => renderColumnHeader(column, 2))}
            </tr>
            <tr className="advanced-column-row">{advancedFourFactorColumns.map((column) => renderColumnHeader(column))}</tr>
          </thead>
          <tbody>{sorted.map((row, index) => <tr key={`advanced-${row.team}`}>
            <td className="rank-column">{direction === "desc" ? index + 1 : sorted.length - index}</td>
            <td className="team-name-cell" title={teamNames[row.team]}><span className="team-identity"><img src={getTeamLogoUrl(row.team)} alt="" /><strong>{row.team}</strong></span></td>
            {advancedStatColumns.map((column) => {
    const factorIndex = advancedFourFactorColumns.findIndex((factor) => factor.key === column.key);
    const factorClass = factorIndex === 0 ? "factor-start" : factorIndex === advancedFourFactorColumns.length - 1 ? "factor-end" : "";
    const tone = getAdvancedStatTone(column.key, row[column.key]);
    return <td className={`advanced-value advanced-tone ${tone} ${column.key === "net" ? "primary-value" : ""} ${fourFactorKeys.has(column.key) ? "four-factor-value" : ""} ${factorClass}`} key={column.key}>{formatAdvancedStat(row[column.key], column)}</td>;
  })}
          </tr>)}</tbody>
        </table>
      </div>
    </article>;
}
const shotSpectrumMetricKeys = [
  "efg",
  "shotQuality",
  ...shotSpectrumGroups.flatMap((group) => [group.attKey, group.fgKey])
];
function getShotSpectrumTone(rows, key, value, side) {
  const values = rows.map((row) => row[key]).filter((metric) => typeof metric === "number");
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (maximum === minimum) return "";
  const rawScore = (value - minimum) / (maximum - minimum);
  const score = side === "Defense" ? 1 - rawScore : rawScore;
  return score >= 0.72 ? "great" : score >= 0.48 ? "good" : score >= 0.28 ? "neutral" : "low";
}
function formatShotSpectrumStat(key, value) {
  if (String(key).endsWith("Att")) return value.toFixed(0);
  if (key === "shotQuality") return value.toFixed(1);
  return `${value.toFixed(1)}%`;
}
function ShotSpectrumTable({ side, printOnly = false }) {
  const [sortKey, setSortKey] = useState("efg");
  const [direction, setDirection] = useState("desc");
  const rows = side === "Defense" ? shotSpectrumDefenseStats : shotSpectrumOffenseStats;
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : teamNames[String(av)].localeCompare(teamNames[String(bv)]);
    return direction === "asc" ? comparison : -comparison;
  }), [rows, sortKey, direction]);
  function sortBy(key) {
    if (key === sortKey) setDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDirection(key === "team" ? "asc" : "desc");
    }
  }
  function headerButton(key, label) {
    return <button className="sort-button numeric" onClick={() => sortBy(key)}>{label} <span>{sortKey === key ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button>;
  }
  return <article className={`shot-spectrum-table-card league-ranking-table-card ${printOnly ? "print-shot-spectrum-card" : "screen-shot-spectrum-card"}`}>
      <div className="shot-spectrum-table-scroll">
        <table className="shot-spectrum-table">
          <caption className="sr-only">Shot Spectrum {side} league rankings</caption>
          <colgroup>
            <col className="shot-rank-col" /><col className="shot-team-col" /><col className="shot-summary-col" /><col className="shot-quality-col" />
            {shotSpectrumGroups.flatMap((group) => [<col className="shot-attempt-col" key={`${group.label}-att`} />, <col className="shot-percentage-col" key={`${group.label}-fg`} />])}
          </colgroup>
          <thead>
            <tr className="shot-group-row">
              <th rowSpan={2} className="rank-column">Rank</th>
              <th rowSpan={2} aria-sort={sortKey === "team" ? direction === "desc" ? "descending" : "ascending" : "none"}><button className="sort-button" onClick={() => sortBy("team")}>Team <span>{sortKey === "team" ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button></th>
              <th rowSpan={2} aria-sort={sortKey === "efg" ? direction === "desc" ? "descending" : "ascending" : "none"}>{headerButton("efg", "EFG%")}</th>
              <th rowSpan={2} aria-sort={sortKey === "shotQuality" ? direction === "desc" ? "descending" : "ascending" : "none"}>{headerButton("shotQuality", "SQ")}</th>
              {shotSpectrumGroups.map((group) => <th colSpan={2} className="shot-area-header" key={group.label}>{group.label}</th>)}
            </tr>
            <tr className="shot-column-row">{shotSpectrumGroups.flatMap((group) => [
    <th key={`${group.label}-att`} aria-sort={sortKey === group.attKey ? direction === "desc" ? "descending" : "ascending" : "none"}>{headerButton(group.attKey, "Att.")}</th>,
    <th key={`${group.label}-fg`} aria-sort={sortKey === group.fgKey ? direction === "desc" ? "descending" : "ascending" : "none"}>{headerButton(group.fgKey, "FG%")}</th>
  ])}</tr>
          </thead>
          <tbody>{sorted.map((row, index) => <tr key={`shot-spectrum-${row.team}`}>
            <td className="rank-column">{direction === "desc" ? index + 1 : sorted.length - index}</td>
            <td className="team-name-cell" title={teamNames[row.team]}><span className="team-identity"><img src={getTeamLogoUrl(row.team)} alt="" /><strong>{row.team}</strong></span></td>
            {shotSpectrumMetricKeys.map((key) => {
    const value = row[key];
    const tone = getShotSpectrumTone(rows, key, value, side);
    return <td className={`shot-spectrum-value ranking-tone ${tone}`} key={key}>{formatShotSpectrumStat(key, value)}</td>;
  })}
          </tr>)}</tbody>
        </table>
      </div>
    </article>;
}
const lowerIsBetterPlayTypeStats = /* @__PURE__ */ new Set(["tovPct"]);
function formatPlayTypeStat(value, column) {
  return `${value.toFixed(column.decimals ?? 0)}${column.suffix ?? ""}`;
}
function getPlayTypeTone(rows, key, value) {
  if (key === "gp") return "";
  const values = rows.map((row) => row[key]).filter((metric) => typeof metric === "number");
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (maximum === minimum) return "";
  const rawScore = (value - minimum) / (maximum - minimum);
  const score = lowerIsBetterPlayTypeStats.has(key) ? 1 - rawScore : rawScore;
  return score >= 0.72 ? "great" : score >= 0.48 ? "good" : score >= 0.28 ? "neutral" : "low";
}
function PlayTypeTable({ playType, printOnly = false }) {
  const [sortKey, setSortKey] = useState("percentile");
  const [direction, setDirection] = useState("desc");
  const rows = useMemo(() => createPlayTypeStats(playType), [playType]);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : teamNames[String(av)].localeCompare(teamNames[String(bv)]);
    return direction === "asc" ? comparison : -comparison;
  }), [rows, sortKey, direction]);
  function sortBy(key) {
    if (key === sortKey) setDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDirection(key === "team" ? "asc" : "desc");
    }
  }
  return <article className={`play-type-table-card league-ranking-table-card ${printOnly ? "print-play-type-card" : "screen-play-type-card"}`}>
      <div className="play-type-table-scroll">
        <table className="play-type-table">
          <caption className="sr-only">{playType} league rankings</caption>
          <colgroup><col className="play-rank-col" /><col className="play-team-col" />{playTypeColumns.map((column) => <col className={`play-stat-col play-${column.key}-col`} key={column.key} />)}</colgroup>
          <thead><tr>
            <th className="rank-column">Rank</th>
            <th aria-sort={sortKey === "team" ? direction === "desc" ? "descending" : "ascending" : "none"}><button className="sort-button" onClick={() => sortBy("team")}>Team <span>{sortKey === "team" ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button></th>
            {playTypeColumns.map((column) => <th key={column.key} aria-sort={sortKey === column.key ? direction === "desc" ? "descending" : "ascending" : "none"}><button className="sort-button numeric" onClick={() => sortBy(column.key)}>{column.label} <span>{sortKey === column.key ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button></th>)}
          </tr></thead>
          <tbody>{sorted.map((row, index) => <tr key={`play-type-${playType}-${row.team}`}>
            <td className="rank-column">{direction === "desc" ? index + 1 : sorted.length - index}</td>
            <td className="team-name-cell" title={teamNames[row.team]}><span className="team-identity"><img src={getTeamLogoUrl(row.team)} alt="" /><strong>{row.team}</strong></span></td>
            {playTypeColumns.map((column) => {
    const value = row[column.key];
    const tone = getPlayTypeTone(rows, column.key, value);
    return <td className={`play-type-value ranking-tone ${tone}`} key={column.key}>{formatPlayTypeStat(value, column)}</td>;
  })}
          </tr>)}</tbody>
        </table>
      </div>
    </article>;
}
function getShotClockTone(rows, key, value) {
  const values = rows.map((row) => row.metrics[key]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (maximum === minimum) return "";
  const score = (value - minimum) / (maximum - minimum);
  return score >= 0.72 ? "great" : score >= 0.48 ? "good" : score >= 0.28 ? "neutral" : "low";
}
function ShotClockTable({ band, printOnly = false }) {
  const defaultSortKey = shotClockMetricKey("all", "efg");
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [direction, setDirection] = useState("desc");
  const rows = useMemo(() => createShotClockStats(band), [band]);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const comparison = sortKey === "team" ? teamNames[a.team].localeCompare(teamNames[b.team]) : a.metrics[sortKey] - b.metrics[sortKey];
    return direction === "asc" ? comparison : -comparison;
  }), [rows, sortKey, direction]);
  function sortBy(key) {
    if (key === sortKey) setDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDirection(key === "team" ? "asc" : "desc");
    }
  }
  function sortIndicator(key) {
    return sortKey === key ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195";
  }
  return <article className={`shot-clock-table-card league-ranking-table-card ${printOnly ? "print-shot-clock-card" : "screen-shot-clock-card"}`}>
      <header className="shot-clock-band-title"><h2>{band}</h2></header>
      <div className="shot-clock-table-scroll">
        <table className="shot-clock-table">
          <caption className="sr-only">Shot Clock {band} league rankings</caption>
          <colgroup>
            <col className="shot-clock-rank-col" /><col className="shot-clock-team-col" />
            {shotClockCategories.flatMap((category) => shotClockMetrics.map((metric) => <col className={`shot-clock-stat-col shot-clock-${metric.id}-col`} key={`${category.id}-${metric.id}`} />))}
          </colgroup>
          <thead>
            <tr className="shot-clock-group-row">
              <th rowSpan={2} className="rank-column">Rank</th>
              <th rowSpan={2} aria-sort={sortKey === "team" ? direction === "desc" ? "descending" : "ascending" : "none"}><button className="sort-button" onClick={() => sortBy("team")}>Team <span>{sortIndicator("team")}</span></button></th>
              {shotClockCategories.map((category) => <th className="shot-clock-category-header" colSpan={3} key={category.id}>{category.label}</th>)}
            </tr>
            <tr className="shot-clock-column-row">
              {shotClockCategories.flatMap((category) => shotClockMetrics.map((metric) => {
    const key = shotClockMetricKey(category.id, metric.id);
    return <th aria-sort={sortKey === key ? direction === "desc" ? "descending" : "ascending" : "none"} key={key}><button className="sort-button numeric" onClick={() => sortBy(key)}>{metric.label} <span>{sortIndicator(key)}</span></button></th>;
  }))}
            </tr>
          </thead>
          <tbody>{sorted.map((row, index) => <tr key={`shot-clock-${band}-${row.team}`}>
            <td className="rank-column">{direction === "desc" ? index + 1 : sorted.length - index}</td>
            <td className="team-name-cell" title={teamNames[row.team]}><span className="team-identity"><img src={getTeamLogoUrl(row.team)} alt="" /><strong>{row.team}</strong></span></td>
            {shotClockCategories.flatMap((category) => shotClockMetrics.map((metric) => {
    const key = shotClockMetricKey(category.id, metric.id);
    const value = row.metrics[key];
    return <td className={`shot-clock-value ranking-tone ${getShotClockTone(rows, key, value)}`} key={key}>{value.toFixed(1)}{metric.id === "shotQuality" ? "" : "%"}</td>;
  }))}
          </tr>)}</tbody>
        </table>
      </div>
    </article>;
}
function ShotClockTables() {
  return <section className="shot-clock-tables" aria-label="Shot Clock league rankings">{shotClockBands.map((band) => <ShotClockTable band={band} key={band} />)}</section>;
}
const matrixColumns = [
  { key: "crashPct", label: "Crash %", barMax: 100, suffix: "%" },
  { key: "disruptions", label: "Disruptions", barMax: 10, decimals: 1 },
  { key: "scoringPassesPerTo", label: "Passes / TO", barMax: 5, decimals: 1 },
  { key: "kickAheads", label: "Kick aheads", barMax: 4, decimals: 1 },
  { key: "paintTouches", label: "Paint touches", barMax: 12, decimals: 1 },
  { key: "passes", label: "Passes", barMax: 72 }
];
function MatrixView({ printOnly = false }) {
  const [sortKey, setSortKey] = useState("disruptions");
  const [direction, setDirection] = useState("desc");
  const sorted = useMemo(() => [...players].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return direction === "asc" ? comparison : -comparison;
  }), [sortKey, direction]);
  function sortBy(key) {
    if (key === sortKey) setDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDirection("desc");
    }
  }
  return <article className={`matrix-card ${printOnly ? "print-matrix-card" : "screen-matrix-card"}`}>
      <div className="matrix-scroll"><table className="matrix-table"><caption className="sr-only">Player KPI Matrix</caption><thead><tr>
        <th className="rank-column">Rank</th><th><button className="sort-button" onClick={() => sortBy("name")}>Player <span>↕</span></button></th>
        {matrixColumns.map((column) => <th key={column.key}><button className="sort-button numeric" onClick={() => sortBy(column.key)}>{column.label} <span>{sortKey === column.key ? direction === "desc" ? "\u2193" : "\u2191" : "\u2195"}</span></button></th>)}
      </tr></thead><tbody>{sorted.map((player, index) => <tr key={`matrix-${player.name}`}><td className="rank-column">{direction === "desc" ? index + 1 : sorted.length - index}</td><td><PlayerCell player={player} /></td>{matrixColumns.map((column) => {
    const value = player[column.key];
    const tone = typeof value === "number" ? getMetricTone(value, column) : "";
    return <td key={column.key} className={`matrix-value matrix-tone ${tone}`}><strong>{formatValue(value, column)}</strong></td>;
  })}</tr>)}</tbody></table></div>
    </article>;
}
function IncludedGames({ games }) {
  const [expanded, setExpanded] = useState(false);
  const gameKey = games.join("|");
  useEffect(() => {
    setExpanded(false);
  }, [gameKey]);
  return <>
      <button className="included-games-toggle" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>{expanded ? "Hide Included Games" : "Show Included Games"}</button>
      {expanded && <div className="included-game-list" aria-label="Games included">{games.map((game) => <span className="game-pill" key={game}>{game}</span>)}</div>}
    </>;
}
function PrintReportHeader({ title, reportFilters, activeRange, includedGameCount, includedGames }) {
  return <header className="print-report-header">
      <div className="print-title-row"><img className="print-brand-logo" src={wizardsLogoUrl} alt="" /><h1>{title}</h1><div className="print-season"><strong>{reportFilters.season}</strong><span>{reportFilters.seasonType}</span></div></div>
      <div className="print-filter-summary"><div><span>Game sample</span><strong>{activeRange}</strong></div><div><span>Opponent</span><strong>{reportFilters.opponent}</strong></div><div><span>Mode</span><strong>{reportFilters.perMode}</strong></div><div><span>Period</span><strong>{reportFilters.period}</strong></div><div className="print-games"><span>Games included</span><strong>{includedGameCount === 1 ? includedGames[0] : `${includedGameCount} games \xB7 ${includedGames[0]} through ${includedGames[includedGames.length - 1]}`}</strong></div></div>
    </header>;
}
function PrintReportFooter({ label, page, totalPages }) {
  return <footer className="print-report-footer"><span>Internal Use</span><span>{label} · Page {page} of {totalPages}</span></footer>;
}
function CoachingReportsPreview() {
  const [reportPage, setReportPage] = useState("individual");
  const [filterMode, setFilterMode] = useState(defaultFilters.filterMode);
  const [gamePreset, setGamePreset] = useState(defaultFilters.gamePreset);
  const [dateFrom, setDateFrom] = useState(defaultFilters.dateFrom);
  const [dateTo, setDateTo] = useState(defaultFilters.dateTo);
  const [season, setSeason] = useState(defaultFilters.season);
  const [seasonType, setSeasonType] = useState(defaultFilters.seasonType);
  const [opponent, setOpponent] = useState(defaultFilters.opponent);
  const [perMode, setPerMode] = useState(defaultFilters.perMode);
  const [period, setPeriod] = useState(defaultFilters.period);
  const [playType, setPlayType] = useState(defaultFilters.playType);
  const [possession, setPossession] = useState(defaultFilters.possession);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [hasApplied, setHasApplied] = useState(false);
  const [viewMode, setViewMode] = useState("cards");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportSelection, setExportSelection] = useState("cards");
  const [printSelection, setPrintSelection] = useState("cards");
  const [printQueued, setPrintQueued] = useState(false);
  const [status, setStatus] = useState("Sample data \xB7 Updated 4 minutes ago");
  const [kpiNavExpanded, setKpiNavExpanded] = useState(false);
  const [leagueNavExpanded, setLeagueNavExpanded] = useState(false);
  const exportButtonRef = useRef(null);
  const firstExportOptionRef = useRef(null);
  useEffect(() => {
    document.body.classList.add("coaching-reports-preview-active");
    return () => {
      document.body.classList.remove("coaching-reports-preview-active");
    };
  }, []);
  const currentFilters = { filterMode, gamePreset, dateFrom, dateTo, season, seasonType, opponent, perMode, period, playType, possession };
  const filtersHaveChanged = JSON.stringify(currentFilters) !== JSON.stringify(appliedFilters);
  const showResetAction = hasApplied && !filtersHaveChanged;
  const reportFilters = hasApplied ? appliedFilters : defaultFilters;
  const activeRange = reportFilters.filterMode === "game" ? reportFilters.gamePreset : `${reportFilters.dateFrom || "Start"} to ${reportFilters.dateTo || "End"}`;
  const visibleStatus = filtersHaveChanged ? "Changes waiting to be applied" : status;
  const presetGameCount = reportFilters.gamePreset === "All Games" ? recentGames.length : reportFilters.gamePreset === "Previous Game" ? 1 : Number(reportFilters.gamePreset.match(/^Last (\d+) Games$/)?.[1] ?? 1);
  const includedGameCount = reportFilters.filterMode === "date" ? 6 : presetGameCount;
  const includedGames = useMemo(() => recentGames.slice(0, includedGameCount), [includedGameCount]);
  useEffect(() => {
    if (!exportDialogOpen) return;
    firstExportOptionRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeExportDialog();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [exportDialogOpen]);
  useEffect(() => {
    if (!printQueued) return;
    const frame = window.requestAnimationFrame(() => {
      window.print();
      setPrintQueued(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [printQueued, printSelection]);
  function applyFilters() {
    setAppliedFilters(currentFilters);
    setHasApplied(true);
    setStatus("Filters applied \xB7 just now");
  }
  function resetFilters() {
    setFilterMode(defaultFilters.filterMode);
    setGamePreset(defaultFilters.gamePreset);
    setDateFrom(defaultFilters.dateFrom);
    setDateTo(defaultFilters.dateTo);
    setSeason(defaultFilters.season);
    setSeasonType(defaultFilters.seasonType);
    setOpponent(defaultFilters.opponent);
    setPerMode(defaultFilters.perMode);
    setPeriod(defaultFilters.period);
    setPlayType(defaultFilters.playType);
    setPossession(defaultFilters.possession);
    setAppliedFilters(defaultFilters);
    setHasApplied(false);
    setStatus("Filters reset \xB7 just now");
  }
  function openExportDialog() {
    setExportSelection(viewMode);
    setExportDialogOpen(true);
  }
  function requestExport() {
    if (reportPage !== "individual") {
      setPrintSelection(reportPage === "team" ? "team" : reportPage === "league-advanced" ? "advanced" : reportPage === "league-shot-spectrum" ? "shot-spectrum" : reportPage === "league-play-type" ? "play-type" : "shot-clock");
      setPrintQueued(true);
      return;
    }
    openExportDialog();
  }
  function selectReportPage(page) {
    setReportPage(page);
    setExportDialogOpen(false);
  }
  function closeExportDialog() {
    setExportDialogOpen(false);
    window.requestAnimationFrame(() => exportButtonRef.current?.focus());
  }
  function exportReport() {
    setPrintSelection(exportSelection);
    setExportDialogOpen(false);
    setPrintQueued(true);
  }
  const totalPrintPages = printSelection === "all" ? 2 : 1;
  const pageTitle = reportPage === "individual" ? "Individual KPIs" : reportPage === "team" ? "Team KPIs" : reportPage === "league-advanced" ? "Advanced" : reportPage === "league-shot-spectrum" ? "Shot Spectrum" : reportPage === "league-play-type" ? "Play Type" : "Shot Clock";
  const isLeagueRankingPage = reportPage.startsWith("league-");
  return <div className="coaching-reports-preview">
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark"><img src={wizardsLogoUrl} alt="Washington Wizards" /></div><div><strong>Wizards</strong><small>Coaching Report Dashboard</small></div></div>
        <nav aria-label="Report pages">
          <p className="nav-label">Reports</p>
          <button className={`nav-item nav-parent ${reportPage === "individual" || reportPage === "team" ? "current" : ""} ${kpiNavExpanded ? "expanded" : ""}`} onClick={() => setKpiNavExpanded((current) => !current)} aria-expanded={kpiNavExpanded} aria-controls="kpi-nav-children"><strong>KPIs</strong><small className="nav-caret" aria-hidden="true">›</small></button>
          {kpiNavExpanded && <div className="nav-children" id="kpi-nav-children">
            <button className={`nav-subitem ${reportPage === "individual" ? "active" : ""}`} onClick={() => selectReportPage("individual")} aria-current={reportPage === "individual" ? "page" : void 0}>Individual KPIs</button>
            <button className={`nav-subitem ${reportPage === "team" ? "active" : ""}`} onClick={() => selectReportPage("team")} aria-current={reportPage === "team" ? "page" : void 0}>Team KPIs</button>
          </div>}
          <button className={`nav-item nav-parent ${reportPage === "league-advanced" || reportPage === "league-shot-spectrum" || reportPage === "league-play-type" || reportPage === "league-shot-clock" ? "current" : ""} ${leagueNavExpanded ? "expanded" : ""}`} onClick={() => setLeagueNavExpanded((current) => !current)} aria-expanded={leagueNavExpanded} aria-controls="league-rankings-nav-children"><strong>League Rankings</strong><small className="nav-caret" aria-hidden="true">›</small></button>
          {leagueNavExpanded && <div className="nav-children" id="league-rankings-nav-children">
            {leagueRankingPages.map((label) => {
    const page = label === "Advanced" ? "league-advanced" : label === "Shot Spectrum" ? "league-shot-spectrum" : label === "Play Type" ? "league-play-type" : label === "Shot Clock" ? "league-shot-clock" : null;
    return <button className={`nav-subitem ${page === reportPage ? "active" : ""}`} key={label} disabled={!page} onClick={() => page && selectReportPage(page)} aria-current={page === reportPage ? "page" : void 0}>{label}</button>;
  })}
          </div>}
        </nav>
        <div className="sidebar-footer"><div className="season-chip"><span>{reportFilters.season.replace("-", "\u2013")}</span><small>{reportFilters.seasonType}</small></div><p>Visual prototype<br />Sample data only</p></div>
      </aside>

      <main className={`main-content print-${printSelection}`}>
        <header className="page-header">
          <div><h1>{pageTitle}</h1></div>
          <div className="header-actions"><button ref={exportButtonRef} className="secondary-button export-button" onClick={requestExport} title={reportPage === "individual" ? "Choose report views to export" : `Export ${pageTitle}`}>Export PDF</button><button className="icon-button" aria-label="Refresh data" onClick={() => setStatus("Refreshed \xB7 just now")}>↻</button></div>
        </header>

        <section className="filter-panel" aria-label="Report filters">
          <div className="filter-panel-heading status-only"><span className={`filter-state ${filtersHaveChanged ? "pending" : showResetAction ? "applied" : ""}`}>{filtersHaveChanged ? "Changes pending" : showResetAction ? "Filters applied" : "Ready to filter"}</span></div>
          <div className="filter-grid">
            <div className="filter-group range-filter"><label>Game selection</label><div className="mode-switch" role="group" aria-label="Choose game preset or date range"><button className={filterMode === "game" ? "selected" : ""} onClick={() => setFilterMode("game")}>Game preset</button><button className={filterMode === "date" ? "selected" : ""} onClick={() => setFilterMode("date")}>Date range</button></div>
              {filterMode === "game" ? <select aria-label="Game preset" value={gamePreset} onChange={(event) => setGamePreset(event.target.value)}>{gamePresetOptions.map((option) => <option key={option}>{option}</option>)}</select> : <div className="date-pair"><label><span>From</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></div>}
            </div>
            <div className="filter-group"><label htmlFor="season">Season</label><select id="season" value={season} onChange={(event) => setSeason(event.target.value)}><option>2026-27</option><option>2025-26</option></select></div>
            <div className="filter-group"><label htmlFor="season-type">Season Type</label><select id="season-type" value={seasonType} onChange={(event) => setSeasonType(event.target.value)}><option>Pre-Season</option><option>Regular Season</option><option>Playoffs</option><option>Regular Season + Playoffs</option><option>NBA Cup</option></select></div>
            <div className="filter-group"><label htmlFor="opponent">vs Team</label><select id="opponent" value={opponent} onChange={(event) => setOpponent(event.target.value)}>{opponents.map((team) => <option key={team}>{team}</option>)}</select></div>
            <div className="filter-group"><label htmlFor="per-mode">Per mode</label><select id="per-mode" value={perMode} onChange={(event) => setPerMode(event.target.value)}><option>Per game</option><option>Per 36</option><option>Totals</option></select></div>
            <div className="filter-group"><label htmlFor="period">By Period</label><select id="period" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Full Game</option><option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option><option>1st Half</option><option>2nd Half</option><option>OT (ALL)</option></select></div>
            <button className={`filter-action-button ${showResetAction ? "reset" : "apply"}`} onClick={showResetAction ? resetFilters : applyFilters} aria-live="polite">{showResetAction ? "Reset filters" : "Apply filters"} <span>{showResetAction ? "\u21BA" : "\u2192"}</span></button>
          </div>
          <div className="context-action-row">
            <div className="context-filter-list">
              {reportPage === "individual" && <div className="view-switch" role="group" aria-label="Choose results view"><button className={viewMode === "cards" ? "selected" : ""} onClick={() => setViewMode("cards")}>KPI cards</button><button className={viewMode === "matrix" ? "selected" : ""} onClick={() => setViewMode("matrix")}>Player matrix</button></div>}
              {isLeagueRankingPage && <div className="filter-group context-select possession-filter"><label htmlFor="possession-filter">Possession</label><select id="possession-filter" value={possession} onChange={(event) => setPossession(event.target.value)}><option>Offense</option><option>Defense</option></select></div>}
              {reportPage === "league-play-type" && <div className="filter-group context-select play-type-filter"><label htmlFor="play-type-filter">Play Type</label><select id="play-type-filter" value={playType} onChange={(event) => setPlayType(event.target.value)}>{playTypeOptions.map((option) => <option key={option}>{option}</option>)}</select></div>}
            </div>
            <small className={filtersHaveChanged ? "pending" : ""}>{visibleStatus}</small>
            <IncludedGames games={includedGames} />
          </div>
        </section>

        {reportPage === "individual" ? <>
          {viewMode === "cards" ? <section className="kpi-grid screen-results" aria-label="Individual KPI table cards">{kpis.map((config) => <KpiCard key={config.id} config={config} />)}</section> : <MatrixView />}
        </> : reportPage === "team" ? <TeamKpiGrid /> : reportPage === "league-advanced" ? <AdvancedStatsTable /> : reportPage === "league-shot-spectrum" ? <ShotSpectrumTable side={reportFilters.possession} /> : reportPage === "league-play-type" ? <PlayTypeTable playType={reportFilters.playType} /> : <ShotClockTables />}

        <section className="print-page print-cards-page" aria-label="Printable KPI cards">
          <PrintReportHeader title="Individual KPIs" reportFilters={reportFilters} activeRange={activeRange} includedGameCount={includedGameCount} includedGames={includedGames} />
          <section className="print-kpi-grid" aria-label="Printable KPI table cards">{kpis.map((config) => <KpiCard key={`print-${config.id}`} config={config} />)}</section>
          <PrintReportFooter label="Individual KPIs" page={1} totalPages={totalPrintPages} />
        </section>
        <section className="print-page print-matrix-page" aria-label="Printable player matrix">
          <PrintReportHeader title="Individual KPIs - Player Matrix" reportFilters={reportFilters} activeRange={activeRange} includedGameCount={includedGameCount} includedGames={includedGames} />
          <MatrixView printOnly />
          <PrintReportFooter label="Player Matrix" page={printSelection === "all" ? 2 : 1} totalPages={totalPrintPages} />
        </section>
        <section className="print-page print-team-page" aria-label="Printable Team KPIs">
          <PrintReportHeader title="Team KPIs" reportFilters={reportFilters} activeRange={activeRange} includedGameCount={includedGameCount} includedGames={includedGames} />
          <TeamKpiGrid printOnly />
          <PrintReportFooter label="Team KPIs" page={1} totalPages={1} />
        </section>
        <section className="print-page print-advanced-page" aria-label="Printable Advanced league rankings">
          <PrintReportHeader title="Advanced" reportFilters={reportFilters} activeRange={activeRange} includedGameCount={includedGameCount} includedGames={includedGames} />
          <AdvancedStatsTable printOnly />
          <PrintReportFooter label="League Rankings · Advanced" page={1} totalPages={1} />
        </section>
        <section className="print-page print-shot-spectrum-page" aria-label="Printable Shot Spectrum league rankings">
          <PrintReportHeader title={`Shot Spectrum - ${reportFilters.possession}`} reportFilters={reportFilters} activeRange={activeRange} includedGameCount={includedGameCount} includedGames={includedGames} />
          <ShotSpectrumTable side={reportFilters.possession} printOnly />
          <PrintReportFooter label={`League Rankings \xB7 Shot Spectrum \xB7 ${reportFilters.possession}`} page={1} totalPages={1} />
        </section>
        <section className="print-page print-play-type-page" aria-label="Printable Play Type league rankings">
          <PrintReportHeader title={reportFilters.playType === "Play Type" ? "Play Type" : `Play Type - ${reportFilters.playType}`} reportFilters={reportFilters} activeRange={activeRange} includedGameCount={includedGameCount} includedGames={includedGames} />
          <PlayTypeTable playType={reportFilters.playType} printOnly />
          <PrintReportFooter label={`League Rankings \xB7 ${reportFilters.playType}`} page={1} totalPages={1} />
        </section>
        {shotClockBands.map((band, index) => <section className="print-page print-shot-clock-page" aria-label={`Printable Shot Clock ${band} league rankings`} key={`print-shot-clock-${band}`}>
          <PrintReportHeader title={`Shot Clock - ${band}`} reportFilters={reportFilters} activeRange={activeRange} includedGameCount={includedGameCount} includedGames={includedGames} />
          <ShotClockTable band={band} printOnly />
          <PrintReportFooter label={`League Rankings \xB7 Shot Clock \xB7 ${band}`} page={index + 1} totalPages={shotClockBands.length} />
        </section>)}

        <footer className="page-footer"><span>Washington Wizards Coaching Report Dashboard</span><span>Prototype data for layout evaluation only</span></footer>

        {reportPage === "individual" && exportDialogOpen && <div className="export-dialog-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) closeExportDialog();
  }}>
          <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
            <header><h2 id="export-dialog-title">Export report</h2><button onClick={closeExportDialog} aria-label="Close export menu">×</button></header>
            <div className="export-choice-list" role="group" aria-label="Choose export content">
              {exportOptions.map((option, index) => <label className={`export-choice ${exportSelection === option.value ? "selected" : ""}`} key={option.value}>
                <input ref={index === 0 ? firstExportOptionRef : void 0} type="checkbox" checked={exportSelection === option.value} onChange={() => setExportSelection(option.value)} />
                <span>{option.label}</span>
              </label>)}
            </div>
            <footer><button className="dialog-cancel-button" onClick={closeExportDialog}>Cancel</button><button className="dialog-export-button" onClick={exportReport}>Export PDF</button></footer>
          </section>
        </div>}
      </main>
    </div>
  </div>;
}
export {
  CoachingReportsPreview as default
};
