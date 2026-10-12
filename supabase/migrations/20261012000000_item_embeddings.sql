-- ═══════════════════════════════════════════════════════════════════════════
-- Onyx.mx Migration: Semantic Search Item Embeddings
-- Target: Google EmbeddingGemma 2 (768 dimensions, LiteRT-LM on iOS)
-- Season: 826
-- Date: 2026-10-12
-- Idempotent, non-destructive, zero DROPs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Enable pgvector extension
-- ───────────────────────────────────────────────────────────────────────────
create extension if not exists vector;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Create item_embeddings table
--
-- Notes on Dimensions & Matryoshka Representation Learning:
-- The column `embedding` stores the full 768-dimensional vector produced by
-- EmbeddingGemma 2 (740M text+image+audio model via LiteRT-LM).
-- The mobile runtime or client may later slice/prefix-reduce (shorten dimensions
-- e.g. to 256 or 512) and renormalise vectors to minimise memory and network
-- transfer. When smaller representations are adopted, a dedicated column (such as
-- `embedding_compact` or `halfvec`) should be added to store them separately
-- rather than modifying this full-resolution column.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.item_embeddings (
    item_id uuid not null references public.inventory(id) on delete cascade,
    modality text not null check (modality in ('text', 'image', 'audio')),
    embedding vector(768) not null,
    model_version text not null,
    source_hash text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (item_id, modality)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. HNSW Indexes per Modality
--
-- Justification for Partial Indexes vs. Single Index:
-- Queries in Onyx.mx filter by modality ('text', 'image', 'audio') in all
-- operational search paths.
-- 1. Modality Isolation: Vectors across different modalities form distinct
--    distributions. Building separate HNSW proximity graphs avoids cross-modality
--    graph distortion and prevents nearest-neighbor hops through irrelevant media.
-- 2. Recall Safety: An unpartitioned HNSW index combined with a selective WHERE
--    modality = '...' clause suffers from candidate dilution where top-k nodes
--    get filtered out post-scan, yielding fewer results than match_count.
--    Partial indexes ensure every traversed candidate belongs to the target modality.
-- 3. Working-Set Efficiency: Text embeddings represent >90% of interactive search
--    traffic. Maintaining a dedicated partial index allows the text graph to remain
--    resident in Postgres buffer cache without loading image/audio graph nodes.
-- ───────────────────────────────────────────────────────────────────────────
create index if not exists idx_item_embeddings_hnsw_text
    on public.item_embeddings
    using hnsw (embedding vector_cosine_ops)
    where (modality = 'text');

create index if not exists idx_item_embeddings_hnsw_image
    on public.item_embeddings
    using hnsw (embedding vector_cosine_ops)
    where (modality = 'image');

create index if not exists idx_item_embeddings_hnsw_audio
    on public.item_embeddings
    using hnsw (embedding vector_cosine_ops)
    where (modality = 'audio');

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Row-Level Security (RLS)
--
-- Policies mirror the visibility rules of public.inventory:
-- - Read: Authenticated users can read embeddings only if they can read the item.
--   Staff/Client roles (Developer, Admin, ClientBoss, ClientAccounting, ClientViewer, Client)
--   have system-wide read access.
--   Vendors are strictly scoped to items matching their assigned vendor prefix.
--   Service role has unrestricted read access.
-- - Write: Only roles authorized to edit inventory (Developer, Admin) plus
--   the service role may write embeddings.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.item_embeddings enable row level security;

-- Helper functions (SECURITY DEFINER to avoid recursion during RLS evaluation)
create or replace function public.get_my_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.app_users
  where email = lower(auth.jwt() ->> 'email')
    and is_active is not false
  limit 1;
$$;

create or replace function public.get_my_vendor_prefix()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select vendor_prefix
  from public.app_users
  where email = lower(auth.jwt() ->> 'email')
    and is_active is not false
  limit 1;
$$;

-- RLS Read Policy
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'item_embeddings'
          and policyname = 'item_embeddings: read access'
    ) then
        create policy "item_embeddings: read access"
            on public.item_embeddings
            for select
            to authenticated, service_role
            using (
                auth.role() = 'service_role'
                or exists (
                    select 1 from public.inventory i
                    where i.id = item_embeddings.item_id
                      and (
                          public.get_my_app_role() in (
                              'Developer',
                              'Admin',
                              'ClientBoss',
                              'ClientAccounting',
                              'ClientViewer',
                              'Client'
                          )
                          or (
                              public.get_my_app_role() = 'Vendor'
                              and public.get_my_vendor_prefix() is not null
                              and public.get_my_vendor_prefix() <> ''
                              and (
                                  i.vendor_id = public.get_my_vendor_prefix()
                                  or left(i.item_id, length(public.get_my_vendor_prefix()) + 1) = (public.get_my_vendor_prefix() || '-')
                              )
                          )
                      )
                )
            );
    end if;
end $$;

-- RLS Write Policy
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'item_embeddings'
          and policyname = 'item_embeddings: write access'
    ) then
        create policy "item_embeddings: write access"
            on public.item_embeddings
            for all
            to authenticated, service_role
            using (
                auth.role() = 'service_role'
                or public.get_my_app_role() in ('Developer', 'Admin')
            )
            with check (
                auth.role() = 'service_role'
                or public.get_my_app_role() in ('Developer', 'Admin')
            );
    end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Semantic Search RPC Function: match_item_embeddings
--
-- Executes approximate nearest neighbor vector similarity search over item_embeddings.
-- Uses SECURITY INVOKER so caller's RLS policies evaluate automatically on item_embeddings.
-- Includes statement_timeout-safe LIMIT capped at 200 (MAX_LIMIT).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.match_item_embeddings(
    query_embedding vector(768),
    match_count int default 20,
    filter_modality text default 'text'
)
returns table (
    item_id uuid,
    similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
    select
        ie.item_id,
        1 - (ie.embedding <=> query_embedding) as similarity
    from public.item_embeddings ie
    where ie.modality = filter_modality
    order by ie.embedding <=> query_embedding asc
    limit least(greatest(coalesce(match_count, 20), 1), 200);
$$;
