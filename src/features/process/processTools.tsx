import React from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { Target, Library, FolderKanban } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { processActiveTabAtom } from '../../lib/atoms';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';

export function useProcessTools(): ToolDescriptor[] {
  const [activeTab, setActiveTab] = useAtom(processActiveTabAtom);

  const tools: ToolDescriptor[] = [];

  tools.push({
    id: 'process-workspace',
    moduleId: 'process',
    label: tr('Engine Workspace'),
    icon: Target,
    kind: 'toggle',
    group: tr('Sections'),
    order: 10,
    pressed: activeTab === 'workspace',
    run: () => setActiveTab('workspace')
  });

  tools.push({
    id: 'process-vault',
    moduleId: 'process',
    label: tr('Inventory Vault'),
    icon: Library,
    kind: 'toggle',
    group: tr('Sections'),
    order: 20,
    pressed: activeTab === 'vault',
    run: () => setActiveTab('vault')
  });

  tools.push({
    id: 'process-batch',
    moduleId: 'process',
    label: tr('Batch Telemetry'),
    icon: FolderKanban,
    kind: 'toggle',
    group: tr('Sections'),
    order: 30,
    pressed: activeTab === 'batch',
    run: () => setActiveTab('batch')
  });

  return tools;
}

export const ProcessToolsRegistrar: React.FC = () => {
  const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
  const tools = useProcessTools();

  useRegisterTools('process', tools, islandEnabled);

  return null;
}
