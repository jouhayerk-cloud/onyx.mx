---
name: OnyxMXExpert
description: "Index of Onyx.mx domain knowledge (schema, pricing, inventory, exports, AI pipeline, logistics, hardware). Read it to pick the one OnyxMX-* sub-skill the task needs, then load only that one."
---

# OnyxMXExpert Skill

## When to Activate

Use this skill whenever the task involves:
- Modifying or debugging the Onyx.mx application (`c:\Jouhayerk\git\app`)
- Working with Supabase database schema or queries
- Understanding or modifying pricing calculations (Landed Cost, Acquisition Cost, Retail Price)
- Inventory attribute management (Vendor, Shape, Color, Material, Type, Sizes)
- AI processing pipeline (Gemini descriptions, color classification, segmentation)
- Shopify export format (Matrixify XLSX generation)
- PDF catalog or shipping document generation
- Warehouse, crate packing, or trucking logistics
- Offline-first sync architecture (RxDB ↔ Supabase)
- Dashboard analytics or financial tracking

> **Scope**: This skill covers **codebase analysis only**. For operational guidance, see separate skills for logistics management and AI pipeline optimization (planned).

## Sub-Skill Architecture

This skill is organized into 4 domain-specific sub-skills. Read the relevant sub-skill for deep context on a specific area:

