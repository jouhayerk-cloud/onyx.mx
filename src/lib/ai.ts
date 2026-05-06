import { GoogleGenAI } from '@google/genai';

/**
 * Frontend-safe AI initialization.
 * Prioritizes user-provided keys from localStorage to prevent bundling secrets.
 */
const getApiKey = () => {
    // 1. Check for user-provided key in storage (set via settings)
    const stored = typeof window !== 'undefined' ? localStorage.getItem('onyxApiKey') : null;
    if (stored) return stored.replace(/['"]/g, '').trim();

    // 2. Fallback to bundled system key (prefixed with VITE_)
    // WARNING: This key is visible in the client bundle.
    const system = (import.meta as any).env.VITE_GEMINI_API_KEY || '';
    return system.replace(/['"]/g, '').trim();
};

const apiKey = getApiKey();

if (!apiKey && typeof window !== 'undefined') {
    console.warn("⚠️ Neural Core: Missing API credentials. AI features disabled.");
}

// Export a singleton instance. 
export const ai = new GoogleGenAI({ apiKey: apiKey as string });
