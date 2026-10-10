import React, { useState } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import {
    Search, PackagePlus, FolderUp, Download, ListFilter,
    PanelTop, PanelTopClose, Archive, Save, SlidersHorizontal,
    Activity, Truck, SquareLibrary, Package, Boxes, PackageOpen, History
} from 'lucide-react';
import { tr } from '../../lib/i18n';
import {
    activeViewAtom,
    logisticsSubTabAtom,
    TOP_BAR_SEARCH_ATOM,
    isPackingFiltersOpenAtom,
    truckIsBusyAtom,
    truckViewModeAtom,
    truckShowPanelsAtom,
    truckShowSaveDraftAtom,
    truckShowOpenDraftAtom,
    truckShowExportModalAtom,
    truckShowReadyWizardAtom,
    isCrateCreationModalOpenAtom,
    isWarehouseSelectionModeAtom,
    warehouseSelectedIdsAtom,
    showWarehouseExportWizardAtom,
    shippingCratesAtom,
    shippingTruckDimsAtom,
    truckMaxWeightAtom
} from '../../lib/atoms';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import type { IslandReadout } from '../onyxIsland/islandState';

export interface LogisticsWidgets {
    DeployableSearch: React.ComponentType<any>;
    SubTabPills: React.ComponentType<any>;
}

/** Builds the logistics tool entries for the active view and sub-tab, wired to the given widgets. */
export function useLogisticsTools(widgets: LogisticsWidgets, handlers?: any): ToolDescriptor[] {
    const [activeView] = useAtom(activeViewAtom);
    const [subTab, setSubTab] = useAtom(logisticsSubTabAtom);
    const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isWarehouseSearchOpen, setIsWarehouseSearchOpen] = useState(false);

    const [isPackingFiltersOpen, setIsPackingFiltersOpen] = useAtom(isPackingFiltersOpenAtom);
    const truckBusy = useAtomValue(truckIsBusyAtom);
    const [truckView, setTruckView] = useAtom(truckViewModeAtom);
    const [showPanels, setShowPanels] = useAtom(truckShowPanelsAtom);
    const [showSaveDraft, setShowSaveDraft] = useAtom(truckShowSaveDraftAtom);
    const [showOpenDraft, setShowOpenDraft] = useAtom(truckShowOpenDraftAtom);
    const [showExportModal, setShowExportModal] = useAtom(truckShowExportModalAtom);
    const setShowReadyWizard = useSetAtom(truckShowReadyWizardAtom);
    const setIsCrateModalOpen = useSetAtom(isCrateCreationModalOpenAtom);
    const [isWarehouseSelectionMode, setIsWarehouseSelectionMode] = useAtom(isWarehouseSelectionModeAtom);
    const warehouseSelectedIds = useAtomValue(warehouseSelectedIdsAtom);
    const setShowWarehouseExportWizard = useSetAtom(showWarehouseExportWizardAtom);

    const tools: ToolDescriptor[] = [];
    const moduleId = activeView || 'logistics';

    const tabs = activeView === 'warehouse' ? [
        { id: 'empty', label: 'Empty', icon: 'package' },
        { id: 'packed', label: 'Packed', icon: 'boxes' },
        { id: 'packing', label: 'Packing', icon: 'package-open' },
    ] : activeView === 'trucking' ? [
        { id: 'shipping', label: 'PLAN', icon: 'truck' },
        { id: 'deployed', label: 'DPLYD', icon: 'history' },
    ] : [
        { id: 'empty', label: 'Empty', icon: 'package' },
        { id: 'packed', label: 'Packed', icon: 'boxes' },
        { id: 'packing', label: 'Packing', icon: 'package-open' },
        { id: 'shipping', label: 'TRK', icon: 'truck' },
    ];

    // Sections
    tools.push({
        id: 'logistics.widget.subtabs',
        moduleId,
        label: tr('Sections'),
        icon: activeView === 'trucking' ? Truck : Package,
        kind: 'widget',
        group: tr('Sections'),
        order: 10,
        render: () => (
            <widgets.SubTabPills
                tabs={tabs}
                active={subTab}
                onSelect={(id: string) => {
                    setSubTab(id as any);
                    if (id !== 'packing') setSearch('');
                }}
                accentColor="var(--color-logistics)"
            />
        )
    });

    if (activeView !== 'warehouse' && activeView !== 'trucking') {
        tools.push({
            id: 'logistics.widget.search',
            moduleId,
            label: tr('Search Crates'),
            icon: Search,
            kind: 'widget',
            group: tr('Find'),
            order: 20,
            pinned: true,
            render: () => (
                <widgets.DeployableSearch
                    value={search}
                    onChange={setSearch}
                    isOpen={isSearchOpen}
                    setIsOpen={setIsSearchOpen}
                    accentColor="var(--color-logistics)"
                    placeholder={tr("FIND CRATES...")}
                />
            )
        });
    }

    if (activeView === 'warehouse') {
        tools.push({
            id: 'warehouse.create-crate',
            moduleId,
            label: tr('New Unit'),
            title: tr('Initialize Storage Protocol'),
            icon: PackagePlus,
            kind: 'action',
            group: tr('Warehouse'),
            order: 30,
            run: () => setIsCrateModalOpen(true)
        });

        tools.push({
            id: 'warehouse.widget.search',
            moduleId,
            label: tr('Search Units'),
            icon: Search,
            kind: 'widget',
            group: tr('Find'),
            order: 40,
            pinned: true,
            render: () => (
                <widgets.DeployableSearch
                    value={search}
                    onChange={setSearch}
                    isOpen={isWarehouseSearchOpen}
                    setIsOpen={setIsWarehouseSearchOpen}
                    accentColor="var(--color-logistics)"
                    placeholder={tr("FIND UNITS...")}
                />
            )
        });

        if (subTab === 'packed') {
            tools.push({
                id: 'warehouse.select-crates',
                moduleId,
                label: tr('Select'),
                title: isWarehouseSelectionMode ? tr('Cancel Selection') : tr('Select Crates'),
                icon: FolderUp,
                kind: 'toggle',
                group: tr('Select'),
                order: 50,
                pinned: true,
                pressed: isWarehouseSelectionMode,
                run: () => setIsWarehouseSelectionMode(!isWarehouseSelectionMode)
            });

            if (isWarehouseSelectionMode && warehouseSelectedIds.size > 0) {
                tools.push({
                    id: 'warehouse.export-wizard',
                    moduleId,
                    label: tr('Start Exportation'),
                    badge: warehouseSelectedIds.size,
                    icon: Download,
                    kind: 'action',
                    group: tr('Export'),
                    order: 60,
                    run: () => setShowWarehouseExportWizard(true)
                });
            }
        }
    }

    if (subTab === 'packing') {
        tools.push({
            id: 'logistics.packing-config',
            moduleId,
            label: tr('Configuration'),
            icon: ListFilter,
            kind: 'toggle',
            group: tr('Configuration'),
            order: 70,
            pressed: isPackingFiltersOpen,
            run: () => setIsPackingFiltersOpen(!isPackingFiltersOpen)
        });
    }

    if (subTab === 'shipping' || subTab === 'deployed') {
        tools.push({
            id: 'truck.panels-toggle',
            moduleId,
            label: tr('Panels'),
            title: showPanels ? tr('Hide all panels') : tr('Show all panels'),
            icon: showPanels ? PanelTopClose : PanelTop,
            kind: 'toggle',
            group: tr('View'),
            order: 80,
            pressed: showPanels,
            run: () => setShowPanels(!showPanels)
        });
    }

    if (activeView === 'trucking') {
        tools.push({
            id: 'truck.open-draft',
            moduleId,
            label: tr('Drafts'),
            title: tr('Load Draft'),
            icon: Archive,
            kind: 'action',
            group: tr('Trucking'),
            order: 90,
            run: () => setShowOpenDraft(true)
        });

        tools.push({
            id: 'truck.save-draft',
            moduleId,
            label: tr('Save'),
            title: tr('Save Draft'),
            icon: Save,
            kind: 'action',
            group: tr('Trucking'),
            order: 100,
            run: () => setShowSaveDraft(true)
        });

        tools.push({
            id: 'truck.export-modal',
            moduleId,
            label: tr('Export'),
            title: tr('Export Manifest'),
            icon: SlidersHorizontal,
            kind: 'action',
            group: tr('Export'),
            order: 110,
            run: () => setShowExportModal(true)
        });

        tools.push({
            id: 'truck.ready-wizard',
            moduleId,
            label: truckBusy ? tr('Processing...') : tr('Ready Truck'),
            icon: truckBusy ? Activity : Truck,
            kind: 'action',
            group: tr('Trucking'),
            order: 120,
            disabled: truckBusy,
            run: () => setShowReadyWizard(true)
        });

        tools.push({
            id: 'truck.crates-library',
            moduleId,
            label: tr('Library'),
            title: tr('Deployed Crates Library'),
            icon: SquareLibrary,
            kind: 'toggle',
            group: tr('Sections'),
            order: 130,
            pressed: subTab === 'crates',
            run: () => setSubTab('crates')
        });
    }

    return tools;
}

