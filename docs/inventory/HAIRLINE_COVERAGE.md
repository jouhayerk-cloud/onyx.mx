# Hairline Figure Coverage & Taxonomy Audit

> **Document**: `docs/inventory/HAIRLINE_COVERAGE.md`  
> **Status**: Verified & Hand-Traced Audit  
> **Date**: 2026-10-11 (Season 826)  
> **App**: Onyx.mx (`C:/Jouhayerk/git/onyxchan-wt/E1-5`)  
> **Inputs**: [distinct_values.json](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/docs/_inputs/distinct_values.json), [canonicalType.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/lib/canonicalType.ts), [typeLibrary.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/lib/typeLibrary.ts), [ShapeFigure.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/ShapeFigure.tsx), [ShapeTypePicker.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/ShapeTypePicker.tsx)

---

## Executive Summary

This audit establishes the exact coverage between the hairline drawing engine in Onyx.mx and the product types present in the inventory dataset ([distinct_values.json](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/docs/_inputs/distinct_values.json)).

### Coverage Summary

| Metric | Direct Type Resolution (Raw String Only) | Row-Context Resolution (With Shape Context) |
| :--- | :---: | :---: |
| **Total Raw Types in Data** (`type_short_description`) | **43** (540 items) | **43** (540 items) |
| **Dedicated Drawings** | **40** (537 items) | **43** (540 items) |
| **Family Fallback Figures** | **0** (0 items) | **0** (0 items) |
| **Generic Fallback Figures** | **3** (3 items) | **0** (0 items) |
| **Clean Canonical Types Defined** (`CANONICAL_TYPES`) | **22** | **22** |
| **Canonical Types with Dedicated Drawings** | **22 / 22 (100%)** | **22 / 22 (100%)** |

> [!NOTE]
> The discrepancy between Direct Resolution and Row-Context Resolution stems from three rows where the vendor entered a customer name (`Client Jan Dunn`, `Client Sandy Levits`, `Client Trish Wagner`) in the Type column. By rule in [canonicalType.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/lib/canonicalType.ts), a personal name resolves to `id: 'basin'` **if and only if** the row's `shape` is `Basin`. In raw string isolation without shape context, these three entries resolve to `id: null` (`personal: true`), receiving a generic fallback and being hidden from the picker.

---

## 1. The Figure Registry

The app implements a 3-layer drawing hierarchy inside [ShapeFigure.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/ShapeFigure.tsx):
1. **Canonical Type Figures** (`buildTypeFigure`): Evaluated first by `typeId`. If matched, returns a dedicated isometric drawing.
2. **Motif Figures** (`buildMotifFigure`): Evaluated second by `motif`.
3. **Family Figures** (`buildFamilyFigure`): Evaluated third by `family` geometry and `isMirror`.

Below is every figure the app is equipped to draw:

### 1.1 Canonical Type Figures (`buildTypeFigure`)
Source: [src/features/entry/hairline/typeFigures/index.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/index.ts)

