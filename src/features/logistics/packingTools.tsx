import React, { useState } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import {
    Search, LayoutList, LayoutGrid, ListFilter, Printer, QrCode, FileText, Table, Database, X
} from 'lucide-react';
import { tr } from '../../lib/i18n';
import {
    TOP_BAR_SEARCH_ATOM,
    packingViewModeAtom,
    isPackingPrintWizardOpenAtom,
    isPackingFiltersOpenAtom,
    packingExportPDFTriggerAtom,
    packingExportXLSXTriggerAtom,
    packingExportJSONTriggerAtom,
    isPackingNFCWizardOpenAtom,
    packingSelectedIdsAtom
} from '../../lib/atoms';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';

export interface PackingWidgets {
    DeployableSearch: React.ComponentType<any>;
}

export function usePackingTools(widgets: PackingWidgets, handlers?: any): ToolDescriptor[] {
    const [search, setSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    
    const [viewMode, setViewMode] = useAtom(packingViewModeAtom);
    const [isPrintOpen, setIsPrintOpen] = useAtom(isPackingPrintWizardOpenAtom);
    const [isFiltersOpen, setIsFiltersOpen] = useAtom(isPackingFiltersOpenAtom);
    const setExportPDF = useSetAtom(packingExportPDFTriggerAtom);
    const setExportXLSX = useSetAtom(packingExportXLSXTriggerAtom);
    const setExportJSON = useSetAtom(packingExportJSONTriggerAtom);
    const setIsNFCWizardOpen = useSetAtom(isPackingNFCWizardOpenAtom);
    const [selectedIds, setSelectedIds] = useAtom(packingSelectedIdsAtom);

    const cycleView = () => setViewMode(v => v === 'list' ? 'grid' : 'list');
    const ViewIcon = viewMode === 'list' ? LayoutList : LayoutGrid;

    const tools: ToolDescriptor[] = [];
    const moduleId = 'packing';

    if (selectedIds.size > 0) {
        tools.push({
            id: 'packing.clear-selection',
            moduleId,
            label: tr('Clear Selection'),
            title: `${selectedIds.size} ${tr('ARTIFACTS SELECTED')}`,
            icon: X,
            kind: 'action',
            group: tr('Select'),
            order: 10,
            run: () => setSelectedIds(new Set())
        });
    } else {
        tools.push({
            id: 'packing.widget.search',
            moduleId,
            label: tr('Search'),
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
                    accentColor="var(--main-color)"
                    placeholder={tr("FIND INVENTORY...")}
                />
            )
        });
    }

    tools.push({
        id: 'packing.view-mode',
        moduleId,
        label: viewMode.toUpperCase(),
        title: tr('Toggle View Mode'),
        icon: ViewIcon,
        kind: 'toggle',
        group: tr('View'),
        order: 30,
        pinned: true,
        pressed: true, // Used as a simple button cycle
        run: cycleView
    });

    tools.push({
        id: 'packing.config',
        moduleId,
        label: tr('Configuration'),
        icon: ListFilter,
        kind: 'toggle',
        group: tr('Configuration'),
        order: 40,
        pinned: true,
        pressed: isFiltersOpen,
        run: () => setIsFiltersOpen(!isFiltersOpen)
    });

    tools.push({
        id: 'packing.print',
        moduleId,
        label: tr('PRINT'),
        title: tr('Generate High-Fidelity Labels'),
        icon: Printer,
        kind: 'action',
        group: tr('Hardware'),
        order: 50,
        run: () => setIsPrintOpen(true)
    });

    tools.push({
        id: 'packing.nfc',
        moduleId,
        label: 'NFC',
        title: tr('Hardware Sync Handshake'),
        icon: QrCode,
        kind: 'action',
        group: tr('Hardware'),
        order: 60,
        run: () => setIsNFCWizardOpen(true)
    });

    tools.push({
        id: 'packing.export-pdf',
        moduleId,
        label: 'PDF',
        title: tr('Export PDF Catalog'),
        icon: FileText,
        kind: 'action',
        group: tr('Export'),
        order: 70,
        run: () => setExportPDF(1)
    });

    tools.push({
        id: 'packing.export-xlsx',
        moduleId,
        label: 'XLSX',
        title: tr('Export Spreadsheet'),
        icon: Table,
        kind: 'action',
        group: tr('Export'),
        order: 80,
        run: () => setExportXLSX(1)
    });

    tools.push({
        id: 'packing.export-json',
        moduleId,
        label: 'JSON',
        title: tr('Developer Data Dump'),
        icon: Database,
        kind: 'action',
        group: tr('Export'),
        order: 90,
        run: () => setExportJSON(1)
    });

    return tools;
}

export const PackingToolsRegistrar: React.FC<{ widgets: PackingWidgets, handlers?: any }> = ({ widgets, handlers }) => {
    const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
    const tools = usePackingTools(widgets, handlers);

    useRegisterTools('packing', tools, islandEnabled);

    return null;
};
