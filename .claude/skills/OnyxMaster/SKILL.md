---
name: OnyxMaster
description: "Onyx.mx coding guardrails and agent/model routing. Use when changing code in C:\\Jouhayerk\\git\\app: stack rules, UI kit, data rules (rate 17, Drive-only images, one creation service) and which subagent and model to use for each kind of task."
---

# OnyxMaster: The Studio Orchestrator

This skill is the central directive for maintaining and evolving the **Onyx.mx** application. It synthesizes design tokens, technical architecture, and historically proven workflows into a single high-fidelity standard.

## 🏗️ App Architecture & Tech Stack

Onyx.mx follows a modern, performance-first stack:

- **Frontend**: React 19, Vite, Tailwind CSS v4.
- **State Management**: **Jotai** (Atoms) for global configuration (theme, global search, view state).
- **Persistence**: **Supabase** (Postgres) as the primary source of truth.
- **Local Caching**: **RxDB** for offline-first capabilities and high-performance UI updates.
- **Icons**: **Lucide-React** via a unified `Icon.tsx` wrapper.
- **Visuals**: **ECharts** for data visualization, **ExcelJS** for specialized report exports.

## 🧲 State & Sync Strategy

Maintain absolute synchronization across modules using the central **Jotai** atoms:

- **Theme**: `themeAtom` (Liquid Stone persistence).
- **Currency**: `currencyAtom` (Handles USD/MXN exchange global state).
- **Navigation**: `currentModuleAtom` (Inventory, Finance, Logistics).
- **Context**: `globalSearchAtom` (Shared across search-aware views).
- **Persistence**: RxDB schema updates MUST match Supabase migrations exactly to maintain the sync-hook. Use `patch_v1_66.sql` style naming for DB changes.

## 📱 Responsive Layout & UI Standards

To maintain the **Studio** professional feel:

- **Mobile Behavior**: Side panels (Filters, Settings, Metrics) MUST **auto-minimize** by default on viewport < 1024px to preserve "Liquid Stone" clarity.
- **Desktop Strategy**: Main dashboard views should default to **Maximized Suite** for detailed data work.
- **Micro-Interactions**: Use `framer-motion` for smooth layout transitions (duration: 0.3s, easing: cubic-bezier).

## 🛠️ Shared Business Logic

All calculations must use centralized utilities in `src/utils/` to ensure cross-module parity:

- **Finance**: Landed cost, tax calculations, and currency formatting.
- **Logistics**: Volume (CBM), Weight (Kg), and shipping ETA logic.
- **Rule**: NEVER rewrite calculation logic locally in a component; import from the master utility suite.

## 🧪 Testing Tier

Onyx.mx requires a dual-stage verification process:
- **Unit**: **Vitest** for all calculations in `src/utils/`.
- **Visual checks**: Ramses does browser and visual verification himself unless he asks otherwise. Before deploy run `npm run typecheck` and a Vite build to a folder outside the repo.

## 🎨 Studio Design System

All UI elements must adhere to the **Onyx Studio aesthetic**:

- **Corner Radius**: Standardized to **8px** (`rounded-md`) for most UI elements; **16px** (`rounded-xl`) for main dashboard panels.
- **Glassmorphism**: Use `backdrop-blur-3xl` and `bg-white/8` (or theme-aware alpha) for all panels.
- **Typography**: "Instrument Serif" for display/headers, "DM Sans" for the body.
- **Themes**: Use Liquid Stone themes (**Talan**, **Fluorite**, **Nacar**, **Aqua**). NEVER hardcode colors like `text-white`; use theme-aware variables (`text-[var(--text-color)]`).
- **Currency**: Support dual-currency (USD/MXN) via the `CurrencyTag.tsx` component and the global currency atom.

## 💎 Studio "Liquid Stone" Design Principles (2026 Update)

To achieve the **Premium Studio Aesthetic**, follow these core principles:

1. **Containerless & Borderless**: Avoid heavy boxes or rigid grid borders. Elements should feel "free-floating" on the glass background. Use subtle shadows and backdrop blurs instead of solid strokes.
2. **Dynamic Responsiveness**: UI must breathe. Use adaptive spacing and "Liquid" transitions. Icons should scale and move with purpose, never feeling static.
3. **Glassmorphism v2**: Maximize `backdrop-blur-3xl`. Use `bg-white/5` or `bg-white/8` for interactive elements to create depth without opacity.
4. **Interactive Floating Icons**: Icons should be high-contrast and often isolated from containers until hovered. Use "Orb" or "Ghost" styles for primary actions.
5. **Aesthetics of Space**: Prioritize negative space. Information density should be managed through "Reveal on Interaction" rather than "Always Visible" noise.

