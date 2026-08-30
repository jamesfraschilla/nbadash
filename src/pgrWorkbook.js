import readXlsxFile from "read-excel-file/universal";

export const PGR_SCHEMA_VERSION = "pgr-v1";

export const PGR_REQUIRED_COLUMNS = Object.freeze([
  "GameID",
  "PosId",
  "EventId",
  "PeriodName",
  "GameClock",
  "RatingSeqNo",
  "CallTypeName",
  "PlayTypeName",
  "InfractionTypeName",
  "Player",
  "Opponent",
  "PlayerAction",
  "InfractionRatingName",
  "CallOrNoCall",
  "CallComment",
  "PLR_Comment",
  "OGR flag",
  "PTIW flag",
  "Video Clip",
]);

export const PGR_PLAYER_ACTION_DEFINITIONS = Object.freeze({
  NI: "No Infraction",
  INF: "Infraction",
  PI: "Possible Infraction / Judgment Call",
  ER: "Enhanced Review",
  BCA: "Block Charge Assessment",
  WPA: "Wrong Player Assessment",
  SFA: "Shooting Foul Assessment",
  PFA: "Personal Foul Assessment",
  TTFE: "Transition Take Foul Error",
  PII: "Potential Lean Infraction",
  PIN: "Potential Lean No Infraction",
});

export const PGR_CALL_NO_CALL_DEFINITIONS = Object.freeze({
  C: "Call",
  NC: "No Call",
});

const COLUMN_ALIASES = new Map(PGR_REQUIRED_COLUMNS.map((column) => [normalizeColumnName(column), column]));

function normalizeColumnName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanId(value) {
  const text = cleanText(value);
  return text ? text.replace(/\.0$/, "") : "";
}

function toInteger(value) {
  const number = Number(cleanText(value));
  return Number.isInteger(number) ? number : NaN;
}

function periodFromName(value) {
  const match = /^Q?(\d+)$/i.exec(cleanText(value));
  return match ? Number(match[1]) : null;
}

function parseFlag(value) {
  const text = cleanText(value).toLowerCase();
  if (["1", "true", "yes", "y"].includes(text)) return true;
  if (["0", "false", "no", "n"].includes(text)) return false;
  return null;
}

function parsePersonTeam(value) {
  const text = cleanText(value);
  const match = /^(.*)\(([^()]+)\)$/.exec(text);
  if (!match) return { name: text, team: "" };
  return {
    name: cleanText(match[1]),
    team: cleanText(match[2]),
  };
}

function isLikelyUrl(value) {
  const text = cleanText(value);
  if (!text) return true;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getCanonicalHeaders(rawHeaders) {
  const headers = rawHeaders.map((header) => COLUMN_ALIASES.get(normalizeColumnName(header)) || cleanText(header));
  const missingColumns = PGR_REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  return { headers, missingColumns };
}

function findWorksheet(sheets) {
  for (const worksheet of sheets) {
    const rows = worksheet?.data || [];
    const firstRow = rows[0] || [];
    const { missingColumns } = getCanonicalHeaders(firstRow);
    if (!missingColumns.length) return { sheetName: worksheet.sheet, rows };
  }
  const fallbackWorksheet = sheets[0];
  return {
    sheetName: fallbackWorksheet?.sheet || "",
    rows: fallbackWorksheet?.data || [],
  };
}

function rowObject(headers, row) {
  return headers.reduce((record, header, index) => {
    if (header) record[header] = row[index] ?? "";
    return record;
  }, {});
}

function compactSourceRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, cleanText(value)]));
}

function buildPossessions(evaluations) {
  const byPos = new Map();
  evaluations.forEach((evaluation) => {
    const current = byPos.get(evaluation.pos_id) || {
      pos_id: evaluation.pos_id,
      period_name: evaluation.period_name,
      first_game_clock: evaluation.game_clock,
      last_game_clock: evaluation.game_clock,
      evaluation_count: 0,
      events: new Set(),
      source_payload: {},
    };
    current.evaluation_count += 1;
    current.events.add(evaluation.event_id);
    current.last_game_clock = evaluation.game_clock || current.last_game_clock;
    byPos.set(evaluation.pos_id, current);
  });

  return [...byPos.values()].map((possession) => ({
    pos_id: possession.pos_id,
    period_name: possession.period_name,
    first_game_clock: possession.first_game_clock,
    last_game_clock: possession.last_game_clock,
    evaluation_count: possession.evaluation_count,
    event_count: possession.events.size,
    source_payload: possession.source_payload,
  }));
}

