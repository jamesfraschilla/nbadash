import fs from "node:fs";

const base = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
if (!base) throw new Error("Supabase URL is required.");
const response = await fetch(`${base}/functions/v1/nba-rosters`, { signal: AbortSignal.timeout(150_000) });
if (!response.ok) throw new Error(`Live roster refresh failed (${response.status}). Existing rosters are unchanged.`);
const feed = await response.json();
const teams = { ...(feed.teams || {}) };
const expected = Object.keys(JSON.parse(fs.readFileSync("src/data/rosters.json", "utf8")));
let pending = expected.filter((id) => !teams[id] || feed.cacheFallback || feed.fallbackSeason
  || feed.cachedTeamIds?.includes(id) || feed.errors?.some((error) => error.teamId === id));
// All-team requests can hit the Edge deadline even when most teams succeed.
// Keep their verified results and retry only missing teams in bounded batches.
for (let attempt = 1; attempt <= 2 && pending.length; attempt++) {
  const retry = [];
  for (let start = 0; start < pending.length; start += 6) {
    const ids = pending.slice(start, start + 6);
    try {
      const response = await fetch(`${base}/functions/v1/nba-rosters?teamIds=${ids.join(",")}`, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Roster retry returned ${response.status}.`);
      const result = await response.json();
      for (const id of ids) {
        if (!result.teams?.[id] || result.cacheFallback || result.fallbackSeason || result.cachedTeamIds?.includes(id)
          || result.errors?.some((error) => error.teamId === id)) retry.push(id);
        else teams[id] = result.teams[id];
      }
    } catch {
      retry.push(...ids);
    }
  }
  console.log(`Roster retry ${attempt}: ${retry.length} team(s) still awaiting a live response.`);
  pending = retry;
}
if (pending.length) throw new Error(`Roster refresh is incomplete for ${pending.length} team(s); existing rosters are unchanged.`);
if (Object.keys(teams).length !== 30) throw new Error("Expected all 30 teams. Existing rosters are unchanged.");
const rosters = {};
const seen = new Set();
for (const [teamId, team] of Object.entries(teams)) {
  const players = team.players;
  if (!/^161061\d{4}$/.test(teamId) || !Array.isArray(players) || players.length < 10) throw new Error(`Incomplete team ${teamId}.`);
  rosters[teamId] = players.map((player) => {
    if (!player.personId || !player.fullName || seen.has(String(player.personId))) throw new Error(`Invalid/duplicate player for ${teamId}.`);
    seen.add(String(player.personId));
    const parts = player.fullName.trim().split(/\s+/);
    const suffixes = [];
    while (parts.length > 1 && /^(?:jr\.?|sr\.?|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(parts.at(-1))) suffixes.unshift(parts.pop());
    const familyName = [parts.length > 1 ? parts.pop() : "", ...suffixes].filter(Boolean).join(" ");
    return { personId: player.personId, firstName: parts.join(" "), familyName, fullName: player.fullName, jerseyNum: String(player.jerseyNum ?? ""), position: player.position || "" };
  });
}
// Mechanical data generation only, after every team has passed validation.
fs.writeFileSync("src/data/rosters.json", `${JSON.stringify(rosters, null, 2)}\n`);
console.log(`Refreshed ${seen.size} players across 30 NBA teams from the live roster feed.`);
