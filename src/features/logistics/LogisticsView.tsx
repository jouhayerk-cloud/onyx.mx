import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { logisticsSubTabAtom, userAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { ShippingView } from '../dashboard/ShippingView';

const fmtMXN = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const SUB_TABS = [
    { id: 'packing' as const, label: 'PACKING', color: '#8DC63F', icon: '📦' },
    { id: 'trucking' as const, label: 'TRUCKING', color: '#00AEEF', icon: '🚛' },
    { id: 'shipping' as const, label: 'SHIPPING', color: '#F7941D', icon: '🚢' },
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
                <div className="ml-auto flex gap-6">
                    <div className="flex flex-col items-end"><span className="text-[8px] text-white/20 uppercase font-black tracking-widest">Warehouse</span><span className="text-lg font-mono font-black text-[#FFED00]">{counts.warehouse}</span></div>
                    <div className="flex flex-col items-end"><span className="text-[8px] text-white/20 uppercase font-black tracking-widest">In Transit</span><span className="text-lg font-mono font-black text-[#00AEEF]">{counts.transit}</span></div>
                    <div className="flex flex-col items-end"><span className="text-[8px] text-white/20 uppercase font-black tracking-widest">Delivered</span><span className="text-lg font-mono font-black text-[#8DC63F]">{counts.delivered}</span></div>
                </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'packing' && <PackingPanel docs={docs} onRefresh={refresh} />}
                {activeTab === 'trucking' && <ShippingView />}
                {activeTab === 'shipping' && <ShipmentTrackingPanel docs={docs} onRefresh={refresh} />}
            </div>
        </div>
    );
};

// Packing Panel — Crates/warehouse management
const PackingPanel: React.FC<{ docs: any[]; onRefresh: () => void }> = ({ docs, onRefresh }) => {
    const warehouseDocs = useMemo(() => docs.filter(d => !d.status || d.status === 'Warehouse'), [docs]);

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {warehouseDocs.map(c => {
                    const color = vendors[c.vendor_id as keyof typeof vendors]?.color || vendors[c.vendors as keyof typeof vendors]?.color || '#555';
                    return (
                        <div key={c.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-2 relative hover:bg-white/[0.04] transition-colors">
                            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ backgroundColor: color }} />
                            <div className="flex justify-between items-center">
                                <span className="px-2 py-0.5 rounded text-[8px] font-black text-black" style={{ backgroundColor: color }}>{c.vendor_id || c.vendors || '—'}</span>
                                <span className="text-[8px] font-black text-[#FFED00] uppercase tracking-widest">WAREHOUSE</span>
                            </div>
                            <div className="text-xs font-bold text-white line-clamp-1">{c.description || c.contents_summary || 'Crate'}</div>
                            <div className="flex gap-4 py-2 border-y border-white/5 mt-1 justify-between">
                                <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase">Weight</span><span className="text-[10px] font-mono font-bold text-white">{c.weight_kg || 0}kg</span></div>
                                <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase">L×W×H</span><span className="text-[10px] font-mono font-bold text-white">{c.length_cm || 0}×{c.width_cm || 0}×{c.height_cm || 0}</span></div>
                                <div className="flex flex-col"><span className="text-[8px] text-white/20 uppercase">Crates</span><span className="text-[10px] font-mono font-bold text-white">{c.crate_count || c.quantity || 1}</span></div>
                            </div>
                        </div>
                    );
                })}
                {warehouseDocs.length === 0 && <div className="col-span-3 py-16 text-center text-white/10 text-sm font-black tracking-widest">NO CRATES IN WAREHOUSE</div>}
            </div>
        </div>
    );
};

// Shipment Tracking Panel — All shipments with status workflow
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
                {['All', 'Warehouse', 'In Transit', 'Delivered'].map(s => (
                    <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${filter === s ? 'bg-[#F7941D] text-black' : 'bg-white/5 text-white/30 hover:text-white/60'}`}>{s.toUpperCase()}</button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <table className="w-full text-left border-collapse">
                    <thead><tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/[0.02] sticky top-0">
                        <th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Origin → Dest</th><th className="px-4 py-3">Tracking</th><th className="px-4 py-3 text-right">Freight</th><th className="px-4 py-3">Customs</th><th className="px-4 py-3 text-center">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-white/[0.03]">
                        {filtered.map(c => {
                            const color = vendors[c.vendor_id as keyof typeof vendors]?.color || '#555';
                            const statusColor = c.status === 'Delivered' ? '#8DC63F' : c.status === 'In Transit' ? '#00AEEF' : '#FFED00';
                            const isExpanded = expandedId === c.id;
                            return (
                                <React.Fragment key={c.id}>
                                    <tr onClick={() => setExpandedId(isExpanded ? null : c.id)} className={`hover:bg-white/[0.04] transition-all cursor-pointer ${isExpanded ? 'bg-white/[0.02]' : ''}`}>
                                        <td className="px-4 py-2">{c.vendor_id ? <span className="px-1.5 py-0.5 rounded text-[8px] font-black text-black" style={{ backgroundColor: color }}>{c.vendor_id}</span> : '—'}</td>
                                        <td className="px-4 py-2 text-xs text-white/70">{c.description || c.contents_summary || '—'}</td>
                                        <td className="px-4 py-2 text-[10px] text-white/40">{c.origin || '?'} → {c.destination_address || '?'}</td>
                                        <td className="px-4 py-2 font-mono text-[10px] text-white/30">{c.tracking_number || '—'}</td>
                                        <td className="px-4 py-2 text-right font-mono text-xs text-[#8DC63F]">{fmtMXN(c.freight_cost || 0)}</td>
                                        <td className="px-4 py-2"><span className="text-[8px] font-black uppercase" style={{ color: c.customs_status === 'Cleared' ? '#8DC63F' : c.customs_status === 'Rejected' ? '#e06666' : '#FFED00' }}>{c.customs_status || 'Pending'}</span></td>
                                        <td className="px-4 py-2 text-center" onClick={e => e.stopPropagation()}>
                                            <select value={c.status || 'Warehouse'} onChange={e => handleStatusChange(c.id, e.target.value)} className="bg-transparent text-[9px] font-black uppercase tracking-widest cursor-pointer" style={{ color: statusColor }}>
                                                <option value="Warehouse">WAREHOUSE</option><option value="In Transit">IN TRANSIT</option><option value="Delivered">DELIVERED</option>
                                            </select>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-black/20 border-b border-white/[0.02]">
                                            <td colSpan={7} className="px-6 py-4">
                                                <div className="flex gap-8">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Insurance Value</span>
                                                        <span className="font-mono text-xs text-white/80">{c.insurance_value ? fmtMXN(c.insurance_value) : 'Not Insured'}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Pallet Count</span>
                                                        <span className="font-mono text-xs text-white/80">{c.pallet_count || 0} Pallets</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Crate Count</span>
                                                        <span className="font-mono text-xs text-white/80">{c.crate_count || 0} Crates</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Weight</span>
                                                        <span className="font-mono text-xs text-white/80">{c.weight_kg || 0} kg</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Carrier</span>
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
