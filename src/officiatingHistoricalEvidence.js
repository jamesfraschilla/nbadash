import { challengeClockSeconds } from "./officiatingGamebookChallenges.js";

const TEAM_NAMES = { ATL: "Hawks", BOS: "Celtics", BKN: "Nets", CHA: "Hornets", CHI: "Bulls", CLE: "Cavaliers", DAL: "Mavericks", DEN: "Nuggets", DET: "Pistons", GSW: "Warriors", HOU: "Rockets", IND: "Pacers", LAC: "Clippers", LAL: "Lakers", MEM: "Grizzlies", MIA: "Heat", MIL: "Bucks", MIN: "Timberwolves", NOP: "Pelicans", NYK: "Knicks", OKC: "Thunder", ORL: "Magic", PHI: "76ers", PHX: "Suns", POR: "Trail Blazers", SAC: "Kings", SAS: "Spurs", TOR: "Raptors", UTA: "Jazz", WAS: "Wizards", NZB: "Breakers" };
const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const seconds = row => challengeClockSeconds(row.gameClock ?? row.game_clock);
const period = row => Number(row.period);
function teamMatches(log, book) {
  const name = TEAM_NAMES[log.challenging_team];
  return Boolean(name && norm(book.challengingTeamName) === norm(name));
}
function compatible(log, book) {
  if (!teamMatches(log, book)) return false;
  if (book.outcome && book.outcome !== log.challenge_outcome) return false;
  if (log.challenge_type && book.challengeType && log.challenge_type !== book.challengeType) return false;
  return true;
}

// Never attach by closest clock alone. A differing official clock/quarter is
// recoverable only through an exclusive team/type/outcome source concordance.
export function selectHistoricalBookEvidence(log, logs, books) {
  const matching = books.filter(b => compatible(log, b));
  const exact = books.filter(b => teamMatches(log, b) && (!b.outcome || b.outcome === log.challenge_outcome)
    && period(b) === period(log) && Math.abs(seconds(b) - seconds(log)) < 0.11);
  if (exact.length === 1) return { book: exact[0], reason: "exact-team-period-clock" };
  if (exact.length > 1) return null;
  const near = matching.filter(b => period(b) === period(log) && Math.abs(seconds(b) - seconds(log)) <= 4);
  if (near.length === 1 && logs.filter(l => compatible(l, near[0]) && period(l) === period(near[0])
    && Math.abs(seconds(l) - seconds(near[0])) <= 4).length === 1)
    return { book: near[0], reason: "exclusive-team-type-outcome-near-clock" };
  const unclaimedBooks = matching.filter(b => !logs.some(other => other !== log && compatible(other, b)
    && period(other) === period(b) && Math.abs(seconds(other) - seconds(b)) <= 4));
  const unmatchedLogs = logs.filter(l => unclaimedBooks.some(b => compatible(l, b))
    && !books.some(b => compatible(l, b) && period(l) === period(b) && Math.abs(seconds(l) - seconds(b)) <= 4));
  if (unclaimedBooks.length === 1 && unmatchedLogs.length === 1 && unmatchedLogs[0] === log)
    return { book: unclaimedBooks[0], reason: "exclusive-unmatched-team-type-outcome" };
  return null;
}
