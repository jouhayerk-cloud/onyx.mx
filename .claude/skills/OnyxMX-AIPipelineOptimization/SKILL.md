---
name: OnyxMX-AIPipelineOptimization
description: "Onyx.mx AI pipeline: the one prompting system in src/lib/ai (models, client, prompts, run engine, persist), Gemini jobs, Catalog Hub and Add Entry Generate, masks/PNG/SVG on Google Drive. Use when touching any AI call or prompt."
---

# OnyxMX AI Pipeline

Every inventory AI feature (Catalog Hub, Add/Edit Entry Generate, Batch Create hand-off, Batch Actions, Process view, translation) runs on one system in `src/lib/ai/`. Extend it; do not add a second path.

## Files

| File | Role |
|------|------|
| `models.ts` | Job → model map (`content`, `segmentation`, `translate`, `triage`, `bgReplace`, `video`). The only place pipeline model IDs (`gemini-4-hydrogen`, `gemini-3.5-flash-lite`, `gemini-nano-banana-2.1`, `gemini-omni-1.2-flash`) and `thinkingLevel` configs are written. |
| `keys.ts` | The one Gemini key resolver (saved key, legacy chat key, then build-time `VITE_GEMINI_API_KEY`). |
| `client.ts` | The only Gemini caller: REST, `x-goog-api-key` header, JSON schema output, `thinkingLevel` config on Gemini 3/4 (omitting deprecated `thinkingBudget`/custom `temperature`), timeout, retry/backoff, and `modelChain` fallback cascade. `generateText` / `generateJson`. |
| `limiter.ts` | Concurrency per job class (text / image / video). |
| `prompts.ts` + `vocabulary.ts` | Every prompt and schema: `buildContentPrompt`, `buildSegmentationPrompt`, `buildTranslatePrompt`, detection and mask prompts. |
| `item.ts` / `finalize.ts` | Row → pipeline item; post-processing of model output. |
| `run.ts` | `useAiRun`, the run engine behind the Hub and Generate (ops, retries, partial status, stop). |
| `persist.ts` | `buildAiPatch` / `saveAiPatch`: the one writer. Merges `processed_media_urls` and `spatial_masks`, never rebuilds them. |
| `errors.ts` | User-facing error text (through `tr()`). |

Documented exceptions: background replacement (`src/lib/bgReplace.ts`), `SceneComposerView`, and video (`src/lib/videoAI.ts` via `/v1beta/interactions`) consume `AI_MODELS` / `modelChain` from `src/lib/ai/models.ts`; `OnyxChat`, `useOnyxAgent` (Gemini 4 Hydrogen / 3.8 Flash / 4 Argon), and `BotOrb` (`gemini-3.8-live`) handle conversational and Live audio flows.

## Process ids

`img_clean`, `title_desc`, `marketing_desc`, `dominant_colors`, `hex_map`, `product_type`, `image_segmentation`, `video_proc`, `variation_donor`. An op can end `partial`.

## Canonical columns (owner decision)

| AI output | Column |
|-----------|--------|
| Title | `detailed_description` |
| Marketing HTML | `generated_description` |
| Colours | `generated_color` |
| Category / type | `generated_type` |

Never overwrite the vendor's own `description` (vendor text), `short_description` (manual Type) or `color` (vendor colour).

## Images

- Cutout: local `@imgly/background-removal` → traced path → PNG and an SVG that embeds the cutout with an outline (`cutoutSvgDocument` in `src/lib/catalogHubPipeline.ts`).
- Storage is **Google Drive only** (Apps Script upload in `src/lib/utils.tsx`, with a timeout). Never Supabase Storage for images.
- Load or display Drive files through `getCleanImageUrl` (lh3 link): `uc?export=view` fails CORS and Drive serves SVG as a download.

## Rules

- JSON output always goes through a schema in `prompts.ts` and `generateJson`.
- Keep AI optional: every AI field has a manual fallback, and a failed call never blocks saving.
- Calls bill the owner's Gemini key: no duplicate calls on retry; reuse results already in the run.
- For Gemini 3.x/4.x models (`gemini-4-*`, `gemini-3.8-*`, `gemini-3.5-*`), always use `thinkingConfig.thinkingLevel` (`low` | `medium` | `high`) and omit `thinkingBudget` and custom `temperature`/`topP`/`topK`.
- The key moves to a server proxy later; `keys.ts` is the only file that should change then.
