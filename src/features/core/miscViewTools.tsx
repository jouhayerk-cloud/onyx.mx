import React from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { DollarSign, Download, Shield, Users, Cpu, BarChart3, Radio } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { currencyModeAtom, adminViewModeAtom } from '../../lib/atoms';
import { ONYX_MESH_TOPOLOGY } from '../../lib/network/localMeshMap';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import toast from 'react-hot-toast';

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
  const [adminViewMode, setAdminViewMode] = useAtom(adminViewModeAtom);
  const tools: ToolDescriptor[] = [];

  // 1. Mesh Node Icon (Docked Left of Face)
  tools.push({
    id: 'dashboard.mesh-node',
    moduleId: 'dashboard',
    label: tr('Mesh Node'),
    short: 'Mesh',
    title: `Onyx G7 Mesh Node (${ONYX_MESH_TOPOLOGY.g7.ip})`,
    icon: Shield,
    kind: 'action',
    group: tr('Presence'),
    dock: 'left',
    order: 10,
    pinned: true,
    essential: true,
    run: () => {
      const el = document.querySelector('.isl-dock-face') as HTMLButtonElement;
      if (el) el.click();
      toast.success(`G7 Node Active: ${ONYX_MESH_TOPOLOGY.g7.ip}`);
    }
  });

  // 2. Operators Tab Selector (Docked Left of Face)
  tools.push({
    id: 'dashboard.tab.operators',
    moduleId: 'dashboard',
    label: tr('Operators'),
    short: 'Users',
    title: tr('Connected Operators & Registered Operatives'),
    icon: Users,
    kind: 'toggle',
    group: tr('Navigation'),
    dock: 'left',
    order: 20,
    pinned: true,
    essential: true,
    pressed: adminViewMode === 'active_devices',
    run: () => setAdminViewMode('active_devices')
  });

  // 3. Edge Fleet Tab Selector (Docked Right of Face)
  tools.push({
    id: 'dashboard.tab.edge_fleet',
    moduleId: 'dashboard',
    label: tr('Edge Fleet'),
    short: 'Fleet',
    title: tr('Edge Nodes & Hardware Fleet'),
    icon: Cpu,
    kind: 'toggle',
    group: tr('Navigation'),
    dock: 'right',
    order: 10,
    pinned: true,
    essential: true,
    pressed: adminViewMode === 'edge_fleet',
    run: () => setAdminViewMode('edge_fleet')
  });

  // 4. Financials Tab Selector (Docked Right of Face)
  tools.push({
    id: 'dashboard.tab.financials',
    moduleId: 'dashboard',
    label: tr('Financials'),
    short: 'Finances',
    title: tr('KPI & Financial Intelligence Core'),
    icon: BarChart3,
    kind: 'toggle',
    group: tr('Navigation'),
    dock: 'right',
    order: 20,
    pinned: true,
    essential: true,
    pressed: adminViewMode === 'financials',
    run: () => setAdminViewMode('financials')
  });

  // 5. Colibrì MoE Host Status Icon (Docked Right of Face)
  tools.push({
    id: 'dashboard.colibri-moe',
    moduleId: 'dashboard',
    label: tr('Colibrì MoE'),
    short: 'MoE',
    title: tr('Colibrì MoE Host Streaming (:8082)'),
    icon: Radio,
    kind: 'action',
    group: tr('Presence'),
    dock: 'right',
    order: 30,
    pinned: true,
    essential: true,
    run: () => {
      const el = document.querySelector('.isl-dock-face') as HTMLButtonElement;
      if (el) el.click();
      toast.success(tr('Colibrì MoE Streaming Host Active'));
    }
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
