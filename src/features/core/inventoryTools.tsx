import React from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import {
    Pointer, Wrench, LayoutTemplate, Filter, Search as SearchIcon, Tag, Plus, SquareCheckBig, Download
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
    inventoryActionsOpenAtom,
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
    const [showActions, setShowActions] = useAtom(inventoryActionsOpenAtom);

    // On a narrow screen both groups do not fit beside the face: opening one folds the other.
    const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 480px)').matches;

    const handleToggleSelectionMode = () => {
        setIsSelectionMode(!isSelectionMode);
        if (isSelectionMode) setSelectedIds([]);
    };

    const tools: ToolDescriptor[] = [];

    // Hierarchy of the inventory island: Tools | Chan (the face) | Actions.
    // Tools (left of the face) deploy View, Search and Filter; Actions (right of the face) deploy Add, Select and Export.
    // Within a side the launchers follow `order`, the group toggle sits next to the face and its tools open outwards.

    // Add stays in the panel while the Actions group is folded (it is a dock launcher when the group is open).
    if (!showActions) {
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
    }

    tools.push({
        id: 'inventory.tools',
        moduleId: 'inventory',
        label: tr('Tools'),
        title: tr('View, search and filter'),
        icon: Wrench,
        kind: 'toggle',
        group: tr('Tools'),
        order: 100,
        pinned: true,
        dock: 'left',
        pressed: showTools,
        run: () => {
            const next = !showTools;
            setShowTools(next);
            if (next && narrow() && showActions) {
                setShowActions(false);
                setIsSelectionMode(false);
                setSelectedIds([]);
            }
            if (!next) {
                setIsViewSliderOpen(false);
                setIsFiltersOpen(false);
                setIsSearchOpen(false);
                setShowSmart(false);
            }
        }
    });

    if (showTools) {
        tools.push({
            id: 'inventory.view',
            moduleId: 'inventory',
            label: tr('View'),
            icon: LayoutTemplate,
            kind: 'toggle',
            group: tr('View'),
            order: 70,
            pinned: true,
            dock: 'left',
            pressed: isViewSliderOpen,
            run: () => { setIsViewSliderOpen(!isViewSliderOpen); }
        });

        tools.push({
            id: 'inventory.search',
            moduleId: 'inventory',
            label: tr('Search'),
            icon: SearchIcon,
            kind: 'toggle',
            group: tr('Find'),
            order: 80,
            pinned: true,
            dock: 'left',
            pressed: isSearchOpen || !!search,
            run: () => { setIsSearchOpen(!isSearchOpen); }
        });

        tools.push({
            id: 'inventory.filter',
            moduleId: 'inventory',
            label: tr('Filter'),
            icon: Filter,
            kind: 'toggle',
            group: tr('Filters'),
            order: 90,
            pinned: true,
            dock: 'left',
            pressed: isFiltersOpen,
            run: () => { setIsFiltersOpen(!isFiltersOpen); }
        });

        // Smart filters stay in the panel only (not a dock launcher)
        tools.push({
            id: 'inventory.tags',
            moduleId: 'inventory',
            label: tr('Tags'),
            title: tr('Smart filters'),
            icon: Tag,
            kind: 'toggle',
            group: tr('Filters'),
            order: 100,
            pressed: showSmart,
            run: () => { setShowSmart(!showSmart); }
        });
    }

    tools.push({
        id: 'inventory.actions',
        moduleId: 'inventory',
        label: tr('Actions'),
        title: tr('Add, select and export'),
        icon: Pointer,
        kind: 'toggle',
        group: tr('Actions'),
        order: 10,
        pinned: true,
        dock: 'right',
        pressed: showActions,
        run: () => {
            const next = !showActions;
            setShowActions(next);
            if (!next) {
                setIsSelectionMode(false);
                setSelectedIds([]);
            } else if (narrow() && showTools) {
                setShowTools(false);
                setIsViewSliderOpen(false);
                setIsFiltersOpen(false);
                setIsSearchOpen(false);
                setShowSmart(false);
            }
        }
    });

    if (showActions) {
        tools.push({
            id: 'inventory.add',
            moduleId: 'inventory',
            label: tr('Add'),
            title: tr('Add Entry'),
            icon: Plus,
            kind: 'action',
            group: tr('Actions'),
            order: 20,
            pinned: true,
            dock: 'right',
            run: () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setView('upload');
            }
        });

        tools.push({
            id: 'inventory.select',
            moduleId: 'inventory',
            label: tr('Select'),
            title: tr('Select items to act on'),
            icon: SquareCheckBig,
            kind: 'toggle',
            group: tr('Actions'),
            order: 30,
            pinned: true,
            dock: 'right',
            pressed: isSelectionMode,
            run: handleToggleSelectionMode
        });

        tools.push({
            id: 'inventory.export',
            moduleId: 'inventory',
            label: tr('Export'),
            title: tr('Global Export'),
            icon: Download,
            kind: 'action',
            group: tr('Actions'),
            order: 40,
            pinned: true,
            dock: 'right',
            run: () => { document.dispatchEvent(new CustomEvent('triggerMasterExport')); }
        });
    }

    return tools;
}

export const InventoryToolsRegistrar: React.FC<{ widgets: InventoryWidgets }> = ({ widgets }) => {
    const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
    const tools = useInventoryTools(widgets);

    useRegisterTools('inventory', tools, islandEnabled);

    return null;
};






