const OFFICIAL_TOKEN_PATTERN = /\(([^()]+)\)\s*$/;

function cleanText(value) {
  return String(value || "").trim();
}

function otherTeam(team, context = {}) {
  const current = cleanText(team);
  const home = cleanText(context.homeTeam);
  const away = cleanText(context.awayTeam);
  if (!current) return "";
  if (current === home) return away;
  if (current === away) return home;
  return "";
}

function compactActionPayload(action = {}) {
  return {
    actionNumber: action.actionNumber ?? null,
    orderNumber: action.orderNumber ?? null,
    period: action.period ?? null,
    clock: action.clock ?? "",
    timeActual: action.timeActual ?? "",
    actionType: action.actionType ?? "",
    subType: action.subType ?? "",
    descriptor: action.descriptor ?? "",
    description: action.description ?? "",
    officialId: action.officialId ?? "",
    teamId: action.teamId ?? "",
    teamTricode: action.teamTricode ?? "",
    personId: action.personId ?? "",
    playerName: action.playerName ?? "",
    foulDrawnPersonId: action.foulDrawnPersonId ?? "",
    foulDrawnPlayerName: action.foulDrawnPlayerName ?? "",
    foulPersonalTotal: action.foulPersonalTotal ?? null,
    foulTechnicalTotal: action.foulTechnicalTotal ?? null,
    turnoverTotal: action.turnoverTotal ?? null,
    side: action.side ?? "",
    xLegacy: action.xLegacy ?? null,
    yLegacy: action.yLegacy ?? null,
  };
}

