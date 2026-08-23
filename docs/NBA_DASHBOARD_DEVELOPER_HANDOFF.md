# NBA Dash Developer Handoff

Last updated: 2026-08-23

Repository inspected: `nba_dashboard`

Primary audience: engineers who need to understand, maintain, audit, or rebuild the NBA Dash application from scratch.

This document is a static source-code handoff. It documents the current architecture, feature behavior, data flows, Supabase surface area, local persistence, scheduled jobs, deployment model, and notable engineering decisions. It is intentionally detailed because this app has accumulated many product-specific behaviors over a long period of iteration.

## 1. Executive Summary

NBA Dash is a Vite + React single page application used for live NBA, G League, Wizards, and Capital City basketball workflows. It combines live game dashboards, analysis tooling, note taking, drawings, graphics generators, rotations tools, KPI boards, scouting utilities, and account-backed personal storage.

The deployed frontend is designed for GitHub Pages under the `/nbadash/` base path. The app also contains Vercel-compatible API proxy endpoints and a Capacitor iOS configuration, but the primary production model is a static GitHub Pages bundle backed by Supabase and external basketball data APIs.

The app's backend surface is mostly Supabase:

- Supabase Auth for signed-in users.
- Supabase Postgres for profiles, invites, notes, drawings, tool vault records, shared analysis recaps, live game shadows, matchup player profiles, roster snapshots, and shared rotations state.
- Supabase Storage for player headshots, graphic headshots, referee headshot assets, and Visual Drill images.
- Supabase Edge Functions for NBA roster/player data, matchup defaults, analytics reports, image export proxying, AI analysis, AI scouting, game metadata, live game state, and Wizards analysis prewarming.
- Supabase pg_cron + pg_net for scheduled Wizards analysis prewarming.

External data sources include:

- CloudFront game feed at `https://d1rjt2wyntx8o7.cloudfront.net/api`.
- NBA Stats endpoints.
- NBA official site endpoints and pages.
- ESPN depth chart endpoints.
- G League roster sources.
- official.nba.com referee assignments.
- OpenAI APIs through Supabase Edge Functions for generated analysis/scouting/custom requests.

The app is not a small dashboard. It is a suite of tools with several separate persistence systems. A rebuild team should treat it as a product platform with multiple domains:

- Live game consumption.
- Coach-facing notes and clips.
- Game analysis generation and shared segment recaps.
- Basketball graphics generation.
- Rotation planning.
- Account and vault storage.
- Operational/admin tooling.

## 2. High-Level System Map

```text
Browser / GitHub Pages SPA
  |
  |-- React Router HashRouter routes
  |-- TanStack Query client-side cache
  |-- localStorage/sessionStorage fallbacks
  |
  |-- Supabase Auth
  |-- Supabase Postgres through supabase-js
  |-- Supabase Storage through supabase-js
  |-- Supabase Edge Functions through fetch / functions.invoke
  |
  |-- External public basketball data
       |-- CloudFront live game API
       |-- stats.nba.com
       |-- nba.com static/content endpoints
       |-- ESPN depth charts
       |-- official.nba.com referee assignments
       |-- AllOrigins fallback proxies for some HTML
```

The frontend owns most UI composition and deterministic calculations. Supabase functions are used when the browser cannot reliably call a source directly, when data should be cached/shared, when credentials are needed, or when OpenAI calls are required.

## 3. Repository Layout

Important top-level files and directories:

```text
.
|-- AGENTS.md
|-- api/
|-- docs/
|-- public/
|-- scripts/
|-- src/
|-- supabase/
|-- tests/e2e/
|-- package.json
|-- vite.config.js
|-- vercel.json
|-- capacitor.config.json
|-- playwright.config.js
```

### 3.1 `src/`

The React application and most business logic live here.

Important groups:

- `src/App.jsx`: top-level routing, authentication gates, app update checks, lazy page loading.
- `src/main.jsx`: React root, QueryClient, AuthProvider, HashRouter.
- `src/api.js`: primary basketball data access layer.
- `src/queries.js`: TanStack Query hooks and cache keys.
- `src/gamePolling.js`: adaptive polling intervals.
- `src/pages/`: route-level pages and large tools.
- `src/components/`: reusable dashboard panels, tables, header, auth gates, officials, matchup, alerts, UI primitives.
- `src/auth/`: auth context/provider and hook.
- `src/data/`: static NBA teams, schedules, NBA Cup metadata, roster fallback data, matchup profile seed data.
- `src/assets/`: fonts, court images, graphics background, coverage icons, referee images.
- `src/*.test.js`: Node-based unit tests.

### 3.2 `supabase/`

Supabase SQL, Edge Function code, and function config.

Important groups:

- `supabase/config.toml`: per-function JWT verification settings.
- `supabase/*.sql`: database schema, policies, storage buckets, scheduled jobs.
- `supabase/functions/*/index.ts`: Edge Functions.
- `supabase/functions/*/*.test.ts`: Deno function tests.

### 3.3 `api/`

Vercel-compatible API handlers. These are not the main production backend if GitHub Pages is used alone, but they support proxy use cases:

- `api/referee-assignments.js`
- `api/team-games.js`
- `api/admin-users.js`

### 3.4 `scripts/`

Operational and data scripts:

- `scripts/build_rosters.py`
- `scripts/update-nba-schedule.mjs`
- `scripts/update-wizards-analysis-prewarm-schedule.mjs`
- `scripts/capture-period-snapshots.js`
- `scripts/upload-referee-full-assets.mjs`
- `scripts/research_momentum_timeouts.js`

### 3.5 `tests/e2e/`

Playwright visual/regression tests for graphics tools.

## 4. Runtime, Build, and Deployment

### 4.1 Frontend Runtime

The frontend is a Vite bundle using:

- React 18.
- React Router 6.
- TanStack Query 5.
- Supabase JS 2.
- date-fns.
- pdf-lib.
- Capacitor packages for possible iOS packaging.

The app is configured for a GitHub Pages base path:

```js
// vite.config.js
base: "/nbadash/"
```

The router uses `HashRouter`, which keeps route state after the hash and avoids GitHub Pages server-side route rewrite problems.

### 4.2 Build Scripts

From `package.json`:

- `npm run dev`: local Vite dev server.
- `npm run build`: Vite production build.
- `npm run lint`: ESLint.
- `npm test`: Node unit tests over `src/**/*.test.js`.
- `npm run test:edge`: Deno tests for Supabase functions.
- `npm run typecheck`: Deno check over Supabase Edge Functions.
- `npm run test:e2e`: Playwright tests.
- `npm run verify`: full verification chain.
- `npm run schedule:update`: update static NBA schedule data.
- `npm run schedule:prewarm:update`: regenerate Wizards analysis prewarm SQL.
- `npm run assets:upload-referees`: upload referee full-size assets.

### 4.3 Vite Chunking

`vite.config.js` defines manual chunks:

- `vendor-react`
- `vendor-router`
- `vendor-supabase`
- `vendor-query`
- `vendor-date`
- `nba-api` for `src/api.js`

This keeps large dependencies and the large data API module separated for browser caching and load behavior.

### 4.4 GitHub Pages Workflow

`.github/workflows/deploy-pages.yml`:

- Runs on pushes to `main` and manual dispatch.
- Uses Node 24 and Deno 2.
- Runs:
  - `npm ci`
  - `npm run check:edge-functions`
  - `npm test`
  - `npm run lint`
  - `npm run build`
- Publishes `dist` to GitHub Pages.
- Injects build-time env:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_ASSIGNMENTS_PROXY_URL`

### 4.5 Other GitHub Actions

`.github/workflows/update-rosters.yml`:

- Scheduled daily.
- Skips outside the NBA/G League relevant months.
- Runs `scripts/build_rosters.py`.
- Commits `src/data/rosters.json` if changed.

`.github/workflows/capture-period-snapshots.yml`:

- Runs frequently during likely game windows.
- Runs `scripts/capture-period-snapshots.js`.
- Uses Supabase service role.
- Captures period-end totals into `period_snapshots` when period endings happen close to the job run time.

### 4.6 Vercel Compatibility

`vercel.json` rewrites all paths to `/`, supporting SPA routing if deployed on Vercel.

The `api/` directory contains serverless functions that can be deployed on Vercel. The app primarily derives Supabase Function URLs when Supabase is configured, but the Vercel endpoints are still part of the project.

### 4.7 Capacitor

`capacitor.config.json`:

- `appId`: `com.jamesfraschilla.nbagamedashboard`
- `appName`: `NBA Game Dashboard`
- `webDir`: `dist`

This exists for possible native/iOS packaging. It does not change the web app architecture.

## 5. Environment Variables

Frontend build variables:

- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Supabase anon key.
- `VITE_ENABLE_ACCOUNTS`: when set to `"false"`, disables account gating. Used by Playwright.
- `VITE_ALLOWED_EMAIL_DOMAIN`: allowed sign-in email domain. Defaults to `monumentalsports.com`.
- `VITE_ASSIGNMENTS_PROXY_URL`: optional proxy URL for referee assignments.

Supabase/Vercel server variables:

- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_ANON_KEY`: anon key in Edge Function environment.
- `SUPABASE_SERVICE_ROLE_KEY`: service role key for admin/server-only operations.
- `OPENAI_API_KEY`: used by AI Edge Functions.
- `OPENAI_ANALYSIS_MODEL`: optional model override for analysis.
- `OPENAI_SCOUTING_MODEL`: optional model override for scouting/custom requests.
- `SNAPSHOT_WINDOW_MINUTES`: period snapshot capture window.
- `GAME_WINDOW_BUFFER_HOURS`: period snapshot post-tip game window.

