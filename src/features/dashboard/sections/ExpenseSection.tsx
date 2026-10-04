import React from 'react';
import { Calendar, FlaskConical, HandCoins, Truck, Wrench, Activity } from 'lucide-react';
import { tr } from '../../../lib/i18n';
import { useAtomValue } from 'jotai';
import { showFinancialsAtom, currencyModeAtom } from '../../../lib/atoms';

interface ExpenseSectionProps {
    opsBreakdown: {
        Monthly: { mxn: number; usd: number; tag: 'MONTHLY' };
        Supplies: { mxn: number; usd: number; tag: 'SPPL' };
        Labor: { mxn: number; usd: number; tag: 'LABR' };
        Packing: { mxn: number; usd: number; tag: 'PACK' };
        Operations: { mxn: number; usd: number; tag: 'OPRT' };
    };
}

export const ExpenseSection: React.FC<ExpenseSectionProps> = ({ opsBreakdown }) => {
    const showFinancials = useAtomValue(showFinancialsAtom);
    const currencyMode = useAtomValue(currencyModeAtom);

    const cats = [
        { label: 'Monthly', val: opsBreakdown.Monthly, color: '#4f46e5', Icon: Calendar },
        { label: 'Supplies', val: opsBreakdown.Supplies, color: '#0891b2', Icon: FlaskConical },
        { label: tr("Labor/Fees"), val: opsBreakdown.Labor, color: '#9333ea', Icon: HandCoins },
        { label: tr("Logistics/Pack"), val: opsBreakdown.Packing, color: '#6366f1', Icon: Truck },
        { label: tr("Operations"), val: opsBreakdown.Operations, color: '#2563eb', Icon: Wrench },
    ];

    return (
        <section aria-label="Expense Breakdown">
            <div className="flex items-center gap-3 mb-6 px-2">
                <Activity size={16} strokeWidth={2.5} className="text-blue-500" />
                <h2 className="text-[14px] font-black uppercase tracking-[0.2em] text-(--text-color)">{tr("Operations Breakdown")}</h2>
            </div>
            <div className="bg-white/[0.03] backdrop-blur-2xl p-6 rounded-3xl border border-white/10 shadow-2xl">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
                    {cats.map(cat => (
                        <div key={cat.label} className="flex flex-col gap-2 border-l border-white/10 pl-4 hover:border-l-2 transition-all" style={{ borderLeftColor: cat.color }}>
                            <div className="flex items-center gap-2">
                                <cat.Icon size={11} style={{ color: cat.color }} strokeWidth={2.5} />
                                <p className="text-[9px] font-black uppercase tracking-widest text-(--text-color)">{cat.label}</p>
                            </div>
                            <p className="text-lg font-mono font-black text-(--text-color) tracking-tight">
                                <span className="text-[9px] text-(--text-color-secondary) mr-1">{currencyMode}</span>
                                {showFinancials 
                                    ? (currencyMode === 'MXN' ? cat.val.mxn : cat.val.usd).toLocaleString('en-US', { maximumFractionDigits: 0 })
                                    : '***'
                                }
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