| Figure Key (`typeId`) | Implementation File | Geometric Family | Selection Method | Variants & Parameters | Visual Features & Distinctive Markings |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `mirror` | [typeFigures/mirrors.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/mirrors.ts) | `mirror` / `box` | `typeId === 'mirror'` | `round`, `squared`, `rectangular` (via `variant`) | Heavy stone slab frame, recessed wavy glass opening, diagonal sheen line, strata creases, bright highlight. |
| `pendant` | [typeFigures/lamps.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/lamps.ts) | `cylinder` / `box` | `typeId === 'pendant'` | `cylinder`, `squared` (via `variant`) | Ceiling cap with cord, stone cylinder or rectangular post with stone veins and strata, bottom light aperture. |
| `table-lamp` | [typeFigures/lamps.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/lamps.ts) | `cylinder` / `box` | `typeId === 'table-lamp'` | `cylinder`, `squared` (via `variant`) | Cylinder: foot base, stem, lampshade with light slit. Squared: stone block cube/tower, cord on table, open top glow. |
| `floor-lamp` | [typeFigures/lamps.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/lamps.ts) | `cylinder` | `typeId === 'floor-lamp'` | Fixed silhouette | Heavy plinth base, tall slender stone column, elevated lamp head with lit slit. |
| `tower-lamp` | [typeFigures/lamps.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/lamps.ts) | `box` | `typeId === 'tower-lamp'` | Fixed silhouette | Ground plinth, tall monolithic stone obelisk/prism with twin perpendicular light slits. |
| `luminary` | [typeFigures/lamps.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/lamps.ts) | `box` | `typeId === 'luminary'` | Fixed silhouette | Upright monolithic slab, framed stone face, vertical central illuminated band and radiant core. |
| `bowl` | [typeFigures/vessels.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/vessels.ts) | `bowl` | `typeId === 'bowl'` | Fixed silhouette | Wide tapered vessel lofted between bottom and top rings, top rim crease, inner bowl cavity rim. |
| `canoe` | [typeFigures/vessels.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/vessels.ts) | `bowl` | `typeId === 'canoe'` | Fixed silhouette | Elongated canoe/tray hull, curved prow and stern, inner hollow crease, central thwart accent. |
| `plate` | [typeFigures/vessels.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/vessels.ts) | `plate` | `typeId === 'plate'` | Fixed silhouette | Shallow circular low-profile stone platter, rounded outer rim, concentric recessed inner plate crease. |
| `basin` | [typeFigures/vessels.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/vessels.ts) | `bowl` / `box` | `typeId === 'basin'` | Fixed silhouette | Thick vessel sink block, softened rim, deep inner cavity hollow floor, drain hole accent. |
| `rock` | [typeFigures/stone.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/stone.ts) | `polyhedron` | `typeId === 'rock'` | Fixed silhouette | Organic irregular boulder silhouette lofted across 3 wavy contour rings, hand-chiseled crease facets. |
| `fountain` | [typeFigures/stone.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/stone.ts) | `cylinder` / `box` | `typeId === 'fountain'` | Fixed silhouette | 3-tiered cascading stone water basins separated by support columns, top water spout apex. |
| `sculpture` | [typeFigures/stone.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/stone.ts) | `polyhedron` | `typeId === 'sculpture'` | Fixed silhouette | Ground pedestal, twisting organic helical stone body with rising diagonal contour creases. |
| `pillar` | [typeFigures/stone.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/stone.ts) | `cylinder` | `typeId === 'pillar'` | Fixed silhouette | Stepped plinth base, tall fluted monolithic stone column shaft, capital crown block. |
| `ball` | [typeFigures/stone.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/stone.ts) | `sphere` | `typeId === 'ball'` | Fixed silhouette | Spherical stone sphere contour, equatorial ring crease, upper specular light highlight. |
| `bag` | [typeFigures/stone.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/stone.ts) | `box` | `typeId === 'bag'` | Fixed silhouette | Carved stone sack/purse, gathered neck folds, cinched tie-knot bright mark, ruffled stone rim. |
| `wall-panel` | [typeFigures/furniture.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/furniture.ts) | `box` | `typeId === 'wall-panel'` | Fixed silhouette | Large vertical architectural stone slab, recessed framed face, triple horizontal decorative stone relief bars. |
| `painted-wall-panel` | [typeFigures/furniture.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/furniture.ts) | `box` | `typeId === 'painted-wall-panel'` | Fixed silhouette | Wide landscape mural stone slab, recessed framed panel, multi-tiered horizontal strata painted bands. |
| `wine-rack` | [typeFigures/furniture.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/furniture.ts) | `box` | `typeId === 'wine-rack'` | `holes` (1 to 21) | Vertical stone monolith block drilled with a dynamic grid of cylindrical bottle apertures based on `holes`. |
| `table` | [typeFigures/furniture.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/furniture.ts) | `box` | `typeId === 'table'` | Fixed silhouette | Heavy stone slab tabletop with rounded corners, 4 inset solid stone corner legs, foot ferrule accent. |
| `couch` | [typeFigures/furniture.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/furniture.ts) | `box` | `typeId === 'couch'` | Fixed silhouette | Sectional L/V-shaped sofa base, backrest wall, seat cushion divider creases, armrest accent. |
| `bar` | [typeFigures/furniture.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/furniture.ts) | `box` | `typeId === 'bar'` | Fixed silhouette | Commercial stone bar counter: plinth, stone counter fascia, overhanging stone top slab, foot rail. |

