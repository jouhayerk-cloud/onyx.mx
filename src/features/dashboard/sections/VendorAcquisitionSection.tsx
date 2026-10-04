import React, { useMemo } from 'react';
import { Users, PieChart, BarChart3 } from 'lucide-react';
import { tr } from '../../../lib/i18n';
import { EChart } from '../../../components/EChart';
import type { EChartsOption } from 'echarts';
import { useAtomValue } from 'jotai';
import { showFinancialsAtom, currencyModeAtom } from '../../../lib/atoms';

interface VendorAcquisitionSectionProps {
    vendorSummaries: {
        vendorId: string;
        color: string;
        itemCount: number;
        totalAcqMxn: number;
        totalAcqUsd: number;
    }[];
    currentExchangeRate: number;
}

export const VendorAcquisitionSection: React.FC<VendorAcquisitionSectionProps> = ({ vendorSummaries, currentExchangeRate }) => {
    const showFinancials = useAtomValue(showFinancialsAtom);
    const currencyMode = useAtomValue(currencyModeAtom);

    const fmt = (usd: number, mxn: number) => {
        if (!showFinancials) return '***';
        const val = currencyMode === 'MXN' ? mxn : usd;
        return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const vendorChartOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
        xAxis: { 
            type: 'value', 
            axisLine: { show: false }, 
            splitLine: { lineStyle: { color: 'var(--border-color)' } }, 
            axisLabel: { color: 'var(--text-color-secondary)', fontSize: 10, formatter: (val: any) => currencyMode === 'MXN' ? `$${(val/1000).toFixed(0)}k` : `$${(val/1).toFixed(0)}` } 
        },
        yAxis: { 
            type: 'category', 
            data: vendorSummaries.map(v => v.vendorId), 
            axisLine: { show: false }, 
            axisTick: { show: false }, 
            axisLabel: { color: 'var(--text-color)', fontWeight: 'bold' } 
        },
        series: [{
            name: currencyMode === 'MXN' ? 'Value MXN' : 'Value USD', 
            type: 'bar', 
            data: vendorSummaries.map(v => currencyMode === 'MXN' ? v.totalAcqMxn : v.totalAcqUsd),
            itemStyle: { color: (params: any) => vendorSummaries[params.dataIndex].color, borderRadius: [0, 8, 8, 0] }
        }],
        backgroundColor: 'transparent'
    }), [vendorSummaries, currencyMode]);

    const vendorValuePieOption = useMemo<EChartsOption>(() => ({
        tooltip: { 
            trigger: 'item', 
            formatter: (p: any) => `${p.name}: ${fmt(p.value, p.value * currentExchangeRate)} (${p.percent}%)` 
        },
        series: [{
            name: 'Acq Value', type: 'pie', radius: ['45%', '72%'], center: ['50%', '50%'],
            data: vendorSummaries.map(v => ({ name: v.vendorId, value: v.totalAcqUsd })),
            label: { show: false },
            itemStyle: { borderRadius: 6, borderColor: 'rgba(0,0,0,0.4)', borderWidth: 1 }
        }],
        color: vendorSummaries.map(v => v.color),
        backgroundColor: 'transparent',
    }), [vendorSummaries, currencyMode, currentExchangeRate, showFinancials]);

    return (
        <section aria-label="Vendor Acquisition Analysis">
            <div className="flex items-center gap-3 mb-6 px-2">
                <Users size={16} strokeWidth={2.5} className="text-emerald-500" />
                <h2 className="text-[14px] font-black uppercase tracking-[0.2em] text-(--text-color)">{tr("Where does it come from?")}</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Bar Chart */}
                <div className="lg:col-span-8 bg-white/[0.03] backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl flex flex-col">
                    <div className="flex items-center gap-2 mb-4 self-start">
                        <BarChart3 size={14} className="text-emerald-400" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary)">{tr("Acquisition by Vendor")}</h3>
                    </div>
                    <div className="w-full h-80 relative">
                        {vendorSummaries.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">{tr("No Data")}</div>
                        ) : (
                            <EChart option={vendorChartOption} className="w-full h-full" />
                        )}
                    </div>
                    <div className="sr-only">
                        {vendorSummaries.map(v => `${v.vendorId}: ${fmt(v.totalAcqUsd, v.totalAcqMxn)}`).join(', ')}
                    </div>
                </div>

                {/* Pie Chart & Top List */}
                <div className="lg:col-span-4 bg-white/[0.03] backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl flex flex-col gap-6">
                    <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2 mb-4 self-start">
                            <PieChart size={14} className="text-emerald-400" />
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary)">{tr("Distribution")}</h3>
                        </div>
                        <div className="w-full h-48 relative">
                            {vendorSummaries.length === 0 ? (
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">{tr("No Data")}</div>
                            ) : (
                                <EChart option={vendorValuePieOption} className="w-full h-full" />
                            )}
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                        {vendorSummaries.slice(0, 5).map(v => (
                            <div key={v.vendorId} className="flex items-center justify-between p-3 bg-white/[0.05] border border-white/5 border-l-2 hover:bg-white/10 transition-all rounded-lg" style={{ borderLeftColor: v.color }}>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-(--text-color)">{v.vendorId}</span>
                                    <span className="text-[11px] font-mono font-black text-(--text-color)">
                                        {fmt(v.totalAcqUsd, v.totalAcqMxn)}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[8px] font-bold uppercase tracking-widest text-(--text-color-secondary)">{tr("Units")}</span>
                                    <p className="text-[10px] font-mono font-black text-(--text-color)">{v.itemCount}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
