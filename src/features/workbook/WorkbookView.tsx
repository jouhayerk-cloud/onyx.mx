import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { workbookActiveTabAtom, exchangeRateAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg } from '../../lib/utils';
import { destinationsConfig } from '../../lib/paymentConfig';
import type { PaymentDestination } from '../../lib/Types';

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────

const StatusPill: React.FC<{ label: string; active: boolean; color: string }> = ({ label, active, color }) => (
    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all duration-300 ${active
        ? 'text-black shadow-[0_0_10px_rgba(0,0,0,0.2)]'
        : 'bg-white/5 text-white/10'
        }`} style={active ? { backgroundColor: color, boxShadow: `0 0 15px ${color}33` } : {}}>
        {label}
    </span>
);

const fmtMXN = (v: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(v || 0);
const fmtUSD = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v || 0);
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';

// ─── PANELS ───────────────────────────────────────────────────────────────────

// 1. INVENTORY & ARCHIVE (Shared Logic)
const InventoryPanel: React.FC<{ docs: any[]; exchangeRate: number; isArchive?: boolean; onRefresh: () => void }> = ({ docs, exchangeRate, isArchive, onRefresh }) => {
    const [search, setSearch] = useState('');
    const [filterVendor, setFilterVendor] = useState('ALL');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const filtered = useMemo(() => docs.filter(d => {
        if (filterVendor !== 'ALL' && d.item_id !== filterVendor) return false;
        if (search && !`${d.item_number} ${d.description} ${d.shape}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    }), [docs, filterVendor, search]);

    const handleStatusToggle = async (id: string, field: string, val: boolean) => {
        const { error } = await supabase.from('inventory').update({ [field]: val }).eq('id', id);
        if (error) toast.error(error.message);
        else onRefresh();
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex gap-3 p-3 items-center shrink-0">
                <div className="relative flex-1 max-w-sm">
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter items..." className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2 text-xs text-white/80 focus:ring-1 focus:ring-[var(--main-color)] transition-all" />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-20"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                </div>
                <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold tracking-widest text-white/60 focus:outline-none">
                    <option value="ALL">ALL VENDORS</option>
                    {[...new Set(docs.map(d => d.item_id))].sort().map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <div className="ml-auto text-[10px] uppercase font-black tracking-widest text-white/20">{filtered.length} Items Listed</div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3">
                <div className="rounded-2xl border border-white/5 overflow-hidden bg-white/[0.01] backdrop-blur-md">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/[0.02]">
                                <th className="px-4 py-3 w-12 text-center">VND</th>
                                <th className="px-4 py-3 w-20">TAG ID</th>
                                <th className="px-4 py-3">Description</th>
                                <th className="px-4 py-3 text-right">Value (MXN)</th>
                                {!isArchive ? <th className="px-4 py-3 text-center w-64">Status / Workflow</th> : <th className="px-4 py-3 text-right w-24">Archived</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {filtered.map(item => {
                                const vColor = vendors[item.item_id as keyof typeof vendors]?.color || '#555';
                                return (
                                    <tr key={item.id} className="hover:bg-white/[0.04] group transition-all duration-200">
                                        <td className="px-4 py-2 text-center">
                                            <div className="inline-flex w-7 h-6 rounded-md items-center justify-center text-[10px] font-black shadow-lg" style={{ backgroundColor: vColor, color: getTextColorForBg(vColor) }}>
                                                {item.item_id}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 font-mono text-[10px] text-white/40 group-hover:text-white/80 transition-colors uppercase">{item.item_number}</td>
                                        <td className="px-4 py-2">
                                            <div className="text-xs text-white/70 group-hover:text-white transition-colors">{item.description || item.shape || 'Untitled Item'}</div>
                                            <div className="text-[9px] text-white/20 font-mono mt-0.5">{item.material || 'Standard Material'}</div>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <div className="font-mono text-xs font-bold text-white/60 tracking-tighter">{fmtMXN(item.price_mxn)}</div>
                                            <div className="text-[8px] text-white/20 font-mono">{fmtUSD(item.price_mxn / exchangeRate)}</div>
                                        </td>
                                        {!isArchive ? (
                                            <td className="px-4 py-2">
                                                <div className="flex justify-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleStatusToggle(item.id, 'in_production', !item.in_production)} title="Production"><StatusPill label="PROD" active={item.in_production} color="#FFED00" /></button>
                                                    <button onClick={() => handleStatusToggle(item.id, 'ready', !item.ready)} title="Ready"><StatusPill label="READY" active={item.ready} color="#8DC63F" /></button>
                                                    <button onClick={() => handleStatusToggle(item.id, 'paid', !item.paid)} title="Paid"><StatusPill label="PAID" active={item.paid} color="#00AEEF" /></button>
                                                    <button onClick={() => handleStatusToggle(item.id, 'shipped', !item.shipped)} title="Shipped"><StatusPill label="SHIP" active={item.shipped} color="#6BCEBB" /></button>
                                                </div>
                                            </td>
                                        ) : (
                                            <td className="px-4 py-2 text-right font-mono text-[9px] text-white/30 italic">{fmtDate(item.pay_date || item.timestamp)}</td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// 2. PAYMENTS & PAY LOG
const PaymentsPanel: React.FC<{ docs: any[]; finDocs: any[]; exchangeRate: number; onRefresh: () => void }> = ({ docs, finDocs, exchangeRate, onRefresh }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [dest, setDest] = useState<PaymentDestination | null>(null);
    const [filterVendor, setFilterVendor] = useState('ALL');

    const unpaid = useMemo(() => docs.filter(d => (filterVendor === 'ALL' || d.item_id === filterVendor) && !d.paid), [docs, filterVendor]);
    const totalSelected = unpaid.filter(u => selected.has(u.id)).reduce((s, u) => s + (u.price_mxn || 0), 0);

    const toggle = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const handleRequest = async () => {
        if (!dest || selected.size === 0) return;
        const ids = [...selected];
        const commission = destinationsConfig[dest].calculateCommission(totalSelected);
        const { error } = await supabase.from('finance').insert({
            amount: (totalSelected + commission) / exchangeRate, description: `Batch Payment: ${ids.length} Tags via ${dest}`, vendor_id: filterVendor !== 'ALL' ? filterVendor : null, status: 'Requested', destination: dest, related_ids: ids
        });
        if (!error) {
            await supabase.from('inventory').update({ pay_req: true }).in('id', ids);
            setSelected(new Set());
            onRefresh();
            toast.success('Funds Requested Successfully');
        }
    };

    return (
        <div className="flex h-full p-3 gap-3">
            <div className="flex-1 flex flex-col rounded-2xl border border-white/5 bg-white/[0.01] backdrop-blur-xl overflow-hidden shadow-2xl">
                <div className="flex p-3 bg-white/[0.03] border-b border-white/5 gap-3 items-center">
                    <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] font-bold tracking-widest text-white/70">
                        <option value="ALL">ALL VENDORS</option>
                        {[...new Set(docs.filter(d => !d.paid).map(d => d.item_id))].sort().map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <button onClick={() => setSelected(new Set(unpaid.map(u => u.id)))} className="text-[10px] uppercase font-bold text-white/30 hover:text-[var(--main-color)] transition-colors px-2">Select All Available</button>
                    <div className="ml-auto text-[10px] text-white/20 font-mono uppercase tracking-widest">{selected.size} / {unpaid.length} Selected</div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {unpaid.map(u => (
                        <div key={u.id} onClick={() => toggle(u.id)} className={`flex items-center gap-4 px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/[0.04] transition-all ${selected.has(u.id) ? 'bg-[var(--main-color)]/5' : ''}`}>
                            <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all ${selected.has(u.id) ? 'bg-[var(--main-color)] border-[var(--main-color)] shadow-[0_0_10px_rgba(127,187,255,0.3)]' : 'border-white/10 group-hover:border-white/30'}`}>
                                {selected.has(u.id) && <svg className="w-3 h-3 text-black" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                            </div>
                            <div className="flex-1">
                                <div className="text-xs font-bold text-white/80">{u.item_id} <span className="font-mono text-white/20 ml-1">{u.item_number}</span></div>
                                <div className="text-[10px] text-white/40 line-clamp-1 italic">{u.description || u.shape}</div>
                            </div>
                            <div className="text-right">
                                <div className="font-mono text-xs font-bold text-white">{fmtMXN(u.price_mxn)}</div>
                                <div className="text-[9px] text-white/20 font-mono">{fmtUSD(u.price_mxn / exchangeRate)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="w-72 flex flex-col gap-4">
                <div className="rounded-2xl border border-white/5 bg-white/[0.01] backdrop-blur-3xl p-5 shadow-2xl flex flex-col gap-6">
                    <div>
                        <div className="text-[10px] uppercase font-black tracking-[0.2em] text-white/30 mb-2">Checkout Summary</div>
                        <div className="text-3xl font-mono font-black text-white leading-none tracking-tighter">{fmtMXN(totalSelected)}</div>
                        <div className="text-[11px] font-mono text-white/30 mt-1">Approx. {fmtUSD(totalSelected / exchangeRate)} USD</div>
                    </div>

                    <div className="space-y-3">
                        <div className="text-[9px] uppercase font-black tracking-widest text-white/20">Select Payout Network</div>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(destinationsConfig).map(([k, c]) => (
                                <button key={k} onClick={() => setDest(k as any)} className={`group p-3 border rounded-xl transition-all flex flex-col items-center justify-center gap-2 ${dest === k ? 'bg-[var(--main-color)]/20 border-[var(--main-color)] shadow-[0_0_20px_rgba(127,187,255,0.15)]' : 'border-white/5 hover:border-white/20 hover:bg-white/[0.03]'}`}>
                                    <img src={c.icon} className={`h-7 object-contain grayscale transition-all ${dest === k ? 'grayscale-0 scale-110' : 'group-hover:grayscale-0'}`} />
                                    <span className="text-[9px] font-black tracking-tighter text-white/40 group-hover:text-white/80">{c.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleRequest} disabled={!dest || selected.size === 0} className="w-full py-3.5 rounded-xl bg-[var(--main-color)] text-black font-black text-[11px] tracking-[0.1em] shadow-[0_4px_20px_rgba(127,187,255,0.4)] disabled:opacity-20 disabled:shadow-none hover:scale-[1.02] active:scale-[0.98] transition-all">
                        INITIATE TRANSFER
                    </button>
                </div>

                <div className="flex-1 rounded-2xl border border-white/5 bg-white/[0.01] backdrop-blur-md p-4 overflow-hidden flex flex-col">
                    <div className="text-[9px] uppercase font-black tracking-widest text-white/20 mb-3 ml-1">Fees & Commissions</div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-[11px]"><span className="text-white/30">Batch Value</span><span className="text-white/80 font-mono">{fmtMXN(totalSelected)}</span></div>
                        {dest && <div className="flex justify-between text-[11px]"><span className="text-white/30">MGP Network Fee</span><span className="text-[#8DC63F] font-mono">+{fmtMXN(destinationsConfig[dest].calculateCommission(totalSelected))}</span></div>}
                        <div className="border-t border-white/5 pt-2 flex justify-between text-xs font-bold"><span className="text-white">To Be Funded</span><span className="text-[var(--main-color)] font-mono">{fmtMXN(totalSelected + (dest ? destinationsConfig[dest].calculateCommission(totalSelected) : 0))}</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 3. PRODUCTION
const ProductionPanel: React.FC<{ docs: any[] }> = ({ docs }) => (
    <div className="h-full p-4 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {docs.map(p => {
                const color = vendors[p.vendor_id as keyof typeof vendors]?.color || '#555';
                return (
                    <div key={p.id} className="glass-panel p-5 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-4 group hover:bg-white/[0.05] transition-all shadow-xl backdrop-blur-xl">
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 opacity-80" style={{ backgroundColor: color }} />
                        <div className="flex justify-between items-start">
                            <span className="px-3 py-1 rounded-full text-[10px] font-black text-black shadow-md tracking-tighter" style={{ backgroundColor: color }}>{p.vendor_id}</span>
                            <div className="text-right">
                                <div className="text-sm font-black text-white/90 font-mono">{fmtMXN(p.total)}</div>
                                <div className="text-[9px] text-white/30 uppercase font-black tracking-widest">{p.quantity} Units Total</div>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-white group-hover:text-[var(--main-color)] transition-colors line-clamp-2">{p.description}</h4>
                            <div className="mt-1 font-mono text-[10px] text-white/20 uppercase tracking-widest">ORDER TAG: {p.tag_id}</div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-black tracking-tighter text-white/30 uppercase"><span>Progress</span><span>{Math.round(p.progress || 0)}% Complete</span></div>
                            <div className="h-2 w-full bg-white/5 rounded-full p-0.5 border border-white/5"><div className="h-full rounded-full transition-all duration-1000 bg-gradient-to-r from-[var(--main-color)] to-[#AEE6F5]" style={{ width: `${p.progress}%`, boxShadow: `0 0 10px ${vendors[p.vendor_id]?.color || '#7FBBFF'}33` }} /></div>
                        </div>
                        <div className="flex items-center justify-between border-t border-white/5 pt-3">
                            <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase font-bold">Advance Paid</span><span className="text-xs font-mono font-bold text-[#8DC63F]">{fmtMXN(p.advance)}</span></div>
                            <div className="flex flex-col items-end"><span className="text-[8px] text-white/20 uppercase font-bold">Estimated Ready</span><span className="text-xs font-mono font-bold text-white/60">{fmtDate(p.ready_date)}</span></div>
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

// 4. CRATES (LOGISTICS)
const CratesPanel: React.FC<{ docs: any[] }> = ({ docs }) => (
    <div className="flex flex-col h-full bg-black/20 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar">
            {docs.map(c => {
                const color = vendors[c.vendor_id as keyof typeof vendors]?.color || '#555';
                return (
                    <div key={c.id} className="glass-panel p-4 rounded-xl border border-white/5 flex flex-col gap-2 hover:bg-white/[0.02] transition-colors relative">
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: color }} />
                        <div className="flex justify-between items-center"><span className="px-1.5 py-0.5 rounded text-[8px] font-bold text-black" style={{ backgroundColor: color }}>{c.vendor_id}</span><span className="text-[10px] text-white/40 font-mono">{fmtDate(c.date)}</span></div>
                        <div className="text-xs font-bold text-white line-clamp-1">{c.description}</div>
                        <div className="flex gap-4 py-2 border-y border-white/5 mt-1 justify-between">
                            <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase">Weight</span><span className="text-[10px] font-mono font-bold text-white">{c.weight_kg}kg</span></div>
                            <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase">Units</span><span className="text-[10px] font-mono font-bold text-white">{c.quantity}</span></div>
                            <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase">Cost</span><span className="text-[10px] font-mono font-bold text-[#8DC63F]">{fmtMXN(c.cost_mxn)}</span></div>
                        </div>
                        <div className="text-[9px] text-white/30 font-mono">{c.l_cm}×{c.w_cm}×{c.d_cm}cm</div>
                    </div>
                );
            })}
        </div>
    </div>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const WorkbookView: React.FC = () => {
    const [activeTab, setActiveTab] = useAtom(workbookActiveTabAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();

    const [data, setData] = useState<{ inv: any[], fin: any[], prod: any[], log: any[] }>({ inv: [], fin: [], prod: [], log: [] });
    const [ver, setVer] = useState(0);
    const [isSyncing, setIsSyncing] = useState(true);
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        if (!db) return;

        let invTimer: any, finTimer: any, prodTimer: any, logTimer: any;

        const subs = [
            db.inventory.find().$.subscribe(d => {
                clearTimeout(invTimer);
                invTimer = setTimeout(() => {
                    const items = d.map(x => x.toJSON());
                    setData(p => ({ ...p, inv: items }));
                    if (items.length > 0) setIsSyncing(false);
                }, 200);
            }),
            db.finance.find().$.subscribe(d => {
                clearTimeout(finTimer);
                finTimer = setTimeout(() => {
                    setData(p => ({ ...p, fin: d.map(x => x.toJSON()) }));
                }, 200);
            }),
            db.production.find().$.subscribe(d => {
                clearTimeout(prodTimer);
                prodTimer = setTimeout(() => {
                    setData(p => ({ ...p, prod: d.map(x => x.toJSON()) }));
                }, 200);
            }),
            db.logistics.find().$.subscribe(d => {
                clearTimeout(logTimer);
                logTimer = setTimeout(() => {
                    setData(p => ({ ...p, log: d.map(x => x.toJSON()) }));
                }, 200);
            })
        ];

        const timeoutTimer = setTimeout(() => setIsSyncing(false), 8000);

        return () => {
            subs.forEach(s => s.unsubscribe());
            [invTimer, finTimer, prodTimer, logTimer, timeoutTimer].forEach(clearTimeout);
        };
    }, [db, ver]);

    const docs326 = useMemo(() => data.inv.filter(d => d.workbook === '326' || !d.workbook), [data.inv]);
    const docs825 = useMemo(() => data.inv.filter(d => d.workbook === '825'), [data.inv]);
    const supplies = useMemo(() => data.fin.filter(d => d.category === 'Supplies'), [data.fin]);
    const paylog = useMemo(() => data.fin.filter(d => d.type === 'Payment' || d.category === 'Log'), [data.fin]);

    const isEmpty = data.inv.length === 0;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-transparent">
            {/* Header Tabs Area */}
            <div className="flex items-end px-4 pt-4 gap-2 border-b border-white/[0.03] bg-white/[0.02] backdrop-blur-xl shrink-0">
                {[
                    { id: 'inventory', label: 'WORKBOOK 326', badge: docs326.filter(d => !d.shipped).length },
                    { id: 'archive', label: 'ARCHIVE 825', badge: null },
                    { id: 'payments', label: 'FINANCE & PAY', badge: docs326.filter(d => !d.paid).length },
                    { id: 'production', label: 'PRODUCTION', badge: data.prod.length },
                    { id: 'crates', label: 'LOGISTICS', badge: data.log.length },
                    { id: 'supplies', label: 'SUPPLIES', badge: supplies.length }
                    // Removed redundant Pay Log tab, integrated into Finance
                ].map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`px-5 py-3 text-[9px] font-black tracking-[0.2em] transition-all rounded-t-xl border-t border-x border-transparent ${activeTab === t.id ? 'text-white bg-white/5 border-white/5 !border-b-transparent shadow-[0_-10px_30px_rgba(255,255,255,0.03)]' : 'text-white/20 hover:text-white/50 hover:bg-white/[0.02]'}`}>
                        {t.label}
                        {!!t.badge && t.badge > 0 && <span className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-white/50 text-[7px] font-mono">{t.badge}</span>}
                    </button>
                ))}

                {isSyncing && (
                    <div className="ml-auto mb-3 flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--main-color)] animate-ping" />
                        <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.1em]">Optimizing Local Cache...</span>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-hidden relative">
                {/* Background Texture/Gradient Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-20 bg-gradient-to-tr from-transparent via-[var(--main-color)]/5 to-transparent shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]" />

                {!isSyncing && isEmpty ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20 gap-4">
                        <svg className="w-12 h-12 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                        <div className="text-sm font-black tracking-widest uppercase opacity-40">No records found. Sync failed or DB empty.</div>
                        <button onClick={refresh} className="px-6 py-2 rounded-full border border-white/10 text-[9px] font-black hover:bg-white/5 uppercase tracking-[0.2em] transition-all">Force Cloud Fetch</button>
                    </div>
                ) : (
                    <div className="h-full relative z-10 animate-in fade-in zoom-in-95 duration-500">
                        {activeTab === 'inventory' && <InventoryPanel docs={docs326} exchangeRate={exchangeRate} onRefresh={refresh} />}
                        {activeTab === 'archive' && <InventoryPanel docs={docs825} exchangeRate={exchangeRate} isArchive onRefresh={refresh} />}
                        {activeTab === 'payments' && <PaymentsPanel docs={data.inv} finDocs={data.fin} exchangeRate={exchangeRate} onRefresh={refresh} />}
                        {activeTab === 'production' && <ProductionPanel docs={data.prod} />}
                        {/* More panels can follow similar refined patterns */}
                        {activeTab === 'crates' && <CratesPanel docs={data.log} />}
                        {activeTab === 'supplies' && <InventoryPanel docs={supplies} exchangeRate={exchangeRate} isArchive onRefresh={refresh} />}
                    </div>
                )}
            </div>
        </div>
    );
};
