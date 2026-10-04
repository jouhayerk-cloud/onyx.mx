import { atom } from 'jotai';
import { NotifyKind } from './notify/types';
import { OnyxChanFace } from '../pico/useDeviceControl';

export type IslandMode = 'rest' | 'peek' | 'expanded' | 'center';

export const islandModeAtom = atom<IslandMode>('rest');

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