Supabase Vault secrets for scheduled Wizards analysis prewarming:

- `nba_dash_project_url`
- `nba_dash_service_role_key`

## 6. Authentication and Access Control

### 6.1 Auth Configuration

Auth settings live in `src/authConfig.js`.

Accounts are enabled unless:

```text
VITE_ENABLE_ACCOUNTS=false
```

Allowed email domain defaults to:

```text
monumentalsports.com
```

Roles:

- `admin`
- `coach`

Team scopes:

- `washington`
- `capital_city`
- `washington_summer`

Feature flags:

- `match_ups`
- `tools`

### 6.2 Auth Provider

`src/auth/AuthProvider.jsx` owns:

- Supabase session state.
- Profile loading.
- Sign-in with password.
- Magic link sign-in.
- Password reset.
- Sign out.
- Active/inactive profile gating.
- Feature access helpers.

Important helper behavior:

- `isAdmin` is true only for active profiles with role `admin`.
- `canUseMatchUps` is true for admins or profiles with `match_ups`.
- `hasFeature(flag)` is true for admins or profiles with the specific feature flag.

### 6.3 Last Login Touch

The app updates `profiles.last_login_at`, but it is throttled.

The throttle uses:

```text
nbaDash:lastLoginTouch:{userId}
```

The interval is about 6 hours. The write is skipped if localStorage quota blocks the marker.

This was changed because touching `last_login_at` on every load increases Supabase request volume and CPU.

### 6.4 Auth Storage

`src/supabaseClient.js` creates the Supabase client and custom auth storage.

The storage key is:

```text
nba-dashboard-auth
```

The custom storage tries to preserve auth even if one browser storage surface has quota issues. It:

- Reads from localStorage/sessionStorage.
- Chooses the newest session-like value.
- Falls back to sessionStorage when localStorage writes fail.
- Evicts known bulky app caches before failing hard.

This is why a storage quota issue can briefly flash an account load error, then recover once the app clears or falls back.

### 6.5 Account Gate

`src/App.jsx` uses `AuthGate` when accounts are enabled and no user is signed in.

It also handles:

- password recovery token states,
- loading states,
- failed profile/session states,
- inactive account state,
- feature-gated routes.

## 7. Routing

The router is defined in `src/App.jsx`.

Route table:

| Path | Component | Purpose |
| --- | --- | --- |
| `/` | `Home` | Date/team/opponent game selection |
| `/me` | `UserContent` | My Vault |
| `/admin` | `Admin` | Admin-only user/data management |
| `/tools` | `Tools` | Tools workspace |
| `/graphics` | `Tools` | Graphics-only workspace |
| `/g/:gameId` | `Game` | Live/static game dashboard |
| `/g/:gameId/atc` | `Game` | Game dashboard variant |
| `/g/:gameId/events` | `PlayByPlay` | Play-by-play route |
| `/g/:gameId/notes` | `Notes` | Notes route |
| `/g/:gameId/pregame` | `PreGame` | Pre-game/court time route |
| `/g/:gameId/rotations` | `Rotations` | Game-specific rotations |
| `/g/:gameId/kpis` | `Kpis` | Game-specific KPI board |
| `/m/:gameId` | `Minutes` | Minutes/stints route |
| `/draw` | `Drawing` | Standalone court drawing |
| `*` | redirect | Redirects to `/` |

The app uses lazy imports for route-level pages to keep initial load smaller.

## 8. Header and Global Navigation

`src/components/Header.jsx` renders:

- `NBA Dash` brand label.
- Theme toggle.
- Account menu.
- Date picker.
- Horizontal game strip.

The account menu contains:

- My Vault.
- Graphics.
- Tools.
- Admin, if the current user is an admin.
- Sign Out.

The game strip appears on home/game/minutes contexts and uses `useGamesByDate`.

Polling is adaptive through `getGamesListPollingInterval` from `src/gamePolling.js`.

## 9. Data Access Layer

### 9.1 `src/api.js`

`src/api.js` is the largest client data module. It is the central interface between the app and basketball data.

Primary base:

```text
https://d1rjt2wyntx8o7.cloudfront.net/api
```

Main exports include:

- `fetchGamesByDate`
- `fetchTeamSeasonGames`
- `prefetchCurrentSeasonGames`
- `fetchGame`
- `fetchMinutes`
- `fetchGamesMetadataByIds`
- `fetchCurrentNbaRosters`
- `fetchCurrentGLeagueRosters`
- `fetchNbaMatchupDefaults`
- `fetchNbaPlayerStats`
- `teamLogoUrl`
- `playerHeadshotUrl`
- `playerHeadshotUrls`
- `inferLeagueFromTeamId`
- `nbaEventVideoUrl`

Important responsibilities:

- Normalize CloudFront live game payloads.
- Normalize Summer League/G League differences.
- Merge static 2026-27 NBA schedule data.
- Merge NBA Cup metadata.
- Cache team season schedules.
- Limit roster requests to relevant team IDs where possible.
- Use Supabase Edge Functions for data that is unreliable or blocked from browser calls.

### 9.2 Date Games

`fetchGamesByDate(date)` loads games for a specific date and merges supported sources.

The app treats NBA and G League game IDs differently:

- NBA games are the primary product surface.
- G League games are included where supported.
- Summer League games have special normalization for game data and modified free throw rules.

### 9.3 Team Season Games

`fetchTeamSeasonGames` is used when the Home page team dropdown is selected.

Important performance decision:

- Static schedule data is used first for the current NBA season.
- Team-specific caches are used.
- The app does not intentionally load every game for every team every time the user selects one team.
- The result is sorted soonest-to-latest, not latest-to-soonest.

Storage prefixes:

```text
nba-dashboard-season-games:v2:
nba-dashboard-team-season-games:v2:
```

Cache TTL is about 6 hours.

### 9.4 NBA Cup Metadata

`src/nbaCup.js` and `src/data/nbaCupGames2026_27.json` identify NBA Cup games.

Game cards use this metadata to draw a slightly thicker gold outline for NBA Cup games.

### 9.5 NBA Rosters

Current NBA rosters are fetched through the `nba-rosters` Supabase function.

Important design decision:

- The function accepts `teamIds`.
- Game and graphics contexts should request only the two relevant teams when possible.
- This reduces network load and avoids fetching all current NBA rosters unnecessarily.

### 9.6 NBA Matchup Defaults

`fetchNbaMatchupDefaults` calls the `nba-matchup-defaults` Supabase function.

The function uses ESPN depth charts to infer likely starters/default lineups.

The browser also has fallback logic in:

- `src/matchupDefaultLineups.js`
- `src/matchupGameDefaults.js`

### 9.7 Player Stats

`fetchNbaPlayerStats` calls the `nba-player-stats` Supabase function.

It supports NBA and G League where possible. The function includes normalizers and fallbacks because player stat feeds can be inconsistent or delayed.

### 9.8 Data Freshness

`src/dataFreshness.js` formats stale/updated labels used across dashboards.

### 9.9 Query Layer

`src/queries.js` wraps the API layer with TanStack Query hooks.

Important defaults:

- Date games: short stale window and no window-focus refetch.
- Team season games: 5 minute stale time and no focus refetch.
- Game data: adaptive refresh based on status.

## 10. Polling Strategy

`src/gamePolling.js` defines polling intervals.

Design goals:

- Poll live games more often.
- Poll tracked Wizards/Capital City games more aggressively.
- Slow or stop polling final games.
- Avoid unnecessary background polling.
- Stop pregame polling after stale windows.

This file is part of the app's Supabase and API usage control. If a future team changes polling intervals, they should consider Supabase CPU and external API request volume.

## 11. Home Page

`src/pages/Home.jsx` is the landing page after sign-in.

Capabilities:

- Select date.
- Filter by team.
- Filter by opponent when a team is selected.
- Show NBA games and supported G League games.
- Link into game dashboards.

Important behavior:

- URL search params preserve selected `d`, `team`, and `opponent`.
- Without a team filter, it loads date games.
- With a team filter, it loads team season games.
- Opponent options are filtered to avoid choosing the same team.
- `GameCard` marks NBA Cup games with a gold border.

## 12. Game Cards

`src/components/GameCard.jsx` renders individual game cards.

It displays:

- Team names/tricodes/logos.
- Scores when available.
- Game status/time.
- Records.
- NBA Cup styling.

Links point to:

```text
#/g/{gameId}
```

with date context preserved.

## 13. Live Game Dashboard

Primary files:

- `src/pages/Game.jsx`
- `src/pages/Game.module.css`
- `src/components/SegmentSelector.jsx`
- `src/components/BoxScoreTable.jsx`
- `src/components/AdvancedStatsTable.jsx`
- `src/components/StatBars.jsx`
- `src/components/KillsTable.jsx`
- `src/components/MiscStats.jsx`
- `src/components/CreatingDisruption.jsx`
- `src/components/TransitionStats.jsx`
- `src/components/Officials.jsx`
- `src/components/OfficialsExportPanel.jsx`
- `src/components/MatchUps.jsx`
- `src/components/LateGameMatrixPanel.jsx`
- `src/components/GameAlerts.jsx`

The Game page is the app's central dashboard.

It combines:

- Scoreboard/game state.
- Segment selector.
- Team and player stats.
- Play-by-play context through a horizontal recent-plays wheel.
- Alerts as a curated, expandable notable-events feed.
- Analysis recap generation and shared recaps.
- Notes.
- Officials.
- Match-ups.
- Late game matrix.
- Live state shadow cache.