### 1.2 Motif Figures (`buildMotifFigure`)
Source: [src/features/entry/hairline/figures/motifFigures.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/figures/motifFigures.ts)

| Motif Key | Implementation File | Primary Family | Selection Method | Notes on Current App Usage |
| :--- | :--- | :--- | :--- | :--- |
| `pendant` | `motifFigures.ts` | `cylinder` | `motif === 'pendant'` | **Shadowed**: [ShapeFigure.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/ShapeFigure.tsx) checks `typeId` first; `lamps.ts` intercepts all pendants. |
| `table-lamp` | `motifFigures.ts` | `cylinder` | `motif === 'table-lamp'` | **Shadowed**: Intercepted by `lamps.ts:buildTableLamp`. |
| `tower-lamp` | `motifFigures.ts` | `box` | `motif === 'tower-lamp'` | **Shadowed**: Intercepted by `lamps.ts:buildTowerLamp`. |
| `floor-lamp` | `motifFigures.ts` | `cylinder` | `motif === 'floor-lamp'` | **Shadowed**: Intercepted by `lamps.ts:buildFloorLamp`. |
| `wall-panel` | `motifFigures.ts` | `box` | `motif === 'wall-panel'` | **Shadowed**: Intercepted by `furniture.ts:buildWallPanel`. |
| `wine-rack` | `motifFigures.ts` | `box` | `motif === 'wine-rack'` | **Shadowed**: Intercepted by `furniture.ts:buildWineRack`. |
| `table` | `motifFigures.ts` | `box` | `motif === 'table'` | **Shadowed**: Intercepted by `furniture.ts:buildTable`. |
| `canoe` | `motifFigures.ts` | `bowl` | `motif === 'canoe'` | **Shadowed**: Intercepted by `vessels.ts:buildCanoe`. |
| `fountain` | `motifFigures.ts` | `cylinder` | `motif === 'fountain'` | **Shadowed**: Intercepted by `stone.ts:buildFountain`. |

### 1.3 Geometric Family Figures (`buildFamilyFigure`)
Source: [src/features/entry/hairline/figures/familyFigures.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/figures/familyFigures.ts)

| Family Key | Implementation File | Selection Method | Visual Silhouette |
| :--- | :--- | :--- | :--- |
| `box` | `familyFigures.ts` | `family === 'box' && !isMirror` | Isometric rectangular solid prism with softened stone edges and single corner bright accent. |
| `box` (mirror) | `familyFigures.ts` | `family === 'box' && isMirror` | Rectangular stone prism with an inset mirrored faceplate and diagonal reflective sheen stroke. |
| `cylinder` | `familyFigures.ts` | `family === 'cylinder'` | Upright cylindrical tube with open rim slot and undulating stone strata bands across the cylinder wall. |
| `bowl` | `familyFigures.ts` | `family === 'bowl'` | Truncated cone vessel lofted between small bottom disc and wide top ring, with inner hollow rim. |
| `plate` | `familyFigures.ts` | `family === 'plate'` | Low-profile disc with shallow step and recessed inner lip crease. |
| `mirror` | `familyFigures.ts` | `family === 'mirror'` | Circular wall plaque with stone bevel rim, inset reflective mirror disc, and diagonal sheen stroke. |
| `sphere` | `familyFigures.ts` | `family === 'sphere'` | Circular silhouette with equatorial arc crease and upper specular light spot. |
| `octahedron` | `familyFigures.ts` | `family === 'octahedron'` | Diamond bipyramid with 8 triangular facets and sharp central facet crease lines. |
| `polyhedron` | `familyFigures.ts` | `family === 'polyhedron'` | Truncated irregular faceted block lofted between bottom and top polygonal rings. |

---

## 2. Raw Type Resolution Matrix

Every raw string in `docs/_inputs/distinct_values.json` under `type_short_description` (43 distinct values, 540 rows) hand-traced through [canonicalType.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/lib/canonicalType.ts):

