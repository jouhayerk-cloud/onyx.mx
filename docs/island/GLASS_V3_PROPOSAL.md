# Glass V3 Proposal for Onyx Island and Sidebars

## 1. Overview
This proposal outlines the implementation of a new "Liquid Glass" style based on advanced CSS and SVG filter techniques found in the Cubiq liquid glass example. This effect achieves a dynamic, refractive glass behavior and dynamic liquid buttons that will greatly enhance the Onyx Island, menu bars, and sidebars.

## 2. Core Techniques Used

### A. SVG Filters for Liquid Refraction & Lighting
The core of the glass effect relies on custom SVG `<filter>` elements acting as `backdrop-filter`s:
- **7:1 Bit Packing (`#pack-upper`, `#pack-lower`)**: Used to manipulate and preserve color channel precision directly within SVG using `feComponentTransfer` and `feColorMatrix` for sub-pixel lighting accuracy.
- **Normal Map Generation**: The filter calculates normal maps dynamically via directional lighting (`feDiffuseLighting`) separated into RGB channels (e.g. Red for top, Green for left, Black for bottom) which is then composited to generate a realistic displacement map (`feDisplacementMap`).
- **Fresnel Effect (`#fresnel`)**: Uses `feMorphology` and `feGaussianBlur` to create a subtle refractive outline simulating light bouncing off the edges of the glass.

### B. CSS Implementation for the Glass Container
The main container applies the filters via pseudo-elements to maintain content clarity while accurately distorting the background:
```css
nav.glass::before {
  content: '';
  position: absolute;
  inset: 0;
  backdrop-filter: url(#pack-upper);
}

nav.glass::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  backdrop-filter: 
    url(#liquid-glass-new) 
    url(#fresnel)
    drop-shadow(0 0 10px #0003);
}
```

### C. Liquid Icon/Button Behavior (HTML/CSS)
The icons within the glass container use morphological scaling and custom transitions to create a "gooey" or liquid reaction when interacted with.
- **Gooey Filter (`#round`)**: Combines `feGaussianBlur` and `feComponentTransfer` with high contrast thresholds.
- **Blend Modes**: Uses `mix-blend-mode: plus-lighter;` inside the icon container for correct color channel additions.
- **Spring Animation**: Uses a complex linear easing function to give the buttons an elastic/spring feel upon interaction.
```css
.icons {
  display: flex;
  filter: url(#round) url(#pack-lower);
  mix-blend-mode: plus-lighter;
}

.icon {
  /* Complex linear spring morph */
  transition: scale 1s linear(0, 0.038 1.6%, 0.154 3.4%, 1.026 12.6%, 1.166 15.2%, 1.234 18%, 1.221 21.6%, 1.005 31.2%, 0.944 37%, 1.013 56%, 1);
  will-change: transform;
}

nav:has(.icon:active) .icon:hover {
  transition-timing-function: ease-out;
  transition-duration: 130ms;
  scale: .75; /* Shrinks on press */
}
```

## 3. Integration Strategy for Onyx
- **Global SVG Filters**: Define the `#liquid-glass-new`, `#fresnel`, `#pack-upper`, and `#pack-lower` SVG filters at the root of the application (e.g., in a hidden `<svg>` block in the `index.html` or main layout component).
- **Onyx Island & Sidebars**: Apply the `.glass::before` and `.glass::after` pseudo-elements to the container elements for the menus, using the referenced SVG filters for the backdrop.
- **Interactive Elements**: Replace standard transitions on the Island buttons with the `linear(...)` spring scale transition, and apply the `plus-lighter` mix-blend-mode in an isolated stacking context to achieve the gooey liquid behavior.
