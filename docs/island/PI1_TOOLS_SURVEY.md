# PI1 tools survey: every control of the main top bar (2026-10-04)

Sources read: `docs/island/DIGEST_BARS.md` (847 lines), `src/features/archived/ArchivedChrome.tsx` (235), `src/features/onyxIsland/islandState.ts` (24). `ModuleToolsGuide` was not available.

## 0. Reading notes and gaps (read first)

Notation: `MH:n` = line n of `src/features/core/MainHeader.tsx`; `UTB:n` = line n of `src/features/core/UniversalToolsBar.tsx` (both as printed in the digest); `D:n` = line n of DIGEST_BARS.md; `AC:n` = line n of ArchivedChrome.tsx. Ids are proposed. `?` = not visible in the digest.

The digest is a grep-style extract, so:

1. **Icons are known only where a `ToolButton`/`StudioAction` prop printed them.** The raw `<button>` controls (Finance, Logistics, Packing, Process, Store vendor chips) print no icon line. Their icon column says `? (propose X)`.
2. **`OnyxBar` (MH:113-443, D:5-8) and `ModuleBadge` (MH:536-544, D:42-45) produced no lines.** The onyx module's header badge/tabs are not inventoried. Only the three onyx-only buttons found in the `MainHeader()` extract (MH:4427, 4439, 4448) are listed.
3. **`ControlBar` range "1381-4551" (D:453) is wrong.** It swallows `MainHeader()`. The real ControlBar is only the badge (MH:1383) and a `ml-auto` div (MH:1384). The extract is capped at 130 lines (D:585). Role and condition of the three export buttons (MH:4472, 4485, 4503) are unknown. They are listed under Control because they follow the `onyx` fragment, but this is unverified.
4. **Not covered by the digest or its sources:** the modules `devices`, `viewer`, `welcome`, `threed` and the logistics-only view. `MH:4363-4372` dispatches only inventory, store, finance, logistics/warehouse/trucking, packing, upload, process, control, onyx and archived (workbook). `overview`, `dashboard` and `create`/empty are inline at MH:4373-4405. See each table.
5. **UTB (second row) is only partly visible.** About 30 control lines are printed, not the whole file.
6. `isSettingsOpen` (MH:1394) and several handlers have no visible usage (see §6).

`islandState.ts` today offers only `IslandMode` (`rest|peek|expanded|center`), `IslandReadout {left,right}` (islandState.ts:9) and `islandModeAtom`. No tool dock state exists yet.

---

## 1. Controls per module

Columns: id | label | icon | kind | source (src, digest) | atoms / handlers | roles | show when | opens.
`panel-toggle` flips a panel rendered by UTB or the page. `dropdown/panel` says what appears.

### 1.1 inventory (`activeView==='inventory'`, `<InventoryBar/>` MH:4363; InventoryBar MH:844-908)

