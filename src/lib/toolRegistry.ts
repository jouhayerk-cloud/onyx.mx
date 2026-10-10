import { useEffect, useRef } from 'react';
import type React from 'react';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useSetAtom } from 'jotai/react';

/**
 * Tool registry of the Onyx Island.
 *
 * Every module used to draw its tool buttons in the main top bar. A module now DESCRIBES its tools here and the
 * island draws them: the pinned ones as launchers beside the face (COMPACT) and all of them, grouped, in the
 * EXPANDED command surface. A module registers while it is on screen (useRegisterTools) and its tools disappear
 * when it unmounts, so the island always lists exactly the tools of the current view plus the global ones.
 */
export type ToolKind = 'action' | 'toggle' | 'widget';

export interface ToolDescriptor {
  /** Unique, kebab-case, prefixed by the module: 'inventory.search'. */
  id: string;
  /** 'inventory' | 'archived' | 'global' | ... */
  moduleId: string;
  /** Already translated (tr). */
  label: string;
  icon: React.ElementType;
  kind: ToolKind;
  /** Section title in the EXPANDED surface (already translated). */
  group: string;
  order: number;
  /** Default pin state: pinned tools get a launcher beside the face in COMPACT. */
  pinned?: boolean;
  /** Side of the face for a pinned launcher in the docked island. Without it the pinned tools are split in two halves. Within a side the launchers follow `order`. */
  dock?: 'left' | 'right';
  disabled?: boolean;
  /** For toggles: current state. */
  pressed?: boolean;
  badge?: number | string;
  /** Tooltip; defaults to the label. */
  title?: string;
  /** action and toggle: what the tool does. */
  run?: () => void;
  /** widget: complex controls (search box, select, vendor rail) drawn inside the EXPANDED grid. Dropdowns it opens must portal to document.body. */
  render?: () => React.ReactNode;
  /** Compact label, already translated, at most 12 characters. */
  short?: string;
  /** Priority from 0 to 100, default 50, higher stays visible longer. */
  priority?: number;
  /** Never moves into the More list. */
  essential?: boolean;
}

/** owner key -> its descriptors. An owner is one registrant (usually the module id). */
export const toolRegistryAtom = atom<Record<string, ToolDescriptor[]>>({});

/** Every registered tool, flattened and sorted by group then order. */
export const allToolsAtom = atom((get) => {
  const flat = Object.values(get(toolRegistryAtom)).flat();
  return flat.sort((a, b) => a.group.localeCompare(b.group) || a.order - b.order || a.id.localeCompare(b.id));
});

/** Per-device pin overrides: id -> pinned. A missing id uses the descriptor's own default. */
export const pinnedToolsAtom = atomWithStorage<Record<string, boolean>>('onyxIslandPinnedTools', {});

/** The island owns the tools of every module that has been migrated; false brings the old top bar rows back. */
export const islandCommandsEnabledAtom = atomWithStorage<boolean>('onyxIslandCommands', true);

export const isToolPinned = (tool: ToolDescriptor, overrides: Record<string, boolean>): boolean =>
  overrides[tool.id] ?? tool.pinned ?? false;

/** What changes how a tool is drawn. Closures (run, render) are NOT part of it: they are read through a ref so they are always fresh without re-registering. */
const signature = (tools: ToolDescriptor[]): string =>
  tools.map(t => [t.id, t.moduleId, t.label, t.kind, t.group, t.order, t.pinned ? 1 : 0, t.disabled ? 1 : 0, t.pressed ? 1 : 0, t.badge ?? '', t.title ?? '', t.dock ?? '', t.render ? 'w' : '', t.short ?? '', t.priority ?? '', t.essential ? 1 : 0].join('|')).join(';');

/**
 * Register a module's tools while the calling component is mounted.
 *
 * The registry is only written when what is drawn changes (signature); `run` and `render` are wrapped so they
 * always call the latest closure of the caller.
 */
export function useRegisterTools(owner: string, tools: ToolDescriptor[], enabled = true): void {
  const setRegistry = useSetAtom(toolRegistryAtom);
  const latest = useRef<ToolDescriptor[]>(tools);
  latest.current = tools;
  const sig = enabled ? signature(tools) : '';

  const remove = () => setRegistry(prev => {
    if (!(owner in prev)) return prev;
    const { [owner]: _removed, ...rest } = prev;
    return rest;
  });

  useEffect(() => {
    if (!enabled) { remove(); return; }
    const wrapped: ToolDescriptor[] = latest.current.map(t => ({
      ...t,
      run: t.run ? () => latest.current.find(x => x.id === t.id)?.run?.() : undefined,
      render: t.render ? () => latest.current.find(x => x.id === t.id)?.render?.() ?? null : undefined,
    }));
    setRegistry(prev => ({ ...prev, [owner]: wrapped }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, sig, enabled, setRegistry]);

  // gone from the screen: its tools go with it
  useEffect(() => remove, [owner]);   // eslint-disable-line react-hooks/exhaustive-deps
}
