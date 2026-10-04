# AV1 Inventory view anatomy for the Archived module

Source: Gemini 3.1 Pro (High) via agy, 2026-10-04. Unverified until the Chief reviews it.

# ARCHIVED_INVENTORY_ANATOMY

## (1) PAGE ANATOMY
The Inventory view is structured around the `UnifiedInventoryView` component, which renders a flex container for the main content and delegates the top toolbar (search, filters, sort, view mode) to the app header (`InventoryBar`, residing outside this view).
- **Toolbar & Search**: Driven by global atoms like `inventorySearchTermAtom` (debounced via `useDeferredValue`), `inventorySortKeyAtom`, and `inventorySortOrderAtom`.
- **Filters**: Chips for vendor (`inventoryVendorFilterAtom`), category (`inventoryCategoryFilterAtom`), material (`inventoryMaterialFilterAtom`), shape, content, and material color (`smartFilters`).
- **View Mode Toggle**: `inventoryViewSliderAtom` dictates the layout (`<= 33` is 'list', `<= 66` is 'grid', above is 'gallery').
- **Selection & Batch**: `isInventorySelectionModeAtom` activates a selection UI (replacing status dots with checkboxes), driven by `selectedInventoryIdsAtom`.
- **Counters**: Managed by hooks/atoms updating on render: `filteredInventoryCountAtom`, `filteredInventoryTotalQtyAtom`, `filteredInventoryTotalValueAtom`.

## (2) CARD ANATOMY (Gallery)
The gallery card (`viewMode === 'gallery'`) is a spacious spread (`inv-card inv-card--xl`) containing:
1. **Media Hero (`inv-gal-hero`)**: Swipes/clicks cycle through photos; falls back to an axonometric wireframe (`WireframeIcon`) if missing.
2. **Photo Strip (`inv-gal-strip`)**: Thumbnail track below the hero for direct selection.
3. **Card Body (`inv-card-body`)**:
   - **Head (`inv-xl-head`)**: Tag chip (vendor color + barcode), quantity chip, payment status LED, and logistics codes (AQ, LD). Total MXN on the right.
   - **Title**: `<h3 className="inv-card-name">` containing shape (bold) and short description.
   - **Stone**: `<p className="inv-card-stone">` combining color and material.
   - **AI Content**: Title, classification path (e.g., `Furniture › Chair`), and store color swatches (`inv-ai-chips`).
   - **Readout (`inv-readout--xl`)**: Metric and imperial dimensions, weight, Price MXN, Landed USD, and Retail USD.
   - **Foot (`inv-card-foot`)**: Logistics marks (Truck for deployed, or `PackedCrateBadge`).
- **CSS / Grid**: Cards span columns based on photo count (`col-span-full` for >=10, `md:col-span-2` for 1-9) using standard Tailwind classes. The `--pay` CSS variable tints the card border based on payment status.

## (3) LIST/TABLE ANATOMY
The list mode renders a virtualized stack of rows.
- **Columns**: TAG, QTY, SHAPE TYPE, COLOR MATERIAL, [spacer], SIZE, WEIGHT, PRICE, TOTAL MXN, AQ, LD, PACKING.
- **Sticky Parts**: The header (`inv-head-wrap`) rests above the virtual container. It scales seamlessly with `listScale` via a CSS transform.
- **Row Heights**: Fixed at an estimated 48px. Uses `useVirtualizer` which re-measures actual DOM node height multiplied by the zoom slider's `listScale` to eliminate dead bands on zoom out.

## (4) DETAIL
Items expand into a full-screen modal sheet (`FullscreenModal` using `createPortal`) featuring:
- **Header (`inv-sheet-bar`)**: Identifiers, title, and standard actions (Edit, Copy Link).
- **Media (`inv-sheet-gal`)**: A larger hero and photo strip.
- **Info Clusters (`inv-sheet-info`)**:
  - *Specs*: Silhouette and dimensions.
  - *Pricing*: Price, Landed, Retail, plus Acq USD (unique to the sheet).
  - *Logistics*: Codes and crate status.
  - *Generated*: AI body text, validation notes.
- **Payments (`inv-panel-pay`)**: A data table summarizing payment batches, net paid, and fees.

