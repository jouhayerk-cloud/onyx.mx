import React from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { DollarSign, Download, Shield, Users, Cpu, BarChart3, Radio } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { currencyModeAtom, adminViewModeAtom, userAtom, localStatusOpenAtom } from '../../lib/atoms';
import { ONYX_MESH_TOPOLOGY } from '../../lib/network/localMeshMap';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import toast from 'react-hot-toast';

/** Fleet / operator administration (Operators, Edge Fleet, Mesh, Colibri): Developer and Admin only. */
export const isStaffRole = (role: string | null | undefined): boolean => role === 'Developer' || role === 'Admin';

/** Same set as the server-side money roles (FINANCE_ROLES): Developer, Admin, ClientBoss, ClientAccounting. */
export const FINANCE_ROLES: readonly string[] = ['Developer', 'Admin', 'ClientBoss', 'ClientAccounting'];
export const isFinanceRole = (role: string | null | undefined): boolean => !!role && FINANCE_ROLES.includes(role);

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
  const [localStatusOpen, setLocalStatusOpen] = useAtom(localStatusOpenAtom);
  const user = useAtomValue(userAtom);
  const staff = isStaffRole(user?.role);
  const finance = isFinanceRole(user?.role);
  const tools: ToolDescriptor[] = [];

  // 1. People & Devices Tab Selector (Docked Left of Face)
  if (staff) tools.push({
    id: 'dashboard.tab.operators',
    moduleId: 'dashboard',
    label: tr('People & Devices'),
    short: 'People',
    title: tr('Connected Operators, Registered Operatives & Edge Fleet'),
    icon: Users,
    kind: 'toggle',
    group: tr('Navigation'),
    dock: 'left',
    order: 10,
    pinned: true,
    essential: true,
    pressed: adminViewMode === 'active_devices',
    run: () => setAdminViewMode('active_devices')
  });

  // 2. Financials Tab Selector (Docked Right of Face)
  if (finance) tools.push({
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

  // 3. Local AI & Mesh Status Toggle (Docked Right of Face)
  if (staff) tools.push({
    id: 'dashboard.local-status',
    moduleId: 'dashboard',
    label: tr('Local AI & Mesh'),
    short: 'Local',
    title: tr('Local Colibrì Models & LAN Mesh Status'),
    icon: Radio,
    kind: 'toggle',
    group: tr('Presence'),
    dock: 'right',
    order: 30,
    pinned: true,
    essential: true,
    pressed: localStatusOpen,
    run: () => setLocalStatusOpen(v => !v)
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
