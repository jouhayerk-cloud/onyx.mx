import type React from 'react';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { InventoryItemData } from '../../lib/Types';
import { NotifyKind } from './notify/types';
import { OnyxChanFace } from '../pico/useDeviceControl';

export type IslandMode = 'rest' | 'peek' | 'card' | 'surface';

export type IslandLevel = 0 | 1 | 2 | 3;
export type IslandDeploy = "auto" | IslandLevel;
export const islandDeployAtom = atomWithStorage<IslandDeploy>("onyxIslandDeploy", "auto");

/** Page-specific figures docked into the island pill, one half on each side of the face. */
export interface IslandReadout { left: React.ReactNode; right: React.ReactNode }

/** Current display mode of the island: rest, peek, card or surface. Starts at rest. */
export const islandModeAtom = atom<IslandMode>('rest');
/** Tools, the selected item, Chan (the conversation) and the notification history. Reopening keeps the last one. */
export type IslandPane = 'tools' | 'item' | 'chat' | 'notifications';
/** Pane open in the island. Starts on tools. */
export const islandPaneAtom = atom<IslandPane>('tools');

export function expressionForKind(kind: NotifyKind): OnyxChanFace {
  switch (kind) {
    case 'success': return 'happy';
    case 'error': return 'error';
    case 'warning': return 'alert';
    case 'loading': return 'thinking';
    case 'info': return 'calm';
    case 'agent': return 'speaking';
    default: return 'calm';
  }
}

/** The inventory row the user opened last in the list: what the island's Item tab shows. Separate from SelectedItemDataAtom on purpose, which other views (Process, Create, Catalog) read as their own selection. */
// `null as T | null`: without strict null checks atom<T | null>(null) picks the read-only overload (null is assignable to a function)
export const islandItemAtom = atom(null as InventoryItemData | null);
