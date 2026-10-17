import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai/react';
import { useRegisterTools, ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import { PrintJobsPanel } from './PrintJobsPanel';
import { Printer } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { isPrintCenterOpenAtom, printCenterTabAtom } from './printState';
import { isPackingPrintWizardOpenAtom } from '../../lib/atoms';

const getTools = (openHistory: () => void): ToolDescriptor[] => [
    {
        id: 'print.jobs',
        moduleId: 'global',
        label: tr('Print jobs'),
        icon: Printer,
        kind: 'widget',
        group: tr('Print'),
        order: 100,
        run: openHistory,
        render: () => <PrintJobsPanel season='826' />
    }
];

export function PrintToolsRegistrar() {
    const isEnabled = useAtomValue(islandCommandsEnabledAtom);
    const setIsStudioOpen = useSetAtom(isPackingPrintWizardOpenAtom);
    const setPcTab = useSetAtom(printCenterTabAtom);
    const setIsPrintCenterOpen = useSetAtom(isPrintCenterOpenAtom);

    const openHistory = () => {
        setPcTab('history');
        setIsPrintCenterOpen(true);
        setIsStudioOpen(true);
    };

    const tools = getTools(openHistory);
    useRegisterTools('print', tools, isEnabled);
    return null;
}

/** Returns the print tool entries. */
export function usePrintTools(): ToolDescriptor[] {
    const setIsStudioOpen = useSetAtom(isPackingPrintWizardOpenAtom);
    const setPcTab = useSetAtom(printCenterTabAtom);
    const setIsPrintCenterOpen = useSetAtom(isPrintCenterOpenAtom);

    const openHistory = () => {
        setPcTab('history');
        setIsPrintCenterOpen(true);
        setIsStudioOpen(true);
    };

    return getTools(openHistory);
}
