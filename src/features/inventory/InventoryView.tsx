import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { inventorySubTabAtom, exchangeRateAtom, userAtom } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { CatalogMarketView } from '../catalog/CatalogMarketView';
import { AcquisitionsView } from '../dashboard/AcquisitionsView';
import { DatabaseViewerPanel } from './DatabaseViewerPanel';
import { numberToCypher } from '../../lib/utils';

import toast from 'react-hot-toast';

// Import panels from WorkbookView (they're not exported, so we replicate minimal versions here)
// The full InventoryPanel and ProductionPanel logic stays in WorkbookView.tsx
// We import the WorkbookView and use its sub-panels via the tab atom

const SUB_TABS = [
    { id: 'catalog' as const, label: 'CATALOG', color: '#6BCEBB', icon: '📦', roles: ['Developer', 'Admin', 'Vendor', 'Client'] },
    { id: 'production' as const, label: 'PRODUCTION', color: '#FFED00', icon: '⚙️', roles: ['Developer', 'Admin', 'Vendor'] },
    { id: 'acquisitions' as const, label: 'ACQUISITIONS', color: '#F7941D', icon: '🏷️', roles: ['Developer', 'Admin'] },
    { id: 'archive' as const, label: 'ARCHIVE', color: '#a9d08e', icon: '📁', roles: ['Developer', 'Admin', 'Client'] },
    { id: 'database' as const, label: 'DATABASE', color: '#AEE6F5', icon: '💾', roles: ['Developer'] },
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

    const docs326 = useMemo(() => docs.filter(d => String(d.workbook) === '326' || !d.workbook), [docs]);
    const docs825 = useMemo(() => docs.filter(d => String(d.workbook) === '825'), [docs]);

    const fmtUSD = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Contextual status strip ── */}
            <div className="flex items-center gap-6 px-6 py-2 bg-white/[0.015] border-b border-white/[0.04] shrink-0">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Items</span>
                    <span className="text-sm font-mono font-black text-white">{docs326.length}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Total Value</span>
                    <span className="text-sm font-mono font-black text-[var(--main-color)]">{fmtUSD(docs326.reduce((a, b) => a + (b.price_mxn || 0), 0) / exchangeRate)}</span>
                </div>
                {isSyncing && (
                    <div className="flex items-center gap-1.5 ml-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--main-color)] animate-pulse" />
                        <span className="text-[8px] text-white/20 uppercase tracking-widest font-black">Syncing</span>
                    </div>
                )}
            </div>
            {/* ── Content ── */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'catalog' && <CatalogMarketView />}
                {activeTab === 'acquisitions' && <AcquisitionsView />}
                {activeTab === 'production' && <ProductionMiniPanel docs={data.prod} />}
                {activeTab === 'archive' && <ArchiveMiniPanel docs={docs825} exchangeRate={exchangeRate} />}
                {activeTab === 'database' && user?.role === 'Developer' && <DatabaseViewerPanel db={db} />}
            </div>
        </div>
    );
};

