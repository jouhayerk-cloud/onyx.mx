# Onyx brand sources

Source artwork, kept out of `public/` on purpose: everything in `public/` is
deployed and precached by the service worker on every device.

| File | What it is | Shipped as |
|---|---|---|
| `flat.png` | Flat Aqua lettered cube (1199 px). The letters were traced from it into vector paths. | `src/components/onyxMarkArt.ts` → `OnyxLogo`, and `public/favicon.svg` |
| `favicon.af` | Affinity source of the favicon (cream plate, sage cube, gold floor) | `public/favicon.svg` is a vector rebuild of its 2026-09-30 export, plus `public/favicon.png` |
| `Logo Glass.svg` | Glass cube (embedded bitmap) | `public/apple-touch-icon.png` (iOS, light) |
| `Logo AQUA.svg` | Abalone cube (embedded bitmap) | `public/apple-touch-icon-dark.png`, `icon-192/512.png`, `icon-maskable-512.png`, `OnyxLogo.png` |
| `OnyxOS.svg` | OnyxOS glass composition (Affinity export; its cube faces are JPEGs, which draw a light square behind the cube) | not shipped |
| `OnyxOS-glass.svg` | OnyxOS with the cube rebuilt from the traced vector (no embedded images) | not shipped |
| `favicon2.png` | Earlier favicon render | not shipped |

After changing any shipped icon, bump `ICON_VERSION` in `vite.config.ts` so
browsers, iOS and installed apps fetch the new files.
