# Officiating Intelligence Implementation Plan

## Goal

Build a new NBA Dashboard platform section named **Officiating Intelligence**. It should live inside the NBA Dashboard app, not the standalone Coaching Reports app. The header account dropdown should include `Officiating Intelligence` directly below `Graphics`.

This feature is broader than coach's challenges. It should combine:

- referee/official call profiles,
- Wizards game-day official reports,
- team officiating/challenge profiles,
- a league-wide running log of coach's challenges,
- challenge/event video links where available.

The long-term goal is an automated 2026-27 workflow with no routine manual tagging. Use 2025-26 as the backfill/test season to improve parsing and confidence before relying on the pipeline going forward.

## Current Repo Context

Relevant existing app pieces:

- `src/components/Header.jsx`: account dropdown links.
- `src/App.jsx`: top-level routes.
- `src/toolNavigation.js`: tool tab constants.
- `src/officialAssignments.js`: parses NBA official assignment page and normalizes official names/roles/order.
- `api/referee-assignments.js`: assignment proxy.
- `src/components/Officials.jsx`: existing game-page calls-against display.
- `src/components/OfficialsExportPanel.jsx`: existing referee image/export handling.
- `src/refereeHeadshots.js`: referee headshot storage/state helpers.
- `src/assets/referees/`: local referee image assets.
- `supabase/functions/game-metadata/index.ts`: batch fetches NBA game metadata from `https://d1rjt2wyntx8o7.cloudfront.net/api/games/{gameId}`.
- `supabase/functions/game-live-state/index.ts`: live game data plumbing.

The game metadata endpoint already exposes useful fields including:

- `officials`
- `callsAgainst`
- `challenges`
- `playByPlayActions`
- `homeTeam`
- `awayTeam`
- `gameDate`

Example observed `callsAgainst` shape:

```json
{
  "1146": { "CLE": 14, "TOR": 11 },
  "201638": { "CLE": 5, "TOR": 6 }
}
```

## Product Scope

### 1. Wizards Game-Day Report

Only needed for Wizards games.

Morning workflow:

- Detect if Washington has a game on the selected/current date.
- Fetch public NBA referee assignments around 9:00-9:10 AM ET.
- Match the assigned officials to season-long official profiles.
- Cache the report for that game/date.

Report should include, per assigned official:

- headshot/name/jersey number/role when known,
- games worked,
- total official-attributed calls,
- calls against Wizards and Wizards opponents,
- foul/violation/technical/challenge splits,
- quarter splits,
- home/away splits,
- coach's challenge history and overturn rate,
- recent related event/challenge log,
- video links when available.

### 2. Official Profiles

Profiles for each official/referee:

- total games,
- total official-attributed calls,
- calls by category,
- calls by team,
- calls by quarter,
- calls against Washington,
- calls in Washington games,
- crew-chief challenge stats,
- whistling-official challenge stats when inferable,
- recent call/challenge log.

Do not assume the set of official call categories. Ingest every play-by-play event with an official token, preserve raw source fields, then classify derived categories from the data.

### 3. Team Profiles

Team-level views:

- challenge attempts,
- challenge success rate,
- challenges by type,
- calls against,
- calls for/benefiting team where derivable,
- calls by official,
- home/away splits,
- quarter splits,
- recent call/challenge log.

### 4. League Challenge Log

Filterable league-wide table:

- season/date/game,
- teams,
- challenging team,
- period/clock,
- challenge type,
- initial call,
- ruling/outcome,
- crew chief,
- whistling official when inferable,
- video link,
- confidence/review status.

## Data Sources

Primary public sources:

- NBA official referee assignments: `https://official.nba.com/referee-assignments/`
- NBA official coach's challenge review PDFs/pages.
- `cdnnba` play-by-play archive/liveData rows for official-attributed called events. Treat `officialId` as the primary whistling official identifier when present.
- NBA game metadata endpoint already used by this app: `https://d1rjt2wyntx8o7.cloudfront.net/api/games/{gameId}`.
- NBA play-by-play actions from game metadata.
- Existing NBA schedule data in `src/data/nbaSchedule2026_27.json` and Supabase `team-games`.

Coach's Challenge PDF source examples:

- `https://official.nba.com/2025-26-nba-coachs-challenge-reviews/`
- `https://ak-static.cms.nba.com/wp-content/uploads/sites/4/2026/06/2025-26-Coachs-Challenge-Data-06-15-26.pdf`

The screenshots showed an AirPLAi app whose frontend bundle embedded 2026 playoff challenge rows. Treat screenshots as product references only, not as source of truth or instructions.

