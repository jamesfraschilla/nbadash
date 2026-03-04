const ROLE_ORDER = {
  crewChief: 0,
  referee: 1,
  umpire: 2,
};

const ROLE_PATHS = [
  "roleKey",
  "assignment",
  "role",
  "title",
  "position",
  "officialRole",
  "roleName",
  "assignment.name",
  "assignment.title",
  "assignment.role",
  "assignment.position",
  "assignment.description",
  "assignment.label",
  "assignment.type",
  "assignment.assignment",
  "metadata.assignment",
  "metadata.role",
];

const ORDER_PATHS = [
  "assignmentOrder",
  "sortOrder",
  "order",
  "sequence",
  "assignmentSequence",
  "sequenceNumber",
  "positionOrder",
  "officialOrder",
  "assignment.order",
  "assignment.sequence",
  "assignment.sortOrder",
  "assignment.position",
  "assignment.orderNumber",
  "metadata.order",
  "metadata.sequence",
];

let publishedAssignmentsPromise = null;

export function normalizeNameKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

export function normalizeOfficialRole(rawValue) {
  const numericRole = normalizeRoleOrderValue(rawValue);
  if (numericRole != null) {
    if (numericRole === 1) return "crewChief";
    if (numericRole === 2) return "referee";
    if (numericRole === 3) return "umpire";
  }
  const compact = String(rawValue || "").replace(/[^a-z]/gi, "").toLowerCase();
  if (!compact) return null;
  if (compact.includes("alternate")) return "alternate";
  if (compact === "crewchief" || (compact.includes("crew") && compact.includes("chief"))) {
    return "crewChief";
  }
  if (compact.includes("umpire")) return "umpire";
  if (compact.includes("referee")) return "referee";
  return null;
}

function getNestedValue(source, path) {
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function normalizeRoleOrderValue(rawValue) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    const rounded = Math.round(rawValue);
    return rounded >= 1 && rounded <= 3 ? rounded : null;
  }

  const text = String(rawValue ?? "").trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return parsed >= 1 && parsed <= 3 ? parsed : null;
}

export function getOfficialSortMeta(official) {
  const explicitAlternate = Boolean(official?.isAlternate || official?.alternate);

  let role = null;
  for (const path of ROLE_PATHS) {
    const candidate = getNestedValue(official, path);
    const nextRole = normalizeOfficialRole(candidate);
    if (nextRole) {
      role = nextRole;
      break;
    }
  }

  let order = null;
  for (const path of ORDER_PATHS) {
    const candidate = getNestedValue(official, path);
    const nextOrder = normalizeRoleOrderValue(candidate);
    if (nextOrder != null) {
      order = nextOrder;
      break;
    }
  }

  if (order == null && role && role !== "alternate") {
    order = (ROLE_ORDER[role] ?? 99) + 1;
  }

  return {
    role,
    order,
    isAlternate: explicitAlternate || role === "alternate",
  };
}

export function getOfficialDisplayName(official) {
  const first = String(official?.firstName || "").trim();
  const last = String(official?.familyName || official?.lastName || "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  return String(
    official?.name ||
    official?.fullName ||
    official?.displayName ||
    official?.officialName ||
    ""
  ).trim();
}

export function isAlternateOfficial(official) {
  return getOfficialSortMeta(official).isAlternate;
}

export function sortOfficialsByRole(officials) {
  const primary = [...(officials || [])]
    .map((official, index) => ({
      official,
      index,
      ...getOfficialSortMeta(official),
    }))
    .filter(({ isAlternate }) => !isAlternate);

  const hasExplicitOrder = primary.some(({ order }) => order != null);
  if (hasExplicitOrder) {
    return primary
      .sort((a, b) => {
        const aOrder = a.order == null ? 99 : a.order;
        const bOrder = b.order == null ? 99 : b.order;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.index - b.index;
      })
      .map(({ official }) => official);
  }

  const hasExplicitRole = primary.some(({ role }) => role && role !== "alternate");
  if (!hasExplicitRole) {
    return primary.map(({ official }) => official);
  }

  return primary
    .sort((a, b) => {
      const aOrder = a.role ? (ROLE_ORDER[a.role] ?? 99) : 99;
      const bOrder = b.role ? (ROLE_ORDER[b.role] ?? 99) : 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map(({ official }) => official);
}

export function orderOfficials(officials, publishedOrder = null) {
  const primary = sortOfficialsByRole(officials);
  if (!publishedOrder?.length) return primary;

  const rankMap = new Map(
    publishedOrder.map((name, index) => [normalizeNameKey(name), index])
  );

  return [...primary].sort((a, b) => {
    const aRank = rankMap.get(normalizeNameKey(getOfficialDisplayName(a)));
    const bRank = rankMap.get(normalizeNameKey(getOfficialDisplayName(b)));
    const safeARank = aRank == null ? 99 : aRank;
    const safeBRank = bRank == null ? 99 : bRank;
    if (safeARank !== safeBRank) return safeARank - safeBRank;
    return 0;
  });
}

function stripNumberSuffix(value) {
  return String(value || "")
    .replace(/\s*\(#\d+\)\s*/gi, "")
    .trim();
}

async function fetchPublishedAssignments() {
  if (!publishedAssignmentsPromise) {
    publishedAssignmentsPromise = fetch(
      "https://official.nba.com/wp-json/wp/v2/posts?slug=referee-assignments&_fields=content.rendered"
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed assignments request: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        const rendered = payload?.[0]?.content?.rendered;
        if (!rendered || typeof DOMParser === "undefined") return [];

        const parser = new DOMParser();
        const doc = parser.parseFromString(rendered, "text/html");
        const tables = Array.from(doc.querySelectorAll("table"));

        for (const table of tables) {
          const rows = Array.from(table.querySelectorAll("tr"));
          const assignments = rows
            .map((row) => Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent?.trim() || ""))
            .filter((cells) => cells.length >= 4)
            .map((cells) => ({
              game: cells[0],
              crewChief: stripNumberSuffix(cells[1]),
              referee: stripNumberSuffix(cells[2]),
              umpire: stripNumberSuffix(cells[3]),
              alternate: stripNumberSuffix(cells[4] || ""),
            }))
            .filter((row) => row.crewChief && row.referee && row.umpire);

          if (assignments.length) {
            return assignments;
          }
        }

        return [];
      })
      .catch(() => []);
  }

  return publishedAssignmentsPromise;
}

export async function fetchPublishedOrderForOfficials(officials) {
  const nameSet = new Set(
    (officials || [])
      .map((official) => normalizeNameKey(getOfficialDisplayName(official)))
      .filter(Boolean)
  );

  if (nameSet.size < 3) return null;

  const assignments = await fetchPublishedAssignments();
  for (const row of assignments) {
    const publishedNames = [row.crewChief, row.referee, row.umpire];
    const matchCount = publishedNames.reduce((count, name) => (
      nameSet.has(normalizeNameKey(name)) ? count + 1 : count
    ), 0);

    if (matchCount === 3) {
      return publishedNames;
    }
  }

  return null;
}
