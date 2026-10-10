export type RefereeAssignment = {
  game: string;
  crewChief: string;
  crewChiefNumber: string;
  referee: string;
  refereeNumber: string;
  umpire: string;
  umpireNumber: string;
  alternate: string;
  alternateNumber: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cellText(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function officialName(value: string) {
  return value.replace(/\s*\(#\d+\)\s*/gi, "").trim();
}

function officialNumber(value: string) {
  return value.match(/\(#(\d+)\)/)?.[1] || "";
}

export function parseRefereeAssignments(html: string): RefereeAssignment[] {
  const assignments: RefereeAssignment[] = [];
  const rows = String(html || "").match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  rows.forEach((row) => {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => cellText(match[1]));
    if (cells.length < 4) return;
    const assignment = {
      game: cells[0],
      crewChief: officialName(cells[1]),
      crewChiefNumber: officialNumber(cells[1]),
      referee: officialName(cells[2]),
      refereeNumber: officialNumber(cells[2]),
      umpire: officialName(cells[3]),
      umpireNumber: officialNumber(cells[3]),
      alternate: officialName(cells[4] || ""),
      alternateNumber: officialNumber(cells[4] || ""),
    };
    if (assignment.game && assignment.crewChief && assignment.referee && assignment.umpire) {
      assignments.push(assignment);
    }
  });
  return assignments;
}
