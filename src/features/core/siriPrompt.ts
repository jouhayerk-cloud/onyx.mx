export const LIVE_PROJECT_SIRI_ENDPOINT = 'https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/siri-inventory';

export const SHORTCUT_NAMES_EN = 'Onyx Inventory search, Onyx Inventory count, Onyx Item details';
export const SHORTCUT_NAMES_ES = 'Onyx Buscar inventario, Onyx Conteo de inventario, Onyx Detalle del artículo';

export const INTENT_LIST_EN = [
    '- Onyx Inventory search: intent "search" (query: text prompt, e.g. "fluorite")',
    '- Onyx Inventory count: intent "count" (query: "all" for totals)',
    '- Onyx Item details: intent "item" (query: item ID, e.g. "EM-0042", or barcode)',
].join('\n');

export const INTENT_LIST_ES = [
    '- Onyx Buscar inventario: intent "search" (query: término de búsqueda, p. ej. "fluorita")',
    '- Onyx Conteo de inventario: intent "count" (query: "todos" para totales)',
    '- Onyx Detalle del artículo: intent "item" (query: código de artículo, p. ej. "EM-0042", o código de barras)',
].join('\n');

const PROMPT_TEMPLATE_EN = `You are helping me build iOS Shortcuts for the Onyx.mx inventory app on my iPhone.
Use only the actions named below. If an action does not exist in my Shortcuts app, stop and tell me its exact name. Do not substitute actions, add other URLs, or change my other shortcuts.

Language: {{LANG}}
Create these shortcuts with these exact names: {{SHORTCUT_NAMES}}
Endpoint (POST only): {{ENDPOINT}}
Intents, one per shortcut:
{{INTENT_LIST}}

Build each shortcut with this chain, in this order:
1. Text. Value: Bearer <PASTE YOUR SIRI TOKEN HERE>
   I will replace the placeholder by hand on my phone. Do not ask me for the token in this chat.
2. Set Variable. Name: Siri auth. Value: the Text from step 1.
3. Ask for Input (search and item). Input Type: Text. For count, use a Text action instead with value "all".
4. Set Variable. Name: Query. Value: Provided Input (or the Text from step 3 for count).
5. Get Contents of URL.
   URL: {{ENDPOINT}}
   Show More > Method: POST
   Headers: Authorization = Siri auth. Content-Type = application/json.
   Request Body: JSON, three keys, all Text:
     intent = the intent for this shortcut
     query  = Query
     lang   = {{LANG}}
   Reference body: {"intent":"<intent>","query":"<Query>","lang":"{{LANG}}"}
6. Get Dictionary Value. Get: Value. Key: spoken_text. From: Contents of URL.
7. Speak Text: the result of step 6. Voice: English (US) when lang is en, Spanish (Mexico) when es.
8. Show Result: the result of step 6.
9. If the result of step 6 has no value: Get Dictionary Value, key "error", From: Contents of URL, then Speak Text with that result.
   Use the closest "has no value" or "is empty" condition and tell me which one you used.

Rules: put the token only in step 1. No empty header rows. No price, cost or money fields. Send no other keys.
When done, list each shortcut name and any step you could not build exactly. I will press Play to test.`;

