/**
 * onyxMcpClient.ts
 *
 * Typed client for the onyx-mcp Supabase Edge Function. Authenticates with the
 * signed-in user's access token (never the anon key) and has no fallback transport.
 */
import { supabase } from './supabase';

export class OnyxMcpError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'OnyxMcpError';
    this.code = code;
    this.status = status;
  }
}

export async function callOnyxMcp<T = unknown>(
  tool: string,
  args: Record<string, unknown> = {},
  parse?: (body: unknown) => T
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new OnyxMcpError('unauthenticated', 'Sign in required to call Onyx MCP tools.', 401);
  }

  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/onyx-mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tool, args }),
    });
  } catch (err) {
    throw new OnyxMcpError('network_error', err instanceof Error ? err.message : 'Network error', 0);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errBody = body as any;
    throw new OnyxMcpError(
      errBody?.error?.code ?? errBody?.code ?? 'http_error',
      errBody?.error?.message ?? (typeof errBody?.error === 'string' ? errBody.error : errBody?.message) ?? response.statusText,
      response.status,
    );
  }

  if (parse) {
    return parse(body);
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new OnyxMcpError('bad_response', 'Expected a plain object response', response.status);
  }

  return body as T;
}
