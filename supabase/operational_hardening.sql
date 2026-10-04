create table if not exists public.edge_request_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  function_name text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, function_name, window_start)
);

alter table public.edge_request_rate_limits enable row level security;

create or replace function public.consume_edge_request_limit(
  p_user_id uuid,
  p_function_name text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_user_id is null or coalesce(trim(p_function_name), '') = ''
    or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.edge_request_rate_limits(user_id, function_name, window_start, request_count)
  values (p_user_id, p_function_name, v_window, 1)
  on conflict (user_id, function_name, window_start)
  do update set request_count = public.edge_request_rate_limits.request_count + 1
  returning request_count into v_count;

  delete from public.edge_request_rate_limits
  where window_start < clock_timestamp() - interval '2 days';

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_edge_request_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_edge_request_limit(uuid, text, integer, integer) to service_role;

create table if not exists public.supabase_deployment_state (
  id boolean primary key default true check (id),
  manifest_sha256 text not null,
  deployed_at timestamptz not null default now(),
  deployed_by text not null default 'unknown'
);

alter table public.supabase_deployment_state
add column if not exists database_sha256 text;

alter table public.supabase_deployment_state
add column if not exists edge_sha256 text;

alter table public.supabase_deployment_state enable row level security;
revoke all on public.supabase_deployment_state from public, anon, authenticated;
grant select, insert, update on public.supabase_deployment_state to service_role;
