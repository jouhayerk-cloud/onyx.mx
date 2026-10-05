import React, { useState } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { Search, LayoutGrid, Layout, LayoutList, Filter } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { vendors } from '../../lib/consts';
import {
    storeSearchTermAtom,
    storeActiveVendorFilterAtom,
    storeVendorOptionsAtom,
    storeViewModeAtom
} from '../../lib/atoms';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';

export interface StoreWidgets {
    DeployableSearch: React.ComponentType<any>;
}

export function useStoreTools(widgets: StoreWidgets): ToolDescriptor[] {
    const [search, setSearch] = useAtom(storeSearchTermAtom);
    const [vendorFilter, setVendorFilter] = useAtom(storeActiveVendorFilterAtom);
    const vendorOptions = useAtomValue(storeVendorOptionsAtom);
    const [viewMode, setViewMode] = useAtom(storeViewModeAtom);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const tools: ToolDescriptor[] = [];

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
                placeholder={tr("FIND ON STORE...")}
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

    return tools;
}

export const StoreToolsRegistrar: React.FC<{ widgets: StoreWidgets }> = ({ widgets }) => {
    const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
    const tools = useStoreTools(widgets);

    useRegisterTools('store', tools, islandEnabled);

    return null;
};
