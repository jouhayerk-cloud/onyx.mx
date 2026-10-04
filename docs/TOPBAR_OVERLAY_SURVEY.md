# Top Bar Overlay Architecture & View Survey

**Date:** 2026-10-04  
**Target:** Onyx.mx Application Topbar Overlay Transition  
**Context:** Global migration to liquid glass overlay topbar (`.app-topbar`) publishing `--app-topbar-h` on `.app-content`. Content in every module scrolls underneath the translucent glass bar.

---

## 1. Shared Infrastructure: `.view-under-topbar`

In `src/features/core/topbarOverlay.css`, `.app-content > .app-topbar` sets `margin-bottom: calc(-1 * var(--app-topbar-h, 0px))` and `.app-content > main` sets `padding-top: var(--app-topbar-h, 0px)`. Views flowing in the standard document scroll (Class A) pass behind the topbar automatically.

Views bounding their own height (`h-full`, `overflow-hidden`) with internal scrollers (Class B) require a view-level root offset: pulling the bounded container up into the topbar overlay area with negative margin-top, compensating with internal padding-top so rest content is not occluded, and setting scroll padding and sticky offsets.

### Exact CSS Recipe (`src/features/core/topbarOverlay.css`)

```css
/* ── Shared Class for Bounded Views (Class B) ────────────────────────────── */
.view-under-topbar {
  margin-top: calc(-1 * var(--app-topbar-h, 0px));
  padding-top: var(--app-topbar-h, 0px);
  height: calc(100% + var(--app-topbar-h, 0px));
  box-sizing: border-box;
}

/* Inner scroller scroll-padding to avoid hiding scroll targets under glass */
.view-under-topbar-scroller,
.view-under-topbar [class*="overflow-y-auto"],
.view-under-topbar .custom-scrollbar {
  scroll-padding-top: var(--app-topbar-h, 0px);
}

/* Sticky rows inside bounded views must stick below the glass bar, not top-0 */
.view-under-topbar [class*="sticky"][class*="top-0"],
.view-under-topbar-sticky {
  top: var(--app-topbar-h, 0px) !important;
}
```

---

## 2. Comprehensive View Survey (All 18 Digest Views)

### 2.1. `control`
- **File:** `src/features/control/ControlView.tsx` (94 lines)
- **(a) CLASS:** **B** (own bounded scroll container)
- **(b) Exact Patch:**
  - **Root element:** Line 25
    - *Old class string:* `"flex flex-col h-full overflow-hidden"`
    - *New class string:* `"flex flex-col h-full overflow-hidden view-under-topbar"`
  - **Inner scroller:** Line 79
    - *Old class string:* `"flex-1 overflow-y-auto px-10 py-12 pb-32 scrollbar-none"`
    - *New class string:* `"flex-1 overflow-y-auto px-10 py-12 pb-32 scrollbar-none scroll-pt-[var(--app-topbar-h,0px)]"`
- **(c) Risks:**
  - Header row at line 13 (`px-10 py-8 border-b border-white/3`) is a non-scrolling HUD element. Inside `.view-under-topbar`, root `padding-top` places it directly below the liquid bar at scroll 0. The inner `<main>` scrolls underneath the HUD rather than directly under the glass bar unless the HUD header itself is converted to sticky glass.

---

### 2.2. `dashboard/overview`
- **File:** `src/features/dashboard/AdminDashboard.tsx` (7 lines)
- **(a) CLASS:** **D** (digest not enough)
- **Digest Details:** `AdminDashboard.tsx` is a 7-line wrapper delegating directly to `<DashboardView />` at line 5 with 0 layout lines.
- **Exact Lines to Read:**
  - Target file: `src/features/dashboard/DashboardView.tsx`
  - Lines: Root return statement (typically lines 1–40) and all lines containing `h-full`, `min-h-screen`, `overflow-y-auto`, or fixed heights to determine whether `DashboardView` has an inner scroller (Class B) or flows in page scroll (Class A).
- **(c) Risks:**
  - ECharts analytics charts often compute pixel heights based on parent containers. If the root height does not account for `--app-topbar-h`, chart containers may be compressed or trigger outer `.app-content` overflow.

---

