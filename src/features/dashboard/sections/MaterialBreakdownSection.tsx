import React, { useMemo } from 'react';
import { Shapes, Layers } from 'lucide-react';
import { tr } from '../../../lib/i18n';
import { EChart } from '../../../components/EChart';
import type { EChartsOption } from 'echarts';

interface MaterialBreakdownSectionProps {
    attributeStats: {
        topCM: [string, number][];
        topSD: [string, number][];
    };
}

export const MaterialBreakdownSection: React.FC<MaterialBreakdownSectionProps> = ({ attributeStats }) => {
    const pieOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'item' },
        series: [{
            type: 'pie', radius: ['40%', '70%'],
            data: attributeStats.topCM.map(([label, count]) => ({ name: String(label), value: Number(count) })),
            itemStyle: { borderRadius: 10, borderColor: '#000', borderWidth: 5 },
            label: { show: false }
        }],
        color: ['#A78BFA', '#34D399', '#00AEEF', '#FBBF24', '#F87171', '#EC4899', '#6366F1', '#8B5CF6'],
        backgroundColor: 'transparent'
    }), [attributeStats]);

    const categoriesOption = useMemo<EChartsOption>(() => ({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: attributeStats.topSD.slice(0, 8).map(([label]) => String(label).split(' - ')[0]), axisLabel: { rotate: 45, color: 'var(--text-color-secondary)', fontSize: 8 } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: 'var(--border-color)' } } },
        series: [{
            type: 'pictorialBar', symbol: 'roundRect',
            data: attributeStats.topSD.slice(0, 8).map(([, count]) => count),
            itemStyle: { color: '#6BCEBB' }
        }],
        backgroundColor: 'transparent'
    }), [attributeStats]);

    return (
        <section aria-label="Material and Shape Breakdown">
            <div className="flex items-center gap-3 mb-6 px-2">
                <Shapes size={16} strokeWidth={2.5} className="text-purple-500" />
                <h2 className="text-[14px] font-black uppercase tracking-[0.2em] text-(--text-color)">{tr("What do we hold?")}</h2>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Material Donut */}
                <div className="bg-white/[0.03] backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-4 self-start">
                        <Layers size={14} className="text-purple-400" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary)">{tr("Color & Material")}</h3>
                    </div>
                    <div className="w-full h-64 relative">
                        {attributeStats.topCM.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">{tr("No Data")}</div>
                        ) : (
                            <EChart option={pieOption} className="w-full h-full" />
                        )}
                    </div>
                    {/* Accessible text summary */}
                    <div className="sr-only">
                        {attributeStats.topCM.map(([label, count]) => `${label}: ${count} units`).join(', ')}
                    </div>
                </div>

                {/* Shape Pictorial Bar */}
                <div className="bg-white/[0.03] backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-4 self-start">
                        <Shapes size={14} className="text-teal-400" />
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-color-secondary)">{tr("Top Shapes")}</h3>
                    </div>
                    <div className="w-full h-64 relative">
                        {attributeStats.topSD.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-(--text-color-secondary)">{tr("No Data")}</div>
                        ) : (
                            <EChart option={categoriesOption} className="w-full h-full" />
                        )}
                    </div>
                    <div className="sr-only">
                        {attributeStats.topSD.map(([label, count]) => `${label.split(' - ')[0]}: ${count} units`).join(', ')}
                    </div>
                </div>
            </div>
        </section>
    );
};
