/**
 * onyxChanMcpClient.ts
 * 
 * TypeScript client SDK for invoking OnyxChan Model Context Protocol (MCP) tools.
 * Can invoke tools via Supabase Edge Function HTTP or directly through Supabase Realtime.
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

  /** Execute an MCP tool via the Supabase Edge Function */
  async callTool<T = any>(toolName: string, args: Record<string, any>): Promise<T> {
    try {
      const response = await fetch(`${this.functionUrl}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || ''}`,
        },
        body: JSON.stringify({ tool: toolName, args }),
      });

      if (!response.ok) {
        throw new Error(`MCP tool execution error: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      console.warn(`[MCP Fallback] Invoking via direct Realtime broadcast:`, toolName, args);
      // Fallback: Dispatch directly via Supabase Realtime broadcast
      return this.dispatchRealtimeFallback(toolName, args);
    }
  }

  /** Direct Realtime dispatch fallback */
  private async dispatchRealtimeFallback(toolName: string, args: Record<string, any>): Promise<any> {
    const deviceId = args.device_id || 'global-broadcast';
    const channel = supabase.channel(`device_control:${deviceId}`);

    let payload: Record<string, any> = {};
    switch (toolName) {
      case 'move_head':
        payload = { action: 'move', pan: args.pan, tilt: args.tilt };
        break;
      case 'set_expression':
        payload = { action: 'face', expression: args.expression, duration: args.duration };
        break;
      case 'speak':
        payload = { action: 'tts', text: args.text, language: args.language || 'es' };
        break;
      case 'display_vendor_card':
        payload = {
          action: 'vendor-display',
          vendor: args.vendor,
          title: args.title,
          details: args.details,
          color: args.color,
          icon: args.icon,
        };
        break;
      case 'display_inventory_card':
        payload = {
          action: 'inventory-display',
          item_id: args.item_id,
          title: args.title,
          price: args.price,
          stock: args.stock,
          vendor: args.vendor,
        };
        break;
      case 'ping_robot':
        payload = { action: 'ping', timestamp: Date.now() };
        break;
      default:
        payload = { action: toolName, ...args };
        break;
    }

    await channel.send({
      type: 'broadcast',
      event: 'DEVICE_COMMAND',
      payload,
    });

    return { status: 'broadcast_sent', payload };
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
