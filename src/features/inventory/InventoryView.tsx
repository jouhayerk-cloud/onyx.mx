import React from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { inventorySubTabAtom, exchangeRateAtom, userAtom, workbookViewModeAtom, workbookDensityAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { CatalogMarketView } from '../catalog/CatalogMarketView';
import { AcquisitionsView } from '../dashboard/AcquisitionsView';
import { useState, useEffect, useMemo, useCallback } from 'react';

// Import panels from WorkbookView (they're not exported, so we replicate minimal versions here)
// The full InventoryPanel and ProductionPanel logic stays in WorkbookView.tsx
// We import the WorkbookView and use its sub-panels via the tab atom

const SUB_TABS = [
    { id: 'catalog' as const, label: 'CATALOG', color: '#6BCEBB', icon: '📦' },
    { id: 'production' as const, label: 'PRODUCTION', color: '#FFED00', icon: '⚙️' },
    { id: 'acquisitions' as const, label: 'ACQUISITIONS', color: '#F7941D', icon: '🏷️' },
    { id: 'archive' as const, label: 'ARCHIVE', color: '#a9d08e', icon: '📁' },
];

export const InventoryView: React.FC = () => {
    const [activeTab, setActiveTab] = useAtom(inventorySubTabAtom);
    const user = useAtomValue(userAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();

    const [data, setData] = useState<{ inv: any[], prod: any[] }>({ inv: [], prod: [] });
    const [isSyncing, setIsSyncing] = useState(true);

    useEffect(() => {
        const timeout = setTimeout(() => setIsSyncing(false), 8000);
        if (!db) return () => clearTimeout(timeout);
        let invT: any, prodT: any;
        const subs = [
            db.inventory.find().$.subscribe(d => {
                clearTimeout(invT);
                invT = setTimeout(() => { setData(p => ({ ...p, inv: d.map(x => x.toJSON()) })); setIsSyncing(false); }, 200);
            }),
            db.production.find().$.subscribe(d => {
                clearTimeout(prodT);
                prodT = setTimeout(() => { setData(p => ({ ...p, prod: d.map(x => x.toJSON()) })); }, 200);
            }),
        ];
        return () => { subs.forEach(s => s.unsubscribe());[invT, prodT, timeout].forEach(clearTimeout); };
    }, [db]);

    const docs = useMemo(() => {
        if (user?.role === 'Vendor') return data.inv.filter(d => d.item_id === user.id);
        return data.inv;
    }, [data.inv, user]);

    const docs326 = useMemo(() => docs.filter(d => d.workbook === '326' || !d.workbook), [docs]);
    const docs825 = useMemo(() => docs.filter(d => d.workbook === '825'), [docs]);

    const fmtUSD = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Sub-tab bar */}
            <div className="flex items-center gap-2 px-6 py-3 bg-white/[0.02] backdrop-blur-xl border-b border-white/[0.05] shrink-0">
                {SUB_TABS.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${activeTab === t.id
                            ? 'text-black shadow-lg scale-105' : 'bg-white/5 text-white/30 hover:text-white/60 hover:bg-white/[0.08]'}`}
                        style={activeTab === t.id ? { backgroundColor: t.color } : {}}>
                        <span className="mr-1.5">{t.icon}</span>{t.label}
                    </button>
                ))}
                <div className="ml-auto flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Items</span>
                        <span className="text-lg font-mono font-black text-white">{docs326.length}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Value</span>
                        <span className="text-lg font-mono font-black text-[var(--main-color)]">{fmtUSD(docs326.reduce((a, b) => a + (b.price_mxn || 0), 0) / exchangeRate)}</span>
                    </div>
                </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'catalog' && <CatalogMarketView />}
                {activeTab === 'acquisitions' && <AcquisitionsView />}
                {activeTab === 'production' && (
                    <ProductionMiniPanel docs={data.prod} />
                )}
                {activeTab === 'archive' && (
                    <ArchiveMiniPanel docs={docs825} exchangeRate={exchangeRate} />
                )}
            </div>
        </div>
    );
};

// Minimal Production Panel (reads from RxDB subscription above)
const ProductionMiniPanel: React.FC<{ docs: any[] }> = ({ docs }) => (
    <div className="h-full overflow-y-auto custom-scrollbar p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {docs.map(d => {
                const color = vendors[d.vendor_id as keyof typeof vendors]?.color || '#555';
                return (
                    <div key={d.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-2 relative hover:bg-white/[0.04] transition-colors">
                        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: color }} />
                        <div className="flex justify-between items-center">
                            <span className="px-2 py-0.5 rounded text-[8px] font-black text-black" style={{ backgroundColor: color }}>{d.vendor_id || '—'}</span>
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{d.status || 'Active'}</span>
                        </div>
                        <div className="text-xs font-bold text-white line-clamp-1">{d.description || 'Production Order'}</div>
                        <div className="w-full bg-white/5 rounded-full h-2 mt-1">
                            <div className="h-2 rounded-full bg-[#FFED00] transition-all" style={{ width: `${d.progress || 0}%` }} />
                        </div>
                        <div className="text-[9px] font-mono text-white/30 text-right">{d.progress || 0}%</div>
                    </div>
                );
            })}
            {docs.length === 0 && <div className="col-span-3 py-16 text-center text-white/10 text-sm font-black tracking-widest">NO PRODUCTION ORDERS</div>}
        </div>
    </div>
);

// Minimal Archive Panel
const fmtMXN = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const ArchiveMiniPanel: React.FC<{ docs: any[]; exchangeRate: number }> = ({ docs, exchangeRate }) => {
    const [search, setSearch] = useState('');
    const filtered = useMemo(() => {
        if (!search) return docs;
        const q = search.toLowerCase();
        return docs.filter(d => (d.name || '').toLowerCase().includes(q) || (d.id || '').toLowerCase().includes(q) || (d.vendor_id || '').toLowerCase().includes(q));
    }, [docs, search]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-white/5 shrink-0">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search archive..." className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 flex-1 max-w-md" />
                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{filtered.length} items</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead><tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/[0.02] sticky top-0">
                        <th className="px-4 py-3">ID</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3 text-right">Price (MXN)</th><th className="px-4 py-3">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-white/[0.03]">
                        {filtered.map(d => {
                            const color = vendors[d.vendor_id as keyof typeof vendors]?.color || '#555';
                            return (
                                <tr key={d.id} className="hover:bg-white/[0.04] transition-all">
                                    <td className="px-4 py-2 font-mono text-[10px] text-white/40">{d.id}</td>
                                    <td className="px-4 py-2 text-xs text-white/70">{d.name || '—'}</td>
                                    <td className="px-4 py-2">{d.vendor_id ? <span className="px-1.5 py-0.5 rounded text-[8px] font-black text-black" style={{ backgroundColor: color }}>{d.vendor_id}</span> : '—'}</td>
                                    <td className="px-4 py-2 text-right font-mono text-xs text-white/60">{fmtMXN(d.price_mxn)}</td>
                                    <td className="px-4 py-2 text-[9px] text-white/40">{d.status || '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