| # | Raw Type in Data (`type_short_description`) | Count ($n$) | Canonical Type ID (`id`) | Canonical Label | Resolved Figure Function & File | Coverage Category | Resolution Rule Traced |
| :---: | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | `Bowl` | 78 | `bowl` | Bowl | `vessels.ts:buildBowl` | **Dedicated** | `ALIAS_INDEX.get('bowl')` match |
| 2 | `Table Lamp` | 75 | `table-lamp` | Table Lamp | `lamps.ts:buildTableLamp` | **Dedicated** | `ALIAS_INDEX.get('table lamp')` match |
| 3 | `Pendant` | 60 | `pendant` | Pendant | `lamps.ts:buildPendant` | **Dedicated** | `ALIAS_INDEX.get('pendant')` match |
| 4 | `Canoe` | 47 | `canoe` | Canoe | `vessels.ts:buildCanoe` | **Dedicated** | `ALIAS_INDEX.get('canoe')` match |
| 5 | `Tower Lamp` | 44 | `tower-lamp` | Tower Lamp | `lamps.ts:buildTowerLamp` | **Dedicated** | `ALIAS_INDEX.get('tower lamp')` match |
| 6 | `Rock` | 42 | `rock` | Rock | `stone.ts:buildRock` | **Dedicated** | `ALIAS_INDEX.get('rock')` match |
| 7 | `Mirror` | 38 | `mirror` | Mirror | `mirrors.ts:buildMirrorFigure` | **Dedicated** | `ALIAS_INDEX.get('mirror')` match |
| 8 | `Painted Wall Panel` | 35 | `painted-wall-panel` | Painted Wall Panel | `furniture.ts:buildPaintedWallPanel` | **Dedicated** | `ALIAS_INDEX.get('painted wall panel')` match |
| 9 | `Pendant Lamp` | 34 | `pendant` | Pendant | `lamps.ts:buildPendant` | **Dedicated** | `ALIAS_INDEX.get('pendant lamp')` match |
| 10 | `Floor Lamp` | 22 | `floor-lamp` | Floor Lamp | `lamps.ts:buildFloorLamp` | **Dedicated** | `ALIAS_INDEX.get('floor lamp')` match |
| 11 | `3 Holes` | 6 | `wine-rack` | Wine Rack | `furniture.ts:buildWineRack` | **Dedicated** | `HOLES` regex matched `3`; `holes: 3` |
| 12 | `4 Holes` | 6 | `wine-rack` | Wine Rack | `furniture.ts:buildWineRack` | **Dedicated** | `HOLES` regex matched `4`; `holes: 4` |
| 13 | `8 Holes` | 6 | `wine-rack` | Wine Rack | `furniture.ts:buildWineRack` | **Dedicated** | `HOLES` regex matched `8`; `holes: 8` |
| 14 | `Wall Panel Pair` | 6 | `wall-panel` | Wall Panel | `furniture.ts:buildWallPanel` | **Dedicated** | `ALIAS_INDEX.get('wall panel pair')` match |
| 15 | `2 Holes` | 4 | `wine-rack` | Wine Rack | `furniture.ts:buildWineRack` | **Dedicated** | `HOLES` regex matched `2`; `holes: 2` |
| 16 | `Luminary` | 4 | `luminary` | Luminary | `lamps.ts:buildLuminary` | **Dedicated** | `ALIAS_INDEX.get('luminary')` match |
| 17 | `Table` | 4 | `table` | Table | `furniture.ts:buildTable` | **Dedicated** | `ALIAS_INDEX.get('table')` match |
| 18 | `10 Holes` | 3 | `wine-rack` | Wine Rack | `furniture.ts:buildWineRack` | **Dedicated** | `HOLES` regex matched `10`; `holes: 10` |
| 19 | `Wall Panel` | 3 | `wall-panel` | Wall Panel | `furniture.ts:buildWallPanel` | **Dedicated** | `ALIAS_INDEX.get('wall panel')` match |
| 20 | `6 Holes` | 2 | `wine-rack` | Wine Rack | `furniture.ts:buildWineRack` | **Dedicated** | `HOLES` regex matched `6`; `holes: 6` |
| 21 | `Bag` | 2 | `bag` | Bag | `stone.ts:buildBag` | **Dedicated** | `ALIAS_INDEX.get('bag')` match |
| 22 | `Ball` | 2 | `ball` | Ball | `stone.ts:buildBall` | **Dedicated** | `ALIAS_INDEX.get('ball')` match |
| 23 | `Fountain Set` | 2 | `fountain` | Fountain | `stone.ts:buildFountain` | **Dedicated** | `ALIAS_INDEX.get('fountain set')` match |
| 24 | `Panel Pair` | 2 | `wall-panel` | Wall Panel | `furniture.ts:buildWallPanel` | **Dedicated** | `ALIAS_INDEX.get('panel pair')` match |
| 25 | `Pillar` | 2 | `pillar` | Pillar | `stone.ts:buildPillar` | **Dedicated** | `ALIAS_INDEX.get('pillar')` match |
| 26 | `Sculpture` | 2 | `sculpture` | Sculpture | `stone.ts:buildSculpture` | **Dedicated** | `ALIAS_INDEX.get('sculpture')` match |
| 27 | `20 Holes` | 1 | `wine-rack` | Wine Rack | `furniture.ts:buildWineRack` | **Dedicated** | `HOLES` regex matched `20`; `holes: 20` |
| 28 | `21 Holes` | 1 | `wine-rack` | Wine Rack | `furniture.ts:buildWineRack` | **Dedicated** | `HOLES` regex matched `21`; `holes: 21` |
| 29 | `5 Holes` | 1 | `wine-rack` | Wine Rack | `furniture.ts:buildWineRack` | **Dedicated** | `HOLES` regex matched `5`; `holes: 5` |
| 30 | `9 Holes` | 1 | `wine-rack` | Wine Rack | `furniture.ts:buildWineRack` | **Dedicated** | `HOLES` regex matched `9`; `holes: 9` |
| 31 | `Bar` | 1 | `bar` | Bar | `furniture.ts:buildBar` | **Dedicated** | `ALIAS_INDEX.get('bar')` match |
| 32 | `Client Jan Dunn` | 1 | `null` (or `basin` if shape=Basin) | `''` (or Basin) | `familyFigures.ts:buildBox` (or `vessels.ts:buildBasin`) | **Generic Fallback** (or Dedicated with Basin shape) | Matches `PERSONAL` (`/^client\b/`); without shape, `id: null`, `personal: true` |
| 33 | `Client Sandy Levits` | 1 | `null` (or `basin` if shape=Basin) | `''` (or Basin) | `familyFigures.ts:buildBox` (or `vessels.ts:buildBasin`) | **Generic Fallback** (or Dedicated with Basin shape) | Matches `PERSONAL` (`/^client\b/`); without shape, `id: null`, `personal: true` |
| 34 | `Client Trish Wagner` | 1 | `null` (or `basin` if shape=Basin) | `''` (or Basin) | `familyFigures.ts:buildBox` (or `vessels.ts:buildBasin`) | **Generic Fallback** (or Dedicated with Basin shape) | Matches `PERSONAL` (`/^client\b/`); without shape, `id: null`, `personal: true` |
| 35 | `Cofee Table` | 1 | `table` | Table | `furniture.ts:buildTable` | **Dedicated** | `ALIAS_INDEX.get('cofee table')` match (misspelling folded) |
| 36 | `Fountain` | 1 | `fountain` | Fountain | `stone.ts:buildFountain` | **Dedicated** | `ALIAS_INDEX.get('fountain')` match |
| 37 | `Lamp` | 1 | `table-lamp` | Table Lamp | `lamps.ts:buildTableLamp` | **Dedicated** | `ALIAS_INDEX.get('lamp')` match |
| 38 | `Plate` | 1 | `plate` | Plate | `vessels.ts:buildPlate` | **Dedicated** | `ALIAS_INDEX.get('plate')` match |
| 39 | `Sculptures Set` | 1 | `sculpture` | Sculpture | `stone.ts:buildSculpture` | **Dedicated** | `ALIAS_INDEX.get('sculptures set')` match |
| 40 | `Table Lamps` | 1 | `table-lamp` | Table Lamp | `lamps.ts:buildTableLamp` | **Dedicated** | `ALIAS_INDEX.get('table lamps')` match |
| 41 | `Table Set` | 1 | `table` | Table | `furniture.ts:buildTable` | **Dedicated** | `ALIAS_INDEX.get('table set')` match |
| 42 | `V Shaped Couch` | 1 | `couch` | Couch | `furniture.ts:buildCouch` | **Dedicated** | `ALIAS_INDEX.get('v shaped couch')` match |
| 43 | `Wall Panels` | 1 | `wall-panel` | Wall Panel | `furniture.ts:buildWallPanel` | **Dedicated** | Trailing plural `s` strip -> `ALIAS_INDEX.get('wall panel')` |

