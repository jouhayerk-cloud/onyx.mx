# AI Generated Content Review: Season 826 Items (EM-001 to EM-006)

**Date**: 2026-10-11  
**Scope**: Vendor EM, Season 826, Items EM8261XXXA – EM8266OFHF  
**Reviewed Artifacts**: `docs/_inputs/six_items.json`, studio photographs (`docs/_inputs/photos/*.jpg`), and AI generation pipeline (`src/lib/ai/prompts.ts`, `vocabulary.ts`, `finalize.ts`, `colorVocabulary.ts`).

---

## 1. Summary Review Table

| Item | Field | Verdict | Current Value | What It Should Be | Evidence & Rationale |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **EM8261XXXA** (EM-001) | `generated_type` | **WRONG** | `Home Decor > Wall Panels` | `Home Decor > Sculptures` (or custom wall decor) | Not in allowed Shopify taxonomy (`SHOPIFY_PRODUCT_TYPES`). Wall Panels is unsupported. |
| | `generated_color` | **UNSUPPORTED** | `Blue, Gold, Brown` | `Blue` (or `Blue, Brown`) | Vendor color is `Blue` (canonically maps to `['Blue']`). Veins are rust/brown; "Gold" is unanchored. |
| | `detailed_description` | **UNSUPPORTED** | `Free Form Blue Onyx Wall Panel Pair Artistic Decor Statement` (60 chars) | `Free Form Blue Onyx Wall Panel Pair` | "Artistic Decor Statement" is marketing buzzword padding to reach 60 chars. |
| | `generated_description` | **WRONG** | `<p>Elevate your interior aesthetic...` (1,847 chars) | Concise description ≤ 1,200 chars | Exceeds 1,200-char max (+647 chars). Hallucinates "generations of skill", "inner glow", and "substantial pieces" (weight is null). |
| | `shape` (attribute) | **WRONG** | `Free Form` | `Wall Panel` / `Slab Pair` | "Free Form" describes perimeter contour, not object category. |
| | Photo verification | **OK** | EM8261XXXA_1.jpg | Bookmatched pair confirmed | Shows two mirrored slabs labeled "37x22" (94x56 cm, 2 cm thick). "Pair" is 100% verified. |
| **EM8262MFLH** (EM-002) | `generated_type` | **OK** | `Home Decor > Decorative Bowls` | `Home Decor > Decorative Bowls` | Correct product type and category. |
| | `generated_color` | **UNSUPPORTED** | `Blue, Brown` | `Blue` | Vendor color is `Blue` (canonically maps to `['Blue']`). Vision added Brown without vendor record anchor. |
| | `detailed_description` | **WRONG** | `Medium Wavy Edge Blue Onyx Decorative Bowl Artistic Home Accent Piece` (68 chars) | `Blue Onyx Wavy Decorative Bowl` | Corrupted by size attribute ("Medium"). "Artistic Home Accent Piece" is unsupported puffery. |
| | `generated_description` | **WRONG** | `<p>Experience captivating allure this Blue Onyx Medium Bowl...` (1,770 chars) | Clean HTML ≤ 1,200 chars without fluff | Exceeds 1,200 chars (+570 chars). Grammar bug ("allure this"). Hallucinates "inner glow" and "substantial presence" (weight is null). |
| | `shape` (attribute) | **WRONG** | `Medium` | `Bowl` / `Wavy Bowl` | "Medium" is a size tier, not a physical shape. |
| | Photo verification | **WRONG** | EM8262MFLH_1.jpg | Correct photo needed | Photo is a duplicate of EM8266OFHF_1.jpg. Sticker `19"x14"x7"` (48x36x18 cm) conflicts with DB dimensions (36x32x13 cm). |
| **EM8263MAFH** (EM-003) | `generated_type` | **OK** | `Home Decor > Decorative Bowls` | `Home Decor > Decorative Bowls` | Correct product type and category. |
| | `generated_color` | **UNSUPPORTED** | `Blue, Brown, Tan` | `Blue` (or canonical `Blue, Brown, Tan`) | Vendor color is `Blue`. Photo shows brown/tan rim, but deviates from single canonical mapping. |
| | `detailed_description` | **UNSUPPORTED** | `Blue Onyx Wavy Decorative Bowl Unique Organic Shape Medium Size` (63 chars) | `Blue Onyx Wavy Decorative Bowl` | "Unique Organic Shape" and "Medium Size" are unsupported filler phrases. |
| | `generated_description` | **WRONG** | `<p>Discover an extraordinary piece...` + 7 `<li>` (1,848 chars) | Clean HTML ≤ 1,200 chars | Exceeds 1,200 chars (+648 chars). Hallucinates "inner glow", "substantial feel" (weight null). Bullets repeat title/body. |
| | `shape` (attribute) | **WRONG** | `Medium` | `Bowl` / `Wavy Bowl` | "Medium" is a size tier, not a physical shape. |
| | Photo verification | **OK** | EM8263MAFH_1.jpg | Sticker `15.4x13.3x6.4` matches DB | Dimensions in DB (39x34x16 cm) match photo sticker (15.4"x13.3"x6.4"). |
| **EM8264OAMN** (EM-004) | `generated_type` | **WRONG** | `Home Decor > Decorative Bowls` (Vulnerable to Bathtub bug) | `Home Decor > Decorative Bowls` | Affected by "tina" bug: vendor color "Blue Argentina" contains "tina", misclassifying bowls as Bathtubs. |
| | `generated_color` | **UNSUPPORTED** | `Blue, Brown` | `Blue, Brown, Tan` (Canonical) | Inconsistent with sister items EM8265 and EM8266. "Blue Argentina" missing from `colorVocabulary.ts`. |
| | `detailed_description` | **WRONG** | `Onyx Large Bowl Organic Shape Artisan Crafted Decorative Accent Blue Argentina` (79 chars) | `Blue Argentina Onyx Large Wavy Decorative Bowl` | **Exceeds 70-character limit (79 chars)**. Word order scrambled; color placed at the end; fluff padding. |
| | `generated_description` | **WRONG** | `<p>Immerse your living space...` (1,811 chars) | Clean HTML ≤ 1,200 chars | Exceeds 1,200 chars (+611 chars). False Mexican origin for Argentine stone. Hallucinates "substantial weight" (weight is null). |
| | `shape` (attribute) | **WRONG** | `Large` | `Bowl` / `Wavy Bowl` | "Large" is a size tier, not a physical shape. |
| | Photo verification | **OK** | EM8264OAMN_1.jpg, _2.jpg | Sticker `16.5x15x8` matches DB | Dimensions in DB (42x38x20 cm) match photo sticker (16.5"x15"x8"). |
| **EM8265OLDX** (EM-005) | `generated_type` | **WRONG** | `Home Decor > Decorative Bowls` (Vulnerable to Bathtub bug) | `Home Decor > Decorative Bowls` | Affected by "tina" bug: "Blue Argentina" contains "tina", misclassifying bowls as Bathtubs. |
| | `generated_color` | **WRONG** | `Turquoise/Aqua, Brown, Tan` | `Blue, Brown, Tan` | Displaces dominant base color `Blue` with `Turquoise/Aqua`, breaking Shopify search and vendor color continuity. |
| | `detailed_description` | **UNSUPPORTED** | `Artisanal Blue Argentina Onyx Large Wavy Sculptural Decorative Bowl` (67 chars) | `Blue Argentina Onyx Large Wavy Decorative Bowl` | "Artisanal" and "Sculptural" are unsupported marketing buzzwords. Size "Large" leaked from bad shape. |
| | `generated_description` | **WRONG** | `<p>Discover an unparalleled piece...` + 3 `<li>` (1,757 chars) | Clean HTML ≤ 1,200 chars | Exceeds 1,200 chars (+557 chars). Hallucinates "centuries-old traditions", "substantial feel" (weight null). Bullets repeat title. |
| | `shape` (attribute) | **WRONG** | `Large` | `Bowl` / `Wavy Bowl` | "Large" is a size tier, not a physical shape. |
| | Photo verification | **OK** | EM8265OLDX_1.jpg, _2.jpg | Sticker `18.5x13x7.5` matches DB | Dimensions in DB (47x33x19 cm) match photo sticker (18.5"x13"x7.5"). |
| **EM8266OFHF** (EM-006) | `generated_type` | **WRONG** | `Home Decor > Decorative Bowls` (Vulnerable to Bathtub bug) | `Home Decor > Decorative Bowls` | Affected by "tina" bug: "Blue Argentina" contains "tina", misclassifying bowls as Bathtubs. |
| | `generated_color` | **UNSUPPORTED** | `Blue, Brown, Orange` | `Blue, Brown, Tan` | "Orange" veining is inaccurate/inconsistent with sister items. Missing from `colorVocabulary.ts`. |
| | `detailed_description` | **UNSUPPORTED** | `Exquisite Sculptural Blue Argentina Onyx Large Bowl Organic Form` (64 chars) | `Blue Argentina Onyx Large Wavy Decorative Bowl` | "Exquisite", "Sculptural", "Organic Form" are unsupported buzzwords. Size "Large" leaked from bad shape. |
| | `generated_description` | **WRONG** | `<p>Immerse yourself in the captivating allure...` (1,849 chars) | Clean HTML ≤ 1,200 chars | Exceeds 1,200 chars (+649 chars). Hallucinates "rare", "shifting glow", and "substantial weight" (weight is null). |
| | `shape` (attribute) | **WRONG** | `Large` | `Bowl` / `Wavy Bowl` | "Large" is a size tier, not a physical shape. |
| | Photo verification | **OK** | EM8266OFHF_1.jpg, _2.jpg | Sticker `19"x14"x7"` matches DB | Dimensions in DB (48x36x18 cm) match photo sticker (19"x14"x7"). Note: Photo 1 was mistakenly shared with EM8262. |

---

## 2. Key Pattern Findings

### 2.1 The "Argentina" / "tina" Bathtub Classification Bug
* **Mechanism**: Classification logic looking for substring `"tina"` (Spanish for bathtub) triggers on the stone variety `"Blue Argentina"`.
* **Affected Items**: **EM8264OAMN**, **EM8265OLDX**, and **EM8266OFHF**.
* **Impact**: Without boundary checks (`\btina\b`), legitimate decorative bowls are classified under `Hardware > Plumbing > Plumbing Fixtures > Bathtubs`.

### 2.2 Systemic Shape Column Corruption ("Medium" and "Large")
* **Mechanism**: Staff entered sizing tier designations (`Medium`, `Large`) into the `shape` column for items EM-002 through EM-006, while item EM-001 received `Free Form` (an edge descriptor).
* **AI Degradation**: The content prompt injects `${shape}` verbatim (`FIND the Onyx Large Bowl`), causing Gemini to treat size as shape, injecting "Medium" and "Large" into titles, and fabricating "Wavy Edge" or "Sculptural" to compensate for missing form descriptors.

### 2.3 Pervasive Marketing HTML Bloat (100% Violation)
* **Rule**: `BODY_RULE` specifies 1,000 to 1,200 characters in clean HTML.
* **Actual Output**:
  * EM8261: 1,847 characters (+54% over ceiling)
  * EM8262: 1,770 characters (+48% over ceiling)
  * EM8263: 1,848 characters (+54% over ceiling)
  * EM8264: 1,811 characters (+51% over ceiling)
  * EM8265: 1,757 characters (+46% over ceiling)
  * EM8266: 1,849 characters (+54% over ceiling)
* **Root Cause**: `BODY_RULE` instructs the model to "Make it premium and engaging, emphasizing artisanal Mexican stone craftsmanship, translucency and natural veining" without a strict token limit or penalty on length.

### 2.4 Shared Hallucinations & Boilerplate Copy
Across all six items, the model repeats identical formulaic tropes:
1. **Hallucinated Weight/Heft**: Every description claims "substantial weight", "substantial presence", or "solid, substantial feel", despite `weight_kg` being `null` across all six records.
2. **Hallucinated "Inner Glow" / Translucency**: Solid wall panels and opaque carved bowls are uniformly claimed to feature "translucency revealing an inner glow" and "light penetrating its depths".
3. **Fabricated Heritage & Origin**: All items claim "centuries-old tradition of Mexican stone craftsmanship" and "generations of skill passed down". For Blue Argentina onyx (EM-004, EM-005, EM-006), the copy falsely claims "bringing an authentic slice of Mexico's rich artistic heritage directly into your home" despite the stone originating in Argentina.
4. **Formulaic Opening & Closing Phrases**:
   * Openings: *"Immerse yourself / your living space in the captivating allure of artisanal Mexican stone craftsmanship..."* (EM8262, EM8264, EM8266)
   * Openings: *"Discover an extraordinary / unparalleled piece of artisanal..."* (EM8263, EM8265)
   * Closings: *"destined to be cherished for generations as a timeless heirloom"*, *"testament to both nature's artistry and human ingenuity"*, *"no two bowls are ever exactly alike"*.
5. **Redundant Bullet Lists**: EM8263 and EM8265 generate bullet lists that merely repeat the title and body marketing adjectives ("artisan creation", "decorative centerpiece").

### 2.5 Color Drift on "Blue Argentina" & Closed Vocabulary Gap
* **Current State**:
  * EM8264: `Blue, Brown`
  * EM8265: `Turquoise/Aqua, Brown, Tan`
  * EM8266: `Blue, Brown, Orange`
* **Defect**: All three items come from the same stone lot. In EM8265, "Blue" was replaced with "Turquoise/Aqua", breaking faceted navigation in Shopify. In EM8266, natural brown iron veining was labeled "Orange".
* **Vocabulary Defect**: `CANONICAL_COLOR_MAP` in `src/lib/colorVocabulary.ts` contains `Blue: ['Blue']`, but has no entry for `Blue Argentina`.

### 2.6 Photo Duplication Defect
* `docs/_inputs/photos/EM8262MFLH_1.jpg` is a bitwise exact duplicate of `docs/_inputs/photos/EM8266OFHF_1.jpg`.
* The sticker on both reads `19" x 14" x 7"`, which corresponds to EM8266 (48 x 36 x 18 cm). EM8262's recorded dimensions are 36 x 32 x 13 cm, proving that EM8262 is linked to the wrong photo.

---

## 3. Proposed Prompt Changes in `src/lib/ai/prompts.ts`

### Change 1: Sanitize Shape and Enforce Strict Title Syntax & Length
* **File**: `src/lib/ai/prompts.ts`
* **Function**: `buildContentPrompt` (lines 212–215) and `fieldRules` (lines 123–125)
* **Current Code**:
  ```typescript
  // lines 212-215
  const material = item.material || 'Onyx';
  const shape = item.shape || 'Artifact';
  const type = item.type || 'Object';
  const color = item.vendorColor || 'Natural Veining';
  ```
  ```typescript
  // lines 123-125
  if (fields.includes('title')) {
      rules.push(`"title": ${TITLE_RULE}${boxSet ? ' (e.g., "Mexican Onyx Cylinder Pendant Light Fixtures - Box Set").' : ''}`);
  }
  ```
* **Replacement Code**:
  ```typescript
  // lines 212-215 replacement: filter sizing keywords out of shape
  const material = item.material || 'Onyx';
  const rawShape = (item.shape || '').trim();
  const shape = /^(medium|large|small|xl|mini|free form)$/i.test(rawShape)
      ? (item.type || 'Object')
      : (rawShape || 'Object');
  const type = item.type || 'Object';
  const color = item.vendorColor || 'Natural Veining';
  ```
  ```typescript
  // lines 123-125 replacement: strict title formula, forbidding puffery and sizing leaks
  if (fields.includes('title')) {
      rules.push(
          `"title": ${TITLE_RULE} Structure MUST strictly follow: "[Color] [Material] [Shape] [Product Type]". ` +
          `Do NOT include subjective marketing adjectives (Artisanal, Exquisite, Sculptural, Unique, Rare, Statement). ` +
          `Do NOT include size designations (Medium, Large) unless part of a multi-piece set name. ` +
          `Hard maximum length: 70 characters.\${boxSet ? ' (e.g., "Mexican Onyx Cylinder Pendant Light Fixtures - Box Set").' : ''}`
      );
  }
  ```
* **Rationale**: Eliminates the 79-character overflow seen on EM8264, stops sizing terms in `shape` from leaking into titles, and removes fluff words ("Artisanal", "Exquisite", "Statement").

---

### Change 2: Anti-Hallucination Guardrails & Strict Length Enforcement in `BODY_RULE`
* **File**: `src/lib/ai/prompts.ts` (and underlying `src/lib/ai/vocabulary.ts`)
* **Function**: `fieldRules` (lines 126–136)
* **Current Code**:
  ```typescript
  // lines 126-136
  if (fields.includes('body')) {
      const sub = [`   - ${SAY_IT_ONCE_RULE}`];
      if (boxSet) {
          ...
      }
      rules.push(`"body": ${donor ? DONOR_BODY_RULE : BODY_RULE}\n${sub.join('\n')}`);
  }
  ```
* **Replacement Code**:
  ```typescript
  if (fields.includes('body')) {
      const sub = [
          `   - ${SAY_IT_ONCE_RULE}`,
          `   - ANTI-HALLUCINATION: NEVER state or imply weight, heaviness, or substantial heft when weight is unrecorded in the item record.`,
          `   - PHYSICAL ACCURACY: Do NOT claim 'inner glow' or translucency unless light is actively passing through the stone in the image.`,
          `   - TRUTHFUL PROVENANCE: Do NOT claim Mexican heritage or craftsmanship for stones originating from other countries (e.g., Blue Argentina Onyx). Do NOT claim 'centuries-old tradition', 'rare', or 'generations of skill'.`,
          `   - HARD LENGTH CEILING: Exactly 1000 to 1200 characters including HTML tags. Content exceeding 1200 characters will be rejected. Bullet points (if used) must describe concrete physical traits and never repeat title phrasing.`
      ];
      if (boxSet) {
          ...
      }
      rules.push(`"body": ${donor ? DONOR_BODY_RULE : BODY_RULE}\n${sub.join('\n')}`);
  }
  ```
* **Rationale**: Directly eliminates the 500–650 character over-generation across all six items, prevents fabricated weight claims when `weight_kg` is null, prevents false Mexican provenance claims for Argentine onyx, and bans repetitive romanticized boilerplate.

---

### Change 3: Anchor Dominant Colors to Vendor Color and Closed Palette
* **File**: `src/lib/ai/prompts.ts`
* **Function**: `fieldRules` (lines 137–145)
* **Current Code**:
  ```typescript
  // lines 141-143
  } else if (studioPhoto) {
      sub.push(`   - ${STUDIO_BLACK_RULE}`);
  }
  rules.push(`"dominantColors": ${donor ? DONOR_COLOR_RULE : COLOR_RULE}${sub.length ? '\n' + sub.join('\n') : ''}`);
  ```
* **Replacement Code**:
  ```typescript
  } else if (studioPhoto) {
      sub.push(`   - ${STUDIO_BLACK_RULE}`);
      sub.push(
          `   - DOMINANT COLOR ANCHOR: The FIRST color in dominantColors MUST represent the primary base color matching the recorded color ("${color}"). ` +
          `Secondary colors (1-2 max) must capture only clearly visible natural veining or banding from the allowed list. ` +
          `Never replace a base Blue stone with Turquoise/Aqua or label brown iron veining as Orange.`
      );
  }
  rules.push(`"dominantColors": ${donor ? DONOR_COLOR_RULE : COLOR_RULE}${sub.length ? '\n' + sub.join('\n') : ''}`);
  ```
* **Rationale**: Resolves the inconsistency across EM8264, EM8265, and EM8266 where three pieces from the same stone block received divergent color lists. Anchors the primary color to `Blue`, ensuring Shopify facet filters operate predictably.

---

## 4. Supplementary Recommendations for the Chief

1. **Add `Blue Argentina` to `CANONICAL_COLOR_MAP`**:
   In `src/lib/colorVocabulary.ts`:
   ```typescript
   'Blue Argentina': ['Blue', 'Brown', 'Tan'],
   ```
2. **Fix Bathtub Regex Boundary**:
   In classification logic, replace `text.includes('tina')` with word-boundary matching:
   ```typescript
   /(?:^|\s)tina(?:s)?(?:\s|$)/i.test(text)
   ```
3. **Correct EM8262 Photo Association**:
   Replace `docs/_inputs/photos/EM8262MFLH_1.jpg` with the authentic photograph corresponding to dimensions 36 x 32 x 13 cm.
4. **Data Cleansing on `shape` Attribute**:
   Migrate sizing terms (`Medium`, `Large`) from `shape` into a dedicated `size_tier` column, and restore `shape = "Bowl"` / `"Wavy Bowl"`.
