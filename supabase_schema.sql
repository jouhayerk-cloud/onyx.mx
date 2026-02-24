-- Onyx.mx Unified Schema (Fresh Start)
DROP TABLE IF EXISTS finance CASCADE;
DROP TABLE IF EXISTS logistics CASCADE;
DROP TABLE IF EXISTS production CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- 1. Settings Table (For Exchange Rate, Prefixes, etc.)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (key, value) VALUES ('exchange_rate', '18.0'::jsonb) ON CONFLICT DO NOTHING;

-- 2. Master Inventory Table
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
    
    -- Media (Images in Google Drive)
    media_urls TEXT, -- Comma separated or JSON array
    generated_png_url TEXT,
    
    -- Spatial/AI Data
    spatial_boxes_2d JSONB,
    spatial_points JSONB,
    spatial_masks JSONB,
    
    -- Status & Workflow
    status TEXT DEFAULT 'Draft', -- Draft, Approved, Paid, Shipped, Delivered
    pay_req BOOLEAN DEFAULT FALSE,
    pay_date TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Row Level Security (Permissive for migration)
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON inventory FOR ALL USING (true) WITH CHECK (true);

-- 3. Production Tracking Table
CREATE TABLE IF NOT EXISTS production (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
    stage TEXT, -- Carving, Sanding, Polishing, Packing
    progress NUMERIC DEFAULT 0,
    notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Logistics & Shipping Table
CREATE TABLE IF NOT EXISTS logistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_ids UUID[], -- Array of items in this crate/shipment
    type TEXT, -- Crate, Shipment, Parcel
    tracking_number TEXT,
    carrier TEXT,
    status TEXT, -- In Transit, Customs, Delivered
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Finance & Payments Table
CREATE TABLE IF NOT EXISTS finance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount NUMERIC,
    currency TEXT DEFAULT 'USD',
    type TEXT, -- Payment, Expense, Fee
    category TEXT, -- Vendor Payment, Logistics, Supplies
    description TEXT,
    related_ids UUID[], -- Linked inventory items
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_production_updated_at BEFORE UPDATE ON production FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_logistics_updated_at BEFORE UPDATE ON logistics FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_finance_updated_at BEFORE UPDATE ON finance FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
