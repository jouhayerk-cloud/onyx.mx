// DRAFT - NOT DEPLOYED
/**
 * Fake Onyx MCP server peer for bridge client self-test and contract verification (RS-5).
 * Follows ROBOT_SERVER_SPEC.md sections 2 and 5:
 *  - Answers tools/list with the seven device_command_tools of the contract;
 *  - Answers tools/call with the exact success shape (command_id and status: 'queued');
 *  - Answers tools/call failure scenarios with the exact error codes, messages and data shapes;
 *  - Deterministic (no randomness, no timers longer than a microtask, loopback transport only, no network).
 *
 * Date: 2026-10-05.
 */
import {
  buildError,
  buildResponse,
  isJsonObject,
  isJsonRpcRequest,
  validateEnvelope,
  type JsonObject,
  type JsonRpcRequest,
  type McpEnvelope
} from './envelope';
import type { McpMessageHandler, McpTransport } from './mcpBridge';
import { FIXTURE_COMMAND_ID, FIXTURE_DEVICE_ID } from './mcpBridge.fixtures';

export const FAKE_PEER_COMMAND_ID = FIXTURE_COMMAND_ID;
export const FAKE_PEER_DEVICE_ID = FIXTURE_DEVICE_ID;

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/**
 * Supported scenario names corresponding to the spec failure modes and success outcome.
 */
export const FAKE_ONYX_SCENARIO_NAMES = [
  'success',
  'unauthenticated',
  'forbidden_role',
  'unknown_tool',
  'invalid_arguments',
  'rate_limited',
  'device_offline_or_unassigned',
  'kill_switch_active',
  'server_error',
  // Spec variants and aliases
  'device_offline',
  'device_unassigned',
  'device_revoked',
  'confirmation_required',
  'upstream_unavailable',
  'field_denied',
  'duplicate'
] as const;

export type FakeOnyxScenarioName = typeof FAKE_ONYX_SCENARIO_NAMES[number];

export interface FakeOnyxMcpScenario {
  name?: FakeOnyxScenarioName | string;
  scenario?: FakeOnyxScenarioName | string;
  type?: FakeOnyxScenarioName | string;
  commandId?: string;
  deviceId?: string;
  action?: string;
  errorMessage?: string;
  retryAfterMs?: number;
  details?: Record<string, unknown>;
  expiresAt?: string;
  sessionOpen?: boolean;
  customHandler?: (req: JsonRpcRequest) => McpEnvelope | undefined;
}

// ---------------------------------------------------------------------------
// Spec tool definitions (ROBOT_SERVER_SPEC.md section 2)
// ---------------------------------------------------------------------------

export interface SpecDeviceCommandTool {
  name: string;
  agentName: string;
  action: string | null;
  risk: 'robot' | 'read';
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JsonObject>;
    required: readonly string[];
    additionalProperties: false;
  };
}

const DEVICE_ID_PROP: JsonObject = {
  type: 'string',
  description: 'Target device identifier.',
  minLength: 1,
  maxLength: 64,
  pattern: '^[A-Za-z0-9._:-]+$'
};

