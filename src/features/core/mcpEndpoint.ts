export const LIVE_PROJECT_MCP_ENDPOINT = 'https://yircifkayqpuydfdqzlm.supabase.co/functions/v1/onyx-mcp';

/**
 * Resolves the Supabase Edge Function endpoint for Onyx MCP actions.
 *
 * Adds https:// if the scheme is missing (as VITE_SUPABASE_URL may not include
 * it), trims any trailing slashes, and appends /functions/v1/onyx-mcp.
 * When the input URL is undefined or empty, returns the live project endpoint.
 */
export function resolveMcpEndpoint(supabaseUrl: string | undefined): string {
    const trimmed = supabaseUrl?.trim();
    if (!trimmed) {
        return LIVE_PROJECT_MCP_ENDPOINT;
    }

    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const cleanUrl = withScheme.replace(/\/+$/, '');

    if (cleanUrl.endsWith('/functions/v1/onyx-mcp')) {
        return cleanUrl;
    }

    return `${cleanUrl}/functions/v1/onyx-mcp`;
}
