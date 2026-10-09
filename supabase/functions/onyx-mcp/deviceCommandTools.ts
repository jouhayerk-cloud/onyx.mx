// DRAFT - NOT DEPLOYED

export const CONTRACT_ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'token_revoked',
  'token_expired',
  'auth_timeout',
  'identity_mismatch',
  'forbidden',
  'field_denied',
  'unknown_tool',
  'unsupported',
  'not_found',
  'command_expired',
  'command_failed',
  'lease_expired',
  'frame_too_large',
  'rate_limited',
  'session_closed',
  'upstream_unavailable',
  'internal'
] as const;

export type ContractErrorCode = typeof CONTRACT_ERROR_CODES[number];

export const ERROR_RPC_CODE: Record<ContractErrorCode, number> = {
  invalid_request: -32600,
  unauthorized: -32000,
  token_revoked: -32000,
  token_expired: -32000,
  auth_timeout: -32000,
  identity_mismatch: -32000,
  forbidden: -32000,
  field_denied: -32000,
  unknown_tool: -32601,
  unsupported: -32000,
  not_found: -32000,
  command_expired: -32000,
  command_failed: -32000,
  lease_expired: -32000,
  frame_too_large: -32000,
  rate_limited: -32000,
  session_closed: -32000,
  upstream_unavailable: -32000,
  internal: -32603
};

export const COMMAND_ALL_DEVICES_ROLES = ['Admin', 'Developer'];

export const DEVICE_COMMAND_TOOLS = [
  {
    name: 'set_expression',
    description: 'Sets the robot face expression for a given duration.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['device_id', 'expression'],
      properties: {
        device_id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._:-]+$' },
        expression: {
          type: 'string',
          enum: ['calm', 'happy', 'thinking', 'sleepy', 'shy', 'smug', 'pouty', 'alert', 'error', 'speaking', 'listening']
        },
        duration_ms: { type: 'integer', minimum: 0, maximum: 60000 }
      }
    },
    risk: 'robot',
    action: 'face'
  },
  {
    name: 'move_head',
    description: 'Moves the robot head to pan and tilt angles.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['device_id', 'pan', 'tilt'],
      properties: {
        device_id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._:-]+$' },
        pan: { type: 'number', minimum: -90, maximum: 90 },
        tilt: { type: 'number', minimum: 0, maximum: 90 }
      }
    },
    risk: 'robot',
    action: 'move'
  },
  {
    name: 'speak',
    description: 'Synthesises and speaks text using the device session.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['device_id', 'text'],
      properties: {
        device_id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._:-]+$' },
        text: { type: 'string', minLength: 1, maxLength: 256 },
        language: { type: 'string', enum: ['es', 'en'] }
      }
    },
    risk: 'robot',
    action: 'speak'
  },
  {
    name: 'display_vendor_card',
    description: 'Displays a vendor card on the device screen.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['device_id', 'vendor', 'title', 'details'],
      properties: {
        device_id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._:-]+$' },
        vendor: { type: 'string', maxLength: 60 },
        title: { type: 'string', maxLength: 120 },
        details: { type: 'array', items: { type: 'string', maxLength: 256 }, maxItems: 4 },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        icon: { type: 'string', enum: ['box', 'tag', 'dollar', 'truck', 'package'] }
      }
    },
    risk: 'robot',
    action: 'vendor-display'
  },
  {
    name: 'display_inventory_card',
    description: 'Displays an inventory item card on the device screen.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['device_id', 'item_id', 'title'],
      properties: {
        device_id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._:-]+$' },
        item_id: { type: 'string', minLength: 1, maxLength: 256 },
        title: { type: 'string', maxLength: 120 },
        vendor: { type: 'string', maxLength: 60 },
        stock: { type: 'number' },
        status: { type: 'string', maxLength: 40 },
        price: { type: 'number' }
      }
    },
    risk: 'robot',
    action: 'item-card'
  },
  {
    name: 'get_robot_status',
    description: 'Reads the status and recent commands of a robot.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['device_id'],
      properties: {
        device_id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._:-]+$' }
      }
    },
    risk: 'read',
    action: null
  },
  {
    name: 'ping_robot',
    description: 'Pings a robot to check its reachability.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['device_id'],
      properties: {
        device_id: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._:-]+$' }
      }
    },
    risk: 'read',
    action: null
  }
];

export function isDeviceCommandTool(name: string): boolean {
  return DEVICE_COMMAND_TOOLS.some((t) => t.name === name);
}

const COST_PAYMENT_MXN_RE = /(acquisition|landed|_aq_code|_land_code|cost|payment|disburse|commission|bank|paid|mxn|exchange_rate)/i;
const CREDENTIAL_RE = /(?:ocd_|ocs_|eyJ[A-Za-z0-9_-]{10,})/;

function hasDeniedKeys(obj: Record<string, unknown>): boolean {
  for (const key of Object.keys(obj)) {
    if (COST_PAYMENT_MXN_RE.test(key)) return true;
  }
  return false;
}

