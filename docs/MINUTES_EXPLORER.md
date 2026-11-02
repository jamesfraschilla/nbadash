# Minutes: Table, Timeline, and Combos

All views are read-only and use the existing game/minutes queries. No new
polling, database tables, writes, or persistent storage are introduced. Saved
Rotations charts, scope keys, payloads, and hydration are untouched.

- Table remains the default. Vantage uses team tricodes, with Neutral between.
  Washington games default to WAS whether home or away; other games default to
  the away team. A manually selected vantage stays selected during that visit.
- Timeline shows individual player appearances by elapsed game time, red for
  negative margin, gray for zero, green for positive. Neutral shows both teams;
  each team's margin is always from its own perspective. Appearances are split
  at period boundaries. Overtime uses five-minute intervals.
- Combos supports up to four selected players and all 2^N on/off combinations.
  Minutes and counting events are aggregated first; rates are calculated from
  the combined counts. Zero denominators display a dash, not a fabricated zero.
  Player headshots appear in selectors and comparison rows; off players are
  faded/grayscale. Selections are held separately per team in page-local state,
  survive switching between views, and reset on leaving Minutes. Reset clears
  the current team's selection. Neutral provides a separate team
  selector because combination rates always require a team perspective.

## Calculation contract

POSS is estimated offensive possessions: FGA + 0.44 FTA - player OREB + TOV.
ORTG uses offensive possessions; DRTG uses the opponent's possessions. NET is
ORTG minus DRTG. eFG% = (FGM + 0.5 3PM) / FGA. TOV% = TOV /
(FGA + 0.44 FTA + TOV). Opponent rates use the same formulas.

Score attribution at substitution boundaries reconciles to the minutes feed's
interval scoring, not blindly to the latest NBA action order. The NBA PBP and
box score can disagree on the order of free throws and substitutions sharing a
clock. Boundary scoring is allocated chronologically against each interval's
remaining score budget; non-scoring rows use substitution order as a tie-breaker.
This is a clock-boundary attribution convention, not an exact possession model.
Possessions spanning substitutions and short samples remain inherently noisy.

Before showing combination statistics, check game/team/score identity, interval
coverage, five unique players per lineup, interval scoring, shooting totals,
and player box-score plus/minus when supplied. Any disagreement suppresses
combination statistics and shows an explanation. Timeline remains inspectable
with a warning and upstream margins if verification fails.

## Verification

`node --test src/minutesExplorer.test.js`

`npx playwright test tests/e2e/minutes-explorer.spec.js`

Read-only published-feed audit (Node 24, existing anonymous Supabase key):

`node scripts/audit-minutes-explorer.mjs --env-dir /path/to/local/env/directory 0022600015 0022600119 0022600133`

The audit also independently fetches the NBA box-score backup and prints player
plus/minus differences. It never updates games or calls an AI model.

2026-11-02: all three games reconciled, with 624 / 598 / 544 events respectively
and no player plus/minus differences. This verifies those frozen final feeds,
not every possible live update or historical feed.
