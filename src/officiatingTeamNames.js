export const OFFICIATING_TEAM_NAMES = { ATL: "Hawks", BOS: "Celtics", BKN: "Nets", CHA: "Hornets", CHI: "Bulls", CLE: "Cavaliers", DAL: "Mavericks", DEN: "Nuggets", DET: "Pistons", GSW: "Warriors", HOU: "Rockets", IND: "Pacers", LAC: "Clippers", LAL: "Lakers", MEM: "Grizzlies", MIA: "Heat", MIL: "Bucks", MIN: "Timberwolves", NOP: "Pelicans", NYK: "Knicks", OKC: "Thunder", ORL: "Magic", PHI: "76ers", PHX: "Suns", POR: "Trail Blazers", SAC: "Kings", SAS: "Spurs", TOR: "Raptors", UTA: "Jazz", WAS: "Wizards", NZB: "Breakers" };

export function gamebookTeamMatches(challenge, book) {
  const name=OFFICIATING_TEAM_NAMES[challenge.challenging_team];
  const normalize=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  return !!name && normalize(book.challengingTeamName)===normalize(name);
}
