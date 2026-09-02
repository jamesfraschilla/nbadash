# App Audit Deferred Fixes

These items were identified in the September 2026 audit but intentionally deferred behind the current hardening pass.

## Maintainability

- Split large page modules into smaller route, data, table, modal, and control components:
  - `src/pages/Game.jsx`
  - `src/pages/Tools.jsx`
  - `src/pages/Officiating.jsx`
  - `src/api.js`
- Move shared table, metric-card, modal, and filter-bar behavior into reusable components.
- Keep sport/calculation normalization logic in shared tested helpers rather than page components.

## Live Game Reliability

- Move live game state writes to a true backend single-writer path before peak season usage.
- Add live dashboard query/fetch timing instrumentation.
- Add a live-game protection switch that can pause heavy historical/reporting tools during Wizards games if Supabase CPU spikes.

## Historical Data Strategy

- Before adding more prior seasons, keep historical backfills offline/admin-only.
- Continue converting high-cost materialized refresh paths into season-scoped physical rollup tables.
- Refresh only the affected season after an import/backfill, especially once `2026-27` data arrives daily.

## UI System

- Reduce oversized data-tool hero/header space and prioritize filters/tables above the fold.
- Standardize table density, header alignment, numeric alignment, and profile modal scroll behavior across Officiating, PGR, and core dashboard pages.
- Add Playwright visual smoke tests for Officiating tabs/profile modals and live game dashboards.

## Security/Access

- Complete a Supabase RLS review for non-Officiating shared-state tables, especially any table with public insert/update policies.
- Keep private team data behind authenticated access and expose only deliberately public static assets without authentication.