| Sub-Skill | Path | Activate When |
|-----------|------|---------------|
| **OnyxMX-DatabasePricing** | [`SKILL.md`](file:///c:/Jouhayerk/skills/OnyxMX-DatabasePricing/SKILL.md) | Modifying DB schema, SQL migrations, pricing formulas, exchange rates, sync issues, RLS policies |
| **OnyxMX-InventoryAttributes** | [`SKILL.md`](file:///c:/Jouhayerk/skills/OnyxMX-InventoryAttributes/SKILL.md) | Product attributes, vendors, shapes, colors, materials, sizes, AI classification, workbook versioning |
| **OnyxMX-WorkbookExports** | [`SKILL.md`](file:///c:/Jouhayerk/skills/OnyxMX-WorkbookExports/SKILL.md) | XLSX generation, Shopify Matrixify export, PDF catalogs, shipping documents, ExcelJS |
| **OnyxMX-AdminFinanceLogistics** | [`SKILL.md`](file:///c:/Jouhayerk/skills/OnyxMX-AdminFinanceLogistics/SKILL.md) | User management, payments, warehouse ops, trucking, dashboards, analytics |
| **OnyxMX-ArchitecturePlatform** | [`SKILL.md`](file:///c:/Jouhayerk/skills/OnyxMX-ArchitecturePlatform/SKILL.md) | App infrastructure, components, theming, i18n, PWA, 3D, build/deployment |
| **OnyxMX-LogisticsManagement** | [`SKILL.md`](file:///c:/Jouhayerk/skills/OnyxMX-LogisticsManagement/SKILL.md) | Hard logistics rules — truck weight limit, crate-vs-pallet cutoff, manifests |
| **OnyxMX-AIPipelineOptimization** | [`SKILL.md`](file:///c:/Jouhayerk/skills/OnyxMX-AIPipelineOptimization/SKILL.md) | Gemini prompts, masking pipeline, batch translation safety |
| **OnyxMX-PicoHardware** | [`SKILL.md`](file:///c:/Jouhayerk/skills/OnyxMX-PicoHardware/SKILL.md) | ESP32/M5Stack devices, firmware builds, hidden PicoBridge module, role→hardware mapping |
| **OnyxMX-OnyxChanMCP** | [`SKILL.md`](file:///c:/Jouhayerk/skills/OnyxMX-OnyxChanMCP/SKILL.md) | App↔device transports, the 14-tool MCP contract, local servers, known disconnects |

> All sub-skills listed above now exist. The hardware arm is split in two on purpose:
> **OnyxMX-PicoHardware** for devices and firmware, **OnyxMX-OnyxChanMCP** for everything
> between the app and the device (transports, MCP, servers) — that boundary is where the
> current integration defects live.

## Application Overview

**Onyx.mx** is a comprehensive, offline-first web application for managing the lifecycle of rare earth stone products (Mexican Onyx and Marble) in cross-border commerce between Mexico and the United States.

### Technology Stack
| Domain | Technology |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite 7 |
| State | Jotai (atomic global state) |
| Styling | Tailwind CSS v4 |
| Local DB | RxDB + IndexedDB (Dexie) |
| Remote DB | Supabase (PostgreSQL) |
| AI | Google Gemini over REST through `src/lib/ai/` (job → model map in `src/lib/ai/models.ts`) |
| 3D | Three.js |
| Export | jsPDF, ExcelJS |
| Animations | GSAP |

### Key Directories
```
c:\Jouhayerk\git\app\
├── src/
│   ├── main.tsx                    # App entry point
│   ├── components/                 # Shared UI components
│   │   ├── DataSyncProvider.tsx    # RxDB ↔ Supabase sync wrapper
│   │   ├── InventoryForm.tsx       # Deep product data entry
│   │   └── ExportWizard.tsx        # XLSX/PDF catalog generation
│   ├── features/
│   │   ├── auth/                   # Authentication & roles
│   │   ├── catalog/                # Product browsing & detail views
│   │   ├── control/                # Admin panel & user management
│   │   ├── create/                 # Product creation workflows
│   │   ├── dashboard/              # KPIs & ECharts analytics
│   │   ├── finance/                # Payment tracking & expenses
│   │   ├── inventory/              # Inventory management
│   │   ├── logistics/              # Warehouse, crates, trucking
│   │   ├── market/                 # Marketplace exports
│   │   ├── onyx/                   # AI chat (Gemini-powered)
│   │   ├── pico/                   # Hardware IoT (ESP32/M5Stack)
│   │   ├── process/                # AI batch processing pipeline
│   │   ├── store/                  # E-commerce/Shopify integration
│   │   ├── threed/                 # Three.js 3D visualization
│   │   ├── upload/                 # Media upload pipeline
│   │   ├── viewer/                 # Gallery, QR/barcode scanner
│   │   ├── welcome/                # Onboarding
│   │   └── workbook/               # XLSX import/export, versioning
│   ├── lib/
│   │   ├── Types.tsx               # All TypeScript interfaces
│   │   ├── atoms.tsx               # Jotai global state atoms
│   │   ├── utils.tsx               # Core utilities + pricing calc
│   │   ├── database.ts             # RxDB schema & hydration
│   │   ├── supabase.ts             # Supabase client init
│   │   ├── syncEngine.ts           # Online/offline sync engine
│   │   ├── syncUtils.ts            # Write abstraction layer
│   │   ├── changeQueue.ts          # Offline mutation queue
│   │   ├── conflictResolver.ts     # LWW conflict resolution
│   │   ├── pdfExport.ts            # PDF catalog generator
│   │   ├── crateManifesto.ts       # Shipping document generator
│   │   ├── xlsxUtils.tsx           # Excel utility functions
│   │   ├── excelStyles.ts          # ExcelJS styling
│   │   ├── colorExtractor.ts       # Canvas-based color extraction
│   │   ├── ai.ts                   # Gemini AI client
│   │   ├── videoAI.ts              # Video AI processing
│   │   ├── artifactUtils.ts        # Barcode/tag resolution
│   │   ├── consts.tsx              # Constants, vendor registry
│   │   ├── translations.tsx        # i18n (EN/ES)
│   │   └── hooks.tsx               # Custom React hooks
│   └── utils/
│       └── PhomemoM110.ts          # Label printer driver
├── .env.local                       # Supabase credentials
├── package.json                     # Dependencies and app version
├── vite.config.ts                   # Build configuration
└── tsconfig.json                    # TypeScript config
```

---

## Database Schema

### Core Tables

**`inventory`** — Master product table with ~30+ columns covering identification (`id`, `item_id`, `vendor_id`), physical attributes (`shape`, `material`, `color`, `weight_kg`, dimensions), pricing (`price_mxn`, `book_acquisition`, `book_landed`, `book_retail`, `book_barcode`, `book_aq_code`, `book_land_code`), AI fields (`short_description`, `generated_description`, `detailed_description`, `generated_color`, `generated_type`), media (`media_urls`, `image_urls`), spatial data (`spatial_boxes_2d`, `spatial_masks`), and lifecycle (`workbook`, `status`, `crate_id`, `pay_req`).

**`finance`** — Payment/expense records with `amount`, `currency` (default MXN), `type` (Merchandise/Operations), `category`, `bank_account`, `commission`, `exchange_rate`, `related_ids` (linked inventory).

**`logistics`** — Shipping containers with `type` (Crate/Pallet), `truck_id`, `customs_status`, `freight_cost`, `inventory_ids`.

**`production`** — Manufacturing with `vendor_id`, `progress`, `stage`, `price_unit`, `ready_date`.

**`app_users`** — Roles: Developer, Admin, ClientBoss, ClientAccounting, ClientViewer, Vendor.

**`settings`** — KV store (e.g., `exchange_rate`).

### RLS Status
- `inventory`, `finance`, `production`, `logistics`: **Permissive** (open during migration)
- `app_users`, `settings`: **Restrictive** (role-based via SECURITY DEFINER)

---

## Pricing Calculations

**CRITICAL**: All pricing logic lives in `src/lib/utils.tsx` → `calculateCodesAndPrices()`:

```typescript
// Acquisition: MXN → USD
const costUsd = round2(costMxn / exchangeRate);

// Landed Cost: +40% for customs/tariffs/freight
const landedCost = round2(costUsd * 1.4);

// Retail Price: 12x markup on landed
const retailPrice = round2(landedCost * 12);
```

**Cypher encoding**: Costs are encoded via `numberToCypher` using cypher string `DMOXHELFAN` (digit 0-9 → letter).

**Barcode generation**: `vendor_prefix + workbook_number + item_sequence + cypher_string`

---

## Vendor System

Vendors are defined in `src/lib/consts.tsx`. Key rules:
- Vendor ID extracted from `itemId` prefix (e.g., `EM-001` → vendor `EM`)
- Each vendor has a display color for UI
- Polish type mapping:
  - `JM` → Fully Polished
  - `TE`, `EM`, `ML` → Partially Polished
  - Others → Matte

---

## AI Processing Pipeline

### One prompting system (`src/lib/ai/`)
- `models.ts` maps each job (content, segmentation, translate, bgReplace, video) to its model; no other file hard-codes a model id.
- `prompts.ts` builds every prompt and JSON schema; `client.ts` is the only Gemini caller; `run.ts` (`useAiRun`) drives the Catalog Hub and Add Entry Generate; `persist.ts` writes results with merge, not rebuild.
- Cutouts: local `@imgly/background-removal` → traced SVG path → PNG/SVG on Google Drive (`generated_png_url` / `generated_svg_url`). Details in OnyxMX-AIPipelineOptimization.

### Color Classification Rules
- AI returns 2-3 dominant colors from Shopify palette
- Allowed: Black, Blue, Bronze, Brown, Clear, Copper, Cream, Gold, Gray, Green, Iridescent, Multicolor, Orange, Pink, Purple, Rainbow, Red, Rose Gold, Silver, Tan, Turquoise/Aqua, White, Yellow
- **Special rule**: No "Black" for translucent items (Cylinder Pendants)

### Description Rules
- Short: Single sentence, no articles ("a", "the")
- Detailed: 1000-1200 chars, HTML (`<p>`, `<ul>`, `<li>`)
- Word "lamp" → FORBIDDEN → use "Luminarie" or "Light Fixture"
- Tone: Premium, artisanal, Mexican stone craftsmanship

---

## Shopify Export (Matrixify XLSX)

### Column Mappings
| Shopify Column | Source | Transform |
|---------------|--------|-----------|
| Handle | title/tagId | lowercase, hyphenated |
| Title | shape+shortDesc+color+material | + partSuffix |
| Body (HTML) | marketingDescription | AI-generated HTML |
| Vendor | vendorName | direct |
| Type | generatedType | via getProductCategoryAndType() |
| Tags | tagId,color,material,shape,shortDesc,dims | comma-separated |
| Variant SKU | tagId+vendorSku+costMxn | combined |
| Variant Barcode | tagId/bookBarcode | direct |
| Variant Cost | bookLanded | USD |
| Variant Price | bookRetail | USD |
| Variant Grams | weightKg*1000 | kg→g |

### Metafields
- `custom.polish_type`: Vendor-derived
- `Measurements`: `D{d}×W{w}×H{h}` (inches)
- `custom.variety`: `Mexican Onyx`

---

## Offline-First Sync Architecture

### Write Path
1. User action → Write to **RxDB** (local)
2. If online → Also write to **Supabase** (remote)
3. If offline → Enqueue in **ChangeQueue** (localStorage)
4. On reconnect → `flushQueue()` replays mutations to Supabase

### Read Path (Delta Sync)
- Pull records where `updated_at >= LAST_SYNC_KEY`
- Merge into local RxDB

### Conflict Resolution: Last-Write-Wins (LWW)
- Compare `updated_at` timestamps
- Remote wins if strictly newer

### Initial Hydration
- Paginated: 1000 records per page
- Chunked upserts into RxDB

---

## Workbook Versions

| Version | Exchange Rate Location | Format |
|---------|----------------------|--------|
| v326 (active) | `data[1][1]` | Detailed expense groups (BOA, BBVA RAMSES, BBVA MARTHA) |
| v825 (archive) | `data[10][3]` | Legacy sequential format |

---

## Common Modification Patterns

### Adding a New Vendor
1. Add entry to `vendors` object in `src/lib/consts.tsx`
2. Assign prefix, name, and display color
3. Check the polish type mapping (`polish_type` in `src/lib/ai/finalize.ts` and `persist.ts`)

### Modifying Pricing Formula
1. Edit `calculateCodesAndPrices()` in `src/lib/utils.tsx`
2. Update multipliers (currently 1.4 for landed, 12 for retail)
3. Run `syncAllCalculatedFieldsToDB()` to recalculate existing records

### Adding Shopify Export Fields
1. Add the column in the Matrixify export in `src/features/inventory/BatchProcessingWizard.tsx`
2. Map internal field to Shopify column name
3. Add any necessary data transformation

### Extending AI Prompts
1. Edit the builders in `src/lib/ai/prompts.ts` (vocabulary in `vocabulary.ts`)
2. Modify system instructions or output constraints
3. Update `generatedType` taxonomy if adding new categories
4. Update allowed color palette if adding new options

---

## References

For detailed information, consult:
- [references/database_schema.md](file:///c:/Jouhayerk/skills/OnyxMXExpert/references/database_schema.md) — Full schema reference
- [references/shopify_mapping.md](file:///c:/Jouhayerk/skills/OnyxMXExpert/references/shopify_mapping.md) — Shopify field mapping
- [references/ai_prompts.md](file:///c:/Jouhayerk/skills/OnyxMXExpert/references/ai_prompts.md) — AI prompt templates
