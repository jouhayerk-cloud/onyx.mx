import React, { useEffect, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { Archive, LayoutGrid, List, Search, X } from 'lucide-react';
import { userAtom, workbookDensityAtom } from '../../lib/atoms';
import { vendors as vendorTable } from '../../lib/consts';
import { getTextColorForBg } from '../../lib/utils';
import { tr } from '../../lib/i18n';
import {
  archivedMetaAtom, archivedSearchAtom, archivedSortAtom, archivedTabAtom, archivedVendorAtom, archivedViewModeAtom,
} from './archivedState';
import type { ArchiveSort } from './useArchiveItems';

/* Everything that used to sit above the Archived list lives in the main top bar now:
   - ArchivedBar      the module badge in the header row
   - ArchivedReadout  the figures, docked into the Onyx Island pill
   - ArchivedToolsBar search, sort, view and the vendor rail, under the header row
   The page itself is only the list, so the work area gets all the height. */

const lbl = 'text-[7px] font-black uppercase tracking-[0.16em] opacity-40 leading-none';
const val = 'text-[12px] font-black leading-none tracking-tight tabular-nums';

const nf = (n: number, digits = 0) => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd = (v: number | null) => (v == null ? '—' : `$${nf(v)}`);

/** Header-row badge: what this module is and which book it shows. */
export const ArchivedBar: React.FC = () => {
  const meta = useAtomValue(archivedMetaAtom);
  return (
    <div className="flex items-center gap-4 shrink-0 animate-in fade-in duration-300">
      <div className="flex items-center gap-3 pr-5 border-r border-white/5">
        <Archive size={32} strokeWidth={2} style={{ color: 'var(--main-color)' }} aria-hidden="true" />
        <div className="flex flex-col gap-1.5 leading-none">
          <span className="text-[15px] font-black uppercase tracking-tight">{tr('Archived')}</span>
          <span className="text-[9px] font-mono opacity-50">{tr('Season')} {meta?.season ?? '—'}</span>
        </div>
      </div>
      {meta && (
        <div className="hidden xl:flex items-center gap-5">
          <div className="flex flex-col gap-1.5 leading-none">
            <span className={lbl}>{tr('Source File')}</span>
            <span className="text-[11px] font-mono font-bold">{meta.sourceFile}</span>
          </div>
          {meta.importedAt && (
            <div className="flex flex-col gap-1.5 leading-none">
              <span className={lbl}>{tr('Imported')}</span>
              <span className="text-[11px] font-mono font-bold">{new Date(meta.importedAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Figures for the island pill: `stats` goes left of the face, `scope` right of it. */
export const ArchivedReadout: React.FC<{ part: 'stats' | 'scope' }> = ({ part }) => {
  const meta = useAtomValue(archivedMetaAtom);
  const dash = '—';
  if (part === 'stats') {
    return (
      <div className="grid grid-rows-2 grid-flow-col auto-cols-max items-center gap-x-3.5 gap-y-1 px-3.5 py-1.5">
        <span className={lbl}>{tr('Items')}</span>
        <span className={`${val} text-(--text-color)`}>{meta ? nf(meta.items) : dash}</span>
        <span className={lbl}>{tr('Qty')}</span>
        <span className={`${val} text-[#6BCEBB]`}>{meta ? nf(meta.quantity) : dash}</span>
        <span className={lbl}>{tr('Weight (KG)')}</span>
        <span className={`${val} text-(--text-color)`}>{meta ? nf(meta.weightKg, 1) : dash}</span>
      </div>
    );
  }
  return (
    <div className="info-notch-user grid grid-rows-2 grid-flow-col auto-cols-max items-center gap-x-3.5 gap-y-1 px-3.5 py-1.5 text-left">
      <span className={`${lbl} text-(--main-color)`}>{tr('Scope')}</span>
      <span className="text-[12px] font-black leading-none tracking-tight text-(--text-color) max-w-[110px] truncate">{meta?.scopeLabel ?? dash}</span>
      {meta?.usd != null && (
        <>
          <span className={lbl}>{tr('Total USD')}</span>
          <span className={`${val} text-(--main-color)`}>{usd(meta.usd)}</span>
        </>
      )}
    </div>
  );
};

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

/** Second row of the top bar: sections, search, sort, view and the vendor rail. */
export const ArchivedToolsBar: React.FC = () => {
  const user = useAtomValue(userAtom);
  const allowed = user?.role === 'Developer' || user?.role === 'Admin';
  const meta = useAtomValue(archivedMetaAtom);
  const [tab, setTab] = useAtom(archivedTabAtom);
  const [search, setSearch] = useAtom(archivedSearchAtom);
  const [sort, setSort] = useAtom(archivedSortAtom);
  const [vendor, setVendor] = useAtom(archivedVendorAtom);
  const [viewMode, setViewMode] = useAtom(archivedViewModeAtom);
  const [density, setDensity] = useAtom(workbookDensityAtom);
  const railRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    railRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [vendor]);

  if (!allowed) return null;

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

  return (
    <div className="universal-tools-bar flex flex-col gap-1.5 px-6 pt-1 pb-2 shrink-0">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={tr('Archived sections')} className="flex bg-black/20 p-0.5 rounded-lg border border-white/5">
          <button type="button" aria-pressed={tab === 'Items'} onClick={() => setTab('Items')} className={SEGMENT(tab === 'Items')}>{tr('Items')}</button>
          <button type="button" aria-pressed={tab === 'Ledger'} onClick={() => setTab('Ledger')} className={SEGMENT(tab === 'Ledger')}>{tr('Ledger')}</button>
        </div>

        {tab === 'Items' && (
          <>
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" aria-hidden="true" />
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

            <div className="flex items-center gap-2 ml-auto">
              <div role="group" aria-label={tr('View')} className="flex bg-black/20 p-0.5 rounded-lg border border-white/5">
                <button type="button" aria-pressed={viewMode === 'gallery'} aria-label={tr('Gallery View')} title={tr('Gallery View')} onClick={() => setViewMode('gallery')} className={`p-1.5 rounded-md transition-all ${FOCUS} ${viewMode === 'gallery' ? 'bg-white/10 text-[var(--main-color)]' : 'text-white/40 hover:text-white/70'}`}><LayoutGrid size={14} aria-hidden="true" /></button>
                <button type="button" aria-pressed={viewMode === 'table'} aria-label={tr('Table View')} title={tr('Table View')} onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all ${FOCUS} ${viewMode === 'table' ? 'bg-white/10 text-[var(--main-color)]' : 'text-white/40 hover:text-white/70'}`}><List size={14} aria-hidden="true" /></button>
              </div>
              <button
                type="button"
                aria-pressed={density === 'compact'}
                onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
                className={`px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white ${FOCUS}`}
              >
                {density === 'compact' ? tr('Compact') : tr('Comfortable')}
              </button>
            </div>
          </>
        )}
      </div>

      {tab === 'Items' && (
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
      )}
    </div>
  );
};