| id | label | icon | kind | src / digest | state / handlers | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| inventory-actions | Actions | Pointer | toggle | MH:875 / D:162 | `isInventorySelectionModeAtom`, `selectedInventoryIdsAtom`, `handleToggleSelectionMode` (body ?) | `userAtom` read at MH:864, gate unknown | inventory | action row for selected items (bulk bar ?) |
| inventory-tools | Tools | Wrench | panel-toggle | MH:883 / D:167 | `inventoryToolsOpenAtom` | none seen | inventory | tools panel |
| inventory-view | View | LayoutTemplate | panel-toggle | MH:888 / D:171 | `isInventoryViewSliderOpenAtom`, `inventoryViewSliderAtom` | none | inventory (inside group MH:886-900, condition ?) | view slider |
| inventory-filter | Filter | Filter | panel-toggle | MH:890 / D:173 | `isInventoryFiltersPanelOpenAtom` | none | same group | filters panel (UTB, see 1.1b) |
| inventory-search | Search | Search | panel-toggle (opens search) | MH:892 / D:175 | `isInventorySearchOpenAtom`, `inventorySearchTermAtom`; active = `isSearchOpen \|\| !!search` | none | same group | UTB search input |
| inventory-tags | Tags | Tag | panel-toggle | MH:897 / D:179 | `isInventorySmartFiltersOpenAtom`; title "Smart filters — type, shape, material, colour" | none | same group | smart filter groups |
| inventory-add | Add | Plus | action | MH:760-774, mounted MH:4520 / D:109-119, D:747 | `activeViewAtom` setter; `window.scrollTo({top:0})`, then sets view (target ?) | none | inventory | navigates to entry (title "Add Entry") |
| inventory-sheets | Sheets | FileSpreadsheet | action | MH:835, gate MH:832 / D:134, D:131 | `handleGoogleSheetsUpload` (MH:782), `inventoryAtom`, `exchangeRateAtom`/`liveExchangeRateAtom`/`DEFAULT_EXCHANGE_RATE` | **Admin, Developer** (returns null otherwise) | inventory | none; async job, needs busy and result toast |
| inventory-export | Export | FolderUp | panel-toggle | MH:4523-4524 / D:750-751 | `showExport` (state or atom ?) | none | inventory | export tools panel (content ?) |
| inventory-upload-wizard | ? | ? | action | MH:851 only / D:150 | `isUploadWizardOpenAtom` setter; no visible use in InventoryBar | ? | ? | wizard (see upload-add-entry) |
| inventory-sync-calculated | (stats block) | ? | action | MH:632-636 / D:73-78 | `handleSyncCalculatedFields`, `isSyncingCalc` (local), `InventoryVersionAtom` | none | inventory (the whole stats readout is this button) | none; pulse while busy |
| inventory-search-input | SEARCH INVENTORY... | X (clear) | search | UTB:604 / D:800 | `invSearchTerm`, `setInvSearchTerm` (UTB local alias of `inventorySearchTermAtom`) | none | `isInventory && isSearchOpen` (UTB:588) | inline input, autoFocus |
| inventory-search-clear | (clear) | X size 28 | action | UTB:605 / D:801 | `setInvSearchTerm('')` | none | `invSearchTerm` non-empty | none |
| inventory-sort-option | `sort.label` (repeated) | ? | select (button group) | UTB:675 / D:803 | `onClick` sets sort (atom ?) | none | `isViewSliderOpen` (UTB:588-599 `isToolsBarOpen`) | none |
| inventory-status-filter | `s.id` per status | ? (propose per-status) | filter (toggle group, `aria-pressed`) | UTB:961 / D:836 | `setInvStatusFilter`, `inventoryStatusFilterAtom` | none | filters panel open | none |
| inventory-material-filter | Material / Colour — main filter | ? | filter (tree) | UTB:894, 913 / D:824, 830 | `materialColorTree`, `SmartFilterGroup` | none | filters / smart panel | tree with expandable nodes |
| inventory-shape-filter | Shape — sub filter | ? | filter (tree) | UTB:903, 926 / D:827, 833 | `shapeTree`, `SmartFilterGroup` | none | same | tree |
| inventory-smart-chip | `f.hint` per chip | ? | filter | UTB:1001 / D:839 | `contentSel` | none | smart panel | none |
| inventory-clear-content-filter | Clear N | ? | action | UTB:1014 / D:842 | clears `contentSel` | none | `contentSel.length>0` | none |
| inventory-vendor-filter | vendor `v` per vendor | ? | filter (multi-select, 'All' fallback) | UTB:1028-1029 / D:845 | `invVendorFilter`, `setInvVendorFilter`, `activeVendorsAtom` (MH:1414) | none | filters panel | none |
| inventory-smartfilter-clear | Clear N | ? | action | UTB:273 / D:775 | `SmartFilterGroup` props | none | active count > 0 | none |
| inventory-smartfilter-node | `Filter by {node.label}` | ? | filter | UTB:290 / D:778 | `SmartFilterGroup` | none | tree nodes | none |
| inventory-smartfilter-expand | Expand/Collapse | ? | toggle | UTB:304 / D:781 | local open state | none | node has children | sub-filters |
| inventory-smartfilter-child | `Filter by {node} / {child}` | ? | filter | UTB:322 / D:786 | `SmartFilterGroup` | none | node open | none |

Rows 1.1: 24.

### 1.2 store (`StoreBar` MH:909-971, mounted MH:4364)

| id | label | icon | kind | src / digest | state / handlers | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| store-search | ? (local `isSearchOpen`) | ? (propose Search) | search | MH:914 / D:191 | `storeSearchTermAtom`, local `useState` for open | none | store | inline `DeployableSearch`? (MH:495-535, D:27-40) |
| store-vendor-chip | vendor `v` (one per `storeVendorOptionsAtom`) | none (text) | filter (single-select chips) | MH:934-937 / D:193-196 | `storeActiveVendorFilterAtom`, `storeVendorOptionsAtom` | none | store | none |
| store-view-mode | GRID / GALLERY / LIST | LayoutGrid / Layout / LayoutList | toggle (3-state cycle) | MH:954-959 / D:198-203 | `storeViewModeAtom` | none | store | none |

Cart: see common-cart. Rows 1.2: 3.

### 1.3 finance (`FinanceBar` MH:972-1029, mounted MH:4365; panels in UTB)