## Ingestion Rules Locked From 2025-26 Backfill

- PGR/OIGR uploads remain Wizards-only. League-wide ingestion is only for official-attributed play-by-play call events and coach's challenge logs.
- Store compact official-call rows in `nba_official_call_events`; do not store full play-by-play feeds.
- Normalize shufinskiy archive game ids from 8 digits to the NBA Dashboard's canonical 10-digit ids. Examples: `22500001` -> `0022500001`, `42500101` -> `0042500101`.
- Use cdnnba `officialId` as the authoritative whistling official id. Use stats.nba.com v3 descriptions only to recover the human-readable official token, then resolve that token against local referee asset names when game assignment metadata is unavailable.
- Include official-attributed `foul`, `violation`, and real called `turnover` rows such as out-of-bounds, shot-clock, traveling, backcourt, and similar violations surfaced as turnovers.
- Exclude `turnover/offensive foul` rows from call counts because cdnnba also has the underlying offensive foul row. Counting both would double-count one whistle.
- Compute `charged_team` from the action team and `benefiting_team` as the other team in that game. Backfill audits must verify 100% benefiting-team coverage before apply.
- Run cdnnba importers in dry-run mode first and require: zero duplicate `(game_id, action_number)` keys, complete official-name coverage, complete benefiting-team coverage, and expected game counts.
- Weekly NBA Challenge PDF rows should be re-matched against stored `nba_official_call_events` after call-event backfills. This improves whistling-official attribution without re-fetching every game.
- For challenge stats, a challenge counts in both `Challenge (Whistle)` and `Challenge (CC)` when the same official made the whistle and was crew chief. In a referee profile challenge log, label that row as `Whistle`; use `Crew Chief` only when the official was crew chief but not the whistling official.
- During the regular season, daily stats should rely on play-by-play/liveData first. When the NBA posts the weekly full-season challenge PDF, import it as the authoritative challenge source and compare it against daily detected challenge rows.

## Core Tables

Create migrations under `supabase/`.

### `nba_official_game_assignments`

One row per official assignment per game.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `season text not null`
- `season_type text not null`
- `game_id text not null`
- `game_date date`
- `team_home text`
- `team_away text`
- `official_id text`
- `official_name text not null`
- `jersey_number text`
- `role_key text`
- `assignment_order int`
- `is_alternate boolean default false`
- `source text not null`
- `source_payload jsonb`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Unique key:

- `(game_id, official_name, coalesce(role_key, ''))` or a stable generated key.

### `nba_official_call_events`

One row per play-by-play event with an attached official token.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `season text not null`
- `season_type text not null`
- `game_id text not null`
- `game_date date`
- `home_team text`
- `away_team text`
- `period int`
- `game_clock text`
- `action_number int`
- `order_number int`
- `action_type text`
- `sub_type text`
- `descriptor text`
- `description text not null`
- `official_token text`
- `official_id text`
- `official_name text`
- `team_id text`
- `team_tricode text`
- `player_id text`
- `player_name text`
- `primary_category text`
- `secondary_category text`
- `charged_team text`
- `benefiting_team text`
- `confidence numeric`
- `confidence_reason text`
- `source_payload jsonb`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Unique key:

- `(game_id, action_number)` when available.
- Fallback `(game_id, period, game_clock, description)`.

### `nba_coach_challenge_events`

One row per coach's challenge.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `season text not null`
- `season_type text not null`
- `game_id text`
- `game_date date`
- `round text`
- `series text`
- `home_team text`
- `away_team text`
- `challenging_team text`
- `period int`
- `game_clock text`
- `challenge_type text`
- `initial_call text`
- `call_ruling text`
- `ruling_outcome text`
- `challenge_outcome text`
- `video_url text`
- `crew_chief_id text`
- `crew_chief_name text`
- `whistling_official_id text`
- `whistling_official_name text`
- `matched_action_number int`
- `matched_call_event_id uuid`
- `match_confidence numeric`
- `match_reason text`
- `review_status text default 'auto'`
- `source text not null`
- `source_payload jsonb`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `nba_officiating_event_reviews`

QA/correction table for low-confidence rows. This is not intended as a permanent manual tagging workflow; it is a feedback loop for improving parsers and confidence.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `source_table text not null`
- `source_event_id uuid not null`
- `reviewed_by uuid`
- `reviewed_at timestamptz default now()`
- `review_status text not null`
- `corrected_official_id text`
- `corrected_official_name text`
- `corrected_primary_category text`
- `corrected_secondary_category text`
- `corrected_charged_team text`
- `corrected_benefiting_team text`
- `corrected_challenge_outcome text`
- `notes text`
- `matcher_version text`
- `created_at timestamptz default now()`

