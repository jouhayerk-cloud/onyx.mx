---
name: LiquidOnyx
description: Liquid Onyx UI skill and design rules for the onyx.mx app - the Liquid Glass / slab glass system (tokens, surface classes, fills, blur, rim, sheen), theme handling (dark Talan default + aqua), iOS/Safari and Chrome constraints, data-dense Apple-style chrome, and the gate checklist. Use for ANY onyx.mx UI/UX work - new views, studios, sheets, sidebars, island, docks, rows, cards, scrims, restyles and reviews - and attach it to every UI agent brief together with apple-design and the taste skill.
---

# Liquid Onyx

Liquid Onyx is the onyx.mx house UI: clear frosted glass over a living stone background, Apple HIG hierarchy, data-dense and calm. Owner's rules first, taste second.

Precedence: owner (Ramses) instructions > this skill > apple-design > taste skill (design-taste-frontend). Taste bans glass and blur panels; for onyx.mx app chrome this skill wins. Use taste for hierarchy, type scale, density, copy and its no-slop rules.

## 1. Hard rules (gate fails if broken)

1. **No SVG refraction.** No `backdrop-filter: url(#...)` anywhere (smeared glass on Chrome, Safari drops the whole filter, blur included). Old blocks stay disabled as `@media not all { ... }`. SVG `fill="url(#gradient)"` inside drawings is fine.
2. **No emoji or emoticons** in bars, menus, chips, tabs, buttons, toasts or labels. lucide-react icons only.
3. **Glass is tokens, not literals.** Fill, blur, rim, sheen, shadow and ink come from `--lq-*` (src/styles/tokens.css). A component may override a token locally on its own root; it never hard-codes a dark-only colour.
4. **Liquid classes never set `position`** (`.liquid-surface`, `.liquid-panel`, `.liquid-control`); they broke fixed/sticky Tailwind utilities.
5. **Theme-aware.** Dark (Talan/Obsidian) is the default; `html.theme-aqua` is light. Every `text-white`, `bg-black/*`, `bg-white/*`, `border-white/*` in a component needs an aqua mapping (dark ink `var(--lq-ink)` = #0b2a33 on light glass).
6. **Reduced transparency** (`prefers-reduced-transparency: reduce`) gives solid fills: `--lq-solid-surface/panel/control`.
7. **Reduced motion** keeps content, drops travel.
8. **Never paint over the app.** Anything on `body::after`/`::before` (the slab wash) must sit under `#root` (`#root { z-index: 1 }`). A full-screen layer above content dims every view.
9. **No behaviour changes in a restyle.** Restyles touch CSS and class names, not data, handlers, print/BLE flows, Supabase writes, routing or security checks.

## 2. The glass recipe

Glass = translucent fill + backdrop blur + saturate + soft sheen + 1px light rim + inset highlight + soft shadow. Blur, not tint, separates a panel from what is behind it.

| Layer | Fill (dark / aqua) | Blur | Use |
|---|---|---|---|
| Surface `.liquid-surface` | `--lq-fill-surface` 0.16 / 0.18 | `--lq-blur` 22px | sidebar, island, docks, bars, sheets |
| Panel `.liquid-panel` | `--lq-fill-panel` 0.22 / 0.24 | `--lq-blur-panel` 16px | studios, dialogs, cards on glass |
| Control `.liquid-control` | `--lq-fill-control` 0.06 | `--lq-blur-control` 14px | buttons, segmented, inputs |
| List rows (slab) | `--slab-glass-row` ~22% slab | 18px | inventory, crates, finance rows |
| Row hover (slab) | `--slab-glass-row-hover` ~70% | 18px | hovered row reads denser than rest |
| Expanded row details | 60% slab, on `.inv-row + .inv-drawer` (full width incl. rail gutter) | 32px | dense layer under a row |

Filters: `backdrop-filter: var(--lq-filter)` (= blur + saturate 1.9 + brightness 1.08); always also set `-webkit-backdrop-filter`. Rim: `1px solid var(--lq-rim)`; highlight + shadow: `box-shadow: var(--lq-highlight), var(--lq-shadow)`. Sheen: `background-image: var(--lq-sheen)`.

Clear glass (owner's preferred direction): lower tint, keep blur, rim and sheen. When text sits on busy content, raise the fill of that one element, never the whole system.

## 3. Scrims behind sheets and studios

A modal sheet (Settings, Print Studio, Packaging Studio) floats on a frosted scrim, not a black curtain:
- Scrim: `rgba(2,6,16,.15-.18)` (aqua: `rgba(255,255,255,.22)`), `backdrop-filter: blur(8-22px) saturate(1.3-1.4)`.
- Give the scrim a class and override with `html .x-scrim.x-scrim { ... !important }`: slab-glass.css sweeps every `bg-black/*` and `backdrop-blur*` into glass.
- The sheet keeps its own glass; no solid `bg-[var(--bg-color)]` on the sheet.

## 4. Platform constraints

- **iOS Safari / WebKit:** no SVG backdrop filters; Web Bluetooth unavailable (show a message, never a dead button); 44pt touch targets.
- **Home Screen app (standalone):** `viewport-fit=cover`, `black-translucent`; the shell is `html, body { height: 100% }`, `#root { position: fixed; top/left/right 0; z-index: 1 }`; safe areas as padding (`env(safe-area-inset-*)`), never as container size. Known iOS bug: the web view can be 59pt short at the bottom (873 vs 932); CSS cannot paint it - the fix is the native container (ios/OnyxCompanion).
- **Chrome/Windows:** same slab recipe as Safari (refraction off).

## 5. Chrome and layout (Apple HIG, data-dense)

- One compact top bar per view: a segmented control for sections, compact filters with counts, inline meters. Every element does something; remove duplicates and decorative chips.
- Controls 32-36px on desktop, 44px on phone. Radii from tokens (surface 18, panel 14, control 8). One spacing scale.
- Titles: small, or none when the content names itself. Captions inline, sentence case. No giant uppercase section headers in side panels.
- Numbers: tabular figures (`font-variant-numeric: tabular-nums`), readable contrast in both themes, never an empty-looking input.
- Item identity always uses the inventory tag component `src/components/ui/ItemTag.tsx` (vendor+book coloured half + code half); never restyle it per view.
- Live states in form (status dot, pill, progress, checksum mark), not only text.
- Glass sheets: header bar, content, bottom action bar; primary action wide, secondary compact.

## 6. Where things live

- Tokens: `src/styles/tokens.css` (`--lq-*`; slab recipe block "Slab glass recipe everywhere").
- Classes: `src/styles/liquid.css`. Slab theme sweep and rows: `src/styles/slab-glass.css`, `src/styles/slab.css`.
- Shell: `index.css` (`#root`, phone rules), `src/features/core/topbarOverlay.css`.
- Sidebar/Island/Dock: `src/features/core/islandSidebar.css`, `src/features/onyxIsland/*.css`, `src/features/core/submenuDock.css`.
- Filters component (refraction defs, unused while off): `src/features/core/LiquidOnyxFilters.tsx`.

## 7. Gate checklist (run before merge)

1. `npx tsc --noEmit -p .` - 0 errors under `src/`; `npm run build` passes.
2. `grep -rn "backdrop-filter: url(#" src` - only inside `@media not all`.
3. No emoji in added lines (scan `[☀-➿\U0001F300-\U0001FAFF]`).
4. No `position:` in liquid classes; no new solid sheet backgrounds; aqua mapping present for hard-coded dark utilities.
5. Look at it on the 1001 dev server in slab and rock, dark and aqua, desktop and iPhone; behaviour unchanged.
