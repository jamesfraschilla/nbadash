# Supabase deployment checklist

The application changes in this repository depend on database and Edge Function changes that must be deployed to the same Supabase project used by the frontend.

## SQL Editor

Run these idempotent scripts in the Supabase SQL Editor:

1. `account_data_atomic.sql` — atomic note/drawing saves and sharing, drawing version snapshots, and tool-vault revision checks.
2. `graphic_headshots_storage.sql` — the bounded PNG bucket and owner-scoped Storage policies for custom graphic headshots.
3. `roster_feed_snapshots.sql` — service-role-only last-known-good NBA and G League roster snapshots.

## Edge Functions

Deploy the current repository versions of:

- `nba-rosters` — bounded global deadline and partial team results.
- `nba-player-stats` — nullable statistics and partial player results.
- `game-metadata` — one authenticated, bounded metadata batch for the Vault.

The `game-metadata` function must keep JWT verification enabled, as configured in `config.toml`.

## Verification

After deployment, confirm:

- `nba-rosters` returns in roughly 15 seconds or less, even when one upstream team request is slow.
- a tool-vault record save returns a positive `revision`.
- a second save made with an outdated revision returns `TOOL_RECORD_CONFLICT`.
- an authenticated user can upload a PNG under `graphic-headshots/<user-id>/...`, but cannot write into another user's folder.
