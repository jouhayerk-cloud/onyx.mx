-- DRAFT: NOT APPLIED. Ramses applies this by hand after review.
-- 2026-10-10 - onyxchan_audit ledger for MCP bridge invocations. Additive only.
-- Retention: none, rows are kept forever.
begin;

create table public.onyxchan_audit (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),
  at           timestamptz not null default now(),
  direction    text not null check (direction in ('in', 'out')),
  tool         text not null check (tool <> ''),
  risk         text not null check (risk in ('read', 'navigate', 'robot', 'write', 'unknown')),
  request_id   text not null check (request_id <> ''),
  caller_role  text not null check (caller_role in ('voice', 'staff-device', 'staff', 'agent', 'gateway')),
  app_role     text check (app_role is null or app_role in ('Developer', 'Admin', 'ClientBoss', 'ClientAccounting', 'ClientViewer', 'Vendor', 'Client')),
  device_id    text,
  outcome      text not null check (outcome in ('ok', 'denied', 'invalid', 'rate_limited', 'declined', 'error', 'timeout', 'killed')),
  code         text,
  duration_ms  integer not null check (duration_ms >= 0),
  args_summary text not null default '',
  source       text,                       -- 'app' (bridge client) or 'edge' (onyx-mcp device_command_tools)
  command_id   text,                       -- JSON-RPC uuid reused as the command id for robot commands
  confirmed    boolean not null default false,   -- the user pressed the confirm card for this call
  created_at   timestamptz not null default now()
);

create index onyxchan_audit_user_created_idx on public.onyxchan_audit (user_id, created_at desc);
create index onyxchan_audit_created_idx      on public.onyxchan_audit (created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.onyxchan_audit enable row level security;

create policy onyxchan_audit_select on public.onyxchan_audit for select to authenticated
  using (user_id = auth.uid() or public.get_my_app_role() in ('Developer', 'Admin'));

create policy onyxchan_audit_insert on public.onyxchan_audit for insert to authenticated
  with check (user_id = auth.uid());

-- ── Append-only: no UPDATE/DELETE policies, plus hard guard even for admins ──
revoke update, delete, truncate on public.onyxchan_audit from anon, authenticated;

create function public.onyxchan_audit_block_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'onyxchan_audit is append-only (% on %)', tg_op, tg_table_name;
end $$;

create trigger onyxchan_audit_append_only
  before update or delete on public.onyxchan_audit
  for each row execute function public.onyxchan_audit_block_mutation();

commit;
