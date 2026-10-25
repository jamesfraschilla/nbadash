const type = (a) => String(a?.actionType || "").toLowerCase().replace(/[^a-z]/g, "");
const clockKey = (a) => `${a.period}|${a.clock}`;

// NBA.com embeds review results that are sometimes absent from liveData PBP.
// The timeout's team is the challenger; a later (CC) jump-ball participant is not.
export function recoverOfficialReviewMarkers(game, pageActions) {
  const primary = game.playByPlayActions || [];
  const teams = [game.homeTeam, game.awayTeam].filter(Boolean);
  const owner = (a) => teams.find((t) => String(t.teamId) === String(a.teamId || a.personId));
  const byNumber = new Map(primary.map((a) => [Number(a.actionNumber), a]));
  const reviews = [];
  for (let index = 0; index < pageActions.length; index++) {
    const a = pageActions[index];
    if (type(a) !== "instantreplay" || !/coach.*challenge/i.test(a.subType || "")) continue;
    const result = /overturn/i.test(a.subType) ? "overturned" : /support|stands|upheld/i.test(a.subType) ? "stands" : "";
    if (!result) continue;
    const timeout = [...pageActions.slice(0, index), ...primary].reverse()
      .find((candidate) => clockKey(candidate) === clockKey(a) && type(candidate) === "timeout" && owner(candidate));
    const team = timeout ? owner(timeout) : null;
    if (!team) throw new Error(`NBA review has no verified challenging timeout team: ${game.gameId} ${clockKey(a)}`);
    const existing = byNumber.get(Number(a.actionNumber));
    const previous = pageActions.slice(0, index).reverse().map((p) => byNumber.get(Number(p.actionNumber))).find(Boolean);
    const following = pageActions.slice(index + 1).map((p) => byNumber.get(Number(p.actionNumber))).find(Boolean);
    const before = Number(previous?.orderNumber ?? previous?.actionNumber ?? 0);
    const after = Number(following?.orderNumber ?? following?.actionNumber ?? before + 2);
    reviews.push({ ...a, actionType: "instantreplay", subType: "challenge", descriptor: result,
      teamId: team.teamId, teamTricode: team.teamTricode,
      orderNumber: existing?.orderNumber ?? (after > before ? (before + after) / 2 : before + 0.5),
      recoveredFrom: "nba_com_embedded_play_by_play" });
  }
  const keys = new Set(reviews.map(clockKey));
  return [...primary.filter((a) => !(type(a) === "instantreplay" && keys.has(clockKey(a)))), ...reviews]
    .sort((a, b) => Number(a.orderNumber ?? a.actionNumber) - Number(b.orderNumber ?? b.actionNumber));
}
