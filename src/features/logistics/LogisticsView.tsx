import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import toast from 'react-hot-toast';
import { logisticsSubTabAtom, userAtom, isDummyModeAtom, logisticsDocsAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { CratesInventoryView } from './CratesInventoryView';
import { WarehouseView } from './WarehouseView';
import { TruckingModule } from './TruckingModule';
import { PackingModule } from './PackingModule';
import { DeployedView } from './DeployedView';

export const LogisticsView: React.FC = () => {
    const [activeTab, setActiveTab] = useAtom(logisticsSubTabAtom);
    const setLogisticsDocs = useSetAtom(logisticsDocsAtom);
    const db = useDatabase();
    const [docs, setDocs] = useState<any[]>([]);
    const [ver, setVer] = useState(0);
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        if (!db) return;
        let timer: any;
        const sub = db.logistics.find().$.subscribe(d => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const data = d.map(x => x.toJSON());
                setDocs(data);
                setLogisticsDocs(data);
            }, 200);
        });
        return () => { sub.unsubscribe(); clearTimeout(timer); };
    }, [db, ver, setLogisticsDocs]);

    return (
        <div className="flex flex-col h-full flex-1 min-h-0">
            {/* ── Content ── */}
            <div className="flex-1">
                {activeTab === 'shipping' ? (
                    <TruckingModule docs={docs} onRefresh={refresh} />
                ) : activeTab === 'deployed' ? (
                    <DeployedView />
                ) : activeTab === 'packing' ? (
                    <PackingModule />
                ) : (
                    <WarehouseView />
                )}
            </div>
        </div>
    );
};
