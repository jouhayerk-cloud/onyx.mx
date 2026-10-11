# Comprehensive Inventory Categorization Report

**Onyx.mx Live Inventory Taxonomy Audit & Normalization**  
**Dataset Scope**: Live Inventory across Workbooks `v326`, `v825`, and `v826` (548 total items)  
**Reference Codebase**: Onyx Studio, Vite 7, React 19, Jotai 2, TypeScript Strict  
**Target Modules**: Add Entry Hairline Panel, Suggestion Tags, Matrixify Shopify Export  
**Date**: October 11, 2026 (Reflecting operational season 826)

---

## 1. Problem Audit by Column

Every distinct raw value in `docs/_inputs/distinct_values.json` and every cross-column pattern in `docs/_inputs/combinations.csv` was audited across the 548 live records. The inventory data accumulated over seasons suffers from structural conflation (multiple conceptual dimensions crammed into a single field), typographic casing variations, language mixing (Spanish and English), singular/plural splits, and AI hallucination leakage.

### 1.1 Column: `shape` (65 Distinct Raw Values, 548 Rows)

The `shape` column is the most heavily overloaded column in the legacy database. Instead of containing purely physical geometry (Form), it conflates four distinct conceptual dimensions:
1. **True Physical Forms**: Cylinder, Squared, Rectangular, Round, Free Form, Cube, Sphere, etc.
2. **Size Descriptors**: Large, Medium, Small, Mini (in arbitrary casing and permutations).
3. **Sculpture Subjects / Motifs**: Horses, Elk, Deer, Moose, Bears, Cactus, Bobcats, etc.
4. **Product Types**: Rustic Wine Rack, Fountain, Wall Panel, Basin, Chair, Italian Chess.
5. **Junk / Client Data**: Client names (`Laura McNabb`).

| Raw Value | Count ($n$) | Problem Category | Description & Impact |
|:---|:---:|:---|:---|
| `Medium`, `medium`, `MEDIUM` | 51 | Mixed Meaning (Size) | Size descriptor entered into shape column; obscures actual form (mostly bowls). |
| `Large`, `large`, `lARGE`, `LARGE`, `large ` | 52 | Mixed Meaning (Size) + Casing | Size descriptor in shape; 5 distinct casing variants including leading/trailing spaces. |
| `Small`, `small` | 16 | Mixed Meaning (Size) + Casing | Size descriptor entered into shape column. |
| `Mini`, `mini` | 8 | Mixed Meaning (Size) + Casing | Size descriptor in shape; used for miniature bowls and decorative balls. |
| `small - medium - mini` | 1 | Mixed Meaning (Size set) | Composite set size entered into shape column for assorted bowl sets. |
| `Squared`, `squared`, `SQUARED`, `SQUARE`, `square`, `sQUARED`, `Square`, `squared ` | 129 | Casing & Spacing Duplicates | 8 different casing/spacing spellings of "Squared". |
| `Rectangular`, `rectangular ` | 27 | Whitespace Trailing Space | Trailing space duplicate (`rectangular ` vs `Rectangular`). |
| `Round`, `ROUND` | 17 | Casing Duplicate | UPPERCASE variant `ROUND` vs Title Case `Round`. |
| `Free Form`, `FREE FORM` | 2 | Casing Duplicate | UPPERCASE duplicate of Free Form. |
| `Diamond`, `DIAMOND`, `DIAMOND ` | 3 | Casing & Trailing Space | Casing variants with trailing whitespace. |
| `Irregular border`, `Irregular Border` | 3 | Casing Variant | Sentence case vs Title case. |
| `Pebble Stone`, `Pebble Stones` | 2 | Singular / Plural Duplicate | Plural vs singular for bagged landscaping marble stones. |
| `Fountain`, `fountain`, `fOUNTAIN`, `3 Fountain Set` | 41 | Mixed Meaning (Type) + Casing | Product type entered as shape; duplicates Type column. |
| `Rustic Wine Rack` | 31 | Mixed Meaning (Type) | Product type entered as shape; Type column holds hole counts ("8 Holes"). |
| `Wall Panel`, `WALL PANEL` | 4 | Mixed Meaning (Type) + Casing | Product type entered as shape. |
| `Basin`, `BASIN` | 3 | Mixed Meaning (Type) + Casing | Product type entered as shape for custom client sinks. |
| `chair` | 1 | Mixed Meaning (Type) | Furniture type entered as shape; Type is "V Shaped Couch". |
| `Italian Chess` | 1 | Mixed Meaning (Type) | Product type entered as shape; Type is "Table Set". |
| `Horses`, `HORSES` | 13 | Mixed Meaning (Subject) + Casing | Sculpture subject carved on painted wall panels. |
| `Elk`, `Elks` | 8 | Mixed Meaning (Subject) + Plural | Animal subject carved on wall panels; singular vs plural. |
| `Deer` | 5 | Mixed Meaning (Subject) | Animal subject carved on wall panels. |
| `moose` | 4 | Mixed Meaning (Subject) + Casing | Animal subject carved on wall panels; lowercase. |
| `Bears` | 3 | Mixed Meaning (Subject) | Animal subject carved on wall panels. |
| `3 Cactus` | 2 | Mixed Meaning (Subject) | Sculpture subject carved as standalone set. |
| `Bobcats` | 1 | Mixed Meaning (Subject) | Animal subject carved on wall panels. |
| `Climbers` | 1 | Mixed Meaning (Subject) | Human figure motif on wall panels. |
| `flame` | 1 | Mixed Meaning (Subject) + Casing | Sculpture motif; lowercase. |
| `VENUS` | 1 | Mixed Meaning (Subject) + Casing | Classical sculpture motif; UPPERCASE. |
| `Laura McNabb` | 1 | Junk / Personal Data | Client or project name entered into shape column for a mirror. |
| `RUSTIC` | 1 | Mixed Meaning (Descriptor) | Style descriptor entered as shape for a table. |

