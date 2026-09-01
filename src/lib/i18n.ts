/**
 * UI translation runtime.
 *
 * Scope: application chrome only — buttons, titles, headers, placeholders,
 * toasts and dialog copy. Three things are deliberately NOT translated:
 *
 *   1. Item data from Supabase (description, material, colour, shape, type,
 *      vendor names). These reach the DOM as JSX expressions, never as string
 *      literals, so nothing here can touch them.
 *   2. Exported documents and printed artifacts — packing lists, manifests,
 *      PDF/XLSX exports, labels and posters. Cross-border paperwork stays
 *      English. The wizard UI that *configures* an export is chrome and is
 *      translated; the document it emits is not.
 *   3. Enum values compared with `===` or written back to the DB
 *      ('In Transit', 'Requested', …). Those are wire values. Only their
 *      rendered label is translated — see `statusLabel` in ./i18nEnums.
 *
 * Lookup is keyed by the English source string, so a string with no Spanish
 * entry falls back to readable English instead of `undefined`. Adding UI in
 * English is therefore never a crash, only an untranslated line.
 *
 * `t` is a module-level function rather than a hook on purpose: call sites are
 * spread across ~120 files, and requiring a `const t = useTranslation()` in the
 * right component scope in each of them is the single most error-prone part of
 * rolling this out. The trade-off is that `t` does not itself subscribe to
 * language changes — App.tsx remounts the tree on switch (see `key={lang}`),
 * which is cheap because switching language is rare.
 */

import { esCatalog } from './i18n.es';

export type AppLang = 'en' | 'es';

/** Storage key written by `languageAtom` (atomWithStorage) in ./atoms. */
const STORAGE_KEY = 'appLanguage';

/**
 * Seeded from localStorage at module load so the first paint is already in the
 * right language; App.tsx keeps it in sync from `languageAtom` after that.
 */
let currentLang: AppLang = readStoredLang();

function readStoredLang(): AppLang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'en';
    // atomWithStorage persists JSON, so the value on disk is `"es"`, not `es`.
    const parsed = JSON.parse(raw);
    return parsed === 'es' ? 'es' : 'en';
  } catch {
    // Private mode, disabled storage, or a hand-edited value — English is safe.
    return 'en';
  }
}

export function setI18nLang(lang: AppLang): void {
  currentLang = lang;
}

export function getI18nLang(): AppLang {
  return currentLang;
}

/**
 * Translate a UI string. The English source text is the key.
 *
 *   tr('Save Draft')           // 'Guardar Borrador'
 *   tr('Some new button')      // 'Some new button' — no entry yet, falls back
 *
 * Named `tr`, not `t`, and that is not cosmetic: 39 files in src/ already bind
 * `t`. Ten hold `const t = useTranslation()`, where `t` is an OBJECT read as
 * `t.welcome`; others (axonometric.ts, geometry.ts) use `t` as a math
 * parameter. An `import { t }` is shadowed in every one of them, and `t("…")`
 * would call a non-function at runtime. `tr` is unbound across the whole tree.
 */
export function tr(en: string): string {
  if (currentLang === 'en') return en;
  return esCatalog[en] ?? en;
}

/**
 * Interpolating form, for strings that carry a value:
 *
 *   trf('Delete {n} items', { n: 3 })
 *
 * Placeholders survive translation because the Spanish entry keeps the same
 * `{name}` tokens. Used for text that was split around a JSX expression, where
 * translating the halves separately would break Spanish word order.
 */
export function trf(en: string, vars: Record<string, string | number>): string {
  return tr(en).replace(/\{(\w+)\}/g, (whole, key) =>
    key in vars ? String(vars[key]) : whole,
  );
}
