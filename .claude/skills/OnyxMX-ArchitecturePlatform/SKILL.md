---
name: OnyxMX-ArchitecturePlatform
description: "Onyx.mx architecture: React 19 + Vite 7 + Jotai + RxDB + Supabase offline-first, Tailwind v4 theming, i18n EN/ES, PWA service worker, 3D, build and GitHub Pages deploy. Use for infrastructure or cross-cutting changes."
---

# OnyxMX Architecture & Platform Sub-Skill

> **Domain**: App Architecture, Components, Theming, i18n, PWA, 3D, IoT, Build  
> **Key Files**: `src/main.tsx`, `src/components/`, `vite.config.ts`, `src/lib/hooks.tsx`, `src/lib/translations.tsx`

---

## 1. Architecture Overview

### 1.1 Core Pattern: Offline-First, State-Driven UI
- **No URL-based routing** (not using React Router)
- Navigation driven by Jotai atoms: `currentViewAtom`, `navigationStackAtom`
- Components dynamically swapped via conditional rendering
- Creates a fluid, app-like experience

### 1.2 Technology Stack

| Domain | Technology | Version | Role |
|--------|-----------|---------|------|
| Frontend | React | 18 | UI rendering |
| Language | TypeScript | 5.5 | Type safety |
| Build | Vite | 7.2 | Bundling & dev server |
| State | Jotai | 2.15 | Atomic global state |
| Styling | Tailwind CSS | v4 | Utility-first CSS |
| Local DB | RxDB + Dexie | 17.1 / 4.0 | Offline-first persistence |
| Remote DB | Supabase | 2.97 | PostgreSQL backend |
| AI | @google/genai | 2.14 | Gemini API integration |
| 3D | Three.js | 0.167 | WebGL rendering |
| Animations | GSAP | 3.13 | Timeline animations |
| PDF | jsPDF | 4.2 | Catalog generation |
| Excel | ExcelJS | 3.4 | XLSX generation |
| QR/Barcode | qrcode.react + jsbarcode | — | Tag generation |
| PWA | vite-plugin-pwa | 1.2 | Offline installation |

