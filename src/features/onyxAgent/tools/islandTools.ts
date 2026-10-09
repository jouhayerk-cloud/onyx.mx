import { AppContextSnapshot } from '../context/appContext';
import { ToolDescriptor } from '../../../lib/toolRegistry';
import { IslandMode } from '../../onyxIsland/islandState';
import { NotifyKind } from '../../onyxIsland/notify/types';

export interface IslandToolContext {
  getSnapshot: () => AppContextSnapshot;
  getTools: () => ToolDescriptor[];
  runTool: (id: string) => boolean;
  setIslandMode: (mode: IslandMode) => void;
  setIslandPane: (pane: 'tools' | 'chat' | 'notifications') => void;
  setPinned: (id: string, pinned: boolean) => void;
  showToast: (message: string, kind: NotifyKind) => void;
}

export const islandToolDefinitions = [
  {
    name: "get_ui_snapshot",
    description: "Returns a compact snapshot of the app context, including active view, user role, season, readouts, filters, search text, sidebar state, unread notifications, tool registry summary, and robot status.",
    parameters: {
      type: "OBJECT",
      properties: {}
    }
  },
  {
    name: "list_island_tools",
    description: "Lists registered island tools, optionally filtered by module or text.",
    parameters: {
      type: "OBJECT",
      properties: {
        filter: {
          type: "STRING",
          description: "Optional text to filter tools by module or label."
        }
      }
    }
  },
  {
    name: "run_island_tool",
    description: "Runs a registered island tool. Refuses widgets and destructive actions.",
    parameters: {
      type: "OBJECT",
      properties: {
        id: {
          type: "STRING",
          description: "The ID of the tool to run."
        }
      },
      required: ["id"]
    }
  },
  {
    name: "open_island_surface",
    description: "Opens the island command surface and optionally a specific pane.",
    parameters: {
      type: "OBJECT",
      properties: {
        pane: {
          type: "STRING",
          description: "The pane to open: 'tools', 'chat', or 'notifications'."
        }
      }
    }
  },
  {
    name: "set_pinned_tool",
    description: "Pins or unpins a tool from the island launcher.",
    parameters: {
      type: "OBJECT",
      properties: {
        id: {
          type: "STRING",
          description: "The ID of the tool to pin/unpin."
        },
        pinned: {
          type: "BOOLEAN",
          description: "True to pin, false to unpin."
        }
      },
      required: ["id", "pinned"]
    }
  },
  {
    name: "show_toast",
    description: "Shows a notification toast via the island.",
    parameters: {
      type: "OBJECT",
      properties: {
        message: {
          type: "STRING",
          description: "The message to display."
        },
        kind: {
          type: "STRING",
          description: "The kind of toast: 'success', 'error', 'warning', 'loading', 'info', 'agent'."
        }
      },
      required: ["message", "kind"]
    }
  }
];

export const islandToolRisk: Record<string, 'read' | 'navigate' | 'robot' | 'write'> = {
  get_ui_snapshot: 'read',
  list_island_tools: 'read',
  run_island_tool: 'write',
  open_island_surface: 'navigate',
  set_pinned_tool: 'write',
  show_toast: 'navigate'
};

const DESTRUCTIVE_TERMS = ['delete', 'clear', 'reset', 'logout', 'remove', 'destroy', 'drop'];

export function createIslandToolHandlers(ctx: IslandToolContext): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return {
    get_ui_snapshot: async () => {
      return { ok: true, context: ctx.getSnapshot() };
    },
    list_island_tools: async (args) => {
      const filterText = typeof args.filter === 'string' ? args.filter.toLowerCase() : '';
      const allTools = ctx.getTools();
      const filtered = allTools.filter(t => 
        !filterText || 
        t.id.toLowerCase().includes(filterText) || 
        t.moduleId.toLowerCase().includes(filterText) || 
        t.label.toLowerCase().includes(filterText)
      );
      
      const summary = filtered.map(t => ({
        id: t.id,
        moduleId: t.moduleId,
        label: t.label,
        kind: t.kind,
        group: t.group,
        pressed: t.pressed,
        disabled: t.disabled
      }));
      return { ok: true, tools: summary };
    },
    run_island_tool: async (args) => {
      const id = typeof args.id === 'string' ? args.id : '';
      if (!id) return { ok: false, error: 'missing id' };
      
      const tool = ctx.getTools().find(t => t.id === id);
      if (!tool) return { ok: false, error: 'tool not found' };
      
      if (tool.kind === 'widget') {
        return { ok: false, error: 'cannot run widget tools' };
      }
      if (tool.disabled) {
        return { ok: false, error: 'tool is disabled' };
      }
      
      const idLower = id.toLowerCase();
      if (DESTRUCTIVE_TERMS.some(term => idLower.includes(term))) {
        return { ok: false, error: 'destructive actions are not allowed' };
      }
      
      const success = ctx.runTool(id);
      return { ok: success, ran: id };
    },
    open_island_surface: async (args) => {
      const pane = typeof args.pane === 'string' ? args.pane : 'tools';
      if (pane === 'tools' || pane === 'chat' || pane === 'notifications') {
        ctx.setIslandPane(pane);
      }
      ctx.setIslandMode('surface');
      return { ok: true };
    },
    set_pinned_tool: async (args) => {
      const id = typeof args.id === 'string' ? args.id : '';
      const pinned = typeof args.pinned === 'boolean' ? args.pinned : false;
      if (!id) return { ok: false, error: 'missing id' };
      
      ctx.setPinned(id, pinned);
      return { ok: true, id, pinned };
    },
    show_toast: async (args) => {
      const message = typeof args.message === 'string' ? args.message : '';
      const kind = typeof args.kind === 'string' ? args.kind as NotifyKind : 'info';
      if (!message) return { ok: false, error: 'missing message' };
      
      const validKinds: NotifyKind[] = ['success', 'error', 'warning', 'loading', 'info', 'agent'];
      const actualKind = validKinds.includes(kind) ? kind : 'info';
      
      ctx.showToast(message, actualKind);
      return { ok: true };
    }
  };
}

import type { AgentToolPack } from '../useOnyxAgent';

export function createIslandToolPack(ctx: IslandToolContext): AgentToolPack {
  return {
    source: 'island',
    definitions: islandToolDefinitions,
    handlers: createIslandToolHandlers(ctx),
    risk: islandToolRisk
  };
}

