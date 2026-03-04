import React, { useMemo, useState, useEffect } from 'react';
import { useAtomValue, useAtom } from 'jotai/react';
import { exchangeRateAtom, showFinancialsAtom, financeDataAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { normalizeInventoryData } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import {
    Activity, LayoutDashboard, Database, RefreshCcw, DollarSign, Wallet, Store
} from 'lucide-react';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { destinationsConfig } from '../../lib/paymentConfig';
import { default as toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

interface ClientVendorSummary {
    vendorId: string;
    color: string;
    itemCount: number;
    totalAcqMxn: number;
    totalAcqUsd: number;
}

const StatCard = ({ icon: Icon, label, value, color = 'var(--main-color)' }: {
    icon: React.FC<any>; label: string; value: string; color?: string;
}) => (
    <div className="bg-(--glass-bg) border border-(--border-color) rounded-2xl p-5 flex flex-col gap-3 hover:border-(--border-color) transition-all group shadow-sm">
        <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/5 shadow-inner" style={{ background: `${color}15` }}>
                <Icon size={20} strokeWidth={1.75} style={{ color }} />
            </div>
        </div>
        <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary) mb-1">{label}</p>
            <p className="text-2xl font-black font-mono text-(--text-color) leading-none tracking-tight">{value}</p>
        </div>
    </div>
);

export const ClientOverview: React.FC = () => {
    const db = useDatabase();
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const [showFinancials] = useAtom(showFinancialsAtom);
    const financeData = useAtomValue(financeDataAtom);

    const [items, setItems] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db) return;
        setIsLoading(true);
        const subs = [
            db.inventory.find({ selector: { status: { $ne: 'Pending Deletion' } } }).$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'inventory', data: normalizeInventoryData(x.toJSON()) }));
                setItems(prev => [...prev.filter(p => p.source !== 'inventory'), ...mapped]);
            }),
            db.production.find().$.subscribe(d => {
                const mapped = d.map(x => ({ ...x.toJSON(), source: 'production', data: normalizeInventoryData(x.toJSON()) }));
                setItems(prev => [...prev.filter(p => p.source !== 'production'), ...mapped]);
            }),
        ];
        setTimeout(() => setIsLoading(false), 800);
        return () => subs.forEach(s => s.unsubscribe());
    }, [db]);

    const vendorSummaries = useMemo<ClientVendorSummary[]>(() => {
        const map: Record<string, ClientVendorSummary> = {};
        for (const item of items) {
            const norm = item.data;
            const vid = String(norm?.itemId || '').split('-')[0] || '?';
            if (!map[vid]) {
                map[vid] = { vendorId: vid, color: (vendors as any)[vid]?.color || '#888', itemCount: 0, totalAcqMxn: 0, totalAcqUsd: 0 };
            }
            const price = parseFloat(norm?.price || 0);
            const qty = parseInt(norm?.quantity || 1) || 1;
            const totalPrice = price * qty;
            const usd = totalPrice / exchangeRate;
            map[vid].itemCount += qty;
            map[vid].totalAcqMxn += totalPrice;
            map[vid].totalAcqUsd += usd;
        }
        return Object.values(map).sort((a, b) => b.totalAcqMxn - a.totalAcqMxn);
    }, [items, exchangeRate]);

    const activeDestPendingRecords = useMemo(() => {
        return financeData.filter(d => (d.status === 'Requested' || !d.status) && d.destination);
    }, [financeData]);

    const activeDestReqNetMXN = useMemo(() => {
        return activeDestPendingRecords.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
    }, [activeDestPendingRecords]);

    const fmtMXN = (val: number) => showFinancials ? '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '***';
    const fmtUSD = (val: number) => showFinancials ? '$' + val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' USD' : '***';

    const globalTotals = useMemo(() => {
        return {
            items: vendorSummaries.reduce((acc, v) => acc + v.itemCount, 0),
            acqValueUsd: vendorSummaries.reduce((acc, v) => acc + v.totalAcqUsd, 0)
        };
    }, [vendorSummaries]);

    const handleMarkAsPaid = async (destId: string, destReqMXN: number, destDocs: any[]) => {
        const toastId = toast.loading(`Marking ${fmtMXN(destReqMXN)} as Paid...`);
        try {
            const docIds = destDocs.map(d => d.id);
            if (docIds.length === 0) return;
            const { error: finErr } = await supabase.from('finance').update({ status: 'Paid' }).in('id', docIds);
            if (finErr) throw finErr;
            for (const id of docIds) {
                const localDoc = await db?.finance.findOne({ selector: { id } }).exec();
                if (localDoc) await localDoc.patch({ status: 'Paid' });
            }
            for (const req of destDocs) {
                const ids = req.related_ids || req.related_inventory_ids?.split(',') || [];
                if (ids.length > 0) {
                    if (req.description?.includes('%')) {
                        const perc = req.description.match(/(\d+)%/)?.[1];
                        await supabase.from('inventory').update({ pay_req: `paid ${perc || 'partial'}%` }).in('id', ids);
                    } else {
                        await supabase.from('inventory').update({ pay_req: true }).in('id', ids);
                    }
                }
            }

            toast.success('Payment successfully finalized.', { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error('Failed to mark as paid', { id: toastId });
        }
    };

    if (isLoading) return <LoadingIndicator />;

    return (
        <div className="flex flex-col h-full overflow-hidden p-4 md:p-8 bg-(--app-bg) gap-6 animate-in fade-in duration-500">
            {/* Header section */}
            <div className="flex items-end justify-between border-b border-(--border-color) pb-4 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-(--main-color)/10 border border-(--main-color)/20 rounded-2xl">
                        <LayoutDashboard size={24} className="text-(--main-color)" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-(--text-color) tracking-tight leading-none uppercase">Overview</h1>
                        <p className="text-[11px] font-black text-(--text-color-secondary) uppercase tracking-widest mt-2 flex items-center gap-2">
                            <Activity size={12} className="text-(--main-color)" /> Platform Synchronization Live
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-8 pb-10">
                {/* Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard icon={Database} label="Registered Database Entries" value={globalTotals.items.toLocaleString()} color="#A78BFA" />
                    <StatCard icon={Store} label="Current Acq Value" value={fmtUSD(globalTotals.acqValueUsd)} color="#34D399" />
                    <StatCard icon={Wallet} label="Pending Payments Reqs" value={fmtUSD(activeDestReqNetMXN / exchangeRate)} color="#FBBF24" />
                </div>

                {/* Split layout for pending requests destinations and Inventory */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Destinations Payments */}
                    <div className="bg-(--glass-bg) rounded-[32px] border border-(--border-color) p-6 shadow-sm overflow-hidden flex flex-col">
                        <div className="flex items-center gap-3 mb-6">
                            <RefreshCcw size={18} className="text-[#00AEEF]" />
                            <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-(--text-color)">Active Payments Status</h2>
                        </div>

                        <div className="flex-1 space-y-3">
                            {Object.entries(destinationsConfig).map(([key, cfg]) => {
                                const destDocs = activeDestPendingRecords.filter(d => d.destination === key);
                                const destReqMXN = destDocs.reduce((acc, d) => acc + (d.amount || 0) + (d.commission || 0), 0);
                                if (destReqMXN <= 0) return null;

                                return (
                                    <div key={key} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white/5 border border-(--border-color) hover:border-[#00AEEF]/40 transition-all rounded-2xl group gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-10 p-1 bg-white rounded flex items-center justify-center shadow-lg shrink-0">
                                                <img src={cfg.icon} alt={cfg.name} className="w-full h-full object-contain mix-blend-multiply" />
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-black text-(--text-color) uppercase tracking-widest">{cfg.name}</p>
                                                <p className="text-[9px] font-bold text-(--text-color-secondary) uppercase tracking-widest opacity-60">Pending Requests</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-lg font-mono font-black text-(--text-color) group-hover:text-[#00AEEF] transition-colors">{fmtMXN(destReqMXN)}</p>
                                                <p className="text-[10px] font-mono font-bold text-(--text-color-secondary)">≈ {fmtUSD(destReqMXN / exchangeRate)}</p>
                                            </div>
                                            <button
                                                onClick={() => handleMarkAsPaid(key, destReqMXN, destDocs)}
                                                className="w-full md:w-auto px-4 py-2 rounded-xl bg-(--main-color) text-black font-black text-[10px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-md shrink-0">
                                                Mark as Paid
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {activeDestPendingRecords.length === 0 && (
                                <div className="p-8 text-center text-(--text-color-secondary) text-[11px] font-black tracking-[0.2em] uppercase border-2 border-dashed border-(--border-color) rounded-3xl">
                                    No Pending Requisitions
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Vendors Inventory Chart */}
                    <div className="bg-(--glass-bg) rounded-[32px] border border-(--border-color) p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <Database size={18} className="text-(--main-color)" />
                            <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-(--text-color)">Top Registered Inventories</h2>
                        </div>
                        <div className="space-y-4">
                            {vendorSummaries.slice(0, 7).map(v => (
                                <div key={v.vendorId} className="flex items-center gap-4">
                                    <span className="w-10 text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary) text-right shrink-0">{v.vendorId}</span>
                                    <div className="flex-1 h-8 bg-black/10 rounded-xl overflow-hidden relative border border-(--border-color)">
                                        <div
                                            className="h-full rounded-xl transition-all duration-1000 ease-out flex items-center px-3"
                                            style={{ width: `${Math.max((v.itemCount / globalTotals.items) * 100, 5)}%`, backgroundColor: `${v.color}40` }}
                                        >
                                            <span className="text-[10px] font-black text-(--text-color) opacity-80 mix-blend-difference">{v.itemCount} Units</span>
                                        </div>
                                        <div className="absolute right-3 top-1/2 -translate-y-[1px] text-[10px] font-mono font-black text-(--text-color-secondary)">
                                            {fmtUSD(v.totalAcqUsd)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