### 13.1 Game Data Inputs

`Game.jsx` consumes:

- `fetchGame(gameId)`
- `fetchMinutes(gameId)`
- roster data,
- matchup profiles,
- notes,
- referee assignments,
- cached analysis,
- live state shadow snapshots.

### 13.2 Segment Selector

The segment selector allows dashboard stats to be viewed by periods/ranges. It is separate from Analysis prepared segments.

The app has specific support for modified free throw rules in Summer League and G League. This matters for segment stats because a single free throw can be worth 1, 2, or 3 points in those competitions.

### 13.3 Live State Shadow

`src/gameLiveStateData.js` builds a compact signature from:

- game ID,
- status,
- period,
- clock,
- teams/scores,
- play count,
- box score player count,
- minutes period count,
- stint count.

If the signature changes, the app can upsert a compact live game snapshot through the `game-live-state` Supabase function.

This was designed to avoid unnecessary writes. The app should not write the full game object repeatedly unless the signature indicates a meaningful change.

### 13.4 Tracked Games

Many live features are scoped more tightly for Washington and Capital City games.

The code refers to these as rotations/tracked games in several places.

Shared analysis and KPI remote sync are intentionally limited to Washington/Capital City contexts to reduce unnecessary backend work.

### 13.5 Play-by-Play Wheel and Alerts

The live dashboard intentionally keeps the play-by-play wheel and Alerts panel separate.

The play-by-play wheel is the raw event stream:

- It appears below the compact Alerts surface on the Game page.
- It is horizontal and compact.
- It gives users quick access to the most recent on-court events.
- It is useful for answering "what just happened?"

The Alerts panel is the curated interpretation layer:

- It appears below the scoreboard action row and above the play-by-play wheel.
- It starts collapsed by default, using `nba-dashboard:alerts-panel:{gameId}` in local storage to preserve panel state.
- When collapsed, it shows one latest eligible high-signal alert. Eligible compact categories are `Run`, `Foul Trouble`, `Player Impact`, `Team Trend`, `Quarter`, `Halftime`, `Player Scoring`, and `Milestone`.
- Lower-priority alert categories such as `Defense`, `Rebounding`, `First Score`, `Playmaking`, and `Team Scoring` remain available only in the expanded list.
- When expanded, it renders every alert newest-first so live users do not need to scroll to the bottom during a game.
- It is useful for answering "what matters from what has happened?"

These two surfaces should not be merged unless the product direction changes substantially. They use the same underlying live game feed but serve different scanning behaviors.

## 14. Alerts

Primary files:

- `src/gameAlerts.js`
- `src/gameAlerts.test.js`
- `src/components/GameAlerts.jsx`

Alerts are deterministic client-generated notable events based on play-by-play and box score context. They do not require a Supabase function.

`buildGameAlerts()` returns alerts in chronological order with stable `sortIndex` values. The `GameAlerts` component reverses that display order and renders newest-first in the live dashboard. Keeping generation chronological makes testing and capping easier, while rendering newest-first makes live usage more practical.

Alert categories include:

- Player impact.
- Scoring runs.
- Period summaries.
- Assisted-shot share.
- Bench scoring share.
- Team period scoring thresholds.
- Defensive event thresholds.
- First points and other game-event milestones.

Important constants include:

- Player contribution share threshold.
- Minimum team period points before contribution alerts can fire.
- Minimum period elapsed before some current-period alerts.
- Run thresholds and max run duration.
- Deduplication/repeat delta thresholds.
- Maximum alert count.

UI rendering conventions:

- The panel header displays the total alert count.
- Alert cards show time, category, team, title, and optional detail.
- Team-specific alerts render a small team logo badge using `teamLogoUrl(teamId)`.
- If a team logo cannot be resolved, the badge falls back to the three-letter team code.
- Alert team logo badges are size-constrained so image loading does not resize the row.

Wording and timestamp conventions:

- Quarter references use compact labels: `Q1`, `Q2`, `Q3`, and `Q4`.
- Run alert titles include the run duration, such as `Timberwolves are on a 23-14 run over the last 6:03`.
- Run detail ranges use compact period-clock labels only, such as `Q3 0:52 to Q4 6:49`.
- Period-end alerts are timestamped at the true period end (`0:00`) rather than after the last scoring event. This prevents late non-scoring alerts, such as a rebound at `Q1 0:25`, from appearing after the `Q1 0:00` summary.
- Period-end tie summaries use direct phrasing such as `At the end of Q1, the Wizards and the Celtics are tied at 24`.
- Count stats use coach-facing abbreviations: `Pt`/`Pts`, `Ast`, `Reb`, `Stl`, `Blk`, `TO`, `OReb`, and `DReb`.
- If an alert combines player points and points created by assists, it says the player "contributed to" team points, not "accounts for."
- If the referenced period is still in progress, contribution alerts use present perfect wording, such as `has contributed to ... so far in Q3`.
- Player contribution alert details do not wrap the entire second line in parentheses. The detail line should read like `7 Pts, 1 Ast (3 Pts via Ast)`.
- Triple-double milestone alerts include the player's relevant near-triple-double stat line, such as `Chris Livingston is approaching a triple-double (12 Pts, 9 Reb, 9 Ast)`.
- Rebound alerts only use "to start Q1" style wording early in a period. Late-period rebound milestones use plain `in Q1` wording.
- Assisted-shot team trend alerts use the second line to show assisted field-goal scoring, unassisted field-goal scoring, and free throws.
- Field-goal stat references include the relevant shot label when needed: overall field goal alerts use `FG`, and three-point references use `3FG`.
- Low-percentage team trend alerts may use "just" for low nonzero values, but never for zero. For example, `Spurs shot 0% (0/9 3FG) from three in Q3`, not `Spurs shot just 0%...`.
- Duplicate or near-duplicate run alerts and contribution alerts are filtered to avoid alert spam.

This system should remain conservative. Adding every possible alert creates noise for coaches and slows scanning.

## 15. Analysis Tool Inside Game Dashboard

Primary files:

- `src/gameAnalysis.js`
- `src/analysisData.js`
- `src/pages/Game.jsx`
- `supabase/functions/game-analysis/index.ts`
- `supabase/game_analysis_segments.sql`
- `supabase/functions/wizards-analysis-prewarm/index.ts`
- `supabase/wizards_analysis_prewarm_schedule.sql`

The Analysis tool generates segment recaps using game data and OpenAI.

### 15.1 Prepared Segments

Prepared segments:

- Q1
- Q2
- 1st Half
- Q3
- Q1-Q3
- Q4
- 2nd Half
- All Segments [Final Full Game]

The dropdown starts at `Select`. When a segment is selected, the selected label remains visible.

When a prepared segment is visible:

- A small clear/reset button appears.
- The Custom Range area is hidden.
- The UI does not display "Loaded shared Q1 analysis" status messages.

### 15.2 Shared Recaps

Shared cached recaps are stored in `game_analysis_segments`.

The goal:

- For Washington games, segment recaps are generated automatically after segment windows and then shared across users.
- Users should usually load cached recaps rather than generating their own duplicate recaps.

### 15.3 Wizards Prewarming

`wizards-analysis-prewarm` is a Supabase Edge Function called by pg_cron jobs generated from the known Wizards schedule.

The schedule is generated by:

```text
scripts/update-wizards-analysis-prewarm-schedule.mjs
```

The generated SQL schedules jobs only for Wizards game windows:

- from scheduled tip,
- through 4 hours after tip.

This avoids running a cron function every minute all season.

### 15.4 Analysis Prompt Guardrails

The Edge Function prompt and factual context aim to:

- include made/attempt totals when percentages are mentioned,
- avoid saying a team had a lead/deficit/advantage of 0,
- state exact gaps/deficits where possible,
- use the same stat abbreviations as Alerts: `Pt`/`Pts`, `Ast`, `Reb`, `Stl`, `Blk`, `TO`, `OReb`, and `DReb`,
- use compact team stat labels such as `Pts off TO`, `paint Pts`, `transition Pts`, and `second-chance Pts`,
- produce sectioned coach-readable recaps.

The Edge Function also normalizes generated and template text through `sanitizeAnalysisText()`, which combines turnover-language correction with stat-abbreviation cleanup before responses are cached or returned.

If future wording issues appear, the fix usually belongs in the prompt construction and factual context helpers inside `supabase/functions/game-analysis/index.ts`.

## 16. Notes

Primary files:

- `src/pages/Notes.jsx`
- `src/notesStorage.js`
- `src/accountData.js`
- `src/noteHelpers.js`
- `src/components/ShareDialog.jsx`
- `src/components/VersionHistoryDialog.jsx`

Notes support:

- Game-specific notes.
- Period/clock metadata.
- Tags.
- Clip/source metadata.
- Sharing.
- Version history.
- Vault access.
- Legacy local note import.

### 16.1 Local Legacy Notes

Legacy notes are stored under:

```text
nba-dashboard:notes
```

Import state is stored under:

```text
nba-dashboard:notes-import:v1:{userId}
```

### 16.2 Account Notes

Account notes are stored in `user_notes`.

Related tables:

- `user_note_shares`
- `user_note_versions`

Atomic RPCs:

- `create_user_note_atomic`
- `update_user_note_atomic`
- `replace_user_note_shares_atomic`
- `delete_user_note_atomic`

The app uses these RPCs rather than ad hoc insert/update/delete logic so version rows and share changes stay consistent.

