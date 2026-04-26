import React, { useEffect, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { financeSubTabAtom, exchangeRateAtom, financeDataAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { TrackingPaymentsView } from './TrackingPaymentsView';

const fmt = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const FinanceView: React.FC = () => {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();
    const docs = useAtomValue(financeDataAtom);
    const [ver, setVer] = useState(0);
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        // ver remains to allow manual refreshes if needed, 
        // though DataSyncProvider handles background updates.
    }, [ver]);

    const grandTotal = docs.reduce((a, b) => a + (b.amount || 0), 0);
    const paid = docs.filter(d => d.status === 'Paid').reduce((a, b) => a + (b.amount || 0), 0);
    const pending = grandTotal - paid;

    return (
        <div className="flex flex-col">
            {/* ── Content ── */}
            <div className="flex-1">
                <TrackingPaymentsView docs={docs} exchangeRate={exchangeRate} onRefresh={refresh} />
            </div>
        </div>
    );
};