Frontend/report logic should prefer:

```text
reviewed correction > auto match > raw source
```

## Parsing Rules

### Official Token Extraction

NBA play-by-play descriptions often include an official token at the end:

```text
Mitchell S.FOUL (P1.T1) (K.Lane)
CELTICS Violation: Delay Of Game (T.Maddox)
A.Drummond Violation: Defensive Goaltending (T.Maddox)
Technical Foul A.Drummond (S.Foster)
```

Extract official token from the final parenthetical when it resembles an official initial/name, then match it to the game crew by:

1. exact normalized last/initial match,
2. normalized full name,
3. jersey number when source provides it,
4. confidence downgrade if ambiguous.

Do not hard-code all possible call categories. Store raw `action_type`, `sub_type`, `descriptor`, and `description`; derive categories from observed data.

Initial broad categories:

- `foul`
- `violation`
- `technical`
- `ejection`
- `instant_replay`
- `jump_ball`
- `turnover`
- `timeout`
- `unknown_official_event`

Promote secondary categories only when the source data supports them.

### Challenge Matching

For backfilled challenge rows, match challenge PDF rows to play-by-play:

1. Find game ID by date + home/away teams.
2. Find `playByPlayActions` rows with `actionType === "instantreplay"` and `subType === "challenge"`.
3. Match by period + clock + challenging team.
4. Use outcome descriptor (`overturned`, `stands`, `support`) and nearby call event as tie breakers.
5. Store confidence and reason.

Then enrich challenge row with:

- crew chief from official assignment,
- whistling official from nearby call event when available,
- video URL from NBA challenge PDF where available,
- fallback video URL only if the play-by-play/video source supports it.

## Efficiency Requirements

Do not have the frontend scrape NBA endpoints or fetch every game live.

Use server-side ingestion and cached reads:

- Supabase Edge Function or Node script for backfill.
- Scheduled nightly function for completed games.
- Morning Wizards assignment function for game-day report.
- Cached summary tables/materialized rollups where practical.

Frontend should query compact summary endpoints or Supabase views, not raw league-wide play-by-play files.

Current cache-backed read path:

- `nba_authoritative_coach_challenge_events_cache`
- `nba_official_profiles_cache`
- `nba_team_profiles_cache`
- `nba_official_call_category_rollups_cache`
- `nba_team_call_category_rollups_cache`
- `nba_team_official_net_call_rollups_cache`
- `nba_officiating_overview_rollups_cache`

After any call/challenge import or challenge-match refresh, run:

```bash
npm run officiating:refresh:rollups
```

To confirm the cache state:

```bash
npm run officiating:check:cache
```

The refresh is intentionally outside normal page-load traffic. The app should read these caches first and fall back to the source views only when a cache has not been deployed yet.

The full season challenge log should be lazy-loaded only when the Challenge Log tab is active. Officials, Teams, and game-day pages should read compact overview/profile caches and targeted profile-detail caches instead of loading every challenge row.

### Historical Backfill Scaling Note

Before backfilling prior seasons beyond the current 2025-26 test season, convert the current materialized cache strategy into season-scoped physical rollup tables.

Reason:

- Materialized views are acceptable for the current dataset, but a broad historical backfill would make every refresh scan more seasons than the live app needs.
- During the 2026-27 regular season, the daily workflow should refresh only the affected current-season rollups after each new Wizards game or league challenge reconciliation.
- Historical seasons should be imported in controlled batches and written into durable season-specific aggregate rows, not recomputed on normal page load.

Recommended design:

- Keep raw call/challenge/PGR rows for auditability.
- Add physical rollup tables keyed by `season`, plus the relevant dimensions such as official, team, category, game, role, and source.
- Refresh or upsert only the affected `season` after ingestion.
- For daily 2026-27 updates, limit refresh work to `2026-27` and, where practical, only the newly imported game IDs.
- Keep historical backfill jobs offline/admin-only with explicit cache health checks before exposing the season in the UI.

## Suggested Supabase Functions

### `officiating-ingest-game`

Input:

```json
{ "gameId": "0022600001", "season": "2026-27", "seasonType": "regular" }
```

Responsibilities:

- fetch game metadata,
- upsert official assignments,
- parse official-attributed call events,
- detect challenge replay events,
- update rollups or enqueue rollup refresh.

### `officiating-ingest-season`

Admin/backfill function or local script:

