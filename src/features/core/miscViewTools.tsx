import React from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { DollarSign, Download } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { currencyModeAtom } from '../../lib/atoms';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';

export interface MiscViewHandlers {
  handleMasterExportXLSX?: () => void;
  isExporting?: boolean;
}

export function useOverviewTools(handlers: MiscViewHandlers): ToolDescriptor[] {
  const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
  const tools: ToolDescriptor[] = [];

  tools.push({
    id: 'common-currency',
    moduleId: 'overview',
    label: currencyMode,
    icon: DollarSign,
    kind: 'toggle',
    group: tr('View'),
    order: 10,
    pressed: true,
    run: () => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')
  });

  tools.push({
    id: 'common-export',
    moduleId: 'overview',
    label: tr('EXPORT'),
    icon: Download,
    kind: 'action',
    group: tr('Export'),
    order: 20,
    disabled: handlers.isExporting,
    run: handlers.handleMasterExportXLSX
  });

  return tools;
}

export function useDashboardTools(): ToolDescriptor[] {
  const [currencyMode, setCurrencyMode] = useAtom(currencyModeAtom);
  const tools: ToolDescriptor[] = [];

  tools.push({
    id: 'common-currency',
    moduleId: 'dashboard',
    label: currencyMode,
    icon: DollarSign,
    kind: 'toggle',
    group: tr('View'),
    order: 10,
    pressed: true,
    run: () => setCurrencyMode(prev => prev === 'MXN' ? 'USD' : 'MXN')
  });

  return tools;
}

export const OverviewToolsRegistrar: React.FC<{ handlers: MiscViewHandlers }> = ({ handlers }) => {
  const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
  const tools = useOverviewTools(handlers);

  useRegisterTools('overview', tools, islandEnabled);

  return null;
};

export const DashboardToolsRegistrar: React.FC = () => {
  const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
  const tools = useDashboardTools();

  useRegisterTools('dashboard', tools, islandEnabled);

  return null;
};

export const EmptyToolsRegistrar: React.FC<{ viewName: string }> = ({ viewName }) => {
  const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
  useRegisterTools(viewName, [], islandEnabled);
  return null;
};

export const MiscViewToolsRouter: React.FC<{ activeView: string; handlers: MiscViewHandlers }> = ({ activeView, handlers }) => {
  if (activeView === 'overview') return <OverviewToolsRegistrar handlers={handlers} />;
  if (activeView === 'dashboard') return <DashboardToolsRegistrar />;
  
  // For views with no controls
  if (['create', 'viewer', 'devices', 'welcome', 'threed'].includes(activeView)) {
    return <EmptyToolsRegistrar viewName={activeView} />;
  }

  return null;
};