export const SPEC_DEVICE_COMMAND_TOOLS: readonly SpecDeviceCommandTool[] = [
  {
    name: 'set_expression',
    agentName: 'robot_face',
    action: 'face',
    risk: 'robot',
    description: 'Change the robot face expression.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: DEVICE_ID_PROP,
        expression: {
          type: 'string',
          description: 'Face expression enum',
          enum: [
            'calm',
            'happy',
            'thinking',
            'sleepy',
            'shy',
            'smug',
            'pouty',
            'alert',
            'error',
            'speaking',
            'listening'
          ]
        },
        duration_ms: {
          type: 'integer',
          description: 'Duration in milliseconds (0..60000)',
          minimum: 0,
          maximum: 60000
        }
      },
      required: ['device_id', 'expression'],
      additionalProperties: false
    }
  },
  {
    name: 'move_head',
    agentName: 'robot_move',
    action: 'move',
    risk: 'robot',
    description: 'Move the robot head (pan and tilt).',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: DEVICE_ID_PROP,
        pan: {
          type: 'number',
          description: 'Pan angle in degrees (-90 to 90)',
          minimum: -90,
          maximum: 90
        },
        tilt: {
          type: 'number',
          description: 'Tilt angle in degrees (0 to 90)',
          minimum: 0,
          maximum: 90
        }
      },
      required: ['device_id', 'pan', 'tilt'],
      additionalProperties: false
    }
  },
  {
    name: 'speak',
    agentName: 'robot_say',
    action: 'speak',
    risk: 'robot',
    description: 'Speak text out loud using the robot.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: DEVICE_ID_PROP,
        text: {
          type: 'string',
          description: 'Text to speak, max 256 characters',
          minLength: 1,
          maxLength: 256
        },
        language: {
          type: 'string',
          description: 'Language code: es or en. Refuses ja.',
          enum: ['es', 'en']
        }
      },
      required: ['device_id', 'text'],
      additionalProperties: false
    }
  },
  {
    name: 'display_vendor_card',
    agentName: 'robot_show_vendor_card',
    action: 'vendor-display',
    risk: 'robot',
    description: 'Show a vendor card on the robot display.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: DEVICE_ID_PROP,
        vendor: {
          type: 'string',
          description: 'Vendor identifier',
          maxLength: 60
        },
        title: {
          type: 'string',
          description: 'Card title',
          maxLength: 120
        },
        details: {
          type: 'array',
          description: 'Up to 4 detail lines',
          items: {
            type: 'string',
            maxLength: 256
          },
          maxItems: 4
        },
        color: {
          type: 'string',
          description: 'Hex color (#RRGGBB)',
          pattern: '^#[0-9a-fA-F]{6}$'
        },
        icon: {
          type: 'string',
          description: 'Card icon enum',
          enum: ['box', 'tag', 'dollar', 'truck', 'package']
        }
      },
      required: ['device_id', 'vendor', 'title', 'details'],
      additionalProperties: false
    }
  },
  {
    name: 'display_inventory_card',
    agentName: 'robot_show_item_card',
    action: 'item-card',
    risk: 'robot',
    description: 'Show an item inventory card on the robot display.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: DEVICE_ID_PROP,
        item_id: {
          type: 'string',
          description: 'Item ID',
          maxLength: 64
        },
        title: {
          type: 'string',
          description: 'Item title',
          maxLength: 120
        },
        vendor: {
          type: 'string',
          description: 'Optional vendor identifier',
          maxLength: 60
        },
        stock: {
          type: 'number',
          description: 'Optional item stock'
        },
        status: {
          type: 'string',
          description: 'Optional status',
          maxLength: 40
        },
        price: {
          type: 'number',
          description: 'Optional retail price in USD (stripped for voice devices)'
        }
      },
      required: ['device_id', 'item_id', 'title'],
      additionalProperties: false
    }
  },
  {
    name: 'get_robot_status',
    agentName: 'robot_status',
    action: null,
    risk: 'read',
    description: 'Read the robot status (online, last check-in, battery).',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: DEVICE_ID_PROP
      },
      required: ['device_id'],
      additionalProperties: false
    }
  },
  {
    name: 'ping_robot',
    agentName: 'robot_ping',
    action: null,
    risk: 'read',
    description: 'Ping the robot to check reachability.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: DEVICE_ID_PROP
      },
      required: ['device_id'],
      additionalProperties: false
    }
  }
];

