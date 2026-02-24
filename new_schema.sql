-- Onyx.mx Unified Schema v4 (Aligned with Legacy Google Sheets)
-- This script drops existing tables and recreates them with the structure mapped in database.md

-- 1. Master Inventory
DROP TABLE IF EXISTS inventory CASCADE;
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    item_id TEXT, -- Vendor ID (e.g., EM, JM)
    item_number INTEGER,
    created_by TEXT,
    acquired_by TEXT, -- Email of the Admin/Client who acquired it
    acquired_at TIMESTAMPTZ,
    status TEXT DEFAULT 'Draft', -- 'Draft', 'Catalog', 'Acquired', 'Paid', 'Shipped'
    shape TEXT,
    material TEXT,
    description TEXT,
    color TEXT,
    quantity INTEGER DEFAULT 1,
    price_mxn NUMERIC,
    weight_kg NUMERIC,
    height_cm NUMERIC,
    width_cm NUMERIC,
    length_cm NUMERIC,
    media_urls TEXT,
    short_description TEXT,
    detailed_description TEXT,
    generated_png_url TEXT,
    generated_svg_url TEXT,
    spatial_boxes_2d JSONB,
    spatial_points JSONB,
    spatial_masks JSONB,
    pay_req BOOLEAN DEFAULT FALSE,
    pay_date TIMESTAMPTZ,
    shipped BOOLEAN DEFAULT FALSE,
    workbook TEXT DEFAULT '326', -- '326' (Active) or '825' (Archive)
    crate_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Finance
DROP TABLE IF EXISTS finance CASCADE;
CREATE TABLE finance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    type TEXT, -- 'Payment', 'Withdrawal', 'Recurring', 'Invoice', 'Expense'
    category TEXT, -- Logistics, Labor, Supplies, Monthly, Crates, Pallets, Laborers
    amount NUMERIC,
    commission NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    bank_account TEXT, -- 'Ramses BBVA', 'Martha BBVA', 'BOA', 'Direct Client Wire'
    status TEXT DEFAULT 'Requested', -- 'Requested', 'Sent', 'Dispersed'
    requested_by TEXT, -- Email of the Admin who requested
    sent_at TIMESTAMPTZ,
    dispersed_at TIMESTAMPTZ,
    destination TEXT,
    vendor_id TEXT,
    related_ids UUID[], -- Array of inventory IDs
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Production
DROP TABLE IF EXISTS production CASCADE;
CREATE TABLE production (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id TEXT,
    tag_id TEXT,
    description TEXT,
    price_unit NUMERIC,
    quantity NUMERIC,
    total NUMERIC,
    advance NUMERIC,
    progress NUMERIC DEFAULT 0,
    ready_date TIMESTAMPTZ,
    status TEXT DEFAULT 'Active',
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Logistics
DROP TABLE IF EXISTS logistics CASCADE;
CREATE TABLE logistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT, -- Crate, Pallet, Box
    vendors TEXT, -- List of vendors in the container
    length_cm NUMERIC,
    width_cm NUMERIC,
    height_cm NUMERIC,
    weight_kg NUMERIC,
    truck_id TEXT,
    truck_position TEXT,
    ship_date TIMESTAMPTZ,
    status TEXT DEFAULT 'Warehouse',
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Settings
DROP TABLE IF EXISTS settings CASCADE;
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance ENABLE ROW LEVEL SECURITY;
ALTER TABLE production ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics ENABLE ROW LEVEL SECURITY;

-- Basic Policies (Allow all for now, to be refined if needed)
CREATE POLICY "Allow all for inventory" ON inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for finance" ON finance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for production" ON production FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for logistics" ON logistics FOR ALL USING (true) WITH CHECK (true);

-- Indices
CREATE INDEX idx_inventory_workbook ON inventory(workbook);
CREATE INDEX idx_inventory_item_id ON inventory(item_id);
CREATE INDEX idx_finance_vendor ON finance(vendor_id);
CREATE INDEX idx_logistics_status ON logistics(status);
