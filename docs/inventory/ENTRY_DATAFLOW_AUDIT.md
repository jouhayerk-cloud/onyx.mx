# Add Entry Dataflow Audit: Suggestion Mechanisms, Dual Libraries, and Taxonomy Architecture

> **Date**: October 2026  
> **Target Scope**: [EntryForm.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx), [EntryScreen.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryScreen.tsx), [ShapeLibraryField.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/ShapeLibraryField.tsx), [ShapeTypePicker.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/hairline/ShapeTypePicker.tsx), [TagRow.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/TagRow.tsx), [attributeSuggestions.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts), [typeLibrary.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/typeLibrary.ts), [typeLibraryStore.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/typeLibraryStore.ts), [shapeTypeLibrary.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/shapeTypeLibrary.ts), [shapeTypeLibraryStore.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/shapeTypeLibraryStore.ts), [canonicalType.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/canonicalType.ts).  
> **Status**: Audit & Architecture Proposal  

---

## Executive Summary

When entering an item in **Add Entry v826**, users encounter an immediate ergonomic collision: focusing a categorical input such as **Shape** simultaneously opens the browser's native `<datalist>` popup menu and renders a row of `<TagRow>` suggestion chips underneath the field. The floating native dropdown directly overlays the chips and the dimension size chips, making selections frustrating and confusing. Furthermore, the codebase currently harbors two separate libraries ([typeLibrary.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/typeLibrary.ts) and [shapeTypeLibrary.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/shapeTypeLibrary.ts)), while simultaneously executing two parallel suggestion generation engines on every keystroke.

This document delivers a thorough audit of the suggestion dataflow, identifies 10 concrete implementation defects with line references, analyzes the library redundancy, and outlines a migration plan to a unified hook: `useEntrySuggestions(field, state)`.

---

## 1. Field Suggestion Audit

The table below details how each entry attribute resolves its candidate values, filters them against current form state, enforces limits, presents UI controls, and manages data restrictions.

