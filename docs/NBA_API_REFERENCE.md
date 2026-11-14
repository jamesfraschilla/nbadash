# NBA API reference for NBA Dash

This guide consolidates the provider's OpenAPI specifications and Get Started guide, and describes how this repository uses the feeds. It is a reference to documentation inspected on November 14, 2026, not a guarantee of current provider behavior or a particular key's entitlements. For complete nested response schemas, long enumerations, and future updates, consult the linked provider specifications.

For the current integration and other sources, see [NBA data sources](NBA_DATA_SOURCES.md). The code in a checkout may differ from deployed production; check the deployed revision and configuration.

## Connection and security

- The shared Scores, Schedule, Stats, Standings, and Alerts endpoints use `https://api.nba.com/v0` plus the `/api/...` path. Other products have their own base paths; Tracking Feed uses `v1`.
- The documented requests below use `GET` and the `X-NBA-Api-Key` header.
- Store `NBA_API_KEY` in an ignored local `.env` for server-side development; configure it separately as a Supabase Edge Function secret and, for jobs that use the API, a GitHub Actions secret. See [deployment instructions](../supabase/DEPLOYMENT.md).
- Never commit a key, place it in a `VITE_` variable, embed it in browser code, or include it in a log or documentation example. The browser calls Supabase functions; the server holds the NBA key.
- The presence of an endpoint in the provider docs does not establish access for your key. Verify entitlement, league coverage, response shape, and availability with a read-only request.

Example, after securely loading `NBA_API_KEY` into your shell environment:

```sh
curl --fail-with-body --silent --show-error --get \
  'https://api.nba.com/v0/api/scores/scoreboard/date' \
  --data-urlencode 'leagueId=00' \
  --data-urlencode 'gameDate=2023-01-22' \
  --header "X-NBA-Api-Key: ${NBA_API_KEY}" \
  --header 'Accept: application/json'
```

Avoid shell tracing, request logs, copied provider examples containing credentials, and screenshots that expose the key.

## Conventions

- `leagueId` is a two-character string: `00` NBA, `10` WNBA, `20` G League, `12` NBA 2K 5v5, `22` NBA 2K 3v3, `13` Sacramento Summer League, `14` Orlando Summer League, `15` Vegas Summer League, and `16` Utah Summer League. The app requests `13`–`16` as optional summer feeds; verify current league coverage and availability for each product.
- NBA and G League season years generally use `YYYY-YY`; WNBA and Summer League use `YYYY` where documented. Individual operations can have different allowed formats.
- A game ID is a **string**, including leading zeroes. The provider describes `AABCCDDDDD`: league ID (`AA`), season type (`B`), last two digits of the season's starting year (`CC`), and game number (`DDDDD`). For NBA/WNBA/G League/Summer League: 1 preseason, 2 regular season, 3 All-Star, 4 playoffs, 5 NBA Play-In/WNBA Commissioner's Cup/G League Showcase, 6 NBA Cup championship, 7 G League Ignite scrimmages. The 2K season-type meanings differ; see the provider guide.
- Dates in this app follow the NBA Eastern game calendar. A by-game scoreboard response's envelope date can reflect the request date rather than the historical game's date. The adapter prefers game Eastern time, then UTC converted to `America/New_York`, then game code.
- Optional parameters are marked optional below. `Required` refers to the supplied provider documentation; nullable does not imply optional where the provider labels it required. Query parameters are case-sensitive as documented.
- `meta` is common but not universal; stats game feeds such as box score and play-by-play have a different top-level shape. Treat absent, null, delayed, or contradictory data as unknown and validate identity before combining sources.

## Scores

### Scoreboard by date

`GET /scores/scoreboard/date`

| Query parameter | Required | Description |
| --- | --- | --- |
| `leagueId` | Yes | Two-digit league ID. |
| `gameDate` | No | `YYYY-MM-DD`, `TODAY`, or empty. Provider says `TODAY` may show the previous night's results until noon Eastern or one hour before the first game, whichever is earlier. |

