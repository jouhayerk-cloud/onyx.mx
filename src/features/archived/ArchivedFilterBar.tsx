import React, { useRef, useEffect } from 'react';
import { useAtom } from 'jotai/react';
import { LayoutGrid, List, Search, X } from 'lucide-react';
import { workbookDensityAtom } from '../../lib/atoms';
import { vendors as vendorTable } from '../../lib/consts';
import { getTextColorForBg } from '../../lib/utils';
import { tr } from '../../lib/i18n';
import type { ArchiveSort } from './useArchiveItems';

export interface ArchivedFilterBarProps {
  vendors: { id: string; count: number }[];
  selectedVendor: string | 'ALL';
  onSelectVendor: (vendor: string | 'ALL') => void;
  search: string;
  onSearchChange: (search: string) => void;
  sort: ArchiveSort | string;
  onSortChange: (sort: string) => void;
  viewMode: 'gallery' | 'table';
  onViewModeChange: (mode: 'gallery' | 'table') => void;
  activeTab: 'Items' | 'Ledger';
  onTabChange: (tab: 'Items' | 'Ledger') => void;
  showLedgerTab: boolean;
  /** Price sorting is offered only to Developer and Admin. */
  showFinance?: boolean;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const SEGMENT = (active: boolean) =>
  `px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${FOCUS} ${active ? 'bg-white/10 text-[var(--main-color)]' : 'text-white/30 hover:text-white/60'}`;

const SORTS: { id: ArchiveSort; label: string; finance?: boolean }[] = [
  { id: 'tag', label: 'Tag ID' },
  { id: 'date', label: 'Date' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'weight', label: 'Weight' },
  { id: 'price', label: 'Price', finance: true },
];

const vendorColor = (id: string): string =>
  (vendorTable as Record<string, { name: string; color: string }>)[id]?.color || '#9ca3af';

export const ArchivedFilterBar: React.FC<ArchivedFilterBarProps> = ({
  vendors, selectedVendor, onSelectVendor, search, onSearchChange, sort, onSortChange,
  viewMode, onViewModeChange, activeTab, onTabChange, showLedgerTab, showFinance = false,
}) => {
  const [density, setDensity] = useAtom(workbookDensityAtom);
  const railRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const total = vendors.reduce((sum, v) => sum + v.count, 0);
  const chips: { id: string; label: string; count: number }[] = [
    { id: 'ALL', label: tr('All'), count: total },
    ...vendors.map(v => ({ id: v.id, label: v.id, count: v.count })),
  ];

  // keep the active chip in view when it changes (e.g. after a keyboard move)
  useEffect(() => {
    const el = railRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedVendor]);

  const onRailKeyDown = (e: React.KeyboardEvent) => {
    const i = chips.findIndex(c => c.id === selectedVendor);
    let next = -1;
    if (e.key === 'ArrowRight') next = Math.min(chips.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = chips.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onSelectVendor(chips[next].id);
      railRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
    }
  };

  const sorts = SORTS.filter(s => !s.finance || showFinance);

  return (
    <div className="sticky top-0 z-20 flex flex-col gap-3 px-6 py-3 bg-black/30 border-b border-white/[0.05] shrink-0">
      {showLedgerTab && (
        <div className="flex justify-center">
          <div role="group" aria-label={tr('Archived sections')} className="flex bg-black/20 p-0.5 rounded-lg border border-white/5">
            <button type="button" aria-pressed={activeTab === 'Items'} onClick={() => onTabChange('Items')} className={SEGMENT(activeTab === 'Items')}>{tr('Items')}</button>
            <button type="button" aria-pressed={activeTab === 'Ledger'} onClick={() => onTabChange('Ledger')} className={SEGMENT(activeTab === 'Ledger')}>{tr('Ledger')}</button>
          </div>
        </div>
      )}

      {activeTab === 'Items' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape' && search) { e.preventDefault(); onSearchChange(''); } }}
                placeholder={tr('Search')}
                aria-label={tr('Search')}
                className={`w-full pl-9 pr-9 py-2 rounded-xl bg-black/30 border border-white/10 text-[12px] text-white placeholder:text-white/30 ${FOCUS}`}
              />
              {search && (
                <button
                  type="button"
                  aria-label={tr('Clear search')}
                  onClick={() => { onSearchChange(''); searchRef.current?.focus(); }}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/40 hover:text-white ${FOCUS}`}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/40">
              {tr('Sort')}
              <select
                value={sort}
                onChange={e => onSortChange(e.target.value)}
                className={`rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-[11px] font-bold normal-case tracking-normal text-white ${FOCUS}`}
              >
                {sorts.map(s => <option key={s.id} value={s.id}>{tr(s.label)}</option>)}
              </select>
            </label>

            <div className="flex items-center gap-2 ml-auto">
              <div role="group" aria-label={tr('View')} className="flex bg-black/20 p-0.5 rounded-lg border border-white/5">
                <button type="button" aria-pressed={viewMode === 'gallery'} aria-label={tr('Gallery View')} title={tr('Gallery View')} onClick={() => onViewModeChange('gallery')} className={`p-1.5 rounded-md transition-all ${FOCUS} ${viewMode === 'gallery' ? 'bg-white/10 text-[var(--main-color)]' : 'text-white/30 hover:text-white/60'}`}><LayoutGrid size={14} aria-hidden="true" /></button>
                <button type="button" aria-pressed={viewMode === 'table'} aria-label={tr('Table View')} title={tr('Table View')} onClick={() => onViewModeChange('table')} className={`p-1.5 rounded-md transition-all ${FOCUS} ${viewMode === 'table' ? 'bg-white/10 text-[var(--main-color)]' : 'text-white/30 hover:text-white/60'}`}><List size={14} aria-hidden="true" /></button>
              </div>
              <button
                type="button"
                aria-pressed={density === 'compact'}
                onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
                className={`px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white ${FOCUS}`}
              >
                {density === 'compact' ? tr('Compact') : tr('Comfortable')}
              </button>
            </div>
          </div>

          <div
            ref={railRef}
            role="tablist"
            aria-label={tr('Vendors')}
            onKeyDown={onRailKeyDown}
            className="flex gap-1.5 overflow-x-auto pb-1 snap-x"
          >
            {chips.map(c => {
              const active = c.id === selectedVendor;
              const color = c.id === 'ALL' ? 'var(--main-color, #00aeef)' : vendorColor(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onSelectVendor(c.id)}
                  className={`snap-start shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${FOCUS}`}
                  style={active
                    ? { backgroundColor: color, color: c.id === 'ALL' ? '#000' : getTextColorForBg(color), borderColor: color }
                    : { color, borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  {c.label}
                  <span className="tabular-nums opacity-70">{c.count}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
