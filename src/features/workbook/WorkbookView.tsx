import React, { useState } from 'react';
import { useAtom } from 'jotai/react';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import {
    workbookActiveTabAtom
} from '../../lib/atoms';
import { AcquisitionsView } from '../dashboard/AcquisitionsView';
import { PaymentsView } from '../dashboard/PaymentsView';
import { WorkbookShippingView } from './WorkbookShippingView';
import { WorkbookLogView } from './WorkbookLogView';
import { WorkbookProductionView } from './WorkbookProductionView';
import { WorkbookSuppliesView } from './WorkbookSuppliesView';
import { WorkbookCratesView } from './WorkbookCratesView';
import { WorkbookPayLogView } from './WorkbookPayLogView';

interface WorkbookViewProps { }

export const WorkbookView: React.FC<WorkbookViewProps> = () => {
    const [activeTab] = useAtom(workbookActiveTabAtom);
    const [isLoading] = useState<boolean>(false);
    const [error] = useState<string | null>(null);

    return (
        <div className="flex flex-col h-full gap-4 p-4 overflow-hidden font-sans">
            <div className="shrink-0 px-2 overflow-hidden">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-4 rounded-lg flex items-center gap-3">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        {error}
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex-grow flex items-center justify-center"><LoadingIndicator /></div>
            ) : (
                <div className="flex-grow overflow-hidden">
                    {activeTab === 'inventory' && <AcquisitionsView mode="archive" />}
                    {activeTab === 'expenses' && <AcquisitionsView mode="archive" />}
                    {activeTab === 'shipping' && <WorkbookShippingView />}
                    {activeTab === 'payments' && <PaymentsView mode="archive" />}
                    {activeTab === 'log' && <WorkbookLogView />}
                    {activeTab === 'production' && <WorkbookProductionView />}
                    {activeTab === 'supplies' && <WorkbookSuppliesView />}
                    {activeTab === 'crates' && <WorkbookCratesView />}
                    {activeTab === 'paylog' && <WorkbookPayLogView />}
                </div>
            )}
        </div>
    );
};