| id | label | icon | kind | src / digest | state / handlers | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| finance-search | Search Payments | ? (propose Search) | panel-toggle | MH:983-986 / D:217-220 | `isPaymentsSearchOpenAtom`, `financeSearchTermAtom`; lit if open or term | none | finance | UTB search input |
| finance-filters | Filter Payments | ? (propose Filter) | panel-toggle | MH:992-995 / D:223-226 | `isPaymentFiltersOpenAtom` | none | finance (maybe also gated, line 990-991 not shown) | filters panel (category filter UTB:767) |
| finance-settings-logic | Settings & Logic | ? (propose SlidersHorizontal) | panel-toggle | MH:999-1002 / D:229-232 | `isPaymentActionPanelOpenAtom` | none | finance | action panel (content ?) |
| finance-upcoming | Upcoming Payments | ? (amber) | panel-toggle | MH:1007-1010 / D:235-238 | `isPaymentUpcomingOpenAtom` | none | finance | Upcoming section (UTB:808) |
| finance-search-input | SEARCH PAYMENTS... | X | search | UTB:695 / D:806 | `finSearchTerm`, `setFinSearchTerm` | none | `isFinance` and search open | inline |
| finance-search-clear | (clear) | X size 28 | action | UTB:696 / D:807 | `setFinSearchTerm('')` | none | term non-empty | none |
| finance-category-filter | `s.id` per category | ? | filter (`aria-pressed`) | UTB:767 / D:809 | `setFinCategoryFilter` | none | filters open | none |
| finance-requested-section | Requested (count, amount) | Heartbeat | panel-toggle | UTB:788 / D:812 | `isFinQueueOpen`, `activeQueueRecords`, `activeQueueTotal` | none | finance | list of ActiveRequestGridItem |
| finance-requested-item | `r.description \|\| vendor` | none | link/readout card | UTB:794 / D:815 | `ActiveRequestGridItem` (UTB:101) | none | queue open | ? |
| finance-upcoming-section | Upcoming Payments (count) | ? | panel-toggle | UTB:808-809 / D:818-819 | `combinedUpcoming` | none | finance | list |
| finance-upcoming-item | `r.description \|\| vendor` | none | link/readout card | UTB:829-830 / D:821-822 | `UpcomingGridItem` (UTB:154) | none | upcoming open | ? |

Currency switch at MH:1017 is `common-currency`. Rows 1.3: 11.

### 1.4 logistics, warehouse, trucking (`LogisticsBar` MH:1030-1230, mounted MH:4366 for the three views)

| id | label | icon | kind | src / digest | state / handlers | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| warehouse-subtab | Empty / Packed / Boxes / Packing (ids `empty`,`packed`,`boxes`,`packing`; labels MH:1059-1061 elided) | string icons (`'package'` …) | select (SubTabPills, MH:444-470) | MH:1058-1061, 1089-1090 / D:277-279, D:286-287 | `logisticsSubTabAtom`; forced to `empty` if invalid (MH:1053-1054); clears search unless `packing` | none | `activeView==='warehouse'` | none |
| trucking-subtab | PLAN (`shipping`) + others (MH:1063+ elided, `deployed`, `crates` exist) | `'truck'` … | select | MH:1062-1063 / D:280-281 | same atom | none | `activeView==='trucking'` | none |
| logistics-search | search (local `isSearchOpen`) | ? | search | MH:1033-1034, 1085 / D:252-253, D:283 | `TOP_BAR_SEARCH_ATOM` | none | row hidden when search open except warehouse and trucking | inline input |
| warehouse-create-crate | Initialize Storage Protocol | ? | action | MH:1097-1100 / D:292-295 | `isCrateCreationModalOpenAtom` | none | warehouse | modal |
| warehouse-search | Search Units | ? | toggle | MH:1105-1108 / D:298-301 | local `isWarehouseSearchOpen` | none | warehouse | inline input |
| warehouse-select-crates | Select Crates / Cancel Selection | ? | toggle | MH:1117-1129 / D:307-311 | `isWarehouseSelectionModeAtom`, `warehouseSelectedIdsAtom` | none | warehouse and `subTab==='packed'` | selection mode |
| warehouse-export-wizard | ? (text button) | ? | action | MH:1136-1138 / D:314-316 | `showWarehouseExportWizardAtom` | none | selection mode and ids > 0 (inferred from `warehouseSelectedIds` read, MH:1049) | wizard |
| logistics-packing-config | Configuration | ? | panel-toggle | MH:1165-1168 / D:321-324 | `isPackingFiltersOpenAtom` | none | `subTab==='packing'` | packing config panel (**same atom as packing-config**) |
| truck-panels-toggle | Hide/Show all panels | ? | toggle | MH:1178-1181 / D:330-333 | `truckShowPanelsAtom` | none | `subTab` `shipping` or `deployed` | shows/hides truck panels |
| truck-open-draft | ? (Archive icon + text) | Archive | action | MH:1191-1192 / D:338-339 | `truckShowOpenDraftAtom` | none | trucking | modal |
| truck-save-draft | ? | Save | action | MH:1195-1196 / D:341-342 | `truckShowSaveDraftAtom` | none | trucking | modal |
| truck-export-modal | ? | SlidersHorizontal | action | MH:1199-1200 / D:344-345 | `truckShowExportModalAtom` | none | trucking | modal |
| truck-ready-wizard | ? (primary, black uppercase) | ? | action | MH:1203-1206 / D:347-350 | `truckShowReadyWizardAtom`; `disabled={truckIsBusyAtom}`; `truckReadyTriggerAtom` declared MH:1036, use ? | none | trucking | wizard |
| truck-crates-library | Deployed Crates Library | ? | action (sets subtab `crates`) | MH:1215-1218 / D:352-355 | `logisticsSubTabAtom` | none | trucking (condition ?) | subtab `crates` (note MH:1053 resets `crates` for warehouse only) |
| truck-view-mode | ? | ? | toggle | MH:1038 / D:257 | `truckViewModeAtom` (use not printed) | none | ? | ? |
| truck-active-deployment | Active Crate Deployment | ? | link (animated) | MH:4417-4420 / D:694-697 | `setView('trucking')`, `sentTruckIdAtom` | none | `sentTruckId` set (condition elided, assumed) | navigates |
| truck-trailers-panel | trailers list | ? | panel-toggle | UTB:431-432 / D:792-793 | `topBarState==='trailers'`, `fetchRecent` | none | `activeView==='trucking'` (UTB:590) | recent trailers list |

