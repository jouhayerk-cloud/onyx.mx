import { useMemo, useEffect, useCallback, useRef } from 'react';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { supabase } from '../../../lib/supabase';
import {
  ToolCatalog,
  createRobotCallTools,
  createMcpBridge,
  type McpBridge,
  type McpAppRole,
  type ConfirmRequest
} from './mcpBridge';
import { createEdgeTransport } from './edgeTransport';
import { createAuditSink, type AuditSink } from './auditSink';
import { insertAuditRows } from './auditInsert';
import type { AgentToolPack } from '../useOnyxAgent';
import type { AppRole } from '../tools/appTools';

const env = import.meta.env as Record<string, string | undefined>;

/** Flag controlling whether the MCP bridge is active. OFF by default. */
export const MCP_BRIDGE_ENABLED: boolean = env.VITE_ONYX_MCP_BRIDGE === 'true';

/** Persistent kill-switch atom stored under 'onyx.mcp.kill'. Default false. */
export const mcpKillSwitchAtom = atomWithStorage<boolean>('onyx.mcp.kill', false);

export interface UseMcpBridgeInput {
  role: McpAppRole | AppRole | string;
  deviceId: string | null;
  online: boolean;
}

export interface UseMcpBridgeReturn {
  pack: AgentToolPack | null;
  kill: () => void;
  resume: () => void;
  killed: boolean;
}

function mapToMcpAppRole(role: string): McpAppRole {
  if (
    role === 'Developer' ||
    role === 'Admin' ||
    role === 'ClientBoss' ||
    role === 'ClientAccounting' ||
    role === 'ClientViewer' ||
    role === 'Vendor' ||
    role === 'Client'
  ) {
    return role;
  }
  return 'Client';
}

/**
 * Hook providing the MCP bridge AgentToolPack for StackChan robot tools.
 * When MCP_BRIDGE_ENABLED is false, returns pack: null and allocates no transports or sinks.
 * When enabled, routes robot calls through the edge gateway over HTTPS with auditing and safety gates.
 */
export function useMcpBridge(input: UseMcpBridgeInput): UseMcpBridgeReturn {
  const [killed, setKilled] = useAtom(mcpKillSwitchAtom);
  const killedRef = useRef(killed);
  killedRef.current = killed;

  const bridgeRef = useRef<McpBridge | null>(null);
  const sinkRef = useRef<AuditSink | null>(null);

  const { bridge, sink, pack } = useMemo(() => {
    if (!MCP_BRIDGE_ENABLED) {
      return { bridge: null, sink: null, pack: null };
    }

    const endpoint = env.VITE_ONYX_MCP_ENDPOINT || undefined;

    const transport = createEdgeTransport({
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token;
      },
      ...(endpoint ? { endpoint } : {})
    });

    const sinkInstance = createAuditSink({
      insert: insertAuditRows,
      enabled: () => MCP_BRIDGE_ENABLED
    });

    const catalog = new ToolCatalog();
    catalog.registerAll(createRobotCallTools());

    const appRole = mapToMcpAppRole(input.role);

    const bridgeInstance = createMcpBridge({
      transport,
      catalog,
      getCaller: () => ({
        role: 'staff',
        appRole,
        deviceId: input.deviceId ?? undefined
      }),
      getAppRole: () => appRole,
      getDeviceId: () => input.deviceId,
      isDeviceAssigned: (deviceId: string) => Boolean(input.deviceId && deviceId === input.deviceId),
      confirm: async (request: ConfirmRequest) => {
        return (appRole === 'Developer' || appRole === 'Admin') && request.risk === 'robot';
      },
      onAudit: (entry) => sinkInstance.push(entry),
      isKilled: () => killedRef.current
    });

    const agentTools = bridgeInstance.toAgentTools();
    const agentPack: AgentToolPack = {
      source: 'robot-mcp',
      definitions: agentTools.definitions,
      handlers: agentTools.handlers,
      risk: agentTools.risk
    };

    return { bridge: bridgeInstance, sink: sinkInstance, pack: agentPack };
  }, [input.role, input.deviceId]);

  useEffect(() => {
    bridgeRef.current = bridge;
    sinkRef.current = sink;
    return () => {
      bridge?.dispose();
      sink?.dispose();
    };
  }, [bridge, sink]);

  useEffect(() => {
    if (killed) {
      bridge?.kill();
    } else {
      bridge?.resume();
    }
  }, [killed, bridge]);

  const kill = useCallback(() => {
    setKilled(true);
    bridgeRef.current?.kill();
  }, [setKilled]);

  const resume = useCallback(() => {
    setKilled(false);
    bridgeRef.current?.resume();
  }, [setKilled]);

  return {
    pack,
    kill,
    resume,
    killed
  };
}
