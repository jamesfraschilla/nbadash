#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const NBA_REQUEST_HEADERS = {
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nba.com",
  Referer: "https://www.nba.com/",
  "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Officiating Challenge Audit)",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function clockSeconds(value) {
  const text = normalizeText(value);
  const iso = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(text);
  if (iso) return Number(iso[1] || 0) * 60 + Number(iso[2] || 0);
  const mmss = /^(\d+):(\d+(?:\.\d+)?)$/.exec(text);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  return NaN;
}

function normalizeClock(value) {
  const seconds = clockSeconds(value);
  if (!Number.isFinite(seconds)) return normalizeText(value);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  const secondText = remainingSeconds % 1
    ? remainingSeconds.toFixed(1).padStart(4, "0")
    : String(Math.round(remainingSeconds)).padStart(2, "0");
  return `${minutes}:${secondText}`;
}

async function readChallengeRows(filePath) {
  const payload = JSON.parse(await readFile(filePath, "utf8"));
  if (Array.isArray(payload)) return payload;
  return payload.challengeRows || payload.challengeRowsRaw || [];
}

function sameChallengeClock(left, right, toleranceSeconds) {
  if (normalizeText(left.game_id) !== normalizeText(right.game_id)) return false;
  if (normalizeText(left.challenging_team) !== normalizeText(right.challenging_team)) return false;
  if (Number(left.period) !== Number(right.period)) return false;
  const leftSeconds = clockSeconds(left.game_clock);
  const rightSeconds = clockSeconds(right.game_clock);
  return Number.isFinite(leftSeconds) &&
    Number.isFinite(rightSeconds) &&
    Math.abs(leftSeconds - rightSeconds) <= toleranceSeconds;
}

function challengeSourceType(action) {
  const subType = normalizeText(action?.subType).toLowerCase();
  if (subType !== "challenge") return "";
  const actionType = normalizeText(action?.actionType).toLowerCase() || "unknown";
  return `${actionType}/challenge`;
}

async function fetchPlayByPlay(gameId) {
  const response = await fetch(
    `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${encodeURIComponent(gameId)}.json`,
    { headers: NBA_REQUEST_HEADERS }
  );
  if (!response.ok) throw new Error(`Could not fetch ${gameId} play-by-play (${response.status})`);
  const payload = await response.json();
  return payload.game?.actions || [];
}

function classifyMissing({ row, actions, toleranceSeconds }) {
  const targetSeconds = clockSeconds(row.game_clock);
  const sameGameChallengeMarkers = actions.filter((action) => challengeSourceType(action));
  const sameClockMarkers = sameGameChallengeMarkers.filter((action) => (
    normalizeText(action.teamTricode) === normalizeText(row.challenging_team) &&
    Number(action.period) === Number(row.period) &&
    Number.isFinite(targetSeconds) &&
    Math.abs(clockSeconds(action.clock) - targetSeconds) <= toleranceSeconds
  ));
  if (sameClockMarkers.length) {
    return {
      reason: `pbp-uses-${challengeSourceType(sameClockMarkers[0])}`,
      sourceAction: sameClockMarkers[0],
    };
  }
  if (sameGameChallengeMarkers.length) {
    return {
      reason: "no-pbp-challenge-marker-at-official-clock",
      sourceAction: sameGameChallengeMarkers[0],
    };
  }
  return {
    reason: "no-pbp-challenge-marker-in-game",
    sourceAction: null,
  };
}

function rowLabel(row) {
  return [
    row.game_date,
    `${row.away_team}@${row.home_team}`,
    row.game_id,
    row.challenging_team,
    `Q${row.period}`,
    normalizeClock(row.game_clock),
    row.challenge_type,
    row.initial_call,
    row.call_ruling,
    row.challenge_outcome,
  ].filter(Boolean).join(" | ");
}

async function main() {
  const officialJson = readArg("official-json");
  const pbpJson = readArg("pbp-json");
  if (!officialJson || !pbpJson) {
    console.error("Usage: audit-nba-challenge-coverage --official-json=path --pbp-json=path [--team=WAS] [--inspect-live]");
    process.exitCode = 2;
    return;
  }

  const team = readArg("team");
  const toleranceSeconds = Number(readArg("clock-tolerance-seconds")) || 2;
  const inspectLive = hasFlag("inspect-live");
  const officialRows = (await readChallengeRows(officialJson))
    .filter((row) => !team || row.challenging_team === team);
  const pbpRows = (await readChallengeRows(pbpJson))
    .filter((row) => !team || row.challenging_team === team);
  const missing = officialRows.filter((row) => !pbpRows.some((pbpRow) => sameChallengeClock(row, pbpRow, toleranceSeconds)));
  const extraPbp = pbpRows.filter((row) => !officialRows.some((officialRow) => sameChallengeClock(officialRow, row, toleranceSeconds)));

  const report = {
    team: team || "ALL",
    toleranceSeconds,
    officialRows: officialRows.length,
    pbpRows: pbpRows.length,
    matchedRows: officialRows.length - missing.length,
    missingOfficialRows: missing.length,
    extraPbpRows: extraPbp.length,
    missing: missing.map((row) => ({ label: rowLabel(row) })),
  };

  if (inspectLive) {
    const actionsByGame = new Map();
    for (const row of missing) {
      if (!actionsByGame.has(row.game_id)) actionsByGame.set(row.game_id, await fetchPlayByPlay(row.game_id));
      const classification = classifyMissing({
        row,
        actions: actionsByGame.get(row.game_id),
        toleranceSeconds,
      });
      const item = report.missing.find((candidate) => candidate.label === rowLabel(row));
      item.reason = classification.reason;
      item.sourceAction = classification.sourceAction ? {
        actionNumber: classification.sourceAction.actionNumber,
        period: classification.sourceAction.period,
        clock: classification.sourceAction.clock,
        teamTricode: classification.sourceAction.teamTricode,
        actionType: classification.sourceAction.actionType,
        subType: classification.sourceAction.subType,
        descriptor: classification.sourceAction.descriptor,
        description: classification.sourceAction.description,
      } : null;
    }
    report.reasonCounts = report.missing.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] || 0) + 1;
      return counts;
    }, {});
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
