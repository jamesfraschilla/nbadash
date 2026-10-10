# Supabase deployment checklist

The application changes in this repository depend on database and Edge Function changes that must be deployed to the same Supabase project used by the frontend.

## SQL Editor

`supabase/deployment-manifest.json` is the authoritative, checksummed deployment inventory. Run `npm run supabase:manifest:check` before every deployment. Any added or changed SQL script or Edge Function makes verification fail until `npm run supabase:manifest:update` is run and the updated manifest is reviewed and committed.

The manifest hashes complete deployable function bundles, including shared modules and JSON data—not only `index.ts`. Changes under `supabase/` on `main` trigger `.github/workflows/deploy-supabase.yml`. The workflow refuses to deploy if database scripts do not match the separately attested production database checksum, then deploys every Edge Function and records its checksum. Apply intentional SQL changes in manifest order and run `node scripts/verify-supabase-production.mjs --record-database` before pushing. Run `npm run supabase:production:check` with service-role credentials to detect repository/production drift independently.

The challenge foul subtype correction is idempotent and is applied by the deployment workflow before the database checksum is attested. The workflow records that checksum only after the Management API confirms the SQL request succeeded.

Run the database scripts in the exact order recorded by the manifest. Do not deploy only the abbreviated list below; it is descriptive rather than exhaustive.

1. `account_data_atomic.sql` — atomic note/drawing saves and sharing, note/drawing conflict revisions, drawing version snapshots, and tool-vault revision checks.
2. `graphic_headshots_storage.sql` — the bounded PNG bucket and owner-scoped Storage policies for custom graphic headshots.
3. `roster_feed_snapshots.sql` — service-role-only last-known-good NBA and G League roster snapshots.
4. `game_analysis_segments.sql` — shared cached game-segment analysis recaps.
5. `wizards_analysis_prewarm_schedule.sql` — schedules Wizards-only shared Analysis recap prewarming. Before running it, store `nba_dash_project_url` and `nba_dash_service_role_key` in Supabase Vault.

## Edge Functions

Deploy every Edge Function recorded by the manifest. The functions below are the most operationally sensitive examples:

- `nba-rosters` — bounded global deadline and partial team results.
- `nba-player-stats` — nullable statistics and partial player results.
- `game-metadata` — one authenticated, bounded metadata batch for the Vault.
- `game-analysis` — shared Analysis generation and cached segment recaps.
- `wizards-analysis-prewarm` — scheduled Wizards-only shared Analysis recap preparation.

The `game-metadata` function must keep JWT verification enabled, as configured in `config.toml`.
The `wizards-analysis-prewarm` function must keep JWT verification enabled and should be called by the scheduled SQL job with the service-role bearer token.

## Verification

After deployment, confirm:

- `nba-rosters` returns in roughly 15 seconds or less, even when one upstream team request is slow.
- a tool-vault record save returns a positive `revision`.
- a second save made with an outdated revision returns `TOOL_RECORD_CONFLICT`.
- stale note and drawing saves return `NOTE_CONFLICT` and `DRAWING_CONFLICT` instead of overwriting newer edits.
- an authenticated user can upload a PNG under `graphic-headshots/<user-id>/...`, but cannot write into another user's folder.