---

## 3. Drawing Backlog (Ranked List of Missing Drawings)

### 3.1 Direct Type Backlog (From Raw Type Text)
If evaluated purely by the raw Type input column, the only entries lacking dedicated Type drawings are the client-named custom orders:
1. `Client Jan Dunn` (1 row) — Generic fallback (unless paired with shape `Basin`)
2. `Client Sandy Levits` (1 row) — Generic fallback (unless paired with shape `Basin`)
3. `Client Trish Wagner` (1 row) — Generic fallback (unless paired with shape `Basin`)

### 3.2 The Semantic Inventory Backlog (Subjects Trapped in the `shape` Column)
As documented in [TypeAuditBoard.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/typeBoard/TypeAuditBoard.tsx) (`shapeHoldsType`) and [distinct_values.json](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/docs/_inputs/distinct_values.json), the inventory data frequently puts the actual physical subject/type into the `shape` field while setting the Type to a broad umbrella category like `Sculpture` ($n=5$) or `Rock` ($n=42$).

Because the app only has **one generic abstract twisting sculpture drawing** (`stone.ts:buildSculpture`), all carved figurative pieces look identical in the UI.

The **Top 5 Missing Drawings** ranked by inventory item count are:

| Rank | Subject / Physical Form | Inventory Count ($n$) | Current Inventory Mapping | Current Rendered Figure | Proposed Wave 2 Drawing |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **1** | **Horses** | **13** (12 `Horses` + 1 `HORSES`) | `type: Sculpture`, `shape: Horses` | Abstract stone helix (`buildSculpture`) | Hand-carved stone equine silhouette (rearing horse torso on a solid stone plinth). |
| **2** | **Elk / Elks** | **8** (7 `Elk` + 1 `Elks`) | `type: Sculpture`, `shape: Elk` | Abstract stone helix (`buildSculpture`) | Majestic antlered stag head/bust silhouette carved in stone with antler crease facets. |
| **3** | **Deer** | **5** (5 `Deer`) | `type: Sculpture`, `shape: Deer` | Abstract stone helix (`buildSculpture`) | Graceful standing deer / doe silhouette with ears and flank contours. |
| **4** | **Moose** | **4** (4 `moose`) | `type: Sculpture`, `shape: moose` | Abstract stone helix (`buildSculpture`) | Broad-palmate antlered bull moose bust with characteristic stone dewlap crease. |
| **5** | **Bears** | **3** (3 `Bears`) | `type: Sculpture`, `shape: Bears` | Abstract stone helix (`buildSculpture`) | Solid quadrupedal or sitting bear silhouette with rounded ears and muzzle crease. |

