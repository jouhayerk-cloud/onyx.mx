import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { atomWithStorage } from 'jotai/utils';
import { userAtom, workbookDensityAtom } from '../../lib/atoms';
import { tr } from '../../lib/i18n';
import { vendors } from '../../lib/consts';
import { ArchivedHeader } from './ArchivedHeader';
import { ArchivedFilterBar } from './ArchivedFilterBar';
import { ArchiveItemCard } from './ArchiveItemCard';
import { ArchiveItemTable } from './ArchiveItemTable';
import { ArchiveItemDrawer } from './ArchiveItemDrawer';
import { ArchivedLedger } from './ArchivedLedger';
import { useArchiveItems } from './useArchiveItems';
import type { ArchiveSort } from './useArchiveItems';
import { InventorySkeletonGrid, InventorySkeletonList } from '../inventory/InventorySkeleton';

export const archivedViewModeAtom = atomWithStorage<'gallery' | 'table'>('archivedViewMode', 'gallery');

const Gate: React.FC = () => (
  <div className="flex h-full items-center justify-center p-8 bg-black/40">
    <div className="text-sm font-black tracking-widest uppercase text-white/40">
      {tr("Access Restricted")}
    </div>
  </div>
);

const InnerArchivedView: React.FC<{ isFinanceRole: boolean }> = ({ isFinanceRole }) => {
  const [vendor, setVendor] = useState<string | 'ALL'>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ArchiveSort>('tag');
  const [viewMode, setViewMode] = useAtom(archivedViewModeAtom);
  const rawDensity = useAtomValue(workbookDensityAtom);
  const density = rawDensity === 'compact' ? 'compact' : 'standard';
  const [tab, setTab] = useState<'Items' | 'Ledger'>('Items');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const {
    book,
    items,
    financeMap,
    vendors: archiveVendors,
    scopeTotals,
    status,
    loadingMore,
    hasMore,
    loadMore,
    error,
    retry
  } = useArchiveItems(vendor, search, sort, isFinanceRole);

  const scopeLabel = vendor === 'ALL' 
    ? tr('All Vendors') 
    : (vendors[vendor as keyof typeof vendors]?.name || vendor);

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = observerTarget.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  // an open item belongs to the list that was on screen: changing vendor, search or sort closes it
  useEffect(() => { setSelectedId(null); }, [vendor, search, sort]);

  const selectedIndex = useMemo(() => items.findIndex(i => i.id === selectedId), [items, selectedId]);
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;
  const selectedFinance = selectedItem ? (financeMap[selectedItem.id] ?? null) : null;

  const handleNext = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < items.length - 1) {
      setSelectedId(items[selectedIndex + 1].id);
    } else if (selectedIndex >= 0 && hasMore && !loadingMore) {
      loadMore();   // at the end of the loaded pages: fetch the next page, then Next works again
    }
  }, [selectedIndex, items, hasMore, loadingMore, loadMore]);

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) {
      setSelectedId(items[selectedIndex - 1].id);
    }
  }, [selectedIndex, items]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedId) {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black/40">
      <ArchivedHeader
        season={book?.season ?? '—'}
        sourceFile={book?.source_file ?? '—'}
        importedAt={book?.imported_at ?? ''}
        vendorCount={archiveVendors.length}
        totalQuantity={scopeTotals?.quantity ?? 0}
        totalWeight={scopeTotals?.weightKg ?? 0}
        totalUsd={scopeTotals?.usd ?? null}
        scopeLabel={scopeLabel}
        itemsInScope={scopeTotals?.items ?? 0}
      />
      
      <ArchivedFilterBar
        vendors={archiveVendors}
        selectedVendor={vendor}
        onSelectVendor={setVendor}
        search={searchInput}
        onSearchChange={setSearchInput}
        sort={sort}
        onSortChange={(s) => setSort(s as ArchiveSort)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        activeTab={tab}
        onTabChange={setTab}
        showLedgerTab={isFinanceRole}
        showFinance={isFinanceRole}
      />

      <div className="flex-1 overflow-auto custom-scrollbar relative">
        {tab === 'Ledger' && isFinanceRole ? (
          <ArchivedLedger />
        ) : (
          <div className="p-3 min-h-full flex flex-col">
            {status === 'error' && (
              <div className="flex flex-col items-center justify-center flex-1 space-y-4 py-12">
                <div className="text-red-400 font-bold">{error || tr('Error loading archive')}</div>
                <button
                  onClick={retry}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded font-bold transition-colors"
                >
                  {tr('Retry')}
                </button>
              </div>
            )}
            
            {status === 'empty' && (
              <div className="flex flex-col items-center justify-center flex-1 py-12">
                <div className="text-white/40 font-black tracking-widest uppercase">
                  {tr('No items found')}
                </div>
              </div>
            )}

            {status === 'loading' && items.length === 0 && (
              viewMode === 'gallery' ? <InventorySkeletonGrid /> : <InventorySkeletonList />
            )}

            {items.length > 0 && (
              <>
                {viewMode === 'gallery' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {items.map(item => (
                      <ArchiveItemCard
                        key={item.id}
                        item={item}
                        finance={financeMap[item.id] ?? null}
                        isSelected={selectedId === item.id}
                        onClick={() => setSelectedId(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <ArchiveItemTable
                    items={items}
                    financeMap={financeMap}
                    isFinanceRole={isFinanceRole}
                    selectedId={selectedId}
                    onRowClick={(item) => setSelectedId(item.id)}
                    density={density}
                  />
                )}
                
                <div ref={observerTarget} className="h-4 w-full shrink-0 mt-4" />
                
                {loadingMore && (
                  <div className="mt-4">
                    {viewMode === 'gallery' ? <InventorySkeletonGrid /> : <InventorySkeletonList />}
                  </div>
                )}
                
                {hasMore && !loadingMore && (
                  <button 
                    onClick={loadMore}
                    className="w-full py-4 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] rounded shrink-0 mt-4"
                  >
                    {tr('Load more')}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <ArchiveItemDrawer
        item={selectedItem}
        finance={selectedFinance}
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        onNext={handleNext}
        onPrev={handlePrev}
        hasNext={selectedIndex >= 0 && selectedIndex < items.length - 1}
        hasPrev={selectedIndex > 0}
      />
    </div>
  );
};

export const ArchivedView: React.FC = () => {
  const user = useAtomValue(userAtom);
  const isFinanceRole = user?.role === 'Developer' || user?.role === 'Admin';

  if (!isFinanceRole) {
    return <Gate />;
  }

  return <InnerArchivedView isFinanceRole={isFinanceRole} />;
};
