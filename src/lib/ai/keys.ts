/**
 * The one Gemini key resolver.
 *
 * There used to be five, and they did not agree: geminiClient read
 * ONYX_GEMINI_KEY or the bundled key, lib/ai.ts also read the legacy
 * onyxApiKey, UploadAIPanel read only the bundled key, and videoAI fished the
 * private apiKey field out of the SDK instance. A key typed into one screen
 * therefore worked in some AI features and not others, and the Catalog Hub
 * gated its run on a different resolver than the bgreplace call it then made.
 *
 * Order: the key the user saved (ONYX_GEMINI_KEY), then the legacy onyxApiKey
 * the Onyx chat writes, then the build-time VITE_GEMINI_API_KEY.
 *
 * The build-time key is meant as a developer fallback -- anything with VITE_ in
 * front of it is readable in the shipped bundle. It is still honoured in
 * production builds because the deploy workflow injects it and every live AI
 * feature depends on it today; it goes away with the server proxy, which is
 * the only change this file should need when that lands.
 */

const STORAGE_KEY = 'ONYX_GEMINI_KEY';
const LEGACY_STORAGE_KEY = 'onyxApiKey';

/** Quotes and the literal strings "null"/"undefined" are what a bad paste or a
 *  JSON.stringify'd empty value leaves behind; none of them is a key. */
const clean = (raw: unknown): string => {
    const s = String(raw ?? '').trim().replace(/['"]/g, '');
    return s === 'null' || s === 'undefined' ? '' : s;
};

const readStorage = (key: string): string => {
    try {
        return typeof window !== 'undefined' ? clean(window.localStorage.getItem(key)) : '';
    } catch {
        // Private mode or blocked storage: behave as if nothing was saved.
        return '';
    }
};

export function getGeminiKey(): string {
    return readStorage(STORAGE_KEY)
        || readStorage(LEGACY_STORAGE_KEY)
        || clean((import.meta as any).env?.VITE_GEMINI_API_KEY);
}

/** Saves (or, with an empty value, forgets) the user's key. */
export function setGeminiKey(key: string | null | undefined): void {
    try {
        const value = clean(key);
        if (value) window.localStorage.setItem(STORAGE_KEY, value);
        else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to fall back to; getGeminiKey will report no key.
    }
}

export function hasGeminiKey(): boolean {
    return getGeminiKey().length > 0;
}