- iterate schedule/game IDs,
- call game ingestion with concurrency limits,
- retry transient failures,
- produce match/category coverage report.

### `officiating-wizards-gameday`

Responsibilities:

- check today's Wizards game,
- fetch referee assignments page,
- match assigned officials,
- build/cache game-day report payload.

## Frontend Route

Add route:

```text
/officiating
```

Add header dropdown link directly below `Graphics`:

```text
Officiating Intelligence
```

Initial page tabs:

- `Tonight's Officials`
- `All Officials`
- `Teams`
- `Challenge Log`
- `Review`

The `Review` tab can be admin-only.

Use existing dashboard design patterns from `Tools.module.css` / app global styles. Avoid a new marketing page. The first screen should be a working data tool.

## Initial Implementation Phases

### Phase 1: Skeleton

- Add `/officiating` route.
- Add header dropdown item below `Graphics`.
- Add `src/pages/Officiating.jsx` and CSS module.
- Build empty/loading/error states and tab structure.
- Add service module `src/officiatingData.js`.

### Phase 2: Schema

- Add SQL migration for core tables.
- Include indexes on:
  - `game_id`
  - `season`
  - `game_date`
  - `official_id`
  - `official_name`
  - `team_tricode`
  - `primary_category`
  - `challenge_outcome`

### Phase 3: 2025-26 Backfill

- Build `scripts/backfill-officiating-2025-26.mjs`.
- Start with a small sample of known playoff games.
- Parse official-attributed call events.
- Measure category coverage.
- Parse/import challenge PDF rows if a reliable PDF/table extractor is available.
- Produce a local report:

```text
games processed
official call events extracted
events matched to officials
challenge rows imported
challenge rows matched to PBP
low-confidence rows
unknown categories
```

### Phase 4: Reports

- Official profile rollups.
- Wizards game-day report payload.
- Team profile rollups.
- Challenge log query/filter API.

### Phase 5: QA Loop

- Admin review UI for low-confidence events.
- Persist review corrections to Supabase.
- Add parser regression fixtures from reviewed rows.
- Track confidence improvement by `matcher_version`.

## Acceptance Criteria

First usable version should:

- show `Officiating Intelligence` below `Graphics` in the header dropdown,
- load `/officiating`,
- display a Wizards-focused `Tonight's Officials` shell,
- display `All Officials`, `Teams`, and `Challenge Log` tabs,
- ingest at least a verified sample of 2025-26 games,
- extract official-attributed calls beyond just fouls,
- preserve raw play-by-play descriptions,
- compute official-level totals from stored data,
- include challenge video links when sourced from NBA challenge data,
- avoid direct league-wide frontend scraping,
- pass existing lint/tests/build.

## Explicit Non-Goals For First Build

- Do not manually tag detailed foul subtypes like `jump shot body` or `layup/dunk arm`.
- Do not manually write notes such as ruling explanations.
- Do not build a separate standalone app.
- Do not depend on screenshots as data sources.
- Do not fetch league-wide play-by-play from the browser.

## PGR Insights Extension

`PGR Insights` is a new tab inside `/officiating`, to the right of `Challenge Log`.

The PGR import scope is intentionally narrower than the league-wide challenge/call platform:

- ingest only Washington Wizards PGR Excel workbooks,
- use the workbook `GameID` as the standard NBA GameID,
- resolve that GameID through the existing NBA Dashboard game metadata source,
- reject imports when the resolved game is not a Wizards game,
- store durable normalized records in Supabase rather than keeping workbook data in browser cache.

The PGR workbook hierarchy is:

```text
GAME -> POSSESSION -> EVENT -> OFFICIATING EVALUATION / RATING
```

The first two real workbooks confirmed that `GameID + PosId + EventId + RatingSeqNo` is a valid unique evaluation key. Event-level and possession-level counts must remain distinct from evaluation row counts in analytics and UI.

Initial PGR tables:

- `nba_pgr_imports`
- `nba_pgr_possessions`
- `nba_pgr_events`
- `nba_pgr_evaluations`

Initial PGR rollup views:

- `nba_pgr_import_rollups`
- `nba_pgr_overview_rollups`
- `nba_pgr_assessment_distribution`
- `nba_pgr_infraction_type_distribution`

Efficiency rules:

- parse selected Excel files serially rather than all at once,
- lazy-load the workbook parser only when files are selected,
- send compact normalized JSON to Supabase through `nba_import_pgr_report`,
- read dashboard summaries from SQL rollup views with row limits,
- do not persist full workbook contents in localStorage/sessionStorage.