### 2.3. `finance`
- **File:** `src/features/finance/FinanceView.tsx` (27 lines)
- **(a) CLASS:** **A** (flows in page scroll; Class D caveat for inner component)
- **Analysis:**
  - Root at line 52 is `<div className="flex-1 flex flex-col relative">` without height bounding or overflow.
  - Page scroll behavior confirmed by `MainAppView.tsx` lines 580–586: `onScroll` on `.app-content` specifically listens to `activeView === 'finance'` to toggle `setIsFinanceScrolled`.
- **Exact Lines to Read if Auditing Child:**
  - Target file: `src/features/finance/TrackingPaymentsView.tsx`
  - Lines: Table head / sticky payment row declarations (`table :is(th, td).sticky[class*="bg-[#0a0a0a]"]` in `slab-glass.css` line 912) to verify sticky offsets.
- **(c) Risks:**
  - Sticky table headers inside `TrackingPaymentsView` with `top-0` will dock at `top: 0` inside `.app-content`, disappearing beneath `.app-topbar` (`z-[500]`). Must use `top: var(--app-topbar-h, 0px)`.

---

### 2.4. `inventory`
- **File:** `src/features/inventory/InventoryView.tsx` (7 lines)
- **(a) CLASS:** **A** (flows in page scroll)
- **Analysis:** Wrapper returning `<UnifiedInventoryView />` at line 5. Nothing to do in this wrapper.
- **(c) Risks:** None.

---

### 2.5. `inventory (unified)`
- **File:** `src/features/inventory/UnifiedInventoryView.tsx` (2155 lines)
- **(a) CLASS:** **A** (flows in page scroll)
- **Analysis:**
  - Root at line 87: `<div className="flex-1 flex flex-col relative m-0 gap-0">`. Flows in `.app-content` page scroll.
  - Already serves as the benchmark reference implementation for liquid glass pass-through.
  - Sticky column header (`.inv-head-wrap`, digest lines 110–114, lines 1739, 1962, 2074, 2082) already calculates clearance against the sticky header.
- **(c) Risks:** Virtualized grid item positions rely on accurate scroll measurement; manual changes to topbar height must update `--app-topbar-h` dynamically (handled via `ResizeObserver` in `MainAppView.tsx` lines 192–201).

---

### 2.6. `deployed`
- **File:** `src/features/logistics/DeployedView.tsx` (497 lines)
- **(a) CLASS:** **B** (own bounded scroll container)
- **(b) Exact Patch:**
  - **Root element:** Line 180
    - *Old class string:* `"flex-1 flex flex-col h-full bg-transparent text-white overflow-hidden relative font-['Inter']"`
    - *New class string:* `"flex-1 flex flex-col h-full bg-transparent text-white overflow-hidden relative font-['Inter'] view-under-topbar"`
  - **Inner scroller 1 (shipment list):** Line 229
    - *Old class string:* `"absolute inset-0 overflow-y-auto custom-scrollbar p-12"`
    - *New class string:* `"absolute inset-0 overflow-y-auto custom-scrollbar p-12 scroll-pt-[var(--app-topbar-h,0px)]"`
  - **Inner scroller 2 (shipment detail drawer):** Line 432
    - *Old class string:* `"flex-1 overflow-y-auto custom-scrollbar p-12"`
    - *New class string:* `"flex-1 overflow-y-auto custom-scrollbar p-12 scroll-pt-[var(--app-topbar-h,0px)]"`
- **(c) Risks:**
  - Header at line 124 (`border-b border-white/5 bg-white/[0.01] backdrop-blur-3xl z-40 shrink-0`) sits at the top of the view. Inside `.view-under-topbar`, its padding places it below `.app-topbar`.
  - Detail drawer at line 404 (`w-[560px] h-full bg-black/60 backdrop-blur-[80px]`) is an absolute overlay; its top boundary must account for `--app-topbar-h` or slide under the bar cleanly.

---

### 2.7. `logistics/warehouse/trucking`
- **File:** `src/features/logistics/LogisticsView.tsx` (53 lines)
- **(a) CLASS:** **B** (root wrapper) / **D** (for child modules `TruckingModule` and `WarehouseView`)
- **(b) Exact Patch for Wrapper:**
  - **Root element:** Line 37
    - *Old class string:* `"flex flex-col h-full flex-1 min-h-0"`
    - *New class string:* `"flex flex-col h-full flex-1 min-h-0 view-under-topbar"`
