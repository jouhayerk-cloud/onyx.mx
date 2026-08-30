-- =============================================================================
-- PENDING APPROVAL — not yet applied.
-- =============================================================================
-- Two changes:
--   1. Consolidate onto a single `inventory` table (inventory_826 is retired;
--      the season lives in `workbook`, which lib/seasons.ts already resolves).
--   2. Move the cost cypher out of the browser and into the database.
--
-- Apply with:  supabase db push       (or paste into the SQL editor)
-- Rollback notes at the bottom.
-- =============================================================================


-- ── 1. Columns the 826 schema had that legacy inventory lacks ────────────────
ALTER TABLE public.inventory
    ADD COLUMN IF NOT EXISTS vendor_id          TEXT,
    ADD COLUMN IF NOT EXISTS generated_type     TEXT,
    ADD COLUMN IF NOT EXISTS vendor_notes       TEXT,
    ADD COLUMN IF NOT EXISTS ocr_raw_text       TEXT,
    ADD COLUMN IF NOT EXISTS translation_status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS book_acquisition   NUMERIC,
    ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ DEFAULT NOW();

-- Backfill vendor_id from the item_id prefix (EM-001 -> EM), so the column is
-- immediately usable for the vendor-scoped access the 826 schema intended.
UPDATE public.inventory
   SET vendor_id = split_part(item_id, '-', 1)
 WHERE vendor_id IS NULL AND item_id LIKE '%-%';

CREATE INDEX IF NOT EXISTS idx_inventory_vendor_id ON public.inventory (vendor_id);
CREATE INDEX IF NOT EXISTS idx_inventory_workbook  ON public.inventory (workbook);


-- ── 2. The cypher, server-side ───────────────────────────────────────────────
-- Previously computed in the browser from a key that shipped in the JS bundle,
-- so anyone holding a printed label could reverse it to acquisition cost. The
-- key now exists only here. SECURITY DEFINER, pinned search_path, and EXECUTE
-- revoked so it cannot be probed through PostgREST.
-- Onyx rounds UP at a fraction of 0.4, not 0.5 (onyxRound in utils.tsx). Using
-- plain floor() or round() produces a different final character and would have
-- rewritten 215 existing barcodes — verified against the live data.
CREATE OR REPLACE FUNCTION public.onyx_round(n NUMERIC)
RETURNS NUMERIC AS $$
    SELECT CASE WHEN $1 - floor($1) >= 0.4 THEN floor($1) + 1 ELSE floor($1) END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.onyx_cypher(n NUMERIC)
RETURNS TEXT AS $$
DECLARE
    key CONSTANT TEXT := 'DMOXHELFAN';   -- replace with a fresh key when rotating
    digits TEXT;
    out TEXT := '';
    i INT;
BEGIN
    IF n IS NULL THEN RETURN NULL; END IF;
    digits := public.onyx_round(n)::TEXT;
    FOR i IN 1..length(digits) LOOP
        out := out || substr(key, (substr(digits, i, 1))::INT + 1, 1);
    END LOOP;
    RETURN out;
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.onyx_cypher(NUMERIC) FROM PUBLIC, anon, authenticated;


-- ── 3. Derive pricing and codes on write ─────────────────────────────────────
-- acquisition USD = price_mxn / rate;  landed = acq * 1.4;  retail = landed * 12
-- Mirrors calculateCodesAndPrices() so stored values match what the app showed.
CREATE OR REPLACE FUNCTION public.inventory_compute_book_fields()
RETURNS TRIGGER AS $$
DECLARE
    rate     NUMERIC := 17.0;
    acq_usd  NUMERIC;
    landed   NUMERIC;
    book_str TEXT;
BEGIN
    BEGIN
        SELECT COALESCE(NULLIF(value #>> '{}', ''), '17.0')::NUMERIC INTO rate
          FROM public.settings WHERE key = 'exchange_rate' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        rate := 17.0;
    END;
    IF rate IS NULL OR rate <= 0 THEN rate := 17.0; END IF;

    IF NEW.price_mxn IS NOT NULL AND NEW.price_mxn > 0 THEN
        acq_usd := round(NEW.price_mxn / rate, 2);
        landed  := round(acq_usd * 1.4, 2);

        NEW.book_acquisition := acq_usd;
        NEW.book_landed      := landed;
        NEW.book_retail      := round(landed * 12, 2);
        NEW.book_aq_code     := public.onyx_cypher(acq_usd);
        NEW.book_land_code   := public.onyx_cypher(landed);

        book_str := regexp_replace(COALESCE(NEW.workbook, 'v326'), '\D', '', 'g');

        -- A barcode that already exists is printed on a physical label somewhere,
        -- so it is never recomputed — only filled in when absent. COALESCE is the
        -- safety net: even a wrong formula cannot desynchronise a printed tag.
        -- To force regeneration, clear book_barcode first.
        NEW.book_barcode := COALESCE(
            NEW.book_barcode,
            COALESCE(NEW.vendor_id, split_part(NEW.item_id, '-', 1), '??')
                || book_str
                || COALESCE(NEW.item_number::TEXT, '1')
                || COALESCE(NEW.book_land_code, '')
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_inventory_book_fields ON public.inventory;
CREATE TRIGGER trg_inventory_book_fields
    BEFORE INSERT OR UPDATE OF price_mxn, workbook, item_number, vendor_id
    ON public.inventory
    FOR EACH ROW EXECUTE FUNCTION public.inventory_compute_book_fields();


-- ── 4. Backfill so every existing row has stored codes ───────────────────────
-- The client will read these instead of computing them, which is what lets the
-- key be removed from the bundle. Touching price_mxn fires the trigger.
--
-- Dry-run against live data before writing this (517 priced rows):
--   with onyx_round  ->  361 barcodes reproduced exactly, 0 changed, 156 filled in
--   with plain floor ->  146 reproduced, 215 CHANGED   <- would have broken labels
-- The COALESCE guard in the trigger makes the 0-changed result structural, not
-- just a property of the formula being right.
UPDATE public.inventory SET price_mxn = price_mxn
 WHERE price_mxn IS NOT NULL AND price_mxn > 0;


-- ── 5. Retire the unused 826 tables ──────────────────────────────────────────
-- All three are empty (0 rows) and nothing writes to them. Run only after the
-- app has stopped referencing them — see getSeasonSources in lib/database.ts.
-- Kept commented so the consolidation above can land independently.
--
-- DROP TABLE IF EXISTS public.inventory_826;
-- DROP TABLE IF EXISTS public.finance_826;
-- DROP TABLE IF EXISTS public.logistics_826;


-- =============================================================================
-- VERIFY AFTER APPLYING
--   SELECT item_id, price_mxn, book_acquisition, book_landed, book_retail,
--          book_aq_code, book_land_code, book_barcode
--     FROM public.inventory WHERE price_mxn > 0 LIMIT 5;
--   -- codes must be non-null, and book_barcode should match the printed labels
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_inventory_book_fields ON public.inventory;
--   DROP FUNCTION IF EXISTS public.inventory_compute_book_fields();
--   DROP FUNCTION IF EXISTS public.onyx_cypher(NUMERIC);
--   -- added columns are additive and safe to leave in place
-- =============================================================================
