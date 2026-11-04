import React, { useState } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { Search, LayoutGrid, Layout, LayoutList, Filter, Plus, Archive } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { vendors } from '../../lib/consts';
import {
    storeSearchTermAtom,
    storeActiveVendorFilterAtom,
    storeVendorOptionsAtom,
    storeViewModeAtom,
    showroomTabAtom,
    userAtom
} from '../../lib/atoms';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';

export interface StoreWidgets {
    DeployableSearch: React.ComponentType<any>;
}

/** Builds the showroom tool entries: mode toggles, search, vendor filter and view mode in Onyx Island. */

export function useStoreTools(widgets: StoreWidgets): ToolDescriptor[] {
    const [search, setSearch] = useAtom(storeSearchTermAtom);
    const [vendorFilter, setVendorFilter] = useAtom(storeActiveVendorFilterAtom);
    const vendorOptions = useAtomValue(storeVendorOptionsAtom);
    const [viewMode, setViewMode] = useAtom(storeViewModeAtom);
    const [tab, setTab] = useAtom(showroomTabAtom);
    const user = useAtomValue(userAtom);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const isClient = user?.role?.startsWith('Client');
    const isAdminOrDev = user?.role === 'Admin' || user?.role === 'Developer';

    const tools: ToolDescriptor[] = [];

    // Primary Mode Switchers in Onyx Island (Docked beside face in COMPACT mode)
    tools.push({
        id: 'store.mode.live',
        moduleId: 'store',
        label: tr('Showroom'),
        short: tr('Showroom'),
        title: tr('Live Showroom'),
        icon: LayoutGrid,
        kind: 'toggle',
        group: tr('Showroom Mode'),
        order: 1,
        pinned: true,
        dock: 'left',
        essential: true,
        pressed: tab === 'live',
        run: () => setTab('live'),
    });

    if (!isClient) {
        tools.push({
            id: 'store.mode.add',
            moduleId: 'store',
            label: tr('Add Show'),
            short: tr('Add Show'),
            title: tr('Add Showroom Intake (On-device Staging)'),
            icon: Plus,
            kind: 'toggle',
            group: tr('Showroom Mode'),
            order: 2,
            pinned: true,
            dock: 'right',
            essential: true,
            pressed: tab === 'add',
            run: () => setTab('add'),
        });
    }

    if (isAdminOrDev) {
        tools.push({
            id: 'store.mode.archive',
            moduleId: 'store',
            label: tr('Archive'),
            short: tr('Archive'),
            title: tr('Archived Showroom Items'),
            icon: Archive,
            kind: 'toggle',
            group: tr('Showroom Mode'),
            order: 3,
            pinned: false,
            pressed: tab === 'archive',
            run: () => setTab('archive'),
        });
    }

    if (tab !== 'add') {
        tools.push({
            id: 'store.search',
            moduleId: 'store',
            label: tr('Search'),
            icon: Search,
            kind: 'widget',
            group: tr('Find'),
            order: 10,
            pinned: true,
            render: () => (
                <widgets.DeployableSearch 
                    value={search} 
                    onChange={setSearch} 
                    isOpen={isSearchOpen} 
                    setIsOpen={setIsSearchOpen} 
                    accentColor="var(--color-store)"
                    placeholder={tr("FIND ON SHOWROOM...")}
                />
            )
        });

        tools.push({
            id: 'store.vendors',
            moduleId: 'store',
            label: tr('Vendors'),
            icon: Filter,
            kind: 'widget',
            group: tr('Filters'),
            order: 20,
            pinned: true,
            render: () => (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {vendorOptions.map(v => {
                        const vColor = (vendors as Record<string, { color: string }>)[v]?.color || 'var(--text-color)';
                        const isActive = vendorFilter === v;
                        return (
                            <button
                                key={v}
                                onClick={() => setVendorFilter(v)}
                                className={`shrink-0 px-3.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.2em] transition-all border
                                    ${isActive 
                                        ? 'text-black shadow-lg' 
                                        : 'bg-white/3 border-white/3 text-(--text-color)/30 hover:text-(--text-color) hover:bg-white/10'}`}
                                style={{ 
                                    borderColor: isActive ? vColor : (v !== 'All' ? `${vColor}40` : ''),
                                    backgroundColor: isActive ? vColor : '',
                                    color: isActive ? 'black' : (v !== 'All' ? vColor : '')
                                }}
                            >
                                {v}
                            </button>
                        );
                    })}
                </div>
            )
        });

        const modes = ['grid', 'gallery', 'list'] as const;
        const viewIcon = viewMode === 'grid' ? LayoutGrid : viewMode === 'gallery' ? Layout : LayoutList;

        tools.push({
            id: 'store.view',
            moduleId: 'store',
            label: viewMode.toUpperCase(),
            title: tr('Toggle view mode'),
            icon: viewIcon,
            kind: 'action',
            group: tr('View'),
            order: 30,
            pinned: true,
            run: () => {
                const nextIdx = (modes.indexOf(viewMode as any) + 1) % modes.length;
                setViewMode(modes[nextIdx]);
            }
        });
    }

    return tools;
}

export const StoreToolsRegistrar: React.FC<{ widgets: StoreWidgets }> = ({ widgets }) => {
    const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
    const tools = useStoreTools(widgets);

    useRegisterTools('store', tools, islandEnabled);

    return null;
};
