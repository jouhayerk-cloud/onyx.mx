import { GoogleGenAI } from '@google/genai';

/**
 * Frontend-safe AI initialization.
 * Prioritizes user-provided keys from localStorage to prevent bundling secrets.
 */
const getApiKey = () => {
    // 1. Check for user-provided key in storage (set via settings)
    const stored = typeof window !== 'undefined' ? (localStorage.getItem('ONYX_GEMINI_KEY') || localStorage.getItem('onyxApiKey')) : null;
    if (stored) return stored.replace(/['"]/g, '').trim();

    // 2. Fallback to bundled system key (prefixed with VITE_)
    // WARNING: This key is visible in the client bundle.
    const system = (import.meta as any).env.VITE_GEMINI_API_KEY || '';
    return system.replace(/['"]/g, '').trim();
};

let _aiInstance: GoogleGenAI | null = null;
let _lastApiKey: string | null = null;

export const getAiClient = () => {
    const currentKey = getApiKey();
    if (!currentKey && typeof window !== 'undefined') {
        console.warn("💎 Neural Core: Missing API credentials. AI features disabled.");
    }
    
    // Re-initialize if the key has changed
    if (!_aiInstance || _lastApiKey !== currentKey) {
        _aiInstance = new GoogleGenAI({ apiKey: currentKey as string });
        _lastApiKey = currentKey;
    }
    return _aiInstance;
};

// For backwards compatibility where `ai` is imported directly
export const ai = new Proxy({} as GoogleGenAI, {
    get: (target, prop) => {
        const client = getAiClient();
        return (client as any)[prop];
    }
});