`logistics` as its own view has no tab list in the digest. Rows 1.4: 17.

### 1.5 packing (`PackingBar` MH:1231-1306, mounted MH:4367)

| id | label | icon | kind | src / digest | state / handlers | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| packing-search | search (local) | ? | search | MH:1232-1233 / D:361-362 | `TOP_BAR_SEARCH_ATOM` | none | packing | inline |
| packing-clear-selection | clear selection | none (underlined text) | action | MH:1255-1257 / D:374-376 | `packingSelectedIdsAtom` → `new Set()` | none | selection size > 0 (assumed) | none |
| packing-view-mode | GRID/… (`viewMode.toUpperCase()`) | `ViewIcon` | toggle (cycle) | MH:1276-1282 / D:378-384 | `packingViewModeAtom`, `cycleView` | none | packing | none |
| packing-config | Configuration | ? | panel-toggle | MH:1283-1287 / D:385-389 | `isPackingFiltersOpenAtom` | none | packing | config panel (**dup of logistics-packing-config**) |
| packing-print | PRINT | Printer | action | MH:1293 / D:391 | `isPackingPrintWizardOpenAtom` | none | packing | wizard |
| packing-nfc | NFC | QrCode | action | MH:1294 / D:392 | `isPackingNFCWizardOpenAtom` | none | packing | wizard |
| packing-export-pdf | PDF | FileText | action | MH:1298 / D:395 | `packingExportPDFTriggerAtom` set to 1 | none | packing | none (trigger atom) |
| packing-export-xlsx | XLSX | Table | action | MH:1299 / D:396 | `packingExportXLSXTriggerAtom` | none | packing | none |
| packing-export-json | JSON | Database | action | MH:1300 / D:397 | `packingExportJSONTriggerAtom` ("Developer Data Dump") | none seen; likely dev-only | packing | none |

Rows 1.5: 9.

### 1.6 process (`ProcessBar` MH:1307-1344, mounted MH:4369)

| id | label | icon | kind | src / digest | state | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| process-workspace | Engine Workspace | ? | toggle (tab) | MH:1312-1316 / D:406-410 | `processActiveTabAtom`='workspace' | none | process | none |
| process-vault | Inventory Vault | ? | toggle (tab) | MH:1321-1325 / D:413-417 | ='vault' | none | process | none |
| process-batch | Batch Telemetry | ? | toggle (tab) | MH:1330-1334 / D:420-424 | ='batch' | none | process | none |

Rows 1.6: 3. These three should merge to one `select` group in the island.

### 1.7 upload (`UploadBar` MH:1345-1380, mounted MH:4368)

| id | label | icon | kind | src / digest | state / handlers | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| upload-add-entry | Add Entry | FolderUp | action | MH:1362-1367 / D:438-443 | `openEntryModal` (body ?), `uploadItemDataAtom`, `isUploadWizardOpenAtom` | none | upload | upload wizard |
| upload-ai-toggle | AI PROCESSES | Brain | toggle | MH:1369-1374 / D:445-450 | `isAiProcessingEnabledAtom`; colour `#38bdf8` on / `#777` off | none | upload | none |

Rows 1.7: 2.

### 1.8 control (`ControlBar`, see gap 3)

| id | label | icon | kind | src / digest | state / handlers | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| control-export-shopify | Download Shopify XLSX | ? | action | MH:4472-4479 / D:726-731 | `handleShopifyExportXLSX`, `isShopifyExporting` | ? | ? (not shown) | none; busy state |
| control-export-workbook | Download Full Workbook XLSX | ? | action | MH:4485-4493 / D:733-738 | `handleMasterExportXLSX`, `isExporting` | ? | ? | none |
| control-export-workbook-v2 | Download Workbook V2 (Rare Earth Format) | ? | action | MH:4503-4511 / D:740-745 | `handleMasterExportXLSX_V2` (MH:2724), `isExporting` | ? | ? | none |

Control badge (MH:1383) is a readout (§3). Rows 1.8: 3.

### 1.9 overview and dashboard (inline in MainHeader(), MH:4373-4403)

| id | label | icon | kind | src / digest | state | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| (overview-currency) → `common-currency` | MXN/USD | DollarSign | toggle | MH:4376-4381 / D:668-673 | `currencyModeAtom` | none | `overview` | none |
| (overview-export) → `common-export` | EXPORT | Download | action | MH:4383-4387 / D:675-679 | `handleMasterExportXLSX`, `isExporting` | none | `overview` | none |
| (dashboard-currency) → `common-currency` | MXN/USD | DollarSign | toggle | MH:4395-4400 / D:684-689 | `currencyModeAtom` | none | `dashboard` (badge "Analytics") | none |

No unique controls (0). `create`/empty view shows only text "ONYX.MX" (MH:4404-4405, D:544-545): a readout, no control.

