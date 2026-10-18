/**
 * Ask for the Gemini key from anywhere. One GeminiKeyDialog is mounted at the
 * app root and listens for this event; the promise settles when the person
 * saves a key (true) or cancels (false). With a key already set it is true
 * at once.
 */
import { hasGeminiKey, getGeminiKeySource } from './keys';
import { tr } from '../i18n';

/** Status line for key screens: where the key in use comes from. */
export function geminiKeyStatus(): string {
    const src = getGeminiKeySource();
    if (src === 'device' || src === 'legacy') return tr('Saved on this device');
    if (src === 'build') return tr('Using the build key');
    return tr('No key');
}

export const GEMINI_KEY_REQUEST_EVENT = 'onyx:gemini-key-request';

export interface GeminiKeyRequest {
    reason?: string;
    resolve: (saved: boolean) => void;
}

export function requestGeminiKey(reason?: string): Promise<boolean> {
    if (hasGeminiKey()) return Promise.resolve(true);
    if (typeof window === 'undefined') return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
        window.dispatchEvent(new CustomEvent<GeminiKeyRequest>(GEMINI_KEY_REQUEST_EVENT, { detail: { reason, resolve } }));
    });
}