- **Digest Not Enough for Child Modules:**
  - `src/features/logistics/TruckingModule.tsx`: Need lines around component root return and internal scrollers (`#trucking .trk-hub`, `.trk-bar`, and sticky table headers in `slab-glass.css` line 911).
  - `src/features/logistics/WarehouseView.tsx`: Need lines around component root return and grid scroller.
- **(c) Risks:**
  - `TruckingModule` has sticky headers identified in `slab-glass.css` line 911: `#trucking .sticky.top-0[class*="bg-[rgba(12,12,18"]`. These will dock at `top: 0` underneath `.app-topbar` unless patched to `top: var(--app-topbar-h, 0px)`.

---

### 2.8. `packing`
- **File:** `src/features/logistics/PackingModule.tsx` (1427 lines)
- **(a) CLASS:** **D** (digest captured subcomponent return) / **B** (sticky elements requiring view fix)
- **Digest Details:** The digest script recorded the last `return (` in the file at line 1222, which is an individual item row (`PackingItemRow`: `flex flex-col gap-0`), not the `PackingModule` component root.
- **Exact Lines to Read:**
  - Target file: `src/features/logistics/PackingModule.tsx`
  - Lines: 800–850 (encompassing the primary component return statement and layout frame).
- **(b) Exact Patch for Sticky Elements Identified in Digest:**
  - **Sticky config toolbar:** Line 837
    - *Old class string:* `"sticky top-24 sm:top-28 z-[90] overflow-hidden transition-all duration-700 bg-black/40 backdrop-blur-3xl border-b border-white/10 ${isConfigExpanded ? 'max-h-[800px] opacity"`
    - *New class string:* `"sticky top-[var(--app-topbar-h,0px)] z-[90] overflow-hidden transition-all duration-700 bg-black/40 backdrop-blur-3xl border-b border-white/10 ${isConfigExpanded ? 'max-h-[800px] opacity"`
  - **Sticky bottom action bar:** Line 1046 (`sticky bottom-0 left-0 right-0 z-[100]`) remains unaffected.
- **(c) Risks:**
  - Line 837 has hardcoded `top-24 sm:top-28` (96px/112px). If `--app-topbar-h` differs (e.g. mobile or compact states), this bar will either collide with `.app-topbar` or leave an unsightly gap.

---

### 2.9. `onyx`
- **File:** `src/features/onyxAgent/OnyxAgentPage.tsx` (12 lines)
- **(a) CLASS:** **B** (own bounded container)
- **(b) Exact Patch:**
  - **Root element:** Line 6
    - *Old class string:* `"h-full w-full flex justify-center p-4 overflow-hidden"`
    - *New class string:* `"h-full w-full flex justify-center p-4 overflow-hidden view-under-topbar"`
- **(c) Risks:**
  - Minimal 12-line component. Chat message list inside `max-w-3xl` must support `scroll-padding-top: var(--app-topbar-h, 0px)` so scrolled conversation history passes under the glass bar cleanly without cutting off the active message input.

---

### 2.10. `devices`
- **File:** `src/features/pico/devices/DevicesView.tsx` (117 lines)
- **(a) CLASS:** **B** (own bounded scroll container)
- **(b) Exact Patch:**
  - **Root element (is both root and scroller):** Line 50
    - *Old class string:* `"flex flex-col h-full overflow-y-auto bg-transparent text-white p-4 sm:p-6 space-y-4 animate-fade-in"`
    - *New class string:* `"flex flex-col h-full overflow-y-auto bg-transparent text-white p-4 sm:p-6 space-y-4 animate-fade-in view-under-topbar scroll-pt-[var(--app-topbar-h,0px)]"`
- **(c) Risks:**
  - Zero risk. The root element itself is the scroll container with `overflow-y-auto`. Applying `.view-under-topbar` and `scroll-pt-[var(--app-topbar-h,0px)]` immediately flows cards underneath the glass topbar while keeping initial cards visible.

---