---

### 1.2 Column: `type_short_description` (43 Distinct Raw Values, 548 Rows)

The manual Type column typed by staff represents the product archetype, but contains parameter values, plural/singular splits, misspellings, and client order labels.

| Raw Value | Count ($n$) | Problem Category | Description & Impact |
|:---|:---:|:---|:---|
| `Rock` | 42 | Misleading Type (Generic Material) | 41 rows are carved fountains (Shape="Fountain"); 1 row is a boulder. Staff typed "Rock" because the quarry sells raw fountain rocks. |
| `Pendant` vs `Pendant Lamp` vs `Lamp` | 95 | Synonym & Wordiness Duplicates | "Pendant" (60) vs "Pendant Lamp" (34); redundant "Lamp" suffix splits tiles in UI. |
| `Table Lamp` vs `Table Lamps` | 76 | Singular / Plural Duplicate | Plural variant `Table Lamps` (1) vs `Table Lamp` (75). |
| `Wall Panel` vs `Wall Panels` | 4 | Singular / Plural Duplicate | Plural variant `Wall Panels` (1) vs `Wall Panel` (3). |
| `Wall Panel Pair` vs `Panel Pair` | 8 | Redundant Modifier | "Wall Panel Pair" (6) vs "Panel Pair" (2) represent the exact same two-panel set. |
| `Fountain` vs `Fountain Set` | 3 | Set vs Unit Duplicate | "Fountain Set" (2) vs "Fountain" (1). |
| `Sculpture` vs `Sculptures Set` | 3 | Set vs Unit Duplicate | "Sculptures Set" (1) vs "Sculpture" (2). |
| `2 Holes`, `3 Holes`, `4 Holes`, `5 Holes`, `6 Holes`, `8 Holes`, `9 Holes`, `10 Holes`, `20 Holes`, `21 Holes` | 31 | Attribute in Type Column | Hole count for wine racks placed in Type column instead of an attribute/spec field. |
| `Cofee Table` | 1 | Typo / Misspelling | Misspelling of "Coffee Table" (single 'f'). |
| `Table` vs `Table Set` | 5 | Unit vs Set Variant | "Table" (4) vs "Table Set" (1). |
| `Client Jan Dunn` | 1 | Junk / Client Data | Client commission name; Shape is `Basin`, Material is `concrete`. |
| `Client Sandy Levits` | 1 | Junk / Client Data | Client commission name; Shape is `BASIN`, Material is `concrete`. |
| `Client Trish Wagner` | 1 | Junk / Client Data | Client commission name; Shape is `Basin`, Material is `concrete`. |
| `V Shaped Couch` | 1 | Incomplete Type Taxonomy | Seating furniture item; no corresponding category in closed Shopify list. |

---

### 1.3 Column: `material` (12 Distinct Raw Values, 548 Rows)