Response: `meta` and `scoreboard`, including `scoreboard.gameDate`, `leagueId`, `leagueName`, and `games`. Covers live games as well as scheduled/final games. The app sends an explicit date and combines NBA and G League results, with optional Summer League results during June–August: [`scoreboard.js`](../supabase/functions/_shared/scoreboard.js).

### Scoreboard by game IDs

`GET /scores/scoreboard/games`

| Query parameter | Required | Description |
| --- | --- | --- |
| `leagueId` | Yes | Two-digit league ID. |
| `gameId` | Yes | Comma-separated game IDs. |

Response: `meta` and `scoreboard.games`. The game adapter requests a single ID and checks that the matching card exists.

### Playoff series summary by game

`GET /scores/playoff/seriessummary/game` — required `gameId` (ten-digit game ID within the series). Response contains `meta` and `series`; the supplied page did not expand the series schema.

### Playoff series summary by round

`GET /scores/playoff/seriessummary` — required `leagueId`, `season`, `series`, and `poRound`; optional integer `regionId` for international broadcasters. `series` is zero-based within the round: 0–7 in round 1, 0–3 in round 2, 0–1 in round 3, and 0 in the finals. The supplied page did not provide a response schema.

## Schedule

These endpoints are documented, not currently a replacement for the app's existing NBA CDN schedule sources. Do not change those sources merely because a keyed endpoint exists.

| GET path | Required parameters | Optional parameters | Description and documented response |
| --- | --- | --- | --- |
| `/schedule/full` | `leagueId` | `season`, `teamId`, `vsTeamId`, `regiodId` | Full season schedule grouped by game date; response has `meta` and `leagueSchedule`, including `seasonYear`, `leagueId`, `gameDates`, and `weeks`. The supplied docs spell the region parameter `regiodId`; verify this apparent typo with the provider before use. |
| `/schedule/rolling` | `leagueId` | `gameDate` | Schedule around a date, five days before through five days after. Response has `meta` and `rollingSchedule.gameDates`. |
| `/schedule/gamesbyday` | `leagueId` | `season` | Season games organized by date and teams. Response has `meta` and `gamesByDay`. |
| `/schedule/seasoncalendar` | `leagueId` | `gameDate` | Season metadata associated with a date. Response includes `seasonDateEst` and separate stats, roster, schedule, and standings season IDs, years, and types. |
| `/schedule/broadcasters` | `leagueId` | `season` | Broadcasters by date. Response includes `leagueId`, `seasonYear`, and `gameDates`; the copied documentation gives no prose description. |

## Stats: game data

### Box score

`GET /stats/boxscore`

| Query parameter | Required | Description |
| --- | --- | --- |
| `gameId` | Yes | Game ID. |
| `measureType` | No | `Traditional` or `Advanced`. |
| `rangeType` | No | `0` entire game, `1` period to period, `2` range to range. |
| `startPeriod`, `endPeriod` | No | Start and end periods for period ranges. |
| `startRange`, `endRange` | No | Start and end for range-based selection; units were not clear in the supplied material. |

Response includes `gameId`, `type`, arena and game time fields, `homeTeam`, `awayTeam`, and `officials`. Each team includes `players` and `statistics`. The provider says only the **full Traditional** box score is available during a game. Do not assume postgame advanced or period splits are available live.

The app requests the traditional box score with scoreboard and play-by-play, and attempts advanced data only for final games. Final-game splits use `rangeType=1` and validate IDs and, when available, period totals: [`nbaGame.js`](../supabase/functions/_shared/nbaGame.js).

### Play-by-play

`GET /stats/pbp` — required `gameId`; optional integer `startPeriod`, `endPeriod`, `startAction`, and `endAction`. The response contains `gameId`, `type`, and `actions`. Provider descriptions mention action type, coordinates, outcome, game context, and player identifiers; the copied 50-property action schema was collapsed.