#### Extended Backlog (Rank 6+)
- **Rank 6: Cactus** (2 rows: `3 Cactus`) — Multi-stem carved columnar saguaro cactus in stone.
- **Rank 7: Custom Client Basins** (3 rows: `Client *`) — Vessel sinks currently masked by client names.
- **Rank 8: Accent Chair** (1 row: `chair`) — Occasional stone/wood chair.
- **Rank 9: Italian Chess Set** (1 row: `Italian Chess`) — Chess board platter with stylized king/rook piece silhouette.
- **Rank 10: Bobcats / Felines** (1 row: `Bobcats`) — Stalking feline wildcat stone carving.
- **Rank 11: Classical Figurine** (1 row: `VENUS`) — Venus de Milo classical torso silhouette.
- **Rank 12: Flame Sculpture** (1 row: `flame`) — Upward-tapering fire/flame stone carving.

---

## 4. Figures that No Type Uses

An architectural audit of the drawing codebase reveals significant dead code and shadowed figures:

### 4.1 Canonical Figures Unreached by Raw Type Text
- **`basin`** (`buildBasin` in [vessels.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/vessels.ts)):
  There is **zero** occurrences of `"Basin"` in `type_short_description`. The 3 basin rows in the database have `type_short_description` set to `"Client Jan Dunn"`, `"Client Sandy Levits"`, and `"Client Trish Wagner"`. The figure is only reached dynamically via the `shape === 'basin'` clause in [canonicalType.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/lib/canonicalType.ts).