export const LogisticsToolsRegistrar: React.FC<{ widgets: LogisticsWidgets, handlers?: any }> = ({ widgets, handlers }) => {
    const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
    const activeView = useAtomValue(activeViewAtom);
    const tools = useLogisticsTools(widgets, handlers);
    const moduleId = activeView || 'logistics';

    useRegisterTools(moduleId, tools, islandEnabled);

    return null;
};

// eslint-disable-next-line react-hooks/rules-of-hooks
export function logisticsReadout(): IslandReadout {
    const crates = useAtomValue(shippingCratesAtom);
    const truckDims = useAtomValue(shippingTruckDimsAtom);
    const maxWeight = useAtomValue(truckMaxWeightAtom);
    const loaded = crates.filter((c: any) => c.location === 'truck');
    const weight = loaded.reduce((s: number, c: any) => s + c.weight, 0);
    const pct = Math.min(100, Math.round((weight / maxWeight) * 100));
    const vol = loaded.reduce((s: number, c: any) => s + c.w * c.h * c.d, 0);
    const truckVol = truckDims.length * truckDims.width * truckDims.height;
    const volPct = truckVol > 0 ? Math.round((vol / truckVol) * 100) : 0;

    const left = (
        <span className="flex items-center gap-2 text-[12px] font-mono text-(--text-color)/40">
            <span className="text-(--text-color)/70 font-black text-sm">{loaded.length}</span> 
            {tr("crates")}
        </span>
    );

    const right = (
        <div className="flex items-center gap-6 text-[12px] font-mono text-(--text-color)/40">
            <div className="flex items-center gap-2.5">
                <div className="w-24 h-2 bg-(--text-color)/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#00AEEF] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span>{pct}{tr("% wt")}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-20 h-1.5 bg-(--text-color)/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#6BCEBB] rounded-full transition-all" style={{ width: `${volPct}%` }} />
                </div>
                <span>{volPct}{tr("% vol")}</span>
            </div>
        </div>
    );

    return { left, right };
}