| Raw Value | Count ($n$) | Problem Category | Description & Impact |
|:---|:---:|:---|:---|
| `Onyx`, `ONYX`, `oNYX`, `onyx` | 497 | Casing Duplicates | 4 distinct casing variations of Onyx across 497 rows (`oNYX` has lowercase 'o'). |
| `Travertine`, `tRAVERTINE` | 5 | Casing Duplicate | Lowercase initial letter `tRAVERTINE` (4) vs Title Case `Travertine` (1). |
| `concrete` | 4 | Casing Variant | Lowercase `concrete` (4). |
| `null` | 2 | Missing Data | Completely null material in 2 rows (`Horses` panel, `Small` bowl). |
| `""` (empty string) | 1 | Empty Data | Empty string material in 1 row (`mini` bowl). |

---

### 1.4 Column: `vendor_color` (74 Distinct Raw Values, 548 Rows)

The vendor color field mixes raw colors, geological variety names, regional quarry names, and punctuation styles.

| Raw Value | Count ($n$) | Problem Category | Description & Impact |
|:---|:---:|:---|:---|
| `White-Amber` vs `White Amber` | 15 | Hyphen vs Space Duplicate | Punctuation variant (`White-Amber` $n=8$ in v826 vs `White Amber` $n=7$ in v326). |
| `Green-Gray` vs `Gray Green` | 7 | Hyphen & Word Order Duplicate | `Green-Gray` ($n=6$) in v826 vs `Gray Green` ($n=1$) in v326. |
| `White-Gray` | 5 | Hyphen Variant | Punctuation variant introduced in Season 826. |
| `White-Amber-Gray` | 4 | Hyphen Variant | Punctuation variant introduced in Season 826. |
| `Cristaline Green Gray` vs `Green Gray Cristaline` | 4 | Word Order Duplicate | Permutation of identical three-word descriptor ($n=2$ each). |
| `Assorted` vs `Assorted Colors` | 5 | Synonym / Incomplete Phrase | Truncated term `Assorted` ($n=1$) vs `Assorted Colors` ($n=4$). |
| `Red Pyramid` vs `Red Pyramid Jasper` | 9 | Truncated Variety Name | Mineral qualifier `Jasper` appended to one row. |
| `Tehuacan`, `Tehuacan Gray`, `Tehuacan Amber`, `Tehuacan Ice`, `Tehuacan White`, `Tehuacan Green`, `Brown Tehuacan`, `Tehuacan W Green`, `Tehuacan Mint`, `Tehuacan Large Gray Rim`, `Tehuacan Small Gray Rim` | 90 | Regional Quarry Variety in Color | Tehuacan (Puebla) is a stone origin/variety, not an optical color; staff treat it as a color family. |
| `Aqua Serpentine`, `Pink Serpentine`, `Serpentine`, `Pink Serpentine Cristaline`, `Pink Serpentine Amber` | 52 | Stone Variety in Color | Serpentine mineral variety name mixed with optical colors. |
| `Blue Argentina` | 3 | Regional Stone Variety | Calcite/Onyx variety imported from Argentina; not a plain blue pigment. |
| `Nacar`, `Pearlescent` | 56 | Finish / Optical Quality | Nacar (Spanish for Mother of Pearl) and Pearlescent represent optical translucency/sheen. |

---

### 1.5 Column: `generated_type` (30 Distinct Raw Values, 548 Rows)

The AI content generation pipeline hallucinated product types outside the 19 closed Shopify types, and left 98 rows completely unpopulated.

| Raw Value | Count ($n$) | Problem Category | Description & Impact |
|:---|:---:|:---|:---|
| `null` | 98 | Missing AI Classification | 98 rows never had AI classification executed or populated. |
| `Home Decor > Pendant Lamps` | 6 | AI Hallucination | Invalid Shopify type. Closed list requires `Home Decor > Pendant Lights`. |
| `Home Decor > Lighting > Pendant Lamps` | 2 | AI Hallucination | Deep hierarchy outside agreed closed list. |
| `Home Decor > Lighting > Pendant` | 1 | AI Hallucination | Invalid variant. |
| `Home Decor > Pendant Lighting` | 1 | AI Hallucination | Invalid variant. |
| `Lighting > Pendant Lamps` | 1 | AI Hallucination | Truncated root hierarchy. |
| `Canoe Tray` | 10 | AI Fallback Failure | Model outputted shape name as type instead of `Home Decor > Decorative Trays`. |
| `Tray` | 5 | AI Fallback Failure | Bare generic noun instead of `Home Decor > Decorative Trays`. |
| `Canoe` | 3 | AI Fallback Failure | Bare shape noun instead of `Home Decor > Decorative Trays`. |
| `Onyx Canoe Tray` | 1 | AI Hallucination | Material + shape combined as type. |
| `Home Decor > Lighting` | 3 | Generic Parent Category | Model stopped at parent level without picking Table or Floor Lamps. |
| `Home Decor > Lighting > Table Lamps` | 1 | AI Hallucination | Deep hierarchy; closed list is `Home Decor > Table Lamps`. |
| `Table Lamp` | 1 | Unprefixed Hallucination | Missing `Home Decor > ` prefix. |
| `Decorative Bowl` | 1 | Unprefixed Hallucination | Missing `Home Decor > ` prefix. |
| `Home Decor > Decorative Vessels` | 1 | AI Hallucination | Category does not exist in Shopify closed list. |
| `Home Decor > Decorative Balls` | 1 | AI Hallucination | Closed list classifies decorative balls under `Home Decor > Sculptures`. |
| `Home Decor > Decorative Objects` | 1 | AI Hallucination | Closed list classifies under `Home Decor > Sculptures`. |
| `Home Decor > Decorative Sculpture` | 1 | AI Hallucination | Closed list uses plural `Home Decor > Sculptures`. |

