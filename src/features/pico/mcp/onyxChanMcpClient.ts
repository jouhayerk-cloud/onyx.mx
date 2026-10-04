/**
 * onyxChanMcpClient.ts
 * 
 * TypeScript client SDK for invoking OnyxChan Model Context Protocol (MCP) tools.
 * Invokes tools via the Supabase Edge Function over HTTP.
 */
import { supabase } from '../../../lib/supabase';
import { OnyxChanFace } from '../useDeviceControl';

export interface MoveHeadParams {
  device_id: string;
  pan: number;  // -90 to 90
  tilt: number; // 0 to 90
}

export interface SetExpressionParams {
  device_id: string;
  expression: OnyxChanFace;
  duration?: number;
}

export interface SpeakParams {
  device_id: string;
  text: string;
  language?: 'es' | 'en' | 'ja';
}

export interface DisplayVendorCardParams {
  device_id: string;
  vendor: string;
  title: string;
  details: string[];
  color?: string;
  icon?: 'box' | 'tag' | 'dollar' | 'truck' | 'package';
}

export interface DisplayInventoryCardParams {
  device_id: string;
  item_id: string;
  title: string;
  price?: number;
  stock?: number;
  vendor?: string;
}

export interface QueryInventoryParams {
  search_term?: string;
  vendor?: string;
  status?: string;
  limit?: number;
}

export class OnyxChanMcpClient {
  private functionUrl: string;

  constructor(customUrl?: string) {
    this.functionUrl = customUrl || `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/onyxchan-mcp`;
  }

  /** Execute an MCP tool via the Supabase Edge Function; failures throw so the UI can show them */
  async callTool<T = any>(toolName: string, args: Record<string, any>): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      throw new Error('Sign in required to call OnyxChan MCP tools.');
    }

    const response = await fetch(`${this.functionUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ tool: toolName, args }),
    });

    if (!response.ok) {
      throw new Error(`MCP tool execution error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  // ── Convenience Tool Invocations ──────────────────────────────────────────
  async moveHead(params: MoveHeadParams) {
    return this.callTool('move_head', params);
  }

  async setExpression(params: SetExpressionParams) {
    return this.callTool('set_expression', params);
  }

  async speak(params: SpeakParams) {
    return this.callTool('speak', params);
  }

  async displayVendorCard(params: DisplayVendorCardParams) {
    return this.callTool('display_vendor_card', params);
  }

  async displayInventoryCard(params: DisplayInventoryCardParams) {
    return this.callTool('display_inventory_card', params);
  }

  async getRobotStatus(deviceId: string) {
    return this.callTool('get_robot_status', { device_id: deviceId });
  }

  async queryInventory(params: QueryInventoryParams = {}) {
    return this.callTool('query_inventory', params);
  }

  async pingRobot(deviceId: string) {
    return this.callTool('ping_robot', { device_id: deviceId });
  }
}

export const onyxChanMcp = new OnyxChanMcpClient();