The keyed feed replaces the prior CloudFront play-by-play request. The separate CDN recovery request remains available. Check that the game ID matches and the action array is usable; do not treat a missing live feed as verified zeros.

### Game leaders

`GET /stats/gameleaders` — required `gameId`, documented as a comma-separated list of game IDs. Returns home and away points, rebounds, and assists leaders with player details such as jersey and position. The documented shape has `gameId`, `type`, `homeTeam`, and `awayTeam`; confirm the actual shape for multi-game requests.

### Legacy game events

`GET /stats/events` — required ten-digit `gameId`. Returns legacy game events with `game_id`, `event_Num`, `period`, game and wall clocks, `msg_type`, `action_Type`, and other fields. Documented `msg_type` values include made shot 1, missed shot 2, free throw 3, rebound 4, turnover 5, foul 6, violation 7, substitution 8, timeout 9, jump ball 10, period start 12, period end 13, and instant replay 18. The provider's action-type list is extensive; consult its full schema instead of assuming these numbers have the same meaning as the modern PBP action fields.

### Legacy roster and period lineups

`GET /stats/rosterlineup` — required ten-digit `gameId`. Legacy records describe players, staff, officials, and period starters. Documented fields include `game_Id`, `person_id`, `team_id`, `period`, `player_Status`, `status_Text`, first/last name, jersey number, `person_Type`, and position. Status codes include `A` active, `I` inactive, `O` official, `H` head coach, and `S` staff. Officials have team ID 0.

### Players on court

`GET /stats/poc` — required ten-digit `gameId`. Records include `game_id`, `event_Num`, and `playersPlusMinus`. The provider says the feed is **updated at the end of each period**. The listed lineup is governed by plus/minus logic: free throws resulting from a foul use the foul-time snapshot; substitutions before those free throws are applied afterward; technical free throws may use a separate snapshot. At a substitution event the departing player is listed as on court.

The app combines `rosterlineup`, `poc`, game box scores, and play-by-play to reconstruct minutes and stints, with validation and one bounded retry for pending event lineups: [`nbaMinutes.js`](../supabase/functions/_shared/nbaMinutes.js). Do not interpret a delayed or unavailable POC response as a zero-minute lineup.

## Stats: aggregate, leaders, people, and teams

These are documented provider endpoints. Unless specifically identified as used above, they have not been validated as replacements for existing app sources.

### Player statistics

`GET /stats/player` — required `leagueId`, `season` (comma-separated years), `seasonType`, and `perMode`. Optional `measureType`, `measures`, `playerId`, and `teamId`; ID and measure lists are comma-separated where documented. Response includes `meta`, `players`, and `perMode`.

Documented `measureType`: `Base`, `Advanced`, `Misc`, `Four Factors`, `Scoring`, `Opponent`, `Usage`, `Defense`. Documented `perMode`: `Totals`, `PerGame`, `MinutesPer`, `Per48`, `Per40`, `Per36`, `PerMinute`, `PerPossession`, `PerPlay`, `Per100Possessions`, `Per100Plays`. Examples of player measures include `gp`, `min`, `fgm`, `fga`, `fgPct`, `fg3m`, `fg3a`, and `fg3Pct`.

### Team statistics

`GET /stats/team` — required `leagueId`, `season`, `seasonType`, and `perMode`; optional `measureType`, `measures`, and comma-separated `teamId`. Response includes `meta`, `teams`, and `perMode`. The query documentation lists `Totals` and `PerGame` for `perMode`; its response description lists additional per modes, so verify supported input values before relying on them. Measures include traditional, opponent, advanced, and scoring statistics such as `gp`, `fgPct`, `offRating`, `defRating`, `poss`, and `pace`.

For aggregate player/team operations, documented season types include `Regular Season`, `Pre Season`, `Preseason`, `Playoffs`, `All Star`, `PlayIn`, `IST Championship`, and `CC Final`; the provider notes that some are league-specific. URL-encode spaces in values.

