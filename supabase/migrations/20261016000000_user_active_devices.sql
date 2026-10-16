-- =============================================================================
-- Migration: 20261016000000_user_active_devices.sql
-- Subagent ADM-T1: Database & Low-Load Presence Architect
--
-- Creates the user_active_sessions table, performance indexes, RLS policies,
-- and low-load ping_user_presence RPC function with UPSERT semantics.
-- =============================================================================

begin;

-- ── 1. Create user_active_sessions Table ──────────────────────────────────────
create table if not exists public.user_active_sessions (
  session_id       text primary key,
  user_id          uuid references auth.users(id) on delete cascade,
  user_email       text,
  user_name        text,
  device_name      text not null default 'Unknown Device',
  device_type      text not null default 'desktop' check (device_type in ('desktop', 'mobile', 'tablet', 'edge_relay')),
  client_platform  text not null default 'Unknown' check (client_platform in ('Windows', 'iOS', 'macOS', 'Linux', 'Android', 'Unknown')),
  browser          text,
  ip_address       text,
  current_view     text not null default 'welcome',
  last_action      text not null default 'Session initialized',
  is_idle          boolean not null default false,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- ── 2. Performance & Query Indexes ───────────────────────────────────────────
create index if not exists idx_user_active_sessions_user_id
  on public.user_active_sessions (user_id);

create index if not exists idx_user_active_sessions_last_seen_at
  on public.user_active_sessions (last_seen_at desc);

create index if not exists idx_user_active_sessions_device_type
  on public.user_active_sessions (device_type);

create index if not exists idx_user_active_sessions_platform
  on public.user_active_sessions (client_platform);

-- ── 3. Row Level Security (RLS) ──────────────────────────────────────────────
alter table public.user_active_sessions enable row level security;

-- Drop existing policies if re-running
drop policy if exists user_active_sessions_select on public.user_active_sessions;
drop policy if exists user_active_sessions_insert_own on public.user_active_sessions;
drop policy if exists user_active_sessions_update_own on public.user_active_sessions;
drop policy if exists user_active_sessions_delete_own on public.user_active_sessions;

-- Admins and Developers can view all sessions; users can view their own sessions
create policy user_active_sessions_select on public.user_active_sessions
  for select to authenticated
  using (
    user_id = auth.uid()
    or coalesce(public.get_my_app_role(), '') in ('Developer', 'Admin')
  );

-- Authenticated users can insert their own session
create policy user_active_sessions_insert_own on public.user_active_sessions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or user_id is null
  );

-- Authenticated users can update their own session
create policy user_active_sessions_update_own on public.user_active_sessions
  for update to authenticated
  using (
    user_id = auth.uid()
    or user_id is null
    or coalesce(public.get_my_app_role(), '') in ('Developer', 'Admin')
  )
  with check (
    user_id = auth.uid()
    or user_id is null
    or coalesce(public.get_my_app_role(), '') in ('Developer', 'Admin')
  );

-- Authenticated users can remove their session (e.g. On explicit logout)
create policy user_active_sessions_delete_own on public.user_active_sessions
  for delete to authenticated
  using (
    user_id = auth.uid()
    or coalesce(public.get_my_app_role(), '') in ('Developer', 'Admin')
  );

-- Table Grants
grant select, insert, update, delete on table public.user_active_sessions to authenticated;
grant select on table public.user_active_sessions to anon;

-- ── 4. Low-Load Presence RPC Function ─────────────────────────────────────────
-- Handles upsert logic and auto-resolves user context (email, name, client IP)
create or replace function public.ping_user_presence(
  p_session_id      text,
  p_device_name     text,
  p_device_type     text,
  p_client_platform text,
  p_browser         text,
  p_current_view    text,
  p_last_action     text,
  p_is_idle         boolean,
  p_user_id         uuid default null,
  p_user_email      text default null,
  p_user_name       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text := p_user_email;
  v_user_name text := p_user_name;
  v_ip text;
  v_headers json;
begin
  -- If auth.uid() is null but p_user_id was provided, verify it exists in auth.users
  if v_user_id is null and p_user_id is not null then
    if exists (select 1 from auth.users where id = p_user_id) then
      v_user_id := p_user_id;
    end if;
  end if;

  -- Resolve email from JWT if authenticated and not explicitly passed
  if v_user_id is not null and v_user_email is null then
    v_user_email := auth.jwt() ->> 'email';
  end if;

  -- Attempt to resolve display name from app_users
  if v_user_email is not null and (v_user_name is null or v_user_name = '') then
    select u.display_name, coalesce(v_user_email, u.email)
      into v_user_name, v_user_email
      from public.app_users u
     where lower(u.email) = lower(v_user_email)
     limit 1;
  end if;

  -- Fallback name to user_metadata or email handle
  if v_user_name is null or v_user_name = '' then
    if v_user_id is not null then
      v_user_name := coalesce(
        auth.jwt() -> 'user_metadata' ->> 'full_name',
        auth.jwt() -> 'user_metadata' ->> 'name'
      );
    end if;

    if (v_user_name is null or v_user_name = '') and v_user_email is not null then
      v_user_name := split_part(v_user_email, '@', 1);
    end if;
  end if;

  -- Extract client IP from PostgREST request headers
  begin
    v_headers := current_setting('request.headers', true)::json;
    v_ip := coalesce(
      v_headers ->> 'cf-connecting-ip',
      split_part(v_headers ->> 'x-forwarded-for', ',', 1),
      v_headers ->> 'x-real-ip'
    );
  exception when others then
    v_ip := null;
  end;

  if v_ip is null then
    begin
      v_ip := inet_client_addr()::text;
    exception when others then
      v_ip := null;
    end;
  end if;

  -- UPSERT into user_active_sessions
  insert into public.user_active_sessions (
    session_id,
    user_id,
    user_email,
    user_name,
    device_name,
    device_type,
    client_platform,
    browser,
    ip_address,
    current_view,
    last_action,
    is_idle,
    last_seen_at,
    created_at
  ) values (
    p_session_id,
    v_user_id,
    v_user_email,
    v_user_name,
    coalesce(p_device_name, 'Unknown Device'),
    coalesce(p_device_type, 'desktop'),
    coalesce(p_client_platform, 'Unknown'),
    p_browser,
    v_ip,
    coalesce(p_current_view, 'welcome'),
    coalesce(p_last_action, 'Active'),
    coalesce(p_is_idle, false),
    now(),
    now()
  )
  on conflict (session_id) do update set
    user_id         = coalesce(excluded.user_id, user_active_sessions.user_id),
    user_email      = coalesce(excluded.user_email, user_active_sessions.user_email),
    user_name       = coalesce(excluded.user_name, user_active_sessions.user_name),
    device_name     = excluded.device_name,
    device_type     = excluded.device_type,
    client_platform = excluded.client_platform,
    browser         = excluded.browser,
    ip_address      = coalesce(excluded.ip_address, user_active_sessions.ip_address),
    current_view    = excluded.current_view,
    last_action     = excluded.last_action,
    is_idle         = excluded.is_idle,
    last_seen_at    = now();
end;
$$;

-- Grant EXECUTE to authenticated and anon (fallback)
grant execute on function public.ping_user_presence(
  text, text, text, text, text, text, text, boolean, uuid, text, text
) to authenticated, anon;

commit;