---

### 1.6 Column: `generated_color` (249 Distinct Raw Values, 548 Rows)

| Problem Category | Count ($n$) | Description & Impact |
|:---|:---:|:---|
| `null` | 62 | 62 rows have no generated color strings. |
| Leaked Vendor Varieties | 47 | Raw stone varieties entered by staff leaked directly into the AI color field: `Green Talan` (19), `TEHUACAN` (10), `Zebra` (5), `Orange Cosmic` (4), `Pink Zebra` (4), `green talan/black` (2), `Tehuacan White` (2), `eMPEROR` (1), `Red Pyramid` (1), `Serpentine` (1), `Tehuacan` (1), `Tehuacan Amber` (1), `Pink Serpentine` (1), `Cristaline Gray` (1), `PEARLESCENT` (1), `ICE` (1). Shopify rejects non-palette strings. |
| Non-Palette Adjectives | 75 | Adjectives absent from the Shopify 23 allowed palette: `Honey`, `Sepia`, `Slate`, `Espresso`, `Caramel`, `Rose`, `Blush Pink`, `Soft Grey`, `Lush Green`, `Verdant Green`, `Emerald Green`, `Pale Teal`, `Seafoam Green`, `Terracotta`. |
| Word Order Inversions | ~25 | Identical color sets ordered differently (e.g. `Blue, Brown` vs `Brown, Blue`, `Aqua, Green` vs `Green, Aqua`). |

---

## 2. Taxonomy Architecture Decisions

1. **Disentangling the `shape` Column**:
   - The shape column is formally separated into three independent dimensions:
     - **Form (`CANONICAL_FORMS`)**: Physical geometry (Cylinder, Squared, Rectangular, Round, Free Form, Cube, Diamond, Sphere, L-Shaped, S-Shaped, Irregular).
     - **Size Band (`SIZE_BANDS`)**: Small, Medium, Large, Mini.
     - **Subject (`CANONICAL_SUBJECTS`)**: Figurative carvings (Horse, Elk, Deer, Moose, Bear, Cactus, Bobcat, Climbers, Flame, Venus).
     - **Type (`CANONICAL_TYPES`)**: When shape holds "Rustic Wine Rack", "Fountain", or "Basin", it maps to its true Type.
2. **Deterministic Exact Type Lookup (`categoryForType`)**:
   - Substring searching (e.g. `.includes('tina')`) is strictly abolished. The live production bug where "Blue Argentina" stone bowls mapped to "Bathtubs" because of "tina" occurred directly because of substring matching on raw titles.
   - `categoryForType(typeId)` performs an exact $O(1)$ key lookup on the canonical kebab-case ID.
3. **Canoe Rule Enforcement**:
   - In adherence to the owner's binding brief and project skills (`OnyxMX-InventoryAttributes.md` and `vocabulary.ts`), all canoes, canoe trays, and canoe dishes are strictly mapped to `Home Decor > Decorative Trays`.
4. **Wine Rack Hole Modeling**:
   - Wine racks are unified under `id: 'wine-rack'`, with hole counts modeled as numeric attributes (`holes?: number`) rather than bloating the primary taxonomy with 10 separate types.
5. **Handling Personal and Client Commissions**:
   - Client names (`Client Jan Dunn`, `Client Sandy Levits`, `Client Trish Wagner`, `Laura McNabb`) are identified via pattern matching (`/^client\b/i` and name registry). Their true product archetype (e.g. Basin, Mirror) is recovered, while personal names are masked from public picker tiles and suggestion engines.
6. **Material Normalization & Missing Data Resolution**:
   - All casing variants of Onyx, Travertine, Concrete, and Marble are folded onto clean Title Case.
   - For the 3 rows with null/empty material, vendor colors (`White Amber`, `Tehuacan Gray`) and item forms confirm they are 100% Mexican Onyx.