### Player season leaders

`GET /stats/player/leaders/official` — required `leagueId`, `seasonType`, `perMode` (`Totals` or `PerGame`), and `statCategory`; optional `scope` (`S` or `Rookies`) and `season`. Response includes `meta`, `season`, `seasonType`, `statistic`, `scope`, `perMode`, and `players`. The provider applies official volume thresholds and says the feed is unavailable for single-game Cup final season types. Examples of stat categories include `MIN`, `OREB`, `DREB`, `REB`, `AST`, `STL`, `BLK`, and `TOV`.

### Daily leaders

- `GET /stats/player/leaders/daily` — required `leagueId` and `stat`; response contains contextual date/season fields and `playerstats`.
- `GET /stats/team/leaders/daily` — required `leagueId` and `stat`; response contains contextual date/season fields and `teamstats`.
- `GET /stats/dailyfantasyleaders` — required `leagueId`; response contains `leagueId`, `gameDate`, and `players`, described as the daily top ten fantasy leaders.

The documented daily-leader stat values are `ast`, `blk`, `fantasypts`, `f3m`, `fg3pct`, `fgpct`, `ftm`, `pts`, `reb`, `stl`, and `tov`. The provider says the daily leaderboard can show the last date with games until today's games begin.

### Player index and highs

- `GET /stats/player/index` — required `leagueId`; optional `season` and boolean `historical`. Response includes `meta`, `leagueId`, `season`, and `players`; documented player details include ID, name, team, position, jersey, height, weight, and active years.
- `GET /stats/player/highs` — required `leagueId` and integer `playerId`; optional `season` (empty for current season). Response includes `meta`, `playerHighs`, player ID, and name fields; describes season/career highs with game context.

### Team index and roster

- `GET /stats/team/index` — required `leagueId`, `season`, and `seasonType`. Response includes `meta`, `leagueId`, `season`, `seasonType`, and `teams`, with team identity and venue/conference information.
- `GET /stats/team/roster` — required `leagueId`, `season`, and `teamId`. Response includes `meta`, team identity, `players`, and `coaches`; the copied schema describes active roster members.

### Injuries

`GET /stats/injury` — required `leagueId=00`; optional integer `teamId` (empty or 0 for all injuries). Response includes `leagueId` and `players`; described as NBA-only injury details, including injury type and anticipated return date where available. Coverage and timeliness need verification.

### Game data status log

`GET /stats/gamedatastatuslog` — required `leagueId` (`00` NBA or `20` G League); optional `timestamp` (`YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS` UTC) and `dataCategory` (`GameSchedule`, `GameStats`, or `GameTracking`). Response includes league/season, generated and last-season-stat-update timestamps, and `games`. The documentation describes it as a log of schedule, stats, and tracking updates; it is not a guarantee that all dependent data has been ingested.

## Standings

Base: `https://api.nba.com/v0`. The provider describes league, conference, division, playoff bracket, and NBA Cup standings. These are documented endpoints, not currently replacements for the app's other sources.

| Method and path | Required parameters | Optional parameters | Response |
| --- | --- | --- | --- |
| `GET /api/standings/league` | `leagueId`, `seasonType`, `season` | — | `meta` and `leagueStandings` with `leagueId`, `seasonYear`, `teams`. The prose says it defaults to the current season, while the schema marks `season` required; supply it. |
| `GET /api/standings/conference` | `leagueId`, `seasonType` | `season` | `meta` and `leagueStandings.teams`; grouped by conference. |
| `GET /api/standings/division` | `leagueId`, `seasonType` | `season` | `meta` and `leagueStandings.teams`; grouped by division. |
| `GET /api/standings/playoff/bracket` | `leagueId` | `season`, `bracketState` | `meta` and `bracket`; NBA and WNBA only. `bracketState` values: `PlayoffPicture`, `PlayIn`, `PlayoffBracket`, `IST`. |
| `GET /api/standings/ist` | `leagueId=00` | `season` | NBA Cup group-play standings from 2023-24; `leagueId`, `seasonYear`, `teams`. |

