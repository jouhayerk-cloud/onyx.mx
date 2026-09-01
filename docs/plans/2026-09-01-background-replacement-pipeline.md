# Background Replacement Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Replace the alpha-matting image cleanup in the AI Batch Process wizard with generative background replacement, so natural-stone pieces are never punched full of holes.

**Architecture:** A new `src/lib/bgReplace.ts` owns one job — send a photo to a Gemini image model, get back the same piece standing in an empty dark room, upload it to Supabase Storage. The wizard gains a fourth `processingMode` (`bgreplace`) that becomes the default and short-circuits the entire mask/contour/alpha path. The existing local / cloud / hybrid modes stay reachable but stop being the default. Transparent-PNG cutouts become an explicit opt-in rather than a by-product of every run.

**Tech Stack:** React 19 + Vite, `@google/genai` v2.14, Supabase Storage (`inventory-media`, authenticated writes), Jotai, RxDB mirror of the `inventory` table.

---

## Background: why this replaces the mask path

Verified against the live `onyx.mx` database (497 items, 241 with media, 498 images) and the code:

| # | Defect | Location |
|---|---|---|
| 1 | `isBlackBg` punches every dark low-saturation pixel transparent, after the model mask — deletes dark veining, shadowed undersides, black hardware | `utils.tsx:1077`, `utils.tsx:1786` |
| 2 | Alpha hard-binarised at `a > 30` — destroys every soft matte value, breaks translucent onyx | `utils.tsx:1085` |
| 3 | Cylinder pendants skip the model composite entirely; output is a pure chroma key | `utils.tsx:1057` |
| 4 | `preprocessForMasking` boosts contrast/saturation before the model, worsening #1 | `utils.tsx:867` |
| 5 | `findContour` keeps only the largest blob; `fillInternalMaskHoles` fills real holes | `utils.tsx:740`, `utils.tsx:983` |
| 6 | `resizeImage` letterboxes with 10% padding but the un-normalisation assumes none → 25% scale error on every Gemini polygon | `utils.tsx:501` vs `BatchProcessingWizard.tsx:508,688` |
| 7 | `generatePngAndSvgFromMasks` passes scaled-space crop coords as the full-res source rect → top-left crop of any photo > 1600px | `utils.tsx:1763` |
| 8 | Cloud mode references undeclared `processedSdrUrl` → `ReferenceError`, caught, "Cloud Mask failed". Cloud/hybrid discard Gemini's output and reuse the local contour anyway | `BatchProcessingWizard.tsx:526,565,700` |
| 9 | Payload writes `local_segmentation_masks` / `cloud_segmentation_masks`, which **do not exist** in Postgres → any save carrying them hits `42703` and the recovery path drops `generated_color`, `generated_type`, `product_category`, `product_type`. **Latent, not yet observed:** the audit below shows `generated_color` at 397/397, so no colour has actually been lost | `BatchProcessingWizard.tsx:967,1155` |
| 10 | `svgData` generated every run, never persisted — `generated_svg_url` is 0/497 | `BatchProcessingWizard.tsx:1122` |
| 11 | `handleStartBatch` is serial with `sleep(1000)`; `if (isAborted) break` reads a stale closure so abort cannot stop the loop | `BatchProcessingWizard.tsx:1637` |
| 12 | `callGemini` sets no `responseMimeType`/`responseSchema`, so four call sites strip ```json fences by hand; copy pass runs on `gemini-2.5-pro` | `BatchProcessingWizard.tsx:236` |

Defects 1–7 are all *post-processing*. Background replacement removes the need for every one of them: the model never answers "keep or delete this pixel", so a mistake is a slightly-wrong room rather than a hole in the product.

**Display contract to preserve:** `UnifiedInventoryView.tsx:314` renders `processedMap[cleanSourceUrl]`. The new cleaned image must be stored under that exact key. No schema change is needed for the image itself.

---

## Live database audit (2026-09-01, `onyx.mx` prod)

Run directly against Postgres, not inferred from code.

**Shape of `processed_media_urls`** — 397 rows, **all 397 in JSON-map form**, zero legacy comma-separated, zero empty maps. The map holds two kinds of entry: metadata keys prefixed `_` (`_generated_color`, `_generated_type`, `_product_category`…) and image keys.

| Measure | Count |
|---|---|
| Rows with `processed_media_urls` | 397 |
| — of those, rows carrying **at least one cleaned image** | **116** |
| — of those, rows carrying **only `_` metadata, no image** | **281** |
| Total image entries across all maps | 294 |
| Image-entry values hosted on Google Drive | 294 (100%) |
| Image-entry values on Supabase Storage | 0 |
| Map keys in `lh3.googleusercontent.com/d/{id}` form | 294 (100%) |
| Map keys in raw `drive.google.com` form | 0 |

**Three conclusions that change the plan:**

1. **`aiContent.ts` overcounts image cleanup by 3.4×.** Its header asserts "397 image cleanup" and treats `processed_media_urls` as the funnel's entry gate. Only **116** rows actually have a cleaned image; the other 281 have colour/type metadata parked in the same column. The `enriched` filter chip is counting metadata as imagery. There is far less good processed output to preserve than the column count suggests — migration risk is low.

2. **The key format is already correct.** Keys are stored in the `lh3` form that `getCleanImageUrl()` produces, which is exactly what `UnifiedInventoryView`'s `images.map(img => processedMap[img])` looks up. New writes MUST use `getCleanImageUrl(sourceUrl)` as the key, not the raw URL.

3. **Defect #9 is latent, not active.** `generated_color` is populated on **397/397** rows including all 176 with masks, so the `42703` recovery has not in fact eaten any colour. It remains a live trap — any save carrying those two columns *will* fail into the lossy retry — but it is not the cause of missing data today. `generated_type` is the sparse one (83/397), and that is explained by the field post-dating most runs, not by the retry.

**Storage:** the entire processed corpus lives in Google Drive via the Apps Script `uploadMedia` action. The `inventory-media` Supabase bucket holds only generated video. New cleaned images go to Supabase (public read, authenticated write); Drive stays readable for the legacy 294.

**RxDB mismatch:** `spatial_masks` is stored as a JSON **object** on all 176 rows, while `database.ts:165` declares `{ type: ['array','null'] }`. Not caused by this work, but it is a standing sync-validation hazard on exactly the rows this pipeline writes.

### Reconciliation with the `jouhayerk-3a` audit

A second audit arrived mid-implementation. Where we disagreed, these are the re-queried answers:

| Claim | Their figure | Verified | Verdict |
|---|---|---|---|
| Re-run backlog | **13 items** | **125 items** | **Wrong.** Equates "has `processed_media_urls`" with "has a cleaned image". 281 of the 397 maps contain only `_`-prefixed metadata and no image entry at all. Against 241 rows with photos, 125 have photos but no cleaned image. |
| `generated_type` | "dead column, never written" | **83 rows non-blank** | **Wrong**, and consequential — it is listed under "DEAD COLUMNS". Do not drop it. |
| Cutout count | 116 | **121 non-null / 115 non-blank** | Both of us were off; 6 rows hold an empty string. |
| `generated_color` gap | "2 rows have `processed_media_urls` but no colour (395)" | **0 rows; 397** | Not an error by either of us — the table is live. `count(generated_color)` returned 395 at 19:20 and 397 at 19:55. Two rows gained colour mid-session. |
| `generated_svg_url`, `generated_image_urls` dead | 0 | **0** | Confirmed. |
| Funnel is a strict prefix | — | — | Confirmed on the column-presence test; it does not survive the has-an-actual-image test. |

### Second pass — both audits corrected again

`jouhayerk-3a` re-queried, accepted all four corrections above, and returned two further errors of its own plus one correction to MY framing. I verified every one independently. All confirmed:

**The funnel published in the original `aiContent.ts` header was wrong twice over.**

* Its `397 → 175 vision → 142 copy` split does not exist. `detailed_description`, `generated_description`, `spatial_masks` and `spatial_points` all sit at **176 with zero mismatches on every pairing** — there is ONE analysis stage, not two.
* The containment is inverted. Cleaned images are a **subset of described items**, not their parent: `cleaned_without_described = 0`, `png_without_cleaned = 0`, `gtype_without_described = 0`.

```
497
 └─ 397  metadata      (169 have NO photos — text-derived, not image work)
     └─ 176  described
         ├─ 116  cleaned image
         │   └─ 115  cutout
         └─  83  generated_type