7. **Color Layer Separation**:
   - Three distinct concepts are preserved without conflation:
     - **Vendor Color**: The artisan's raw trade name (e.g. "Green Talan", "Aqua Serpentine").
     - **Stone Variety**: The geological classification (e.g. "Talan", "Serpentine", "Blue Argentina").
     - **Shopify Color Palette**: The closed 23-color optical palette used for faceted web filtering.

---

## 3. The Canonical Taxonomy

### 3.1 Canonical Types (39 Types)

Every canonical Type has an exact kebab-case identifier, English label, Spanish translation, high-level family, Shopify Product Type (strictly validated against the 19 closed categories or flagged for owner decision), standard Google/Shopify Category path, and hairline figure key.

| ID (`kebab-case`) | English Name | Spanish Name | Family | Shopify Product Type | Shopify Category Path | Hairline Figure Key |
|:---|:---|:---|:---|:---|:---|:---|
| `bowl` | Bowl | Tazón | vessel | `Home Decor > Decorative Bowls` | `Home & Garden > Decor > Decorative Bowls` | `bowl` |
| `canoe` | Canoe | Canoa | vessel | `Home Decor > Decorative Trays` | `Home & Garden > Decor > Decorative Trays` | `canoe` |
| `plate` | Plate | Plato | vessel | `Home Decor > Decorative Plates` | `Home & Garden > Decor > Decorative Plates` | `UNKNOWN` |
| `tray` | Tray | Charola | vessel | `Home Decor > Decorative Trays` | `Home & Garden > Decor > Decorative Trays` | `canoe` |
| `basin` | Basin | Lavamanos / Palangana | vessel | `Home Decor > Sinks` | `Hardware > Plumbing > Plumbing Fixtures > Sinks` | `UNKNOWN` |
| `sink` | Sink | Lavabo | vessel | `Home Decor > Sinks` | `Hardware > Plumbing > Plumbing Fixtures > Sinks` | `UNKNOWN` |
| `bathtub` | Bathtub | Tina de Baño | vessel | `Bathtubs` | `Hardware > Plumbing > Plumbing Fixtures > Bathtubs` | `UNKNOWN` |
| `vase` | Vase | Florero | vessel | `Home Decor > Vases` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |
| `shot-glass` | Shot Glass | Tequilero | vessel | `Home Decor > Sculptures` | `Home & Garden > Kitchen & Dining > Tableware > Drinkware > Shot Glasses` | `UNKNOWN` |
| `pendant` | Pendant | Lámpara Colgante | lamp | `Home Decor > Pendant Lights` | `Home & Garden > Lighting > Lighting Fixtures > Pendant Light Fixtures` | `pendant` |
| `table-lamp` | Table Lamp | Lámpara de Mesa | lamp | `Home Decor > Table Lamps` | `Home & Garden > Lighting > Lamps > Desk Lamps` | `table-lamp` |
| `floor-lamp` | Floor Lamp | Lámpara de Piso | lamp | `Home Decor > Floor Lamps` | `Home & Garden > Lighting > Lamps > Floor Lamps` | `floor-lamp` |
| `tower-lamp` | Tower Lamp | Lámpara Torre | lamp | `Home Decor > Floor Lamps` | `Home & Garden > Lighting > Lamps > Floor Lamps` | `tower-lamp` |
| `luminary` | Luminary | Luminaria | lamp | `Home Decor > Table Lamps` | `Home & Garden > Lighting > Lamps > Desk Lamps` | `UNKNOWN` |
| `mirror` | Mirror | Espejo | mirror | `Home Decor > Mirrors` | `Home & Garden > Decor > Mirrors` | `mirror` |
| `table` | Table | Mesa | furniture | `Home Decor > Tables` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `table` |
| `coffee-table` | Coffee Table | Mesa de Centro | furniture | `Home Decor > Tables` | `Furniture > Tables > Coffee Tables` | `table` |
| `table-set` | Table Set | Juego de Mesas | furniture | `Home Decor > Tables` | `Furniture > Table Accessories` | `table` |
| `chair` | Chair | Silla | furniture | `NONE: needs owner decision` | `Furniture > Chairs` | `UNKNOWN` |
| `couch` | Couch | Sillón / Sofá | furniture | `NONE: needs owner decision` | `Furniture > Sofas` | `UNKNOWN` |
| `bar` | Bar | Barra | furniture | `Home Decor > Tables` | `Furniture > Bars & Bar Carts` | `table` |
| `rock` | Rock | Roca Decorativa | stone | `Home Decor > Sculptures` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |
| `boulder` | Boulder | Roca Monumental | stone | `Home Decor > Sculptures` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |
| `pebble-stone` | Pebble Stones | Guijarros / Piedras de Río | stone | `Home Decor > Sculptures` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |
| `bag` | Bag of Stones | Bolsa de Piedras | stone | `Home Decor > Sculptures` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |
| `fountain` | Fountain | Fuente | fountain | `Outdoor Decor > Fountains` | `Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains` | `fountain` |
| `fountain-set` | Fountain Set | Juego de Fuentes | fountain | `Outdoor Decor > Fountains` | `Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains` | `fountain` |
| `sculpture` | Sculpture | Escultura | sculpture | `Home Decor > Sculptures` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |
| `sculpture-set` | Sculpture Set | Juego de Esculturas | sculpture | `Home Decor > Sculptures` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |
| `ball` | Ball | Esfera | sculpture | `Home Decor > Sculptures` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |
| `pillar` | Pillar | Pedestal / Pilar | sculpture | `Home Decor > Sculptures` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |
| `wall-panel` | Wall Panel | Panel de Pared | panel | `Home Decor > Wall Panels` | `Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures` | `wall-panel` |
| `painted-wall-panel` | Painted Wall Panel | Panel de Pared Pintado | panel | `Home Decor > Wall Panels` | `Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures` | `wall-panel` |
| `panel-pair` | Panel Pair | Par de Paneles | panel | `Home Decor > Wall Panels` | `Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures` | `wall-panel` |
| `wine-rack` | Wine Rack | Portavinos / Cava | other | `Home Decor > Wine Racks` | `Furniture > Cabinets & Storage > Wine Racks` | `wine-rack` |
| `chess-set` | Chess Set | Ajedrez | other | `Board Games > Chess Sets` | `Toys & Games > Games > Board Games` | `UNKNOWN` |
| `candleholder` | Candleholder | Portavelas | other | `Home Decor > Candleholders` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |
| `coaster` | Coaster | Portavasos | other | `Home Decor > Coasters` | `Home & Garden > Kitchen & Dining > Barware > Coasters` | `UNKNOWN` |
| `wine-stopper` | Wine Stopper | Tapón de Vino | other | `Barware > Wine Stoppers` | `Home & Garden > Decor > Artwork > Sculptures & Statues` | `UNKNOWN` |