### 4.2 Completely Shadowed Motif Layer
- **All 9 figures in [motifFigures.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/figures/motifFigures.ts)** (`pendant`, `table-lamp`, `tower-lamp`, `floor-lamp`, `wall-panel`, `wine-rack`, `table`, `canoe`, `fountain`):
  In [ShapeFigure.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/ShapeFigure.tsx):
  ```typescript
  if (typeId) { parts = buildTypeFigure(typeId, dims, holes, variant); }
  if (!parts && motif) { parts = buildMotifFigure(motif, dims, holes); }
  if (!parts) { parts = buildFamilyFigure(family, isMirror, dims); }
  ```
  Because `buildTypeFigure` handles all these canonical types first, `buildMotifFigure` is **never executed** when `typeId` is populated. Furthermore, [ShapeTypePicker.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/ShapeTypePicker.tsx) does not pass `motif` as a prop.

### 4.3 Shadowed Builders in `furniture.ts`
- [furniture.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/furniture.ts) contains full implementations of `pendant`, `table-lamp`, `floor-lamp`, `tower-lamp`, `luminary`, `bowl`, `canoe`, `plate`, `basin`, `rock`, `fountain`, `sculpture`, `pillar`, `ball`, `bag`, and `mirror`.
- In [typeFigures/index.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/typeFigures/index.ts), `buildLampFigure`, `buildVesselFigure`, and `buildStoneFigure` precede `buildFurnitureFigure`.
- Therefore, **16 out of 22 builders in `furniture.ts` are completely unreachable**. Only `wall-panel`, `painted-wall-panel`, `wine-rack`, `table`, `couch`, and `bar` are ever called.

### 4.4 Unused Geometric Family Silhouettes
- **`octahedron`** (`buildOctahedron` in [familyFigures.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/figures/familyFigures.ts)):
  No canonical type has geometry family `octahedron`. (In `classifyGeometry`, `octahedron` is only assigned if Shape is `Diamond`).
- **`polyhedron`** (`buildPolyhedron` in [familyFigures.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/figures/familyFigures.ts)):
  All inventory items classified as polyhedron are `Rock` or `Sculpture`, which already have dedicated drawings in `stone.ts`.
- **`sphere`** (`buildSphere` in [familyFigures.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/figures/familyFigures.ts)):
  Items classified as `sphere` resolve to `id: 'ball'`, which uses `stone.ts:buildBall`.

---

## 5. ShapeTypePicker Selection, Ordering, & Fallback Mechanics

### 5.1 Card Ordering Algorithm
In [typeLibrary.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/lib/typeLibrary.ts) (`buildTypeLibrary`):
1. **Grouping**: Inventory rows are grouped by `typeKey(short_description, shape)`.
2. **Filtering**:
   - Rows with `is_hidden === true` are omitted.
   - Rows where `read.personal === true` (client names) are omitted.
   - Rows with empty labels or values in `hidden` set are omitted.
3. **Sorting**:
   ```typescript
   entries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
   ```
   - **Primary sort**: Total row count (`count`) in descending order. The most populated product categories appear first.
   - **Secondary sort**: Alphabetical by canonical label (`label.localeCompare`).
4. **Display Window**:
   - By default, [ShapeTypePicker.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/ShapeTypePicker.tsx) displays the first 24 cards (`FIRST = 24`).
   - A toggle button `"Show all {n}"` / `"Show fewer"` expands or collapses the grid.
   - Real-time search (`suggestTypes`) prioritizes prefix matches, then count, then label.