### 2.11. `process`
- **File:** `src/features/process/ProcessView.tsx` (1476 lines)
- **(a) CLASS:** **C** (full-bleed canvas/stage special case, with Class B panel components)
- **(b) Exact Patch:**
  - **Root element:** Line 824
    - *Old class string:* `"process-view-container w-full h-full relative overflow-hidden"`
    - *New class string:* `"process-view-container w-full h-full relative overflow-hidden view-under-topbar"`
  - **Inner scrollers:**
    - Line 782:
      - *Old:* `"w-full h-full p-4 overflow-y-auto no-scrollbar"`
      - *New:* `"w-full h-full p-4 overflow-y-auto no-scrollbar scroll-pt-[var(--app-topbar-h,0px)]"`
    - Line 1105:
      - *Old:* `"flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1"`
      - *New:* `"flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1 scroll-pt-[var(--app-topbar-h,0px)]"`
    - Line 1234:
      - *Old:* `"grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 overflow-y-auto custom-scrollbar flex-1 pr-1"`
      - *New:* `"grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 overflow-y-auto custom-scrollbar flex-1 pr-1 scroll-pt-[var(--app-topbar-h,0px)]"`
    - Line 1384:
      - *Old:* `"flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-1"`
      - *New:* `"flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-1 scroll-pt-[var(--app-topbar-h,0px)]"`
- **(c) Risks:**
  - **Drawing canvas must not be covered:** Line 804 (`<svg className="proc-mask-overlay absolute inset-0 w-full h-full pointer-events-none ...">`). If the workspace canvas shifts vertically under the topbar, mouse coordinate mapping for segment drawing and polygon masking will misalign unless bounded by the workspace viewport.
  - Workspace HUD at line 282 (`proc-hud`) is docked at the top of the workspace. It must sit below `--app-topbar-h` so tool buttons (`gallery`, `editor`, segment tools) remain interactive.

---

### 2.12. `store-reg`
- **File:** `src/features/store/RegStorePreview.tsx` (597 lines)
- **(a) CLASS:** **A** (flows in page scroll, but with critical sticky & background overrides)
- **(b) Exact Patch:**
  - **Root element (opaque background removal):** Line 120
    - *Old class string:* `"min-h-screen bg-white text-gray-900 font-sans flex flex-col selection:bg-red-100 selection:text-red-900"`
    - *New class string:* `"min-h-screen bg-transparent text-gray-900 font-sans flex flex-col selection:bg-red-100 selection:text-red-900"`
  - **Sticky store header:** Line 122
    - *Old class string:* `"border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur-md z-40 shadow-sm"`
    - *New class string:* `"border-b border-gray-200 sticky top-[var(--app-topbar-h,0px)] bg-white/95 backdrop-blur-md z-40 shadow-sm"`
  - **Sticky category strip:** Line 371
    - *Old class string:* `"sticky top-28 bg-white p-2"`
    - *New class string:* `"sticky top-[calc(var(--app-topbar-h,0px)+1rem)] bg-white p-2"`
- **(c) Risks:**
  - **Opaque background:** `bg-white` completely masks the liquid glass refraction and the underlying mesh ground. Changing to `bg-transparent` (or a tinted translucent glass) is essential.
  - **Sticky row occlusion:** Line 122 has `sticky top-0`. As `.app-topbar` is sticky at `top-0` with `z-[500]`, the entire Rare Earth Gallery header hides underneath the topbar during scroll unless adjusted to `top-[var(--app-topbar-h,0px)]`.
  - Line 371 has hardcoded `top-28`.

---

### 2.13. `store`
- **File:** `src/features/store/StoreView.tsx` (1581 lines)
- **(a) CLASS:** **B** (own bounded scroll container)
- **(b) Exact Patch:**
  - **Root element (true component root at line 345):** Line 345
    - *Old class string:* `"h-full overflow-hidden bg-transparent animate-in fade-in duration-1000"`
    - *New class string:* `"h-full overflow-hidden bg-transparent animate-in fade-in duration-1000 view-under-topbar"`
  - **Inner scroller 1 (card grid view):** Line 391
    - *Old class string:* `"h-full overflow-y-auto custom-scrollbar scroll-smooth p-4 md:p-10"`
    - *New class string:* `"h-full overflow-y-auto custom-scrollbar scroll-smooth p-4 md:p-10 scroll-pt-[var(--app-topbar-h,0px)]"`
  - **Inner scroller 2 (table view):** Line 419
    - *Old class string:* `"h-full overflow-y-auto custom-scrollbar scroll-smooth p-6"`
    - *New class string:* `"h-full overflow-y-auto custom-scrollbar scroll-smooth p-6 scroll-pt-[var(--app-topbar-h,0px)]"`
  - **Inner scroller 3 (snap-scroll showcase):** Line 448
    - *Old class string:* `"h-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar"`
    - *New class string:* `"h-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar scroll-pt-[var(--app-topbar-h,0px)]"`