```

The four `_` keys are exactly `_generated_color` (397), `_pixel_map_hex` (176), `_bitmap_url` (143), `_generated_type` (83).

**Correction to my own framing — Rock is the worst rate, but not the volume.** I reproduced `classifyGeometry` from `src/lib/geometry.ts` in SQL, honouring its branch order and its `shape` + `short_description ?? description` inputs. My independent numbers match theirs exactly:

| Class | Photographed | Cleaned | Backlog | Rate |
|---|---|---|---|---|
| **Box** (incl. rectangular mirrors) | 132 | 40 | **92** | 30% |
| **Rock** | 25 | 1 | 24 | **4%** |
| Mirror (round) | 9 | 6 | 3 | 67% |
| Cylinder | 36 | 33 | 3 | 92% |
| Bowl | 36 | 34 | 2 | 94% |

**Two different problems, and this plan only fixes one of them.**

* **Rock at 4%, and mirrors at 47% across both mirror classes (7 of 15), against 92–94% for Cylinder and Bowl, is a capability failure.** Irregular quarry stone and reflective frames are where matting collapses. That is what background replacement and the polygon-scale fix target, and it matches the user's own report of lamps and mirrors losing parts.
* **Box is 92 of the 125 backlog (74%) and reads as an unrun queue**, not a failure — though nothing records attempts, so "never run" is an inference, not a measurement. Volume here is a scheduling problem.

Judge this work on Rock and the mirrors, not on Box throughput.

**`aiContent.ts` is already fixed on main** (`4dfa6af1`): `hasCleanedImage()` requires a non-`_` key, `hasEnrichment` is gone, `hasVision`/`hasCopy` collapsed into `hasDescription`, and `needsImageCleanup()` is the 125 predicate. The removed exports had no external callers — `CONTENT_FILTERS`, `countContent`, `ContentKey` and `rowMatchesContent` all survive, so `UniversalToolsBar` and `UnifiedInventoryView` are unaffected. This branch is rebased onto it.

---

## Task 1: `bgReplace.ts` — the generation module

**Files:**
- Create: `src/lib/bgReplace.ts`

**Step 1 — model chain and config.** Default `gemini-3.1-flash-image-preview` at 2K (their source photos are 4000px; 1K would visibly downgrade the catalogue), falling back to `gemini-2.5-flash-image` — the model `SceneComposerView.tsx:184` already proves works against their key.

**Step 2 — input preparation.** Must NOT use `resizeImage()`: it letterboxes onto a `#121212` canvas with 10% padding, and that padding would be baked into the generated image as a literal dark border. Downscale on the long edge only, preserving aspect ratio.