Standings records can include ranks, clinch indicators, records, streaks, point differential, and splits. Exact fields and availability vary; see the [standings specification](https://developerportal.nba.com/_spec/apis/standings/openapi.json?download).

## Alerts

Base: `https://api.nba.com/v0`. Alerts rank noteworthy game events, milestones, and storylines at the time of the request; the top alert may change as a game progresses.

| Method and path | Required query parameters | Purpose |
| --- | --- | --- |
| `GET /api/alerts/topAlert` | `gameId` | Top alert for a game. |
| `GET /api/alerts/topNAlerts` | `gameId`, `alertCount` | Top game alerts; count 1–10. |
| `GET /api/alerts/topBreakingNewsAlerts` | `leagueId`, `gameDate` | Top alerts across games for a `YYYY-MM-DD` date. |
| `GET /api/alerts/topNPregameStorylines` | `gameId`, `storylineCount` | Top pregame storylines for home and away; count 1–20. |

See the [alerts specification](https://developerportal.nba.com/_spec/apis/alerts/openapi.json?download). These are provider-curated alerts and should not be assumed equivalent to this application's own alert calculations.

## Hustle Stats

Base: `https://api.nba.com/v0/api/hustlestats`. These are **NBA-only XML** files. Game IDs and filename casing matter.

- `GET /{gameId}_hustlestats.xml` — player and team hustle box score.
- `GET /{gameId}_HustleStatsGameEvents.xml` — hustle game events.

The provider says files exist for games where hustle stats were logged. Event-type definitions are in the [Hustle Stats Feed Guide](https://developerportal.nba.com/docs/hustlestats-guide/); see the [OpenAPI specification](https://developerportal.nba.com/_spec/apis/hustlestats/openapi.json?download). Do not infer that every game has a file.

## Query Tool API

Base: `https://api.nba.com/v0/api/querytool`. Query Tool combines traditional and tracking-derived statistics and supports filtering and grouping. Parameter names use the capitalization shown here, which differs from the Scores/Stats APIs. It is documented in the portal but was **not listed as approved for the James-NBA Dash application** when inspected; access must be granted separately before relying on it.

Every path below is `GET`; paths are relative to the Query Tool base. The provider's machine-readable required fields are listed. For stat queries the documentation also requires one of `Measures`/`MeasureType`; for event queries, one of `Events`/`EventType`, although those pairs are not individually marked required in the schema. Check each operation's complete parameters in the [Query Tool specification](https://developerportal.nba.com/_spec/apis/querytool/openapi.json?download).

| Path | Required parameters |
| --- | --- |
| `/career/player` | `LeagueId`, `SeasonYear`, `SeasonType`, `Grouping`, `TeamGrouping`, `PerMode` |
| `/event/league`, `/event/team` | `LeagueId`, `SeasonYear`, `SeasonType`, `PerMode`, `SumScope`, `Grouping` |
| `/event/player` | Event parameters above plus `TeamGrouping` |
| `/game/league`, `/game/team` | `LeagueId`, `SeasonYear`, `SeasonType`, `Grouping` |
| `/game/player` | Game parameters above plus `TeamGrouping` |
| `/game/lineups` | Game parameters above plus `LineupQuantity` |
| `/season/league`, `/season/team` | `LeagueId`, `SeasonYear`, `SeasonType`, `PerMode`, `Grouping` |
| `/season/player` | Season parameters above plus `TeamGrouping` |
| `/season/lineups` | Season parameters above plus `LineupQuantity` |
| `/leaderboard` | `LeagueId`, `TopX` |
| `/reference/events`, `/reference/measures` | `Scope`, `SeasonYears`, `SeasonTypes`, `LeagueIds` |
| `/reference/filters` | None marked required; see the specification for available filters. |

Many query endpoints also support `PlayerId`, `TeamId`, `GameId`, `Period`, `DateRange`, lineup and opponent filters, `ClutchTime`, `FilterGrouping`, `SortColumn`, and `MaxRowsReturned`, depending on the operation. Season queries can group data by season, league and season type; `TeamGrouping` controls split versus combined player results. Event queries support `SumScope=Season`, `Game`, or `Event`; the provider documents a maximum of 5,000 rows for event scope. Achievement filters use a `Measure|Comparison|Value` format; verify accepted values with the reference endpoints.

## Tracking and Tracking Feed

Tracking API base: `https://api.nba.com/v0/api/tracking`. The specification uses the NBA API key header. These products were **not listed as approved for the James-NBA Dash application** when inspected.

| Method and relative path | Parameters | Purpose |
| --- | --- | --- |
| `GET /event_logs` | None documented | Real-time tracking system status logs. |
| `GET /game_streams` | Optional `from_date`, `to_date`, `game_id`, `team_id`, `stream_name`, `processor_name`, `only_live_streams` | Discover available recordings and feed access URLs. |
| `POST /game_streams/{external_id}/retrievals` | Required `external_id` | Initiates an archive retrieval into active storage; this is a state-changing operation. |
| `GET /game_streams/{external_id}/retrievals/{retrieval_id}` | Required `external_id`, `retrieval_id` | Check retrieval status. |

Tracking Feed base: `https://api.nba.com/v1/api/trackingfeed`. `GET /earliest/{stream_identifier}` and `GET /latest/{stream_identifier}` establish server-sent event streams from the earliest or latest offset. Obtain the actual stream URL/identifier from the Tracking API rather than constructing it from game and stream names. Earliest optionally accepts `cgid` to control a consumer-group cursor. The spec requires `Connection` and `Accept` headers and refers to the path parameter as `stream_id` even though the path placeholder is `stream_identifier`; verify the exact contract in the [Tracking Feed specification](https://developerportal.nba.com/_spec/apis/trackingfeed/openapi.json?download). See also the [Tracking API specification](https://developerportal.nba.com/_spec/apis/tracking/openapi.json?download).

## Legacy Mobile Stats Feed

Base: `https://api.nba.com/v0/api/mobilefeed`. The provider marked this legacy product for deprecation at the end of the 2024–25 NBA season and said it would not provide content for 2025 Summer League. Treat present availability and coverage as unverified; prefer supported APIs for new integrations.

All operations in the [Mobile Feed specification](https://developerportal.nba.com/_spec/apis/mobilefeed/openapi.json?download) are `GET`. Paths use a `/{league}/{seasonyear}` prefix and contain required path placeholders such as `leagueid`, `gameid`, `teamname`, `seasontype`, and sometimes `language` or `period`. The documented families include:

- `scores/gamedetail/{gameid}_gamedetail.json` and `scores/{leagueid}_todays_scores.json` for game box scores and the scoreboard.
- `scores/pbp/{gameid}_full_pbp.json`, period PBP, translated PBP, `scores/spbp/...` and `scores/roster_lineup/...`.
- League full, monthly, rolling and week schedules, including TBD variants; current and season-type standings; playoff brackets.
- Team rosters, coaches, schedules, matchups, team/player statistics and zone summaries.
- Player cards, highs, ranks, splits, league player indexes, leaders, and `updates.json` modification times.

Consult the full specification for all 54 exact case-sensitive file paths, permitted placeholder values, and translated variants. None of these paths are assumed to be interchangeable with other NBA APIs.

## Portal catalog and key access

The portal's [API catalog](https://developerportal.nba.com/catalog) lists Alerts, NBA Hustle Stats, NBA Mobile Stats Feed, Query Tool API, Schedule, Scores, Standings, Stats, Tracking API and Tracking Feed. Provider product labels need not exactly match application access names. Some access products previously supplied by the user, including Partner Utilities and tracking feed offsets, were not separate entries in the visible catalog; do not infer their availability.

On **November 14, 2026**, the portal's **James-NBA Dash** application showed its key status as **Approved**, with these eight products individually **Approved**: `MobileFeed`, `schedule`, `HustleStats`, `stats`, `alerts`, `scoreboard`, `Stats Web API`, and `standings`. The portal did not list `Query Tool API`, `tracking`, `Tracking Feed Earliest`, `Tracking Feed Latest`, or `Partner Utilities` among that application's approved products. This is a point-in-time permission listing, not proof every endpoint, league, or season succeeds. No key value is recorded here. Check the application in the portal for current entitlements and verify access using a read-only request.

## Provider specifications

OpenAPI files are available in the authenticated developer portal; follow links there to see full request definitions, response schemas and examples:

- [Scores](https://developerportal.nba.com/_spec/apis/scores/openapi.json?download), [Schedule](https://developerportal.nba.com/_spec/apis/schedule/openapi.json?download), [Stats](https://developerportal.nba.com/_spec/apis/stats/openapi.json?download), [Standings](https://developerportal.nba.com/_spec/apis/standings/openapi.json?download), [Alerts](https://developerportal.nba.com/_spec/apis/alerts/openapi.json?download).
- [Hustle Stats](https://developerportal.nba.com/_spec/apis/hustlestats/openapi.json?download), [Mobile Feed](https://developerportal.nba.com/_spec/apis/mobilefeed/openapi.json?download), [Query Tool](https://developerportal.nba.com/_spec/apis/querytool/openapi.json?download), [Tracking](https://developerportal.nba.com/_spec/apis/tracking/openapi.json?download), [Tracking Feed](https://developerportal.nba.com/_spec/apis/trackingfeed/openapi.json?download).
- [Getting Started](https://developerportal.nba.com/docs/getting-started), including league and game ID details; [NBA statistics glossary](https://www.nba.com/stats/help/glossary).

These links require the appropriate portal access. Do not copy provider examples into the repository without first checking for real keys or other sensitive account information.

## App integration and verification

- `src/api.js` calls the server-side `scoreboard` and `game-metadata` functions. Their keyed paths replace prior CloudFront requests. The existing `liveGameId` and `playByPlayGameId` routes continue to use NBA CDN recovery; `primaryGameId` and `primaryPlayByPlayGameId` use the keyed API.
- [`nbaGame.js`](../supabase/functions/_shared/nbaGame.js) validates game and team identity, combines the card, traditional box score, PBP and optional advanced statistics, and maps them to the dashboard's existing game shape.
- [`nbaLiveRecovery.ts`](../supabase/functions/_shared/nbaLiveRecovery.ts) preserves the independently checked NBA CDN fallback and can use CDN play-by-play to recover a primary game missing actions.
- [`nbaMinutes.js`](../supabase/functions/_shared/nbaMinutes.js) reconstructs and validates lineup stints; missing or conflicting feeds must remain unavailable rather than fabricated.
- [`NBA_DATA_SOURCES.md`](NBA_DATA_SOURCES.md) describes the jobs and the other feeds, including referees and official challenge documents. Do not replace non-CloudFront sources without an explicit task and source-by-source validation.
- Useful checks: `npm test`, `npm run test:edge`, `npm run typecheck`, `npm run lint`, `npm run supabase:manifest:check`, and browser tests as applicable. Mocked tests exercise contracts but do not establish provider entitlement or production health.

## Remaining documentation gaps

The visible portal catalog did not contain separate specifications for Partner Utilities or Stats Web API. Their names and approval statuses do not establish endpoint paths or whether they overlap with other products. Ask the provider for those specifications if needed. The linked OpenAPI files remain the source for full nested schemas and extensive Query Tool filters.