## 🐞 Common Mistakes (Anti-Patterns)

Avoid these historically problematic patterns:

1. **Absolute Positioning in Headers**: Use Flexbox or Grid to prevent "rendering behind" artifacts.
2. **Hardcoded Hex Values**: Always use CSS variables (`--main-color`, `--border-color`) to ensure theme compatibility.
3. **Sync Race Conditions**: Always verify that Supabase writes are reflected in the local RxDB cache without requiring a hard refresh.
4. **Fragmented Logic**: Keep calculations (e.g., volume, currency conversion) in shared utility modules (`utils.tsx`) to ensure cross-module parity.

## 🚀 DevOps & Deployment

Onyx.mx uses a hybrid automated and manual deployment strategy:

### 🐙 GitHub Deployment
- **Branching**: `main` is the source of truth. `gh-pages` is the deployment branch.
- **Automated**: GitHub Actions (`.github/workflows/deploy.yml`) triggers on every push to `main`.
- **Manual**: Run `_deploy.bat` in the root for a scripted `build` + `gh-pages` push.
- **Secrets**: Ensure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `GEMINI_API_KEY` are set in GitHub Repository Secrets.

### ⚡ Supabase Management
- **Edge Functions**: Deploy functions from `supabase/functions/` via the Supabase CLI.
- **Schema Migrations**: Use time-stamped SQL patches (`.sql`) in the repository root for schema changes (e.g., `v1_66_schema_fix.sql`).
- **Sync**: Always verify that schema updates are reflected in `rxdb` schema versions to prevent sync-loop crashes.

## 🎨 Vendor colours

Vendor codes, names and colours live in `vendors` in `src/lib/consts.tsx` (the only source; do not copy the table here). Tags, badges and charts use those colours. `R`, `M`, `W`, `C` (admins) and `SIMONA`, `JUAN` (logistics suppliers) are in `vendors` for old items' colours but are **not vendors**: new entries never offer them (`NON_VENDOR_CODES` in `src/features/entry/entryModel.ts`).

## 🧭 Data rules (owner decisions)

- Exchange rate default is **17** (`DEFAULT_EXCHANGE_RATE`). A stored `book_barcode` is never recomputed.
- Images, masks, PNGs and SVGs are stored on **Google Drive** (Apps Script upload in `utils.tsx`), never in Supabase Storage. Show Drive images through `getCleanImageUrl` (lh3 links).
- Create inventory rows only through `src/lib/inventoryCreate.ts`; numbering is per vendor per book.
- Every Gemini call goes through `src/lib/ai/` (see OnyxMX-AIPipelineOptimization).
- New screens build on the UI kit: `src/components/ui/*`, `src/styles/ui.css`, wrapped in `.ui-root`.
- CSS: write only `backdrop-filter` (Lightning CSS drops one of a `-webkit-` pair).

## 🤖 Agents and models (token budget)

Usage limits are shared across models, so match the model to the job. Work directly for small or sequential tasks; delegate only when it saves context or runs in parallel.

| Task | Agent | Model / effort |
|------|-------|----------------|
| Find files, symbols, usages | `Explore` | Haiku / low |
| Run typecheck, build, tests; report failures | `verifier` | Sonnet / low |
| Apply a change whose files and fix are already decided | `implementer` | Sonnet / medium |
| Look up docs or current facts on the web | `docs-researcher` | Haiku / low |
| Review a significant diff before deploy | `reviewer` | Opus / medium |
| Design, ambiguous requirements, cross-module architecture | main session | Opus |

- Subagents default to Sonnet (`CLAUDE_CODE_SUBAGENT_MODEL=sonnet` in user settings). Ask for Opus only for review, judging or hard design work; never Fable for subagents unless Ramses asks.
- Workflows: keep them small (under 5 agents). Reviewers and judges: Opus, medium effort. Fixers and implementers with a clear spec: Sonnet, medium (high for long multi-file fixes). Mechanical steps: low effort.
- Give subagents the exact files, findings and constraints so they do not re-explore; ask them for a short structured result.
- Do not invoke a skill "just in case": load OnyxMXExpert only to find the right sub-skill, then load only that sub-skill.

## 📜 Key Resources

- **Tokens**: [tokens.css](file:///c:/Jouhayerk/git/app/src/styles/tokens.css)
- **Rules Config**: [onyx-rules.json](file:///c:/Jouhayerk/skills/OnyxMaster/onyx-rules.json)
- **History**: [CHANGELOG.md](file:///c:/Jouhayerk/git/app/CHANGELOG.md)
