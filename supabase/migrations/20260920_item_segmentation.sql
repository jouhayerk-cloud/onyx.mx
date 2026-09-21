-- item_segmentation: real segmentation output, persisted at last.
--
-- WHY THIS TABLE EXISTS
--
-- The wizard has always computed genuine segmentation -- removeBackground into a
-- binary mask, findContour, simplifyContour, then generatePngAndSvgFromMasks
-- producing both an RGBA cutout and SVG path data. None of it was ever stored.
-- It was assigned to `op.result.cloudSegmentationMasks`, and there is no
-- cloud_segmentation_masks column in Postgres and no such field in the RxDB
-- schema. A comment in BatchProcessingWizard records the consequence: sending it
-- failed the whole update with 42703, so the payload was redirected into
-- spatial_masks instead.
--
-- That redirect is why spatial_masks holds `{"angle_N": [{"mask": <url>}]}`
-- pointing at full-frame RGB JPEGs with no alpha channel. Those files are the
-- AI background-REPLACEMENT renders from the default 'bgreplace' (STUDIO) mode,
-- which deliberately short-circuits the entire mask path. generated_png_url is
-- assigned the very same variable, which is why it is byte-identical to
-- angle_0 on all 109 rows that have one.
--
-- So segmentation and background cleaning are given separate homes here.
-- Background cleaning keeps writing processed_media_urls / generated_png_url
-- exactly as it does today; this table is additive and touches none of it.
--
-- Deliberately a separate table rather than columns on inventory: that keeps the
-- 497-row inventory collection at RxDB schema version 18, avoiding a migration
-- on the largest synced collection. It also lets one item carry segmentation for
-- several source images, which the multi-angle photography already produces.

create table if not exists public.item_segmentation (
  id                  uuid primary key default gen_random_uuid(),

  -- text, NOT uuid. inventory.id is a text column whose values merely look like
  -- UUIDs; a uuid foreign key here fails with 42804 "incompatible types".
  item_id             text not null references public.inventory(id) on delete cascade,

  -- Which photograph this segmentation was derived from, and its position in the
  -- item's angle sequence. Stored so a re-run can tell "already done" from
  -- "source image changed", which spatial_masks could never express.
  source_image_url    text,
  angle_index         integer not null default 0,

  -- Both vector forms, on purpose. The SVG path is what the vector editor and
  -- the export pipeline consume; the raw points are what the 3D mesh generators
  -- need. Recovering points from a smoothed quadratic-bezier path is lossy at
  -- exactly the step that can least afford it, so neither is derived from the
  -- other. createCurvePath(points) regenerates the SVG when only points exist.
  svg_data            text,
  contour_points      jsonb,

  -- Drive file id of the RGBA cutout from generatePngAndSvgFromMasks. A file id
  -- rather than a URL, matching how the app addresses Drive elsewhere and
  -- leaving the URL form to the client.
  cutout_png_file_id  text,

  -- Pixel dimensions of the source image the points are expressed against.
  -- Without these the normalised coordinates cannot be mapped back.
  image_width         integer,
  image_height        integer,

  -- Which processing mode produced this: 'local' | 'cloud' | 'hybrid'.
  -- 'bgreplace' never appears here -- it performs no segmentation at all.
  method              text,

  generated_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- One segmentation per item per angle; a re-run updates in place.
  unique (item_id, angle_index)
);

create index if not exists item_segmentation_item_id_idx
  on public.item_segmentation (item_id);

-- RxDB pulls on updated_at, so it needs to be ordered and indexed.
create index if not exists item_segmentation_updated_at_idx
  on public.item_segmentation (updated_at);

create or replace function public.touch_item_segmentation_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists item_segmentation_set_updated_at on public.item_segmentation;
create trigger item_segmentation_set_updated_at
  before update on public.item_segmentation
  for each row execute function public.touch_item_segmentation_updated_at();

alter table public.item_segmentation enable row level security;

-- Reads for any signed-in user, matching how inventory itself is read.
-- Anonymous access is closed, consistent with the security migrations that
-- previously locked down the core tables.
drop policy if exists item_segmentation_select_authenticated on public.item_segmentation;
create policy item_segmentation_select_authenticated
  on public.item_segmentation
  for select
  to authenticated
  using (true);

-- The wizard writes these from the browser as the signed-in user.
drop policy if exists item_segmentation_write_authenticated on public.item_segmentation;
create policy item_segmentation_write_authenticated
  on public.item_segmentation
  for all
  to authenticated
  using (true)
  with check (true);