- **(c) Risks:**
  - **Snap scroll misalignment:** Line 448 uses `snap-y snap-mandatory`. Without `scroll-pt-[var(--app-topbar-h,0px)]`, snap positions align to the scroller's top edge (0px), hiding the upper section of each full-screen showcase item under the glass topbar.
  - Dialog max-height calculations at line 498 (`max-h-[92dvh]`) must remain constrained.
  - Note: Line 1343 in the digest represents an internal card subcomponent (`StoreCard`), not the module root.

---

### 2.14. `threed`
- **File:** `src/features/threed/ThreeDView.tsx` (808 lines)
- **(a) CLASS:** **C** (full-bleed 3D viewport canvas special case)
- **(b) Patch / Architecture:**
  - Root element is `#threed.threed-root` at line 421.
  - `#threed` renders an interactive Three.js WebGL canvas occupying 100% of the viewport.
  - The canvas should extend full bleed beneath the topbar so 3D models orbit visibly behind the liquid glass chrome.
- **(c) Risks:**
  - **Canvas interactive events:** Raycasting and `OrbitControls` on the WebGL canvas must not receive accidental pointer events when the user clicks buttons or chips on `.app-topbar`. `.app-topbar` already carries `pointer-events-auto`, but viewport boundaries must match canvas resize handlers.
  - **Floating HUDs:** Line 427 (`threed-tabs`) and line 418 (`threed-hud--top`) must not be clipped by `.app-topbar`. They must be offset from the top edge by `var(--app-topbar-h, 0px)`.
  - Drawer overlays at lines 430–445 (`w-[280px] h-full` and `w-[420px] h-full glass-panel`) must span the full view height without pushing outer scroller bounds.

---

### 2.15. `upload`
- **File:** `src/features/upload/UploadView.tsx` (16 lines)
- **(a) CLASS:** **A** (flows in page scroll)
- **Analysis:**
  - Root at line 454: `<div className="create-item-shell flex flex-col w-full">`.
  - Flows naturally in `<main>` within `.app-content`.
  - Background is already governed by `src/styles/slab-glass.css` line 718 (`html.style-slab .create-item-shell { background-color: transparent !important; }`).
- **(c) Risks:** None.

---

### 2.16. `viewer`
- **File:** `src/features/viewer/ViewerView.tsx` (699 lines)
- **(a) CLASS:** **B** (own bounded scroll container)
- **(b) Exact Patch:**
  - **Root element:** Line 571
    - *Old class string:* `"h-full flex flex-col text-white selection:bg-white/20 overflow-hidden relative font-sans"`
    - *New class string:* `"h-full flex flex-col text-white selection:bg-white/20 overflow-hidden relative font-sans view-under-topbar"`
  - **Inner scroller:** Line 648
    - *Old class string:* `"flex-1 overflow-y-auto custom-scrollbar"`
    - *New class string:* `"flex-1 overflow-y-auto custom-scrollbar scroll-pt-[var(--app-topbar-h,0px)]"`
- **(c) Risks:**
  - Line 573 has dynamic padding: `${isInitial && results.length === 0 ? 'h-full flex flex-col items-center justify-center' : 'pt-20 pb-10'}`. With `view-under-topbar` supplying `padding-top: var(--app-topbar-h, 0px)`, `pt-20` (80px) adds cumulative top spacing. Verify visual balance when scan results appear.
  - Camera/QR scanner viewports at line 465 (`<div id={qrRegionId} className="w-full h-full" />`) are rendered in high z-index fixed dialogs (`z-[10005]`, line 442) which sit above `.app-topbar` and are unaffected.

---