### 1.3 App Entry Point
[`main.tsx`](file:///c:/Jouhayerk/git/app/src/main.tsx):
- Mounts root `<App />` component
- Initializes PWA Service Worker
- Sets up Jotai Provider

### 1.4 Data Layer Wrapper
[`DataSyncProvider.tsx`](file:///c:/Jouhayerk/git/app/src/components/DataSyncProvider.tsx):
- Wraps entire application
- Subscribes to RxDB local collections
- Manages realtime replication with Supabase channels
- Handles initial hydration on app load

---

## 2. Feature Module Map

All feature modules in `src/features/`:

| Module | Directory | Description | Key Components |
|--------|-----------|-------------|----------------|
| **Auth** | `auth/` | Authentication, role-based access | Login, role gates |
| **Inventory** | `inventory/` | Product management, batch entry | Item lists, batch forms |
| **Catalog** | `catalog/` | Product browsing, detail views | Grid/list views, filters |
| **Finance** | `finance/` | Payment tracking, expenses | Payment wizard, filter bar |
| **Logistics** | `logistics/` | Warehouse, crates, trucking | Crate manager, truck sim |
| **Workbook** | `workbook/` | XLSX import/export, versioning | Log view, upload wizard |
| **Process** | `process/` | Process view | ProcessView (the Catalog Hub, BatchProcessingWizard, is in `inventory/`) |
| **Dashboard** | `dashboard/` | KPIs, ECharts analytics | AdminDashboard |
| **DashboardEXP** | `dashboardEXP/` | Experimental dashboard | Prototype views |
| **Store** | `store/` | E-commerce/Shopify integration | Store settings |
| **Market** | `market/` | Marketplace export | Market views |
| **Onyx** | `onyx/` | AI chat assistant | OnyxChat |
| **Control** | `control/` | Admin panel, user management | User registry, DB stats |
| **3D** | `threed/` | Three.js visualization | ThreeDView |
| **Viewer** | `viewer/` | Gallery, QR/barcode scanner | ViewerView |
| **Pico** | `pico/` | Hardware IoT bridge | PicoBridgeView |
| **Upload** | `upload/` | Media upload pipeline | Upload wizard |
| **Create** | `create/` | Product creation workflows | Creation forms |
| **Welcome** | `welcome/` | Onboarding & landing | Welcome screen |

---

## 3. Component Library (`src/components/`)

Complex composite components rather than basic UI primitives:

| Component | Purpose |
|-----------|---------|
| [`DataSyncProvider.tsx`](file:///c:/Jouhayerk/git/app/src/components/DataSyncProvider.tsx) | App-wide RxDB ↔ Supabase sync wrapper |
| [`InventoryForm.tsx`](file:///c:/Jouhayerk/git/app/src/components/InventoryForm.tsx) | Deep product data entry form |
| [`ExportWizard.tsx`](file:///c:/Jouhayerk/git/app/src/components/ExportWizard.tsx) | Excel/PDF catalog generation UI |

---

## 4. State Management (Jotai)

### 4.1 Atom Organization
All atoms in [`src/lib/atoms.tsx`](file:///c:/Jouhayerk/git/app/src/lib/atoms.tsx) (~31KB):

**Navigation Atoms:**
- `currentViewAtom` — active feature module/view
- `navigationStackAtom` — view history stack

**Data Atoms:**
- `inventoryAtom` — full inventory dataset
- `financeAtom` — payment records
- `logisticsAtom` — shipping containers
- `exchangeRateAtom` — MXN/USD rate

**UI State Atoms:**
- `languageAtom` — current language (en/es)
- `themeAtom` — active theme
- `selectedItemAtom` — currently selected item

**Hardware Atoms:**
- `picoAtoms.ts` — PicoBridge connection state

**Inventory Status:**
- `inventoryStatusAtom.ts` — computed inventory statuses

### 4.2 Custom Hooks ([`hooks.tsx`](file:///c:/Jouhayerk/git/app/src/lib/hooks.tsx))
- Data fetching hooks wrapping Jotai atoms
- Computed value hooks (derived state)
- UI interaction hooks

---

## 5. Theming System

### 5.1 Tailwind CSS v4
- Configured via `@tailwindcss/vite` plugin
- Custom theme variables injected dynamically
- Responsive breakpoints for mobile/tablet/desktop

### 5.2 Theme Assets
[`themes-assets.ts`](file:///c:/Jouhayerk/git/app/src/lib/themes-assets.ts) (~878KB):
- Base64-encoded visual assets per theme
- Color palette definitions
- Typography scales

### 5.3 Hero Media
[`heroMedia.ts`](file:///c:/Jouhayerk/git/app/src/lib/heroMedia.ts):
- Dynamic background images/videos
- Theme-appropriate visual treatments

---

## 6. Internationalization (i18n)

### 6.1 Engine
[`translations.tsx`](file:///c:/Jouhayerk/git/app/src/lib/translations.tsx) (~11KB):
- Static dictionaries for English (`en`) and Spanish (`es`)
- Covers all UI strings across all modules

### 6.2 Usage
```typescript
const { t } = useTranslation();
// Uses languageAtom (Jotai) for instant language switching
// No page reload required
```

---

## 7. Offline/PWA Capabilities

### 7.1 Service Worker
- Registered via `vite-plugin-pwa`
- Caches static assets and API responses
- Enables full offline functionality

### 7.2 Offline Data Layer
- **RxDB**: Local database mirroring Supabase schema
- **ChangeQueue**: localStorage-based mutation queue
- **SyncEngine**: Automatic push/pull on reconnection
- **ConflictResolver**: LWW (Last-Write-Wins) strategy

### 7.3 Installation
- PWA manifest injection
- Add-to-homescreen support
- Standalone app mode

---

## 8. 3D Visualization

### 8.1 ThreeDView ([`features/threed/ThreeDView.tsx`](file:///c:/Jouhayerk/git/app/src/features/threed/ThreeDView.tsx))
- Three.js WebGL canvas environment
- Procedural mesh generation
- Mathematical shape rendering (canoe forms, geometric primitives)
- Material texture application

### 8.2 Axonometric Engine ([`axonometric.ts`](file:///c:/Jouhayerk/git/app/src/lib/axonometric.ts) ~41KB)
- Generates 3D bounding box projections
- Used in PDF catalogs and product cards
- Data URL output for embedding

### 8.3 AR/WebXR
- `.usdz` export for Apple QuickLook
- `.gltf` export for web-based AR
- AR deployment links in product views

---

## 9. Hardware IoT Integration (PicoBridge)

### 9.1 PicoBridgeView ([`features/pico/PicoBridgeView.tsx`](file:///c:/Jouhayerk/git/app/src/features/pico/PicoBridgeView.tsx))
- Interfaces with ESP32/M5Stack (StackChan) robotic systems
- Communication: **Web Bluetooth API**
- Dual-channel telemetry monitoring
- Connection health dashboard

### 9.2 Capabilities
- Motor control commands
- Sensor data reading
- Display rendering commands
- Simulated hardware mode for testing without physical device

### 9.3 Security
- Requires HTTPS (SSL) for Web Bluetooth
- `vite-plugin-mkcert` provides local SSL certificates during development

---

## 10. Media Processing

### 10.1 Image Pipeline
- **HEIC → JPEG**: Client-side via `heic2any` library
- **Square Canvas**: `formatImageToSquareCanvas()` — letterbox to 1:1 ratio with `#121212` fill
- **Pixel Stretching**: `cropImage()` with `pixelStretch` — edge pixel sampling for dynamic backgrounds
- **Background Removal**: Hybrid local GPU (`@imgly/background-removal`) + Cloud AI (Gemini)

### 10.2 Video Pipeline ([`videoAI.ts`](file:///c:/Jouhayerk/git/app/src/lib/videoAI.ts))
- In-browser FFmpeg for video chunking (>10s)
- Gemini API for background removal per chunk
- Clean semantic clip generation

---

## 11. OnyxChat AI Agent

[`OnyxChat.tsx`](file:///c:/Jouhayerk/git/app/src/features/onyx/OnyxChat.tsx):
- Conversational AI powered by Google Gemini
- **Tool-calling capabilities**:
  - `search_inventory`: Natural language inventory queries
  - `deploy_inventory_artifact`: Generate inventory visualizations
- **Speech-To-Text**: Web Speech API input
- **Text-To-Speech**: Browser synthesis output
- Role: "Sentient warehouse asset discovery engine"

---

## 12. Identification System

### 12.1 Barcode Generation ([`artifactUtils.ts`](file:///c:/Jouhayerk/git/app/src/lib/artifactUtils.ts))
- Deterministic formula: `vendor_prefix + workbook_number + item_sequence + cypher_string`
- Cypher string `DMOXHELFAN` encodes cost digits

### 12.2 Resolution Engine
Supports multiple matching strategies:
- Exact barcode match
- Legacy UUID lookup
- Patterned regex matchers (e.g., `SU...` prefix, workbook patterns)

### 12.3 Physical Tagging
- QR code generation (via `qrcode.react`)
- Barcode generation (via `jsbarcode`/`react-barcode`)
- NFC scanning support
- HTML5-Qrcode scanner integration in ViewerView

---

## 13. Build & Deployment

### 13.1 Vite Configuration ([`vite.config.ts`](file:///c:/Jouhayerk/git/app/vite.config.ts))
- `@vitejs/plugin-react` for React Fast Refresh
- `@tailwindcss/vite` for CSS processing
- `vite-plugin-pwa` for Service Worker registration
- Local SSL via `vite-plugin-mkcert` (for Web Bluetooth)
- Dev server: port 1001 with host binding

### 13.2 Build Commands
```bash
npm run dev      # Development server (port 1001)
npm run build    # Production build
npm run preview  # Preview production build
npm run deploy   # Build + deploy to GitHub Pages
```

### 13.3 Deployment
- GitHub Pages via `gh-pages` package
- Output directory: `dist/`

---

## 14. Version History Highlights

- **Current**: see `version` in package.json and the top of CHANGELOG.md
- Google Sheets → Supabase + RxDB migration: ✅ Complete
- Tailwind CSS v4 overhaul: ✅ Complete
- PWA installation: ✅ Complete
- OnyxChat AI: ✅ Complete
- PicoBridge IoT: 🔄 Active (mock simulations for testing)
- Video AI processing: 🔄 Active (client-side FFmpeg latency)
- RLS hardening: 📋 Planned
