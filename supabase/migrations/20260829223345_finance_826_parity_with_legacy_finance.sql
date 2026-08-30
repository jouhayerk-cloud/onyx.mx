-- Bring finance_826 to parity with the legacy finance table so the Finance module
-- can run against the 826 season without code changes.
-- Safe to run against an empty table: finance_826 had 0 rows when this was applied.

-- 1. Columns finance has that finance_826 was missing.
ALTER TABLE public.finance_826
    ADD COLUMN IF NOT EXISTS date                  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS status                TEXT DEFAULT 'Requested',
    ADD COLUMN IF NOT EXISTS requested_by          TEXT,
    ADD COLUMN IF NOT EXISTS approved_by           TEXT,
    ADD COLUMN IF NOT EXISTS sent_at               TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dispersed_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pay_date              TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS destination           TEXT,
    ADD COLUMN IF NOT EXISTS vendor_id             TEXT,
    ADD COLUMN IF NOT EXISTS reference             TEXT,
    ADD COLUMN IF NOT EXISTS description           TEXT,
    ADD COLUMN IF NOT EXISTS notes                 TEXT,
    ADD COLUMN IF NOT EXISTS related_inventory_ids TEXT,
    ADD COLUMN IF NOT EXISTS recurring             BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS recurring_day         INTEGER,
    ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- 2. related_ids was jsonb here but text[] in finance. Align it so the same client
--    code and PostgREST filters work against both tables.
ALTER TABLE public.finance_826 DROP COLUMN IF EXISTS related_ids;
ALTER TABLE public.finance_826 ADD COLUMN related_ids TEXT[];

-- 3. Mirror the indexes that exist on finance.
CREATE INDEX IF NOT EXISTS idx_finance_826_date        ON public.finance_826 (date);
CREATE INDEX IF NOT EXISTS idx_finance_826_vendor      ON public.finance_826 (vendor_id);
CREATE INDEX IF NOT EXISTS idx_finance_826_subcategory ON public.finance_826 (subcategory);
CREATE INDEX IF NOT EXISTS idx_finance_826_recurring   ON public.finance_826 (recurring) WHERE recurring = true;

-- 4. Keep updated_at current, reusing the trigger function inventory_826 already uses.
DROP TRIGGER IF EXISTS update_finance_826_modtime ON public.finance_826;
CREATE TRIGGER update_finance_826_modtime
    BEFORE UPDATE ON public.finance_826
    FOR EACH ROW
    EXECUTE FUNCTION public.update_modified_column_826();
