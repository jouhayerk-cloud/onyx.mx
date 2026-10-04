import React, { useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { Search as SearchIcon, X, LayoutGrid, List } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { userAtom, workbookDensityAtom } from '../../lib/atoms';
import { vendors as vendorTable } from '../../lib/consts';
import { getTextColorForBg } from '../../lib/utils';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import {
  archivedMetaAtom, archivedSearchAtom, archivedSortAtom, archivedTabAtom, archivedVendorAtom, archivedViewModeAtom,
} from './archivedState';
import type { ArchiveSort } from './useArchiveItems';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const SEGMENT = (active: boolean) =>
  `px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${FOCUS} ${active ? 'bg-white/10 text-[var(--main-color)]' : 'text-white/40 hover:text-white/70'}`;

const SORTS: { id: ArchiveSort; label: string }[] = [
  { id: 'tag', label: 'Tag ID' },
  { id: 'date', label: 'Date' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'weight', label: 'Weight' },
  { id: 'price', label: 'Price' },
];

const vendorColor = (id: string): string =>
  (vendorTable as Record<string, { name: string; color: string }>)[id]?.color || '#9ca3af';

export function useArchivedTools(): ToolDescriptor[] {
  const [tab, setTab] = useAtom(archivedTabAtom);
  const [search, setSearch] = useAtom(archivedSearchAtom);
  const [sort, setSort] = useAtom(archivedSortAtom);
  const [vendor, setVendor] = useAtom(archivedVendorAtom);
  const [viewMode, setViewMode] = useAtom(archivedViewModeAtom);
  const [density, setDensity] = useAtom(workbookDensityAtom);
  const meta = useAtomValue(archivedMetaAtom);

  const railRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    railRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [vendor]);

  const vendors = meta?.vendors ?? [];
  const total = vendors.reduce((sum, v) => sum + v.count, 0);
  const chips = [{ id: 'ALL', label: tr('All'), count: total }, ...vendors.map(v => ({ id: v.id, label: v.id, count: v.count }))];

  const onRailKeyDown = (e: React.KeyboardEvent) => {
    const i = chips.findIndex(c => c.id === vendor);
    let next = -1;
    if (e.key === 'ArrowRight') next = Math.min(chips.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = chips.length - 1;
    if (next >= 0) {
      e.preventDefault();
      setVendor(chips[next].id);
      railRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
    }
  };

  const tools: ToolDescriptor[] = [];

  // Tab items / ledger
  tools.push({
    id: 'archived.tab.items',
    moduleId: 'archived',
    label: tr('Items'),
    icon: LayoutGrid,
    kind: 'toggle',
    group: tr('Sections'),
    order: 10,
    pressed: tab === 'Items',
    run: () => setTab('Items')
  });
  tools.push({
    id: 'archived.tab.ledger',
    moduleId: 'archived',
    label: tr('Ledger'),
    icon: List,
    kind: 'toggle',
    group: tr('Sections'),
    order: 20,
    pressed: tab === 'Ledger',
    run: () => setTab('Ledger')
  });

  if (tab === 'Items') {
    // Search widget
    tools.push({
      id: 'archived.search',
    pinned: true,
      moduleId: 'archived',
      label: tr('Search'),
      icon: SearchIcon,
      kind: 'widget',
      group: tr('Find'),
      order: 30,
      render: () => (
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape' && search) { e.preventDefault(); setSearch(''); } }}
            placeholder={tr('Search')}
            aria-label={tr('Search')}
            className={`w-full pl-9 pr-9 py-1.5 rounded-xl bg-black/20 border border-white/10 text-[12px] text-white placeholder:text-white/40 ${FOCUS}`}
          />
          {search && (
            <button
              type="button"
              aria-label={tr('Clear search')}
              onClick={() => { setSearch(''); searchRef.current?.focus(); }}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/50 hover:text-white ${FOCUS}`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )
    });

    // Sort widget
    tools.push({
      id: 'archived.sort',
      moduleId: 'archived',
      label: tr('Sort'),
      icon: List,
      kind: 'widget',
      group: tr('Find'),
      order: 40,
      render: () => (
        <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/50">
          {tr('Sort')}
          <select
            value={sort}
            onChange={e => setSort(e.target.value as ArchiveSort)}
            className={`rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-[11px] font-bold normal-case tracking-normal text-white ${FOCUS}`}
          >
            {SORTS.map(s => <option key={s.id} value={s.id}>{tr(s.label)}</option>)}
          </select>
        </label>
      )
    });

    // View Mode: Gallery
    tools.push({
      id: 'archived.view.gallery',
      moduleId: 'archived',
      label: tr('Gallery View'),
      title: tr('Gallery View'),
      icon: LayoutGrid,
      kind: 'toggle',
      group: tr('View'),
      order: 50,
      pinned: true,
      pressed: viewMode === 'gallery',
      run: () => setViewMode('gallery')
    });

    // View Mode: Table
    tools.push({
      id: 'archived.view.table',
      moduleId: 'archived',
      label: tr('Table View'),
      title: tr('Table View'),
      icon: List,
      kind: 'toggle',
      group: tr('View'),
      order: 60,
      pinned: true,
      pressed: viewMode === 'table',
      run: () => setViewMode('table')
    });

    // Density
    tools.push({
      id: 'archived.view.density',
      moduleId: 'archived',
      label: density === 'compact' ? tr('Compact') : tr('Comfortable'),
      icon: List,
      kind: 'toggle',
      group: tr('View'),
      order: 70,
      pressed: density === 'compact',
      run: () => setDensity(density === 'compact' ? 'comfortable' : 'compact')
    });

    // Vendor Rail
    tools.push({
      id: 'archived.vendors',
    pinned: true,
      moduleId: 'archived',
      label: tr('Vendors'),
      icon: List,
      kind: 'widget',
      group: tr('Vendors'),
      order: 80,
      render: () => (
        <div
          ref={railRef}
          role="tablist"
          aria-label={tr('Vendors')}
          onKeyDown={onRailKeyDown}
          className="flex gap-1.5 overflow-x-auto pb-0.5 snap-x no-scrollbar"
        >
          {chips.map(c => {
            const active = c.id === vendor;
            const color = c.id === 'ALL' ? 'var(--main-color, #00aeef)' : vendorColor(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setVendor(c.id)}
                className={`snap-start shrink-0 flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${FOCUS}`}
                style={active
                  ? { backgroundColor: color, color: c.id === 'ALL' ? '#000' : getTextColorForBg(color), borderColor: color }
                  : { color, borderColor: 'rgba(255,255,255,0.10)' }}
              >
                {c.label}
                <span className="tabular-nums opacity-70">{c.count}</span>
              </button>
            );
          })}
        </div>
      )
    });
  }

  return tools;
}

export const ArchivedToolsRegistrar: React.FC = () => {
  const user = useAtomValue(userAtom);
  const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
  const allowed = (user?.role === 'Developer' || user?.role === 'Admin') && islandEnabled;
  const tools = useArchivedTools();

  useRegisterTools('archived', tools, allowed);

  return null;
};
