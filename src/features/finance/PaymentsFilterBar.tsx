
import React from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { 
    Filter, LayoutGrid, DollarSign, Cpu, Calendar, Activity, Archive, Box, Users, Search, X 
} from 'lucide-react';
import { 
    paymentDestinationFilterAtom, 
    paymentCategoryFilterAtom, 
    paymentStatusFilterAtom,
    paymentFilterBarModeAtom,
    PaymentStatusFilter,
    PaymentCategory
} from '../../lib/atoms';
import { destinationsConfig } from '../../lib/paymentConfig';

const SUBCATEGORIES: PaymentCategory[] = ['All', 'Acq', 'Prod', 'Monthly', 'Sppl', 'Labr', 'Packing', 'Oprt'];

export const PaymentsFilterBar: React.FC = () => {
    const [destinationFilter, setDestinationFilter] = useAtom(paymentDestinationFilterAtom);
    const [subcatFilter, setSubcatFilter] = useAtom(paymentCategoryFilterAtom);
    const [statusFilter, setStatusFilter] = useAtom(paymentStatusFilterAtom);
    const showFilters = useAtomValue(paymentFilterBarModeAtom) !== 'off';

    if (!showFilters) return null;

    return (
        <div className="flex-none flex flex-col border-b border-white/10 animate-in slide-in-from-top-2 duration-300 bg-black/20 backdrop-blur-3xl z-[90] sticky top-36 sm:top-48">
            <div className="flex items-center gap-2 px-6 py-2 overflow-x-auto no-scrollbar">
                {/* Status Filter Indicator */}
                <button 
                    onClick={() => setStatusFilter(prev => prev === 'All' ? 'Paid' : prev === 'Paid' ? 'Requested' : 'All')}
                    className="flex items-center justify-center w-[50px] h-[50px] transition-all duration-300 transform active:scale-90 shrink-0 group focus:outline-none"
                    title={`Filter Status: ${statusFilter}`}
                >
                    <div className={`w-[20px] h-[20px] rounded-full! border-2 transition-all duration-300 ${
                        statusFilter === 'All' 
                            ? 'bg-white/5 border-white/20 group-hover:border-white/40' 
                            : statusFilter === 'Paid'
                                ? 'bg-[#22c55e] border-[#22c55e]/20 shadow-[0_0_12px_rgba(34,197,94,0.3)]'
                                : 'bg-[#eab308] border-[#eab308]/20 shadow-[0_0_12px_rgba(234,179,8,0.3)]'
                    }`} />
                </button>

                <div className="w-px h-4 bg-white/10 shrink-0 mx-1" />

                {/* Subcategories Filter */}
                <div className="flex items-center gap-2">
                    {SUBCATEGORIES.map(s => {
                        const labels: Record<string, { label: string; icon: any; color: string }> = {
                            'All': { label: 'ALL', icon: LayoutGrid, color: '#888' },
                            'Acq': { label: 'ACQUISITION', icon: DollarSign, color: '#10b981' },
                            'Prod': { label: 'PRODUCTION', icon: Cpu, color: '#6366f1' },
                            'Monthly': { label: 'MONTHLY', icon: Calendar, color: '#38bdf8' },
                            'Oprt': { label: 'OPERATION', icon: Activity, color: '#818cf8' },
                            'Packing': { label: 'PACKING', icon: Archive, color: '#fb7185' },
                            'Sppl': { label: 'SUPPLIES', icon: Box, color: '#34d399' },
                            'Labr': { label: 'LABOR', icon: Users, color: '#fbbf24' }
                        };
                        const cfg = labels[s];
                        if (!cfg) return null;
                        const isActive = subcatFilter === s;
                        return (
                            <button key={s} onClick={() => setSubcatFilter(s)}
                                className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl border transition-all whitespace-nowrap shrink-0 group/f ${isActive ? 'bg-white/10 border-white/20' : 'bg-transparent border-transparent hover:bg-white/5'}`}>
                                <cfg.icon size={16} style={{ color: isActive ? cfg.color : '#666' }} className={`transition-all ${isActive ? 'scale-110 grayscale-0' : 'scale-100 grayscale'}`} />
                                <span className={`text-[8px] font-black tracking-[0.2em] transition-all uppercase`} style={{ color: isActive ? cfg.color : '#666' }}>
                                    {cfg.label}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Account Filter (Large Free-Floating Icons) */}
                <div className="flex items-center gap-2 shrink-0 px-2 lg:px-4">
                    {Object.entries(destinationsConfig).map(([key, cfg]) => {
                        const isActive = destinationFilter === key;
                        return (
                            <button key={key} onClick={() => setDestinationFilter(destinationFilter === key ? 'All' : key as any)}
                                className={`relative group transition-all transform hover:scale-110 active:scale-95 ${isActive ? 'grayscale-0 opacity-100' : 'grayscale opacity-30 hover:opacity-100 hover:grayscale-0'}`}>
                                <div className="w-10 h-7 flex items-center justify-center">
                                    <img src={cfg.icon} alt={cfg.name} className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                                </div>
                                {isActive && (
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-(--main-color) shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                                )}
                                {/* Hover Label */}
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-0.5 rounded text-[7px] font-black text-white/60 uppercase opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none tracking-widest border border-white/10">
                                    {cfg.name}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
