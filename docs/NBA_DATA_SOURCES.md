# NBA data sources and API migration

## Local Trailblaze audit

For a local-only comparison against Trailblaze, start the development server with
`VITE_TRAILBLAZE_LOCAL_AUDIT=1 npm run dev`. This routes the local browser's game
list, game, play-by-play, and minutes requests through the Vite development
server to Trailblaze's undocumented server functions. It does not configure a
production fallback and does not replace the keyed NBA API. Trailblaze's
server-function identifiers and payloads can change without notice; pregame
minutes may be unavailable. The G League audit records raw source responses and
dashboard-calculated totals separately for later reconciliation.

This guide describes the code in this checkout, including changes that may not yet be deployed. Check the deployed revision and secrets before assuming production behaves the same way. The old CloudFront game-feed hostname is no longer referenced by application or job code in this checkout; historical documents and regression tests may still mention it.

## Keyed NBA API

The server-side base URL is `https://api.nba.com/v0/api`. Send the secret in the `X-NBA-Api-Key` request header. Keep `NBA_API_KEY` in the ignored local `.env`, a Supabase Edge Function secret, or a GitHub Actions secret as appropriate. Never use a `VITE_` prefix, put the key in browser code, commit it, or paste it into logs. See [Supabase deployment](../supabase/DEPLOYMENT.md) for production setup.

These are the request types implemented in this checkout. Access depends on the provisioned key; the names of the API products in the NBA portal alone do not prove entitlement or coverage.

| Method and path | Parameters used here | Purpose and implementation |
| --- | --- | --- |
| `GET /scores/scoreboard/date` | `leagueId`, `gameDate` (`YYYY-MM-DD`) | Games for a date, including live games. [`scoreboard.js`](../supabase/functions/_shared/scoreboard.js) requests NBA `00` and G League `20`, plus optional Summer League `13`–`16` during June–August. |
| `GET /scores/scoreboard/games` | `leagueId`, `gameId` | Game status, score, teams, periods, and clock. [`nbaGame.js`](../supabase/functions/_shared/nbaGame.js) derives the league from the first two game-ID digits. |
| `GET /stats/boxscore` | `gameId`, `measureType=Traditional` or `Advanced` | Team and player box scores and, when supplied, officials. Advanced data is optional in the adapter and is requested for final games. |
| `GET /stats/boxscore` | `gameId`, `measureType=Traditional`, `rangeType=1`, `startPeriod`, `endPeriod` | Final-game quarter and half splits. The adapter validates team IDs and period scores. |
| `GET /stats/pbp` | `gameId` | Play-by-play actions for a game. |
| `GET /stats/rosterlineup` | `gameId` | Roster/lineup input for reconstructing minutes. See [`nbaMinutes.js`](../supabase/functions/_shared/nbaMinutes.js). |
| `GET /stats/poc` | `gameId` | Players-on-court input for reconstructing minutes. The adapter retries a pending feed once and checks the resulting stints against other game data. |

The browser uses Supabase Edge Functions such as `scoreboard` and `game-metadata`; it does not send the NBA key itself. [`nbaGame.js`](../supabase/functions/_shared/nbaGame.js) combines scoreboard, box score, and play-by-play responses into the application's game shape. In `game-metadata`, `primaryGameId` and `primaryPlayByPlayGameId` use the keyed API; the existing `liveGameId` and `playByPlayGameId` recovery requests continue to use the NBA CDN. [`nbaLiveRecovery.ts`](../supabase/functions/_shared/nbaLiveRecovery.ts) also falls back to CDN box score and play-by-play when the key or primary feed is unavailable. This fallback has a more limited contract. Game dates use the game's Eastern date, not the by-game response envelope's date.

## Scheduled jobs and other sources

The migration targeted the old CloudFront feed. The other sources below have not been replaced just because the game feed changed. The workflows are in [`.github/workflows`](../.github/workflows/); scripts are in [`scripts`](../scripts/). A workflow passing does not by itself prove all records were imported correctly.

| Job or feature | Sources in this checkout | Status |
| --- | --- | --- |
| Period snapshot capture | Keyed date scoreboard and game adapter, with CDN game fallback; writes verified snapshots to Supabase | CloudFront calls migrated locally; the workflow passes `NBA_API_KEY`. |
| Live audit and operations checks | Keyed scoreboard/game adapters and other independent NBA/Supabase checks | CloudFront calls migrated locally; relevant jobs pass `NBA_API_KEY`. |
| Nightly officiating ingestion | NBA CDN season schedule; game backfill uses keyed game data when available and CDN box score/play-by-play for enrichment or fallback; sometimes NBA game pages and Stats API | Partially migrated. The nightly workflow currently does **not** pass `NBA_API_KEY`, so the keyed game request in the backfill cannot run there and it falls back to CDN. The schedule and enrichment are separate CDN sources. |
| Daily challenge sync and reconciliation | Official NBA challenge review pages/PDFs, NBA gamebook PDFs, and game data via the shared recovery adapter | The workflow currently does **not** pass `NBA_API_KEY`, so shared game recovery uses CDN. Official documents remain distinct sources for review outcomes and whistle evidence. |
| Referee assignments | `https://official.nba.com/referee-assignments/` parsed by [`referee-assignments`](../supabase/functions/referee-assignments/index.ts) | Separate official page; not CloudFront. |
| Officiating insight facts and call enrichment | CDN box scores/play-by-play; stored Supabase records; other official evidence | Separate data sources, not fully rewritten to the keyed API. |
| Rosters and player analytics | NBA Stats API, G League Stats API, ESPN fallback, and cached snapshots | Separate sources; see `nba-rosters`, `gleague-rosters`, and `nba-player-stats` Edge Functions. G League personnel stats use Showcase, Regular Season, or a full-season combination of Showcase, Regular Season, and Playoffs; counting totals are combined before per-game rates are calculated. |
| Schedule refresh and game-window guard | NBA CDN season schedule and today's scoreboard | Separate CDN feeds; see `update-nba-schedule.mjs` and `scripts/lib/game-window-guard.mjs`. |

The nightly and daily workflows also perform production database writes. Do not change their source precedence or enable a different path in production without validating official identities, completeness, challenge outcomes, and preserved annotations. Follow [`ops/runbook.json`](../ops/runbook.json), current operations reports, and the project instructions before investigating or repairing production data. The current source inventory is not a claim that production jobs are healthy.

## Verification and extending the integration

- Adapter tests: `node --test supabase/functions/_shared/{scoreboard,nbaGame,nbaMinutes}.test.js` and `npm test`.
- Edge Function tests: `npm run test:edge`; browser coverage: `npm run test:e2e` with the required local configuration.
- Before using a new endpoint, confirm its actual request parameters, response shape, league coverage, timing, and key entitlement with the provider's documentation and a read-only test. Validate game/team identity and preserve missing or contradictory values instead of inventing data.
- The NBA API product names supplied during migration include `scoreboard`, `stats`, `schedule`, `standings`, and others. The checkout demonstrates scoreboard and stats request paths above; it does not establish which products expose every potential endpoint or whether a key is entitled to them. Ask the API owner for missing documentation or access rather than assuming.