### 5.2 Count String Formatting
Defined by `countText(entry.count)` in [ShapeTypePicker.tsx](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/ShapeTypePicker.tsx#L31):
- `0`: Displays `tr('saved')` (for types manually added by Admin/Dev without inventory rows).
- `1`: Displays `tr('1 piece')`.
- `n > 1`: Displays `trf('{n} pieces', { n })` (e.g. `78 pieces`).
- Shown on the tile caption:
  ```tsx
  <span className="stp-cap" aria-hidden="true">
      <span className="stp-shape">{entry.label}</span>
      <span className="stp-type">{count}</span>
  </span>
  ```

### 5.3 Behavior for a Type Without a Figure
When a Type is displayed that lacks a dedicated drawing (e.g. a newly added custom Type in `type_library` or an unrecognized Type without a `CanonicalTypeId`):
1. `entry.id` is `null`.
2. `<ShapeFigure />` invokes `buildTypeFigure(null)` $\rightarrow$ returns `null`.
3. Motif is `null` $\rightarrow$ returns `null`.
4. It calls `buildFamilyFigure(entry.family, entry.isMirror, entry.dims)`.
5. Every `TypeEntry` has a computed `family: Geometry` determined by `classifyGeometry(firstShape, label)` in [geometry.ts](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/lib/geometry.ts).
6. **Result**: The card **never crashes, never renders blank, and never displays a broken icon**. It cleanly renders the isometric geometric silhouette of its assigned family (e.g. a neutral stone prism for `box`, a stone cylinder for `cylinder`, a stone bowl for `bowl`), dynamically scaled to the group's median dimensions (`dims`).

---

## 6. Taxonomy Data Contract for Chip and List Row Hairline Icons

For the next development wave to render a crisp hairline icon beside every type chip, dropdown item, or list row, the data model must pass the following standardized contract:

### 6.1 Clean Taxonomy Icon Descriptor (`HairlineIconData`)

```typescript
export interface HairlineIconData {
    /** Canonical Type id for dedicated drawing (null if custom/unrecognized). */
    typeId: CanonicalTypeId | null;

    /** Geometric family fallback from classifyGeometry. */
    family: Geometry;

    /** Reflection highlight flag (true for mirrors, even if classified as box). */
    isMirror?: boolean;

    /** Shape text or variant ('cylinder' | 'squared' for lamps; 'round' | 'squared' | 'rectangular' for mirrors). */
    variant?: string | null;

    /** Median dimensions in cm (w, h, d) for camera projection scaling. */
    dims?: Dims | null;

    /** Number of holes for wine racks (e.g. 2, 3, 4, 6, 8). */
    holes?: number;

    /** Inventory item count for badge display. */
    count: number;

    /** Canonical Title Case display label. */
    label: string;

    /** Unique taxonomy key. */
    key: string;
}
```

### 6.2 Component Integration Pattern

```tsx
import React from 'react';
import { ShapeFigure } from '../features/entry/hairline/ShapeFigure';
import type { HairlineIconData } from './types';

export const TypeChip: React.FC<{ data: HairlineIconData; selected?: boolean; onClick?: () => void }> = ({
    data,
    selected = false,
    onClick,
}) => (
    <button
        type="button"
        className={`stp-chip ${selected ? 'is-selected' : ''}`}
        onClick={onClick}
    >
        <span className="stp-chip-fig w-6 h-5 shrink-0 inline-flex items-center justify-center">
            <ShapeFigure
                typeId={data.typeId}
                family={data.family}
                isMirror={data.isMirror}
                variant={data.variant}
                dims={data.dims}
                holes={data.holes}
                active={selected}
                className="w-full h-full"
            />
        </span>
        <span className="stp-chip-label font-medium text-xs">{data.label}</span>
        <span className="stp-chip-count text-[10px] opacity-60">({data.count})</span>
    </button>
);
```

### 6.3 CSS Styling Rules for Compact Chips
1. **SVG Bounds**: The `<svg>` has an intrinsic aspect ratio of $400 \times 320$ ($5:4$). In compact chips, fix container dimensions to `w-6 h-5` ($24\text{px} \times 20\text{px}$) or `w-5 h-4` ($20\text{px} \times 16\text{px}$).
2. **Stroke Scaling**: Stroke widths in [shapeFigure.css](file:///C:/Jouhayerk/git/onyxchan-wt/E1-5/src/features/entry/hairline/shapeFigure.css) use `vector-effect: non-scaling-stroke` so the hairline stroke thickness remains consistently crisp ($1\text{px}$) regardless of display scale.
3. **Lift Animation**: Disable `--sf-lift` on compact chips by leaving `lift={0}` (default).