| Field | Source Function, File & Line | Filtering Logic (Cross-Filtering & Exclusions) | Limit / Cap | Presentation Controls | Value Restriction |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Shape** | `buildAttributeSuggestions()` in [`attributeSuggestions.ts:121`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L121), called via `useSuggestions()` in [`EntryForm.tsx:84-91`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L84-L91). Column: `shape`. Raw value extracted via `offered('shape', row)` ([`attributeSuggestions.ts:68`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L68)) which calls `shapeValue()` ([`attributeSuggestions.ts:60`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L60)). | Cross-filtered against active `type`, `material`, and `color` (`constraints.every(...)`). If 0 matches, falls back to all catalogue shapes. Filtered against `options.hidden` (hidden values). | • Datalist: 40 options (`slice(0, 40)` in [`EntryForm.tsx:87`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L87))<br>• Chips: 8 chips (default `max = 8` in [`TagRow.tsx:23`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/TagRow.tsx#L23)). | • `<datalist>` dropdown ([`EntryForm.tsx:156`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L156))<br>• `<TagRow>` chips ([`EntryForm.tsx:178`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L178)) with hairline `ShapeFigure` lead for mirrors, pendants, and lamps ([`EntryForm.tsx:172`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L172)). | **Free text**; user may type any string into `<Input>`. |
| **Type** | 1. `buildAttributeSuggestions()` in [`attributeSuggestions.ts:121`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L121) for datalist/chips.<br>2. `useTypeLibrary()` in [`typeLibraryStore.ts:106`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/typeLibraryStore.ts#L106) and `buildTypeLibrary()` in [`typeLibrary.ts:150`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/typeLibrary.ts#L150) for hairline picker cards. | In `buildAttributeSuggestions()`: cross-filtered by `shape`, `material`, `color`. In `buildTypeLibrary()`: rows filtered if `is_hidden`, `isPersonalType()`, or matching `hidden`. In `ShapeTypePicker.tsx`: search input query filters via `suggestTypes()`. | • Datalist: 40 options.<br>• Chips: 8 chips.<br>• Hairline Picker: 24 cards default (`FIRST = 24`), expandable to all (`matches.length`), plus up to 4 "Did you mean" chips. | • `<datalist>` dropdown ([`EntryForm.tsx:156`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L156))<br>• `<TagRow>` chips ([`EntryForm.tsx:178`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L178))<br>• `<ShapeTypePicker>` card grid ([`EntryForm.tsx:223`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L223)). | **Free text**; picker sets `value.type`, but user can edit the input freely. Admin/Developer can save new types to Supabase `type_library`. |
| **Material** | `buildAttributeSuggestions()` in [`attributeSuggestions.ts:121`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L121). Column: `material`. | Cross-filtered against active `shape`, `type`, and `color`. Falls back to all catalogue materials on 0 matches. Filtered against `options.hidden`. | • Datalist: 40 options.<br>• Chips: 8 chips. | • `<datalist>` dropdown ([`EntryForm.tsx:156`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L156))<br>• `<TagRow>` chips ([`EntryForm.tsx:178`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L178)). | **Free text**; user may type any string into `<Input>`. |
| **Vendor colour** (`color`) | `buildAttributeSuggestions()` in [`attributeSuggestions.ts:121`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L121). Column: `color`. | Cross-filtered against active `shape`, `type`, and `material`. Falls back to all catalogue colors on 0 matches. Filtered against `options.hidden`. | • Datalist: 40 options.<br>• Chips: 8 chips. | • `<datalist>` dropdown ([`EntryForm.tsx:156`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L156))<br>• `<TagRow>` chips ([`EntryForm.tsx:178`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L178)). | **Free text**; vendor-provided color text. |
| **Sizes** (`widthCm`, `heightCm`, `lengthCm`) | `buildSizeSuggestions()` in [`attributeSuggestions.ts:199`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L199), called in `useSuggestions()` ([`EntryForm.tsx:90`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L90)). | 3-tier cascade:<br>1. Match both `shape` AND `type`<br>2. Match `type` alone<br>3. Fallback: match ALL catalogue rows (`() => true`). | Limit: 8 size suggestions (`limit = 8`). | `<SizeRow>` chips in `.entry-dims` ([`EntryForm.tsx:254`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L254)). Triggers when `activeField` is `'shape'`, `'type'`, or `'dims'`. | **Free numeric** inputs (`inputMode="decimal"`). Clicking a `<SizeRow>` chip populates W, D, H simultaneously via `pickSize()` ([`EntryForm.tsx:125`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L125)). |
| **Vendor** (`vendorId`) | `VENDOR_CODES` in [`entryModel.ts:81`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/entryModel.ts#L81) filtered from `vendors` in `consts.tsx`. | Excludes `NON_VENDOR_CODES` (`R`, `M`, `W`, `C`, `SIMONA`, `JUAN`). Stored vendor stays choosable ([`EntryForm.tsx:132`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L132)). | All valid vendor codes (18 active). | `<VendorPicker>` button tiles. | **Restricted** to registered vendor codes. Locked for Vendor accounts. |
| **Status** | `ENTRY_STATUSES` in [`inventoryCreate.ts:42`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/inventoryCreate.ts#L42) (`Acquisition`, `Production`, `Available`). | Existing non-standard status prepended if editing legacy record ([`EntryForm.tsx:138`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L138)). | 3 standard choices + legacy value if present. | `<Select>` dropdown. | **Restricted** selection. Defaults to `'Acquisition'`. |

---

## 2. The Two Libraries: Active vs. Dead Code

The codebase currently contains two distinct library models:

```
src/lib/
├── typeLibrary.ts              <- ACTIVE (Canonical Type 1D model)
├── typeLibraryStore.ts         <- ACTIVE (Jotai/React hook useTypeLibrary)
├── shapeTypeLibrary.ts         <- DEAD CODE (Legacy 2D Shape x Type pair model)
└── shapeTypeLibraryStore.ts    <- DEAD CODE (useShapeTypeLibrary, never mounted)
```

### 2.1 Comparison Matrix

| Property | `typeLibrary.ts` + `typeLibraryStore.ts` | `shapeTypeLibrary.ts` + `shapeTypeLibraryStore.ts` |
| :--- | :--- | :--- |
| **Data Model & Granularity** | **1D Canonical Types**: One tile represents one canonical Type (`CanonicalTypeId`). Shape is a child attribute aggregated under the type (`shapes: { label, count }[]`). | **2D Shape × Type Pairs**: One tile represents a rigid Cartesian pair: `normKey(shape, type) = squash(shape) \| squash(type)`. |
| **Primary Keys** | Canonical `typeKey(rawType, rawShape)` resolved via [`canonicalType.ts:168`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/canonicalType.ts#L168). | `normKey(shape, type)` joining trimmed, lowercase strings. |
| **Database Tables Target** | Remote Supabase tables: `type_library` (with `aliases` JSON) and `attribute_hidden_values`. | Remote Supabase table: `shape_type_library` (unmigrated draft table). |
| **Callers** | • [`EntryForm.tsx:20, 105`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L20)<br>• [`ShapeLibraryField.tsx:4`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/ShapeLibraryField.tsx#L4)<br>• [`ShapeTypePicker.tsx:4`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/hairline/ShapeTypePicker.tsx#L4)<br>• [`typeLibraryStore.ts:3`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/typeLibraryStore.ts#L3) | • [`shapeTypeLibraryStore.ts:3`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/shapeTypeLibraryStore.ts#L3)<br>• **Zero callers in any screen or form.** |
| **Loading on Add Entry Mount** | **YES**: `useTypeLibrary(manual, shapeLibrary)` is called in [`EntryForm.tsx:105`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L105). Executes Supabase queries for `type_library` and `attribute_hidden_values` and builds library from `manualRows`. | **NO**: Not imported by `EntryForm.tsx` or `EntryScreen.tsx`. It does not execute network calls in Add Entry. |
| **Which One the Picker Uses** | **`typeLibrary.ts`**: Passed through `ShapeLibraryField` into `ShapeTypePicker` (`library: readonly TypeEntry[]`). | **None**. |
| **Status** | **ACTIVE** | **DEAD CODE** |

### 2.2 Why the Owner Observed "Two Libraries Loading"
While `shapeTypeLibrary.ts` is dead code not imported by the view, Add Entry runs **two parallel suggestion pipelines simultaneously** on mount:
1. **Pipeline A (`useTypeLibrary`)**: Builds the 43 Type cards for the hairline picker by querying Supabase `type_library` / `attribute_hidden_values` and aggregating inventory rows by canonical type.
2. **Pipeline B (`buildAttributeSuggestions`)**: Runs on `manualRows` inside `useSuggestions()` in [`EntryForm.tsx:84`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L84), compiling independent frequency distributions for `shape`, `type`, `material`, and `color`, plus size calculations.

Both pipelines scan the catalogue rows concurrently, using divergent classification rules:
- `buildAttributeSuggestions` calculates `distinctByFrequency()` and keeps raw catalogue spellings.
- `useTypeLibrary` collapses items into canonical types and folds aliases.

### 2.3 Can the Two Libraries Disagree?
Yes, significantly:
- **Card Count & Multiplicity**: `shapeTypeLibrary` produces separate tiles for "Squared \| Table Lamp", "Round \| Table Lamp", and "Cylinder \| Table Lamp" (producing dozens of redundant tiles). `typeLibrary` produces a single "Table Lamp" card containing sub-shape statistics.
- **Taxonomy Aliasing**: `typeLibrary` maps "pendant lamp", "pendants", and "pendant" to one canonical ID (`pendant`). `shapeTypeLibrary` only removes a trailing `'s'` if word length > 3, keeping `"pendant lamp"` distinct from `"pendant"`.
- **Wine Rack Handling**: `typeLibrary` detects hole counts and aggregates them (`holes: number[]`), while `shapeTypeLibrary` relies on regexes in `motifFor()`.

---

## 3. Defects Audit

A complete audit of the entry dataflow reveals **10 distinct defects**:

### Defect 1: Dual Suggestion Collision (Browser Datalist vs. TagRow Chips)
- **Location**: [`EntryForm.tsx:155-159`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L155-L159) & [`EntryForm.tsx:178-183`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L178-L183)
- **Mechanism**: Every text field calls `textField()`, which attaches `<Input list={listId(f)} onFocus={() => setActiveField(f)} />` linked to `<datalist id={listId(f)}>`. When focused, the browser immediately opens its native floating dropdown. Concurrently, `activeField === f` mounts `<TagRow>` chips below the field row.
- **Impact**: The native dropdown pops open directly over the chips row and the dimension chips below, physically blocking user clicks on the custom chips and presenting duplicate suggestions in two disparate UI formats.

### Defect 2: Triplicate Selection Surface for Type
- **Location**: [`EntryForm.tsx:223-234`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L223-L234), [`EntryForm.tsx:237`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L237), [`EntryForm.tsx:240`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L240)
- **Mechanism**: The `type` field is represented by three controls at once:
  1. The 1,400px hairline picker grid (`ShapeTypePicker`) with 43+ cards,
  2. The native browser `<datalist>` dropdown on the Type input,
  3. The `<TagRow>` chip list below the Type input.
- **Impact**: Severe visual redundancy, massive layout displacement pushing core inputs below the fold, and confusion regarding which control is authoritative.

### Defect 3: Spurious Size Chips on Shape and Type Focus
- **Location**: [`EntryForm.tsx:253-257`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L253-L257)
- **Mechanism**: The size chip row triggers when `activeField === 'shape' || activeField === 'type' || activeField === 'dims'`.
- **Impact**: Focusing the **Shape** field causes `<SizeRow>` chips to render under the dimension inputs further down the page, while the native Shape `<datalist>` popup drops down and covers them. Users are confused why focusing "Shape" alters the dimension section below.

### Defect 4: Cap Discrepancy (Datalist 40 vs. TagRow 8)
- **Location**: [`EntryForm.tsx:87`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L87) vs. [`TagRow.tsx:23, 26`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/TagRow.tsx#L23)
- **Mechanism**: `useSuggestions()` truncates suggestion arrays to 40 (`cap = (l) => (l || []).slice(0, 40)`), which populates the `<datalist>`. However, `TagRow` defaults `max = 8`, and `EntryForm` passes no `max` prop.
- **Impact**: The native dropdown displays up to 40 options, while the chip row displays only 8. Users see values in the dropdown that are completely missing from the chip tray.

### Defect 5: Free-Text Drift and Raw Spelling Retention
- **Location**: [`attributeSuggestions.ts:86-110`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L86-L110) vs. [`EntryForm.tsx:155`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L155)
- **Mechanism**: `distinctByFrequency()` groups by normalized text but surfaces whatever raw spelling occurred most frequently in historical catalogue data (`entry.spellings`), preserving typos and inconsistent casing (e.g. `"squared"`, `"SQUARED"`). Meanwhile, `<Input>` permits arbitrary text entry without canonical enforcement.
- **Impact**: Database corruption and taxonomy degradation over time, as non-standard entries accumulate in `inventory.shape`, `inventory.material`, and `inventory.color`.

### Defect 6: Unfiltered Snap-Back Fallback on Zero Matches
- **Location**: [`attributeSuggestions.ts:143-146`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L143-L146)
- **Mechanism**: When cross-filtering yields zero matching rows (`narrowed.length === 0`), the function falls back to `distinctByFrequency(field, rows, options.hidden)`.
- **Impact**: If a user selects an uncommon combination (e.g., Shape = "Fountain" with Material = "Onyx"), instead of gracefully indicating zero precedents or suggesting canonical options, the suggestions suddenly revert to the entire unfiltered catalogue of thousands of items.

### Defect 7: Key Asymmetry in Cross-Filtering Wine Racks
- **Location**: [`attributeSuggestions.ts:60-65, 75-81`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L60-L65)
- **Mechanism**: `shapeValue(row)` translates wine rack shapes into hole counts (e.g., `"6 holes"`), and `keyOf('shape', row)` checks this string. However, `keyFor('shape', value)` merely computes `norm(value)`.
- **Impact**: If a user types or selects a physical shape description for a wine rack (e.g., `"Rustic"`), `keyFor('shape', 'Rustic')` evaluates to `"rustic"`, which fails to match `keyOf('shape', row)` (`"6 holes"`), causing cross-filtering for wine racks to fail and drop all related inventory rows.

### Defect 8: Un-memoized Full Catalogue Processing on Keystrokes
- **Location**: [`EntryForm.tsx:82-93`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L82-L93) & [`EntryForm.tsx:102`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L102)
- **Mechanism**: `useSuggestions()` depends on `[manual, hidden, value.shape, value.material, value.color, value.type]`. Every keystroke in any of these four fields invokes `buildAttributeSuggestions()` and `buildSizeSuggestions()` synchronously across the entire inventory array.
- **Impact**: Noticeable input latency and interface jank on lower-spec mobile/tablet devices during typing.

### Defect 9: Dead Code Bundle Bloat from Abandoned `shapeTypeLibrary`
- **Location**: [`shapeTypeLibrary.ts:1-346`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/shapeTypeLibrary.ts#L1-L346) & [`shapeTypeLibraryStore.ts:1-119`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/shapeTypeLibraryStore.ts#L1-L119)
- **Mechanism**: 465 lines of code implementing the old 2D `(shape, type)` library querying `shape_type_library` remain in the repository without a single caller.
- **Impact**: Increased bundle footprint, maintenance confusion, and failed attempts to understand why two library files exist.

### Defect 10: Size Suggestions Tier 3 Fallback Leakage
- **Location**: [`attributeSuggestions.ts:205-215`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts#L205-L215)
- **Mechanism**: Tier 1 matches Shape + Type; Tier 2 matches Type; Tier 3 matches `() => true` (every item in the catalogue).
- **Impact**: When adding a new or rare Type with no recorded sizes, Tier 3 suggests the most common dimensions of completely unrelated items (e.g., Pendant dimensions for a Couch).

---

## 4. Architecture Proposal: `useEntrySuggestions`

To resolve the dual selector problem, eliminate dead code, and connect entry directly to the clean taxonomy in `src/lib/inventoryTaxonomy.ts`, we propose replacing the scattered suggestion logic with a single unified hook: `useEntrySuggestions`.

```
┌────────────────────────────────────────────────────────┐
│             src/lib/inventoryTaxonomy.ts               │
│  CANONICAL_TYPES · CANONICAL_FORMS · SIZE_BANDS       │
│  CANONICAL_MATERIALS · CANONICAL_COLOURS               │
│  canonicalTypeId() · canonicalForm() · etc.            │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             useEntrySuggestions(field, state)          │
│  - Merges static canonical taxonomy with live counts   │
│  - Cross-filters safely against other fields           │
│  - Stable memoization (debounced on typing)            │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    Single Chip Bar (<TagRow>)     Hairline Picker
       (NO <datalist> popup)     (Uses same canonical IDs)
```

### 4.1 Hook Signature and Types

```typescript
import { useMemo } from 'react';
import type { EntryState } from '../features/entry/entryModel';
import type { SizeSuggestion } from './attributeSuggestions';
import {
    CANONICAL_TYPES, CANONICAL_FORMS, SIZE_BANDS,
    CANONICAL_MATERIALS, CANONICAL_COLOURS,
    canonicalTypeId, canonicalForm, canonicalMaterial, canonicalColour,
} from './inventoryTaxonomy';

export type EntrySuggestField = 'shape' | 'type' | 'material' | 'color' | 'sizes';

export interface EntrySuggestionItem {
    /** Unique canonical or normalized key. */
    key: string;
    /** Human-readable display label in Title Case. */
    label: string;
    /** Number of matching items in the active catalogue. */
    count: number;
    /** True if this value exists in the canonical taxonomy; false if historical. */
    isCanonical: boolean;
}

export interface UseEntrySuggestionsResult {
    /** Ordered suggestions for categorical fields. */
    items: readonly EntrySuggestionItem[];
    /** Ordered size suggestions (when field === 'sizes'). */
    sizes: readonly SizeSuggestion[];
    /** Quick helper to check if current typed value is canonical. */
    isValidCanonical: boolean;
}

export function useEntrySuggestions(
    field: EntrySuggestField,
    state: Pick<EntryState, 'shape' | 'type' | 'material' | 'color'>,
    catalogueRows: readonly any[],
    options?: {
        hidden?: ReadonlySet<string>;
        limit?: number;
    }
): UseEntrySuggestionsResult;
```

### 4.2 Required Data and Internal Mechanics

1. **Clean Taxonomy Integration**:
   - `field === 'type'`: Starts with `CANONICAL_TYPES`. Uses `canonicalTypeId(state.type)` to find the active selection.
   - `field === 'shape'`: Starts with `CANONICAL_FORMS`. Uses `canonicalForm(state.shape)`.
   - `field === 'material'`: Starts with `CANONICAL_MATERIALS`. Uses `canonicalMaterial(state.material)`.
   - `field === 'color'`: Starts with `CANONICAL_COLOURS`. Uses `canonicalColour(state.color)`.
   - `field === 'sizes'`: Uses `SIZE_BANDS` mapped to the canonical type, supplemented with high-frequency catalogue dimensions.

2. **Cross-Filtering & Frequency Merging**:
   - Matches catalogue rows against current form values using the canonical resolver functions (eliminating casing and spelling discrepancies).
   - Tallies occurrences of each canonical entity in the matching rows.
   - Any historical non-canonical value with high frequency is appended at the bottom with `isCanonical: false`, allowing legacy items to remain discoverable without polluting clean values.

3. **Elimination of the `<datalist>`**:
   - Remove `<datalist>` elements from `textField()`.
   - The `<TagRow>` chips become the sole suggestion mechanism for `shape`, `material`, and `color`.
   - Size chips appear **only** when focusing the dimension inputs (`activeField === 'dims'`), preventing interference with Shape and Type inputs.

### 4.3 Migration Plan: Call Sites & Risk Analysis

| Step | Target File | Changes Required | Risk & Mitigation |
| :---: | :--- | :--- | :--- |
| **1** | [`src/features/entry/EntryForm.tsx`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx) | • Remove native `<datalist>` elements from `textField()` ([`line 156-158`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L156-L158)).<br>• Replace `useSuggestions()` with `useEntrySuggestions()`.<br>• Restrict `<SizeRow>` rendering to `activeField === 'dims'` only ([`line 253`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/EntryForm.tsx#L253)). | **Low**. Eliminates the dropdown obstruction immediately. Fallback free text input remains unchanged. |
| **2** | [`src/features/entry/hairline/ShapeTypePicker.tsx`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/features/entry/hairline/ShapeTypePicker.tsx) | • Connect card list to `CANONICAL_TYPES` and `useEntrySuggestions('type', ...)` instead of `suggestTypes()`.<br>• Reduce grid card height or enable default compact mode to prevent pushing the form 1,400px down. | **Low**. Hairline figures already support canonical type IDs (`typeId={entry.id}`). |
| **3** | [`src/lib/attributeSuggestions.ts`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/attributeSuggestions.ts) | • Refactor or replace legacy `buildAttributeSuggestions` with taxonomy-aware resolvers.<br>• Fix Tier 3 fallback in `buildSizeSuggestions()` so it returns empty rather than unrelated items. | **Medium**. Verify that batch entry wizards relying on `attributeSuggestions.ts` remain functional. |
| **4** | [`src/lib/shapeTypeLibrary.ts`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/shapeTypeLibrary.ts) & [`shapeTypeLibraryStore.ts`](file:///C:/Jouhayerk/git/onyxchan-wt/E1-4/src/lib/shapeTypeLibraryStore.ts) | • Delete both files. | **Zero**. No active callers exist in the codebase. |

---

## 5. Verification & Test Plan

Because the application currently lacks an integrated browser-based test runner for `src/`, verification must be partitioned between strict compiler validation and isolated script execution:

### 5.1 Static Verification via `tsc`
Run the TypeScript compiler to ensure strict typing across the modified boundaries:
```bash
# Verify no syntax, import, or strict typing regressions
npx tsc --noEmit
```
**Specific compile checks**:
- Prop types in `EntryFormProps` and `ShapeLibraryFieldProps`.
- Removal of `<datalist>` and its ID attributes (`listId()`).
- Unused import detection (`@typescript-eslint/no-unused-vars`).

### 5.2 Headless Test Script (Node.js / Deno)
Create a temporary runner script (e.g. `test/entryTaxonomyTest.mjs`) to test pure functions:
1. **Canonical Normalization**:
   - Assert `canonicalForm('SQUARED') === 'Squared'`.
   - Assert `canonicalTypeId('pendant lamps') === 'pendant'`.
   - Assert `canonicalColour('Green Onyx') === 'Green'`.
2. **Cross-Filtering Consistency**:
   - Assert that filtering with `type: 'mirror'` returns mirror shapes (Round, Squared, Rectangular) with non-zero frequencies.
   - Assert that an unprecedented combination (e.g., `shape: 'Canoe'`, `material: 'Glass'`) returns canonical suggestions without crashing or dumping the full catalogue.
3. **Hidden Values Enforcement**:
   - Assert that personal client names matching `attribute_hidden_values` or `/^client\b/` never appear in `items`.
4. **Dimension Tier Isolation**:
   - Assert that requesting size suggestions for an item with no size history returns an empty array rather than leaking random item sizes.