### 16.3 Public Note Tags

The public note tag is:

```text
Halftime
```

Legacy `Concept` tags are normalized to `Halftime`.

When a note has a public tag, sharing scope is resolved as shared.

## 17. Court Drawing

Primary files:

- `src/pages/Drawing.jsx`
- `src/accountData.js`
- `src/components/ShareDialog.jsx`
- `src/components/VersionHistoryDialog.jsx`

Drawing supports:

- Half court and full court modes.
- Stroke persistence.
- Game-specific or standalone drawings.
- Sharing.
- Version history.
- Vault listing.

Account drawings are stored in:

- `user_drawings`
- `user_drawing_shares`
- `user_drawing_versions`

Atomic RPCs:

- `create_user_drawing_atomic`
- `update_user_drawing_atomic`
- `replace_user_drawing_shares_atomic`
- `delete_user_drawing_atomic`

## 18. Officials

Primary files:

- `src/officialAssignments.js`
- `api/referee-assignments.js`
- `src/refereeHeadshots.js`
- `src/pages/RefereeHeadshotsPreview.jsx`
- `src/components/Officials.jsx`
- `src/components/OfficialsExportPanel.jsx`

### 18.1 Assignment Source

Source:

```text
https://official.nba.com/referee-assignments/
```

Fetch order:

- explicit `VITE_ASSIGNMENTS_PROXY_URL`,
- derived Supabase Function URL when available,
- `/api/referee-assignments`,
- direct official page,
- AllOrigins raw proxy fallback.

### 18.2 Assignment Parsing

`officialAssignments.js` normalizes:

- official names,
- role/order metadata,
- crew chief/referee/umpire roles,
- alternate officials,
- published order.

### 18.3 Referee Headshots

Static assets live under:

```text
src/assets/referees/
src/assets/referees_review_duplicates/
```

Shared referee headshot state is stored through `rotations_shared_state` using:

```text
scope_type = shared_referee_headshots
scope_key = global
```

Local keys:

```text
referee_headshot_overrides_v1
referee_headshot_preferences_v1
```

Storage buckets referenced by code:

```text
referee-headshots-preview
referee-headshots-full
```

The referee export panel renders canvas-based graphics for officials.

## 19. Match-Ups Panel in Game Dashboard

Primary file:

- `src/components/MatchUps.jsx`

The live Match-Ups panel is separate from the Match-Up Graphics generator.

It uses:

- current game teams,
- roster data,
- matchup profiles,
- player roles/archetypes,
- user selections.

Admin-managed matchup profiles live in:

- `src/matchupProfileData.js`
- `src/data/matchupProfiles.js`
- `matchup_player_profiles` table.

Profiles include:

- height,
- archetype,
- defender role,
- offensive role,
- preferred offensive roles,
- avoided offensive roles,
- preferred opponent IDs,
- avoided opponent IDs.

Admins can manage this data through `src/pages/Admin.jsx`.

## 20. Late Game Situation Matrix

Primary files:

- `src/lateGameStrategy.js`
- `src/components/LateGameMatrixPanel.jsx`

The late-game logic is deterministic and rule-based. It uses embedded matrix concepts for:

- time remaining,
- score margin,
- possession,
- fouls,
- timeouts,
- free throw scenarios,
- jump ball scenarios,
- offensive/defensive strategic recommendations.

It appears in the live game dashboard and as an admin-only standalone tool in the Tools workspace.

Saved feedback/recommendations are stored as tool vault records:

- `late_game_feedback`
- `late_game_recommendation`

## 21. KPI Pages

Primary file:

- `src/pages/Kpis.jsx`

KPIs are game-specific fullscreen boards.

Important design decisions:

- Local persistence always works.
- Remote Supabase sync is intentionally limited.
- Remote sync is enabled only for Washington/Capital City games while the game is live.
- Unsupported team games show an availability message rather than syncing remotely.

Local key:

```text
kpis:game:v1:{gameId}
```

Shared table:

```text
rotations_shared_state
```

Shared scope:

```text
scope_type = shared_game_kpis
scope_key = {gameId}
```

Polling interval:

```text
5000 ms
```

Remote save debounce:

```text
750 ms
```

The merge logic tracks timestamps separately for names and values so one user changing a metric name does not overwrite another user's live value edit incorrectly.

## 22. Tools and Graphics Workspace

Primary files:

- `src/pages/Tools.jsx`
- `src/toolNavigation.js`
- `src/pages/Tools.module.css`

The top-level account menu routes:

- `/graphics` for graphics tools only.
- `/tools` for the broader tools workspace.

### 22.1 Tool Navigation

`src/toolNavigation.js` defines the tab registry.

Graphics tools:

- Match-Up.
- Coverage.
- Court Time.
- Personnel.
- Depth Chart.

Other tools:

- Rotations.
- Analytics Report.
- Pre-Game Scouting Packet.
- Late Game Matrix.
- Custom Requests.
- Visual Drill.

Admin-only tools:

- Pre-Game Scouting Packet.
- Late Game Matrix.

## 23. My Vault

Primary files:

- `src/pages/UserContent.jsx`
- `src/toolVault.js`
- `src/accountData.js`

My Vault is the account-backed user content hub.

Tabs:

- Graphics.
- Rotations.
- Notes.
- Court Drawings.
- Tools.
- Late Game Analysis.

Graphics sub-tabs mirror the graphics tool structure:

- Match-Up.
- Coverage.
- Court Time.
- Personnel.
- Depth Chart.

### 23.1 Vault Record Limits

Vault pages load bounded sets of records. The current default limit is 200, with a max utility cap of 500.

This prevents unbounded reads as the account grows.

### 23.2 Tool Vault Records

Tool records are stored locally and remotely.

Local prefix:

```text
nba-dashboard:tool-vault:v1:
```

Remote table:

```text
user_tool_records
```

Remote save RPC:

```text
save_user_tool_record_atomic(p_record, p_expected_revision)
```

The RPC uses revision checks and, in the newer migration, an advisory lock. This prevents conflicting writes from silently overwriting each other.

### 23.3 Tool Record Types

Known record types:

- `matchup_graphic`
- `coverage_graphic`
- `pregame_court_time_graphic`
- `personnel_graphic`
- `depth_chart_graphic`
- `rotations_tool`
- `game_analysis`
- `pregame_scouting_packet`
- `late_game_feedback`
- `late_game_recommendation`
- `visual_drill_preset`

### 23.4 Local and Remote Strategy

The vault tries to save locally and remotely.

Reasons:

- Local storage gives immediate availability.
- Remote storage makes records available across sessions/devices/accounts where permitted.
- Remote writes can fail; the app should surface failures where possible but preserve local work.

The vault module dedupes active remote requests and uses a remote timeout to avoid hanging forever.

## 24. Graphics Platform

Shared graphics concepts:

- Canvas-based export.
- 1920x1080 layout for landscape slides.
- Shared dark slide background:

```text
src/assets/graphics/slide-background.png
```

- Team logos in the upper left in modern exports.
- External image loading through the `export-image` Supabase function to avoid CORS tainting canvases.
- Vault saves for most graphics drafts/exports.

### 24.1 Export Image Proxy

`supabase/functions/export-image/index.ts` proxies images from allowed external hosts.

It is used by graphics/PDF generation when the browser needs to draw a remote logo/headshot into canvas or PDF without CORS failures.

The function applies:

- URL validation.
- timeout limits.
- content-type checks.
- size checks.

## 25. Match-Up Graphic Tool

Primary files:

- `src/pages/Tools.jsx`
- `src/pages/matchupGraphicExport.js`
- `src/matchupGraphicLineups.js`
- `src/matchupGameDefaults.js`

Purpose:

Create a 1920x1080 matchup slide for two teams and selected players.

Important behavior:

- Washington is the default NBA team.
- On days with a scheduled Wizards game, the opponent can be preloaded into the second team slot.
- NBA default players can be populated from depth chart/default lineup logic.
- Player dropdowns use narrowed roster data.
- The previous live preview was removed to reduce resource usage and app workload.
- Export uses the shared dark slide background.
- Logos are placed upper left; for 1920x1080, logo size is 140x140 at x=83, y=53.
- Drafts can be saved to the Vault.

The preview removal is deliberate. The Match-Up tool has heavier image/headshot/player state than Coverage or Depth Chart, so live preview rendering was not worth the browser workload.

## 26. Coverage Graphic Tool

Primary files:

- `src/pages/CoverageGraphicAdmin.jsx`
- `src/coverageGraphic.js`
- `src/pages/coverageGraphicExport.js`
- `src/coverageGraphic.test.js`

Purpose:

Create defensive coverage slides with columns, coverage icons, and text labels.

Default layout:

- 3 columns.
- 2 rows.
- Column separators are thin white vertical lines.
- Column headers:
  - `P/R`
  - `DHO + C&S`
  - `MISC`
- Column 1 row 1:
  - icon `Vol 1`
  - text `5`
- Column 1 row 2:
  - icon `Red`
  - text `1-4`

Behavior:

- The menu exposes a dropdown for each coverage icon space.
- Title/header text is separate from and above each column.
- The bottom row does not have title text fields.
- Third column can be removed with an X.
- If there are only two columns, a plus control can add the third column back.
- If the third column is empty, the exported graphic can collapse to a 2-column layout.
- The Preview area updates in real time.
- Drafts save to the Vault as `coverage_graphic`.

Coverage icons live under:

```text
src/assets/coverage/
```

Known icons:

