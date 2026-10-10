import { atomWithStorage } from 'jotai/utils';

export type IslandDensity = 'comfortable' | 'compact';

export const recentToolsAtom = atomWithStorage<string[]>('onyxIslandRecentTools', []);

export const islandDensityAtom = atomWithStorage<IslandDensity>('onyxIslandDensity', 'comfortable');

export function pushRecent(list: string[], id: string): string[] {
  const filtered = list.filter(item => item !== id);
  return [id, ...filtered].slice(0, 6);
}
