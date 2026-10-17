-- Publish note changes so an open View Notes page can update without polling.
-- This changes publication metadata only; no saved notes or shares are modified.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_notes'
  ) then
    alter publication supabase_realtime add table public.user_notes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_note_shares'
  ) then
    alter publication supabase_realtime add table public.user_note_shares;
  end if;
end;
$$;
