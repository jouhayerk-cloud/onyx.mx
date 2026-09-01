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
| 9 | Payload writes `local_segmentation_masks` / `cloud_segmentation_masks`, which **do not exist** in Postgres → every masked save hits `42703` and the recovery path silently drops `generated_color`, `generated_type`, `product_category`, `product_type` | `BatchProcessingWizard.tsx:967,1155` |
| 10 | `svgData` generated every run, never persisted — `generated_svg_url` is 0/497 | `BatchProcessingWizard.tsx:1122` |
| 11 | `handleStartBatch` is serial with `sleep(1000)`; `if (isAborted) break` reads a stale closure so abort cannot stop the loop | `BatchProcessingWizard.tsx:1637` |
| 12 | `callGemini` sets no `responseMimeType`/`responseSchema`, so four call sites strip ```json fences by hand; copy pass runs on `gemini-2.5-pro` | `BatchProcessingWizard.tsx:236` |

Defects 1–7 are all *post-processing*. Background replacement removes the need for every one of them: the model never answers "keep or delete this pixel", so a mistake is a slightly-wrong room rather than a hole in the product.

**Display contract to preserve:** `UnifiedInventoryView.tsx:314` renders `processedMap[cleanSourceUrl]`. The new cleaned image must be stored under that exact key. No schema change is needed for the image itself.

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
