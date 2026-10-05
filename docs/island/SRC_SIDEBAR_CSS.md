# CSS rules that mention .sidebar or .app-container (script-extracted, verbatim, with file and line numbers)

## index.css (77 rule blocks)
```css
/* index.css:75-78 */
.sidebar {
    will-change: width;
    /* Removed translateZ(0) to prevent breaking backdrop-filter */
}

/* index.css:136-146 */
.app-container {
  border-radius: var(--box-radius);
  width: 100%;
  height: 100%;
  max-height: 100%;
  display: flex;
  overflow: hidden;
  background-color: transparent;
  position: relative;
  z-index: 1;
}

/* index.css:159-171 */
.sidebar {
  flex-basis: 240px;
  max-width: 240px;
  flex-shrink: 0;
  background-color: var(--sidebar-bg);
  backdrop-filter: blur(25px);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 500;
}

/* index.css:173-179 */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  height: 64px;
}

/* index.css:181-186 */
.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--text-color);
}

/* index.css:188-192 */
.sidebar-logo .onyx-logo {
  /* Size controlled by Tailwind className prop (w-10, w-8) */
  transition: width 0.3s ease-in-out, height 0.3s ease-in-out;
  flex-shrink: 0;
}

/* index.css:194-197 */
.sidebar-logo-text {
  font-weight: bold;
  font-size: 1.2rem;
}

/* index.css:199-207 */
.sidebar-list {
  list-style-type: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  flex-grow: 1;
}

/* index.css:209-221 */
.sidebar-list-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--secondary-text-color);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s ease;
  cursor: pointer;
}

/* index.css:223-227 */
.sidebar-list-item-main {
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* index.css:230-233 */
.sidebar-list-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--text-color);
}

/* index.css:235-239 */
.sidebar-list-item.active {
  background-color: var(--main-color);
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* index.css:241-251 */
.sidebar-list-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 4px;
  background-color: #fff;
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
}

/* index.css:253-256 */
.sidebar-list-item-main svg {
  width: 20px;
  height: 20px;
}

/* index.css:258-262 */
.sidebar-list-item .chevron {
  width: 16px;
  height: 16px;
  transition: transform 0.2s ease;
}

/* index.css:264-266 */
.sidebar-list-item.open .chevron {
  transform: rotate(90deg);
}

/* index.css:268-275 */
.sidebar-submenu {
  list-style-type: none;
  padding-left: calc(1rem + 20px + 0.5rem);
  margin: 0;
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-in-out;
}

/* index.css:277-289 */
.sidebar-submenu-item {
  padding: 0.6rem 1rem;
  font-size: 0.875rem;
  color: var(--secondary-text-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  white-space: nowrap;
}

/* index.css:291-295 */
.sidebar-submenu-item .submenu-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* index.css:297-300 */
.sidebar-submenu-item:hover {
  color: var(--text-color);
  background-color: rgba(255, 255, 255, 0.05);
}

/* index.css:302-305 */
.sidebar-submenu-item.active {
  color: var(--main-color);
  font-weight: 600;
}

/* index.css:307-311 */
.sidebar-list-item.open+.sidebar-submenu {
  max-height: 300px;
  /* Adjust as needed */
  margin: 0.25rem 0 0.5rem;
}

/* index.css:313-316 */
.sidebar-footer {
  margin-top: auto;
  padding: 1rem;
}

/* index.css:360-364 */
.app-content,
.sidebar {
  padding-left: var(--sa-left);
  padding-right: var(--sa-right);
}

/* index.css:373-375 */
.sidebar {
  padding-top: var(--sa-top);
}

/* index.css:519-530 */
.sidebar-toggle,
.sidebar-state-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  width: 32px;
  height: 32px;
}

/* index.css:532-535 */
.sidebar-state-toggle {
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

/* index.css:537-539 */
.sidebar-state-toggle:hover {
  opacity: 1;
}

/* index.css:541-547 */
.sidebar-toggle .onyx-logo,
.sidebar-state-toggle .onyx-logo {
  width: 24px;
  height: 24px;
  color: var(--text-color);
  transition: transform 0.3s ease-in-out;
}

/* index.css:550-553 */
.app-container.sidebar-compact .sidebar {
  flex-basis: 80px;
  max-width: 80px;
}

/* index.css:555-557 */
.app-container.sidebar-compact .sidebar-state-toggle .onyx-logo {
  transform: rotate(90deg);
}

/* index.css:559-563 */
.app-container.sidebar-compact .sidebar-logo-text,
.app-container.sidebar-compact .sidebar-list-item-text,
.app-container.sidebar-compact .chevron {
  display: none;
}

/* index.css:565-567 */
.app-container.sidebar-compact .sidebar-list-item {
  justify-content: center;
}

/* index.css:569-571 */
.app-container.sidebar-compact .sidebar-list-item-main svg {
  margin-right: 0;
}

/* index.css:573-576 */
.app-container.sidebar-compact .sidebar-footer {
  display: flex;
  justify-content: center;
}

/* index.css:578-580 */
.app-container.sidebar-compact .menu {
  transform: translateX(6px);
}

/* index.css:583-598 */
.app-container.sidebar-compact .sidebar-submenu {
  position: absolute;
  left: 100%;
  top: 0;
  background: var(--sidebar-bg);
  backdrop-filter: blur(10px);
  padding: 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  width: 220px;
  z-index: 100;
  transition: opacity 0.2s, visibility 0.2s;
  visibility: hidden;
  opacity: 0;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}

/* index.css:600-608 */
.app-container.sidebar-compact .sidebar-list-item:hover .sidebar-submenu,
.app-container.sidebar-compact .sidebar-list-item.open+.sidebar-submenu {
  max-height: 300px;
  /* Allow content to show */
  visibility: visible;
  opacity: 1;
  margin: 0;
  padding-left: 0.5rem;
}

/* index.css:610-612 */
.app-container.sidebar-compact .sidebar-list-item.open+.sidebar-submenu {
  display: block !important;
}

/* index.css:615-617 */
.app-container.sidebar-hidden .sidebar {
  transform: translateX(-100%);
}

/* index.css:619-621 */
.app-container.sidebar-hidden .app-content {
  padding-left: 0;
}

/* index.css:623-626 */
.app-container.sidebar-hidden .main-header {
  padding-left: 0;
  transition: padding-left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* index.css:630-637 */
  .app-container.sidebar-hidden .sidebar {
    flex-basis: 0;
    max-width: 0;
    padding: 0;
    border: none;
    transform: translateX(0);
    overflow: hidden;
  }

/* index.css:641-648 */
  .sidebar {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    transform: translateX(0);
    z-index: 1000;
  }

/* index.css:650-652 */
  .app-container.sidebar-compact .sidebar {
    transform: translateX(0);
  }

/* index.css:658-661 */
  .app-container.sidebar-compact .sidebar-list-item.open+.sidebar-submenu {
    max-height: 300px;
    margin: 0.25rem 0 0.5rem;
  }

/* index.css:828-848 */
.sidebar-compact-tooltip {
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%) scale(0.95);
  background: var(--sidebar-bg);
  backdrop-filter: blur(12px) saturate(140%);
  color: var(--text-color-primary);
  padding: 8px 16px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  white-space: nowrap;
  z-index: 1000;
}

/* index.css:850-855 */
.app-container.sidebar-compact .sidebar-list-item:hover .sidebar-compact-tooltip {
  opacity: 1;
  visibility: visible;
  left: calc(100% + 16px);
  transform: translateY(-50%) scale(1);
}

/* index.css:2239-2245 */
.shipping-view-container.sidebar-collapsed .shipping-sidebar {
  width: 0;
  padding: 0;
  border-right: none;
  overflow: hidden;
  transform: translateX(-100%);
}

/* index.css:2309-2311 */
.shipping-view-container.sidebar-collapsed .shipping-sidebar-toggle {
  transform: translateX(0);
}

/* index.css:2649-2651 */
html.performance-mode-active .app-container {
  background-color: var(--app-bg) !important;
}

/* index.css:2687-2689 */
html.performance-mode-active .sidebar {
  background-color: var(--sidebar-bg);
}

/* index.css:2767-2769 */
.sidebar {
  transition: all 0.35s var(--ease-smooth);
}

/* index.css:2771-2775 */
.sidebar-list-item {
  transition: all 0.2s var(--ease-smooth);
  font-size: 0.875rem;
  letter-spacing: 0.01em;
}

/* index.css:2777-2779 */
.sidebar-list-item:hover {
  transform: translateX(2px);
}

/* index.css:2781-2783 */
.sidebar-list-item.active {
  transform: translateX(0);
}

/* index.css:2812-2817 */
.sidebar-logo-text {
  animation: logoSlideIn 0.4s var(--ease-spring) forwards;
  transform-origin: left center;
  white-space: nowrap;
  overflow: hidden;
}

/* index.css:2819-2821 */
.app-container.sidebar-compact .sidebar-logo-text {
  display: none;
}

/* index.css:2895-2914 */
.sidebar-fab {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 200;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--sidebar-bg);
  backdrop-filter: blur(20px);
  /* backdrop-filter intentionally omitted — FAB uses sidebar-bg which is already semi-transparent */
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: transform 0.25s var(--ease-spring), box-shadow 0.2s ease;
  animation: fabAppear 0.35s var(--ease-spring) forwards;
}

/* index.css:2916-2919 */
.sidebar-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--main-color);
}

/* index.css:2934-2937 */
.app-container.sidebar-compact .sidebar {
  flex-basis: 72px;
  max-width: 72px;
}

/* index.css:2939-2942 */
.app-container.sidebar-compact .sidebar-list-item {
  justify-content: center;
  padding: 0.75rem;
}

/* index.css:2944-2947 */
.app-container.sidebar-compact .sidebar-list-item-main svg {
  width: 22px;
  height: 22px;
}

/* index.css:2950-2952 */
.app-container.sidebar-hidden .sidebar-state-toggle {
  display: none;
}

/* index.css:2962-2965 */
  .sidebar-list-item.active {
    color: #1a1a1a !important;
    text-shadow: none;
  }

/* index.css:2967-2969 */
  .sidebar-list-item.active svg {
    color: #1a1a1a;
  }

/* index.css:2995-2997 */
  .sidebar-footer button {
    color: var(--text-color);
  }

/* index.css:3317-3320 */
  .sidebar-list-item {
    padding: 0.875rem 1rem;
    min-height: 44px;
  }

/* index.css:3322-3325 */
  .sidebar-submenu-item {
    min-height: 44px;
    padding: 0.75rem 1rem;
  }

/* index.css:3413-3416 */
.sidebar-list-item.active {
  /* Auto-detect text color based on background luminance */
  color: color-mix(in srgb, var(--main-color) 0%, black);
}

/* index.css:3421-3425 */
html.theme-obsidian .sidebar-list-item.active,
html.theme-malaquite .sidebar-list-item.active {
  color: #000;
  /* dark text on bright main-color backgrounds */
}

/* index.css:3429-3434 */
  .app-container.sidebar-hidden .sidebar {
    flex-basis: 0;
    max-width: 0;
    overflow: hidden;
    border: none;
  }

/* index.css:3438-3440 */
.sidebar-list-item.open+.sidebar-submenu {
  animation: submenuOpen 0.25s var(--ease-out-quart) forwards;
}

/* index.css:3501-3506 */
.sidebar-submenu-item .submenu-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  opacity: 0.7;
}

/* index.css:3508-3510 */
.sidebar-submenu-item.active .submenu-icon {
  opacity: 1;
}

/* index.css:3530-3550 */
.sidebar-compact-tooltip {
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.85);
  color: white;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 200;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* index.css:3552-3554 */
.app-container.sidebar-compact .sidebar-list-item:hover .sidebar-compact-tooltip {
  opacity: 1;
}

```