// Map contract or agent tool names to device action strings
const TOOL_ACTION_BY_NAME: Record<string, string> = {
  set_expression: 'face',
  robot_face: 'face',
  move_head: 'move',
  robot_move: 'move',
  speak: 'speak',
  robot_say: 'speak',
  display_vendor_card: 'vendor-display',
  robot_show_vendor_card: 'vendor-display',
  display_inventory_card: 'item-card',
  robot_show_item_card: 'item-card'
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normalizeScenarioName(raw: string | undefined): FakeOnyxScenarioName {
  if (!raw) return 'success';
  const s = raw.toLowerCase().replace(/[- ]/g, '_');
  switch (s) {
    case 'unauthorized':
    case 'unauthenticated':
      return 'unauthenticated';
    case 'forbidden':
    case 'forbidden_role':
    case 'forbiddenrole':
      return 'forbidden_role';
    case 'unknown_tool':
    case 'unknowntool':
      return 'unknown_tool';
    case 'invalid_request':
    case 'invalid_arguments':
    case 'invalidarguments':
      return 'invalid_arguments';
    case 'rate_limited':
    case 'ratelimited':
      return 'rate_limited';
    case 'device_offline_or_unassigned':
    case 'deviceofflineorunassigned':
      return 'device_offline_or_unassigned';
    case 'device_offline':
    case 'deviceoffline':
      return 'device_offline';
    case 'device_unassigned':
    case 'deviceunassigned':
      return 'device_unassigned';
    case 'device_revoked':
    case 'devicerevoked':
      return 'device_revoked';
    case 'kill_switch_active':
    case 'killswitchactive':
    case 'session_closed':
    case 'sessionclosed':
    case 'killed':
      return 'kill_switch_active';
    case 'server_error':
    case 'servererror':
    case 'internal':
    case 'internal_error':
      return 'server_error';
    case 'confirmation_required':
    case 'confirmationrequired':
      return 'confirmation_required';
    case 'upstream_unavailable':
    case 'upstreamunavailable':
      return 'upstream_unavailable';
    case 'field_denied':
    case 'fielddenied':
      return 'field_denied';
    case 'duplicate':
      return 'duplicate';
    case 'success':
    case 'ok':
    default:
      return 'success';
  }
}

function normalizeScenario(scenario?: FakeOnyxMcpScenario | FakeOnyxScenarioName): FakeOnyxMcpScenario {
  if (!scenario) return { name: 'success' };
  if (typeof scenario === 'string') return { name: scenario };
  const rawName = scenario.name ?? scenario.scenario ?? scenario.type ?? 'success';
  return { ...scenario, name: rawName };
}

// ---------------------------------------------------------------------------
// Peer interface and factory
// ---------------------------------------------------------------------------

export interface FakeOnyxMcpPeer {
  setScenario: (scenario: FakeOnyxMcpScenario | FakeOnyxScenarioName) => void;
  getScenario: () => FakeOnyxMcpScenario;
  getReceivedRequests: () => readonly JsonRpcRequest[];
  getSentResponses: () => readonly McpEnvelope[];
  close: () => void;
  dispose: () => void;
}

function handleToolsCall(req: JsonRpcRequest, scenario: FakeOnyxMcpScenario): McpEnvelope {
  if (scenario.customHandler) {
    const custom = scenario.customHandler(req);
    if (custom) return custom;
  }

  const params = isJsonObject(req.params) ? req.params : {};
  const toolName = typeof params.name === 'string' ? params.name : '';
  const args = isJsonObject(params.arguments) ? params.arguments : {};
  const norm = normalizeScenarioName(scenario.name ?? scenario.scenario ?? scenario.type);

  switch (norm) {
    case 'unauthenticated': {
      const msg = scenario.errorMessage ?? 'unauthorized: authentication required';
      return buildError(req.id, 'unauthorized', msg, {
        message: msg,
        ...(scenario.details ? { details: scenario.details } : {})
      });
    }

    case 'forbidden_role': {
      const msg = scenario.errorMessage ?? 'forbidden: caller role not permitted for device command';
      return buildError(req.id, 'forbidden', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'forbidden_role' }
      });
    }

    case 'unknown_tool': {
      const msg = scenario.errorMessage ?? 'unknown tool: tool not found';
      return buildError(req.id, 'unknown_tool', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'unknown_tool' }
      });
    }

    case 'invalid_arguments': {
      const msg = scenario.errorMessage ?? 'invalid_request: invalid or missing arguments';
      return buildError(req.id, 'invalid_request', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'invalid_arguments' }
      });
    }

    case 'rate_limited': {
      const msg = scenario.errorMessage ?? 'rate limited: command rate limit exceeded';
      return buildError(req.id, 'rate_limited', msg, {
        message: msg,
        retryable: true,
        details: scenario.details ?? { retry_after_ms: scenario.retryAfterMs ?? 1000 }
      });
    }

    case 'device_offline_or_unassigned': {
      const msg = scenario.errorMessage ?? 'not_found: device offline or unassigned';
      return buildError(req.id, 'not_found', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'device_offline_or_unassigned' }
      });
    }

    case 'device_offline': {
      const msg = scenario.errorMessage ?? 'not_found: device offline';
      return buildError(req.id, 'not_found', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'device_offline' }
      });
    }

    case 'device_unassigned': {
      const msg = scenario.errorMessage ?? 'forbidden: device not assigned to caller';
      return buildError(req.id, 'forbidden', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'device_not_assigned' }
      });
    }

    case 'device_revoked': {
      const msg = scenario.errorMessage ?? 'forbidden: device revoked';
      return buildError(req.id, 'forbidden', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'device_revoked' }
      });
    }

    case 'kill_switch_active': {
      const msg = scenario.errorMessage ?? 'session_closed: kill switch is active';
      return buildError(req.id, 'session_closed', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'kill_switch_active' }
      });
    }

    case 'server_error': {
      const msg = scenario.errorMessage ?? 'internal: server database error';
      return buildError(req.id, 'internal', msg, {
        message: msg,
        retryable: true,
        details: scenario.details ?? { reason: 'internal_error' }
      });
    }

    case 'confirmation_required': {
      const msg = scenario.errorMessage ?? 'forbidden: confirmation required';
      return buildError(req.id, 'forbidden', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'confirmation_required' }
      });
    }

    case 'upstream_unavailable': {
      const msg = scenario.errorMessage ?? 'upstream unavailable: database schema not ready';
      return buildError(req.id, 'upstream_unavailable', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'schema' }
      });
    }

    case 'field_denied': {
      const msg = scenario.errorMessage ?? 'field_denied: argument field not permitted';
      return buildError(req.id, 'field_denied', msg, {
        message: msg,
        details: scenario.details ?? { reason: 'field_denied' }
      });
    }

    case 'duplicate':
    case 'success':
    default: {
      const deviceId =
        scenario.deviceId ??
        (typeof args.device_id === 'string' && args.device_id ? args.device_id : FIXTURE_DEVICE_ID);
      const commandId =
        scenario.commandId ??
        (typeof req.id === 'string' && req.id ? req.id : FIXTURE_COMMAND_ID);
      const expiresAt = scenario.expiresAt ?? '2026-10-05T12:01:30.000Z';
      const sessionOpen = scenario.sessionOpen ?? false;
      const duplicate = norm === 'duplicate';

      if (toolName === 'get_robot_status' || toolName === 'robot_status') {
        return buildResponse(req.id, {
          content: [{ type: 'text', text: `status for ${deviceId}` }],
          structuredContent: {
            device_id: deviceId,
            device_name: 'StackChan Demo',
            role: 'staff-device',
            online: true,
            last_checkin_at: '2026-10-05T12:00:00.000Z',
            session_open_until: '2026-10-05T12:05:00.000Z',
            battery_level: 95,
            rssi: -55,
            firmware_version: '1.0.0',
            recent_commands: [
              {
                command_id: commandId,
                command: 'face',
                status: 'acked',
                created_at: '2026-10-05T11:59:00.000Z',
                acked_at: '2026-10-05T11:59:01.000Z',
                error_code: null
              }
            ]
          },
          isError: false
        });
      }

      if (toolName === 'ping_robot' || toolName === 'robot_ping') {
        return buildResponse(req.id, {
          content: [{ type: 'text', text: `ping ok for ${deviceId}` }],
          structuredContent: {
            device_id: deviceId,
            reachable: 'session',
            last_checkin_at: '2026-10-05T12:00:00.000Z',
            age_s: 5
          },
          isError: false
        });
      }

      const action =
        scenario.action ??
        TOOL_ACTION_BY_NAME[toolName] ??
        'face';

      return buildResponse(req.id, {
        content: [{ type: 'text', text: `queued ${action} for ${deviceId}` }],
        structuredContent: {
          command_id: commandId,
          device_id: deviceId,
          command: action,
          status: 'queued',
          expires_at: expiresAt,
          session_open: sessionOpen,
          duplicate
        },
        isError: false
      });
    }
  }
}

