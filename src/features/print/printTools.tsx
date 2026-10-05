import React from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { useRegisterTools, ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import { PrintJobsPanel } from './PrintJobsPanel';
import { Printer } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { isPrintCenterOpenAtom } from './printState';

const getTools = (isOpen: boolean, toggleOpen: () => void): ToolDescriptor[] => [
    {
        id: 'print.jobs',
        moduleId: 'global',
        label: tr('Print jobs'),
        icon: Printer,
        kind: 'widget',
        group: tr('Print'),
        order: 100,
        render: () => <PrintJobsPanel />
    },
    {
        id: 'print.center',
        moduleId: 'global',
        label: tr('Print Center'),
        icon: Printer,
        kind: 'toggle',
        group: tr('Print'),
        order: 110,
        pinned: false,
        pressed: isOpen,
        run: toggleOpen
    }
];

export function PrintToolsRegistrar() {
    const isEnabled = useAtomValue(islandCommandsEnabledAtom);
    const [isOpen, setIsOpen] = useAtom(isPrintCenterOpenAtom);
    const tools = getTools(isOpen, () => setIsOpen((p: boolean) => !p));
    useRegisterTools('print', tools, isEnabled);
    return null;
}

export function usePrintTools(): ToolDescriptor[] {
    const [isOpen, setIsOpen] = useAtom(isPrintCenterOpenAtom);
    return getTools(isOpen, () => setIsOpen((p: boolean) => !p));
}
