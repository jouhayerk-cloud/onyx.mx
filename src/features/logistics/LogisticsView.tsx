import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { logisticsSubTabAtom, userAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { CratesInventoryView } from './CratesInventoryView';
import { CratePackingManager } from './CratePackingManager';

const fmtMXN = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const SUB_TABS = [
    { id: 'crates' as const, label: 'CRATES', color: '#00AEEF', icon: 'box' },
    { id: 'packing' as const, label: 'PACK', color: '#8DC63F', icon: 'package' },
    { id: 'shipping' as const, label: 'TRK', color: '#F7941D', icon: 'map-pin' },
];

export const LogisticsView: React.FC = () => {
    const [activeTab, setActiveTab] = useAtom(logisticsSubTabAtom);
    const db = useDatabase();
    const [docs, setDocs] = useState<any[]>([]);
    const [ver, setVer] = useState(0);
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        if (!db) return;
        let timer: any;
        const sub = db.logistics.find().$.subscribe(d => {
            clearTimeout(timer);
            timer = setTimeout(() => setDocs(d.map(x => x.toJSON())), 200);
        });
        return () => { sub.unsubscribe(); clearTimeout(timer); };
    }, [db, ver]);

    const counts = useMemo(() => ({
        warehouse: docs.filter(d => d.status === 'Warehouse').length,
        transit: docs.filter(d => d.status === 'In Transit').length,
        delivered: docs.filter(d => d.status === 'Delivered').length,
    }), [docs]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Contextual status strip ── */}
            <div className="flex items-center gap-6 px-6 py-2 bg-white/1.5 border-b border-white/4 shrink-0">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#FFED00]" />
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">WHSE</span>
                    <span className="text-sm font-mono font-black text-[#FFED00] ml-1">{counts.warehouse}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#00AEEF]" />
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">TRANS</span>
                    <span className="text-sm font-mono font-black text-[#00AEEF] ml-1">{counts.transit}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-[#8DC63F]" />
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">DLVRD</span>
                    <span className="text-sm font-mono font-black text-[#8DC63F] ml-1">{counts.delivered}</span>
                </div>
                <div className="ml-auto">
                    <span className="text-[8px] font-black text-white/15 uppercase tracking-widest">{docs.length} total</span>
                </div>
            </div>
            {/* ── Content ── */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'packing' ? (
                    <CratePackingManager />
                ) : activeTab === 'shipping' ? (
                    <ShipmentTrackingPanel docs={docs} onRefresh={refresh} />
                ) : (
                    <CratesInventoryView />
                )}
            </div>
        </div>
    );
};
const ShipmentTrackingPanel: React.FC<{ docs: any[]; onRefresh: () => void }> = ({ docs, onRefresh }) => {
    const [filter, setFilter] = useState('All');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const filtered = useMemo(() => filter === 'All' ? docs : docs.filter(d => d.status === filter), [docs, filter]);

    const handleStatusChange = async (id: string, newStatus: string) => {
        const { error } = await supabase.from('logistics').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) toast.error(error.message); else onRefresh();
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-2 p-4 border-b border-white/5 shrink-0">
                {[
                    { val: 'All', label: 'ALL' },
                    { val: 'Warehouse', label: 'WHSE' },
                    { val: 'In Transit', label: 'TRANS' },
                    { val: 'Delivered', label: 'DLVRD' }
                ].map(s => (
                    <button key={s.val} onClick={() => setFilter(s.val)} className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${filter === s.val ? 'bg-[#F7941D] text-black' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>{s.label}</button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <table className="w-full text-left border-collapse">
                    <thead><tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/2 sticky top-0">
                        <th className="px-4 py-3">Vend</th><th className="px-4 py-3">Desc</th><th className="px-4 py-3">Route</th><th className="px-4 py-3">Trk</th><th className="px-4 py-3 text-right">Frgt</th><th className="px-4 py-3">Custom</th><th className="px-4 py-3 text-center">Stat</th>
                    </tr></thead>
                    <tbody className="divide-y divide-white/3">
                        {filtered.map(c => {
                            const color = vendors[c.vendor_id as keyof typeof vendors]?.color || '#555';
                            const statusColor = c.status === 'Delivered' ? '#8DC63F' : c.status === 'In Transit' ? '#00AEEF' : '#FFED00';
                            const isExpanded = expandedId === c.id;
                            return (
                                <React.Fragment key={c.id}>
                                    <tr onClick={() => setExpandedId(isExpanded ? null : c.id)} className={`hover:bg-white/4 transition-all cursor-pointer ${isExpanded ? 'bg-white/2' : ''}`}>
                                        <td className="px-4 py-2">{c.vendor_id ? <span className="px-1.5 py-0.5 rounded text-[8px] font-black text-black" style={{ backgroundColor: color }}>{c.vendor_id}</span> : '—'}</td>
                                        <td className="px-4 py-2 text-xs text-white/70">{c.description || c.contents_summary || '—'}</td>
                                        <td className="px-4 py-2 text-[10px] text-white/40">{c.origin || '?'} → {c.destination_address || '?'}</td>
                                        <td className="px-4 py-2 font-mono text-[10px] text-white/30">{c.tracking_number || '—'}</td>
                                        <td className="px-4 py-2 text-right font-mono text-xs text-[#8DC63F]">{fmtMXN(c.freight_cost || 0)}</td>
                                        <td className="px-4 py-2"><span className="text-[8px] font-black uppercase" style={{ color: c.customs_status === 'Cleared' ? '#8DC63F' : c.customs_status === 'Rejected' ? '#e06666' : '#FFED00' }}>{c.customs_status || 'Pending'}</span></td>
                                        <td className="px-4 py-2 text-center" onClick={e => e.stopPropagation()}>
                                            <select value={c.status || 'Warehouse'} onChange={e => handleStatusChange(c.id, e.target.value)} className="bg-transparent text-[9px] font-black uppercase tracking-widest cursor-pointer" style={{ color: statusColor }}>
                                                <option value="Warehouse">WHSE</option><option value="In Transit">TRANS</option><option value="Delivered">DLVRD</option>
                                            </select>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-black/20 border-b border-white/2">
                                            <td colSpan={7} className="px-6 py-4">
                                                <div className="flex gap-8">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Ins</span>
                                                        <span className="font-mono text-xs text-white/80">{c.insurance_value ? fmtMXN(c.insurance_value) : 'None'}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Pallet</span>
                                                        <span className="font-mono text-xs text-white/80">{c.pallet_count || 0}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Crate</span>
                                                        <span className="font-mono text-xs text-white/80">{c.crate_count || 0}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Weight</span>
                                                        <span className="font-mono text-xs text-white/80">{c.weight_kg || 0}kg</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Carr</span>
                                                        <span className="font-mono text-xs text-white/80">{c.carrier || '—'}</span>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-white/10 text-sm font-black tracking-widest">NO SHIPMENTS</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
