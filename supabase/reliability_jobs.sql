-- Isolated operational schedules. No saved notes, rotations or table schemas change.
begin;
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'nba_dash_project_url' and decrypted_secret <> '')
    or not exists (select 1 from vault.decrypted_secrets where name = 'nba_dash_service_role_key' and decrypted_secret <> '') then
    raise exception 'Operational schedules require the existing NBA Dashboard Vault credentials.';
  end if;
end $$;

-- UTC alternatives plus an Eastern-hour predicate handle DST. Unlike GitHub
-- runner queues, pg_cron dispatches this scan at 9:03 Eastern every day.
select cron.schedule('referee-assignments-daily', '3 13,14 * * *', $job$
  select net.http_get(url := (
    select decrypted_secret from vault.decrypted_secrets where name = 'nba_dash_project_url' limit 1
  ) || '/functions/v1/referee-assignments?refresh=1', timeout_milliseconds := 20000)
  where extract(hour from now() at time zone 'America/New_York') = 9;
$job$);
select cron.schedule('referee-assignments-retry', '8 13,14 * * *', $job$
  select net.http_get(url := (
    select decrypted_secret from vault.decrypted_secrets where name = 'nba_dash_project_url' limit 1
  ) || '/functions/v1/referee-assignments?refresh=1', timeout_milliseconds := 20000)
  where extract(hour from now() at time zone 'America/New_York') = 9;
$job$);

-- The generated season schedule starts with regular-season games. Fill only
-- the preseason gap, and perform a morning reconciliation of recent finals.
select cron.schedule('wizards-analysis-preseason', '*/5 16-23,0-8 1-20 10 *', $job$
  select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'nba_dash_project_url' limit 1) || '/functions/v1/wizards-analysis-prewarm',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nba_dash_service_role_key' limit 1)),
    body := '{"source":"preseason-reconciliation"}'::jsonb, timeout_milliseconds := 60000);
$job$);
select cron.schedule('wizards-analysis-final-reconciliation', '17,22,27,32 12,13 * * *', $job$
  select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name = 'nba_dash_project_url' limit 1) || '/functions/v1/wizards-analysis-prewarm',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nba_dash_service_role_key' limit 1)),
    body := '{"source":"final-reconciliation"}'::jsonb, timeout_milliseconds := 60000)
  where extract(hour from now() at time zone 'America/New_York') = 8;
$job$);
commit;
select jobname, schedule, active from cron.job
where jobname in ('referee-assignments-daily', 'referee-assignments-retry', 'wizards-analysis-preseason', 'wizards-analysis-final-reconciliation')
order by jobname;
