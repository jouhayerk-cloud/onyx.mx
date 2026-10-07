import React from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import {
    Pointer, Wrench, LayoutTemplate, Filter, Search as SearchIcon, Tag, Plus
} from 'lucide-react';
import { tr } from '../../lib/i18n';
import {
    inventorySearchTermAtom,
    isInventoryFiltersPanelOpenAtom,
    isInventoryViewSliderOpenAtom,
    isInventorySelectionModeAtom,
    selectedInventoryIdsAtom,
    isInventorySearchOpenAtom,
    inventoryToolsOpenAtom,
    isInventorySmartFiltersOpenAtom,
    activeViewAtom,
    inventoryStatusFilterAtom,
    isUploadWizardOpenAtom
} from '../../lib/atoms';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';

export interface InventoryWidgets {
    DeployableSearch: React.ComponentType<any>;
    InventoryAddButton: React.ComponentType;
}

export function useInventoryTools(widgets: InventoryWidgets): ToolDescriptor[] {
    const [search] = useAtom(inventorySearchTermAtom);
    const [isFiltersOpen, setIsFiltersOpen] = useAtom(isInventoryFiltersPanelOpenAtom);
    const [isViewSliderOpen, setIsViewSliderOpen] = useAtom(isInventoryViewSliderOpenAtom);
    const [isSelectionMode, setIsSelectionMode] = useAtom(isInventorySelectionModeAtom);
    const [selectedIds, setSelectedIds] = useAtom(selectedInventoryIdsAtom);
    const [statusFilter, setStatusFilter] = useAtom(inventoryStatusFilterAtom);
    const setIsUploadWizardOpen = useSetAtom(isUploadWizardOpenAtom);
    const [isSearchOpen, setIsSearchOpen] = useAtom(isInventorySearchOpenAtom);
    const setView = useSetAtom(activeViewAtom);
    const [showTools, setShowTools] = useAtom(inventoryToolsOpenAtom);
    const [showSmart, setShowSmart] = useAtom(isInventorySmartFiltersOpenAtom);

    const handleToggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        if (isSelectionMode) setSelectedIds([]);
    };

    const tools: ToolDescriptor[] = [];

    // Widgets passed as props
    tools.push({
        id: 'inventory.widget.add',
        moduleId: 'inventory',
        label: tr('Add'),
        icon: Plus,
        kind: 'widget',
        group: tr('Create'),
        order: 10,
        render: () => <widgets.InventoryAddButton />
    });

    // InventoryBar toggles
    tools.push({
        id: 'inventory.actions',
        moduleId: 'inventory',
        label: tr('Actions'),
        title: tr('Select items to act on'),
        icon: Pointer,
        kind: 'toggle',
        group: tr('Select'),
        order: 50,
        pinned: true,
        pressed: isSelectionMode,
        run: handleToggleSelectionMode
    });

    tools.push({
        id: 'inventory.tools',
        moduleId: 'inventory',
        label: tr('Tools'),
        icon: Wrench,
        kind: 'toggle',
        group: tr('Tools'),
        order: 60,
        pressed: showTools,
        run: () => setShowTools(!showTools)
    });

    // The sub-tools (View, Filter, Search, Tags) are conditionally rendered in InventoryBar when showTools is true.
    // However, in the island, we might want them to be always available in their respective groups or we can render them always,
    // or conditionally based on showTools. The instructions say "Reproduce EVERY control of InventoryBar...
    // The panels these toggles open stay where they are today (UniversalToolsBar draws them under the header);
    // the tools only toggle the same atoms."
    // Let's add them regardless of `showTools`, or if the instruction meant "reproduce exactly", maybe we hide them?
    // "Reproduce EVERY control of InventoryBar" -> I will include them.

    tools.push({
        id: 'inventory.view',
        
        moduleId: 'inventory',
        label: tr('View'),
        icon: LayoutTemplate,
        kind: 'toggle',
        group: tr('View'),
        order: 70,
        pinned: true,
        pressed: isViewSliderOpen,
        run: () => { setShowTools(true); setIsViewSliderOpen(!isViewSliderOpen); }
    });

    tools.push({
        id: 'inventory.filter',
        
        moduleId: 'inventory',
        label: tr('Filter'),
        icon: Filter,
        kind: 'toggle',
        group: tr('Filters'),
        order: 80,
        pinned: true,
        pressed: isFiltersOpen,
        run: () => { setShowTools(true); setIsFiltersOpen(!isFiltersOpen); }
    });

    tools.push({
        id: 'inventory.search',
        
        moduleId: 'inventory',
        label: tr('Search'),
        icon: SearchIcon,
        kind: 'toggle',
        group: tr('Find'),
        order: 90,
        pinned: true, // "Pin by default: Actions, search, filters, view."
        pressed: isSearchOpen || !!search,
        run: () => { setShowTools(true); setIsSearchOpen(!isSearchOpen); }
    });

    tools.push({
        id: 'inventory.tags',
        
        moduleId: 'inventory',
        label: tr('Tags'),
        title: tr('Smart filters — type, shape, material, colour'),
        icon: Tag,
        kind: 'toggle',
        group: tr('Filters'),
        order: 100,
        pressed: showSmart,
        run: () => { setShowTools(true); setShowSmart(!showSmart); }
    });

    return tools;
}

export const InventoryToolsRegistrar: React.FC<{ widgets: InventoryWidgets }> = ({ widgets }) => {
    const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
    const tools = useInventoryTools(widgets);

    useRegisterTools('inventory', tools, islandEnabled);

    return null;
};

