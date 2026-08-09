-- Schedules the Wizards-only shared Analysis prewarmer.
--
-- Prerequisites:
-- 1. Deploy the `wizards-analysis-prewarm` Edge Function.
-- 2. Store these secrets in Supabase Vault:
--    - nba_dash_project_url: https://<project-ref>.supabase.co
--    - nba_dash_service_role_key: <service role key>
--
-- The job runs once per minute during the broad NBA game window in UTC.
-- The Edge Function is still conservative: it only processes live or recently
-- final Washington Wizards games and skips already cached segments.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wizards-analysis-prewarm') then
    perform cron.unschedule('wizards-analysis-prewarm');
  end if;
end
$$;

select cron.schedule(
  'wizards-analysis-prewarm',
  '* 16-23,0-9 * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'nba_dash_project_url'
      limit 1
    ) || '/functions/v1/wizards-analysis-prewarm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'nba_dash_service_role_key'
        limit 1
      ),
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'nba_dash_service_role_key'
        limit 1
      )
    ),
    body := jsonb_build_object('source', 'pg_cron')
  );
  $$
);
