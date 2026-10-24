/**
 * Liquid Glass Transparency Controller
 *
 * Mathematical model:
 *   - Slider range: 50% (High Opacity) to 100% (Full Glass).
 *   - Stored in localStorage key: 'onyx_glass_transparency'.
 *   - CSS opacity factor:
 *       100% transparency -> factor = 1.000 (Base full-glass translucency)
 *       50% transparency  -> factor = 1.700 (Half transparency = ~1.7x slab density)
 *
 *   Formula: factor = 1.0 + ((100 - transparency) / 50) * 0.7
 *   Updates: --glass-opacity-factor and --glass-density-mult on document.documentElement
 */

export const GLASS_TRANSPARENCY_STORAGE_KEY = 'onyx_glass_transparency';
export const DEFAULT_GLASS_TRANSPARENCY = 100;
export const MIN_GLASS_TRANSPARENCY = 50;
export const MAX_GLASS_TRANSPARENCY = 100;

/**
 * Converts user transparency percentage [50..100] to CSS opacity multiplier [1.0..1.7].
 */
export function transparencyToFactor(transparency: number): number {
  const clamped = Math.max(MIN_GLASS_TRANSPARENCY, Math.min(MAX_GLASS_TRANSPARENCY, transparency));
  return 1.0 + ((MAX_GLASS_TRANSPARENCY - clamped) / (MAX_GLASS_TRANSPARENCY - MIN_GLASS_TRANSPARENCY)) * 0.7;
}

/**
 * Applies the transparency factor immediately to CSS root variables without reload.
 */
export function applyGlassTransparency(transparency: number): void {
  if (typeof document === 'undefined') return;
  const factor = transparencyToFactor(transparency);
  const formatted = factor.toFixed(3);
  document.documentElement.style.setProperty('--glass-opacity-factor', formatted);
  document.documentElement.style.setProperty('--glass-density-mult', formatted);
}

/**
 * Reads stored transparency percentage from localStorage.
 */
export function getStoredGlassTransparency(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_GLASS_TRANSPARENCY;
  try {
    const raw = localStorage.getItem(GLASS_TRANSPARENCY_STORAGE_KEY);
    if (!raw) return DEFAULT_GLASS_TRANSPARENCY;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) return DEFAULT_GLASS_TRANSPARENCY;
    return Math.max(MIN_GLASS_TRANSPARENCY, Math.min(MAX_GLASS_TRANSPARENCY, parsed));
  } catch {
    return DEFAULT_GLASS_TRANSPARENCY;
  }
}

/**
 * Persists the user preference to localStorage and updates CSS variables in real time.
 */
export function setStoredGlassTransparency(transparency: number): void {
  const clamped = Math.max(MIN_GLASS_TRANSPARENCY, Math.min(MAX_GLASS_TRANSPARENCY, transparency));
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GLASS_TRANSPARENCY_STORAGE_KEY, String(clamped));
    }
  } catch {
    // Storage quota or private mode fallback
  }
  applyGlassTransparency(clamped);
}

/**
 * Initializes CSS variables on app startup.
 */
export function initGlassTransparency(): number {
  const current = getStoredGlassTransparency();
  applyGlassTransparency(current);
  return current;
}