- `vol-1.png`
- `vol-2.png`
- `vol-3.png`
- `red.png`
- `white.png`
- `odb.png`
- `show.png`
- `thru.png`
- `mix.png`
- `war.png`
- `fist.png`

## 27. Court Time / Pre-Game Graphic Tool

Primary files:

- `src/pages/PreGame.jsx`
- `src/pages/PreGame.module.css`

Purpose:

Generate pre-game court time graphics for Wizards/Capital City usage.

Contexts:

- Standalone graphics tool.
- Per-game dashboard tool.

Important behavior:

- Standalone tool has a roster dropdown.
- Wizards roster is default.
- Capital City Go-Go roster is available.
- The last slot defaults to 7:00.
- Each previous slot defaults backwards by 15 minutes.
- Opponent/name text is editable in contexts that need manual opponent text.
- Landscape export is always light mode.
- Saves to Vault as `pregame_court_time_graphic`.

## 28. Personnel Graphic Tool

Primary files:

- `src/pages/PersonnelGraphicAdmin.jsx`
- `src/personnelGraphic.js`
- `src/personnelGraphicLayout.js`
- `src/pages/personnelGraphicExport.js`
- `src/personnelGraphic.test.js`
- `src/personnelGraphicLayout.test.js`

Purpose:

Generate player personnel slides with a headshot, name/number, stats, shooting indicator, and tags.

Layout:

- 1920x1080 export.
- Shared dark slide background.
- Team logo upper left.
- Player headshot near top center.
- Large jersey/name text.
- Four-stat box.
- 3P segmented color bar.
- Optional visual tags such as fire/cold/drives left/right.

Important behavior:

- If a player has the Fire tag, the 3P color is automatically bright green.
- A bright green 3P color does not automatically add a Fire tag.
- Personnel exports can be batched into ZIP files.
- Custom PNG headshots use the `graphic-headshots` bucket and are size-bounded.
- Drafts save as `personnel_graphic`.

## 29. Depth Chart Graphic Tool

Primary files:

- `src/pages/DepthChartGraphicAdmin.jsx`
- `src/pages/depthChartGraphicExport.js`

Purpose:

Generate depth chart graphics for a selected team.

Behavior:

- Supports NBA and G League team selection.
- Supports starter/bench groupings.
- Supports custom players and headshots.
- Uses a live preview.
- Saves to Vault as `depth_chart_graphic`.

Custom headshots use the shared graphic headshot storage helpers.

## 30. Graphic Headshot Storage

Primary file:

- `src/graphicHeadshotStorage.js`

Bucket:

```text
graphic-headshots
```

Limits:

- Source PNG only.
- Source file max 10 MB.
- Output max 5 MB.
- Max output dimension 1600.
- Source max dimension 8192.
- Source max pixels 40,000,000.

Path format:

```text
{userId}/{toolType}/{slotKey}-{uuid}.png
```

Old user-owned images can be removed after replacement.

This was built to avoid the storage/memory problems that came from oversized image uploads.

## 31. Visual Drill

Primary files:

- `src/pages/VisualDrillGenerator.jsx`
- `src/pages/VisualDrillGenerator.module.css`
- `src/visualDrillGenerator.js`
- `src/visualDrillStorage.js`
- `src/visualDrillGenerator.test.js`
- `src/visualDrillStorage.test.js`

Purpose:

An offline-friendly visual reaction/training drill generator.

### 31.1 Defaults

Default settings include:

- Background: black.
- Spaces/columns: minimum 1, maximum 4.
- Digits enabled.
- Shapes/symbols enabled.
- Images disabled.
- Digit colors:
  - red `#ff1010`
  - green `#00e600`
  - blue `#106df3`
- Shape colors match the digit defaults.
- Default shapes:
  - triangle
  - square
  - circle
  - star

### 31.2 Settings UI

The current settings UI has:

- Favorites dropdown at top.
- Collapsible sections.
- Sections collapsed by default.
- Drill controls and drill mode controls.

### 31.3 Generation Rules

The output generator supports:

- digits,
- shapes,
- uploaded images,
- combinations by slots/spaces.

Important rule:

- Two consecutive digits cannot have the same color.
- Shapes/images break the digit-color streak.

Example:

- Invalid: `1 red`, `3 red`, `2 blue`
- Valid: `1 red`, `3 blue`, `2 red`

### 31.4 Drill Mode

Drill mode is fullscreen.

Behavior:

- Elements scale dynamically to fill available space.
- Single items become large.
- Multiple items share space without leaving large unused areas.
- Timer mode includes a bottom progress bar moving left-to-right with elapsed time.
- Manual refresh remains available.

### 31.5 Image Uploads

Bucket:

```text
visual-drill-images
```

Limits:

- Source max 8 MB.
- Upload max 512 KB.
- Max dimension 900.
- Formats: JPEG, PNG, WebP.

The upload pipeline:

- validates file,
- reads image,
- scales it down,
- trims transparent/uniform padding,
- compresses to WebP/JPEG/PNG as appropriate,
- rejects if it cannot get under upload limits.

Images are owner-scoped and private.

### 31.6 Favorites

Visual Drill favorites are saved as tool vault records:

```text
visual_drill_preset
```

The standalone Visual Drill app and dashboard Visual Drill should preserve existing saved favorites if record schemas and local keys remain backward compatible.

## 32. Rotations Tool

Primary file:

- `src/pages/Rotations.jsx`

Tests/support:

- `src/substitutionUtils.js`
- `src/substitutionUtils.test.js`

Rotations is one of the most production-sensitive parts of the app.

Important warning from `AGENTS.md`:

Do not change Rotations storage keys, Supabase scope keys, payload schemas, default hydration, or fallback behavior in ways that overwrite, hide, reset, or orphan existing data unless explicitly required and backward compatible.

### 32.1 Contexts

Rotations runs in:

- Game dashboard route: `/g/:gameId/rotations`.
- Standalone Tools route.

### 32.2 Local Storage Keys

Known keys:

```text
rotations:game:v1:{gameId}
rotations:sections:v1:{teamScope}
rotations:{teamScope}:players:v1
rotations:{teamScope}:depth-template:v1
rotations:{teamScope}:saved-lineups:v1
```

### 32.3 Shared Supabase State

Table:

```text
rotations_shared_state
```

Scope types include:

- `players`
- `depth_template`
- `game`
- `saved_lineups`
- `public_versions`

This table used to be part of Supabase Realtime. It was removed from Realtime publication to reduce CPU and `realtime.list_changes` volume.

### 32.4 Polling and Saves

Current sync strategy:

- Narrow polling instead of broad Realtime.
- Game state polling during live relevant games.
- Remote game polling around 5000 ms.
- Remote save debounce around 750 ms.
- Standalone vault autosave around 900 ms.
- Public versions stale time around 60 seconds.

### 32.5 Versions

Default final version:

```text
final
```

Standalone saved versions:

- are saved to Vault,
- appear in the Version dropdown,
- can be private or public.

New version modal:

- Version Name.
- Start from Blank.
- Copy Current Version.
- Public checkbox.

If Public is checked:

1. The version is saved to the user's Vault.
2. It is visible to the creator in the Version dropdown.
3. It is visible to all users in the Version dropdown.

If Public is not checked:

1. The version is saved to the user's Vault.
2. It is visible only to that user in the Version dropdown.

Public versions are published through `rotations_shared_state` with the `public_versions` scope.

### 32.6 Players and Templates

Rotations hydrates players from:

- shared remote roster state,
- local roster state,
- legacy roster state,
- default rosters.

It links API `personId` values where possible.

Saved lineups and depth templates are also merged between local and remote state using updated timestamps.

### 32.7 Export

Rotations exports PDF using `pdf-lib`.

Any rebuild should preserve browser-side export unless a server rendering pipeline is intentionally introduced.

## 33. Analytics Report Tool

Primary files:

- `src/pages/AnalyticsReport.jsx`
- `src/analyticsReportData.js`
- `src/analyticsReportPdf.js`
- `src/analyticsReportPdf.test.js`
- `supabase/functions/nba-analytics-report/index.ts`
- `supabase/functions/nba-analytics-report/index.test.ts`

Purpose:

Generate team and player analytics reports similar to a third-party insight report, using publicly available NBA Stats data where possible.

### 33.1 Inputs

User selects:

- Team.
- Season.
- Season type.
- Window.

Season type options include:

- Regular Season.
- Playoffs.
- Regular Season & Playoffs.

Window options include:

- fixed game windows,
- All Games.

When All Games is selected, the app displays the actual count:

```text
All Games (82)
```

or the relevant count.

### 33.2 Excluded Synergy-Like Section

The situational points per possession section was intentionally excluded because metrics like Late Shot Clock PPP and After Deadball PPP are Synergy-style data and are not reliably available from public NBA Stats endpoints.

### 33.3 Supabase Function

`nba-analytics-report`:

- Requires JWT.
- Calls NBA Stats endpoints.
- Limits concurrent NBA Stats requests to 6.
- Uses an in-memory cache of about 5 minutes.
- Caches up to about 80 report requests.
- Has request timeouts around NBA Stats calls.

### 33.4 PDF Export

PDF export is browser-side using `pdf-lib`.

Important behavior:

- It directly downloads a PDF file.
- It does not use browser print preview.
- The report has no cover page.
- Team pages and player pages are designed around one-page components.
- Headshots/logos are loaded through the export image proxy when needed.

### 33.5 Report Sections

Team pages include:

- About Team.
- How They Score Offensively.
- How They Play.
- Opponent Report/defensive breakdown.

Player pages include:

