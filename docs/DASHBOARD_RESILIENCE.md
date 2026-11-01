# Dashboard availability and reconciliation

Implementation: 2026-11-01. Local branch `fix/dashboard-resilience-20261101`.
These changes are not operational until the frontend, Edge Functions and workflow
are deployed. No account, Notes, Drawings or Rotations migrations are included.

## Availability policy

- A game/segment's last usable public feed can hydrate immediately after reload.
  Cache is at most two entries / 1,200,000 characters total (approximately 2.4 MB
  UTF-16 payload), expires after 72 hours, and writes at most every 30 seconds per
  game/segment. Oversized/quota-blocked writes leave existing storage alone.
  Cache failures do not break loading. No user records or credentials are stored.
  Each game and segment has its own identity; full-game data cannot impersonate Q1.
- Restored data has its original saved timestamp, a visible non-live banner, and
  immediate network revalidation. Query errors retain the snapshot and retry on
  a 30-second interval, including final games. This is not full offline hosting:
  a first visit, unavailable JavaScript assets, or unavailable authentication can
  still prevent loading. Private browsing/storage restrictions can disable cache.
- Primary game requests have an eight-second deadline. The authenticated project
  backend can recover NBA liveData box score + PBP when the primary fails. Public
  CDN requests run server-side to avoid browser CORS restrictions. Optional browser
  officials enrichment has a 1.5-second deadline; it does not inherit an unlimited
  wait. Deadlines include reading response bodies.
- Backup-only responses explicitly map NBA player/team fields and personal vs
  team-inclusive rebounds. They cannot invent API advanced stats. Unsupported
  advanced output, ratings, shot zones, pace/chances and alerts are withheld or
  marked unavailable. Recap generation is paused for backup-only/cached inputs.
  Saved recaps remain readable. Full NBA backup does not cover G League outages.
- Alerts calculation/rendering, Analysis rendering, advanced-stat components,
  box scores, officials and the situation matrix have local failure boundaries.
  A boundary cannot catch an error elsewhere in the parent dashboard's logic.
- Account bootstrap and profile requests have deadlines. Authorization still
  fails closed: this change does not grant offline permissions, trust a cached
  profile after revocation, or bypass Supabase/RLS. A full auth outage remains a
  residual risk, especially in a fresh browser.

## Monitoring and next-day repair

The existing Capture Period Snapshots workflow runs the health check; no additional
polling daemon or all-night collector is added. It checks hosting/entry JavaScript
and usable active Washington/Capital City game feeds when listed by the schedule
API. During the 08:00 Eastern run it also reconciles up to six tracked finals from
the latest three dates. GitHub cron can be delayed: this is not a guaranteed
real-time alert service. Warnings, failed workflow status, job summary and seven-day
JSON artifacts expose degraded/unavailable sources. GitHub notification preferences
determine who is notified; no email/SMS destination has been configured here.

The snapshot job and existing Washington analysis reconciliation use validated
alternate PBP if the primary omits it. They preserve primary statistical fields
only when primary/backup scores agree. Final alternate PBP must match NBA's final
box score. Completed quarter snapshots must reconcile cumulative scores. Saved
analysis signatures decide whether existing completed recaps need refreshing;
backup-only analysis is refused. No new model-generation schedule was introduced.

An available backup is recovery, not proof that NBA repaired the primary source.
If both sources remain incomplete, repair fails visibly and retries on subsequent
scheduled runs. This does not certify every custom statistic or every historical
game; the separate calculation audit is still unfinished.

Read-only check on 2026-11-01: `0022600015` primary omitted PBP; NBA fallback had
624 events and eight verified cumulative team/quarter snapshots. No database
records or saved analyses were changed by that diagnostic run.

## Verification

Run unit, Edge and browser suites, lint, Edge type checks, manifest check and build
budget before deployment. Outage fixtures cover reload persistence, wrong game/
segment isolation, quota/size/expiry, empty fallback, alternate source mismatch,
primary HTTP failure, hung optional requests, and section-render exceptions.
The monitoring script's successful score/period check is not a full statistical
audit, an AI claim audit, or a browser-auth availability test.