### 1.10 workbook / archived (`ArchivedBar`, `ArchivedReadout`, `ArchivedToolsBar`; AC:26-234; mounted MH:4372 when `isArchived`)

All gated: `userAtom.role` is **Developer or Admin** (AC:103, MH:4298). The ToolsBar returns null otherwise (AC:118).

| id | label | icon | kind | src | state | when | opens |
|---|---|---|---|---|---|---|---|
| archived-tab-items | Items | none | toggle (segment, `aria-pressed`) | AC:142 | `archivedTabAtom`='Items' | always | none |
| archived-tab-ledger | Ledger | none | toggle (segment) | AC:143 | ='Ledger' | always | none |
| archived-search | Search (+ Clear search) | Search, X | search | AC:148-170 | `archivedSearchAtom`; Esc clears; ref refocus | tab==='Items' | inline input, `type=search` |
| archived-sort | Sort: Tag ID, Date, Vendor, Weight, Price | none | select (native `<select>`) | AC:89-95, 172-181 | `archivedSortAtom` (`ArchiveSort`) | tab==='Items' | native menu |
| archived-view-gallery | Gallery View | LayoutGrid | toggle | AC:185 | `archivedViewModeAtom`='gallery' | tab==='Items' | none |
| archived-view-table | Table View | List | toggle | AC:186 | ='table' | tab==='Items' | none |
| archived-density | Compact / Comfortable | none | toggle | AC:188-195 | `workbookDensityAtom` | tab==='Items' | none |
| archived-vendor-chip | `ALL` + one per `meta.vendors` (label + count) | none | filter (`role=tablist`, arrow/Home/End keys) | AC:201-230 | `archivedVendorAtom`, `archivedMetaAtom.vendors`; scrolls selected into view (AC:114-116) | tab==='Items' | none |

Rows 1.10: 8. The chip rail is a horizontally scrolling list: needs `render()`.

### 1.11 onyx (`OnyxBar` MH:113-443, mounted MH:4371; body not in digest)

| id | label | icon | kind | src / digest | state / handlers | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| onyx-manifest-toggle | Toggle Neural Manifest | ? | toggle | MH:4427-4431 / D:700-704 | `inventoryArtifactConfigAtom.isOpen` | none | condition elided (before `onyx` fragment, MH:4436) | artifact manifest panel |
| onyx-reset-credentials | Reset Neural Credentials | ? | action (with `confirm()`) | MH:4448-4457 / D:715-719 | `onyxApiKeyAtom` setter to default (value never printed) | none | `onyx` | native confirm |

Language at MH:4439 is `common-language`. OnyxBar's own controls are unknown. Rows 1.11: 2.

### 1.12 devices, viewer, welcome, threed

No control appears in the digest and `MH:4363-4372` does not dispatch to any of them. Table intentionally empty: **0 known controls; needs a second digest** (see §7).

---

## 2. Common controls (header-wide)

| id | label | icon | kind | src / digest | state / handlers | roles | when | opens |
|---|---|---|---|---|---|---|---|---|
| common-sidebar-toggle | Onyx.mx Menu | ? | action | MH:4324-4339 / D:648-653 | `sidebarStateAtom`; `window.innerWidth<=768` selects mobile vs desktop behaviour | none | always | sidebar |
| common-export | EXPORT / Download Full Workbook XLSX | Download | action | MH:4383-4387, 4485-4493 / D:675, D:733 | `handleMasterExportXLSX` (MH:1621), `isExporting` | none | overview, also right cluster | none |
| common-export-selected | Export selected XLSX | ? | action (atom-triggered) | MH:1421-1426, 1433 / D:487, D:622-626 | `inventoryExportSelectedXLSXTriggerAtom`, `handleExportSelectedXLSX`, `selectedInventoryIdsAtom`; if none selected, early return (message ?) | none | inventory with selection | none |
| common-currency | MXN / USD | DollarSign | toggle | MH:1017, 4376, 4395 / D:241, D:668, D:684 | `currencyModeAtom` | none | finance, overview, dashboard | none |
| common-language | EN / ES | ? | toggle | MH:4439-4443 / D:709-713 | `languageAtom` | none | seen only in onyx; global cluster not in digest | none |
| common-user | user readout | `userIcons[user.id]` (MH:4294) | link | MH:652-655, 4294 / D:79-83, D:491 | `userAtom`, `isStudioSettingsOpenAtom` | all | inventory (InfoNotch right); elsewhere ? | settings portal |
| common-settings | Settings | ? | action | MH:653-654, 4293 / D:80-82, D:490 | `isStudioSettingsOpenAtom` | all | always | settings portal |
| common-logout | Logout | ? | action | MH:4289-4290 / D:634-635 | `useLogout()` (MH:1415) via `handleLogout` | all | always | none |
| common-cart | shopping bag (badge `bagCount`) | ? | panel-toggle | MH:4528-4532 / D:754-758 | `isStoreBagOpenAtom`, `storeShoppingBagAtom.length` | none | `activeView==='store'` | bag drawer |
| common-season-toggle | v825 / v826 (title "Show/Hide season N") | none (text) | toggle (2 instances, `aria-pressed`) | MH:717-759 (727-733) / D:97-107 | `visibleWorkbooksAtom` (`WorkbookId`) | none | ? (placement not in digest) | none |
| (refresh) | **not found** | – | – | – | – | – | – | no refresh control exists in the digest |

