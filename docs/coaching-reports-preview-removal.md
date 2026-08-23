# Coaching Reports Preview Removal

This is a temporary authenticated preview route for the separate Coaching Report Dashboard prototype.

To remove it cleanly:

1. Delete `src/features/coachingReportsPreview/`.
2. Remove the `CoachingReportsPreview` lazy import from `src/App.jsx`.
3. Remove the `/coaching-reports-preview` route from `src/App.jsx`.
4. Remove the `Coaching Reports Preview` dropdown link from `src/components/Header.jsx`.
5. Delete this file.

No Supabase, NBA API, Looker, or live-data cleanup is required. The preview uses embedded sample data and isolated local assets only.
