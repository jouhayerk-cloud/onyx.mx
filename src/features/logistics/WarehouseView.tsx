
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
            {/* Minimalist Sub-navigation within Warehouse */}
            <div className="px-8 py-4 flex items-center gap-8 border-b border-white/5 bg-black/5">
                <button 
                    onClick={() => setActiveTab('empty')}
                    className={`flex items-center gap-2.5 transition-all ${activeTab === 'empty' ? 'text-(--main-color)' : 'text-white/40 hover:text-white'}`}
                >
                    <Box size={18} strokeWidth={2.5} />
                    <span className="text-[11px] font-black uppercase tracking-widest">Empty Crates</span>
                </button>

                <button 
                    onClick={() => setActiveTab('packed')}
                    className={`flex items-center gap-2.5 transition-all ${activeTab === 'packed' ? 'text-(--main-color)' : 'text-white/40 hover:text-white'}`}
                >
                    <Package size={18} strokeWidth={2.5} />
                    <span className="text-[11px] font-black uppercase tracking-widest">Packed Crates</span>
                </button>

                <div className="h-4 w-px bg-white/10 ml-auto" />

                <button className="flex items-center gap-2.5 text-white/40 hover:text-white transition-all">
                    <Filter size={16} strokeWidth={2.5} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Global Filter</span>
                </button>
            </div>

            <div className="flex-1 overflow-hidden">
                <CratesInventoryView />
            </div>
        </div>
    );
};