Rows §2 counted: 10 (refresh not counted). Season toggle: 825 is ARCHIVE, 826 current (`src/lib/seasons.ts`); one descriptor, two toggles.

---

## 3. Data panels and readouts

| id | source | figures shown | atoms | gating / notes |
|---|---|---|---|---|
| info-notch-stats | `InfoNotch part="stats"` MH:586-690 (D:55-83), docked left via `IslandReadout.left` (MH:4313-4314) | types count, total qty, total value (MXN or USD via `exRate = storedRate \|\| liveRate \|\| DEFAULT_EXCHANGE_RATE`) | `filteredInventoryCountAtom`, `filteredInventoryTotalQtyAtom`, `filteredInventoryTotalValueAtom`, `showFinancialsAtom`, `inventoryAtom`, `exchangeRateAtom`, `liveExchangeRateAtom` | value hidden when `showFinancials` false; whole block is the sync button (`inventory-sync-calculated`) |
| info-notch-user | `InfoNotch part="user"` docked right (`IslandReadout.right`) | user identity (fields not printed) | `userAtom` | click opens settings |
| shipping-stats | `ShippingStats` MH:545-585 (D:47-53) | crates loaded on truck (`location==='truck'`), truck dims, max weight | `shippingCratesAtom`, `shippingTruckDimsAtom`, `truckMaxWeightAtom` | not seen mounted in MH:4363-4372; mount site unknown. Figures printed: only the inputs, not labels. |
| truck-stats | UTB trucking panels (`isTrucking`, UTB:590; `topBarState` UTB:431) | trailers list; load figures ? | `topBarState`, recent fetch | content elided |
| archived-stats | `ArchivedReadout part="stats"` AC:56-70, `readout` left | Items, Qty, Weight (KG, 1 decimal) | `archivedMetaAtom` | "—" when no meta |
| archived-scope | `ArchivedReadout part="scope"` AC:71-82, right | Scope label (max 110px, truncated), Total USD (only if `meta.usd != null`) | `archivedMetaAtom` | |
| archived-source-meta | `ArchivedBar` AC:26-53 | Season, Source File, Imported date | `archivedMetaAtom` | `hidden xl:flex`: invisible below xl |
| finance-totals | `SectionHeader` UTB:190, 788, 808-809 | Requested: count and amount (`activeQueueTotal`); Upcoming: count (`combinedUpcoming.length`) | UTB locals | amount in `currencyModeAtom` |
| packing-selection-count | PackingBar MH:1243, 1255 | number of selected crates (label ?) | `packingSelectedIdsAtom` | next to clear-selection |
| module-badge | `ModuleBadge` MH:536-544 | icon + label + colour: upload "Add Entry" (MH:1359), control "Control" (MH:1383), overview (icon only, MH:4375), dashboard "Analytics" (MH:4394) | none | one descriptor type; OnyxBar and others elided |

Readouts counted: 10 (info-notch-stats, info-notch-user, shipping-stats, truck-stats, archived-stats, archived-scope, archived-source-meta, finance-totals, packing-selection-count, module-badge).

Only inventory and archived dock readouts today (`readout` prop, MH:4313). Everything else needs the same `left`/`right` slots, or a generic `readout()` on the descriptor.

---

## 4. Proposed model (TypeScript, design only, not written to a code file)

