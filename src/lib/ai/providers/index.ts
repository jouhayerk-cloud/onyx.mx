import { anthropicProvider, ANTHROPIC_INFO } from './anthropic';
import { openaiProvider, OPENAI_INFO } from './openai';
import { compatProvider, COMPAT_INFO } from './compat';
import { companionProvider, COMPANION_INFO } from './companion';
import { colibriProvider, COLIBRI_INFO, isColibriAvailable } from './colibri';
import type { AiProviderImpl, ProviderId, ProviderInfo } from './types';

export const GEMINI_INFO: ProviderInfo = {
    id: 'gemini',
    label: 'Google Gemini',
    keyHint: 'AIzaSy...',
    needsBaseUrl: false,
    capabilities: { vision: true, json: true, image: true, video: true },
    docsUrl: 'https://ai.google.dev',
};

export const PROVIDER_INFOS: readonly ProviderInfo[] = [
    GEMINI_INFO,
    ANTHROPIC_INFO,
    OPENAI_INFO,
    COMPAT_INFO,
    COMPANION_INFO,
    COLIBRI_INFO,
];

export const PROVIDERS: Record<'anthropic' | 'openai' | 'compat' | 'companion' | 'colibri', AiProviderImpl> = {
    anthropic: anthropicProvider,
    openai: openaiProvider,
    compat: compatProvider,
    companion: companionProvider,
    colibri: colibriProvider,
};

export function getProvider(id: ProviderId): AiProviderImpl | undefined {
    if (id === 'gemini') return undefined;
    return PROVIDERS[id];
}

export * from './types';
export { anthropicProvider } from './anthropic';
export { openaiProvider, createOpenAiProvider } from './openai';
export { compatProvider } from './compat';
export { companionProvider, COMPANION_INFO, isCompanionAvailable } from './companion';
export { colibriProvider, COLIBRI_INFO, isColibriAvailable } from './colibri';
