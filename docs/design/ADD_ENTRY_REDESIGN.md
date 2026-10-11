# Add Entry Redesign Specification (Season 826)

> **Document**: `docs/design/ADD_ENTRY_REDESIGN.md`  
> **Status**: Ready for Wave Implementation  
> **Target Date**: 2026-10-11  
> **Framework**: React 19 · TypeScript Strict · Tailwind 4 · Jotai 2 · Apple HIG (June 2026) · Onyx Studio Design System  

---

## 1. Review of Today's Screen

Following the [Apple Design Skill](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/skills/apple-design.md) audit protocol, this review evaluates the existing Add Entry interface against the Apple Human Interface Guidelines and Onyx Studio design guidelines.

### Summary
The existing Add Entry screen exhibits **Critical issues**. Its single job—rapid, accurate acquisition entry of Mexican stone craft items with seamless AI enrichment—is severely hindered by extreme vertical displacement (a 1,400 px hairline grid pushing all primary fields below the fold), conflicting UI controls (native `<datalist>` popups occluding React suggestion chips), and typographic scale violations below platform accessibility minimums. The design possesses an authentic artisan point of view and exquisite hairline vector figures, but currently behaves like three disjointed subsystems competing for screen estate.

---

### Critical Findings (Must Fix)

#### C-1: Type Scale and Contrast Violations Below Platform Minimums
* **What**: In [entry.css](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/src/features/entry/entry.css#L278-L283), pricing metadata labels (`.entry-codes dt`) are set to `font: 700 9.5px/1.2 var(--ui-font-display); color: var(--ui-faint);`. In addition, `.entry-drop` uses `font: 700 10.5px`, `.entry-brand__facts` uses `11px`, and `.entry-stage` uses `11.5px`. On a dark well background (`--ui-well`: `#14171c`, relative luminance $Y = 0.0092$), `--ui-faint` ($\text{rgba}(255, 255, 255, 0.42)$, effective text luminance $Y = 0.176$) produces an actual contrast ratio of:
  $$\frac{0.176 + 0.05}{0.0092 + 0.05} = \frac{0.226}{0.0592} \approx 3.82:1$$
  This fails the mandatory 4.5:1 minimum for text under 18 pt. Furthermore, 9.5 px is strictly below the platform minimum.
* **Why**: 
  > [accessibility.md › Vision](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/accessibility.md#L26-L42): *"Each platform has different default and minimum sizes for system-defined type styles to promote readability... Minimum size: iOS, iPadOS 11 pt; macOS 10 pt. Text up to 17 pts needs 4.5:1 minimum contrast ratio."*  
  > [typography.md › Ensuring legibility](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/typography.md#L14-L20): *"Follow the recommended default and minimum text sizes for each platform... macOS minimum 10 pt; iOS minimum 11 pt."*
* **Fix**: Upgrade `.entry-codes dt` and all uppercase metadata labels to minimum `11px` (macOS desktop) / `12px` (iOS mobile) with `font-weight: 700`. Elevate text color from `--ui-faint` to `--ui-dim` ($\text{rgba}(255, 255, 255, 0.72)$, $Y = 0.485$), establishing a compliant contrast ratio of $9.04:1$.

#### C-2: The Two-Selectors Conflict and Control Occlusion
* **What**: In [EntryForm.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/src/features/entry/EntryForm.tsx#L153-L160) and [EntryForm.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/src/features/entry/EntryForm.tsx#L178-L184), each categorical input (Shape, Type, Material, Color) renders both a native HTML `<datalist id="...">` attribute on the `<Input>` and a focus-triggered `<TagRow>` chip container below. When the user clicks or focuses the Shape field, the operating system opens an un-styled native datalist dropdown menu. Simultaneously, React mounts the `TagRow` chips. The native dropdown completely covers the `TagRow` chips and obscures the adjacent dimension suggestion chips (`SizeRow`, e.g., *"12W x 12L x 30H"*). The user is confronted with two conflicting selection mechanisms where clicking one dismisses the other.
* **Why**:
  > [entering-data.md › Best practices](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/entering-data.md#L27-L29): *"When possible, offer choices instead of requiring text entry... consider using a picker, menu, or other selection component to give people an easy way to provide the information you need."*  
  > [pickers.md › Best practices](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/pickers.md#L22-L23): *"Avoid switching views to show a picker. A picker works well when displayed in context, below or in proximity to the field people are editing."*  
  > [accessibility.md › Mobility](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/accessibility.md#L72-L80): *"Controls that are too small are hard for many people to interact with... Spacing between controls matters as much as size."*
* **Fix**: Purge all native `<datalist>` elements from the codebase. Establish a unified, device-responsive suggestion paradigm: on desktop, display persistent, keyboard-navigable chip BUTTONS directly below or inline with the input; on mobile (viewport $< 720\text{ px}$ or `pointer: coarse`), render an in-flow or sheet LIST with $44\text{ pt}$ touch rows.

#### C-3: Vertical Rupture from the 1,400 px Hairline Type Grid
* **What**: In [ShapeTypePicker.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/src/features/entry/hairline/ShapeTypePicker.tsx#L166-L212), `ShapeTypePicker` renders 43 large cards (each $120\text{ px}$ wide with a $5:4$ aspect ratio drawing plus caption) in a 4-column CSS grid. This block alone consumes $\approx 1,400\text{ px}$ of vertical height, forcing critical fields (Dimensions, Material, Weight, Price MXN, Vendor Note, Photos, and Pricing Codes) hundreds of pixels below the viewport fold. Users must scroll endlessly back and forth between Type selection and data entry.
* **Why**:
  > [layout.md › Best practices](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/layout.md#L18-L22): *"Make essential information easy to find by giving it sufficient space. People want to view the most important information right away, so don’t obscure it by crowding it with nonessential details."*  
  > [designing-for-macos.md › Best practices](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/designing-for-macos.md#L32-L33): *"Leverage large displays to present more content in fewer nested levels and with less need for modality, while maintaining a comfortable information density that doesn’t make people strain to view the content they want."*
* **Fix**: Replace the static 43-card grid with a compact, searchable Type selector that displays the top 12 most frequent types as compact chip buttons on desktop (small vector thumbnail + label + piece count) with a live search field, placing the long tail behind a "Show all" disclosure control. Once selected, the section dynamically collapses to a summary card ($56\text{ px}$ height) showcasing the hairline figure and a "Change" button.

---

### Improvements (Should Fix)

#### I-1 [High]: Mascot Island Widget Overlapping Screen Header Tabs
* **What**: The Onyx Island face widget (`src/features/onyxIsland`) floats in a fixed portal layer at `top: max(8px, env(safe-area-inset-top, 8px)); left: 0; right: 0; margin-inline: auto; z-index: 10050`. In [entry.css](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/src/features/entry/entry.css#L45-L51), `.entry-page__bar` aligns items with `justify-content: center`. Consequently, the floating mascot orb sits directly on top of the "SINGLE ITEM" and "BATCH XLSX" tab buttons, clipping their borders and intercepting pointer clicks.
* **Why**:
  > [layout.md › Guides and safe areas](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/layout.md#L62-L66): *"A safe area defines the area within a view that isn’t covered by a toolbar, tab bar, or other views... Safe areas are essential for avoiding a device’s interactive and display features... dynamically repositioning content when sizes change."*
* **Fix**: Asymmetrically lay out `.entry-page__bar`: align the mode tabs to the leading edge (`justify-content: space-between`), reserve a central exclusion corridor of $280\text{ px}$ across the top center, and set `margin-top: calc(var(--island-reserve, 64px) + 8px)`. Alternatively, register the mode switch into `toolRegistry.ts` so the island itself docks the launcher.

#### I-2 [High]: Premature Render and Empty Space in Generate Panel
* **What**: In [entry.css](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/src/features/entry/entry.css#L139-L144), `.entry-body` establishes a rigid 2-column grid (`1.05fr 1fr`). On desktop ($1440\text{ px}$), the right column is permanently occupied by `GeneratePanel`, even when no photo has been uploaded and no AI generation has run. It displays empty placeholder cards (*"TITLE 0 / 70 Not generated yet"*, *"COLOURS Not generated yet"*), wasting $>45\%$ of screen area.
* **Why**:
  > [generative-ai.md › Best practices](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/generative-ai.md#L18-L25): *"Keep people in control... Factor processing time into your design... design a loading experience or generate in the background while a person uses another part of the app."*  
  > [disclosure-controls.md › Best practices](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/disclosure-controls.md#L12-L14): *"Use a disclosure control to hide details until they’re relevant. Place controls that people are most likely to use at the top... with more advanced functionality hidden by default."*
* **Fix**: Hide the generated result container completely until generation is initiated. Integrate process toggles into a single compact control bar within the form. When "Generate" is clicked, render a progress skeleton; once output arrives, expand an inspection card on desktop (or reveal an inline review drawer on mobile) equipped with explicit Accept and Discard controls.

#### I-3 [Medium]: Redundant Categorical Fields Out of Sync
* **What**: In `EntryForm.tsx`, selecting a Type in `ShapeLibraryField` sets `value.type`, yet the form still displays manual text inputs for `shape`, `type`, and `material` immediately below it without visual grouping or clear hierarchy.
* **Why**:
  > [entering-data.md › Best practices](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/entering-data.md#L21-L22): *"Prefill fields with reasonable default values, which can minimize decision making and speed data entry."*
* **Fix**: Subsume Type selection entirely into Section 2. Within Section 3 (Details), present Shape and Material with contextual suggestions conditioned on the chosen Type (e.g., selecting "Pendant" filters Shape suggestions to "Cylinder", "Squared", "Conical").

#### I-4 [Medium]: Lack of Sectional Chunking and Visual Rhythm
* **What**: 18 disparate input fields are rendered as an un-chunked grid of 6 columns, resulting in severe visual noise and cognitive fatigue.
* **Why**:
  > [layout.md › Best practices](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/layout.md#L18-L20): *"Group related items to help people find the information they want... use negative space, background shapes, colors, materials, or separator lines to show when elements are related."*
* **Fix**: Group inputs into five logical, collapsible sections: 1. Identity, 2. Type, 3. Details, 4. Photos, and 5. Generate. Each section collapses into a clean, one-line chip summary once completed.

---

### Craft Notes
* **Aesthetic Identity**: Onyx Studio's "Liquid Stone" visual language (deep translucent glass, subtle specular borders, cyan/fluorite accents, hairline architectural strokes) is exceptional. The vector drawings in `ShapeFigure` represent a high-water mark of procedural craftsmanship.
* **Problem**: The screen currently feels like a technical database debugger rather than a cohesive luxury inventory tool. The presence of 43 giant cards alongside an empty 700 px right panel dilutes the platform's elegance.
* **Remedy**: Introduce fluid, spring-timed disclosure transitions. When a section is completed, it folds into a refined summary bar with quiet monochromatic chips. Reopening is instantaneous on click or keyboard focus. One signature visual element—the animated hairline vector figure—is highlighted prominently, while utility fields stay quiet.

---

### What Works (Retain in Redesign)
1. **Intelligent Numbering Engine**: `getNextItemNumber()` and debounced `isDuplicate()` checks ensure collision-free sequential inventory codes across multi-device warehouse environments.
2. **Pricing grid parity**: the read-only grid (Acquisition USD, Landed USD, Retail USD, codes, barcode) keeps its current formulas from `src/lib/utils.tsx`; this spec and the mockup never restate them.
3. **Procedural Hairline Vector System**: `ShapeFigure` with real-time isometric projection and physics lift (`--sf-lift`).
4. **Artisan Color Tagging**: Vendor-specific chromatic chips (`vendors` map in `consts.tsx`) providing instant visual orientation.

---

## 2. The New Flow: Collapsible Sections

The Add Entry screen is redesigned into a single cohesive column of five progressive, collapsible sections. Each section presents its interactive controls when active, automatically collapses to a concise summary bar when its completion criteria are satisfied, and reopens with a single tap or keystroke.

```
┌────────────────────────────────────────────────────────────────────────┐
│  ADD ENTRY v826  [ JM · v826 · next #042 ]             [ SAVE ENTRY ]  │
├────────────────────────────────────────────────────────────────────────┤
│  ✓ 1. IDENTITY        [ JM · Jose Meza ] [ Book 826 ] [ #042 ] [ Qty 1 ]│
├────────────────────────────────────────────────────────────────────────┤
│  ✓ 2. TYPE            [ Table Lamp · 77 pcs ]                  (Change)│
├────────────────────────────────────────────────────────────────────────┤
│  ▼ 3. DETAILS (Active)                                                 │
│    Shape:    [ Cylinder ]  (Chips: Cylinder | Squared | Round | Fluted)│
│    Material: [ Mexican Onyx ]  (Chips: White Onyx | Green Onyx | Amber)│
│    Colour:   [ Verde Oaxaca ]                                          │
│    Status:   [ Acquisition ▾ ]                                         │
│    Dims:     [ 15 ] W × [ 15 ] D × [ 40 ] H cm   (Size: 15×15×40  12)  │
│    Weight:   [ 8.5 ] kg      Price: [ 1,450 ] MXN                      │
│    Note:     [ Base labrada a mano con veta traslúcida ]               │
│    [ Summary Card: Acq $85.29 USD · Landed $119.41 · Retail $1,432.94 ] │
│    [ Continue to Photos → ]                                            │
├────────────────────────────────────────────────────────────────────────┤
│  ▷ 4. PHOTOS          [ Drop photos or videos here ]                   │
├────────────────────────────────────────────────────────────────────────┤
│  ▷ 5. GENERATE        [ Title, Desc, Colours, Cutout PNG ]             │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Section Specifications

#### Section 1: Identity
* **Open Content**:
  * Vendor Picker: Compact grid/chips of valid artisan vendors (`VENDOR_CODES`, excluding admins/logistics).
  * Book Segmented Control: `826` (current active season), `326`, `825` (archive).
  * Item Number (`#`): Number input with automatic sequential prefill (`getNextItemNumber`), live duplicate check badge (`isDuplicate`), and free override.
  * Quantity (`Qty`): Stepper/input defaulting to `1`.
* **Collapsed Summary**:
  * Three semantic chips: `[Vendor: JM · Jose Meza]` (colored by vendor token), `[Book: 826]`, `[Item: #042]`, and `[Qty: 1]`.
* **Filled Rule**:
  `vendorId.trim() !== '' && workbook.trim() !== '' && parseInt(itemNumber, 10) > 0 && !numberState.duplicate && parseInt(quantity, 10) >= 1`
* **What Opens Next**: Section 2 (Type).
* **How to Reopen**: Click/tap the summary header or press `Enter`/`Space` on the disclosure button.
* **Keyboard Order**: Tab through Vendor chips $\rightarrow$ Book segments $\rightarrow$ Number input $\rightarrow$ Quantity input $\rightarrow$ "Next" button.
* **ARIA & Heading Pattern**:
  `<section aria-labelledby="sec-identity-h">`  
  `<button id="sec-identity-h" aria-expanded="true|false" aria-controls="sec-identity-panel">`  
  `<div id="sec-identity-panel" role="region" aria-labelledby="sec-identity-h">`

#### Section 2: Type
* **Open Content**:
  * Search field with clear button (`Find a type...`).
  * Desktop ($ \ge 720\text{ px}$): Compact wrapping chip buttons displaying a miniature vector icon, label, and inventory count (e.g., `[ 🪔 Table Lamp · 77 ]`).
  * Mobile ($< 720\text{ px}$): Scrollable list with $44\text{ pt}$ touch rows, thumbnail, title, and count.
  * Overflow: Long-tail types grouped behind a secondary "Show all (43 types)" disclosure button.
  * Custom entry: "Type your own..." inline field if the desired item is unlisted.
* **Collapsed Summary**:
  * Compact hero card ($56\text{ px}$ height) containing:
    * Left: Scaled hairline figure ($40 \times 32\text{ px}$) of the selected Type.
    * Middle: Primary type name (e.g., *"Table Lamp"*) and catalog count badge (*"77 pieces"*).
    * Right: "Change" (`Cambiar`) button.
* **Filled Rule**:
  `type.trim() !== ''` (a valid library type is picked or a custom type is confirmed).
* **What Opens Next**: Section 3 (Details).
* **How to Reopen**: Tap the "Change" button or click anywhere on the summary card.
* **Keyboard Order**: Search field $\rightarrow$ Arrow keys through Type chips/list $\rightarrow$ Space/Enter to select $\rightarrow$ automatically focuses Section 3.
* **ARIA & Heading Pattern**:
  `<section aria-labelledby="sec-type-h">`  
  `<button id="sec-type-h" aria-expanded="true|false" aria-controls="sec-type-panel">`

#### Section 3: Details
* **Open Content**:
  * Shape input with suggestion buttons (Cylinder, Squared, Round, Conical, etc.).
  * Material input with suggestion buttons (Mexican Onyx, Travertine, White Marble, Black Stone).
  * Vendor Color text field with suggested palette chips.
  * Status select dropdown (`Acquisition`, `Requested`, `In Production`).
  * Dimensions group: `W cm`, `D cm`, `H cm` plus contextual `SizeRow` chips.
  * Weight input (`Kg`).
  * Price MXN input (`Price MXN`) with real-time conversion.
  * Vendor Note field (`Vendor note`).
  * Integrated `LivePreviewCard` showing the read-only pricing grid (values come from the existing app code).
* **Collapsed Summary**:
  * Summary chips: `[Shape: Cylinder]`, `[Material: Onyx]`, `[Color: Verde Oaxaca]`, `[15×15×40 cm]`, `[8.5 kg]`, `[$1,450 MXN / $85 USD]`.
* **Filled Rule**:
  `shape.trim() !== '' && material.trim() !== '' && parseFloat(price) > 0 && parseFloat(widthCm) > 0 && parseFloat(heightCm) > 0`
* **What Opens Next**: Section 4 (Photos).
* **How to Reopen**: Tap the summary bar or "Edit Details" button.
* **Keyboard Order**: Shape $\rightarrow$ Material $\rightarrow$ Color $\rightarrow$ Status $\rightarrow$ W $\rightarrow$ D $\rightarrow$ H $\rightarrow$ Weight $\rightarrow$ Price $\rightarrow$ Note $\rightarrow$ "Continue".
* **ARIA & Heading Pattern**: Standard disclosure group with `role="region"`.

#### Section 4: Photos
* **Open Content**:
  * Drag-and-drop target zone supporting image and video files.
  * File picker button ("Add photos") and "Add by URL" dialog.
  * Thumbnail gallery with drag re-ordering, "Star" primary photo toggle, and delete actions.
* **Collapsed Summary**:
  * Row of up to 4 circular/rounded thumbnails ($32 \times 32\text{ px}$), primary hero badge, count pill `[3 photos]`, and "Manage" button.
* **Filled Rule**:
  `photos.length >= 1` (or user clicks explicit "Skip / No Photos" button).
* **What Opens Next**: Section 5 (Generate).
* **How to Reopen**: Tap the thumbnail strip or "Manage" button.
* **Keyboard Order**: Upload button $\rightarrow$ URL button $\rightarrow$ Photo cards $\rightarrow$ Next button.
* **ARIA & Heading Pattern**: Disclosure container with live region (`aria-live="polite"`) for upload state.

#### Section 5: Generate
* **Open Content**:
  * Compact horizontal process toggles:
    * Text: `Title`, `Description`, `Colors`, `Type`
    * Media: `Clean PNG`, `Hex map`, `Mask`, `Video`
  * Prominent "Generate" action button with sparkles icon.
  * Helper note indicating whether text is derived from photos or catalog donor items.
  * **Loading State**: Determinate progress bar + animated skeleton cards.
  * **Results State (HIDDEN until ready)**:
    * Title field with character counter (`0 / 70`) and copy/edit tools.
    * Extracted Colors palette tags.
    * Shopify Taxonomy Type tag.
    * HTML Marketing Description editor with preview toggle.
    * Media Viewer for Clean PNG / Cutout / Mask comparisons.
    * "Accept Generated" and "Discard" action bar.
* **Collapsed Summary**:
  * If generated: Badges `[Title Ready]`, `[Cutout PNG]`, `[4 Colors]`.
  * If skipped: `[AI Generation Skipped]`.
* **Filled Rule**:
  `runItem?.status === 'completed' || userExplicitlySavesWithoutAi`
* **What Opens Next**: Save Entry header button receives primary focus ring.
* **How to Reopen**: Tap "Review Generated Content".

---

## 3. The Type Selector & Categorical Suggestions

### The Redesigned Type Selector

#### 1. Desktop Experience ($\ge 720\text{ px}$ and Fine Pointer)
* **Search Field**: Sits at the top of the selector; typing filters visible items in real time ($< 16\text{ ms}$).
* **Compact Chip Buttons**: Rather than $1400\text{ px}$ of giant tiles, items are presented as inline wrapping chip buttons ($36\text{ px}$ height):
  ```
  [ 🪔 Pendant · 94 ]  [ 🥣 Bowl · 78 ]  [ 💡 Table Lamp · 77 ]  [ 🛶 Canoe · 47 ]
  [ 🪨 Rock · 42 ]     [ 🪞 Mirror · 38 ] [ 🏛️ Tower Lamp · 37 ]  [ 🍾 Wine Rack · 31 ]
  ```
  Each chip contains:
  * An embedded $24 \times 18\text{ px}$ procedural SVG hairline icon (`ShapeFigure`).
  * The canonical title in semibold text (`12px`).
  * The current inventory piece count in muted tabular numerals (`11px`).
* **Long-Tail Handling**: Top 12 types appear initially. A subtle "Show all 43 types ▾" chip expands the remaining types inline.
* **Selection Transition**: Clicking any chip instantly selects the Type, triggers a brief $150\text{ ms}$ subtle scale pulse, and collapses the entire section into the compact Hero Summary Card.

#### 2. Mobile Experience ($< 720\text{ px}$ or Coarse Pointer)
* **List Presentation**: In-flow list with clean separator lines meeting Apple's $44 \times 44\text{ pt}$ touch standard:
  * Left: $36 \times 36\text{ px}$ rounded plate with the hairline drawing.
  * Center: Type title in $14\text{ px}$ body font.
  * Right: Inventory count badge (`77 pcs`) and subtle chevron.
* **Search on Top**: Sticky search bar at the top of the container.
* **Free Typed Values**: If the search returns no match or the user desires a new type, a prominent button appears: `+ Add "{query}" as custom type`.

#### 3. Post-Selection Summary Card
```
┌────────────────────────────────────────────────────────────────────────┐
│  [ SVG Figure ]  Table Lamp · 77 pieces in inventory       [ Cambiar ] │
└────────────────────────────────────────────────────────────────────────┘
```
* Height: $56\text{ px}$.
* Displays the full-detail vector figure ($60 \times 48\text{ px}$), the selected name, and an accessible "Cambiar" (`Change`) button that re-expands the selector with keyboard focus preserved.

---

### Universal Suggestion Mechanism (Shape, Material, Color)

#### Elimination of the Datalist
Native `<datalist>` elements are completely removed. They suffer from OS-dependent z-index stacking issues, cannot be styled with glassmorphism, and physically collide with adjacent touch elements.

#### Single Mechanism per Device Class
* **Desktop ($\ge 720\text{ px}$ and `pointer: fine`)**:
  * Suggestions are rendered as **Chip Buttons** directly underneath the active input.
  * Chip styling: `--ui-well` background, $28\text{ px}$ height, $11\text{ px}$ uppercase display font, $6\text{ px}$ gap.
  * Clicking a chip immediately populates the input value without closing the group.
* **Mobile ($< 720\text{ px}$ or `pointer: coarse`)**:
  * Suggestions are rendered as a clean **Bottom Sheet or In-Flow List**.
  * Row height: $44\text{ px}$, generous touch targets, clear checkmarks on active selection.
* **Device Switching Strategy**:
  Dual-layered detection ensures zero layout mismatches:
  1. **CSS Media Query Layer**:
     ```css
     @media (min-width: 720px) and (pointer: fine) {
       .suggestion-chips-desktop { display: flex; }
       .suggestion-list-mobile { display: none; }
     }
     @media (max-width: 719px), (pointer: coarse) {
       .suggestion-chips-desktop { display: none; }
       .suggestion-list-mobile { display: flex; }
     }
     ```
  2. **React Hook Layer**: `useDeviceMode()` evaluates `window.matchMedia('(max-width: 719px), (pointer: coarse)')` to prevent rendering unneeded DOM nodes on constrained mobile devices.
* **Free-Typed Value Support**:
  The primary input remains a fully editable `<input type="text">`. Users can type arbitrary characters at any time. When typing a string not in the suggestion set, chips simply filter out; hitting `Enter` or blurring commits the custom string directly to `EntryState`.

---

## 4. Integrated AI Generation Architecture

### Compact Process Toggles
All eight generation tasks are organized into a single, compact toggle strip within Section 5:
* **Text Group**: `Title` · `Description` · `Colors` · `Type`
* **Media Group**: `Clean PNG` · `Hex map` · `Mask` · `Video`

Each process is represented as a toggle pill (`min-height: 32px`). Processes that require photos (`Clean PNG`, `Mask`, `Hex map`) automatically display a disabled warning tooltip (`"Requires photo"`) if Section 4 has no still images.

---

### Progressive Loading & Result Expansion

```
Phase 1: Pre-generation (Resting)
[ Toggles Strip ]   [ ✦ Generate ]   (Results container: HIDDEN)

Phase 2: In-Flight Execution
[ Toggles Strip ]   [ ■ Stop ]
┌────────────────────────────────────────────────────────────────────────┐
│  ⟳ Processing... Step 2 of 4: Removing background (Clean PNG)  45%     │
│  [==========================-----------------------------------------] │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │   [ Skeleton Image ]    │  │   [ Skeleton Title Bar ]             │ │
│  │   (Shimmer Effect)      │  │   [ Skeleton Text Paragraphs ]       │ │
│  └─────────────────────────┘  └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘

Phase 3: Completed Results (Expanded)
┌────────────────────────────────────────────────────────────────────────┐
│  Media View: [ Original | Clean PNG | Cutout | Mask | SVG ]            │
│  Title (52/70):   [ Large Cylindrical Mexican Onyx Table Lamp        ] │
│  Colors:          [ Amber ] [ Honey Cream ] [ Rust Vein ]              │
│  Taxonomy:        [ Home Decor > Lamps & Lighting > Table Lamps      ] │
│  Description:     [ Handcrafted from authentic Mexican onyx stone... ] │
│  Actions:         [ ✓ Accept All ]   [ ↺ Retry ]   [ ✕ Discard ]       │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Multi-Column Desktop vs. Stacked Mobile Layout

* **Desktop ($\ge 1024\text{ px}$)**:
  * When results are **empty / resting**: Section 5 spans the standard single column. The screen maintains generous whitespace.
  * When generation **completes**: The layout smoothly splits into a 2-column inspection workspace:
    * Left Column ($55\%$): Form summary and editable text attributes.
    * Right Column ($45\%$): High-fidelity `MediaViewer` showing the Clean PNG cutout, segmentation mask, vector SVG boundary, and color swatch inspector.
* **Mobile ($< 1024\text{ px}$)**:
  * Operates strictly in a single column. The results container smoothly expands directly below the Generate button, with media preview tabs stacked above editable text cards.

---

### Error Handling & Edge Cases

1. **No Photo Attached**:
   * If user triggers Generate without photos, image processes are disabled. The text engine invokes catalog donor matching (`donorInventory`), varying the description from the closest catalog item. A reassuring info banner is displayed: *"Text synthesized from matching catalog items. Upload a photo to enable Clean PNG and 3D Mask."*
2. **Failed Run**:
   * If the Gemini API or network upload fails, the container highlights the failed step in red (`--ui-bad`), presents the exact human-readable error, and renders a primary `[ ↺ Retry Failed ]` button without discarding already generated fields.
3. **Partial Run**:
   * If text generation succeeds but image segmentation fails (e.g., complex lighting), successful text fields are populated, while the failed media process displays an alert pill with a granular retry button for that step alone.

---

## 5. Responsive Layout & Design System Tokens

### Breakpoint Matrix

| Viewport | Container Width | Layout Structure | Section Behavior | Suggestion Format |
|---|---|---|---|---|
| **1440 px** (Desktop) | $1280\text{ px}$ max | Single column resting; 2-column split on Generate completion ($55\% / 45\%$) | Auto-collapsing accordions with $12\text{ px}$ gap | Compact Chip Buttons ($28\text{ px}$ height) |
| **1024 px** (Tablet) | $960\text{ px}$ max | Single column throughout; stacked media cards | Auto-collapsing accordions with $10\text{ px}$ gap | Compact Chip Buttons |
| **390 px** (Mobile) | $100\%$ ($358\text{ px}$ net) | Single column vertical stack; full width cards | Touch-friendly accordions with $8\text{ px}$ gap | Full-width List ($44\text{ px}$ touch rows) |

---

### Typographic Scale

| Role | Font Family | Size / Line Height | Tracking | Weight | CSS Token |
|---|---|---|---|---|---|
| **Display / Header** | DM Sans / Display | $13\text{ px} / 1.1$ | $+0.02\text{ em}$ | 800 | `var(--ui-font-display)` |
| **Section Title** | DM Sans / Display | $12\text{ px} / 1.2$ | $+0.08\text{ em}$ | 800 | `var(--ui-font-display)` |
| **Body / Inputs** | DM Sans | $13\text{ px} / 1.4$ | $0.00\text{ em}$ | 500 | `var(--ui-font-body)` |
| **Numbers / Dims** | JetBrains Mono / System | $13\text{ px} / 1.2$ | $-0.02\text{ em}$ | 700 | `var(--ui-font-mono)` |
| **Pills / Badges** | DM Sans | $11\text{ px} / 1.0$ | $+0.04\text{ em}$ | 700 | `var(--ui-font-display)` |
| **Metadata Labels** | DM Sans | $11\text{ px} / 1.2$ | $+0.10\text{ em}$ | 700 | `var(--ui-font-display)` |

---

### Design System Token Integration

All visual styling strictly derives from the established design tokens in `entry.css`, `submenuDock.css`, and `island.css`:

```css
:root {
  /* Liquid Glass Surface Tokens */
  --slab-glass-hi: color-mix(in srgb, #0a0c14 40%, transparent);
  --slab-glass-blur: 30px;
  --slab-glass-rim: rgba(255, 255, 255, 0.26);
  --slab-sheen: linear-gradient(160deg, rgba(255, 255, 255, 0.20) 0%, rgba(255, 255, 255, 0.05) 38%, rgba(255, 255, 255, 0) 62%, rgba(255, 255, 255, 0.07) 100%);

  /* UI Tokens */
  --ui-ground: #07090e;
  --ui-surface: rgba(255, 255, 255, 0.04);
  --ui-raise: rgba(255, 255, 255, 0.06);
  --ui-well: #14171c;
  --ui-edge: rgba(255, 255, 255, 0.10);
  --ui-edge-hi: rgba(255, 255, 255, 0.20);
  --ui-rim: rgba(255, 255, 255, 0.16);

  /* Chromatic Signals */
  --ui-accent: #00aeef;
  --ui-focus: #4fb3ff;
  --ui-good: #10b981;
  --ui-warn: #f59e0b;
  --ui-bad: #ef4444;

  /* Typography Colors */
  --ui-ink: #eef1f5;
  --ui-dim: #c5cdd8;
  --ui-faint: #8893a4;

  /* Geometry Radii */
  --ui-r-sm: 6px;
  --ui-r-md: 10px;
  --ui-r-lg: 16px;
  --ui-r-pill: 9999px;
  --ui-ease: 160ms cubic-bezier(0.2, 0.9, 0.3, 1);
}
```

---

### Resolution of Mascot Widget Overlap

To prevent the fixed Onyx Island portal (`.onyx-island-layer`, $z\text{-index } 10050$) from overlapping the "SINGLE ITEM" and "BATCH XLSX" tabs:
1. **Corridor Clearance**: `.entry-page__bar` is re-architected with `display: flex; justify-content: space-between; align-items: center; width: 100%;`. The tabs are pinned to the leading side (`flex-start`), and primary actions (Save, Cancel) to the trailing side (`flex-end`).
2. **Central Exclusion Buffer**: The center $280\text{ px}$ of the bar remains completely unoccupied, leaving a dedicated flight path for the Onyx Chan mascot face.
3. **Safe Area Inset**: `padding-top: calc(env(safe-area-inset-top, 0px) + 72px)` is applied to the page root, guaranteeing that the floating island never overlaps page controls during scroll or bounce.

---

## 6. Implementation & Component Architecture

### Component Inventory

```
src/features/entry/
├── EntryScreen.tsx             [MODIFIED: integrates collapsible section orchestration]
├── EntryForm.tsx               [REFACTORED: delegates to modular EntrySections]
├── GeneratePanel.tsx           [MODIFIED: hidden until ready; compact toggle bar]
├── TagRow.tsx                  [MODIFIED: desktop chip row with lead SVG figures]
├── entryModel.ts               [UNCHANGED: core state contract remains identical]
├── sections/
│   ├── EntrySection.tsx        [NEW: accessible collapsible section container]
│   ├── SectionSummary.tsx      [NEW: one-line chip summary bar]
│   ├── IdentitySection.tsx     [NEW: vendor, book, number, qty inputs]
│   ├── TypeSection.tsx         [NEW: compact chip selector & hero summary card]
│   ├── DetailsSection.tsx      [NEW: shape, material, dims, weight, price]
│   ├── PhotosSection.tsx       [NEW: dropzone, thumbnails, hero star]
│   └── GenerateSection.tsx     [NEW: compact toggles, skeleton, result card]
├── suggestions/
│   ├── SuggestionPicker.tsx    [NEW: responsive dispatcher: chips vs sheet]
│   ├── TypeChipRow.tsx         [NEW: desktop compact hairline chips]
│   └── TypeList.tsx            [NEW: mobile 44pt touch list with search]
└── styles/
    ├── entrySection.css        [NEW: collapsible accordion animations]
    └── suggestionPicker.css    [NEW: chip and mobile sheet styling]
```

---

### State Architecture

* **Global Jotai Atoms**:
  * `userAtom`, `inventoryAtom`, `InventoryVersionAtom`, `isAiProcessingEnabledAtom`, `isDummyModeAtom`.
* **Local State (Section Level)**:
  * `activeSection`: `'identity' | 'type' | 'details' | 'photos' | 'generate'`.
  * `completedSections`: `Set<SectionKey>`.
  * `isManualExpanded`: `Record<SectionKey, boolean>` allowing users to manually toggle any section.
  * Form fields remain bound to `form: EntryState` and `photos: EntryPhoto[]` in `EntryScreen.tsx` to preserve draft restoration (`useFormDraft`) and page stashing.

---

### Clean Inventory Categorization

To satisfy Requirement (5) (misspellings and duplicates removed), canonical mappings are enforced across `Type` and `Shape`:

```typescript
export const CANONICAL_TYPES: Record<string, string> = {
  'pendant': 'Pendant Light',
  'pendant light': 'Pendant Light',
  'lamp table': 'Table Lamp',
  'table lamp': 'Table Lamp',
  'bowl': 'Decorative Bowl',
  'bowls': 'Decorative Bowl',
  'canoe': 'Decorative Tray',
  'tray': 'Decorative Tray',
  'rock': 'Sculptural Rock',
  'mirror': 'Wall Mirror',
  'tower': 'Tower Lamp',
  'wine rack': 'Wine Rack',
  'fountain': 'Water Fountain',
  'pillar': 'Stone Pillar',
  'pedestal': 'Stone Pillar',
};

export const CANONICAL_SHAPES: Record<string, string> = {
  'cyl': 'Cylinder',
  'cylinder': 'Cylinder',
  'cilindro': 'Cylinder',
  'sq': 'Squared',
  'squared': 'Squared',
  'cuadrado': 'Squared',
  'round': 'Round',
  'redondo': 'Round',
  'rect': 'Rectangular',
  'rectangular': 'Rectangular',
  'organic': 'Organic',
  'freeform': 'Organic',
};
```

---

### Internationalization Dictionary (Mexican Spanish, Tú Form)

```typescript
export const ADD_ENTRY_I18N = [
  ["Identity", "Identidad"],
  ["Type", "Tipo"],
  ["Details", "Detalles"],
  ["Photos", "Fotos"],
  ["Generate", "Generar"],
  ["Pick a type", "Elige un tipo"],
  ["Find a type", "Buscar tipo"],
  ["Show all {n} types", "Ver los {n} tipos"],
  ["Show fewer", "Ver menos"],
  ["Change", "Cambiar"],
  ["Vendor", "Artesano"],
  ["Book", "Libro"],
  ["Quantity", "Cantidad"],
  ["Shape", "Forma"],
  ["Material", "Material"],
  ["Vendor colour", "Color del artesano"],
  ["Status", "Estado"],
  ["W cm", "Ancho cm"],
  ["D cm", "Largo cm"],
  ["H cm", "Alto cm"],
  ["Kg", "Peso kg"],
  ["Price MXN", "Precio MXN"],
  ["Vendor note", "Nota del artesano"],
  ["Save entry", "Guardar entrada"],
  ["Save changes", "Guardar cambios"],
  ["Add photos", "Agregar fotos"],
  ["Drop photos or videos here", "Arrastra fotos o videos aquí"],
  ["Generate content", "Generar contenido con IA"],
  ["Generating content...", "Generando contenido..."],
  ["Accept generated", "Aceptar generado"],
  ["Discard generated", "Descartar generado"],
  ["Next: {section}", "Continuar a {section}"],
  ["Keep editing", "Seguir editando"],
  ["Discard and close", "Descartar y cerrar"],
  ["Type your own", "Escribe tu propio tipo"],
] as const;
```

---

### Test Suite Matrix

1. **Unit Tests (`src/features/entry/__tests__/entryFlow.test.ts`)**:
   * Verification of section filled rules (`isSectionFilled('identity', state)`).
   * Accurate canonical type mapping and misspelling resolution.
   * Duplicate item number checking logic with boundary conditions.
2. **Interaction Tests (`src/features/entry/__tests__/EntrySection.test.tsx`)**:
   * Verifying that completing Section 1 automatically advances focus to Section 2.
   * Ensuring selecting a Type chip collapses the Type selector and renders the summary card.
   * Verifying that clicking "Cambiar" re-expands the selector with focus returned to search.
3. **Suggestion Collision Tests (`src/features/entry/__tests__/suggestions.test.tsx`)**:
   * Verifying that no native `<datalist>` elements are mounted in the DOM.
   * Desktop viewport renders `SuggestionChips`; mobile viewport renders `SuggestionList`.
4. **Accessibility Tests**:
   * Axe-core zero violation check on expanded and collapsed states.
   * Full keyboard navigation (Tab, Arrow keys, Enter, Escape).
   * High contrast validation under light and dark themes.

---

## 7. Accessibility Checklist & Reduced Motion Plan

### Accessibility Checklist (WCAG 2.2 Level AA)
* [x] **Touch Target Sizing**: All interactive buttons, chips, and inputs maintain a minimum bounding box of $44 \times 44\text{ pt}$ on mobile and $28 \times 28\text{ pt}$ on desktop (`accessibility.md › Mobility`).
* [x] **Contrast Compliance**: Primary text achieves $> 12:1$; secondary text achieves $> 4.5:1$ against glass and well surfaces. No text is rendered under $10\text{ pt}$ (`accessibility.md › Vision`).
* [x] **Non-Color Indicators**: Every state change (duplicate warning, hero photo star, active process toggle, section completion) pairs color with an explicit icon and text label (`accessibility.md › Convey information with more than color alone`).
* [x] **Full Keyboard Access**:
  * `Tab` traverses between active inputs.
  * `ArrowUp` / `ArrowDown` navigates suggestion lists and type grids.
  * `Escape` clears active suggestion popovers and returns focus to the input.
  * `Ctrl+S` / `Cmd+S` initiates save from anywhere in the document.
* [x] **Screen Reader Semantics**:
  * Collapsible sections implement `aria-expanded`, `aria-controls`, and `role="region"`.
  * Dynamic generated results declare `aria-live="polite"` to announce completed steps without interrupting typing.

---

### Reduced Motion Plan
In compliance with [motion.md › Best practices](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/motion.md#L18-L31) and [accessibility.md › Cognitive](file:///C:/Jouhayerk/git/onyxchan-wt/E1-3/docs/_inputs/hig/accessibility.md#L113-L120):
* When `(prefers-reduced-motion: reduce)` is enabled:
  * All accordion height transitions are set to `transition: none !important;`. Sections toggle immediately without sliding.
  * Physics lift on vector cards (`--sf-lift`) is clamped to `0`.
  * Sweep gradients and pulsing indicators (`.onyx-island-unread`, shimmer skeletons) are replaced with static high-contrast borders.
  * Modal dialogs open with a pure instantaneous opacity cut rather than scaling springs.

---

## 8. Open Questions for the Owner

1. **Auto-Collapse Speed Preference**:
   * *Option A (Default)*: Section collapses automatically $200\text{ ms}$ after its last required field is filled.
   * *Option B*: Section only collapses when the user presses an explicit "Continue" button or taps the next section header.
2. **Batch Acquisition Flow**:
   * Does the Chief want the newly completed item to automatically seed the Vendor and Book fields for the immediate next entry in high-speed warehouse logging? (Currently implemented as `resetForNext()`).
3. **AI Generation Budget**:
   * When creating multiple single entries in rapid succession, should the 4 text generation processes run concurrently in the background as a background task, or remain strictly user-initiated per item?

---
*End of Specification.*
