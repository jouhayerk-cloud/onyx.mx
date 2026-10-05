# LiquidOnyx Style Guide
*Evolution of Rock and Slab*

## 1. Core Philosophy
LiquidOnyx is the third generation of our design system. Where "Rock" was solid and grounded, and "Slab" was structural and translucent, **LiquidOnyx** is dynamic, refractive, and alive. It leverages sub-pixel lighting and morphology to make components feel like physical liquid glass resting on the screen.

## 2. Visual Primitives

### A. The Liquid Glass Material (`.liquid-glass`)
Unlike standard CSS `backdrop-filter: blur()`, LiquidOnyx uses actual SVG displacement mapping:
- **Refraction**: It bends the light of the content scrolling underneath it.
- **Fresnel Edges**: It gathers light at the borders, creating a luminous rim using `feMorphology`.
- **Implementation**: It is applied via pseudo-elements (`::before`, `::after`) to isolate the distortion from the text content.

### B. Gooey Interactions (Spring Physics)
Buttons and icons are no longer static. They behave like drops of mercury.
- When pressed, they shrink instantly.
- When released, they bounce back using a custom `linear()` spring curve:
  `transition: scale 1s linear(0, 0.038 1.6%, 0.154 3.4%, 1.026 12.6%, 1.166 15.2%, 1.234 18%, 1.221 21.6%, 1.005 31.2%, 0.944 37%, 1.013 56%, 1);`
- They employ SVG `#round` filters to create a gooey, merging effect when icons are placed closely together.

## 3. Structural Rules
- **No Dead Padding**: Layouts must stretch edge-to-edge. LiquidOnyx elements float *over* the content, they do not push it down.
- **Omni-Presence**: The Onyx Island is the central hub. It scales dynamically and houses all secondary tools.
- **Dark Elegance**: We maintain the deep blacks and ambers of the Onyx palette, but with `mix-blend-mode: plus-lighter` on interactive icons so they glow like bioluminescence against the dark glass.

## 4. Engineering Standards
- The SVG filter engine must be mounted globally at the root of the React app (e.g., `index.html` or a top-level `<SvgFilters />` component).
- All new components must reference the LiquidOnyx classes rather than overriding `style` tags manually.
