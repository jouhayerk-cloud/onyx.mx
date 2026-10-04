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

export async function callOnyxMcp<T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
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

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new OnyxMcpError(
      body?.error?.code ?? body?.code ?? 'http_error',
      body?.error?.message ?? (typeof body?.error === 'string' ? body.error : body?.message) ?? response.statusText,
      response.status,
    );
  }
  return body as T;
}
