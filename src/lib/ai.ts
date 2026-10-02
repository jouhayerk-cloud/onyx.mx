/**
 * Compatibility shim for the @google/genai SDK instance.
 *
 * The key used to be resolved here, by a lookup of its own that disagreed
 * with geminiClient's. It now comes from lib/ai/keys.ts like every other AI
 * call, and the instance is the one lib/ai/client.ts keeps. New code should
 * use generateJson / generateText from lib/ai/client instead of the SDK;
 * these exports stay until the remaining callers have moved.
 */
import type { GoogleGenAI } from '@google/genai';
import { getGenAiSdk } from './ai/client';
import { getGeminiKey } from './ai/keys';

export const getAiClient = (): GoogleGenAI => {
    if (!getGeminiKey() && typeof window !== 'undefined') {
        console.warn('Gemini: no API key set. AI features are disabled until one is saved.');
    }
    return getGenAiSdk();
};

// For backwards compatibility where `ai` is imported directly
export const ai = new Proxy({} as GoogleGenAI, {
    get: (_target, prop) => (getAiClient() as any)[prop],
});