### 2.17. `welcome`
- **File:** `src/features/welcome/WelcomeView.tsx` (89 lines)
- **(a) CLASS:** **B** (own bounded scroll container)
- **(b) Exact Patch:**
  - **Root element (bounded height & opaque background removal):** Line 31
    - *Old class string:* `"flex flex-col h-full w-full overflow-hidden custom-scrollbar bg-black/20 relative"`
    - *New class string:* `"flex flex-col h-full w-full overflow-hidden custom-scrollbar bg-transparent relative view-under-topbar"`
  - **Inner scroller:** Line 37
    - *Old class string:* `"flex-1 overflow-y-auto py-12 flex flex-col items-center justify-center gap-12 w-full px-6 md:px-12 z-10 relative"`
    - *New class string:* `"flex-1 overflow-y-auto py-12 flex flex-col items-center justify-center gap-12 w-full px-6 md:px-12 z-10 relative scroll-pt-[var(--app-topbar-h,0px)]"`
- **(c) Risks:**
  - Background at line 31 carried `bg-black/20`. Switching to `bg-transparent` enables the ambient background glow orbs (lines 527–528: `bg-(--main-color) opacity-10 blur-[120px]`) to diffuse through the liquid glass topbar.
  - `py-12` on the inner scroller provides 48px baseline padding, ensuring hero greetings clear the bar comfortably.

---

### 2.18. `archived (reference, already converted)`
- **File:** `src/features/archived/ArchivedView.tsx` (227 lines)
- **(a) CLASS:** **A** (flows in page scroll; reference view)
- **Analysis:**
  - Marked in the digest as already converted.
  - Line 126 and Line 131 use `min-h-full flex flex-col`, allowing full document scroll.
  - Embedded toolbar (`ArchivedToolsBar`) is directly rendered inside `.app-topbar` in `MainAppView.tsx` line 597 (`{activeView === 'workbook' && <ArchivedToolsBar />}`).
- **(c) Risks:** None.

---

## 3. Summary Classification Matrix

| Module / View | Target File | Class | Root Class Fix | Inner Scroller Fix | Sticky / Background Fix |
|---|---|:---:|---|---|---|
| `control` | `src/features/control/ControlView.tsx` | **B** | `.view-under-topbar` (L25) | `scroll-pt-[var(--app-topbar-h,0px)]` (L79) | HUD header below topbar |
| `dashboard/overview` | `src/features/dashboard/AdminDashboard.tsx` | **D** | Read `DashboardView.tsx` | Read `DashboardView.tsx` | Chart container bounds |
| `finance` | `src/features/finance/FinanceView.tsx` | **A** (D) | None (Flows in scroll) | None | Sticky table headers |
| `inventory` | `src/features/inventory/InventoryView.tsx` | **A** | None (Wrapper) | None | None |
| `inventory (unified)` | `src/features/inventory/UnifiedInventoryView.tsx` | **A** | None (Reference) | None | Already converted |
| `deployed` | `src/features/logistics/DeployedView.tsx` | **B** | `.view-under-topbar` (L180) | `scroll-pt` (L229, L432) | Drawer overlay bounds |
| `logistics/warehouse` | `src/features/logistics/LogisticsView.tsx` | **B** (D) | `.view-under-topbar` (L37) | Depends on sub-view | Audit `TruckingModule` |
| `packing` | `src/features/logistics/PackingModule.tsx` | **D** (B) | Read L800–850 | Inner scroller check | `top-[var(--app-topbar-h)]` (L837) |
| `onyx` | `src/features/onyxAgent/OnyxAgentPage.tsx` | **B** | `.view-under-topbar` (L6) | Chat list `scroll-pt` | None |
| `devices` | `src/features/pico/devices/DevicesView.tsx` | **B** | `.view-under-topbar` (L50) | `scroll-pt` (L50) | Scroller is root |
| `process` | `src/features/process/ProcessView.tsx` | **C** (B) | `.view-under-topbar` (L824) | `scroll-pt` (L782, 1105, 1234, 1384) | Canvas stage / HUD dock |
| `store-reg` | `src/features/store/RegStorePreview.tsx` | **A** (B) | None (Flows in scroll) | None | `bg-transparent` (L120), `top-var` (L122, L371) |
| `store` | `src/features/store/StoreView.tsx` | **B** | `.view-under-topbar` (L345) | `scroll-pt` (L391, 419, 448) | Snap scroll padding |
| `threed` | `src/features/threed/ThreeDView.tsx` | **C** | Full-bleed WebGL | None (3D canvas) | Floating HUDs / tabs offset |
| `upload` | `src/features/upload/UploadView.tsx` | **A** | None (Flows in scroll) | None | Already transparent in glass CSS |
| `viewer` | `src/features/viewer/ViewerView.tsx` | **B** | `.view-under-topbar` (L571) | `scroll-pt` (L648) | Dynamic padding check (L573) |
| `welcome` | `src/features/welcome/WelcomeView.tsx` | **B** | `.view-under-topbar` (L31) | `scroll-pt` (L37) | `bg-transparent` (L31) |
| `archived` | `src/features/archived/ArchivedView.tsx` | **A** | None (Reference) | None | Already converted |

