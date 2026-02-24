-- Schema migration: Add workbook tag + lifecycle status fields to inventory
-- Run this in Supabase SQL Editor

-- 1. Add workbook discriminator (825 = legacy/shipped, 326 = active pipeline)
ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS workbook TEXT DEFAULT '826';

-- 2. Add explicit lifecycle status boolean columns
ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS in_production BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ready BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS shipped BOOLEAN DEFAULT FALSE;

-- 3. Tag existing items: bookDASH items (825) have status 'Approved' or 'Paid'/'Shipped'
--    We can distinguish them by item count ranges or sent_date presence.
--    Strategy: items NOT from CA/AN vendors with pay_date set = likely 825 (fully processed).
--    For now, tag everything as '826' and let the re-migration script set this correctly.

-- 4. Add finance status + pay_date columns (for payment tracking)
ALTER TABLE finance
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Requested',
    ADD COLUMN IF NOT EXISTS pay_date TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS destination TEXT,
    ADD COLUMN IF NOT EXISTS vendor_id TEXT;

-- 5. Update existing inventory: derive lifecycle booleans from existing status text
UPDATE inventory SET
    shipped = TRUE,
    paid = TRUE
WHERE pay_date IS NOT NULL;

UPDATE inventory SET
    paid = TRUE
WHERE pay_req = TRUE AND pay_date IS NULL;

-- 6. Create index for performance
CREATE INDEX IF NOT EXISTS idx_inventory_workbook ON inventory(workbook);
CREATE INDEX IF NOT EXISTS idx_inventory_item_id ON inventory(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_shipped ON inventory(shipped);
CREATE INDEX IF NOT EXISTS idx_finance_vendor ON finance(vendor_id);