```ts
// src/features/onyxIsland/tools/types.ts (proposed)
import type { ComponentType, ReactNode } from 'react';

export type ModuleId =
  | 'inventory' | 'store' | 'finance' | 'logistics' | 'warehouse' | 'trucking'
  | 'packing' | 'process' | 'upload' | 'control' | 'overview' | 'dashboard'
  | 'workbook' | 'onyx' | 'devices' | 'viewer' | 'welcome' | 'threed' | 'create'
  | 'common';                                   // header-wide controls

export type ToolKind = 'action' | 'toggle' | 'panel-toggle' | 'search' | 'select' | 'filter' | 'readout' | 'link';
export type Role = 'Admin' | 'Developer' | string; // userAtom.role values seen: 'Admin','Developer'

export interface ToolContext {
  moduleId: ModuleId;
  view: string;                    // activeViewAtom value
  user: { id: string; role: Role } | null;
  tr: (s: string) => string;
}

export interface ToolDescriptor {
  id: string;                      // stable kebab-case, e.g. 'inventory-filter'
  moduleId: ModuleId;
  label: string;                   // already tr()'d or a tr key; island calls tr()
  icon: ComponentType<{ size?: number }> | string;   // lucide component or the string ids of SubTabPills
  kind: ToolKind;
  group: string;                   // 'view' | 'filter' | 'export' | 'selection' | 'wizard' | 'tabs' | 'status' ...
  order: number;                   // within group, ascending
  roles?: Role[];                  // undefined = all; e.g. inventory-sheets: ['Admin','Developer']
  when?: (ctx: ToolContext) => boolean;    // e.g. subTab==='packed'
  run?: (ctx: ToolContext) => void | Promise<void>;
  pressed?: () => boolean;         // aria-pressed / active (e.g. isSearchOpen || !!search)
  disabled?: () => boolean;        // truckBusy, isExporting
  busy?: () => boolean;            // isSyncingCalc, isShopifyExporting
  badge?: () => string | number | null;    // bagCount, selected count, filter count
  title?: () => string;            // tooltip, dynamic ('Hide panels'/'Show panels')
  render?: (ctx: ToolContext) => ReactNode;  // complex widgets only (§5)
  opens?: { panelId: string } | 'modal' | 'wizard' | 'dropdown';
}

export interface PanelDescriptor {
  id: string;                      // e.g. 'inventory-filters-panel'
  moduleId: ModuleId;
  label: string;
  icon: ToolDescriptor['icon'];
  order: number;
  roles?: Role[];
  when?: (ctx: ToolContext) => boolean;
  isOpen: () => boolean;           // wraps the existing jotai atom
  setOpen: (open: boolean) => void;
  render: (ctx: ToolContext) => ReactNode;   // content now in UniversalToolsBar
  readout?: { left?: ReactNode; right?: ReactNode };  // maps onto IslandReadout
}

/** Registers on mount, unregisters on unmount. Descriptors identified by id: re-registering replaces. */
export function useRegisterModuleTools(
  moduleId: ModuleId,
  descriptors: Array<ToolDescriptor | PanelDescriptor>,
  deps?: React.DependencyList,       // closures read atoms: pass them, or use stable getters
): void;
```

Hook contract:

1. Called once per module bar component (or per page), replacing the JSX now in `InventoryBar`, `StoreBar`, `FinanceBar`, `LogisticsBar`, `PackingBar`, `ProcessBar`, `UploadBar`, `ControlBar`, `ArchivedToolsBar` and the inline blocks at MH:4373-4405.
2. Writes to a registry atom (`toolRegistryAtom: Map<moduleId, Descriptor[]>`, proposed in `islandState.ts`). It does **not** render. The island reads the registry for `activeViewAtom` plus `'common'`, filters by `roles` and `when()`, sorts by `group`, `order`.
3. `pressed()`, `badge()`, `disabled()`, `busy()` are called in render of the island tile, which subscribes to the atoms. Use getter functions or a `useAtomValue` wrapper so they stay reactive. Do not snapshot values at registration.
4. Cleanup on unmount removes only that module's ids. `activeView` changes (e.g. warehouse ↔ trucking, which share `LogisticsBar`) must re-evaluate `when()`.
5. Roles are enforced in the island; `run()` must not be callable when hidden. Server side checks are unchanged.
6. `readout` on a `PanelDescriptor` (or a dedicated `useRegisterIslandReadout`) generalises the current `{left,right}` docking so all modules, not just inventory and archived, can dock figures.
7. Secrets: `onyx-reset-credentials` must not put key values in descriptors or logs.

---

## 5. Complex widgets that need `render()` (not a simple tile)

| id | why |
|---|---|
| inventory-search-input / finance-search-input / archived-search / store-search / packing-search / logistics-search / warehouse-search | own input state, autoFocus, clear button, Esc handling (AC:155), local `isSearchOpen`. Consider one shared `SearchField` render. |
| inventory-material-filter, inventory-shape-filter (+ `smartfilter-*`) | `SmartFilterGroup` tree with expand/collapse, per-node counts, clear. UTB:251-339. |
| inventory-smart-chip, inventory-vendor-filter, inventory-status-filter, finance-category-filter, store-vendor-chip | chip groups of dynamic length with multi-select semantics ('All' fallback, UTB:1029). |
| archived-vendor-chip | scrollable `tablist`, keyboard roving (AC:124-136), vendor colours via `getTextColorForBg`. |
| archived-sort | native `<select>`; keep as `select` kind with `options()` (extend the model). |
| inventory-view (view slider) | `inventoryViewSliderAtom` slider panel. |
| inventory-tools, inventory-export, finance-settings-logic | panels with unknown inner content. |
| finance-requested-section, finance-upcoming-section | collapsible sections with amount, count and item grids. |
| warehouse-subtab, trucking-subtab | `SubTabPills` set depends on `activeView`, with side effect `setSearch('')`. |
| truck-ready-wizard, truck-save-draft, truck-open-draft, truck-export-modal, warehouse-export-wizard, packing-print, packing-nfc, upload-add-entry, warehouse-create-crate | open modals/wizards. Tile can be an action, but the modal host must stay mounted outside the bar. |
| inventory-sheets | async upload; needs busy state and result feedback. |
| inventory-sync-calculated + info-notch-stats | readout and button in one; busy pulse. |
| common-season-toggle | two linked toggles; keep as one `render()` pair. |
| truck-trailers-panel | fetches recent data (UTB:431). |
| common-cart | badge plus drawer. |

---

## 6. Duplicates and dead controls

Duplicates:

