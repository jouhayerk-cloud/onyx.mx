-- DRAFT: NOT APPLIED. Ramses applies this by hand after review.
-- 2026-10-11 - siri_tokens table for iPhone Shortcut tokens. Additive only.
begin;

create table public.siri_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- app_users.id is NOT the auth user id in this project (rows match by email), so the token remembers its app_users row
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  label text not null default 'iPhone' check (char_length(label) between 1 and 40),
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null default now() + interval '180 days',
  revoked_at timestamptz
);

create index siri_tokens_user_id_idx on public.siri_tokens (user_id);

alter table public.siri_tokens enable row level security;

revoke all on public.siri_tokens from anon, authenticated;

grant select (id, user_id, app_user_id, label, token_prefix, created_at, last_used_at, expires_at, revoked_at)
  on public.siri_tokens to authenticated;

create policy siri_tokens_select on public.siri_tokens for select to authenticated
  using (user_id = auth.uid());

commit;