## (5) STATES
- **Loading**: Displays `InventorySkeletonGrid` or `InventorySkeletonList` providing a layout-matching wireframe.
- **Empty/No Results**: Handled natively when `filteredItems.length === 0`.
- **Virtualisation**: 
  - *List/Grid*: Driven by `@tanstack/react-virtual` (`listVirtualizer`, `gridVirtualizer`) to maintain performance over 500+ items.
  - *Gallery*: Uses `IntersectionObserver` to implement a growing window (`galleryLimit += 40`), bounding the DOM footprint of heavy image-laden cards.

## (6) FIELD MAPPING TABLE
| Inventory Field | Archive Table Column | Recommendation / Substitute |
| --- | --- | --- |
| TAG / Barcode | `archive_items.tag_id` | Use directly. |
| QTY | `archive_items.quantity` | Use directly. |
| SHAPE TYPE | `archive_items.shape` & `description` | Concatenate or stack. |
| COLOR MATERIAL | `archive_items.color` | Material is NOT AVAILABLE in the archive. Use `color` alone. |
| SIZE (Dims) | `height_cm`, `width_cm`, `length_cm` | Combine standard dimensions. |
| WEIGHT | `archive_items.weight_kg` | Use directly. |
| PRICE | `archive_finance.price_mxn` | Use directly (restricted to Finance role). |
| TOTAL MXN | `archive_finance.total_pesos` | Use directly. |
| AQ / LD Codes | `archive_finance.aqc` / `lc` | Use `aqc` and `lc` from finance. |
| PACKING / Crate | NOT AVAILABLE | Drop this section for archives. |
| Photos / Media | NOT AVAILABLE | Substitute with a colored tag tile (derived from vendor color). |

## (7) REUSE LIST
**Import / Copy Unchanged:**
- `WireframeIcon` and `WireframeCrate` (`../../components/CrateVisuals`)
- `formatDimensionsImperial`, `formatWeightMetricOnly`, etc. (`../../lib/utils`)
- `getStatusClass` and `vendors` map (`../../lib/consts`)
- Typography scale (e.g., `COL_TEXT` definitions in `UnifiedInventoryView.tsx`)
- Virtualization logic (`useVirtualizer` with `measureElement` scaling)

**DO NOT Reuse:**
- AI Generation/Validation (`validateCopy`, `rowMatchesContent`)
- Shopify/Store logic (`storeShoppingBagAtom`, Shopify color sets)
- Mutations (`handleFileUpload`, Edit/Delete handlers)
- Write-focused wizards (`isUploadWizardOpenAtom`, `isPackingCrateWizardOpenAtom`)

## (8) PITFALLS
1. **High**: Price calculations use `parseInt(i.data.price)` and `parseInt(i.data.quantity)` in `totalValueMXN` (`UnifiedInventoryView.tsx:1724`) and sorting (`UnifiedInventoryView.tsx:1693`). This truncates decimal values, causing inaccurate totals and sorting for MXN prices. Use `parseFloat` instead.
2. **High**: Accessibility (a11y) violation. The `div.inv-c-rail` and `div.inv-c-media` elements have `onClick` and `onTouchEnd` handlers but no keyboard (`onKeyDown`) equivalents (`UnifiedInventoryView.tsx:886, 915`). Keyboard users cannot toggle selection or cycle list images.
3. **Medium**: Hard-coded strings bypass translation (`tr()`). For instance, `getPayLabel` returns raw English strings ('New', 'Paid', 'Requested', 'Advance', 'Partial') (`UnifiedInventoryView.tsx:554`), and `aiNotes` constructs strings like `Title is ${...}` directly (`UnifiedInventoryView.tsx:518`).
4. **Medium**: Virtualization measuring error potential. The `gridRowEstimate` (`UnifiedInventoryView.tsx:1812`) uses magic numbers `(colWidth - 18) * 0.75 + 198 + GRID_GAP` which will break row layout if padding or gaps change in `cards.css`.
5. **Medium**: iOS Safari image hack (`UnifiedInventoryView.tsx:177`) appends `?.png` to Google Drive URLs. Unannounced Drive API routing changes will break this URL construction.
6. **Low**: The "Store Bag" toggle (`UnifiedInventoryView.tsx:392`) passes a raw string emoji in the `toast` config instead of using an icon component or translated string.

Could not verify:
- Whether the exact CSS class styling (`cards.css`, `density.css`) aligns flawlessly without missing classes when adapting to the archive view, as stylesheets were not provided.
- If `tag_id` in `archive_items` always follows the same format as `bookBarcode` in the live inventory.