---

## 4. Key Risks & Technical Pitfalls

1. **Sticky Rows Occlusion under Glass (`top-0` bug):**
   - Any element using `sticky top-0` inside a view flowing in `.app-content` will dock at the viewport ceiling (y = 0). Because `.app-topbar` is `sticky top-0 z-[500]`, the row docks directly underneath the topbar and becomes illegible or unclickable.
   - *Fix:* Must use `top: var(--app-topbar-h, 0px) !important;`. Observed in `RegStorePreview.tsx` line 122, `PackingModule.tsx` line 837 (hardcoded `top-24`), and `slab-glass.css` line 911 (`#trucking .sticky.top-0`).

2. **Full-Bleed WebGL & SVG Drawing Canvases (Class C):**
   - In `ThreeDView.tsx` and `ProcessView.tsx`, canvases rely on pixel-accurate raycasting and client bounding rects.
   - If a canvas container is offset by negative margin without corresponding viewport updates, drawing coordinates (mask polygons) and 3D camera controls will experience pointer drift.
   - *Fix:* Keep canvas roots full-bleed, ensure floating toolbars (`threed-tabs`, `proc-hud`) are pushed down below `var(--app-topbar-h)`, and verify pointer-events pass-through.

3. **Opaque Backgrounds Overriding Translucency:**
   - Liquid glass requires a background to refract. If a view specifies `bg-white`, `bg-black`, or opaque `#0a0a0a` on its root, the backdrop blur renders as a flat solid color.
   - *Fix:* Reset view roots to `bg-transparent`. Handled for `RegStorePreview.tsx` (L120) and `WelcomeView.tsx` (L31).

4. **Double Scrollbar Hazards:**
   - If a Class B root has `h-full` and `<main>` has `padding-top: var(--app-topbar-h)`, the view's computed height inside `<main>` can exceed the `.app-content` container height if margin-top is omitted, triggering an unwanted secondary outer scrollbar.
   - *Fix:* The exact `.view-under-topbar` rule pairs `margin-top: calc(-1 * var(--app-topbar-h, 0px))` with `padding-top: var(--app-topbar-h, 0px)` so the element fills the container precisely.

5. **Scroll Snapping & Anchor Targets:**
   - In `StoreView.tsx` line 448 (`snap-y snap-mandatory`), snap offsets default to container top. Without `scroll-padding-top: var(--app-topbar-h, 0px)`, snap targets align flush with the top of the container, hiding their top headings behind the glass bar.

---

## 5. Ordered Implementation Plan (5 Batches)

### Batch 1: Shared Infrastructure & CSS Foundation
*Files to modify:*
1. `src/features/core/topbarOverlay.css`
   - Implement `.view-under-topbar`, `.view-under-topbar-scroller`, and `.view-under-topbar-sticky` rules.
2. `src/styles/slab-glass.css`
   - Audit module root overrides to guarantee no `!important` rule overrides `view-under-topbar` transparency.

### Batch 2: Simple Bounded Core & Peripheral Views (Class B Low Risk)
*Files to modify:*
1. `src/features/pico/devices/DevicesView.tsx` (Line 50: add `.view-under-topbar`, `scroll-pt`)
2. `src/features/welcome/WelcomeView.tsx` (Line 31: `bg-transparent`, `.view-under-topbar`; Line 37: `scroll-pt`)
3. `src/features/onyxAgent/OnyxAgentPage.tsx` (Line 6: add `.view-under-topbar`)
4. `src/features/control/ControlView.tsx` (Line 25: add `.view-under-topbar`; Line 79: `scroll-pt`)

