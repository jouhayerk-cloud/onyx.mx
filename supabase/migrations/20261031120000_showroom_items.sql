-- 20261031120000_showroom_items.sql
-- Purely additive: creates only the new showroom_items table.
-- Does NOT drop, delete, or alter any existing inventory or production data.

CREATE TABLE IF NOT EXISTS public.showroom_items (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                     text,
  vendor_id                   text NOT NULL,
  status                      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discarded', 'transferred')),
  shape                       text,
  type                        text,
  canonical_type              text,
  material                    text,
  color                       text,
  generated_color             text,
  description                 text,
  detailed_description        text,
  length_cm                   numeric,
  width_cm                    numeric,
  height_cm                   numeric,
  weight_kg                   numeric,
  cost_mxn                    numeric,
  cost_usd                    numeric,
  landed_cost                 numeric,
  retail_price                numeric,
  book_aq_code                text,
  book_land_code              text,
  book_barcode                text,
  media_urls                  text,
  img_clean                   text,
  local_segmentation_masks    text,
  cloud_segmentation_masks    text,
  svg_data                    text,
  contour_points              jsonb,
  notes                       text,
  created_by                  text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  discarded_at                timestamptz,
  transferred_at              timestamptz,
  transferred_to_inventory_id text REFERENCES public.inventory(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS showroom_items_status_idx ON public.showroom_items(status);
CREATE INDEX IF NOT EXISTS showroom_items_vendor_id_idx ON public.showroom_items(vendor_id);
CREATE INDEX IF NOT EXISTS showroom_items_created_at_idx ON public.showroom_items(created_at DESC);
CREATE INDEX IF NOT EXISTS showroom_items_updated_at_idx ON public.showroom_items(updated_at DESC);

CREATE OR REPLACE FUNCTION public.touch_showroom_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'showroom_items_set_updated_at'
  ) THEN
    CREATE TRIGGER showroom_items_set_updated_at
      BEFORE UPDATE ON public.showroom_items
      FOR EACH ROW EXECUTE FUNCTION public.touch_showroom_items_updated_at();
  END IF;
END $$;

ALTER TABLE public.showroom_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'showroom_items' AND policyname = 'showroom_items_authenticated_all'
  ) THEN
    CREATE POLICY showroom_items_authenticated_all
      ON public.showroom_items
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
