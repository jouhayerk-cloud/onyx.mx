import { getGeminiKey, setGeminiKey } from './keys';
import type { ProviderConfig, ProviderId } from './providers/types';
import { colibriSeenRecently } from './providers/colibri';
import { isCompanionAvailable } from './providers/companion';

/**
 * Keys, base URLs and models of every AI provider, kept in this browser's localStorage like the Gemini key always was
 * (the server proxy that moves them off the device is a later change, and this file is the only one it touches).
 * Gemini reads and writes through keys.ts so every screen that already takes a Gemini key keeps working.
 */
const PREFIX = 'ONYX_AI_';
export const AI_CONFIG_EVENT = 'onyx-ai-config';

const name = (id: ProviderId, field: 'KEY' | 'BASE' | 'MODEL') => PREFIX + id.toUpperCase() + '_' + field;
const clean = (raw: unknown): string => {
    const s = String(raw ?? '').trim().replace(/['"]/g, '');
    return s === 'null' || s === 'undefined' ? '' : s;
};
const read = (key: string): string => {
    try { return typeof window !== 'undefined' ? clean(window.localStorage.getItem(key)) : ''; } catch { return ''; }
};
const write = (key: string, value: string): void => {
    try {
        if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key);
    } catch { /* storage blocked: nothing to fall back to */ }
};
const changed = () => { try { window.dispatchEvent(new Event(AI_CONFIG_EVENT)); } catch { /* no window */ } };

/**
 * The Colibrì address the app used to default to (the mock server's port) and the settings panel still writes when
 * it saves an untouched field. The real server listens on 8000, so this exact value counts as "not set" and the
 * provider's default applies. Anyone who really runs a server on 8082 can use http://localhost:8082.
 */
const LEGACY_COLIBRI_BASE = 'http://127.0.0.1:8082';

export function getProviderConfig(id: ProviderId): ProviderConfig {
    if (id === 'gemini') return { key: getGeminiKey(), model: read(name(id, 'MODEL')) || undefined };
    const baseUrl = read(name(id, 'BASE')) || undefined;
    return {
        key: read(name(id, 'KEY')),
        baseUrl: id === 'colibri' && baseUrl === LEGACY_COLIBRI_BASE ? undefined : baseUrl,
        model: read(name(id, 'MODEL')) || undefined,
    };
}

/** Saves the given fields; an empty string forgets that field; null forgets the whole provider. */
export function setProviderConfig(id: ProviderId, patch: Partial<ProviderConfig> | null): void {
    if (patch === null) {
        if (id === 'gemini') setGeminiKey(''); else write(name(id, 'KEY'), '');
        write(name(id, 'BASE'), ''); write(name(id, 'MODEL'), '');
        changed();
        return;
    }
    if (patch.key !== undefined) { if (id === 'gemini') setGeminiKey(patch.key); else write(name(id, 'KEY'), clean(patch.key)); }
    if (patch.baseUrl !== undefined) write(name(id, 'BASE'), clean(patch.baseUrl).replace(/\/+$/, ''));
    if (patch.model !== undefined) write(name(id, 'MODEL'), clean(patch.model));
    changed();
}

/** compat can run without a key (a local Ollama or LM Studio), companion runs on-device in the iOS shell, and colibri counts as set once an address is saved or its local server answered a recent probe. */
export function hasProviderKey(id: ProviderId): boolean {
    if (id === 'companion') {
        return isCompanionAvailable();
    }
    if (id === 'colibri') {
        // Not "always on": it counts once the user saved an address or a probe reached the server lately.
        // The call itself still fails fast (two seconds) with a clear message when the server is down.
        const c = getProviderConfig('colibri');
        return Boolean(c.baseUrl && !c.baseUrl.startsWith('supabase://')) || colibriSeenRecently();
    }
    const c = getProviderConfig(id);
    return id === 'compat' ? !!c.baseUrl : c.key.length > 0;
}

export function listConfigured(): ProviderId[] {
    return (['gemini', 'anthropic', 'openai', 'compat', 'companion', 'colibri'] as const).filter(hasProviderKey);
}
