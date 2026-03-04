

import React from 'react';
import { useAtom } from 'jotai/react';
import { dashboardActiveTabAtom } from '../../lib/atoms';
import { PaymentsView } from './PaymentsView';
import { ShippingView } from './ShippingView';
import { AcquisitionsView } from './AcquisitionsView';

export function Dashboard() {
    const [activeTab] = useAtom(dashboardActiveTabAtom);

    const renderContent = () => {

        switch (activeTab) {
            case 'acquisitions':
                return <AcquisitionsView mode="live" />;
            case 'payments':
                return <PaymentsView mode="live" />;
            case 'shipping':
                return <ShippingView mode="live" />;
            default:
                return <AcquisitionsView mode="live" />;
        }
    };

    return (
        <div className="dashboard">
            {renderContent()}
        </div>
    );
}