---

### 3.2 Canonical Forms (`CANONICAL_FORMS`)

The closed list of 11 true 3D physical forms:
1. `cylinder` (Cylinder / Cilindro)
2. `squared` (Squared / Square / Cuadrado)
3. `rectangular` (Rectangular / Rectángulo)
4. `round` (Round / Redondo)
5. `free-form` (Free Form / Boulder / Forma Libre)
6. `irregular` (Irregular Border / Borde Irregular)
7. `cube` (Cube / Cubo)
8. `diamond` (Diamond / Diamante)
9. `sphere` (Sphere / Esfera)
10. `l-shaped` (L-Shaped / Forma L)
11. `s-shaped` (S-Shape / Forma S)

---

### 3.3 Size Bands & Dimensional Rules (`SIZE_BANDS`)

Standard size bands:
- `mini` (Mini)
- `small` (Small)
- `medium` (Medium)
- `large` (Large)

**Dimensional Heuristics from Live Inventory Data**:
Analysis of inventory rows with explicit dimensional measurements indicates the following practical physical thresholds for vessels (Bowls and Canoes):
- **Mini**: Longest dimension $< 15\text{ cm}$ (e.g. mini bowls $10\times 10\text{ cm}$, volume $< 500\text{ cm}^3$).
- **Small**: Longest dimension $15\text{ cm} \le \text{dim} < 30\text{ cm}$.
- **Medium**: Longest dimension $30\text{ cm} \le \text{dim} < 50\text{ cm}$.
- **Large**: Longest dimension $\ge 50\text{ cm}$ (e.g. large bowls $55\text{ cm}$, large canoes up to $80\text{ cm}$).
*Recommendation for Owner*: Adopt these explicit cutoffs for automated size tag derivation, while preserving manual overrides in Add Entry.

---

### 3.4 Sculpture Subjects (`CANONICAL_SUBJECTS`)

Closed list of 10 sculpture motifs:
1. `horse` (Horses / Caballo)
2. `elk` (Elk / Alce)
3. `deer` (Deer / Venado)
4. `moose` (Moose)
5. `bear` (Bears / Oso)
6. `cactus` (Cactus / 3 Cactus)
7. `bobcat` (Bobcats / Lince)
8. `climbers` (Climbers / Escaladores)
9. `flame` (Flame / Llama)
10. `venus` (Classical Venus Figure)

