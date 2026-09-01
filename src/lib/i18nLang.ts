/**
 * The current UI language, and nothing else.
 *
 * Split out of i18n.ts so that i18n.ts and i18nEnums.ts can both read the
 * language without importing each other. `tr()` falls back to the enum labels
 * (see i18n.ts), which would otherwise make i18n → i18nEnums → i18n a cycle.
 *
 * Nothing here imports anything, so it is safe to pull in from any module.
 */

export type AppLang = 'en' | 'es';

/** Storage key written by `languageAtom` (atomWithStorage) in ./atoms. */
const STORAGE_KEY = 'appLanguage';

function readStoredLang(): AppLang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'en';
    // atomWithStorage persists JSON, so the value on disk is `"es"`, not `es`.
    return JSON.parse(raw) === 'es' ? 'es' : 'en';
  } catch {
    // Private mode, disabled storage, or a hand-edited value — English is safe.
    return 'en';
  }
}

/**
 * Seeded at module load so the first paint is already in the right language;
 * App.tsx keeps it in sync from `languageAtom` after that.
 */
let currentLang: AppLang = readStoredLang();

export function setI18nLang(lang: AppLang): void {
  currentLang = lang;
}

export function getI18nLang(): AppLang {
  return currentLang;
}
