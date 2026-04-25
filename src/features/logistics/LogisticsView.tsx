import React, { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import toast from 'react-hot-toast';
import { logisticsSubTabAtom, userAtom, isDummyModeAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useDatabase } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { CratesInventoryView } from './CratesInventoryView';
import { CratePackingManager } from './CratePackingManager';
import { TruckingModule } from './TruckingModule';

export const LogisticsView: React.FC = () => {
    const [activeTab, setActiveTab] = useAtom(logisticsSubTabAtom);
    const db = useDatabase();
    const [docs, setDocs] = useState<any[]>([]);
    const [ver, setVer] = useState(0);
    const refresh = () => setVer(v => v + 1);

    useEffect(() => {
        if (!db) return;
        let timer: any;
        const sub = db.logistics.find().$.subscribe(d => {
            clearTimeout(timer);
            timer = setTimeout(() => setDocs(d.map(x => x.toJSON())), 200);
        });
        return () => { sub.unsubscribe(); clearTimeout(timer); };
    }, [db, ver]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Content ── */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'packing' ? (
                    <CratePackingManager />
                ) : activeTab === 'shipping' ? (
                    <TruckingModule docs={docs} onRefresh={refresh} />
                ) : (
                    <CratesInventoryView />
                )}
            </div>
        </div>
    );
};
