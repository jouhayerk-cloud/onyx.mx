
import React, { useState } from 'react';
import { useAtom } from 'jotai';
import { logisticsSubTabAtom } from '../../lib/atoms';
import { CratesInventoryView } from './CratesInventoryView';
import { Box, Package, Archive, Filter } from 'lucide-react';

export const WarehouseView: React.FC = () => {
    const [activeTab, setActiveTab] = useAtom(logisticsSubTabAtom);

    // activeTab will be 'empty' or 'inventory' (packed)
    // CratesInventoryView already handles data fetching and display.
    // We can pass a filter prop or let it read the atom.

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-hidden">
                <CratesInventoryView />
            </div>
        </div>
    );
};
