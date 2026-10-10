import { buildError, isContractErrorCode, validateEnvelope } from './envelope';
import type { ContractErrorCode, McpEnvelope, JsonRpcMessage } from './envelope';
import type { McpMessageHandler, McpTransport } from './mcpBridge';

export interface EdgeTransportOptions {
  getAccessToken: () => Promise<string | null | undefined>;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
}

/** Creates an MCP transport that POSTs requests to the edge endpoint and delivers replies locally. */
export function createEdgeTransport(options: EdgeTransportOptions): McpTransport {
  const handlers = new Set<McpMessageHandler>();

  const deliver = (envelope: McpEnvelope) => {
    queueMicrotask(() => {
      for (const handler of Array.from(handlers)) {
        handler(envelope);
      }
    });
  };

  const send = async (envelope: McpEnvelope): Promise<void> => {
    const isOnline = options.isOnline ?? (() => typeof navigator !== 'undefined' ? navigator.onLine : true);
    if (!isOnline()) {
      return Promise.reject(new Error('upstream_unavailable'));
    }

    const payload = envelope.payload;
    // POSTs only requests
    if (!('method' in payload && 'id' in payload)) {
      return Promise.resolve();
    }
    
    const reqId = payload.id;

    const token = await options.getAccessToken();
    if (!token) {
      deliver(buildError(reqId, 'unauthorized', 'No session or token'));
      return Promise.resolve();
    }

    const endpoint = options.endpoint ?? `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/onyx-mcp/rpc`;
    const fetchFn = options.fetchImpl ?? globalThis.fetch;

    let response: Response;
    try {
      response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
    } catch {
      return Promise.reject(new Error('upstream_unavailable'));
    }

    if (!response.ok) {
      const status = response.status;
      let code: ContractErrorCode = 'internal';
      if (status === 401) code = 'unauthorized';
      else if (status === 403) code = 'forbidden';
      else if (status === 404) code = 'unknown_tool';
      else if (status === 413) code = 'frame_too_large';
      else if (status === 429) code = 'rate_limited';
      else if (status >= 500) code = 'upstream_unavailable';

      deliver(buildError(reqId, code, response.statusText || 'HTTP Error'));
      return Promise.resolve();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      deliver(buildError(reqId, 'internal', 'Invalid JSON response'));
      return Promise.resolve();
    }

    const isObj = typeof body === 'object' && body !== null;
    const bodyObj = isObj ? (body as Record<string, unknown>) : {};

    const safeResp: Record<string, unknown> = {
      jsonrpc: '2.0',
      id: bodyObj.id ?? reqId
    };
    
    if (isObj && 'error' in bodyObj && typeof bodyObj.error === 'object' && bodyObj.error !== null) {
      const errObj = bodyObj.error as Record<string, unknown>;
      const errCode = errObj.code;
      let mappedCode: ContractErrorCode = 'internal';
      if (errCode === -32601) mappedCode = 'unknown_tool';
      else if (errCode === -32600 || errCode === -32602 || errCode === -32700) mappedCode = 'invalid_request';
      else if (errCode === -32000) {
        const msg = String(errObj.message || '').toLowerCase();
        if (msg.includes('permission denied') || msg.includes('forbidden')) mappedCode = 'forbidden';
        else mappedCode = 'internal';
      }

      const dataObj = typeof errObj.data === 'object' && errObj.data !== null ? (errObj.data as Record<string, unknown>) : {};
      const dataCode = dataObj.code;
      const finalCode = isContractErrorCode(dataCode) ? dataCode : mappedCode;

      safeResp.error = {
        code: typeof errCode === 'number' ? errCode : -32000,
        message: String(errObj.message || 'Unknown error'),
        data: {
          ...dataObj,
          code: finalCode
        }
      };
    } else if (isObj && bodyObj.result !== undefined) {
      safeResp.result = bodyObj.result;
    }

    const mcpEnvelope = { type: 'mcp' as const, payload: safeResp as unknown as JsonRpcMessage };   // validateEnvelope below checks the real shape
    const validation = validateEnvelope(mcpEnvelope);
    if (validation.ok) {
      deliver(validation.value);
    }
    
    return Promise.resolve();
  };

  return {
    send,
    onMessage: (handler: McpMessageHandler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    }
  };
}
