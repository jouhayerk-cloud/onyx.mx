import React from 'react';
import { useAtomValue } from 'jotai/react';
import { useRegisterTools, ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import { PrintJobsPanel } from './PrintJobsPanel';
import { Printer } from 'lucide-react';
import { tr } from '../../lib/i18n';

const tools: ToolDescriptor[] = [
    {
        id: 'print.jobs',
        moduleId: 'global',
        label: tr('Print jobs'),
        icon: Printer,
        kind: 'widget',
        group: tr('Print'),
        order: 100,
        render: () => <PrintJobsPanel />
    }
];

export function PrintToolsRegistrar() {
    const isEnabled = useAtomValue(islandCommandsEnabledAtom);
    useRegisterTools('print', tools, isEnabled);
    return null;
}

export function usePrintTools(): ToolDescriptor[] {
    return tools;
}
