import React, { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai/react';
import { exchangeRateAtom, financeDataAtom } from '../../lib/atoms';
import { useDatabase } from '../../lib/hooks';
import { TrackingPaymentsView } from './TrackingPaymentsView';

export const FinanceView: React.FC = () => {
    const exchangeRate = useAtomValue(exchangeRateAtom);
    const db = useDatabase();
    const docs = useAtomValue(financeDataAtom);
    const [ver, setVer] = useState(0);
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        // DataSyncProvider handles background updates.
    }, [ver]);

    return (
        <div className="flex-1 flex flex-col relative">
            {/* Payments List */}
            <div className="flex-1">
                <TrackingPaymentsView docs={docs} exchangeRate={exchangeRate} onRefresh={refresh} />
            </div>
        </div>
    );
};
