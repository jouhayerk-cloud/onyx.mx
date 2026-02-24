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
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide transition-all ${active
        ? 'text-black ring-1 ring-inset ring-black/10'
        : 'opacity-25 bg-white/5 text-white/30'
        }`} style={active ? { backgroundColor: color } : {}}>
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
        <div className="flex flex-col h-full bg-black/20">
            <div className="flex gap-2 p-2 border-b border-white/5 shrink-0 bg-white/[0.02]">
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none w-48" />
                <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none">
                    <option value="ALL">All Vendors</option>
                    {[...new Set(docs.map(d => d.item_id))].sort().map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <div className="ml-auto text-[10px] text-white/30 flex items-center">{filtered.length} Items</div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#111] z-10 border-b border-white/10">
                        <tr className="text-[9px] uppercase tracking-widest text-white/40">
                            <th className="px-3 py-2 w-10">VND</th>
                            <th className="px-3 py-2 w-12">#</th>
                            <th className="px-3 py-2">Description</th>
                            <th className="px-3 py-2 text-right">MXN</th>
                            {!isArchive && <th className="px-3 py-2 text-center w-64">Workflow</th>}
                            {isArchive && <th className="px-3 py-2 text-right w-24">Date</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filtered.map(item => {
                            const vColor = vendors[item.item_id as keyof typeof vendors]?.color || '#555';
                            return (
                                <tr key={item.id} className="hover:bg-white/[0.03] group transition-colors">
                                    <td className="px-3 py-1.5"><div className="w-6 h-5 rounded flex items-center justify-center text-[9px] font-black" style={{ backgroundColor: vColor, color: getTextColorForBg(vColor) }}>{item.item_id}</div></td>
                                    <td className="px-3 py-1.5 font-mono text-[10px] text-white/30">{item.item_number}</td>
                                    <td className="px-3 py-1.5 text-xs text-white/70">{item.description || item.shape}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-[10px] text-white/60">{fmtMXN(item.price_mxn)}</td>
                                    {!isArchive && (
                                        <td className="px-3 py-1.5">
                                            <div className="flex justify-center gap-1">
                                                <button onClick={() => handleStatusToggle(item.id, 'in_production', !item.in_production)}><StatusPill label="PROD" active={item.in_production} color="#FFED00" /></button>
                                                <button onClick={() => handleStatusToggle(item.id, 'ready', !item.ready)}><StatusPill label="READY" active={item.ready} color="#8DC63F" /></button>
                                                <button onClick={() => handleStatusToggle(item.id, 'paid', !item.paid)}><StatusPill label="PAID" active={item.paid} color="#00AEEF" /></button>
                                                <button onClick={() => handleStatusToggle(item.id, 'shipped', !item.shipped)}><StatusPill label="SHIP" active={item.shipped} color="#6BCEBB" /></button>
                                            </div>
                                        </td>
                                    )}
                                    {isArchive && <td className="px-3 py-1.5 text-right font-mono text-[9px] text-white/30">{fmtDate(item.pay_date || item.timestamp)}</td>}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
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
            amount: (totalSelected + commission) / exchangeRate, description: `Request for ${ids.length} items via ${dest}`, vendor_id: filterVendor !== 'ALL' ? filterVendor : null, status: 'Requested', destination: dest, related_ids: ids
        });
        if (!error) { await supabase.from('inventory').update({ pay_req: true }).in('id', ids); setSelected(new Set()); onRefresh(); toast.success('Payment Requested'); }
    };

    return (
        <div className="flex h-full bg-black/20">
            <div className="flex-1 flex flex-col border-r border-white/5 overflow-hidden">
                <div className="flex p-2 bg-white/[0.02] border-b border-white/5 gap-2">
                    <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white">
                        <option value="ALL">All Vendors</option>
                        {[...new Set(docs.filter(d => !d.paid).map(d => d.item_id))].sort().map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <button onClick={() => setSelected(new Set(unpaid.map(u => u.id)))} className="text-[10px] text-white/30 hover:text-white px-2">Select All</button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {unpaid.map(u => (
                        <div key={u.id} onClick={() => toggle(u.id)} className={`flex items-center gap-3 px-3 py-2 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${selected.has(u.id) ? 'bg-[var(--main-color)]/10' : ''}`}>
                            <div className={`w-3.5 h-3.5 rounded border ${selected.has(u.id) ? 'bg-[var(--main-color)] border-[var(--main-color)]' : 'border-white/20'}`} />
                            <div className="flex-1 text-xs text-white/70">{u.item_id} {u.item_number} - {u.description}</div>
                            <div className="font-mono text-[10px] text-white/40">{fmtMXN(u.price_mxn)}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="w-64 bg-white/[0.01] flex flex-col p-4 gap-4">
                <div><div className="text-[9px] uppercase tracking-widest text-white/30 mb-1">Total Selected</div><div className="text-2xl font-mono font-bold text-white">{fmtMXN(totalSelected)}</div></div>
                <div className="grid grid-cols-2 gap-2">
                    {Object.entries(destinationsConfig).map(([k, c]) => (
                        <button key={k} onClick={() => setDest(k as any)} className={`p-2 border rounded transition-all flex flex-col items-center ${dest === k ? 'bg-[var(--main-color)]/20 border-[var(--main-color)]' : 'border-white/10 hover:border-white/20'}`}>
                            <img src={c.icon} className="h-6 object-contain mb-1" /><span className="text-[8px] text-white/40">{c.name}</span>
                        </button>
                    ))}
                </div>
                <button onClick={handleRequest} disabled={!dest || selected.size === 0} className="mt-auto w-full py-2 rounded bg-[var(--main-color)] text-black font-bold text-xs disabled:opacity-20">REQUEST PAYMENT</button>
            </div>
        </div>
    );
};

// 3. PRODUCTION
const ProductionPanel: React.FC<{ docs: any[] }> = ({ docs }) => (
    <div className="flex flex-col h-full bg-black/20 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar">
            {docs.map(p => {
                const color = vendors[p.vendor_id as keyof typeof vendors]?.color || '#555';
                return (
                    <div key={p.id} className="glass-panel p-4 rounded-xl border border-white/5 flex flex-col gap-3 group relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: color }} />
                        <div className="flex justify-between">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-black" style={{ backgroundColor: color }}>{p.vendor_id}</span>
                            <span className="font-mono text-xs text-white/80">{fmtMXN(p.total)}</span>
                        </div>
                        <h4 className="text-xs font-bold text-white truncate group-hover:text-[#FFED00] transition-colors">{p.description}</h4>
                        <div className="flex justify-between text-[10px] text-white/40"><span>Adv: {fmtMXN(p.advance)}</span><span>Qty: {p.quantity}</span></div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-1"><div className="h-full bg-[#FFED00] transition-all" style={{ width: `${p.progress}%` }} /></div>
                        <div className="text-[9px] text-white/20 font-mono text-right mt-1">Ready: {fmtDate(p.ready_date)}</div>
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
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        if (!db) return;
        const subs = [
            db.inventory.find().$.subscribe(d => setData(p => ({ ...p, inv: d.map(x => x.toJSON()) }))),
            db.finance.find().$.subscribe(d => setData(p => ({ ...p, fin: d.map(x => x.toJSON()) }))),
            db.production.find().$.subscribe(d => setData(p => ({ ...p, prod: d.map(x => x.toJSON()) }))),
            db.logistics.find().$.subscribe(d => setData(p => ({ ...p, log: d.map(x => x.toJSON()) })))
        ];
        return () => subs.forEach(s => s.unsubscribe());
    }, [db, ver]);

    const docs326 = useMemo(() => data.inv.filter(d => d.workbook === '326'), [data.inv]);
    const docs825 = useMemo(() => data.inv.filter(d => d.workbook === '825'), [data.inv]);
    const supplies = useMemo(() => data.fin.filter(d => d.category === 'Supplies'), [data.fin]);
    const paylog = useMemo(() => data.fin.filter(d => d.type === 'Payment' || d.category === 'Log'), [data.fin]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[#0A0A0A]">
            <div className="flex items-center px-2 pt-1 gap-1 border-b border-white/5 bg-black/40">
                {[
                    { id: 'inventory', label: '326 ACTIVE', badge: docs326.filter(d => !d.shipped).length },
                    { id: 'archive', label: '825 SHIPPED', badge: null },
                    { id: 'payments', label: 'PAYMENTS', badge: docs326.filter(d => !d.paid).length },
                    { id: 'paylog', label: 'PAY LOG', badge: data.fin.filter(f => f.status === 'Requested').length },
                    { id: 'production', label: 'PROD', badge: data.prod.length },
                    { id: 'crates', label: 'CRATES', badge: data.log.length },
                    { id: 'supplies', label: 'SUPPLIES', badge: supplies.length }
                ].map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`px-3 py-2 text-[10px] font-bold tracking-widest transition-all rounded-t-sm border-b-2 ${activeTab === t.id ? 'text-[var(--main-color)] border-[var(--main-color)] bg-white/5' : 'text-white/20 border-transparent hover:text-white/50'}`}>
                        {t.label}
                        {t.badge ? <span className="ml-1.5 px-1 py-0.5 rounded-sm bg-white/10 text-white/40 text-[8px] font-mono">{t.badge}</span> : null}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-hidden">
                {activeTab === 'inventory' && <InventoryPanel docs={docs326} exchangeRate={exchangeRate} onRefresh={refresh} />}
                {activeTab === 'archive' && <InventoryPanel docs={docs825} exchangeRate={exchangeRate} isArchive onRefresh={refresh} />}
                {activeTab === 'payments' && <PaymentsPanel docs={data.inv} finDocs={data.fin} exchangeRate={exchangeRate} onRefresh={refresh} />}
                {activeTab === 'paylog' && <InventoryPanel docs={paylog} exchangeRate={exchangeRate} isArchive onRefresh={refresh} />}
                {activeTab === 'production' && <ProductionPanel docs={data.prod} />}
                {activeTab === 'crates' && <CratesPanel docs={data.log} />}
                {activeTab === 'supplies' && <InventoryPanel docs={supplies} exchangeRate={exchangeRate} isArchive onRefresh={refresh} />}
            </div>
        </div>
    );
};
