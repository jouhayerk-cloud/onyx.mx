# Onyx.mx Database Schema Reference

## Tables

### inventory
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NOT NULL | Primary key |
| item_id | TEXT | | Vendor-prefixed code (e.g., EM-001) |
| item_number | INT | | Sequential number within vendor |
| vendor_id | TEXT | | Extracted vendor prefix |
| workbook | TEXT | | v326 (active) or v825 (archive) |
| status | TEXT | | Lifecycle status (computed dynamically) |
| shape | TEXT | | Physical shape (Bowl, Canoe, Mirror, etc.) |
| material | TEXT | | Material type (Onyx, Marble, Stone) |
| color | TEXT | | Raw vendor color string |
| description | TEXT | | Base description |
| short_description | TEXT | | AI-generated single sentence |
| generated_description | TEXT | | AI bullet-point description |
| detailed_description | TEXT | | AI marketing HTML (1000-1200 chars) |
| generated_color | TEXT | | AI-classified Shopify palette colors |
| generated_type | TEXT | | AI Shopify taxonomy category |
| price_mxn | NUMERIC | | Vendor price in MXN |
| book_acquisition | NUMERIC | | Calculated: price_mxn / exchangeRate |
| book_landed | NUMERIC | | Calculated: acquisition * 1.4 |
| book_retail | NUMERIC | | Calculated: landed * 12 |
| book_barcode | TEXT | | Deterministic barcode |
| book_aq_code | TEXT | | Acquisition cypher code |
| book_land_code | TEXT | | Landed cost cypher code |
| quantity | INT | | Item count |
| weight_kg | NUMERIC | | Weight in kg |
| height_cm | NUMERIC | | Height in cm |
| width_cm | NUMERIC | | Width in cm |
| length_cm | NUMERIC | | Length/depth in cm |
| media_urls | JSONB | | Array of media URLs |
| image_urls | JSONB | | Legacy image URL array |
| drive_ids | JSONB | | Google Drive file IDs |
| spatial_boxes_2d | JSONB | | AI 2D bounding boxes |
| spatial_masks | JSONB | | AI segmentation masks |
| spatial_boxes_3d | JSONB | | 3D bounding volumes |
| crate_id | TEXT | | Assigned shipping crate |
| invoice_id | TEXT | | Linked invoice |
| pay_req | TEXT | | Payment request status |
| created_at | TIMESTAMPTZ | | Record creation |
| updated_at | TIMESTAMPTZ | | Last modification |

### finance
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| amount | NUMERIC | Payment amount |
| currency | TEXT | Currency (default: MXN) |
| type | TEXT | Merchandise or Operations |
| category | TEXT | Acq, Prod, Sppl, Labr, Packing, Oprt, Monthly |
| subcategory | TEXT | Sub-classification |
| payment_method | TEXT | Method of payment |
| bank_account | TEXT | Source account |
| commission | NUMERIC | Transaction fee |
| exchange_rate | NUMERIC | MXN/USD rate at payment time |
| related_ids | JSONB | Linked inventory item IDs |
| created_at | TIMESTAMPTZ | Payment date |

### logistics
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| type | TEXT | Crate or Pallet |
| vendors | JSONB | Vendor origins |
| truck_id | TEXT | Truck identifier |
| customs_status | TEXT | Customs clearance status |
| freight_cost | NUMERIC | Shipping cost |
| tracking_number | TEXT | Carrier tracking |
| inventory_ids | JSONB | Contained item IDs |
| dimensions | JSONB | Crate dimensions |
| weight | NUMERIC | Total weight |

### production
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| vendor_id | TEXT | Manufacturing vendor |
| progress | NUMERIC | Completion % |
| stage | TEXT | Production stage |
| price_unit | NUMERIC | Unit price |
| ready_date | DATE | Expected completion |

### app_users
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK (linked to Supabase Auth) |
| email | TEXT | User email |
| role | TEXT | Developer/Admin/ClientBoss/ClientAccounting/ClientViewer/Vendor |
| active | BOOLEAN | Account active status |

### settings
| Column | Type | Description |
|--------|------|-------------|
| key | TEXT | PK (setting name) |
| value | JSONB | Setting value |

## RLS Policies
- inventory, finance, production, logistics: Permissive (USING true)
- app_users: Restrictive (own row + Admin/Dev override)
- settings: Read all, Write Admin/Dev only