const PROMPT_TEMPLATE_ES = `Eres un asistente que me ayuda a crear atajos de iOS (app Atajos) para la app de inventario Onyx.mx, en mi iPhone.
Usa solo las acciones indicadas. Si una acción no existe en mi app Atajos, detente y dime su nombre exacto. No sustituyas acciones, no agregues otras URLs y no cambies mis otros atajos.
Los nombres de acciones van en inglés, como aparecen en el editor. Si mi iPhone está en español, usa el nombre que aparezca en pantalla (UNVERIFIED para los nombres en español).

Idioma: {{LANG}}
Crea estos atajos con estos nombres exactos: {{SHORTCUT_NAMES}}
Endpoint (solo POST): {{ENDPOINT}}
Intents, uno por atajo:
{{INTENT_LIST}}

Arma cada atajo con esta cadena, en este orden:
1. Text. Valor: Bearer <PASTE YOUR SIRI TOKEN HERE>
   Yo reemplazo el marcador a mano en mi iPhone. No me pidas el token en este chat.
2. Set Variable. Nombre: Siri auth. Valor: el Text del paso 1.
3. Ask for Input (search y item). Input Type: Text. Para count, usa una acción Text con valor "todos".
4. Set Variable. Nombre: Query. Valor: Provided Input (o el Text del paso 3 en count).
5. Get Contents of URL.
   URL: {{ENDPOINT}}
   Show More > Method: POST
   Headers: Authorization = Siri auth. Content-Type = application/json.
   Request Body: JSON, tres claves, todas Text:
     intent = el intent de este atajo
     query  = Query
     lang   = {{LANG}}
   Cuerpo de referencia: {"intent":"<intent>","query":"<Query>","lang":"{{LANG}}"}
6. Get Dictionary Value. Get: Value. Key: spoken_text. From: Contents of URL.
7. Speak Text: el resultado del paso 6. Voz: English (US) si lang es en, Spanish (Mexico) si es es.
8. Show Result: el resultado del paso 6.
9. Si el resultado del paso 6 no tiene valor: Get Dictionary Value, key "error", From: Contents of URL, y luego Speak Text con ese resultado.
   Usa la condición más cercana a "no tiene valor" o "está vacío" y dime cuál usaste.

Reglas: pon el token solo en el paso 1. No dejes filas de encabezado vacías. No incluyas precios, costos ni campos de dinero. No envíes otras claves.
Al terminar, dime el nombre de cada atajo y cualquier paso que no pudiste armar exactamente. Yo presiono Play para probar.`;

export interface BuildSiriSetupPromptParams {
    endpoint?: string;
    lang?: 'en' | 'es';
}

/**
 * Resolves the Supabase Edge Function endpoint for Siri inventory actions.
 *
 * Adds https:// if the scheme is missing (as VITE_SUPABASE_URL may not include
 * it), trims any trailing slashes, and appends /functions/v1/siri-inventory.
 * When the input URL is undefined or empty, returns the live project endpoint.
 */
export function resolveSiriEndpoint(supabaseUrl: string | undefined): string {
    const trimmed = supabaseUrl?.trim();
    if (!trimmed) {
        return LIVE_PROJECT_SIRI_ENDPOINT;
    }

    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const cleanUrl = withScheme.replace(/\/+$/, '');

    if (cleanUrl.endsWith('/functions/v1/siri-inventory')) {
        return cleanUrl;
    }

    return `${cleanUrl}/functions/v1/siri-inventory`;
}

/**
 * Builds the setup prompt for Apple's iOS Shortcuts "Describe a Shortcut" builder.
 *
 * HARD SECURITY RULE:
 * The real Siri token is NEVER part of this prompt, is never read from state in this
 * function, and is never logged.
 *
 * WHY:
 * Anything pasted into an AI assistant (such as Apple Shortcuts' "Describe a Shortcut"
 * or Siri) can be processed off-device by Apple (via Private Cloud Compute) or third-party
 * LLM providers (e.g. OpenAI). Additionally, prompts persist in clipboards, chat transcripts,
 * and synchronized artifacts. The prompt strictly instructs the assistant to set the
 * Authorization header with the literal placeholder `<PASTE YOUR SIRI TOKEN HERE>`,
 * requiring the user to type or paste the token by hand on their own device.
 */
export function buildSiriSetupPrompt({ endpoint, lang = 'en' }: BuildSiriSetupPromptParams = {}): string {
    const isEs = lang === 'es';
    const targetLang = isEs ? 'es' : 'en';
    const targetEndpoint = endpoint ? resolveSiriEndpoint(endpoint) : resolveSiriEndpoint(undefined);
    const template = isEs ? PROMPT_TEMPLATE_ES : PROMPT_TEMPLATE_EN;
    const shortcutNames = isEs ? SHORTCUT_NAMES_ES : SHORTCUT_NAMES_EN;
    const intentList = isEs ? INTENT_LIST_ES : INTENT_LIST_EN;

    return template
        .replace(/\{\{LANG\}\}/g, targetLang)
        .replace(/\{\{SHORTCUT_NAMES\}\}/g, shortcutNames)
        .replace(/\{\{ENDPOINT\}\}/g, targetEndpoint)
        .replace(/\{\{INTENT_LIST\}\}/g, intentList);
}
