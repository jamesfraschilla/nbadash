import fs from "node:fs";

const base = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
if (!base) throw new Error("Supabase URL is required.");
const response = await fetch(`${base}/functions/v1/nba-rosters`, { signal: AbortSignal.timeout(150_000) });
if (!response.ok) throw new Error(`Live roster refresh failed (${response.status}). Existing rosters are unchanged.`);
const feed = await response.json();
if (feed.partial || feed.cacheFallback || feed.cachedTeamIds?.length || feed.errors?.length) {
  throw new Error("Roster refresh is incomplete or cached; refusing to replace the validated local roster.");
}
const teams = feed.teams || {};
if (Object.keys(teams).length !== 30) throw new Error("Expected all 30 teams. Existing rosters are unchanged.");
const rosters = {};
const seen = new Set();
for (const [teamId, team] of Object.entries(teams)) {
  const players = team.players;
  if (!/^161061\d{4}$/.test(teamId) || !Array.isArray(players) || players.length < 10) throw new Error(`Incomplete team ${teamId}.`);
  rosters[teamId] = players.map((player) => {
    if (!player.personId || !player.fullName || seen.has(String(player.personId))) throw new Error(`Invalid/duplicate player for ${teamId}.`);
    seen.add(String(player.personId));
    return { personId: player.personId, firstName: player.firstName || "", familyName: player.familyName || "", fullName: player.fullName, jerseyNum: String(player.jerseyNum ?? ""), position: player.position || "" };
  });
}
// Mechanical data generation only, after every team has passed validation.
fs.writeFileSync("src/data/rosters.json", `${JSON.stringify(rosters, null, 2)}\n`);
console.log(`Refreshed ${seen.size} players across 30 NBA teams from the live roster feed.`);