## src/styles\slab-glass.css (2 rule blocks)
```css
/* src/styles\slab-glass.css:872-879 */
html.style-slab .crate-card:hover,
html.style-slab .catalog-hub .cat-action:hover,
html.style-slab #process .proc-layer:hover,
html.style-slab #process .proc-vault-row:hover,
html.style-slab .sidebar-list-item:not(.active):hover,
html.style-slab .sidebar-submenu-item:not(.active):hover {
    background-color: var(--slab-glass-row-hover) !important;
}

/* src/styles\slab-glass.css:881-889 */
html.style-slab .crate-card.is-selected,
html.style-slab .catalog-hub .cat-action:has(input:checked),
html.style-slab #process .proc-op.is-selected,
html.style-slab #process .proc-vault-row.is-selected,
html.style-slab #process .proc-layer.is-active,
html.style-slab .sidebar-list-item.active,
html.style-slab .sidebar-submenu-item.active {
    background-color: var(--slab-glass-on) !important;
}

```

## src/styles\slab.css (11 rule blocks)
```css
/* src/styles\slab.css:288-292 */
html.style-slab .sidebar {
    background-color: var(--slab);
    border-right: none;
    box-shadow: var(--slab-raised);
}

/* src/styles\slab.css:295-297 */
html.style-slab .app-container.sidebar-hidden .sidebar {
    box-shadow: none;
}

/* src/styles\slab.css:317-322 */
html.style-slab .sidebar-list-item.active {
    background-color: color-mix(in srgb, var(--main-color) 12%, var(--slab)) !important;
    color: var(--main-color) !important;
    box-shadow: var(--slab-pressed);
    text-shadow: none;
}

/* src/styles\slab.css:324-326 */
html.style-slab .sidebar-list-item.active svg {
    color: var(--main-color) !important;
}

/* src/styles\slab.css:329-331 */
html.style-slab .sidebar-list-item.active::before {
    background-color: var(--main-color) !important;
}

/* src/styles\slab.css:333-337 */
html.style-slab .sidebar-submenu-item.active {
    background-color: color-mix(in srgb, var(--main-color) 10%, var(--slab)) !important;
    color: var(--main-color) !important;
    box-shadow: var(--slab-pressed);
}

/* src/styles\slab.css:598-601 */
html.style-slab .sidebar-list-item {
    border-radius: var(--slab-r-sm);
    transition: box-shadow var(--slab-ease), background-color var(--slab-ease);
}

/* src/styles\slab.css:603-607 */
html.style-slab .sidebar-list-item:not(.active):hover {
    transform: none;
    box-shadow: var(--slab-lift);
    background-color: var(--slab-tint-hover) !important;
}

/* src/styles\slab.css:609-612 */
html.style-slab .sidebar-list-item.active:hover {
    box-shadow: var(--slab-pressed-deep);
    background-color: var(--slab-tint-on-hi) !important;
}

/* src/styles\slab.css:614-619 */
html.style-slab .sidebar-submenu-item:not(.active):hover {
    transform: none;
    box-shadow: var(--slab-lift);
    background-color: var(--slab-tint-hover) !important;
    border-radius: var(--slab-r-sm);
}

/* src/styles\slab.css:882-886 */
html.style-slab button[aria-pressed="true"]:not(:where(.ui-root, .ui-root *)),
html.style-slab button[data-active="true"]:not(:where(.ui-root, .ui-root *)),
html.style-slab .sidebar-list-item.active {
    background-image: var(--slab-sheen-on) !important;
}

```
