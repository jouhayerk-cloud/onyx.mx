import React, { useEffect, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { financeSubTabAtom, exchangeRateAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { TrackingPaymentsView } from './TrackingPaymentsView';

const fmt = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const FinanceView: React.FC = () => {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();
    const [docs, setDocs] = useState<any[]>([]);
    const [ver, setVer] = useState(0);
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        if (!db) return;
        let timer: any;
        const sub = db.finance.find().$.subscribe((d: any[]) => {
            clearTimeout(timer);
            timer = setTimeout(() => setDocs(d.map((x: any) => x.toJSON())), 200);
        });
        return () => { sub.unsubscribe(); clearTimeout(timer); };
    }, [db, ver]);

    const grandTotal = docs.reduce((a, b) => a + (b.amount || 0), 0);
    const paid = docs.filter(d => d.status === 'Paid').reduce((a, b) => a + (b.amount || 0), 0);
    const pending = grandTotal - paid;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Contextual status strip ── */}
            <div className="flex items-center gap-6 px-6 py-2 bg-white/1.5 border-b border-white/4 shrink-0">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Total</span>
                    <span className="text-sm font-mono font-black text-[#00AEEF]">{fmt(grandTotal)}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Paid</span>
                    <span className="text-sm font-mono font-black text-[#8DC63F]">{fmt(paid)}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Pending</span>
                    <span className="text-sm font-mono font-black text-[#FFED00]">{fmt(pending)}</span>
                </div>
                <div className="ml-auto flex flex-col items-end">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">≈ USD</span>
                    <span className="text-sm font-mono font-black text-white/30">{fmt(grandTotal / exchangeRate)}</span>
                </div>
            </div>
            {/* ── Content ── */}
            <div className="flex-1 overflow-hidden">
                <TrackingPaymentsView docs={docs} exchangeRate={exchangeRate} onRefresh={refresh} />
            </div>
        </div>
    );
};