function buildEvents(evaluations) {
  const byEvent = new Map();
  evaluations.forEach((evaluation) => {
    const current = byEvent.get(evaluation.event_id) || {
      pos_id: evaluation.pos_id,
      event_id: evaluation.event_id,
      period_name: evaluation.period_name,
      period: evaluation.period,
      game_clock: evaluation.game_clock,
      call_type_name: evaluation.call_type_name,
      play_type_name: evaluation.play_type_name,
      video_url: evaluation.video_url,
      evaluation_count: 0,
      source_payload: {},
    };
    current.evaluation_count += 1;
    if (!current.video_url && evaluation.video_url) current.video_url = evaluation.video_url;
    byEvent.set(evaluation.event_id, current);
  });
  return [...byEvent.values()];
}

function normalizeWorkbookInput(input) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  }
  return input;
}

export function parsePgrRows(rows, { filename = "PGR workbook", worksheetName = "", sheetNames = [] } = {}) {
  const rawHeaders = rows[0] || [];
  const { headers, missingColumns } = getCanonicalHeaders(rawHeaders);
  const warnings = [];
  const errors = [];

  if (!rows.length) {
    return {
      schema_version: PGR_SCHEMA_VERSION,
      filename,
      worksheet_name: worksheetName,
      game_id: "",
      warnings,
      errors: ["Workbook does not contain any rows."],
      evaluations: [],
      events: [],
      possessions: [],
      row_count: 0,
      event_count: 0,
      possession_count: 0,
    };
  }

  if (missingColumns.length) {
    errors.push(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  const sourceRows = rows.slice(1).map((row) => rowObject(headers, row));
  const gameIds = new Set(sourceRows.map((row) => cleanId(row.GameID)).filter(Boolean));
  if (gameIds.size !== 1) {
    errors.push(`Workbook must contain exactly one GameID; found ${gameIds.size || 0}.`);
  }

  const naturalKeys = new Set();
  const duplicateKeys = [];
  const unknownActionCodes = new Set();
  const unknownCallNoCallCodes = new Set();
  const invalidUrls = [];
  const evaluations = sourceRows.map((row, index) => {
    const player = parsePersonTeam(row.Player);
    const opponent = parsePersonTeam(row.Opponent);
    const playerActionCode = cleanText(row.PlayerAction).toUpperCase();
    const callNoCall = cleanText(row.CallOrNoCall).toUpperCase();
    const ratingSeqNo = toInteger(row.RatingSeqNo);
    const posId = cleanId(row.PosId);
    const eventId = cleanId(row.EventId);
    const gameId = cleanId(row.GameID);
    const videoUrl = cleanText(row["Video Clip"]);
    const naturalKey = [gameId, posId, eventId, Number.isFinite(ratingSeqNo) ? ratingSeqNo : ""].join("|");

    if (naturalKeys.has(naturalKey)) duplicateKeys.push(naturalKey);
    naturalKeys.add(naturalKey);
    if (playerActionCode && !PGR_PLAYER_ACTION_DEFINITIONS[playerActionCode]) unknownActionCodes.add(playerActionCode);
    if (callNoCall && !PGR_CALL_NO_CALL_DEFINITIONS[callNoCall]) unknownCallNoCallCodes.add(callNoCall);
    if (!isLikelyUrl(videoUrl)) invalidUrls.push(index + 2);

    return {
      pos_id: posId,
      event_id: eventId,
      rating_seq_no: Number.isFinite(ratingSeqNo) ? ratingSeqNo : null,
      period_name: cleanText(row.PeriodName),
      period: periodFromName(row.PeriodName),
      game_clock: cleanText(row.GameClock),
      call_type_name: cleanText(row.CallTypeName),
      play_type_name: cleanText(row.PlayTypeName),
      infraction_type_name: cleanText(row.InfractionTypeName),
      player_name: player.name,
      player_team: player.team,
      opponent_name: opponent.name,
      opponent_team: opponent.team,
      player_action_code: playerActionCode,
      player_action_label: PGR_PLAYER_ACTION_DEFINITIONS[playerActionCode] || playerActionCode,
      infraction_rating_name: cleanText(row.InfractionRatingName),
      call_or_no_call: callNoCall,
      call_or_no_call_label: PGR_CALL_NO_CALL_DEFINITIONS[callNoCall] || callNoCall,
      call_comment: cleanText(row.CallComment),
      plr_comment: cleanText(row.PLR_Comment),
      ogr_flag: parseFlag(row["OGR flag"]),
      ptiw_flag: parseFlag(row["PTIW flag"]),
      video_url: videoUrl,
      raw_row: compactSourceRow(row),
    };
  });

  evaluations.forEach((evaluation, index) => {
    if (!evaluation.pos_id) errors.push(`Row ${index + 2} is missing PosId.`);
    if (!evaluation.event_id) errors.push(`Row ${index + 2} is missing EventId.`);
    if (!Number.isInteger(evaluation.rating_seq_no)) errors.push(`Row ${index + 2} has invalid RatingSeqNo.`);
    if (!evaluation.period) warnings.push(`Row ${index + 2} has an unexpected PeriodName.`);
  });
  if (duplicateKeys.length) errors.push(`Duplicate evaluation keys detected: ${duplicateKeys.slice(0, 5).join(", ")}`);
  if (unknownActionCodes.size) warnings.push(`Unknown PlayerAction codes: ${[...unknownActionCodes].join(", ")}`);
  if (unknownCallNoCallCodes.size) warnings.push(`Unknown CallOrNoCall codes: ${[...unknownCallNoCallCodes].join(", ")}`);
  if (invalidUrls.length) warnings.push(`Malformed Video Clip URLs on rows: ${invalidUrls.slice(0, 10).join(", ")}`);

  const gameId = [...gameIds][0] || "";
  const possessions = buildPossessions(evaluations);
  const events = buildEvents(evaluations);

  return {
    schema_version: PGR_SCHEMA_VERSION,
    filename,
    worksheet_name: worksheetName,
    game_id: gameId,
    warnings,
    errors,
    evaluations,
    events,
    possessions,
    row_count: evaluations.length,
    event_count: events.length,
    possession_count: possessions.length,
    source_payload: {
      columns: headers,
      sheetNames,
    },
  };
}

export async function parsePgrWorkbook(input, { filename = "PGR workbook" } = {}) {
  const sheets = await readXlsxFile(normalizeWorkbookInput(input), { getSheets: true });
  const workbookSheets = Array.isArray(sheets) ? sheets : [];
  const { sheetName, rows } = findWorksheet(workbookSheets);
  return parsePgrRows(rows, {
    filename,
    worksheetName: sheetName,
    sheetNames: workbookSheets.map((worksheet) => worksheet.sheet).filter(Boolean),
  });
}

export function summarizePgrEvaluations(evaluations) {
  const rows = Array.isArray(evaluations) ? evaluations : [];
  const byAction = {};
  const byInfractionType = {};
  const byPeriod = {};
  rows.forEach((row) => {
    const action = row.player_action_code || "Unknown";
    const infractionType = row.infraction_type_name || "Unknown";
    const period = row.period_name || "Unknown";
    byAction[action] = (byAction[action] || 0) + 1;
    byInfractionType[infractionType] = (byInfractionType[infractionType] || 0) + 1;
    byPeriod[period] = (byPeriod[period] || 0) + 1;
  });
  return {
    unit: "evaluation",
    evaluations: rows.length,
    events: new Set(rows.map((row) => row.event_id).filter(Boolean)).size,
    possessions: new Set(rows.map((row) => row.pos_id).filter(Boolean)).size,
    calls: rows.filter((row) => row.call_or_no_call === "C").length,
    noCalls: rows.filter((row) => row.call_or_no_call === "NC").length,
    infractions: rows.filter((row) => row.player_action_code === "INF").length,
    judgmentCalls: rows.filter((row) => ["PI", "PII", "PIN"].includes(row.player_action_code)).length,
    byAction,
    byInfractionType,
    byPeriod,
  };
}
