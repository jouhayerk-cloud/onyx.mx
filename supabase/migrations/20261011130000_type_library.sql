-- DRAFT: NOT APPLIED. Ramses reviews and applies this by hand.
-- 2026-10-11 - type_library and attribute_hidden_values: the Type library of the Add Entry selector. Additive only.
-- Decisions (Ramses, 2026-10-09): the selector keys on TYPE only; Shape is a free sub group or description. The library
-- is the canonical Types found in the inventory (src/lib/canonicalType.ts) plus the Types saved here, and the hidden
-- values (person names that are never suggested but stay in the data). Developer and Admin write, every signed-in
-- user reads.
begin;

create table if not exists public.type_library (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,
  norm_key    text generated always as (
                lower(regexp_replace(btrim(type), '\s+', ' ', 'g'))
              ) stored,
  aliases     text[] not null default '{}',
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint type_library_key unique (norm_key),
  constraint type_library_not_blank check (btrim(type) <> '')
);

comment on table public.type_library is 'Types saved by hand for the Add Entry selector. One row per normalised Type. Types found in the inventory are not stored here.';
comment on column public.type_library.id is 'Row id.';
comment on column public.type_library.type is 'Type as typed, collapsed and trimmed, then Title Case by the normalise trigger.';
comment on column public.type_library.norm_key is 'Generated: lower case Type with collapsed spaces. Unique, so one Type is one row.';
comment on column public.type_library.aliases is 'Other spellings of this Type, folded onto it by the selector. Empty by default.';
comment on column public.type_library.created_by is 'Auth user who saved the Type. Set null if the user is deleted.';
comment on column public.type_library.created_at is 'When the Type was saved.';

create table if not exists public.attribute_hidden_values (
  id          uuid primary key default gen_random_uuid(),
  value       text not null,
  norm_key    text generated always as (
                lower(regexp_replace(btrim(value), '\s+', ' ', 'g'))
              ) stored,
  note        text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint attribute_hidden_values_key unique (norm_key),
  constraint attribute_hidden_values_not_blank check (btrim(value) <> '')
);

comment on table public.attribute_hidden_values is 'Values that the Add Entry selector never suggests (person names). The inventory keeps them; only the suggestions skip them.';
comment on column public.attribute_hidden_values.id is 'Row id.';
comment on column public.attribute_hidden_values.value is 'The value as typed, collapsed and trimmed. Matched case-insensitively through norm_key.';
comment on column public.attribute_hidden_values.norm_key is 'Generated: lower case value with collapsed spaces. Unique, so one value is one row.';
comment on column public.attribute_hidden_values.note is 'Why the value is hidden, for example: person name, hide from suggestions.';
comment on column public.attribute_hidden_values.created_by is 'Auth user who hid the value. Set null if the user is deleted.';
comment on column public.attribute_hidden_values.created_at is 'When the value was hidden.';

-- ── Normalise on write: collapse spaces, trim, Title Case (no dependency on any other function) ──
create or replace function public.type_library_normalise() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.type := initcap(regexp_replace(btrim(new.type), '\s+', ' ', 'g'));
  return new;
end $$;

drop trigger if exists type_library_normalise on public.type_library;
create trigger type_library_normalise
  before insert or update on public.type_library
  for each row execute function public.type_library_normalise();

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.type_library enable row level security;
alter table public.attribute_hidden_values enable row level security;

drop policy if exists type_library_select on public.type_library;
create policy type_library_select on public.type_library for select to authenticated
  using (true);

drop policy if exists type_library_insert on public.type_library;
create policy type_library_insert on public.type_library for insert to authenticated
  with check (public.get_my_app_role() in ('Developer', 'Admin'));

drop policy if exists type_library_update on public.type_library;
create policy type_library_update on public.type_library for update to authenticated
  using (public.get_my_app_role() in ('Developer', 'Admin'))
  with check (public.get_my_app_role() in ('Developer', 'Admin'));

drop policy if exists type_library_delete on public.type_library;
create policy type_library_delete on public.type_library for delete to authenticated
  using (public.get_my_app_role() in ('Developer', 'Admin'));

drop policy if exists attribute_hidden_values_select on public.attribute_hidden_values;
create policy attribute_hidden_values_select on public.attribute_hidden_values for select to authenticated
  using (true);

drop policy if exists attribute_hidden_values_insert on public.attribute_hidden_values;
create policy attribute_hidden_values_insert on public.attribute_hidden_values for insert to authenticated
  with check (public.get_my_app_role() in ('Developer', 'Admin'));

drop policy if exists attribute_hidden_values_update on public.attribute_hidden_values;
create policy attribute_hidden_values_update on public.attribute_hidden_values for update to authenticated
  using (public.get_my_app_role() in ('Developer', 'Admin'))
  with check (public.get_my_app_role() in ('Developer', 'Admin'));

drop policy if exists attribute_hidden_values_delete on public.attribute_hidden_values;
create policy attribute_hidden_values_delete on public.attribute_hidden_values for delete to authenticated
  using (public.get_my_app_role() in ('Developer', 'Admin'));

-- ── Grants: RLS decides who may write; anon gets nothing ──
revoke all on public.type_library from anon;
revoke all on public.attribute_hidden_values from anon;
grant select on public.type_library to authenticated;
grant insert, update, delete on public.type_library to authenticated;
grant select on public.attribute_hidden_values to authenticated;
grant insert, update, delete on public.attribute_hidden_values to authenticated;

-- ── Example, NOT executed. Hides one person name from the suggestions (the inventory keeps it). ──
-- insert into public.attribute_hidden_values (value, note) values ('<a person name as it appears in Shape>', 'person name, hide from suggestions');

commit;

-- ── ROLLBACK (run by hand only if this migration must be undone; drops the saved Types and the hidden values) ──
-- begin;
-- drop trigger if exists type_library_normalise on public.type_library;
-- drop function if exists public.type_library_normalise();
-- drop table if exists public.attribute_hidden_values;
-- drop table if exists public.type_library;
-- commit;
