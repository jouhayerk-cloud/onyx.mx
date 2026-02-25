-- Onyx.mx Schema v4: Extended Finance & Logistics
-- Adds subcategories for financial tracking and full shipping lifecycle

-- ═══════════════════════════════════════════════════════════════════
-- FINANCE TABLE EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE finance ADD COLUMN IF NOT EXISTS subcategory TEXT;
-- Values: 'Acquisition', 'Monthly Expense', 'Supplies', 'Labor', 'Crate/Pallet', 'Operating'

ALTER TABLE finance ADD COLUMN IF NOT EXISTS reference TEXT;
-- Invoice or PO number

ALTER TABLE finance ADD COLUMN IF NOT EXISTS payment_method TEXT;
-- Wire, Cash, Check, Direct Deposit

ALTER TABLE finance ADD COLUMN IF NOT EXISTS bank_account TEXT;
-- BOA, BBVA-R, BBVA-M

ALTER TABLE finance ADD COLUMN IF NOT EXISTS commission NUMERIC DEFAULT 0;

ALTER TABLE finance ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC;

ALTER TABLE finance ADD COLUMN IF NOT EXISTS requested_by TEXT;

ALTER TABLE finance ADD COLUMN IF NOT EXISTS approved_by TEXT;

ALTER TABLE finance ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE finance ADD COLUMN IF NOT EXISTS related_inventory_ids TEXT;
-- Comma-separated inventory IDs

ALTER TABLE finance ADD COLUMN IF NOT EXISTS recurring BOOLEAN DEFAULT FALSE;

ALTER TABLE finance ADD COLUMN IF NOT EXISTS recurring_day INTEGER;

ALTER TABLE finance ADD COLUMN IF NOT EXISTS date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- ═══════════════════════════════════════════════════════════════════
-- LOGISTICS TABLE EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE logistics ADD COLUMN IF NOT EXISTS origin TEXT;

ALTER TABLE logistics ADD COLUMN IF NOT EXISTS destination_address TEXT;

ALTER TABLE logistics ADD COLUMN IF NOT EXISTS contents_summary TEXT;

ALTER TABLE logistics ADD COLUMN IF NOT EXISTS insurance_value NUMERIC;

ALTER TABLE logistics ADD COLUMN IF NOT EXISTS customs_status TEXT DEFAULT 'Pending';
-- Pending, Cleared, Rejected

ALTER TABLE logistics ADD COLUMN IF NOT EXISTS pallet_count INTEGER DEFAULT 0;

ALTER TABLE logistics ADD COLUMN IF NOT EXISTS crate_count INTEGER DEFAULT 0;

ALTER TABLE logistics ADD COLUMN IF NOT EXISTS freight_cost NUMERIC DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════
-- NEW INDICES
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_finance_subcategory ON finance(subcategory);
CREATE INDEX IF NOT EXISTS idx_finance_date ON finance(date);
CREATE INDEX IF NOT EXISTS idx_finance_recurring ON finance(recurring) WHERE recurring = TRUE;
CREATE INDEX IF NOT EXISTS idx_logistics_status ON logistics(status);
CREATE INDEX IF NOT EXISTS idx_logistics_customs ON logistics(customs_status);