1. **Currency toggle** ×4: MH:1017 (finance), MH:4376 (overview), MH:4395 (dashboard), plus InfoNotch showing converted value. Same atom `currencyModeAtom`. One `common-currency`.
2. **Master export** ×2: overview EXPORT (MH:4383) and full-workbook button (MH:4485), both `handleMasterExportXLSX`. Plus V2 (MH:4503) and the commented ToolButton (MH:4467).
3. **Packing configuration** ×2: MH:1165 (logistics) and MH:1283 (PackingBar). Same `isPackingFiltersOpenAtom`, same title "Configuration". Merge into one descriptor with `when` of either context.
4. **Search**: eight implementations (inventory, store, finance, logistics, warehouse, packing, archived, `DeployableSearch` MH:495-535 with the Search/X icons). Atoms differ (`inventorySearchTermAtom`, `storeSearchTermAtom`, `financeSearchTermAtom`, `TOP_BAR_SEARCH_ATOM` shared by logistics and packing, `archivedSearchAtom`). Logistics and packing share one term: switching modules leaks the term (cleared only for non-`packing` subtabs, MH:1090).
5. **View-mode cycle** ×3 (store MH:954, packing MH:1276, archived gallery/table AC:185-186): same pattern, different atoms.
6. **`ToolButton` (MH:691-716), `StudioAction` (MH:471-494), `SubTabPills` button (MH:455) and raw `tool-btn` buttons (UTB:767, 961)** are four renderings of the same tile.
7. **Material/Shape titles** are repeated at UTB:894/903 (header) and UTB:913/926 (tree), with different capitalisation ("main filter" vs "Main Filter").
8. **Add Entry**: `inventory-add` (Plus, "Add Entry") and `upload-add-entry` (FolderUp, "Add Entry") plus `isUploadWizardOpenAtom` in InventoryBar (MH:851, unused there). Settings is opened both by InfoNotch user (MH:653) and `openSettingsPortal` (MH:4293).
9. **Language** toggle seen only inside the onyx fragment (MH:4439) although `languageAtom` is read in the common header (MH:1396).

Dead or suspicious:

1. MH:4467-4469: `ToolButton` "Workbook" is inside a comment (`*/` at 4469).
2. `isSettingsOpen` (MH:1394, local state): setter use not in digest, probably replaced by `isStudioSettingsOpenAtom`.
3. Declared with no use visible in the digest: `performanceMode`, `theme`/`setTheme` (MH:1395,1397), `isBotOrbOpen` (MH:1404), `statusSets`, `inventory`, `financeDocs`, `logisticsDocs` (MH:1405-1409), `activeVendors`, `sentTruckId` setter, `setSelectedIds`/`setStatusFilter`/`setView`/`setIsUploadWizardOpen` in InventoryBar (MH:849-853), `truckViewModeAtom` and `truckReadyTriggerAtom` in LogisticsBar (MH:1036, 1038), `isWarehouseSearchOpen` vs `isSearchOpen` (two search booleans in one bar). Verify in source before deleting; the digest only prints declarations.
4. `LogisticsBar` forces `subTab` `crates` away for warehouse (MH:1053) while `truck-crates-library` sets it (MH:1216): intended only for trucking.
5. `ShippingStats` (MH:545) has no mount point in the digest.
6. Digest defect: ControlBar range 1381-4551 includes the whole `MainHeader()` (§0.3).
7. Role gates are inconsistent: `inventory-sheets` (Admin/Developer) and archived (Admin/Developer) are gated; JSON "Developer Data Dump" (MH:1300) shows no gate in the digest.
8. Hard-coded strings without `tr()`: "Download Workbook V2" title (MH:4468 comment), "Download Full Workbook XLSX" (MH:4492), 'Hide all panels'/'Show all panels' (MH:1180), 'Cancel Selection'/'Select Crates' (MH:1129), 'Switch to MXN/USD' (MH:1020), 'Hide/Show season' (MH:732), "Workbook" labels, "NFC", "PDF", "XLSX", "JSON".

---

## 7. Counts

| Section | Count |
|---|---|
| 1.1 inventory | 24 |
| 1.2 store | 3 |
| 1.3 finance | 11 |
| 1.4 logistics / warehouse / trucking | 17 |
| 1.5 packing | 9 |
| 1.6 process | 3 |
| 1.7 upload | 2 |
| 1.8 control | 3 |
| 1.9 overview / dashboard | 0 unique (3 references to common) |
| 1.10 workbook / archived | 8 |
| 1.11 onyx | 2 |
| 1.12 devices, viewer, welcome, threed | 0 known |
| 2 common | 10 |
| **Total tool controls** | **92** |
| 3 readouts / panels | 10 |
| Total descriptors (tools + readouts) | **102** |

Of the 92 tool controls: 25 need `render()` or a modal host (§5), the rest are simple tiles.

Outstanding to complete the inventory (needs a second extract; the digest cannot supply it): `OnyxBar` body (MH:113-443), `ModuleBadge`, `SubTabPills` tab arrays (MH:1058-1075), full `MainHeader()` right cluster (MH:4460-4551, capped at D:585), `UTB:339-1030` panel bodies, and the modules devices, viewer, welcome, threed.
