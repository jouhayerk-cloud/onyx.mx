# AI Processing & Prompt Reference

## Models Used

| Model | Use Case | Location |
|-------|----------|----------|
| `gemini-4-hydrogen` (fallbacks: `gemini-3.8-flash`, `gemini-4-argon`) | Book 826 titles, marketing descriptions, color classification, type categorization, spatial segmentation, `character_ai` | `src/lib/ai/models.ts` (`content`, `segmentation`), `BatchProcessingWizard.tsx` |
| `gemini-3.5-flash-lite` (fallbacks: `gemini-4-hydrogen`, `gemini-3.8-flash`) | Fast translation notes and intent triage | `src/lib/ai/models.ts` (`translate`, `triage`) |
| `gemini-nano-banana-2.1` (fallbacks: `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`) | Background replacement and Scene Composer | `src/lib/ai/models.ts` (`bgReplace`), `SceneComposerView.tsx` |
| `gemini-omni-1.2-flash` | Video background removal via `/v1beta/interactions` | `src/lib/ai/models.ts` (`video`), `videoAI.ts` |
| `gemini-3.8-live` | Live audio voice orb | `src/features/onyx/BotOrb.tsx` |

## 4-Step Hybrid Processing Pipeline

### Step 1: Local GPU Background Removal
- Library: `@imgly/background-removal`
- Input: Raw product images
- Output: Initial segmentation mask
- Runs entirely client-side (no network)

### Step 2: Vector Tracing
- Bézier curve engine traces mask boundaries
- Generates SVG path data
- Used for high-quality cutout edges

### Step 3: Cloud AI Refinement (Gemini 4 Hydrogen — `thinkingLevel: low`)
- Sends image + initial mask to Gemini
- Refines layer detection for complex geometries
- Special handling:
  - Mirrors: frame vs. glass/reflection distinction
  - Canoes: rim vs. interior separation
  - Cylinder Pendants: translucent material handling

### Step 4: Composite Output
- Combines refined mask with original image
- Generates: high-res PNG cutout, SVG path, data URLs
- Stores in `generatedPngUrl`, `generatedSvgUrl`

## Color Classification Prompt Rules

### Allowed Palette (Shopify-Compatible)
```
Black, Blue, Bronze, Brown, Clear, Copper, Cream, Gold, Gray, Green,
Iridescent, Multicolor, Orange, Pink, Purple, Rainbow, Red, Rose Gold,
Silver, Tan, Turquoise/Aqua, White, Yellow
```

### Special Rules
- Return 2-3 dominant colors from the allowed list
- **NEVER** select "Black" for translucent items (e.g., Cylinder Pendants)
  - Rationale: Dark studio backgrounds get misclassified as item color
- Consider material translucency when classifying colors
- Stone veining patterns may warrant "Multicolor" classification

## Type/Category Classification

### Allowed Shopify Taxonomy
```
Home Decor > Pendant Lights
Home Decor > Decorative Bowls
Home Decor > Decorative Trays
Home Decor > Sculptures
Outdoor Decor > Fountains
```

### Shape → Type Mapping Rules
- Canoe → MUST map to `Home Decor > Decorative Trays`
- Cylinder → `Home Decor > Pendant Lights`
- Bowl → `Home Decor > Decorative Bowls`
- Sculpture/Figure → `Home Decor > Sculptures`
- Fountain → `Outdoor Decor > Fountains`

## Description Generation Rules

### Short Description & Book 826 Copy (Gemini 4 Hydrogen — `thinkingLevel: medium`)
- Single sentence, concise
- No articles ("a", "the")
- Based on: shape, material, dimensions
- Strict JSON output format

### Detailed Description / Marketing Copy (Gemini 4 Hydrogen)
- Length: 1000-1200 characters
- Format: HTML (`<p>`, `<ul>`, `<li>`)
- Tone: Premium, artisanal, luxury
- Emphasis: Mexican stone craftsmanship, translucency
- **FORBIDDEN WORD**: "lamp" → use "Luminarie" or "Light Fixture"
- No articles ("a", "the") at sentence start
- Strict JSON output with `box_2d` bounding boxes and polygons

## Video AI Processing

### Pipeline (`videoAI.ts`)
1. Video input analyzed for duration
2. If >10s: in-browser FFmpeg slices into chunks
3. Each chunk sent to Gemini with prompt:
   > "GENERATE new video... Remove all items in the background and leave ONLY the item in a pristine, empty environment"
4. Processed chunks reassembled
5. Output: Clean semantic clips of inventory items

## Color Extraction Algorithm (`colorExtractor.ts`)

### Canvas-Based Extraction
1. Image rendered to canvas
2. Pixel sampling with background filtering
3. Euclidean distance mapping to Shopify palette
4. Returns closest 2-3 palette colors

### Color String Cleanup (`cleanColorString`)
- Strips material names from color strings
- Removes: 'ONYX', 'MARBLE', 'STONE', etc.
- Example: "GREEN ONYX" → "GREEN"

## OnyxChat AI Agent (`features/onyx/OnyxChat.tsx`)

### Capabilities
- Conversational AI powered by Gemini
- Custom tool-calling:
  - `search_inventory`: Natural language inventory queries
  - `deploy_inventory_artifact`: Generate inventory visualizations
- Speech-To-Text: Web Speech API
- Text-To-Speech: Browser synthesis
- Role: "Sentient warehouse asset discovery engine"
