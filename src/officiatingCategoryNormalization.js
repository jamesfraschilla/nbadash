function titleCaseCategory(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function cleanCallCategoryPart(value) {
  const cleaned = String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const compact = cleaned.replace(/[^a-z0-9]+/g, "");
  return {
    awayfromplay: "away from play",
    clearpath: "clear path",
    defense3second: "defense 3 second",
    defensive3second: "defense 3 second",
    defensivethreesecond: "defense 3 second",
    "3secondviolation": "3 second violation",
    threesecondviolation: "3 second violation",
    "5secondviolation": "5 second violation",
    "8secondviolation": "8 second violation",
    "10secondfreethrowshooter": "10 second freethrow shooter",
    jumpball: "jump ball",
    kickedball: "kicked ball",
    lostball: "lost ball",
    badpass: "bad pass",
    shotclock: "shot clock",
    doubledribble: "double dribble",
    discontinueddribble: "discontinued dribble",
    flagranttype1: "flagrant type 1",
    flagranttype2: "flagrant type 2",
    doubletechnical: "double technical",
    delaytechnical: "delay technical",
    floppingtechnical: "flopping technical",
    nonunsportsmanliketechnical: "non unsportsmanlike technical",
    rimhangingtechnical: "rim hanging technical",
    excesstimeouttechnical: "excess timeout technical",
    defensivegoaltending: "defensive goaltending",
    offensivegoaltending: "offensive goaltending",
    looseball: "loose ball",
    personaltake: "personal take",
    transitiontake: "transition take",
    offtheball: "off the ball",
  }[compact] || cleaned;
}

function cleanArea(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function eventAreaParts(event = {}) {
  const payload = event.source_payload || event.sourcePayload || {};
  return [
    event.area,
    event.areaDetail,
    event.area_detail,
    payload.area,
    payload.areaDetail,
    payload.area_detail,
  ].map(cleanArea).filter(Boolean);
}

function isRestrictedArea(event = {}) {
  return eventAreaParts(event).some((part) => part.includes("restricted"));
}

function isThreePointArea(event = {}) {
  return eventAreaParts(event).some((part) => (
    /\b3\s*(?:pt|point|p)\b/.test(part)
    || part.includes("three point")
    || part.includes("corner 3")
    || part.includes("above the break 3")
  ));
}

export function shootingFoulLocationSubtype(event = {}, category = "") {
  const label = String(category || normalizeOfficialCallCategory(event));
  const isShooting = label === "Shooting Foul";
  if (!isShooting) return "";
  if (isRestrictedArea(event)) return "Restricted Area Shooting Foul";
  if (isThreePointArea(event)) return "3-Pt Shooting Foul";
  return "";
}

export function challengeFoulSubtype(event = {}, matchedCall = null) {
  const call = matchedCall || event;
  const category = normalizeOfficialCallCategory(call);

  const challengeSignal = [
    event.challenge_type,
    event.challengeType,
    event.initial_call,
    event.initialCall,
    call.primary_category,
    call.primaryCategory,
    call.secondary_category,
    call.secondaryCategory,
    call.action_type,
    call.actionType,
    call.description,
  ].map(cleanCallCategoryPart).join(" ");
  const isFoulChallenge = challengeSignal.includes("foul");
  if (isFoulChallenge) {
    if (isRestrictedArea(call)) return "Restricted Area";
    if (isThreePointArea(call)) return "3-Pt";
  }

  if (category && category !== "Unknown") return category;

  const initialCall = cleanCallCategoryPart(event.initial_call || event.initialCall);
  if (initialCall.includes("team ball") || initialCall.includes("out of bounds")) return "Out Of Bounds";
  if (initialCall === "goaltending") return "Goaltending";
  if (initialCall === "basket interference") return "Basket Interference";
  if (initialCall === "jump ball") return "Jump Ball";
  return initialCall ? titleCaseCategory(initialCall) : "";
}

export function isCountedTechnicalCategory(value) {
  const category = cleanCallCategoryPart(value);
  return category === "technical" || category === "double technical";
}

function isExcludedTechnicalCategory(value) {
  return [
    "defense 3 second",
    "delay technical",
    "flopping technical",
    "rim hanging technical",
    "non unsportsmanlike technical",
    "excess timeout technical",
  ].includes(cleanCallCategoryPart(value));
}

export function isCountedTechnicalEvent(event = {}) {
  const secondary = event.secondary_category || event.secondaryCategory;
  const descriptor = event.descriptor;
  const subType = event.sub_type || event.subType;
  if ([secondary, descriptor, subType].some(isExcludedTechnicalCategory)) return false;
  return cleanCallCategoryPart(event.primary_category || event.primaryCategory) === "technical"
    || isCountedTechnicalCategory(secondary);
}

function normalizedFoulCategory(parts) {
  const uniqueParts = [...new Set(parts.filter(Boolean).filter((part) => part !== "foul"))];
  const partSet = new Set(uniqueParts);
  if (partSet.has("defense 3 second")) return "Defensive 3 Second Violation";
  if (partSet.has("delay technical") || partSet.has("delay") || partSet.has("excess timeout technical")) return "Delay Of Game";
  if (partSet.has("flopping technical")) return "Flopping Technical";
  if (partSet.has("rim hanging technical")) return "Rim Hanging Technical";
  if (partSet.has("non unsportsmanlike technical")) return "Non Unsportsmanlike Technical";
  if (uniqueParts.some(isCountedTechnicalCategory)) return "Technical Foul";
  if (partSet.has("shooting")) return "Shooting Foul";
  if (partSet.has("loose ball")) return "Loose Ball Foul";
  if (partSet.has("flagrant type 1")) return "Flagrant Type 1 Foul";
  if (partSet.has("flagrant type 2")) return "Flagrant Type 2 Foul";
  if (partSet.has("away from play")) return "Away From Play Foul";
  if (partSet.has("transition take")) return "Transition Take Foul";
  if (partSet.has("personal take") || partSet.has("take")) return "Take Foul";
  if (partSet.has("offensive") || partSet.has("charge") || partSet.has("off the ball")) return "Offensive Foul";
  if (partSet.has("clear path")) return "Clear Path Foul";
  if (partSet.has("flagrant")) return "Flagrant Foul";
  if (partSet.has("double")) return "Double Personal Foul";
  if (uniqueParts.length === 1 && uniqueParts[0] === "personal") return "Foul on Floor";
  const visibleParts = uniqueParts.filter((part) => part !== "personal");
  return visibleParts.length ? titleCaseCategory(`${visibleParts.join(" ")} foul`) : "Foul on Floor";
}

function normalizedViolationCategory(value) {
  const category = cleanCallCategoryPart(value);
  if (category === "3 second violation") return "Offensive 3 Second Violation";
  if (category === "defense 3 second") return "Defensive 3 Second Violation";
  if (category === "shot clock") return "Shot Clock Violation";
  if (category === "5 second violation") return "5 Second Violation";
  if (category === "8 second violation") return "8 Second Violation";
  if (category === "10 second freethrow shooter") return "10 Second Free Throw Violation";
  if (category === "defensive goaltending") return "Defensive Goaltending";
  if (category === "offensive goaltending") return "Offensive Goaltending";
  if (category === "discontinued dribble") return "Palming";
  if (category === "jump ball") return "Jump Ball";
  return category ? titleCaseCategory(category) : "Violation";
}

export function normalizeOfficialCallCategory(event = {}) {
  const primary = cleanCallCategoryPart(event.primary_category || event.primaryCategory);
  const secondary = cleanCallCategoryPart(event.secondary_category || event.secondaryCategory);
  const descriptor = cleanCallCategoryPart(event.descriptor);
  const subType = cleanCallCategoryPart(event.sub_type || event.subType);
  const description = String(event.description || "");

  if (primary === "violation") {
    const violationMatch = /violation:\s*([^()]+)/i.exec(description);
    return normalizedViolationCategory(violationMatch?.[1] || secondary || descriptor || subType);
  }

  if (primary === "foul" || primary === "technical") {
    const category = normalizedFoulCategory([secondary, descriptor, subType, primary]);
    return shootingFoulLocationSubtype(event, category) || category;
  }

  if (primary === "jump ball") return "Jump Ball";

  if (primary === "turnover") {
    const turnover = cleanCallCategoryPart(secondary || descriptor || subType);
    if (["lost ball", "bad pass", "step out of bounds"].includes(turnover) || turnover.includes("out of bounds")) return "Out Of Bounds";
    return normalizedViolationCategory(turnover);
  }

  if (secondary && secondary !== primary) return titleCaseCategory(secondary);
  if (primary) return titleCaseCategory(primary);
  return "Unknown";
}

export const CALL_CATEGORY_GROUPS = [
  {
    key: "fouls",
    title: "Fouls",
    types: [
      {
        label: "Shooting Foul",
        labels: ["Shooting Foul", "Restricted Area Shooting Foul", "3-Pt Shooting Foul"],
        subTypes: [
          { label: "Restricted Area", labels: ["Restricted Area Shooting Foul"] },
          { label: "3-Pt", labels: ["3-Pt Shooting Foul"] },
        ],
      },
      { label: "Offensive Foul", labels: ["Offensive Foul"] },
      {
        label: "Foul on Floor",
        labels: ["Foul on Floor", "Away From Play Foul", "Loose Ball Foul", "Double Personal Foul"],
        subTypes: [
          { label: "Foul on Floor", labels: ["Foul on Floor"] },
          { label: "Away From the Play Foul", labels: ["Away From Play Foul"] },
          { label: "Loose Ball Foul", labels: ["Loose Ball Foul"] },
          { label: "Double Personal Foul", labels: ["Double Personal Foul"] },
        ],
      },
      {
        label: "Transition Foul",
        labels: ["Transition Take Foul", "Clear Path Foul"],
        subTypes: [
          { label: "Transition Take Foul", labels: ["Transition Take Foul"] },
          { label: "Clear Path Foul", labels: ["Clear Path Foul"] },
        ],
      },
      {
        label: "Flagrant Foul",
        labels: ["Flagrant Type 1 Foul", "Flagrant Type 2 Foul"],
        subTypes: [
          { label: "Flagrant Type 1 Foul", labels: ["Flagrant Type 1 Foul"] },
          { label: "Flagrant Type 2 Foul", labels: ["Flagrant Type 2 Foul"] },
        ],
      },
      {
        label: "Administrative Foul",
        labels: ["Technical Foul", "Delay Of Game", "Flopping Technical", "Rim Hanging Technical", "Non Unsportsmanlike Technical"],
        subTypes: [
          { label: "Technical Foul", labels: ["Technical Foul"] },
          { label: "Delay of Game", labels: ["Delay Of Game"] },
          { label: "Flopping Technical", labels: ["Flopping Technical"] },
          { label: "Rim Hanging Technical", labels: ["Rim Hanging Technical"] },
          { label: "Non Unsportsmanlike Technical", labels: ["Non Unsportsmanlike Technical"] },
        ],
      },
    ],
  },
  {
    key: "violations",
    title: "Violations",
    types: [
      {
        label: "Handling Violation",
        labels: ["Traveling", "Double Dribble", "Palming", "Backcourt", "Offensive Goaltending"],
        subTypes: [
          { label: "Traveling", labels: ["Traveling"] },
          { label: "Double Dribble", labels: ["Double Dribble"] },
          { label: "Palming", labels: ["Palming"] },
          { label: "Backcourt", labels: ["Backcourt"] },
          { label: "Offensive Goaltending", labels: ["Offensive Goaltending"] },
        ],
      },
      {
        label: "Timing Violation",
        labels: ["8 Second Violation", "5 Second Violation", "Offensive 3 Second Violation", "Shot Clock Violation", "10 Second Free Throw Violation"],
        subTypes: [
          { label: "8 Second Violation", labels: ["8 Second Violation"] },
          { label: "5 Second Violation", labels: ["5 Second Violation"] },
          { label: "Offensive 3 Second Violation", labels: ["Offensive 3 Second Violation"] },
          { label: "Shot Clock Violation", labels: ["Shot Clock Violation"] },
          { label: "10 Second Free Throw Violation", labels: ["10 Second Free Throw Violation"] },
        ],
      },
      {
        label: "Goaltending",
        labels: ["Offensive Goaltending", "Defensive Goaltending"],
        subTypes: [
          { label: "Offensive Goaltending", labels: ["Offensive Goaltending"] },
          { label: "Defensive Goaltending", labels: ["Defensive Goaltending"] },
        ],
      },
      {
        label: "Defensive Violation",
        labels: ["Defensive Goaltending", "Defensive 3 Second Violation", "Kicked Ball", "Punched Ball"],
        subTypes: [
          { label: "Defensive Goaltending", labels: ["Defensive Goaltending"] },
          { label: "Defensive 3 Second Violation", labels: ["Defensive 3 Second Violation"] },
          { label: "Kicked Ball", labels: ["Kicked Ball"] },
          { label: "Punched Ball", labels: ["Punched Ball"] },
        ],
      },
      {
        label: "Misc Violations",
        labels: ["Inbound", "Lane", "Jump Ball", "Illegal Assist"],
        subTypes: [
          { label: "Inbound", labels: ["Inbound"] },
          { label: "Lane", labels: ["Lane"] },
          { label: "Jump Ball", labels: ["Jump Ball"] },
          { label: "Illegal Assist", labels: ["Illegal Assist"] },
        ],
      },
      {
        label: "Out of Bounds",
        labels: ["Out Of Bounds"],
      },
    ],
  },
];
