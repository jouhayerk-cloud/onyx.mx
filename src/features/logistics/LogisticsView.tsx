import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { logisticsSubTabAtom, userAtom, isDummyModeAtom } from '../../lib/atoms';
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

    const isDummyMode = useAtomValue(isDummyModeAtom);
    const handleStatusChange = async (id: string, newStatus: string) => {
        if (isDummyMode) {
            toast.success(`Status updated to ${newStatus} (Demo Mode)`, { icon: '🧪' });
            onRefresh();
            return;
        }
        const { error } = await supabase.from('logistics').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) toast.error(error.message); else onRefresh();
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-2 p-4 border-b border-white/5 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Shipment Log</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
                {/* Desktop Table View */}
                <div className="hidden md:block">
                    <table className="w-full text-left border-collapse">
                        <thead><tr className="text-[9px] uppercase tracking-widest text-white/20 border-b border-white/5 bg-white/2 sticky top-0 z-10">
                            <th className="px-4 py-4 font-black">Vendor</th><th className="px-4 py-4 font-black">Description</th><th className="px-4 py-4 font-black">Route</th><th className="px-4 py-4 font-black">Tracking</th><th className="px-4 py-4 text-right font-black">Freight</th><th className="px-4 py-4 font-black">Customs</th><th className="px-4 py-4 text-center font-black">Status</th>
                        </tr></thead>
                        <tbody className="divide-y divide-white/5">
                            {filtered.map(c => {
                                const color = vendors[c.vendor_id as keyof typeof vendors]?.color || '#555';
                                const statusColor = c.status === 'Delivered' ? '#8DC63F' : c.status === 'In Transit' ? '#00AEEF' : '#FFED00';
                                const isExpanded = expandedId === c.id;
                                return (
                                    <React.Fragment key={c.id}>
                                        <tr onClick={() => setExpandedId(isExpanded ? null : c.id)} className={`hover:bg-white/5 transition-all cursor-pointer group ${isExpanded ? 'bg-white/3' : ''}`}>
                                            <td className="px-4 py-3">
                                                {c.vendor_id ? (
                                                    <span className="px-2 py-1 rounded text-[10px] font-black text-black shadow-md" style={{ backgroundColor: color }}>{c.vendor_id}</span>
                                                ) : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-xs font-bold text-white group-hover:text-(--main-color) transition-colors">{c.description || c.contents_summary || 'Untitled Shipment'}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-white/60 font-bold">{c.origin || '?'} → {c.destination_address || '?'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="font-mono text-[10px] text-white/25 uppercase tracking-tighter">{c.tracking_number || 'No Tracking'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="font-mono text-xs font-black text-emerald-400">{fmtMXN(c.freight_cost || 0)}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-current" style={{ color: c.customs_status === 'Cleared' ? '#8DC63F' : c.customs_status === 'Rejected' ? '#e06666' : '#FFED00' }}>
                                                    {c.customs_status || 'Pending'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                <select 
                                                    value={c.status || 'Warehouse'} 
                                                    onChange={e => handleStatusChange(c.id, e.target.value)} 
                                                    className="bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-widest cursor-pointer outline-none hover:border-white/20 transition-all" 
                                                    style={{ color: statusColor }}
                                                >
                                                    <option value="Warehouse">WHSE</option>
                                                    <option value="In Transit">TRANS</option>
                                                    <option value="Delivered">DLVRD</option>
                                                </select>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-black/40 border-b border-white/5 shadow-inner">
                                                <td colSpan={7} className="px-8 py-6">
                                                    <div className="grid grid-cols-5 gap-10">
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Insurance Value</span>
                                                            <span className="font-mono text-xs font-black text-white/80">{c.insurance_value ? fmtMXN(c.insurance_value) : 'No coverage'}</span>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Load Specs</span>
                                                            <span className="text-xs font-black text-white/80">{c.pallet_count || 0} Pallets · {c.crate_count || 0} Crates</span>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Gross Weight</span>
                                                            <span className="font-mono text-xs font-black text-white/80">{c.weight_kg || 0} kg</span>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Carrier</span>
                                                            <span className="text-xs font-black text-white/80">{c.carrier || 'Unassigned'}</span>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5">
                                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Updated</span>
                                                            <span className="text-[10px] text-white/40">{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '—'}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden flex flex-col gap-4">
                    {filtered.map(c => {
                        const color = vendors[c.vendor_id as keyof typeof vendors]?.color || '#555';
                        const statusColor = c.status === 'Delivered' ? '#8DC63F' : c.status === 'In Transit' ? '#00AEEF' : '#FFED00';
                        const isExpanded = expandedId === c.id;
                        return (
                            <div 
                                key={c.id} 
                                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                                className={`flex flex-col bg-white/3 border rounded-2xl transition-all ${isExpanded ? 'border-(--main-color)/30 ring-1 ring-(--main-color)/20 bg-white/5' : 'border-white/8'}`}
                            >
                                <div className="p-4 flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {c.vendor_id && <span className="px-2 py-0.5 rounded text-[8px] font-black text-black" style={{ backgroundColor: color }}>{c.vendor_id}</span>}
                                            <span className="font-mono text-[9px] text-white/20 tracking-tighter">{c.tracking_number || 'NO TRK'}</span>
                                        </div>
                                        <div onClick={e => e.stopPropagation()}>
                                            <select 
                                                value={c.status || 'Warehouse'} 
                                                onChange={e => handleStatusChange(c.id, e.target.value)} 
                                                className="bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-widest outline-none" 
                                                style={{ color: statusColor }}
                                            >
                                                <option value="Warehouse">WHSE</option>
                                                <option value="In Transit">TRANS</option>
                                                <option value="Delivered">DLVRD</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-white leading-tight">{c.description || c.contents_summary || 'Untitled Shipment'}</h4>
                                        <p className="text-[10px] text-white/40 font-bold mt-1 uppercase tracking-wide">{c.origin || '?'} → {c.destination_address || '?'}</p>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-1">
                                        <span className="text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border border-white/10 text-white/30">{c.customs_status || 'Pending'}</span>
                                        <span className="text-sm font-mono font-black text-emerald-400">{fmtMXN(c.freight_cost || 0)}</span>
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="px-4 pb-5 pt-2 grid grid-cols-2 gap-4 border-t border-white/5 bg-black/20 rounded-b-2xl animate-in slide-in-from-top-2">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">Weight / Specs</span>
                                            <span className="text-[10px] font-black text-white/80">{c.weight_kg || 0}kg · {c.pallet_count || 0}P / {c.crate_count || 0}C</span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">Carrier</span>
                                            <span className="text-[10px] font-black text-white/80">{c.carrier || '—'}</span>
                                        </div>
                                        <div className="flex flex-col gap-1 col-span-2">
                                            <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">Insurance Value</span>
                                            <span className="text-[10px] font-black text-white/80">{c.insurance_value ? fmtMXN(c.insurance_value) : 'None'}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {filtered.length === 0 && <div className="py-20 text-center text-white/10 text-[10px] font-black uppercase tracking-[0.5em] italic">NO SHIPMENTS FOUND</div>}
            </div>
        </div>
    );
};