- About Player.
- How They Score.
- Shooting Efficiency.

Team pages include column headers:

```text
%RANK - NBA
KEY STATS - {N} GAMES
```

Player pages include column headers:

```text
RANK - TEAM
KEY STATS - {N} GAMES
```

### 33.6 Rank Color Coding

Team ranks use NBA percentile/rank logic.

Player ranks use team-relative ranking:

- rank 1 is dark green,
- median rank is grey,
- last rank is red,
- intermediate ranks use light green/yellow/orange along the spectrum.

Category colors are preserved for:

- Creating.
- 3PT.
- ATR.
- FT Line.
- Non-Rim Paint.
- Long 2.

## 34. Pre-Game Scouting Packet

Primary files:

- `src/pages/Tools.jsx`
- `src/pregameScoutingData.js`
- `supabase/functions/pregame-scouting/index.ts`

Purpose:

Admin-only tool to generate a scouting packet for an opponent/team over a selected range.

Inputs:

- Team.
- Mode.
- Game count.
- Start/end dates.

Backend:

- Supabase Edge Function.
- JWT required.
- Profile/admin checks.
- OpenAI chat completions.

Vault record type:

```text
pregame_scouting_packet
```

## 35. Custom Requests Tool

Primary files:

- `src/pages/Tools.jsx`
- `src/customRequestsData.js`
- `supabase/functions/custom-requests/index.ts`

Purpose:

Allow a user to ask custom basketball/stat questions and receive generated answers/tables.

Backend:

- Supabase Edge Function.
- Uses OpenAI Responses API when `OPENAI_API_KEY` is available.
- Has a fallback parser for structured requests.
- Fetches game/team/player data as needed.
- Includes in-memory promise caches to avoid duplicate heavy work.

The function is large because it includes:

- team search/indexing,
- roster resolution,
- player name inference,
- prompt parsing,
- stat calculations,
- table building,
- custom answer formatting.

If rebuilding, this is a candidate for decomposition into smaller services/modules.

## 36. Admin Area

Primary files:

- `src/pages/Admin.jsx`
- `src/pages/Admin.module.css`
- `src/accountData.js`
- `src/matchupProfileData.js`
- `src/operationalHealth.js`
- `supabase/functions/admin-users/index.ts`

Admin supports:

- Invite users.
- Create managed users.
- Edit profiles.
- Set roles.
- Set status.
- Set team scopes.
- Set feature flags.
- Manage matchup player profiles.
- Manage/preview referee headshots.
- Manage player headshot override state.
- Run operational health checks.

### 36.1 Admin Users

There are two implementations:

- Supabase Edge Function: `supabase/functions/admin-users/index.ts`.
- Vercel function: `api/admin-users.js`.

Both require:

- valid auth token,
- admin profile,
- active status,
- service role key server-side.

Allowed email domain defaults to:

```text
monumentalsports.com
```

### 36.2 Operational Health

`src/operationalHealth.js` runs checks for:

- Supabase client configuration.
- Active auth session.
- CloudFront game feed.
- NBA roster function.
- G League roster function.
- Player headshot bucket.
- Shared headshot state.
- Summer roster state.

## 37. Supabase Database

### 37.1 Core Auth Tables

Defined in `supabase/accounts_auth.sql`.

Tables:

- `profiles`
- `account_invites`
- `audit_logs`

`profiles` stores:

- email,
- display name,
- role,
- team scopes,
- status,
- feature flags,
- last login,
- timestamps.

`account_invites` stores pending invite defaults.

`audit_logs` records admin/profile/content actions.

### 37.2 Notes Tables

Tables:

- `user_notes`
- `user_note_shares`
- `user_note_versions`

Important concepts:

- private/shared/public notes,
- owner access,
- explicit share access,
- automatic version snapshots through RPCs.

### 37.3 Drawing Tables

Tables:

- `user_drawings`
- `user_drawing_shares`
- `user_drawing_versions`

Drawing rows store court mode and strokes as structured JSON.

### 37.4 Tool Vault Table

Table:

```text
user_tool_records
```

Important columns:

- owner ID,
- record type,
- title,
- payload JSON,
- revision,
- created/updated timestamps.

The app uses `save_user_tool_record_atomic` for conflict-safe writes.

### 37.5 Matchup Profiles

Table:

```text
matchup_player_profiles
```

Used by live Match-Ups and admin profile management.

### 37.6 Shared Rotations State

Table:

```text
rotations_shared_state
```

General key-value shared state table for:

- rotations players,
- depth templates,
- game rotations,
- saved lineups,
- public rotation versions,
- KPI shared state,
- referee headshot shared state.

This table is intentionally not in Realtime publication now because Realtime produced high Supabase CPU usage.

### 37.7 Shared Game Analysis

Table:

```text
game_analysis_segments
```

Stores shared generated segment recaps.

Unique key:

```text
(game_id, segment_key)
```

Browser users can read. Writes are intended to happen through the Edge Function/service role path.

### 37.8 Game Live State

Table:

```text
game_live_state
```

Stores compact live game snapshots. Writes are performed by the `game-live-state` Edge Function with service role.

### 37.9 Roster Snapshots

Table:

```text
roster_feed_snapshots
```

Service-role only fallback snapshots for roster feeds.

## 38. Supabase Storage

### 38.1 Player Headshots

SQL:

```text
supabase/player_headshots_storage.sql
```

Bucket:

```text
player-headshots
```

Used for player headshot override/admin flows.

### 38.2 Graphic Headshots

SQL:

```text
supabase/graphic_headshots_storage.sql
```

Bucket:

```text
graphic-headshots
```

PNG-only, owner-scoped, bounded by size policies.

### 38.3 Visual Drill Images

SQL:

```text
supabase/visual_drill_images_storage.sql
```

Bucket:

```text
visual-drill-images
```

Private, owner-scoped, small files only.

### 38.4 Referee Headshot Buckets

Referenced by `src/refereeHeadshots.js`:

```text
referee-headshots-preview
referee-headshots-full
```

These support preview and full-size referee imagery.

## 39. Supabase Edge Functions

Defined under:

```text
supabase/functions/
```

JWT verification settings live in `supabase/config.toml`.

### 39.1 `admin-users`

Purpose:

- invite users,
- create managed users,
- require active admin.

JWT:

- verified by function/client token logic.

Secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_ALLOWED_EMAIL_DOMAIN`

### 39.2 `custom-requests`

Purpose:

- answer custom basketball/stat prompts.

Uses:

- OpenAI Responses API.
- NBA/team/player data helpers.
- In-memory caching.

JWT:

- not listed as verified in config, but caller may pass auth headers.

### 39.3 `export-image`

Purpose:

- fetch allowed external image URLs for canvas/PDF use.

JWT:

- false.

Important because direct image draws can taint canvas and break export.

### 39.4 `game-analysis`

Purpose:

- list cached shared recaps,
- generate analysis recaps,
- save shared segment recaps.

Uses:

- OpenAI chat completions.
- service-role DB client for shared cache writes.

JWT:

- false in config so the app can access it, but service operations are controlled inside function logic.

### 39.5 `game-live-state`

Purpose:

- get/upsert compact live game state snapshots.

JWT:

- true.

Uses:

- service role for table writes.

### 39.6 `game-metadata`

Purpose:

- batch fetch metadata for game IDs, especially Vault records.

JWT:

- true.

### 39.7 `gleague-rosters`

Purpose:

- fetch current G League rosters.
- use snapshot fallback.

JWT:

- false.

### 39.8 `nba-analytics-report`

Purpose:

- build analytics report data from NBA Stats.

JWT:

- true.

Performance protections:

- max 6 concurrent NBA Stats requests,
- request timeouts,
- short in-memory cache,
- bounded cache size.

### 39.9 `nba-matchup-defaults`

Purpose:

- infer default lineups from ESPN depth charts.

JWT:

- false.

Supports `teamIds` query narrowing.

### 39.10 `nba-player-stats`

Purpose:

- fetch player stats from NBA/G League public data.
- normalize inconsistent feeds.
- provide fallback behavior.

JWT:

- false.

### 39.11 `nba-rosters`

Purpose:

- fetch current NBA rosters.
- optionally limit to requested `teamIds`.
- use roster snapshot fallback.

JWT:

- false.

### 39.12 `player-headshot`

Purpose:

- resolve player headshot URLs, especially G League/player page cases.

JWT:

- false.

### 39.13 `pregame-scouting`

Purpose:

- generate pre-game scouting packet.

JWT:

- true.

Uses:

- OpenAI chat completions.
- profile/admin access.

### 39.14 `team-games`

Purpose:

- fetch team season games.
- used as browser-safe server function for NBA Stats team schedule lookups.

JWT:

- false.

### 39.15 `wizards-analysis-prewarm`

Purpose:

- scheduled generation of missing Wizards shared analysis recaps.

JWT:

- true.

Called by:

- Supabase pg_cron/pg_net job with service role bearer token.

## 40. Scheduled and Background Processes

### 40.1 GitHub Pages Deploy

Runs on every push to `main`.

Validates and deploys the static app.

### 40.2 Roster Update

Scheduled GitHub Action:

- builds `src/data/rosters.json`,
- commits if changed.

### 40.3 Period Snapshot Capture

Scheduled GitHub Action:

- checks today's and yesterday's games,
- only runs real capture logic inside morning/game windows,
- writes period snapshots when period-end events are recent.

### 40.4 Wizards Analysis Prewarm

Supabase cron:

- created by `wizards_analysis_prewarm_schedule.sql`,
- generated by `scripts/update-wizards-analysis-prewarm-schedule.mjs`,
- only for Wizards games,
- only from tip through 4 hours after tip,
- calls `wizards-analysis-prewarm`.

## 41. Performance and Supabase Load Controls

The app has had Supabase CPU pressure, so several design decisions intentionally reduce request volume.

### 41.1 Removed Realtime

`rotations_shared_state` was removed from Supabase Realtime publication.

Reason:

- Realtime generated heavy `realtime.list_changes(...)` traffic.
- Supabase `set_config(...)` CPU rose because every API call has request/JWT metadata setup.

Replacement:

- narrow polling,
- live-only polling where possible,
- debounced writes.

### 41.2 Debounced Writes

Rotations and KPI writes are debounced so edit bursts become fewer Supabase writes.

Representative values:

- 750 ms remote save debounce for rotations/KPI.
- 900 ms standalone rotations vault autosave.

### 41.3 Live-Only KPI Remote Sync

KPI remote sync is only needed during Washington/Capital City live games.

Outside those conditions:

- local persistence works,
- remote polling/writes are skipped.

### 41.4 Team Schedule Load Narrowing

The Home page team filter should not fetch every game for every team.

Current strategy:

- static schedule first,
- team-specific cache,
- server function fallback.

### 41.5 Roster Narrowing

Game pages and tools should pass relevant `teamIds` instead of loading all NBA rosters.

### 41.6 Match-Up Preview Removal

The Match-Up Graphic live preview was removed because it was relatively expensive and not essential.

Coverage and Depth Chart previews remain because they are lighter and provide useful immediate feedback.

### 41.7 Vault Limits

Vault reads are limited, currently around 200 records per section by default.

### 41.8 Browser Storage Quota Handling

The Supabase auth storage wrapper evicts known bulky caches and falls back to sessionStorage.

This reduces hard failures when localStorage is full.

## 42. External Data Sources and Reliability Notes

### 42.1 CloudFront Game API

Primary live game source:

```text
https://d1rjt2wyntx8o7.cloudfront.net/api
```

Used for:

- games by date,
- game detail,
- minutes/stints.

### 42.2 NBA Stats

Used for:

- team games fallback,
- analytics reports,
- player/team stat data in Edge Functions.

NBA Stats is often CORS/protection-sensitive. The app usually accesses it through Edge/Vercel functions with browser-like headers.

### 42.3 ESPN

Used for:

- matchup default depth chart lineups.

ESPN is not treated as perfect; the app includes retries/fallbacks and user-editable selections.

### 42.4 Official NBA Referee Assignments

Used for:

- referee assignment display/export.

The page is HTML, so parsing is brittle by nature.

### 42.5 OpenAI

Used only server-side in Edge Functions for:

- game analysis,
- pre-game scouting,
- custom request parsing/answers.

The browser does not hold OpenAI keys.

## 43. Local Storage and Browser Persistence Map

Known keys/prefixes:

| Key / Prefix | Purpose |
| --- | --- |
| `nba-dashboard-auth` | Supabase auth session storage |
| `nbaDash:lastLoginTouch:{userId}` | throttled last-login marker |
| `nba-dashboard:notes` | legacy local notes |
| `nba-dashboard:notes-import:v1:{userId}` | legacy note import state |
| `nba-dashboard:tool-vault:v1:` | local tool vault records |
| `nba-dashboard-season-games:v2:` | cached season games |
| `nba-dashboard-team-season-games:v2:` | cached team season games |
| `rotations:game:v1:{gameId}` | local game rotations |
| `rotations:sections:v1:{teamScope}` | rotations section local state |
| `rotations:{teamScope}:players:v1` | local rotations players |
| `rotations:{teamScope}:depth-template:v1` | local depth template |
| `rotations:{teamScope}:saved-lineups:v1` | local saved lineups |
| `kpis:game:v1:{gameId}` | local KPI state |
| `referee_headshot_overrides_v1` | local referee image overrides |
| `referee_headshot_preferences_v1` | local referee image preferences |
| `nba-dashboard:snapshots:` | game snapshot-related local state |
| `nba-dashboard:alerts-panel:` | alerts panel collapsed state |
| `nba-dashboard:late-game-panel:` | late game panel collapsed state |

Any rebuild should preserve or migrate these carefully if existing users must keep local saved data.

## 44. Testing

### 44.1 Unit Tests

Node test files are under `src/**/*.test.js`.

Examples:

- `src/gameAlerts.test.js`
- `src/gamePolling.test.js`
- `src/gameAnalysis.test.js`
- `src/segmentStats.test.js`
- `src/toolVault.test.js`
- `src/visualDrillGenerator.test.js`
- `src/visualDrillStorage.test.js`
- `src/coverageGraphic.test.js`
- `src/personnelGraphic.test.js`
- `src/analyticsReportPdf.test.js`
- `src/lateGameStrategy.test.js`

`src/gameAlerts.test.js` is the main regression suite for alert count control, duplicate filtering, chronological generation, display-safe timestamps, and coach-facing wording conventions.

Run:

```bash
npm test
```

### 44.2 Edge Function Tests

Deno tests live beside Supabase functions.

Run:

```bash
npm run test:edge
```

### 44.3 Edge Typecheck

Run:

```bash
npm run typecheck
```

### 44.4 Playwright

`playwright.config.js` runs visual tests with accounts disabled.

The dev server command is:

```bash
VITE_ENABLE_ACCOUNTS=false npm run dev -- --host 127.0.0.1 --port 4174
```

E2E tests include:

- matchup graphic preview,
- coverage graphic,
- personnel graphic.

Run:

```bash
npm run test:e2e
```

### 44.5 Full Verify

Run:

```bash
npm run verify
```

This is intentionally heavy and includes build/audit steps.

## 45. Rebuild Guidance

If a team wants to rebuild from scratch, the safest order is:

1. Recreate data contracts before UI.
2. Rebuild Supabase schema/RLS/storage policies.
3. Rebuild auth/profile/feature gating.
4. Rebuild the data API layer and static schedule/NBA Cup merge.
5. Rebuild live game dashboard and segment stats.
6. Rebuild notes/drawings/vault persistence.
7. Rebuild graphics generators.
8. Rebuild rotations last, preserving schema/key compatibility if existing data matters.
9. Rebuild AI Edge Functions and scheduled analysis prewarm.
10. Add performance controls before launch, not after.

### 45.1 Things Not to Break

Especially sensitive compatibility points:

- Rotations local keys.
- Rotations shared scope types.
- Tool vault record types.
- Tool vault payload schemas.
- Visual Drill favorites schema.
- Supabase RLS policies.
- `game_analysis_segments` uniqueness.
- storage owner-folder conventions.
- Auth redirect URL construction under `/nbadash/`.

### 45.2 Biggest Complexity Areas

The most complex modules are:

- `src/pages/Rotations.jsx`
- `src/pages/Game.jsx`
- `src/components/MatchUps.jsx`
- `src/api.js`
- `supabase/functions/custom-requests/index.ts`
- `supabase/functions/game-analysis/index.ts`
- `supabase/functions/nba-analytics-report/index.ts`
- `supabase/functions/pregame-scouting/index.ts`

These are large because they encode years of product decisions, fallback logic, and edge-case handling.

### 45.3 Suggested Future Refactors

These are not required for current operation, but would help a rebuild or long-term maintenance:

- Split `src/api.js` into domain modules:
  - games,
  - schedules,
  - rosters,
  - players,
  - logos/headshots,
  - NBA Cup.
- Split `Rotations.jsx` into:
  - state reducer,
  - persistence adapter,
  - layout/export,
  - version management,
  - UI components.
- Split `Game.jsx` into:
  - dashboard shell,
  - data hooks,
  - analysis modal,
  - alerts panel,
  - stats sections,
  - live state sync.
- Split `custom-requests` Edge Function into smaller modules.
- Move shared basketball calculations into tested pure modules.
- Add runtime logging around remote polling/write skips so Supabase usage can be audited without guessing.
- Add schema version fields to every complex JSON payload.

## 46. Known Operational Risks

### 46.1 External Source Fragility

Public NBA/ESPN/official pages can change shape without notice.

Mitigation:

- Edge Function normalizers.
- static snapshots.
- user-editable fallbacks.
- tests around normalizers.

### 46.2 Supabase CPU

High CPU has historically come from:

- excessive request volume,
- Realtime subscriptions,
- polling too frequently,
- browser tabs left open,
- repeated schema/introspection traffic,
- broad data loads.

Mitigation already in place:

- Realtime removed for shared rotations table.
- narrow polling.
- live-only KPI remote sync.
- debounced writes.
- bounded Vault reads.
- roster/team schedule narrowing.

### 46.3 Browser Storage Quota

Large local cache/payloads can fill browser storage.

Mitigation:

- bounded image uploads,
- cache eviction in Supabase auth storage,
- moving graphics images to Supabase Storage,
- avoiding huge base64 headshots where possible.

### 46.4 Canvas Export CORS

Any remote image drawn directly into a canvas can taint the canvas and break export.

Mitigation:

- use `export-image` proxy for external images.

### 46.5 AI Generated Text

AI analysis/scouting can contain wording issues even with factual prompts.

Mitigation:

- provide detailed factual context,
- cache shared recaps,
- restrict automatic generation to Wizards games,
- update prompt guardrails when specific issues are found.

## 47. File-by-File Functional Index

This index is not every line of code, but it gives a rebuild team a practical source map.

### 47.1 App Shell

| File | Role |
| --- | --- |
| `src/App.jsx` | Routes, auth gates, lazy page loading, update checks |
| `src/main.jsx` | React root, QueryClient, providers |
| `src/styles/global.css` | global styles |
| `src/components/Header.jsx` | top nav, date/game strip, account menu |
| `src/components/AppErrorBoundary.jsx` | app-level error boundary |
| `src/components/AuthGate.jsx` | sign-in UI |
| `src/components/PasswordResetGate.jsx` | password reset UI |
| `src/components/AccessGate.jsx` | access/feature gate UI |

### 47.2 Data and Utilities

| File | Role |
| --- | --- |
| `src/api.js` | basketball API/data layer |
| `src/queries.js` | TanStack Query hooks |
| `src/gamePolling.js` | polling intervals |
| `src/gameRules.js` | league/game rule helpers |
| `src/segmentStats.js` | segment stat calculations |
| `src/utils.js` | general utilities |
| `src/storage.js` | localStorage helpers |
| `src/dataFreshness.js` | freshness labels |
| `src/summerLeagueGameSource.js` | Summer League data handling |
| `src/nbaCup.js` | NBA Cup detection |
| `src/rosterPools.js` | roster pool helpers |

### 47.3 Auth and Account

| File | Role |
| --- | --- |
| `src/authConfig.js` | roles, scopes, feature flags, redirects |
| `src/auth/AuthProvider.jsx` | session/profile state |
| `src/auth/useAuth.js` | auth hook |
| `src/supabaseClient.js` | Supabase client and auth storage |
| `src/accountData.js` | profiles, notes, drawings, invites, RPC wrappers |

### 47.4 Live Game

| File | Role |
| --- | --- |
| `src/pages/Game.jsx` | live game dashboard |
| `src/pages/PlayByPlay.jsx` | play-by-play page |
| `src/pages/Minutes.jsx` | minutes/stints page |
| `src/components/SegmentSelector.jsx` | segment selector |
| `src/components/BoxScoreTable.jsx` | box score table |
| `src/components/AdvancedStatsTable.jsx` | advanced stats |
| `src/components/StatBars.jsx` | stat bar visuals |
| `src/components/KillsTable.jsx` | kills/run table |
| `src/components/MiscStats.jsx` | misc stats |
| `src/components/CreatingDisruption.jsx` | creation/disruption stats |
| `src/components/TransitionStats.jsx` | transition stats |

### 47.5 Alerts and Analysis

| File | Role |
| --- | --- |
| `src/gameAlerts.js` | deterministic alert generation, deduplication, chronological ordering, wording rules |
| `src/components/GameAlerts.jsx` | alerts panel rendering, newest-first display ordering, team logo badges |
| `src/gameAnalysis.js` | analysis UI/range helpers |
| `src/analysisData.js` | calls game-analysis function |

### 47.6 Notes and Drawing

| File | Role |
| --- | --- |
| `src/pages/Notes.jsx` | notes UI |
| `src/notesStorage.js` | legacy local notes |
| `src/noteHelpers.js` | note formatting/helpers |
| `src/pages/Drawing.jsx` | drawing tool |
| `src/components/ShareDialog.jsx` | sharing UI |
| `src/components/VersionHistoryDialog.jsx` | version history UI |

### 47.7 Graphics

| File | Role |
| --- | --- |
| `src/pages/Tools.jsx` | graphics/tools shell |
| `src/toolNavigation.js` | tool tab registry |
| `src/pages/matchupGraphicExport.js` | Match-Up export |
| `src/pages/CoverageGraphicAdmin.jsx` | Coverage UI |
| `src/coverageGraphic.js` | Coverage model/layout |
| `src/pages/coverageGraphicExport.js` | Coverage export |
| `src/pages/PreGame.jsx` | Court Time graphics |
| `src/pages/PersonnelGraphicAdmin.jsx` | Personnel UI |
| `src/personnelGraphic.js` | Personnel model |
| `src/personnelGraphicLayout.js` | Personnel layout helpers |
| `src/pages/personnelGraphicExport.js` | Personnel export |
| `src/pages/DepthChartGraphicAdmin.jsx` | Depth Chart UI |
| `src/pages/depthChartGraphicExport.js` | Depth Chart export |
| `src/graphicHeadshotStorage.js` | custom graphic headshot uploads |
| `src/storedZip.js` | browser ZIP export helpers |

### 47.8 Visual Drill

| File | Role |
| --- | --- |
| `src/pages/VisualDrillGenerator.jsx` | Visual Drill UI |
| `src/visualDrillGenerator.js` | generation logic |
| `src/visualDrillStorage.js` | image upload/compression |

### 47.9 Rotations and KPIs

| File | Role |
| --- | --- |
| `src/pages/Rotations.jsx` | rotations tool |
| `src/pages/Kpis.jsx` | KPI board |
| `src/substitutionUtils.js` | substitutions/stints helpers |

### 47.10 Analytics and Scouting

| File | Role |
| --- | --- |
| `src/pages/AnalyticsReport.jsx` | Analytics Report UI |
| `src/analyticsReportData.js` | report function client |
| `src/analyticsReportPdf.js` | PDF export |
| `src/pregameScoutingData.js` | scouting function client |
| `src/customRequestsData.js` | custom request function client |

### 47.11 Admin and Operations

| File | Role |
| --- | --- |
| `src/pages/Admin.jsx` | admin console |
| `src/matchupProfileData.js` | matchup profiles CRUD |
| `src/operationalHealth.js` | health checks |
| `src/pages/PlayerHeadshotsAdmin.jsx` | player headshot admin |
| `src/pages/RefereeHeadshotsPreview.jsx` | referee headshot admin/preview |
| `src/refereeHeadshots.js` | referee headshot state |
| `src/refereeHeadshotStaticPaths.js` | static referee assets |
| `src/playerHeadshotOverrides.js` | player headshot override state |

## 48. Supabase Migration Index

| File | Purpose |
| --- | --- |
| `supabase/accounts_auth.sql` | account, notes, drawings, tool records, matchup profiles, RLS |
| `supabase/account_data_atomic.sql` | atomic note/drawing/tool save RPCs |
| `supabase/tool_record_save_lock_guard.sql` | advisory lock and timeout guard for tool saves |
| `supabase/rotations_shared_state.sql` | shared rotations/KPI/referee state table |
| `supabase/game_analysis_segments.sql` | shared analysis recap cache |
| `supabase/game_live_state.sql` | compact live game state cache |
| `supabase/roster_feed_snapshots.sql` | service-role roster snapshots |
| `supabase/player_headshots_storage.sql` | player headshot storage bucket/policies |
| `supabase/graphic_headshots_storage.sql` | graphic headshot storage bucket/policies |
| `supabase/visual_drill_images_storage.sql` | Visual Drill image bucket/policies |
| `supabase/wizards_analysis_prewarm_schedule.sql` | Wizards scheduled analysis prewarm jobs |

## 49. Edge Function Deployment Index

Deploy with Supabase CLI from `supabase/functions/*`.

Critical functions for current product:

- `nba-rosters`
- `nba-player-stats`
- `nba-matchup-defaults`
- `nba-analytics-report`
- `game-analysis`
- `wizards-analysis-prewarm`
- `game-live-state`
- `game-metadata`
- `export-image`
- `pregame-scouting`
- `custom-requests`
- `admin-users`
- `gleague-rosters`
- `player-headshot`
- `team-games`

`supabase/DEPLOYMENT.md` lists the minimum SQL and function deployment checklist for the current backend requirements.

## 50. Product Intent by Tool

| Tool | Intended user value |
| --- | --- |
| Live Game Dashboard | Quickly understand game state, stats, events, matchups, alerts, and analysis |
| Alerts | Surface notable trends without needing to scan every box score/play |
| Analysis | Produce shared coach-readable recaps by segment |
| Notes | Capture and share observations tied to game time/events |
| Drawing | Create/share court diagrams |
| Officials | Show/export assigned officials with headshots |
| Match-Ups | Compare players and defensive assignments |
| Late Game Matrix | Recommend late-game strategic choices |
| KPIs | Track selected live metrics visually during games |
| Match-Up Graphic | Export matchup slide graphics |
| Coverage Graphic | Export defensive coverage slide graphics |
| Court Time Graphic | Export pre-game court time graphics |
| Personnel Graphic | Export player personnel/scouting slides |
| Depth Chart Graphic | Export roster/depth chart graphics |
| Visual Drill | Run offline-ready visual reaction drills |
| Rotations | Plan, version, share, and export rotations |
| Analytics Report | Export NBA Stats-based team/player insight PDFs |
| Pre-Game Scouting | Generate admin-only AI scouting packets |
| Custom Requests | Ask flexible basketball/stat questions |
| My Vault | Persist user-created content across sessions |
| Admin | Manage users, access, profiles, and operational data |

## 51. Final Notes for a Rebuild Team

The app's complexity comes less from framework choice and more from accumulated basketball-specific edge cases:

- live vs final games,
- NBA vs G League vs Summer League rules,
- Wizards/Capital City special handling,
- public data source inconsistency,
- browser export limitations,
- offline/local fallback needs,
- Supabase CPU constraints,
- preserving saved user data.

A new implementation should not start by redesigning UI screens. It should first define stable contracts for:

- game objects,
- play-by-play actions,
- segment stat rows,
- notes/drawings,
- tool vault records,
- rotations state,
- graphics drafts,
- analysis segment cache,
- user profile/permission model.

Once those contracts are stable, the UI can be rebuilt with fewer regressions.
