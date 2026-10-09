-- DRAFT: NOT APPLIED. Ramses applies migrations.
-- 2026-10-04 - document_jobs ledger. Additive only. No existing object is altered or dropped.
begin;

create table public.document_jobs (
  id                   uuid primary key default gen_random_uuid(),
  job_ref              text not null unique,
  kind                 text not null check (kind in ('xlsx','pdf','label','csv')),
  template_id          text not null,
  template_version     text not null,
  season               text not null check (season in ('826','legacy')),
  workbook             text check (workbook in ('v826','v825','v326')),
  manifest_id          text,                 -- shipments.manifest_id (no FK: shipments.manifest_id not known unique)
  crate_logistics_id   text,                 -- logistics.id / logistics_826.id (no FK: two source tables)
  batch_id             text,
  parameters           jsonb not null default '{}'::jsonb,
  data_snapshot        jsonb,
  hash_version         smallint not null default 1,
  data_hash            text not null check (data_hash <> ''),
  output_sha256        text check (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$'),
  output_bytes         bigint check (output_bytes is null or output_bytes >= 0),
  file_name            text,
  channel              text,
  parent_job_id        uuid references public.document_jobs(id),
  legacy_print_job_id  text references public.print_jobs(id),
  app_version          text,
  created_by           uuid not null default auth.uid(),
  created_by_label     text,
  client_created_at    timestamptz,
  created_at           timestamptz not null default now()
);

create table public.document_job_events (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.document_jobs(id),
  status      text not null check (status in ('requested','rendered','printed','downloaded','reprinted','void')),
  at          timestamptz not null default now(),
  by          uuid not null default auth.uid(),
  output_sha256 text check (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$'),
  detail      jsonb not null default '{}'::jsonb
);

create table public.document_job_items (
  job_id              uuid not null references public.document_jobs(id),
  inventory_id        text not null,
  season              text not null check (season in ('826','legacy')),
  tag_id              text,
  item_ref            text,
  crate_logistics_id  text,
  copies              integer not null default 1 check (copies >= 0),
  primary key (job_id, inventory_id)
);

create index document_jobs_season_kind_created_idx on public.document_jobs (season, kind, created_at desc);
create index document_jobs_manifest_idx            on public.document_jobs (manifest_id) where manifest_id is not null;
create index document_jobs_crate_idx               on public.document_jobs (crate_logistics_id) where crate_logistics_id is not null;
create index document_jobs_parent_idx              on public.document_jobs (parent_job_id) where parent_job_id is not null;
create index document_jobs_created_by_idx          on public.document_jobs (created_by);
create unique index document_jobs_legacy_pj_uidx   on public.document_jobs (legacy_print_job_id) where legacy_print_job_id is not null;
create index document_job_events_job_idx           on public.document_job_events (job_id, at desc);
create index document_job_items_inv_idx            on public.document_job_items (inventory_id, season);

-- latest status per job
create view public.document_jobs_current with (security_invoker = true) as
select j.*, e.status as current_status, e.at as status_at
from public.document_jobs j
left join lateral (
  select status, at from public.document_job_events
  where job_id = j.id order by at desc, id desc limit 1
) e on true;

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.document_jobs       enable row level security;
alter table public.document_job_events enable row level security;
alter table public.document_job_items  enable row level security;

create policy dj_select on public.document_jobs for select to authenticated
  using (public.get_my_app_role() in ('Developer','Admin') or created_by = auth.uid());
create policy dj_insert on public.document_jobs for insert to authenticated
  with check (created_by = auth.uid());

create policy dje_select on public.document_job_events for select to authenticated
  using (exists (select 1 from public.document_jobs j where j.id = job_id
         and (public.get_my_app_role() in ('Developer','Admin') or j.created_by = auth.uid())));
create policy dje_insert on public.document_job_events for insert to authenticated
  with check (by = auth.uid() and exists (select 1 from public.document_jobs j where j.id = job_id
         and (public.get_my_app_role() in ('Developer','Admin') or j.created_by = auth.uid())));

create policy dji_select on public.document_job_items for select to authenticated
  using (exists (select 1 from public.document_jobs j where j.id = job_id
         and (public.get_my_app_role() in ('Developer','Admin') or j.created_by = auth.uid())));
create policy dji_insert on public.document_job_items for insert to authenticated
  with check (exists (select 1 from public.document_jobs j where j.id = job_id and j.created_by = auth.uid()));

-- ── Append-only: no UPDATE/DELETE policies, plus hard guard even for admins ──
revoke update, delete, truncate on public.document_jobs, public.document_job_events, public.document_job_items from anon, authenticated;

create function public.document_jobs_block_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'document ledger is append-only (% on %)', tg_op, tg_table_name;
end $$;

create trigger document_jobs_append_only
  before update or delete on public.document_jobs
  for each row execute function public.document_jobs_block_mutation();
create trigger document_job_events_append_only
  before update or delete on public.document_job_events
  for each row execute function public.document_jobs_block_mutation();
create trigger document_job_items_append_only
  before update or delete on public.document_job_items
  for each row execute function public.document_jobs_block_mutation();

commit;
