-- Onyx.mx Unified Schema v3 (Consolidated for all Workbook Tabs)

-- 1. Master Inventory
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id TEXT, -- Vendor (e.g., EM, JM)
    item_number TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    
    -- Product Details
    shape TEXT,
    material TEXT,
    color TEXT,
    description TEXT,
    short_description TEXT,
    detailed_description TEXT,
    
    -- Dimensions & Weight
    width_cm NUMERIC,
    height_cm NUMERIC,
    length_cm NUMERIC,
    weight_kg NUMERIC,
    
    -- Pricing
    price_mxn NUMERIC,
    
    -- Media & AI
    media_urls TEXT,
    generated_png_url TEXT,
    spatial_boxes_2d JSONB,
    spatial_points JSONB,
    spatial_masks JSONB,
    
    -- Status & Workflow (Lifecycle)
    status TEXT DEFAULT 'Draft',
    workbook TEXT DEFAULT '326', -- '825' or '326'
    in_production BOOLEAN DEFAULT FALSE,
    ready BOOLEAN DEFAULT FALSE,
    paid BOOLEAN DEFAULT FALSE,
    shipped BOOLEAN DEFAULT FALSE,
    pay_req BOOLEAN DEFAULT FALSE,
    pay_date TIMESTAMP WITH TIME ZONE,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Finance & Payments (Consolidated for Log, PayLog, Expenses, Supplies)
CREATE TABLE IF NOT EXISTS finance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount NUMERIC,
    currency TEXT DEFAULT 'USD',
    type TEXT, -- Payment, Expense, Supply, Labor
    category TEXT, -- Vendor Payment, Logistics, Supplies, General
    description TEXT,
    status TEXT DEFAULT 'Requested', -- Requested, Paid, Rejected
    pay_date TIMESTAMP WITH TIME ZONE,
    destination TEXT, -- BOA, BBVA-R, BBVA-M
    vendor_id TEXT, 
    related_ids UUID[], -- Array of inventory IDs
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Production Orders (Detailed items from -Production sheet)
CREATE TABLE IF NOT EXISTS production (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id TEXT,
    tag_id TEXT, -- Tag ID from Excel
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

-- 4. Logistics (Consolidated for -Crates, -TRK)
CREATE TABLE IF NOT EXISTS logistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date TIMESTAMP WITH TIME ZONE,
    vendor_id TEXT,
    item_type TEXT, -- Crate, Pallet, Box
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
    status TEXT DEFAULT 'Warehouse', -- Warehouse, In Transit, Delivered
    inventory_ids UUID[], 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_inventory_workbook ON inventory(workbook);
CREATE INDEX IF NOT EXISTS idx_inventory_item_id ON inventory(item_id);
CREATE INDEX IF NOT EXISTS idx_finance_vendor ON finance(vendor_id);
CREATE INDEX IF NOT EXISTS idx_finance_status ON finance(status);

-- RLS
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance ENABLE ROW LEVEL SECURITY;
ALTER TABLE production ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON finance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON production FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON logistics FOR ALL USING (true) WITH CHECK (true);
