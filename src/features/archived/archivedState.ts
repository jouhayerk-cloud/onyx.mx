import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { nullableAtom } from '../../lib/atoms';
import type { ArchiveSort } from './useArchiveItems';

/**
 * State shared between the Archived page (the list) and the chrome that now lives in the main top bar:
 * the tools row (search, sort, view, vendor rail), the module badge and the figures docked in the Onyx Island.
 * The page owns the data; it publishes what the bar needs to show through `archivedMetaAtom`.
 */
export const archivedVendorAtom = atom<string | 'ALL'>('ALL');
/** Raw text of the search box; the page debounces it before querying. */
export const archivedSearchAtom = atom<string>('');
export const archivedSortAtom = atom<ArchiveSort>('tag');
export const archivedViewModeAtom = atomWithStorage<'gallery' | 'table'>('archivedViewMode', 'gallery');
export const archivedTabAtom = atom<'Items' | 'Ledger'>('Items');

export interface ArchivedMeta {
  season: string;
  sourceFile: string;
  importedAt: string;
  vendors: { id: string; count: number }[];
  scopeLabel: string;
  items: number;
  quantity: number;
  weightKg: number;
  usd: number | null;
  status: 'loading' | 'ready' | 'empty' | 'error';
}

export const archivedMetaAtom = nullableAtom<ArchivedMeta>();