export function validateDeviceArgs(name: string, rawArgs: unknown): { ok: true, args: Record<string, unknown> } | { ok: false, code: ContractErrorCode, message: string } {
  if (typeof rawArgs !== 'object' || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, code: 'invalid_request', message: 'Arguments must be an object' };
  }
  const args = rawArgs as Record<string, unknown>;

  if (hasDeniedKeys(args)) {
    return { ok: false, code: 'field_denied', message: 'Argument keys contain cost or payment fields' };
  }

  const device_id = args.device_id;
  if (typeof device_id !== 'string' || device_id.length < 1 || device_id.length > 64 || !/^[A-Za-z0-9._:-]+$/.test(device_id)) {
    return { ok: false, code: 'invalid_request', message: 'Invalid device_id' };
  }

  const tool = DEVICE_COMMAND_TOOLS.find(t => t.name === name);
  if (!tool) {
    return { ok: false, code: 'unknown_tool', message: 'Unknown tool' };
  }

  const allowedKeys = Object.keys(tool.inputSchema.properties);
  for (const key of Object.keys(args)) {
    if (!allowedKeys.includes(key)) {
      return { ok: false, code: 'invalid_request', message: `Unexpected argument: ${key}` };
    }
  }

  const required = tool.inputSchema.required || [];
  for (const req of required) {
    if (args[req] === undefined) {
      return { ok: false, code: 'invalid_request', message: `Missing required argument: ${req}` };
    }
  }

  if (name === 'set_expression') {
    if (!['calm', 'happy', 'thinking', 'sleepy', 'shy', 'smug', 'pouty', 'alert', 'error', 'speaking', 'listening'].includes(args.expression as string)) {
      return { ok: false, code: 'invalid_request', message: 'Invalid expression' };
    }
    if (args.duration_ms !== undefined) {
      if (typeof args.duration_ms !== 'number' || !Number.isInteger(args.duration_ms) || args.duration_ms < 0 || args.duration_ms > 60000) {
        return { ok: false, code: 'invalid_request', message: 'Invalid duration_ms' };
      }
    }
  } else if (name === 'move_head') {
    if (typeof args.pan !== 'number' || args.pan < -90 || args.pan > 90) return { ok: false, code: 'invalid_request', message: 'Invalid pan' };
    if (typeof args.tilt !== 'number' || args.tilt < 0 || args.tilt > 90) return { ok: false, code: 'invalid_request', message: 'Invalid tilt' };
  } else if (name === 'speak') {
    const text = args.text;
    if (typeof text !== 'string' || text.length < 1 || text.length > 256) return { ok: false, code: 'invalid_request', message: 'Invalid text length' };
    if (CREDENTIAL_RE.test(text)) return { ok: false, code: 'invalid_request', message: 'Text looks like a credential' };
    if (args.language !== undefined) {
      if (typeof args.language !== 'string') return { ok: false, code: 'invalid_request', message: 'Invalid language type' };
      if (args.language === 'ja') return { ok: false, code: 'invalid_request', message: 'Language ja is refused' };
      if (args.language !== 'es' && args.language !== 'en') return { ok: false, code: 'invalid_request', message: 'Invalid language' };
    }
  } else if (name === 'display_vendor_card') {
    if (typeof args.vendor !== 'string' || args.vendor.length > 60) return { ok: false, code: 'invalid_request', message: 'Invalid vendor length' };
    if (typeof args.title !== 'string' || args.title.length > 120) return { ok: false, code: 'invalid_request', message: 'Invalid title length' };
    
    const details = args.details;
    if (!Array.isArray(details) || details.length > 4) return { ok: false, code: 'invalid_request', message: 'Invalid details array' };
    for (const d of details) {
      if (typeof d !== 'string' || d.length > 256) return { ok: false, code: 'invalid_request', message: 'Invalid detail item' };
    }
    
    if (args.color !== undefined) {
      if (typeof args.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(args.color)) return { ok: false, code: 'invalid_request', message: 'Invalid color' };
    }
    if (args.icon !== undefined) {
      if (!['box', 'tag', 'dollar', 'truck', 'package'].includes(args.icon as string)) return { ok: false, code: 'invalid_request', message: 'Invalid icon' };
    }
  } else if (name === 'display_inventory_card') {
    if (typeof args.item_id !== 'string' || args.item_id.length < 1 || args.item_id.length > 256) return { ok: false, code: 'invalid_request', message: 'Invalid item_id' };
    if (typeof args.title !== 'string' || args.title.length > 120) return { ok: false, code: 'invalid_request', message: 'Invalid title' };
    if (args.vendor !== undefined && (typeof args.vendor !== 'string' || args.vendor.length > 60)) return { ok: false, code: 'invalid_request', message: 'Invalid vendor' };
    if (args.stock !== undefined && typeof args.stock !== 'number') return { ok: false, code: 'invalid_request', message: 'Invalid stock' };
    if (args.status !== undefined && (typeof args.status !== 'string' || args.status.length > 40)) return { ok: false, code: 'invalid_request', message: 'Invalid status' };
    if (args.price !== undefined && typeof args.price !== 'number') return { ok: false, code: 'invalid_request', message: 'Invalid price' };
  }

  return { ok: true, args };
}

export function toCommandPayload(name: string, args: Record<string, unknown>, deviceRole: string | null): Record<string, unknown> {
  const payload = { ...args };
  delete payload.device_id;
  
  if (name === 'display_inventory_card') {
    if (deviceRole !== 'staff-device') {
      delete payload.price;
    }
  }
  
  return payload;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function rpcError(id: string | number | null, code: ContractErrorCode, message: string, details?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: {
        code: ERROR_RPC_CODE[code],
        message,
        data: {
          code,
          ...details,
        },
      },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

const SENSITIVE_KEY = /(token|secret|password|authorization|bearer|api[_-]?key|payment|disburse|commission|bank|acquisition|landed|_aq_code|_land_code|price_mxn|cost)/i;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactArgs(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 8).map((v) => redactArgs(v, depth + 1));
  if (isJsonObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redactArgs(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 80) return `${value.slice(0, 80)}...`;
  return value;
}

export function summarizeArgs(args: Record<string, unknown>): string {
  let text: string;
  try {
    text = JSON.stringify(redactArgs(args));
  } catch {
    text = '{}';
  }
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}