### Batch 3: High-Traffic Logistics & Navigation Views (Class B & Sticky Fixes)
*Files to modify:*
1. `src/features/logistics/LogisticsView.tsx` (Line 37: add `.view-under-topbar`)
2. `src/features/logistics/DeployedView.tsx` (Line 180: add `.view-under-topbar`; Lines 229 & 432: `scroll-pt`)
3. `src/features/logistics/PackingModule.tsx` (Line 837: replace `top-24 sm:top-28` with `top-[var(--app-topbar-h,0px)]`)
4. `src/features/viewer/ViewerView.tsx` (Line 571: add `.view-under-topbar`; Line 648: `scroll-pt`)

### Batch 4: Commercial & Store Modules (Class B & Opaque / Sticky Overrides)
*Files to modify:*
1. `src/features/store/StoreView.tsx` (Line 345: add `.view-under-topbar`; Lines 391, 419, 448: `scroll-pt`)
2. `src/features/store/RegStorePreview.tsx` (Line 120: `bg-transparent`; Line 122: `top-[var(--app-topbar-h,0px)]`; Line 371: `top-[calc(var(--app-topbar-h,0px)+1rem)]`)

### Batch 5: Complex Workspaces, Canvases & Delegated Views (Class C & D)
*Files to audit and modify:*
1. `src/features/process/ProcessView.tsx` (Line 824: add `.view-under-topbar`; Lines 782, 1105, 1234, 1384: `scroll-pt`; HUD positioning)
2. `src/features/threed/ThreeDView.tsx` (Verify canvas full-bleed under bar; offset `threed-tabs` and floating HUDs)
3. `src/features/dashboard/DashboardView.tsx` (Inspect component root identified in Class D audit; apply `.view-under-topbar` if bounded)
4. `src/features/finance/TrackingPaymentsView.tsx` (Verify sticky table header offsets against `--app-topbar-h`)

---

## 6. Manual Test Checklist

- [ ] **1. Liquid Glass Translucency at Rest (Scroll = 0):**
  - Navigate to each of the 18 views.
  - Verify that the first visual content item (card, header, title) starts immediately below the bottom edge of `.app-topbar`.
  - Confirm that no top content is cropped or hidden behind the bar on initial load.
- [ ] **2. Scrolling Pass-Through Test:**
  - Scroll downward through each view.
  - Confirm that content cards, table rows, and text smoothly pass *under* the liquid glass topbar.
  - Verify that the translucent blur (`backdrop-filter`) and tint render clearly over the passing content without opaque artifacts.
- [ ] **3. Sticky Rows & Toolbars Clearance:**
  - In `PackingModule`, `RegStorePreview`, and `TruckingModule`, scroll down until secondary toolbars/headers stick.
  - Confirm that sticky headers stick directly flush to the *bottom* of `.app-topbar` (`top: var(--app-topbar-h)`), never at the top edge of the window or behind the bar.
- [ ] **4. Full-Bleed 3D & Canvas Viewports:**
  - Open `threed` (3D & AR). Verify 3D product geometry orbits smoothly behind `.app-topbar`. Test orbit rotation by dragging near the top bar; verify mouse events on topbar controls are not intercepted by the canvas.
  - Open `process` (Labs Process). Verify the SVG mask overlay and drawing canvas coordinate tracking align accurately with cursor position.
- [ ] **5. Snap Scroll Alignment:**
  - In `StoreView` showcase mode (Line 448), trigger snap scrolling. Verify each snap stop leaves the item header visible below `.app-topbar` due to `scroll-padding-top`.
- [ ] **6. Dynamic Bar Height & Season Switching:**
  - Switch to season `825` (Archived view in Workbook). Verify that `ArchivedToolsBar` renders inside `.app-topbar`, increasing `--app-topbar-h`.
  - Confirm that the `ResizeObserver` in `MainAppView.tsx` updates `--app-topbar-h` dynamically and that all bounded views adjust their offset without layout jump.
- [ ] **7. Responsive & Sidebar Mode Switching:**
  - Toggle sidebar through `expanded` (240px), `compact` (80px), and `hidden` (0px).
  - Verify layout integrity and ensure no double scrollbars appear in desktop or mobile screen sizes.
