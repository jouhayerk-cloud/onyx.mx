import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { workbookActiveTabAtom, workbookViewModeAtom, workbookDensityAtom, exchangeRateAtom, userAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
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

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const WorkbookView: React.FC = () => {
    const user = useAtomValue(userAtom);
    const [activeTab, setActiveTab] = useAtom(workbookActiveTabAtom);
    const [viewMode, setViewMode] = useAtom(workbookViewModeAtom);
    const [density, setDensity] = useAtom(workbookDensityAtom);
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();

    const [data, setData] = useState<{ inv: any[], prod: any[], log: any[] }>({ inv: [], prod: [], log: [] });
    const [ver, setVer] = useState(0);
    const [isSyncing, setIsSyncing] = useState(true);
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        if (!db) return;

        let invTimer: any, prodTimer: any, logTimer: any;

        const subs = [
            db.inventory.find().$.subscribe(d => {
                clearTimeout(invTimer);
                invTimer = setTimeout(() => {
                    const items = d.map(x => x.toJSON());
                    setData(p => ({ ...p, inv: items }));
                    // Set syncing to false once we have at least one valid response from RxDB (even if empty)
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
            })
        ];

        const timeoutTimer = setTimeout(() => setIsSyncing(false), 8000);

        return () => {
            subs.forEach(s => s.unsubscribe());
            [invTimer, prodTimer, logTimer, timeoutTimer].forEach(clearTimeout);
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

    // Role-Based Tab Visibility
    const allTabs = [
        { id: 'inventory', label: 'WORKBOOK 326', badge: docs326.filter(d => !d.shipped).length, roles: ['Developer', 'Admin', 'Vendor'] },
        { id: 'archive', label: 'ARCHIVE 825', badge: null, roles: ['Developer', 'Admin', 'Client'] },
        { id: 'production', label: 'PRODUCTION', badge: data.prod.length, roles: ['Developer', 'Admin', 'Vendor'] },
        { id: 'crates', label: 'LOGISTICS', badge: data.log.length, roles: ['Developer', 'Admin', 'Client'] }
    ];

    const visibleTabs = useMemo(() => {
        return allTabs.filter(t => t.roles.includes(user?.role || 'Vendor'));
    }, [user?.role, docs326, data.prod, data.log]);

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
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} />
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">{isSyncing ? 'Syncing Cloud Engine...' : 'Real-time Linked'}</span>
                        </div>
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
                    <div className="flex gap-1 bg-black/20 p-1 rounded-xl border border-white/5">
                        {visibleTabs.map(t => (
                            <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`px-4 py-2 text-[9px] font-black tracking-[0.1em] transition-all rounded-lg ${activeTab === t.id ? 'text-black bg-[var(--main-color)] shadow-[0_0_15px_rgba(127,187,255,0.3)]' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
                                {t.label}
                                {!!t.badge && t.badge > 0 && <span className={`ml-2 px-1 rounded text-[7px] font-mono ${activeTab === t.id ? 'bg-black/20 text-black' : 'bg-white/10 text-white/30'}`}>{t.badge}</span>}
                            </button>
                        ))}
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
                        {activeTab === 'production' && <ProductionPanel docs={data.prod} />}
                        {activeTab === 'crates' && <CratesPanel docs={data.log} />}
                    </div>
                )}
            </div>
        </div>
    );
};