// Full Production Panel (migrated from legacy WorkbookProductionView)
const ProductionMiniPanel: React.FC<{ docs: any[] }> = ({ docs }) => {
    const fmt = (val: any) => {
        const n = parseFloat(val);
        if (isNaN(n)) return val || '-';
        return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 });
    };

    if (docs.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-[var(--text-color-secondary)]">
                No active production orders found.
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6 relative z-10">
            <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                <h2 className="text-xs uppercase tracking-[0.2em] text-white/40 font-bold border-l-2 border-[#FFED00] pl-3">
                    Active Production <span className="text-white/20 ml-2 font-mono">[{docs.length}]</span>
                </h2>
                <div className="flex gap-4">
                    <span className="text-[10px] text-white/30 uppercase tracking-widest">v326 Operational</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {docs.map((item, i) => {
                    const vendorCode = String(item.vendor_id || '').split(' ')[0];
                    const config = vendors[vendorCode as keyof typeof vendors];
                    const color = config?.color || '#333';

                    const total = parseFloat(item.total) || 0;
                    const advance = parseFloat(item.advance) || 0;
                    const progress = item.progress || (total > 0 ? Math.min(100, (advance / total) * 100) : 0);

                    return (
                        <div key={item.id || i} className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col gap-4 hover:bg-white/[0.04] transition-colors relative overflow-hidden group bg-white/[0.02]">
                            {/* Color accent bar */}
                            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: color }}></div>

                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded text-[9px] font-bold text-black" style={{ backgroundColor: color }}>
                                            {vendorCode || '—'}
                                        </span>
                                        {item.tagId && (
                                            <span className="text-[9px] font-mono text-white/40">#{item.tagId}</span>
                                        )}
                                    </div>
                                    <h3 className="text-sm font-bold text-white mt-1 group-hover:text-[#FFED00] transition-colors line-clamp-1">
                                        {item.description || 'Unnamed Order'}
                                    </h3>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-white/30 uppercase">Total</div>
                                    <div className="text-sm font-mono font-bold text-white">{fmt(item.total)}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-[10px]">
                                <div>
                                    <div className="text-white/30 uppercase mb-1">Price Unit</div>
                                    <div className="text-white/60 font-mono">{fmt(item.price_mxn || item.price)}</div>
                                </div>
                                <div>
                                    <div className="text-white/30 uppercase mb-1">Quantity</div>
                                    <div className="text-white/60 font-mono">x {item.quantity || item.qty || 1}</div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5 mt-2">
                                <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-white/30 uppercase">Advance Payment</span>
                                    <span className="font-mono text-white/60">{fmt(item.advance)}</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[#FFED00] transition-all duration-1000"
                                        style={{ width: `${progress}%`, opacity: progress > 0 ? 1 : 0.2 }}
                                    ></div>
                                </div>
                            </div>

                            <div className="mt-2 pt-3 border-t border-white/5 flex justify-between items-center">
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-white/20 uppercase">Ready Date</span>
                                    <span className="text-xs text-white/60 font-mono">
                                        {item.readyDate ? (typeof item.readyDate === 'number' ? new Date(Math.round((item.readyDate - 25569) * 864e5)).toLocaleDateString('es-MX') : String(item.readyDate)) : 'TBD'}
                                    </span>
                                </div>
                                <button className="p-2 rounded-full hover:bg-white/10 text-white/20 hover:text-white transition-all">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Archive Panel ───────────────────────────────────────────────────────────
const fmtMXN = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const getTagTextColor = (hex: string) => {
    try {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128 ? '#fff' : '#000';
    } catch { return '#000'; }
};

// Compute landed/retail/codes from raw price_mxn and exchange rate
const calcPrices = (priceMxn: number | null | undefined, exchangeRate: number, vendorTag: string, itemNum: number | null | undefined) => {
    const costMxn = priceMxn || 0;
    if (!costMxn || !exchangeRate) return {
        costUSD: null, landedUSD: null, retailUSD: null,
        aqCode: null, landCode: null, barcode: null
    };
    const costUsd = costMxn / exchangeRate;
    const landedUsd = costUsd * 1.4;
    const retailUsd = landedUsd * 8;
    const aqRounded = Math.ceil(costUsd);
    const landRounded = Math.ceil(landedUsd);
    const suffix = String(itemNum || '').slice(-2).padStart(2, '0');
    return {
        costUSD: costUsd,
        landedUSD: landedUsd,
        retailUSD: retailUsd,
        aqCode: numberToCypher(aqRounded),
        landCode: numberToCypher(landRounded),
        barcode: `${vendorTag}825${suffix}${numberToCypher(landRounded)}`,
    };
};

const ArchiveMiniPanel: React.FC<{ docs: any[]; exchangeRate: number }> = ({ docs, exchangeRate }) => {
    const [search, setSearch] = useState('');
    const [vendorFilter, setVendorFilter] = useState('ALL');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

    // acquiredBy is the short vendor tag (EM, JM, GE, AN…)
    // item_id is a long barcode-style identifier — NOT the vendor
    const getVendor = (d: any): string => (d.acquired_by || d.item_id || '').toUpperCase().slice(0, 4);

    const presentVendors = useMemo(() => {
        const ids = new Set(docs.map(d => getVendor(d)).filter(Boolean));
        return Array.from(ids).sort() as string[];
    }, [docs]);

    const filtered = useMemo(() => {
        let result = docs;
        if (vendorFilter !== 'ALL') result = result.filter(d => getVendor(d) === vendorFilter);
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(d =>
                (d.shape || '').toLowerCase().includes(q) ||
                (d.material || '').toLowerCase().includes(q) ||
                (d.description || '').toLowerCase().includes(q) ||
                (d.acquired_by || '').toLowerCase().includes(q) ||
                (d.item_id || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [docs, vendorFilter, search]);

    const totalValueUSD = useMemo(() => exchangeRate ? filtered.reduce((a, d) => a + (d.price_mxn || 0), 0) / exchangeRate : 0, [filtered, exchangeRate]);

    return (
        <div className="flex flex-col h-full overflow-hidden">

            {/* ── Toolbar ── */}
            <div className="shrink-0 border-b border-white/5 bg-black/20">
                <div className="flex items-center gap-3 px-5 pt-3 pb-2">
                    {/* Search */}
                    <div className="relative flex-1 max-w-sm">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by shape, material, vendor…"
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white/80 placeholder-white/20 focus:outline-none focus:border-[#a9d08e]/50 transition-colors" />
                    </div>
                    {/* View toggle */}
                    <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg border border-white/5">
                        {[{ id: 'cards', label: '⊞' }, { id: 'table', label: '☰' }].map(v => (
                            <button key={v.id} onClick={() => setViewMode(v.id as any)}
                                className={`w-7 h-7 rounded-md text-sm font-bold transition-all ${viewMode === v.id ? 'bg-white/15 text-white shadow' : 'text-white/25 hover:text-white/60'
                                    }`}>{v.label}</button>
                        ))}
                    </div>
                    {/* Stats */}
                    <div className="flex flex-col items-end ml-auto gap-0.5">
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{filtered.length} / {docs.length} items</span>
                        <span className="text-[11px] font-black text-[#a9d08e]">${totalValueUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD</span>
                    </div>
                </div>

                {/* Vendor filter pills */}
                <div className="flex items-center gap-2 px-5 pb-3 flex-wrap">
                    <button onClick={() => setVendorFilter('ALL')}
                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${vendorFilter === 'ALL'
                            ? 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.08)]'
                            : 'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60'
                            }`}>ALL · {docs.length}</button>

                    {presentVendors.map(vid => {
                        const color = vendors[vid as keyof typeof vendors]?.color || '#667';
                        const tc = getTagTextColor(color);
                        const count = docs.filter(d => d.item_id === vid).length;
                        const active = vendorFilter === vid;
                        return (
                            <button key={vid} onClick={() => setVendorFilter(active ? 'ALL' : vid)}
                                className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all duration-200 ${active ? 'scale-110' : 'opacity-55 hover:opacity-100 hover:scale-105'
                                    }`}
                                style={active
                                    ? { backgroundColor: color, color: tc, boxShadow: `0 0 20px ${color}50` }
                                    : { backgroundColor: `${color}20`, color, border: `1px solid ${color}50` }
                                }>
                                {vid} · {count}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <svg className="w-12 h-12 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        <p className="text-xs font-black text-white/20 uppercase tracking-widest">No archive items match</p>
                    </div>
                ) : viewMode === 'cards' ? (
                    // ─ CARD GRID ─
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {filtered.map(d => {
                            const vid = getVendor(d);
                            const color = vendors[vid as keyof typeof vendors]?.color || '#667';
                            const tc = getTagTextColor(color);
                            const dims = [d.width_cm, d.height_cm, d.length_cm].filter(Boolean).map((v: any) => Number(v).toFixed(0)).join('×');
                            const p = calcPrices(d.price_mxn, exchangeRate, vid, d.item_number);
                            return (
                                <div key={d.id}
                                    className="flex flex-col bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] hover:border-white/[0.16] rounded-2xl overflow-hidden transition-all duration-200">
                                    <div className="h-[3px] w-full shrink-0" style={{ backgroundColor: color }} />
                                    <div className="p-3 flex flex-col gap-2 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-black text-white truncate leading-tight">{d.shape || '—'}</p>
                                                <p className="text-[10px] text-white/45 truncate">{d.material || '—'}</p>
                                            </div>
                                            <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest whitespace-nowrap"
                                                style={{ backgroundColor: color, color: tc }}>{vid || '?'}</span>
                                        </div>
                                        {d.description && (
                                            <p className="text-[10px] text-white/40 line-clamp-2 leading-relaxed">{d.description}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            {d.color && (
                                                <span className="flex items-center gap-1 text-[9px] text-white/35">
                                                    <span className="w-2.5 h-2.5 rounded-full border border-white/10 shrink-0" style={{ backgroundColor: d.color }} />
                                                    {d.color}
                                                </span>
                                            )}
                                            {dims && <span className="text-[9px] font-mono text-white/25">{dims} cm</span>}
                                            {d.weight_kg && <span className="text-[9px] font-mono text-white/25">{Number(d.weight_kg).toFixed(1)} kg</span>}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-white/5 text-white/35">AQ {p.aqCode || '—'}</span>
                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-white/5 text-white/35">LD {p.landCode || '—'}</span>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] mt-auto">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] text-white/20 uppercase tracking-wider">Retail</span>
                                                <span className="text-[10px] font-mono text-white/40">${p.retailUSD ? p.retailUSD.toFixed(0) : '—'}</span>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[8px] text-white/20 uppercase tracking-wider">Landed</span>
                                                <span className="text-[13px] font-black" style={{ color }}>${p.landedUSD ? p.landedUSD.toFixed(0) : '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    // ─ TABLE VIEW ─
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[9px] uppercase tracking-widest text-white/25 border-b border-white/5 bg-white/[0.02] sticky top-0 backdrop-blur-xl">
                                <th className="px-4 py-3">Vendor</th>
                                <th className="px-4 py-3">Shape · Material</th>
                                <th className="px-4 py-3">Color</th>
                                <th className="px-4 py-3">Dims</th>
                                <th className="px-4 py-3">AQ Code</th>
                                <th className="px-4 py-3">Landed USD</th>
                                <th className="px-4 py-3 text-right">Retail USD</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {filtered.map(d => {
                                const vid = getVendor(d);
                                const color = vendors[vid as keyof typeof vendors]?.color || '#555';
                                const tc = getTagTextColor(color);
                                const dims = [d.width_cm, d.height_cm, d.length_cm].filter(Boolean).map((v: any) => Number(v).toFixed(0)).join('×');
                                const p = calcPrices(d.price_mxn, exchangeRate, vid, d.item_number);
                                return (
                                    <tr key={d.id} className="hover:bg-white/[0.04] transition-all">
                                        <td className="px-4 py-2.5">
                                            <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                                                style={{ backgroundColor: color, color: tc }}>{vid || '?'}</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className="text-xs text-white/80 font-semibold">{d.shape || '—'}</span>
                                            {d.material && <span className="text-[10px] text-white/35 ml-1.5">· {d.material}</span>}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className="flex items-center gap-1.5 text-[10px] text-white/45">
                                                {d.color && <span className="w-3 h-3 rounded-full border border-white/10 shrink-0" style={{ backgroundColor: d.color }} />}
                                                {d.color || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 font-mono text-[10px] text-white/35">{dims || '—'}</td>
                                        <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color }}>{p.aqCode || '—'}</td>
                                        <td className="px-4 py-2.5 font-black text-[11px]" style={{ color }}>${p.landedUSD ? p.landedUSD.toFixed(0) : '—'}</td>
                                        <td className="px-4 py-2.5 text-right font-mono text-[10px] text-white/45">${p.retailUSD ? p.retailUSD.toFixed(0) : '—'}</td>
                                        <td className="px-4 py-2.5 text-[9px] text-white/30 uppercase tracking-wider">{d.status || '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