**Step 3 — the prompt.** Pin the three things that break on natural stone: dark veining is *product*, rough unpolished edges are *product*, translucency must survive. Forbid re-framing, added props, and text.

**Step 4 — aspect ratio.** Snap the source ratio to the nearest supported value so the model does not silently reframe.

**Step 5 — upload.** Supabase Storage `inventory-media/cleaned/`, not the Apps Script Drive path — the bucket is public-read with authenticated writes and the wizard already uploads videos there.

**Step 6 — cache key.** Hash the source URL + prompt version so a rerun skips unchanged images.

**Verify:** `npx tsc --noEmit` passes.

**Commit:** `feat(ai): add generative background replacement module`

---

## Task 2: wire `bgreplace` into the wizard as the default mode

**Files:**
- Modify: `src/features/inventory/BatchProcessingWizard.tsx`

**Step 1** — add `'bgreplace'` to the `processingMode` union and to `BatchOp.result` a `cleanedUrl` field. Add the missing `stepLabel` field that is already written but never declared.

**Step 2** — default new queue entries to `'bgreplace'` (currently `'local'` at `:186` and `:202`).

**Step 3** — new branch at the top of the image-processing block that calls `replaceBackgroundWithDarkRoom`, sets `op.result.cleanedUrl`, and returns without touching `preprocessForMasking` / `removeBackground` / `applyAlphaMask` / `findContour`.