---

### 3.5 Materials (`CANONICAL_MATERIALS`)

Closed list of 6 raw materials:
1. `Onyx` (Mexican Onyx / Ónix)
2. `Fluorite` (Fluorita)
3. `Calcite` (Calcita)
4. `Travertine` (Travertino)
5. `Marble` (Mármol)
6. `Concrete` (Concreto)

---

### 3.6 Colours, Stone Varieties, and Palettes

#### A. Shopify Allowed Color Palette (Closed List of 23 Colors)
`Black`, `Blue`, `Bronze`, `Brown`, `Clear`, `Copper`, `Cream`, `Gold`, `Gray`, `Green`, `Iridescent`, `Multicolor`, `Orange`, `Pink`, `Purple`, `Rainbow`, `Red`, `Rose Gold`, `Silver`, `Tan`, `Turquoise/Aqua`, `White`, `Yellow`.

#### B. Canonical Stone Varieties (`CANONICAL_STONE_VARIETIES`)
Closed list of 17 geological varieties that should be exported to Shopify metafields (`custom.variety` or stone attributes) rather than polluting color fields:
- `Blue Argentina` (Argentine Blue Calcite / Onyx)
- `Cloud`
- `Cosmic` (Orange Cosmic)
- `Cristaline` (Translucent Gray/Amber crystalline onyx)
- `Emperor` (Brown Emperor veined onyx)
- `Galaxy` (Black Galaxy onyx)
- `Guatemala`
- `Ice` (Tehuacan Ice / White Ice)
- `Jasper` (Red Pyramid Jasper)
- `Nacar` (Mother of pearl iridescent onyx)
- `Pearlescent` (Luminescent white onyx)
- `Queretaro`
- `Red Pyramid` (Banded red/brown onyx from Puebla)
- `Serpentine` (Green/Tan metamorphic serpentine)
- `Talan` (Green Talan from Oaxaca/Puebla quarries)
- `Tehuacan` (Fine banded onyx from Tehuacan, Puebla)
- `Zebra` (Banded black/white or pink/white onyx)

#### C. Canonical Vendor Colors (74 Distinct Names)
The full 74 vendor trade color strings from `distinct_values.json` are preserved in the catalog registry, mapped to Shopify colors via `colorVocabulary.ts`.

---

## 4. Rows the Chief Must Clean

Applying the canonical taxonomy and alias map across the live 548 inventory items produces the following migration counts and top updates.

### 4.1 Summary of Changes by Column

| Column | Total Rows | Unchanged Rows | Rows Changing Under Alias Map | % Changing |
|:---|:---:|:---:|:---:|:---:|
| `shape` | 548 | 233 | **315** | 57.5% |
| `type_short_description` | 548 | 419 | **129** | 23.5% |
| `material` | 548 | 442 | **106** | 19.3% |
| `vendor_color` | 548 | 521 | **27** | 4.9% |
| `generated_type` | 548 | 410 | **138** | 25.2% |
| `generated_color` | 548 | 300 | **248** | 45.3% |

### 4.2 Top 20 Data Changes for the Chief

1. **`shape: Medium` ($n=38$)**: Move `Medium` to `size` column; populate true shape as `Round` (for bowls) or `Canoe` based on Type.
2. **`shape: Fountain` ($n=37$)**: Move `Fountain` to `type` column; set shape to `Free Form` or `Boulder`.
3. **`shape: Large` ($n=35$)**: Move `Large` to `size` column; set true geometric form.
4. **`shape: Rustic Wine Rack` ($n=31$)**: Move `Rustic Wine Rack` to `type`; set shape to `Free Form` or `Rectangular`.
5. **`shape: squared` ($n=28$)**: Clean casing to canonical `Squared`.
6. **`type: Rock` ($n=42$)**: Recategorize 41 rows to `fountain` (Outdoor Decor > Fountains); recategorize 1 row to `boulder`.
7. **`type: Pendant Lamp` ($n=34$)**: Fold redundant "Lamp" into canonical `pendant`.
8. **`type: N Holes` ($n=31$)**: Extract hole count ($2, 3, 4, 5, 6, 8, 9, 10, 20, 21$) into `holes` attribute; set canonical Type to `wine-rack`.
9. **`material: ONYX` ($n=47$)**: Normalize UPPERCASE to `Onyx`.
10. **`material: oNYX` ($n=31$)**: Normalize mixed casing to `Onyx`.
11. **`material: onyx` ($n=17$)**: Normalize lowercase to `Onyx`.
12. **`shape: Horses` ($n=12$)**: Move `Horses` to `subject` column; set shape to `Rectangular` (all are wall panels).
13. **`shape: large` ($n=11$)**: Normalize lowercase size to `Large`.
14. **`shape: medium` ($n=11$)**: Normalize lowercase size to `Medium`.
15. **`shape: Small` ($n=10$)**: Move `Small` to `size` column.
16. **`shape: SQUARED` ($n=8$)**: Normalize UPPERCASE to `Squared`.
17. **`shape: Elk` ($n=7$)**: Move `Elk` to `subject` column; set shape to `Rectangular`.
18. **`vendor_color: White-Amber` ($n=8$)**: Standardize hyphen to space `White Amber`.
19. **`generated_type: null` ($n=98$)**: Batch populate canonical Shopify type based on canonical `type_short_description`.
20. **`generated_color: Green Talan` ($n=19$)**: Replace leaked stone variety with valid Shopify palette colors (`Green, Tan, Brown`).

