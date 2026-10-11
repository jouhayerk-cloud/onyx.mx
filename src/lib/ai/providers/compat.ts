import { createOpenAiProvider } from './openai';
import type { AiProviderImpl, ProviderInfo } from './types';

export const COMPAT_INFO: ProviderInfo = {
    id: 'compat',
    label: 'OpenAI-compatible (custom URL)',
    keyHint: 'key, or empty for a local server',
    needsBaseUrl: true,
    capabilities: { vision: true, json: true, image: false, video: false },
    docsUrl: '',
};

export const compatProvider: AiProviderImpl = createOpenAiProvider(COMPAT_INFO);

export default compatProvider;