export function normalizeOfficialKey(value) {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function getOfficialName(official) {
  const first = cleanText(official?.firstName);
  const last = cleanText(official?.familyName || official?.lastName);
  const combined = `${first} ${last}`.trim();
  return combined || cleanText(official?.name || official?.fullName || official?.displayName || official?.officialName);
}

function getOfficialId(official) {
  return cleanText(official?.personId || official?.officialId || official?.id);
}

function officialNameFromContext(officialId, context = {}) {
  const cleanId = cleanText(officialId);
  if (!cleanId) return "";
  const direct = context.officialNameById instanceof Map
    ? context.officialNameById.get(cleanId)
    : context.officialNameById?.[cleanId];
  return cleanText(direct);
}

function matchOfficialId(officialId, officials = []) {
  const cleanId = cleanText(officialId);
  if (!cleanId) {
    return { official: null, confidence: 0, reason: "missing-official-id" };
  }
  const matches = (Array.isArray(officials) ? officials : [])
    .filter((official) => getOfficialId(official) === cleanId);
  if (matches.length === 1) {
    return { official: matches[0], confidence: 1, reason: "exact-official-id" };
  }
  if (matches.length > 1) {
    return { official: null, confidence: 0.45, reason: "ambiguous-official-id" };
  }
  return { official: null, confidence: 0.86, reason: "unassigned-structured-official-id" };
}

function splitToken(token) {
  const normalized = cleanText(token).replace(/\s+/g, " ");
  const dotted = /^([A-Za-z])\.?\s*([A-Za-z][A-Za-z' -]+)$/.exec(normalized);
  if (dotted) {
    return {
      firstInitial: dotted[1].toLowerCase(),
      lastName: dotted[2].trim(),
    };
  }
  return {
    firstInitial: "",
    lastName: normalized,
  };
}

function isLikelyOfficialToken(token) {
  const text = cleanText(token);
  if (!text || /\d/.test(text)) return false;
  if (/^[PT]\d+(?:\.[TP]\d+)?$/i.test(text)) return false;
  return /^[A-Za-z][A-Za-z.' -]{1,40}$/.test(text);
}

export function extractOfficialToken(description) {
  const match = OFFICIAL_TOKEN_PATTERN.exec(cleanText(description));
  if (!match) return null;
  const token = cleanText(match[1]);
  return isLikelyOfficialToken(token) ? token : null;
}

export function matchOfficialToken(token, officials = []) {
  const cleanToken = cleanText(token);
  if (!cleanToken) {
    return { official: null, confidence: 0, reason: "missing-token" };
  }

  const tokenParts = splitToken(cleanToken);
  const tokenLastKey = normalizeOfficialKey(tokenParts.lastName);
  const candidates = (Array.isArray(officials) ? officials : [])
    .map((official) => {
      const fullName = getOfficialName(official);
      const nameParts = fullName.split(/\s+/).filter(Boolean);
      const firstName = cleanText(official?.firstName || nameParts[0]);
      const lastName = cleanText(official?.familyName || official?.lastName || nameParts[nameParts.length - 1]);
      return {
        official,
        fullName,
        firstInitial: firstName.charAt(0).toLowerCase(),
        lastKey: normalizeOfficialKey(lastName),
        fullKey: normalizeOfficialKey(fullName),
      };
    })
    .filter((entry) => entry.fullName);

  const exactFull = candidates.filter((entry) => entry.fullKey === normalizeOfficialKey(cleanToken));
  if (exactFull.length === 1) {
    return { official: exactFull[0].official, confidence: 1, reason: "exact-full-name" };
  }

  const initialLast = candidates.filter((entry) => (
    entry.lastKey === tokenLastKey &&
    (!tokenParts.firstInitial || entry.firstInitial === tokenParts.firstInitial)
  ));
  if (initialLast.length === 1) {
    return { official: initialLast[0].official, confidence: tokenParts.firstInitial ? 0.98 : 0.78, reason: "initial-last" };
  }
  if (initialLast.length > 1) {
    return { official: null, confidence: 0.35, reason: "ambiguous-initial-last" };
  }

  const lastOnly = candidates.filter((entry) => entry.lastKey === tokenLastKey);
  if (lastOnly.length === 1) {
    return { official: lastOnly[0].official, confidence: 0.72, reason: "last-name-only" };
  }
  if (lastOnly.length > 1) {
    return { official: null, confidence: 0.3, reason: "ambiguous-last-name" };
  }

  return { official: null, confidence: 0.2, reason: "no-official-match" };
}

export function classifyOfficialAction(action = {}) {
  const actionType = cleanText(action.actionType).toLowerCase();
  const subType = cleanText(action.subType).toLowerCase();
  const descriptor = cleanText(action.descriptor).toLowerCase();
  const description = cleanText(action.description);
  const lowerDescription = description.toLowerCase();

  let primaryCategory = "unknown_official_event";
  if (actionType === "foul" || lowerDescription.includes("foul")) primaryCategory = "foul";
  else if (actionType === "violation" || lowerDescription.includes("violation:")) primaryCategory = "violation";
  else if (actionType === "instantreplay") primaryCategory = "instant_replay";
  else if (lowerDescription.includes("technical foul")) primaryCategory = "technical";
  else if (lowerDescription.includes("ejection")) primaryCategory = "ejection";
  else if (actionType === "jumpball" || lowerDescription.includes("jump ball")) primaryCategory = "jump_ball";
  else if (actionType === "turnover") primaryCategory = "turnover";
  else if (actionType === "timeout") primaryCategory = "timeout";

  let secondaryCategory = subType || descriptor || "";
  if (primaryCategory === "violation") {
    const violationMatch = /violation:\s*([^()]+)/i.exec(description);
    secondaryCategory = cleanText(violationMatch?.[1] || secondaryCategory).toLowerCase().replace(/\s+/g, "_");
  } else if (primaryCategory === "technical") {
    secondaryCategory = "technical_foul";
  } else if (primaryCategory === "foul") {
    secondaryCategory = [descriptor, subType].filter(Boolean).join("_") || "foul";
  } else if (primaryCategory === "instant_replay") {
    secondaryCategory = [subType, descriptor].filter(Boolean).join("_") || "instant_replay";
  } else if (primaryCategory === "turnover") {
    secondaryCategory = [descriptor, subType].filter(Boolean).join("_") || "turnover";
  }

  return {
    primaryCategory,
    secondaryCategory: cleanText(secondaryCategory).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "",
  };
}

function isOfficialAttributedAction(action = {}) {
  const categories = classifyOfficialAction(action);
  const actionType = cleanText(action.actionType).toLowerCase();
  const subType = cleanText(action.subType).toLowerCase();
  if (actionType === "turnover" && subType.includes("offensive foul")) return false;
  return ["foul", "violation", "technical", "ejection", "turnover"].includes(categories.primaryCategory);
}

export function buildOfficialCallEvent(action = {}, context = {}) {
  const token = extractOfficialToken(action.description);
  const structuredOfficialId = cleanText(action.officialId);
  if (!token && !structuredOfficialId) return null;
  if (!isOfficialAttributedAction(action)) return null;

  const match = structuredOfficialId
    ? matchOfficialId(structuredOfficialId, context.officials)
    : matchOfficialToken(token, context.officials);
  const official = match.official;
  const categories = classifyOfficialAction(action);
  const officialName = official
    ? getOfficialName(official)
    : officialNameFromContext(structuredOfficialId, context);
  const officialId = structuredOfficialId || getOfficialId(official);
  const confidence = official
    ? match.confidence
    : officialName
      ? Math.max(match.confidence, 0.92)
      : match.confidence;
  const confidenceReason = official
    ? match.reason
    : officialName
      ? `${match.reason}+context-official-name`
      : match.reason;
  const teamTricode = cleanText(action.teamTricode);

  return {
    season: cleanText(context.season),
    seasonType: cleanText(context.seasonType),
    gameId: cleanText(context.gameId),
    gameDate: cleanText(context.gameDate),
    homeTeam: cleanText(context.homeTeam),
    awayTeam: cleanText(context.awayTeam),
    period: Number.isFinite(Number(action.period)) ? Number(action.period) : null,
    gameClock: cleanText(action.clock),
    actionNumber: Number.isFinite(Number(action.actionNumber)) ? Number(action.actionNumber) : null,
    orderNumber: Number.isFinite(Number(action.orderNumber)) ? Number(action.orderNumber) : null,
    actionType: cleanText(action.actionType),
    subType: cleanText(action.subType),
    descriptor: cleanText(action.descriptor),
    description: cleanText(action.description),
    officialToken: token,
    officialId,
    officialName,
    teamId: cleanText(action.teamId),
    teamTricode,
    playerId: cleanText(action.personId),
    playerName: cleanText(action.playerName),
    primaryCategory: categories.primaryCategory,
    secondaryCategory: categories.secondaryCategory,
    chargedTeam: teamTricode,
    benefitingTeam: otherTeam(teamTricode, context),
    confidence,
    confidenceReason,
    sourcePayload: compactActionPayload(action),
  };
}

export function extractOfficialCallEvents(game = {}, context = {}) {
  const actions = Array.isArray(game.playByPlayActions)
    ? game.playByPlayActions
    : Array.isArray(game.actions)
      ? game.actions
      : [];
  const officials = Array.isArray(game.officials) ? game.officials : [];
  const homeTeam = cleanText(game.homeTeam?.teamTricode || game.homeTeam?.tricode || context.homeTeam);
  const awayTeam = cleanText(game.awayTeam?.teamTricode || game.awayTeam?.tricode || context.awayTeam);

  return actions
    .map((action) => buildOfficialCallEvent(action, {
      ...context,
      officials,
      gameId: cleanText(game.gameId || context.gameId),
      gameDate: cleanText(game.gameDate || game.gameEt || context.gameDate),
      homeTeam,
      awayTeam,
      season: cleanText(game.seasonYear || context.season),
      seasonType: cleanText(game.seasonType || context.seasonType),
    }))
    .filter(Boolean);
}

export function detectCoachChallengeActions(game = {}, context = {}) {
  const actions = Array.isArray(game.playByPlayActions)
    ? game.playByPlayActions
    : Array.isArray(game.actions)
      ? game.actions
      : [];
  const homeTeam = cleanText(game.homeTeam?.teamTricode || game.homeTeam?.tricode || context.homeTeam);
  const awayTeam = cleanText(game.awayTeam?.teamTricode || game.awayTeam?.tricode || context.awayTeam);

  const challengeActionsByClock = new Map();
  actions
    .filter((action) => cleanText(action.subType).toLowerCase() === "challenge")
    .forEach((action) => {
      const key = [
        cleanText(action.teamTricode),
        cleanText(action.period),
        cleanText(action.clock),
      ].join("|");
      const existing = challengeActionsByClock.get(key);
      if (!existing || cleanText(action.actionType).toLowerCase() === "instantreplay") {
        challengeActionsByClock.set(key, action);
      }
    });

  return [...challengeActionsByClock.values()]
    .map((action) => {
      const actionType = cleanText(action.actionType).toLowerCase();
      const descriptor = cleanText(action.descriptor).toLowerCase();
      return {
        season: cleanText(game.seasonYear || context.season),
        seasonType: cleanText(game.seasonType || context.seasonType),
        gameId: cleanText(game.gameId || context.gameId),
        gameDate: cleanText(game.gameDate || game.gameEt || context.gameDate),
        homeTeam,
        awayTeam,
        challengingTeam: cleanText(action.teamTricode),
        period: Number.isFinite(Number(action.period)) ? Number(action.period) : null,
        gameClock: cleanText(action.clock),
        challengeOutcome: descriptor === "overturned" ? "successful" : descriptor ? "unsuccessful" : "",
        matchedActionNumber: Number.isFinite(Number(action.actionNumber)) ? Number(action.actionNumber) : null,
        matchConfidence: actionType === "instantreplay" ? 0.72 : 0.58,
        matchReason: actionType === "instantreplay"
          ? "detected-pbp-instantreplay-challenge"
          : `detected-pbp-${actionType || "unknown"}-challenge`,
        source: "play_by_play",
        sourcePayload: compactActionPayload(action),
      };
    });
}
