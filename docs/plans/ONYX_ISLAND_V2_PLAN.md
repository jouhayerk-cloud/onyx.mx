# Onyx Island v2: plan and swarm workflow

Written 2026-10-04 by the Chief (Juan117) after Ramses reviewed the first tool-dock build in the browser (8 screenshots).

## What Ramses reported

1. Icons are not visible or too small in every island state.
2. Notifications and Chat panes are empty and unusable.
3. The main top bar keeps an empty band and padding. The island must REPLACE the top bar completely.
4. The sidebar launcher (Onyx logo) must become part of the island.
5. The background must be full SLAB translucent liquid glass, with animations.
6. Face size and island width and height must adapt; the face stays on the centre line; the tools deploy AROUND the face.
7. The face must be app-aware and tool-aware.
8. The printable-jobs research and the logistics checksums must be activated for season 826.
9. The new MCP surfaces must let the Onyx Intelligence (Onyx Chan) agent interact with the app.

## Findings (Chief, before the swarm)

- Probable cause of the invisible icons and bevelled launcher keys: slab.css and slab-glass.css style every `button` and flatten every `bg-white/*` and `bg-black/*` utility, with `!important`. The sanctioned escape hatch is the `.ui-root` class (the slab element rules stop at it). The island root now carries `ui-root` (commit 26ddb1f2). Not verified in the browser: the dev server is HTTPS with a self-signed certificate and a login, so the assistant could not open it.
- Panes were empty because their body used percentage heights inside an auto-height parent. Fixed for desktop and phone with explicit pane heights (interim); IV1 replaces it with a proper flex chain.
- Interim fixes already committed: header row hidden for Inventory and Archived while the island owns their tools; right-cluster controls (menu, crate, manifest, Shopify export, Onyx language and reset) are global island tools; launcher and tile icons 22px in 44px targets.

## Wave IV (launches 18:30 local, after the Gemini 5-hour reset; 9 tasks, 4 at once)

| Task | Model | Output | Files |
|---|---|---|---|
| IV1 | Gemini Pro | Island v2: face-centric layout, liquid glass, working panes, dynamic size, sidebar launcher | `src/features/onyxIsland/*` |
| IV2 | Gemini Pro | Inventory panels (view, filters, search, tags) extracted and shown in the surface | `core/inventoryPanels.tsx`, `UniversalToolsBar.tsx` |
| IV3 | Gemini Pro | Tool descriptors: store, finance | `store/storeTools.tsx`, `finance/financeTools.tsx` |
| IV4 | Gemini Pro | Tool descriptors: logistics, trucking, warehouse, packing, shipping readout | `logistics/logisticsTools.tsx`, `packingTools.tsx` |
| IV5 | Gemini Pro | Tool descriptors: process, upload, control, onyx, overview, dashboard, misc views | `process/`, `upload/`, `control/`, `core/miscViewTools.tsx` |
| IV6 | Gemini Pro | Face awareness: app context snapshot, island tools for the agent, face reactions | `onyxAgent/context`, `tools/islandTools.ts`, wiring |
| IV7 | Claude (agy) | MCP bridge plan and typed client between the app agent and the Onyx Chan MCP surfaces | `docs/ai/MCP_APP_BRIDGE_PLAN.md`, `onyxAgent/mcp/*` |
| IV8 | Gemini Pro | Print jobs and dj1 checksums for 826: lib, migration DRAFT, panel, island tool | `lib/documentJobs.ts`, `supabase/migrations/..._document_jobs.sql`, `print/*` |
| IV9 | Gemini Pro | Print module architecture synthesis | `docs/print/PM5_PRINT_MODULE_ARCHITECTURE.md` |

Only one Claude task (the Claude quota inside agy is small). Tasks own disjoint files.

## Chief's integration steps after the wave

1. Review and merge IV1 first (it owns the island files), typecheck, build.
2. Merge IV2, then wire `InventoryPanelsRegistrar` in MainHeader and hide the second-row inventory part.
3. Merge IV3 to IV5, wire each Registrar in MainHeader next to the inventory one, pass the handlers the agents list, extend `migratedView`, hide each old bar while `islandCommandsEnabledAtom` is true.
4. Merge IV6 and test the agent tools against the registry.
5. IV8: add `PrintToolsRegistrar`, wire `recordDocumentJob` at the call sites the agent lists, one at a time. The migration is applied by Ramses, not by the Chief.
6. IV7 and IV9 are documents plus a typed client: review, then plan the next wave from the backlog in PM5.

## Open items and risks

- Visual check in the browser is Ramses's: report with screenshots.
- Aqua (light) theme: island text colour not checked.
- Pinned tools are stored per device (localStorage) for now, not per user.
- The `document_jobs` migration must be applied before the panel shows anything but legacy `print_jobs` rows.
- `docs/design/` (copy of the apple-design skill) must be removed before any push of the app.
