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
 *      rendered label is translated — see `el` in ./i18nEnums.
 *
 * Lookup is keyed by the English source string, so a string with no Spanish
 * entry falls back to readable English instead of `undefined`. Adding UI in
 * English is therefore never a crash, only an untranslated line.
 *
 * `tr` is a module-level function rather than a hook on purpose: call sites are
 * spread across ~120 files, and requiring a `const t = useTranslation()` in the
 * right component scope in each of them is the single most error-prone part of
 * rolling this out. The trade-off is that `tr` does not itself subscribe to
 * language changes — App.tsx remounts the tree on switch (see `key={language}`),
 * which is cheap because switching language is rare.
 */

import { esCatalog } from './i18n.es';
import { ENUM_LABELS } from './i18nEnums';
import { getI18nLang } from './i18nLang';

export type { AppLang } from './i18nLang';
export { setI18nLang, getI18nLang } from './i18nLang';

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
 *
 * The enum labels are consulted as a fallback because the two dictionaries
 * cannot be told apart at a render site: a codemod that wrapped a status word
 * as ordinary JSX text produces `tr('Delivered')`, while a hand-written badge
 * produces `el(crate.status)`. Both must resolve, or the string silently stays
 * English with nothing to catch it — not tsc, not the build.
 */
export function tr(en: string): string {
  if (getI18nLang() === 'en') return en;
  return esCatalog[en] ?? ENUM_LABELS[en] ?? en;
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
