function officialAliases(row = {}) {
  return [row.official_id, row.official_name]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

export function markParticipatingAssignments(assignmentRows = [], callRows = []) {
  const callsByGame = new Map();
  callRows.forEach((row) => {
    const gameId = String(row.game_id || "");
    if (!callsByGame.has(gameId)) callsByGame.set(gameId, new Set());
    officialAliases(row).forEach((alias) => callsByGame.get(gameId).add(alias));
  });

  const assignmentsByGame = new Map();
  assignmentRows.forEach((row) => {
    const gameId = String(row.game_id || "");
    if (!assignmentsByGame.has(gameId)) assignmentsByGame.set(gameId, []);
    assignmentsByGame.get(gameId).push(row);
  });

  assignmentsByGame.forEach((assignments, gameId) => {
    const calledAliases = callsByGame.get(gameId) || new Set();
    const ordered = [...assignments].sort((left, right) => (
      (Number(left.assignment_order) || 999) - (Number(right.assignment_order) || 999)
    ));
    const participants = new Set(ordered.filter((assignment) => (
      officialAliases(assignment).some((alias) => calledAliases.has(alias))
    )));
    for (const assignment of ordered) {
      if (participants.size >= Math.min(3, ordered.length)) break;
      participants.add(assignment);
    }
    ordered.forEach((assignment) => {
      assignment.is_alternate = !participants.has(assignment);
      if (assignment.is_alternate) assignment.role_key = "alternate";
      else if (assignment.role_key === "alternate") assignment.role_key = "";
    });
    const activeCrewChief = ordered.find((assignment) => !assignment.is_alternate && assignment.role_key === "crewChief");
    if (!activeCrewChief) {
      const firstActive = ordered.find((assignment) => !assignment.is_alternate);
      if (firstActive) firstActive.role_key = "crewChief";
    }
  });

  return assignmentRows;
}
