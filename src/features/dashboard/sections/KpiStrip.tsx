import React from 'react';
import { Package, Wallet, Layers, Shapes, Truck, ShieldAlert } from 'lucide-react';
import { tr } from '../../../lib/i18n';
import { useAtomValue } from 'jotai';
import { showFinancialsAtom, currencyModeAtom } from '../../../lib/atoms';

interface KpiStripProps {
    totalItems: number;
    totalAcqUsd: number;
    totalAcqMxn: number;
    totalLiabilityMxn: number;
    totalLiabilityUsd: number;
    logisticsSpendMxn: number;
    logisticsSpendUsd: number;
    opsSpendMxn: number;
    opsSpendUsd: number;
    currentExchangeRate: number;
}

export const KpiStrip: React.FC<KpiStripProps> = ({
    totalItems,
    totalAcqUsd,
    totalAcqMxn,
    totalLiabilityMxn,
    totalLiabilityUsd,
    logisticsSpendMxn,
    logisticsSpendUsd,
    opsSpendMxn,
    opsSpendUsd,
}) => {
    const showFinancials = useAtomValue(showFinancialsAtom);
    const currencyMode = useAtomValue(currencyModeAtom);

    const fmt = (usd: number, mxn: number) => {
        if (!showFinancials) return '***';
        const val = currencyMode === 'MXN' ? mxn : usd;
        return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const metrics = [
        { label: tr("Total Units"), value: totalItems.toLocaleString(), icon: Package, color: 'var(--main-color)' },
        { label: tr("Asset Value"), value: fmt(totalAcqUsd, totalAcqMxn), icon: Wallet, color: '#34D399' },
        { label: tr("Logistics Spend"), value: fmt(logisticsSpendUsd, logisticsSpendMxn), icon: Truck, color: '#F59E0B' },
        { label: tr("Operations Spend"), value: fmt(opsSpendUsd, opsSpendMxn), icon: Layers, color: '#3B82F6' },
        { label: tr("Liability"), value: fmt(totalLiabilityUsd, totalLiabilityMxn), icon: ShieldAlert, color: '#EF4444' },
    ];

    return (
        <section aria-label="Key Performance Indicators" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <h2 className="sr-only">Where do we stand?</h2>
            {metrics.map((m, i) => (
                <div key={i} className="flex flex-col gap-3 p-6 bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-2xl shadow-xl transition-all hover:bg-white/[0.05] group">
                    <div className="flex items-center justify-between">
                        <div style={{ color: m.color }}>
                            <m.icon size={28} strokeWidth={1.5} />
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-(--text-color-secondary) mb-1">{m.label}</p>
                        <p className="text-2xl font-black font-mono text-(--text-color) leading-none tracking-tighter truncate" title={m.value}>{m.value}</p>
                    </div>
                </div>
            ))}
        </section>
    );
};