**Step 4** — extend `toggleProcessingMode` to cycle `bgreplace → local → cloud → hybrid → bgreplace`, and add the mode chip to the UI at `:1981`.

**Verify:** open the wizard on one item in the dev preview; log shows the bgreplace path and no `removeBackground` call.

**Commit:** `feat(ai): make background replacement the default batch mode`

---

## Task 3: fix the save path

**Files:**
- Modify: `src/features/inventory/BatchProcessingWizard.tsx` (`handleSaveDescription`, `handleExportDatabase`)

**Step 1** — store `cleanedUrl` into `processedMap[sourceUrl]` so `UnifiedInventoryView` picks it up. Do **not** write it to `generated_png_url` — that column means "transparent cutout" and only 122 rows legitimately have one.

**Step 2** — delete `local_segmentation_masks` and `cloud_segmentation_masks` from both payloads and delete both `42703` recovery blocks. This is what has been silently eating `generated_color` and `generated_type`.

**Step 3** — persist `generated_svg_url` when a cutout run actually produces SVG.

**Step 4** — write `spatial_masks` as a parsed object, not a `JSON.stringify` string; the RxDB schema at `database.ts:165` declares it an array and a bare string risks a sync-loop.

**Verify:** run one item, then `select generated_color, generated_type, processed_media_urls from inventory where id = ...` and confirm all three are populated.

**Commit:** `fix(ai): stop the 42703 recovery path from discarding colour and type`

---

## Task 4: copy pass onto flash + structured output

**Files:**
- Modify: `src/features/inventory/BatchProcessingWizard.tsx:236` (`callGemini`)

Add `responseMimeType: 'application/json'` + a `responseSchema`, switch the copy pass from `gemini-2.5-pro` to `gemini-2.5-flash`, and drop the hand-rolled fence-stripping. ~7× cheaper on a task Pro was not buying anything on.

**Commit:** `perf(ai): structured JSON output and flash for the copy pass`

---

## Task 5: only process what needs processing

**Files:**
- Modify: `src/features/inventory/BatchProcessingWizard.tsx`

**Step 1** — hero-image-only toggle (default on). At 2.07 images/item, this cuts generation volume by half.

**Step 2** — skip an image whose cache key already matches what is stored, unless force-regenerate is set.

**Step 3** — replace the serial loop + `sleep(1000)` with a concurrency-3 worker pool, and make abort a `useRef` so the button actually stops the run.

**Commit:** `perf(ai): hero-only default, cache-key skip, and a working abort`

---

## Task 6: make the build catch this class of bug

**Files:**
- Modify: `package.json`

Change `build` to `tsc --noEmit && vite build`. Defect #8 shipped a `ReferenceError` to production precisely because nothing typechecks.

**Commit:** `build: typecheck before bundling`

---

## Cost

| | Now | After |
|---|---|---|
| Copy pass | 2.5-pro + thinking ≈ $0.030/item | 2.5-flash + schema ≈ $0.004 |
| Segmentation | 2.5-pro, output discarded ≈ $0.015 | removed |
| Image cleanup | 60–120s local GPU, holes in the output | 3.1-flash-image @2K ≈ $0.101 |
| **241 hero images** | ~$11 + ~6 h wall clock, unusable | **~$25, correct** |

Dropping to `gemini-2.5-flash-image` (1024px) puts the full catalogue at ~$10 instead. Both are exposed in the UI.

## Risk

Background replacement is generative, so the model *can* subtly alter the product while repainting. Mitigations: the prompt pins framing and subject fidelity; originals stay untouched in `media_urls`; the wizard's existing per-image preview lets a human reject before save.
