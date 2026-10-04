import fs from "node:fs";

const rosters = JSON.parse(fs.readFileSync("src/data/rosters.json", "utf8"));
const teams = Object.entries(rosters);
if (teams.length !== 30) throw new Error(`Expected 30 NBA teams, found ${teams.length}.`);
const personIds = new Set();
for (const [teamId, players] of teams) {
  if (!/^161061\d{4}$/.test(teamId) || !Array.isArray(players) || players.length < 10) {
    throw new Error(`Invalid roster for team ${teamId}.`);
  }
  for (const player of players) {
    if (!player.personId || !player.fullName || personIds.has(String(player.personId))) {
      throw new Error(`Invalid or duplicate player in team ${teamId}.`);
    }
    personIds.add(String(player.personId));
  }
}
console.log(`Validated ${personIds.size} unique players across 30 teams.`);