/**
 * Creates a fake Onyx MCP peer listening on transport.
 * Answers tools/call and tools/list deterministically according to ROBOT_SERVER_SPEC.md.
 */
export function createFakeOnyxMcpPeer(
  transport: McpTransport,
  scenario: FakeOnyxMcpScenario | FakeOnyxScenarioName = 'success'
): FakeOnyxMcpPeer {
  let currentScenario = normalizeScenario(scenario);
  const receivedRequests: JsonRpcRequest[] = [];
  const sentResponses: McpEnvelope[] = [];
  let closed = false;

  const reply = (resp: McpEnvelope): void => {
    sentResponses.push(resp);
    try {
      void Promise.resolve(transport.send(resp)).catch(() => undefined);
    } catch {
      /* link down */
    }
  };

  const onEnvelope: McpMessageHandler = (envelope: McpEnvelope) => {
    if (closed) return;
    const checked = validateEnvelope(envelope);
    if (!checked.ok) return;

    const payload = checked.value.payload;
    if (!isJsonRpcRequest(payload)) return;

    receivedRequests.push(payload);

    if (payload.method === 'ping') {
      reply(buildResponse(payload.id, {}));
      return;
    }

    if (payload.method === 'tools/list') {
      const tools = SPEC_DEVICE_COMMAND_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }));
      reply(buildResponse(payload.id, { tools }));
      return;
    }

    if (payload.method === 'tools/call') {
      reply(handleToolsCall(payload, currentScenario));
      return;
    }

    reply(buildError(payload.id, 'unknown_tool', 'unknown method'));
  };

  const unsubscribe = transport.onMessage(onEnvelope);

  const close = (): void => {
    closed = true;
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  };

  return {
    setScenario: (next: FakeOnyxMcpScenario | FakeOnyxScenarioName) => {
      currentScenario = normalizeScenario(next);
    },
    getScenario: () => ({ ...currentScenario }),
    getReceivedRequests: () => [...receivedRequests],
    getSentResponses: () => [...sentResponses],
    close,
    dispose: close
  };
}