---

## 5. Open Questions for the Owner

The following 8 specific ambiguities require an authoritative decision from the studio owner before database updates are written:

1. **`Laura McNabb` in Shape (1 row, Workbook `v326`)**:
   - *Row details*: `White, Brown`, `Home Decor > Mirrors`, `Onyx`, `1`, `Laura McNabb`, `Mirror`, `Tehuacan Ice` (combinations.csv line 186).
   - *Question*: What is the physical shape of this mirror (Round, Squared, or Rectangular)?
2. **`chair` / `V Shaped Couch` (1 row, Workbook `v326`)**:
   - *Row details*: `Brown, Cream, Gray`, `Home Decor > Sculptures`, `ONYX`, `1`, `chair`, `V Shaped Couch`, `Tehuacan Amber` (combinations.csv line 302).
   - *Question*: The closed Shopify list lacks seating furniture categories. Should this item export as `Home Decor > Sculptures`, or will Rare Earth Gallery approve adding a `Furniture > Seating` category?
3. **`Rock` Fountains vs. Boulder (42 rows, Workbooks `v326`, `v825`)**:
   - *Row details*: 41 rows have Shape=`Fountain` / `3 Fountain Set` and generated type `Outdoor Decor > Fountains`. 1 row has Shape=`Boulder` and vendor color `Red Pyramid`.
   - *Question*: Does the owner approve updating `short_description` from "Rock" to "Fountain" for the 41 fountain rows, and "Boulder" for the single decorative rock row?
4. **`Pebble Stone` / `Pebble Stones` + `Bag` (2 rows, Workbooks `v326`, `v825`)**:
   - *Row details*: Marble bagged stones in Black and White (combinations.csv lines 161 & 390).
   - *Question*: Should bagged stones export under `Home Decor > Sculptures` or a dedicated landscaping/garden accessories type?
5. **Client Concrete Basins (`Client Jan Dunn`, `Client Sandy Levits`, `Client Trish Wagner`) (3 rows, Workbook `v326`)**:
   - *Row details*: Basins made of concrete (combinations.csv lines 98, 142, 327).
   - *Question*: Should client commission rows be flagged as `is_hidden = true` in public catalogs, and should their canonical type be `sink` or `basin`?
6. **Missing Material Rows (3 rows, Workbook `v326`)**:
   - *Row details*: 2 rows have `material = null` (`Horses`/`Painted Wall Panel`/`White Amber` and `Small`/`Bowl`/`Tehuacan Gray`), and 1 row has `material = ""` (`mini`/`Bowl`/`Assorted Colors`).
   - *Question*: We have aliased these to `Onyx` based on quarry origin and form. Does the owner confirm all three are Mexican Onyx?
7. **`L shaped` / `Bar` (1 row, Workbook `v326`)**:
   - *Row details*: `Aqua`, `Home Decor > Tables`, `Onyx`, `1`, `L shaped`, `Bar`, `Aqua` (combinations.csv line 361).
   - *Question*: Is this commercial/residential bar counter classified under `Home Decor > Tables` or does it require a custom category?
8. **`Italian Chess` / `Table Set` (1 row, Workbook `v326`)**:
   - *Row details*: `Orange, Black`, `Board Games > Chess Sets`, `Onyx`, `1`, `Italian Chess`, `Table Set`, `Orange` (combinations.csv line 175).
   - *Question*: AI classified this as `Board Games > Chess Sets`. Does the owner confirm that stone chess tables belong under `chess-set` rather than `table-set`?
