# Project Instructions

- For the current NBA API endpoints, credentials, and data-source inventory, read `docs/NBA_DATA_SOURCES.md`. Older handoff documents may describe the pre-migration CloudFront feed.
- Rotations data for Washington and Capital City is live production state.
- Do not change Rotations storage keys, Supabase scope keys, payload schemas, default hydration behavior, or fallback behavior in ways that can overwrite, hide, reset, or orphan existing Washington or Capital City saved charts unless it is strictly necessary and unavoidable.
- If a Rotations data migration is required, it must be backward compatible and preserve existing Washington and Capital City data.

## Production operations and accuracy work

- Before investigating production health, scheduled ingestion, officiating records, or dashboard calculations, read `ops/runbook.json` and the current Dashboard Operations Monitor reports and open `[Operations]` GitHub issues. Do not rely on an earlier chat's completion claims.
- Distinguish a successful job from a verified import, a source omission from an incorrect stored statistic, and a review flag from an assigned adjudication. Verify document fingerprints, row/completion counts, refreshed caches, and affected individual/team records before declaring a repair complete.
- The monitor does not authorize unattended production repairs or deployments. Preserve manual decisions, annotations, and stable record IDs; add regression coverage and verify repairs before using existing deployment authority.
