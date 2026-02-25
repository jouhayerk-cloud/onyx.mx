import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { workbookActiveTabAtom, workbookViewModeAtom, workbookDensityAtom, exchangeRateAtom, userAtom } from '../../lib/atoms';
import { WORKBOOK_TABS, vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { getTextColorForBg } from '../../lib/utils';

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
    const user = useAtomValue(userAtom);
    const viewMode = useAtomValue(workbookViewModeAtom);
    const density = useAtomValue(workbookDensityAtom);
    const [search, setSearch] = useState('');
    const [filterVendor, setFilterVendor] = useState('ALL');
    const [selectedItem, setSelectedItem] = useState<any>(null);

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
        <div className="flex h-full overflow-hidden">
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="flex gap-3 p-3 items-center shrink-0 border-b border-white/5 bg-black/10">
                    <div className="relative flex-1 max-w-sm">
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter items..." className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2 text-xs text-white/80 focus:ring-1 focus:ring-[var(--main-color)] transition-all placeholder:text-white/10" />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-20"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                    </div>
                    {user?.role !== 'Vendor' && (
                        <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold tracking-widest text-white/60 focus:outline-none hover:bg-white/5 transition-colors">
                            <option value="ALL">ALL VENDORS</option>
                            {[...new Set(docs.map(d => d.item_id))].sort().map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    )}
                    <div className="ml-auto text-[9px] uppercase font-black tracking-widest text-white/20 whitespace-nowrap">{filtered.length} Items Listed</div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                    {viewMode === 'table' && (
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
                                            <tr key={item.id} onClick={() => setSelectedItem(item)} className={`hover:bg-white/[0.04] group transition-all duration-200 cursor-pointer ${selectedItem?.id === item.id ? 'bg-[var(--main-color)]/5 border-l-2 border-l-[var(--main-color)]' : ''}`}>
                                                <td className="px-4 py-2 text-center">
                                                    <div className="inline-flex w-7 h-6 rounded-md items-center justify-center text-[10px] font-black shadow-lg" style={{ backgroundColor: vColor, color: getTextColorForBg(vColor) }}>
                                                        {item.item_id}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 font-mono text-[10px] text-white/40 group-hover:text-white/80 transition-colors uppercase">{item.item_number}</td>
                                                <td className="px-4 py-2">
                                                    <div className="text-xs text-white/70 group-hover:text-white transition-colors">{item.description || item.shape || 'Untitled Item'}</div>
                                                    <div className="flex gap-2 items-center mt-1">
                                                        <div className="text-[9px] text-white/20 font-mono">{item.material || 'Standard Material'}</div>
                                                        {item.acquired_by && (
                                                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[8px] font-bold text-white/40" title={`Acquired at ${fmtDate(item.acquired_at)}`}>
                                                                <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                                {item.acquired_by.split('@')[0].toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    <div className="font-mono text-xs font-bold text-white/60 tracking-tighter">{fmtMXN(item.price_mxn)}</div>
                                                    <div className="text-[8px] text-white/20 font-mono">{fmtUSD(item.price_mxn / exchangeRate)}</div>
                                                </td>
                                                {!isArchive ? (
                                                    <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
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
                    )}

                    {viewMode === 'gallery' && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 animate-in fade-in slide-in-from-bottom-2">
                            {filtered.map(item => {
                                const vColor = vendors[item.item_id as keyof typeof vendors]?.color || '#555';
                                return (
                                    <div key={item.id} onClick={() => setSelectedItem(item)} className={`group relative bg-white/[0.02] border border-white/5 rounded-2xl p-3 hover:bg-white/[0.04] transition-all cursor-pointer overflow-hidden ${selectedItem?.id === item.id ? 'ring-2 ring-[var(--main-color)] ring-inset' : ''}`}>
                                        <div className="aspect-square bg-white/[0.03] rounded-xl mb-3 overflow-hidden border border-white/5 flex items-center justify-center relative">
                                            {item.generated_png_url || (item.media_urls && item.media_urls[0]) ? (
                                                <img src={item.generated_png_url || item.media_urls[0]} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
                                            ) : (
                                                <svg className="w-10 h-10 opacity-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
                                            )}
                                            <div className="absolute top-2 left-2 flex flex-col gap-1">
                                                <div className="px-1.5 py-0.5 rounded-md text-[8px] font-black shadow-lg" style={{ backgroundColor: vColor, color: getTextColorForBg(vColor) }}>{item.item_id}</div>
                                                <div className="px-1.5 py-0.5 rounded-md text-[8px] font-black bg-black/60 text-white/80 backdrop-blur-md border border-white/10 uppercase font-mono">{item.item_number}</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="text-[10px] font-bold text-white/80 line-clamp-1">{item.description || item.shape || 'Untitled'}</div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[9px] font-mono text-white/30 uppercase tracking-tighter">{item.material}</span>
                                                <span className="text-[10px] font-mono font-black text-[var(--main-color)]">{fmtUSD(item.price_mxn / exchangeRate)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {viewMode === 'kanban' && (
                        <div className="flex gap-4 h-full overflow-x-auto custom-scrollbar pb-4 min-w-max">
                            {[
                                { id: 'acq', label: 'ACQUIRED', filter: (d: any) => !d.in_production && !d.ready && !d.shipped, color: '#FFFFFF' },
                                { id: 'prod', label: 'IN PRODUCTION', filter: (d: any) => d.in_production && !d.ready && !d.shipped, color: '#FFED00' },
                                { id: 'ready', label: 'READY / QC', filter: (d: any) => d.ready && !d.shipped, color: '#8DC63F' },
                                { id: 'ship', label: 'SHIPPED', filter: (d: any) => d.shipped, color: '#6BCEBB' }
                            ].map(col => {
                                const items = filtered.filter(col.filter);
                                return (
                                    <div key={col.id} className="w-72 flex flex-col gap-3 bg-white/[0.02] border border-white/5 rounded-2xl p-3 shrink-0">
                                        <div className="flex items-center justify-between px-2 py-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col.color }} />
                                                <span className="text-[10px] font-black text-white/60 tracking-widest">{col.label}</span>
                                            </div>
                                            <span className="text-[10px] font-mono text-white/20 font-bold">{items.length}</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                            {items.map(item => (
                                                <div key={item.id} onClick={() => setSelectedItem(item)} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl hover:bg-white/5 transition-all cursor-pointer group">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-[9px] font-mono text-white/40 tracking-tighter uppercase">{item.item_id}-{item.item_number}</span>
                                                        <span className="text-[9px] font-mono font-bold text-white/20">{fmtUSD(item.price_mxn / exchangeRate)}</span>
                                                    </div>
                                                    <div className="text-[10px] text-white/70 line-clamp-2 leading-relaxed mb-2">{item.description || item.shape}</div>
                                                    <div className="flex gap-1">
                                                        {item.media_urls?.[0] && <img src={item.media_urls[0]} className="w-6 h-6 rounded bg-black/40 border border-white/10 object-cover" />}
                                                        <div className="flex-1" />
                                                        <div className="flex gap-0.5 items-center">
                                                            <div className={`w-1 h-1 rounded-full ${item.in_production ? 'bg-[#FFED00]' : 'bg-white/5'}`} />
                                                            <div className={`w-1 h-1 rounded-full ${item.ready ? 'bg-[#8DC63F]' : 'bg-white/5'}`} />
                                                            <div className={`w-1 h-1 rounded-full ${item.shipped ? 'bg-[#6BCEBB]' : 'bg-white/5'}`} />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick-Edit Side Panel */}
            <div className={`w-80 border-l border-white/5 bg-white/[0.01] backdrop-blur-2xl transition-all duration-300 ease-out flex flex-col ${selectedItem ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 absolute right-0'}`}>
                {selectedItem && (
                    <div className="flex flex-col h-full">
                        <div className="p-4 border-b border-white/5 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Detail Grid</span>
                                <h3 className="text-sm font-black text-white uppercase">{selectedItem.item_id}-{selectedItem.item_number}</h3>
                            </div>
                            <button onClick={() => setSelectedItem(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-white/20 hover:text-white transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                            <div className="aspect-square rounded-2xl border border-white/10 overflow-hidden bg-black/40">
                                <img src={selectedItem.generated_png_url || (selectedItem.media_urls && selectedItem.media_urls[0])} className="w-full h-full object-contain" />
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1.5">Description</label>
                                    <textarea
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 focus:ring-1 focus:ring-[var(--main-color)] transition-all resize-none h-20"
                                        value={selectedItem.description}
                                        onChange={e => setSelectedItem({ ...selectedItem, description: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1.5">Price (MXN)</label>
                                        <input
                                            type="number"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-white/80 focus:ring-1 focus:ring-[var(--main-color)]"
                                            value={selectedItem.price_mxn}
                                            onChange={e => setSelectedItem({ ...selectedItem, price_mxn: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1.5">Weight (KG)</label>
                                        <input
                                            type="number"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-white/80 focus:ring-1 focus:ring-[var(--main-color)]"
                                            value={selectedItem.weight_kg}
                                            onChange={e => setSelectedItem({ ...selectedItem, weight_kg: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                </div>

                                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
                                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest">Global Status Management</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => handleStatusToggle(selectedItem.id, 'in_production', !selectedItem.in_production)} className={`flex items-center justify-between p-2 rounded-lg border transition-all ${selectedItem.in_production ? 'bg-[#FFED00]/10 border-[#FFED00]/30 text-[#FFED00]' : 'bg-white/5 border-white/5 text-white/20'}`}><span className="text-[9px] font-black">PROD</span><div className={`w-1.5 h-1.5 rounded-full ${selectedItem.in_production ? 'bg-[#FFED00] animate-pulse' : 'bg-white/10'}`} /></button>
                                        <button onClick={() => handleStatusToggle(selectedItem.id, 'ready', !selectedItem.ready)} className={`flex items-center justify-between p-2 rounded-lg border transition-all ${selectedItem.ready ? 'bg-[#8DC63F]/10 border-[#8DC63F]/30 text-[#8DC63F]' : 'bg-white/5 border-white/5 text-white/20'}`}><span className="text-[9px] font-black">READY</span><div className={`w-1.5 h-1.5 rounded-full ${selectedItem.ready ? 'bg-[#8DC63F] animate-pulse' : 'bg-white/10'}`} /></button>
                                        <button onClick={() => handleStatusToggle(selectedItem.id, 'paid', !selectedItem.paid)} className={`flex items-center justify-between p-2 rounded-lg border transition-all ${selectedItem.paid ? 'bg-[#00AEEF]/10 border-[#00AEEF]/30 text-[#00AEEF]' : 'bg-white/5 border-white/5 text-white/20'}`}><span className="text-[9px] font-black">PAID</span><div className={`w-1.5 h-1.5 rounded-full ${selectedItem.paid ? 'bg-[#00AEEF] animate-pulse' : 'bg-white/10'}`} /></button>
                                        <button onClick={() => handleStatusToggle(selectedItem.id, 'shipped', !selectedItem.shipped)} className={`flex items-center justify-between p-2 rounded-lg border transition-all ${selectedItem.shipped ? 'bg-[#6BCEBB]/10 border-[#6BCEBB]/30 text-[#6BCEBB]' : 'bg-white/5 border-white/5 text-white/20'}`}><span className="text-[9px] font-black">SHIP</span><div className={`w-1.5 h-1.5 rounded-full ${selectedItem.shipped ? 'bg-[#6BCEBB] animate-pulse' : 'bg-white/10'}`} /></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-black/40 border-t border-white/5">
                            <button
                                onClick={async () => {
                                    const { id, description, price_mxn, weight_kg } = selectedItem;
                                    const { error } = await supabase.from('inventory').update({ description, price_mxn, weight_kg }).eq('id', id);
                                    if (error) toast.error(error.message);
                                    else {
                                        toast.success('Record Updated');
                                        onRefresh();
                                    }
                                }}
                                className="w-full py-3 bg-[var(--main-color)] text-black font-black text-[10px] tracking-[0.2em] rounded-xl shadow-[0_4px_20px_rgba(127,187,255,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                COMMIT CHANGES
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// 2. PRODUCTION
const ProductionPanel: React.FC<{ docs: any[] }> = ({ docs }) => {
    const user = useAtomValue(userAtom);
    const filtered = useMemo(() => {
        if (user?.role === 'Vendor') return docs.filter(d => d.vendor_id === user.id);
        return docs;
    }, [docs, user]);

    return (
        <div className="h-full p-4 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filtered.map(p => {
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
};

// 3. LOGISTICS (CRATES)
const CratesPanel: React.FC<{ docs: any[] }> = ({ docs }) => {
    const user = useAtomValue(userAtom);
    const filtered = useMemo(() => {
        if (user?.role === 'Vendor') return docs.filter(d => d.vendor_id === user.id);
        return docs;
    }, [docs, user]);

    return (
        <div className="flex flex-col h-full bg-black/20 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto custom-scrollbar">
                {filtered.map(c => {
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
};

// 4. DATABASE MANAGER (Developer Only)
const DatabasePanel: React.FC = () => {
    const db = useDatabase();
    const [collectionName, setCollectionName] = useState<'inventory' | 'finance' | 'logistics' | 'production'>('inventory');
    const [docs, setDocs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!db) return;
        setLoading(true);
        setSelectedIds(new Set()); // Reset selections on collection change
        const sub = db[collectionName].find().$.subscribe(d => {
            setDocs(d.map(x => x.toJSON()));
            setLoading(false);
        });
        return () => sub.unsubscribe();
    }, [db, collectionName]);

    const handleUpdate = async (id: string, data: any) => {
        if (!db) return;
        try {
            const { error } = await supabase.from(collectionName).update(data).eq('id', id);
            if (error) throw error;
            toast.success('Record updated in Cloud');
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this record?')) return;
        if (!db) return;
        try {
            const { error } = await supabase.from(collectionName).delete().eq('id', id);
            if (error) throw error;
            toast.success('Record deleted from Cloud');
            setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} records?`)) return;
        if (!db) return;
        try {
            const { error } = await supabase.from(collectionName).delete().in('id', Array.from(selectedIds));
            if (error) throw error;
            toast.success(`${selectedIds.size} records deleted from Cloud`);
            setSelectedIds(new Set());
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const handleSelectAll = () => {
        if (selectedIds.size === docs.length && docs.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(docs.map(d => d.id)));
        }
    };

    const toggleSelection = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleWipeLocal = async () => {
        if (!confirm('WARNING: Wiping local DB. This will reload the app and fetch fresh data from the cloud. Proceed?')) return;
        try {
            const Dexie = (await import('dexie')).default;
            await new Dexie('onyxdb').delete();
            window.location.reload();
        } catch (e: any) {
            toast.error('Failed to wipe DB: ' + e.message);
        }
    };

    if (loading) return <div className="p-10 text-white/20 animate-pulse font-black text-center tracking-[0.5em]">INITIALIZING CORE...</div>;

    const headers = docs.length > 0 ? Object.keys(docs[0]).filter(k => !k.startsWith('_')) : [];

    return (
        <div className="flex flex-col h-full bg-black/40">
            <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
                    {(['inventory', 'finance', 'logistics', 'production'] as const).map(c => (
                        <button
                            key={c}
                            onClick={() => { setCollectionName(c); setSelectedId(null); }}
                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all ${collectionName === c ? 'bg-[var(--main-color)] text-black shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                        >
                            {c.toUpperCase()}
                        </button>
                    ))}
                </div>

                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3 ml-4 animate-in fade-in">
                        <span className="text-[10px] font-black text-white/50 tracking-widest uppercase">{selectedIds.size} Selected</span>
                        <button onClick={handleBulkDelete} className="px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all flex items-center gap-1.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                            Delete Selected
                        </button>
                    </div>
                )}

                <div className="ml-auto flex items-center gap-4">
                    <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">{docs.length} Records Found</span>
                    <button onClick={handleWipeLocal} className="px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-[9px] font-black tracking-widest uppercase transition-all flex items-center gap-1.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Wipe Local DB
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar p-4">
                <div className="rounded-2xl border border-white/5 overflow-hidden bg-white/[0.01]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/[0.02]">
                                <th className="px-4 py-3 w-10 text-center">
                                    <button
                                        onClick={handleSelectAll}
                                        className="w-4 h-4 mx-auto rounded border border-white/20 flex items-center justify-center hover:border-white transition-colors"
                                    >
                                        {selectedIds.size === docs.length && docs.length > 0 && <div className="w-2 h-2 rounded-sm bg-[var(--main-color)]" />}
                                        {selectedIds.size > 0 && selectedIds.size < docs.length && <div className="w-2 h-0.5 bg-white/50" />}
                                    </button>
                                </th>
                                <th className="px-4 py-3 w-10">ACT</th>
                                {headers.map(h => <th key={h} className="px-4 py-3">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {docs.map(row => (
                                <tr key={row.id} className={`hover:bg-white/[0.04] group transition-all duration-100 ${selectedId === row.id || selectedIds.has(row.id) ? 'bg-[var(--main-color)]/5' : ''}`} onClick={() => setSelectedId(row.id)}>
                                    <td className="px-4 py-2 text-center" onClick={(e) => toggleSelection(row.id, e)}>
                                        <div className="w-4 h-4 mx-auto rounded border border-white/10 flex items-center justify-center hover:border-white/40 cursor-pointer transition-colors bg-white/[0.02]">
                                            {selectedIds.has(row.id) && <div className="w-2 h-2 rounded-sm bg-[var(--main-color)]" />}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }} className="p-1 rounded text-red-500 hover:bg-red-500/20"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                                        </div>
                                    </td>
                                    {headers.map(h => (
                                        <td key={h} className="px-4 py-2 font-mono text-[10px] text-white/50 max-w-[200px] truncate group-hover:text-white transition-colors">
                                            {typeof row[h] === 'object' ? JSON.stringify(row[h]) : String(row[h] ?? '—')}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedId && (
                <div className="h-64 border-t border-white/10 bg-black/60 backdrop-blur-3xl p-6 overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-[var(--main-color)] uppercase tracking-[0.3em]">Quick Forge Logic</span>
                            <h2 className="text-sm font-black text-white uppercase tracking-widest">Editing {collectionName.slice(0, -1)} ID: {selectedId}</h2>
                        </div>
                        <button onClick={() => setSelectedId(null)} className="px-4 py-1.5 rounded-full border border-white/10 text-[9px] font-black text-white/40 hover:text-white hover:border-white transition-all uppercase tracking-widest">Close Editor</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                        {headers.filter(h => h !== 'id').map(h => {
                            const val = docs.find(d => d.id === selectedId)?.[h];
                            return (
                                <div key={h} className="flex flex-col gap-1.5">
                                    <label className="text-[8px] font-black text-white/20 uppercase tracking-widest">{h}</label>
                                    <input
                                        type="text"
                                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-mono text-white/80 focus:ring-1 focus:ring-[var(--main-color)] transition-all"
                                        defaultValue={typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                                        onBlur={e => {
                                            const newVal = e.target.value;
                                            try {
                                                const parsed = (newVal.startsWith('{') || newVal.startsWith('[')) ? JSON.parse(newVal) : newVal;
                                                handleUpdate(selectedId, { [h]: parsed });
                                            } catch (err) {
                                                handleUpdate(selectedId, { [h]: newVal });
                                            }
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// 5. FINANCE PANEL (Supabase-backed)
const SUBCATEGORIES = ['All', 'Acquisition', 'Monthly Expense', 'Supplies', 'Labor', 'Crate/Pallet', 'Operating'] as const;

const FinancePanel: React.FC<{ docs: any[]; onRefresh: () => void }> = ({ docs, onRefresh }) => {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const [filter, setFilter] = useState('All');
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ subcategory: 'Acquisition', amount: '', description: '', vendor_id: '', bank_account: '', notes: '' });

    const filtered = useMemo(() => filter === 'All' ? docs : docs.filter(d => d.subcategory === filter), [docs, filter]);
    const totalBySubcat = useMemo(() => {
        const m: Record<string, number> = {};
        docs.forEach(d => { m[d.subcategory || 'Other'] = (m[d.subcategory || 'Other'] || 0) + (d.amount || 0); });
        return m;
    }, [docs]);
    const grandTotal = docs.reduce((a, b) => a + (b.amount || 0), 0);

    const handleAdd = async () => {
        const payload = { ...form, amount: parseFloat(form.amount) || 0, status: 'Requested', type: 'Expense', category: form.subcategory, currency: 'MXN', date: new Date().toISOString(), updated_at: new Date().toISOString() };
        const { error } = await supabase.from('finance').insert(payload);
        if (error) toast.error(error.message); else { toast.success('Expense Added'); setShowAdd(false); setForm({ subcategory: 'Acquisition', amount: '', description: '', vendor_id: '', bank_account: '', notes: '' }); onRefresh(); }
    };
    const handleToggleStatus = async (id: string, current: string) => {
        const next = current === 'Requested' ? 'Paid' : 'Requested';
        const { error } = await supabase.from('finance').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) toast.error(error.message); else onRefresh();
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-black/10 shrink-0">
                <div className="flex flex-wrap gap-1.5">
                    {SUBCATEGORIES.map(s => (
                        <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${filter === s ? 'bg-[#00AEEF] text-black shadow-lg' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>{s.toUpperCase()}</button>
                    ))}
                </div>
                <div className="ml-auto flex items-center gap-4">
                    <div className="text-right"><span className="text-[8px] text-white/20 uppercase block font-black tracking-widest">Total</span><span className="text-lg font-mono font-black text-[#00AEEF]">{fmtMXN(grandTotal)}</span></div>
                    <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-[#00AEEF] text-black text-[10px] font-black tracking-widest rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all">+ ADD</button>
                </div>
            </div>
            {/* Summary Cards */}
            <div className="flex gap-3 p-4 shrink-0 overflow-x-auto">
                {Object.entries(totalBySubcat).map(([k, v]) => (
                    <div key={k} className="px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/5 min-w-[140px]">
                        <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">{k}</div>
                        <div className="text-sm font-mono font-black text-white">{fmtMXN(v)}</div>
                        <div className="text-[8px] font-mono text-white/20">{fmtUSD(v / exchangeRate)}</div>
                    </div>
                ))}
            </div>
            {/* Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <div className="rounded-2xl border border-white/5 overflow-hidden bg-white/[0.01]">
                    <table className="w-full text-left border-collapse">
                        <thead><tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/[0.02]">
                            <th className="px-4 py-3">Date</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-center">Status</th>
                        </tr></thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {filtered.map(r => (
                                <tr key={r.id} className="hover:bg-white/[0.04] group transition-all">
                                    <td className="px-4 py-2 font-mono text-[10px] text-white/40">{fmtDate(r.date)}</td>
                                    <td className="px-4 py-2"><span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-white/5 text-white/50">{r.subcategory || r.category || '—'}</span></td>
                                    <td className="px-4 py-2 text-xs text-white/70">{r.description || r.notes || '—'}</td>
                                    <td className="px-4 py-2">{r.vendor_id ? <span className="px-1.5 py-0.5 rounded text-[9px] font-black" style={{ backgroundColor: vendors[r.vendor_id as keyof typeof vendors]?.color || '#555', color: getTextColorForBg(vendors[r.vendor_id as keyof typeof vendors]?.color || '#555') }}>{r.vendor_id}</span> : '—'}</td>
                                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-white/60">{fmtMXN(r.amount)}</td>
                                    <td className="px-4 py-2 text-center" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => handleToggleStatus(r.id, r.status)} className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all ${r.status === 'Paid' ? 'bg-[#8DC63F]/20 text-[#8DC63F] border border-[#8DC63F]/30' : 'bg-[#FFED00]/10 text-[#FFED00] border border-[#FFED00]/20'}`}>{r.status || 'Requested'}</button>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-white/10 text-sm font-black tracking-widest">NO RECORDS</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Add Expense Modal */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={() => setShowAdd(false)}>
                    <div className="bg-[#1a1a2e] border border-white/10 rounded-3xl p-8 w-[480px] max-w-[90vw] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-6">Add Finance Record</h3>
                        <div className="space-y-4">
                            <div><label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Subcategory</label>
                                <select value={form.subcategory} onChange={e => setForm({ ...form, subcategory: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80">
                                    {SUBCATEGORIES.filter(s => s !== 'All').map(s => <option key={s} value={s}>{s}</option>)}
                                </select></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Amount (MXN)</label>
                                    <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-white/80" /></div>
                                <div><label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Vendor</label>
                                    <input value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80" placeholder="e.g. JM" /></div>
                            </div>
                            <div><label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Description</label>
                                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80" /></div>
                            <div><label className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Notes</label>
                                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 h-16 resize-none" /></div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowAdd(false)} className="flex-1 py-3 border border-white/10 text-white/40 rounded-xl text-[10px] font-black tracking-widest hover:bg-white/5">CANCEL</button>
                            <button onClick={handleAdd} className="flex-1 py-3 bg-[#00AEEF] text-black rounded-xl text-[10px] font-black tracking-widest shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all">COMMIT</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// 6. LOGISTICS PANEL (Supabase-backed)
const LOGISTICS_STATUSES = ['All', 'Warehouse', 'In Transit', 'Delivered'] as const;

const LogisticsPanel: React.FC<{ docs: any[]; onRefresh: () => void }> = ({ docs, onRefresh }) => {
    const [filter, setFilter] = useState('All');
    const filtered = useMemo(() => filter === 'All' ? docs : docs.filter(d => d.status === filter), [docs, filter]);
    const counts = useMemo(() => ({ warehouse: docs.filter(d => d.status === 'Warehouse').length, transit: docs.filter(d => d.status === 'In Transit').length, delivered: docs.filter(d => d.status === 'Delivered').length }), [docs]);

    const handleStatusChange = async (id: string, newStatus: string) => {
        const { error } = await supabase.from('logistics').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) toast.error(error.message); else onRefresh();
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-black/10 shrink-0">
                <div className="flex gap-1.5">
                    {LOGISTICS_STATUSES.map(s => (
                        <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${filter === s ? 'bg-[#8DC63F] text-black shadow-lg' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>{s.toUpperCase()}</button>
                    ))}
                </div>
                <div className="ml-auto flex gap-6">
                    <div className="flex flex-col items-end"><span className="text-[8px] text-white/20 uppercase font-black tracking-widest">Warehouse</span><span className="text-lg font-mono font-black text-[#FFED00]">{counts.warehouse}</span></div>
                    <div className="flex flex-col items-end"><span className="text-[8px] text-white/20 uppercase font-black tracking-widest">In Transit</span><span className="text-lg font-mono font-black text-[#00AEEF]">{counts.transit}</span></div>
                    <div className="flex flex-col items-end"><span className="text-[8px] text-white/20 uppercase font-black tracking-widest">Delivered</span><span className="text-lg font-mono font-black text-[#8DC63F]">{counts.delivered}</span></div>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map(c => {
                        const color = vendors[c.vendor_id as keyof typeof vendors]?.color || vendors[c.vendors as keyof typeof vendors]?.color || '#555';
                        const statusColor = c.status === 'Delivered' ? '#8DC63F' : c.status === 'In Transit' ? '#00AEEF' : '#FFED00';
                        return (
                            <div key={c.id} className="glass-panel p-4 rounded-xl border border-white/5 flex flex-col gap-2 hover:bg-white/[0.02] transition-colors relative">
                                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: color }} />
                                <div className="flex justify-between items-center">
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold text-black" style={{ backgroundColor: color }}>{c.vendor_id || c.vendors || '—'}</span>
                                    <select value={c.status || 'Warehouse'} onChange={e => handleStatusChange(c.id, e.target.value)} className="bg-transparent text-[9px] font-black uppercase tracking-widest cursor-pointer" style={{ color: statusColor }}>
                                        <option value="Warehouse">WAREHOUSE</option><option value="In Transit">IN TRANSIT</option><option value="Delivered">DELIVERED</option>
                                    </select>
                                </div>
                                <div className="text-xs font-bold text-white line-clamp-1">{c.description || c.contents_summary || 'Shipment'}</div>
                                <div className="flex gap-4 py-2 border-y border-white/5 mt-1 justify-between">
                                    <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase">Weight</span><span className="text-[10px] font-mono font-bold text-white">{c.weight_kg || 0}kg</span></div>
                                    <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase">Crates</span><span className="text-[10px] font-mono font-bold text-white">{c.crate_count || c.quantity || 0}</span></div>
                                    <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase">Pallets</span><span className="text-[10px] font-mono font-bold text-white">{c.pallet_count || 0}</span></div>
                                    <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase">Freight</span><span className="text-[10px] font-mono font-bold text-[#8DC63F]">{fmtMXN(c.freight_cost || c.cost_mxn || 0)}</span></div>
                                </div>
                                {c.tracking_number && <div className="text-[9px] text-white/30 font-mono">TRK: {c.tracking_number}</div>}
                                {(c.origin || c.destination_address) && <div className="text-[9px] text-white/20">{c.origin || '?'} → {c.destination_address || '?'}</div>}
                                {c.customs_status && <div className="text-[8px] font-black uppercase tracking-widest" style={{ color: c.customs_status === 'Cleared' ? '#8DC63F' : c.customs_status === 'Rejected' ? '#e06666' : '#FFED00' }}>CUSTOMS: {c.customs_status}</div>}
                            </div>
                        );
                    })}
                    {filtered.length === 0 && <div className="col-span-3 py-16 text-center text-white/10 text-sm font-black tracking-widest">NO LOGISTICS RECORDS</div>}
                </div>
            </div>
        </div>
    );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const WorkbookView: React.FC = () => {
    const user = useAtomValue(userAtom);
    const [activeTab, setActiveTab] = useAtom(workbookActiveTabAtom);
    const [viewMode, setViewMode] = useAtom(workbookViewModeAtom);
    const [density, setDensity] = useAtom(workbookDensityAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();

    const [data, setData] = useState<{ inv: any[], prod: any[], log: any[], fin: any[] }>({ inv: [], prod: [], log: [], fin: [] });
    const [ver, setVer] = useState(0);
    const [isSyncing, setIsSyncing] = useState(true);
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        const timeoutTimer = setTimeout(() => setIsSyncing(false), 8000);
        if (!db) return () => clearTimeout(timeoutTimer);

        let invTimer: any, prodTimer: any, logTimer: any, finTimer: any;

        const subs = [
            db.inventory.find().$.subscribe(d => {
                clearTimeout(invTimer);
                invTimer = setTimeout(() => {
                    const items = d.map(x => x.toJSON());
                    setData(p => ({ ...p, inv: items }));
                    setIsSyncing(false);
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
            }),
            db.finance.find().$.subscribe(d => {
                clearTimeout(finTimer);
                finTimer = setTimeout(() => {
                    setData(p => ({ ...p, fin: d.map(x => x.toJSON()) }));
                }, 200);
            })
        ];

        return () => {
            subs.forEach(s => s.unsubscribe());
            [invTimer, prodTimer, logTimer, finTimer, timeoutTimer].forEach(clearTimeout);
        };
    }, [db, ver]);

    // Role-Based Data Filtering
    const docs = useMemo(() => {
        if (user?.role === 'Vendor') {
            return data.inv.filter(d => d.item_id === user.id);
        }
        return data.inv;
    }, [data.inv, user]);

    const docs326 = useMemo(() => docs.filter(d => d.workbook === '326' || !d.workbook), [docs]);
    const docs825 = useMemo(() => docs.filter(d => d.workbook === '825'), [docs]);

    // Role-Based Tab Visibility — driven by single source of truth in consts.tsx
    const visibleTabs = useMemo(() => {
        return WORKBOOK_TABS.filter(t => t.roles.includes(user?.role || 'Vendor'));
    }, [user?.role]);

    // Redirect if current tab is hidden
    useEffect(() => {
        if (visibleTabs.length > 0 && !visibleTabs.find(t => t.id === activeTab)) {
            setActiveTab(visibleTabs[0].id as any);
        }
    }, [visibleTabs, activeTab, setActiveTab]);

    const isEmpty = data.inv.length === 0;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-transparent">
            {/* HUD Header Area */}
            <div className="flex flex-col px-6 py-4 bg-white/[0.02] backdrop-blur-3xl border-b border-white/[0.05] shrink-0 gap-4">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <h1 className="text-xl font-black tracking-tighter text-white/90">POWER WORKBOOK</h1>
                    </div>

                    <div className="flex gap-8 items-center">
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Acquired Pcs</span>
                            <span className="text-xl font-mono font-black text-white leading-none">{docs326.length}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Production %</span>
                            <span className="text-xl font-mono font-black text-[#FFED00] leading-none">
                                {data.prod.length > 0 ? Math.round(data.prod.reduce((a, b) => a + (b.progress || 0), 0) / data.prod.length) : 0}%
                            </span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Vault Value</span>
                            <span className="text-xl font-mono font-black text-[var(--main-color)] leading-none">{fmtUSD(docs326.reduce((a, b) => a + (b.price_mxn || 0), 0) / exchangeRate)}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} />
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">{isSyncing ? 'Syncing Cloud Engine...' : 'Real-time Linked'}</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex bg-black/20 p-0.5 rounded-lg border border-white/5">
                            <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white/10 text-[var(--main-color)]' : 'text-white/20 hover:text-white/40'}`} title="Table View"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></button>
                            <button onClick={() => setViewMode('gallery')} className={`p-1.5 rounded-md transition-all ${viewMode === 'gallery' ? 'bg-white/10 text-[var(--main-color)]' : 'text-white/20 hover:text-white/40'}`} title="Gallery View"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg></button>
                            <button onClick={() => setViewMode('kanban')} className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white/10 text-[var(--main-color)]' : 'text-white/20 hover:text-white/40'}`} title="Workflow Board"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg></button>
                        </div>
                        <button onClick={refresh} className="p-2 rounded-xl bg-white/5 border border-white/5 text-white/40 hover:text-white transition-all"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
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
                        {activeTab === 'finance' && <FinancePanel docs={data.fin} onRefresh={refresh} />}
                        {activeTab === 'production' && <ProductionPanel docs={data.prod} />}
                        {activeTab === 'logistics' && <LogisticsPanel docs={data.log} onRefresh={refresh} />}
                        {activeTab === 'logistics' && <LogisticsPanel docs={data.log} onRefresh={refresh} />}
                    </div>
                )}
            </div>
        </div>
    );
};
