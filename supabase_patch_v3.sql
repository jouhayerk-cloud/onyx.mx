-- Onyx.mx Schema Patch v3 (Run this to fix "column does not exist" errors)

-- 1. Patch Inventory Table
ALTER TABLE inventory 
    ADD COLUMN IF NOT EXISTS workbook TEXT DEFAULT '326',
    ADD COLUMN IF NOT EXISTS in_production BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ready BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS shipped BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pay_req BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pay_date TIMESTAMP WITH TIME ZONE;

-- Rename price_mxn if it was price in older versions (Optional, but v3 uses price_mxn)
-- ALTER TABLE inventory RENAME COLUMN price TO price_mxn; 

-- 2. Patch Finance Table
ALTER TABLE finance
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Requested',
    ADD COLUMN IF NOT EXISTS pay_date TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS destination TEXT,
    ADD COLUMN IF NOT EXISTS vendor_id TEXT;

-- 3. Ensure Production Table exists with all columns
CREATE TABLE IF NOT EXISTS production (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id TEXT,
    tag_id TEXT,
    description TEXT,
    price_unit NUMERIC,
    quantity NUMERIC,
    total NUMERIC,
    advance NUMERIC,
    progress NUMERIC,
    ready_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'Active',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Ensure Logistics Table exists with all columns
CREATE TABLE IF NOT EXISTS logistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date TIMESTAMP WITH TIME ZONE,
    vendor_id TEXT,
    item_type TEXT,
    description TEXT,
    quantity NUMERIC,
    weight_kg NUMERIC,
    weight_lbs NUMERIC,
    l_cm NUMERIC,
    w_cm NUMERIC,
    d_cm NUMERIC,
    dims_info TEXT,
    cost_mxn NUMERIC,
    tracking_number TEXT,
    carrier TEXT,
    status TEXT DEFAULT 'Warehouse',
    inventory_ids UUID[], 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Re-apply Indices (now that columns definitely exist)
CREATE INDEX IF NOT EXISTS idx_inventory_workbook ON inventory(workbook);
CREATE INDEX IF NOT EXISTS idx_inventory_item_id ON inventory(item_id);
CREATE INDEX IF NOT EXISTS idx_finance_vendor ON finance(vendor_id);
CREATE INDEX IF NOT EXISTS idx_finance_status ON finance(status);
