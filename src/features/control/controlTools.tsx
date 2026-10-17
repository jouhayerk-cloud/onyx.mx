import React from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Download, Shield, Users, Cpu, BarChart3, Radio } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { userAtom, adminViewModeAtom, localStatusOpenAtom } from '../../lib/atoms';
import { ONYX_MESH_TOPOLOGY } from '../../lib/network/localMeshMap';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';
import { isStaffRole, isFinanceRole } from '../core/miscViewTools';
import toast from 'react-hot-toast';

export interface ControlHandlers {
  handleShopifyExportXLSX: () => void;
  isShopifyExporting: boolean;
  handleMasterExportXLSX: () => void;
  isExporting: boolean;
  handleMasterExportXLSX_V2: () => void;
  handleMasterExportXLSX_V3: () => void;
}

/** Builds the command tool entries for the Control view, wired to the given handlers. */
export function useControlTools(handlers: ControlHandlers): ToolDescriptor[] {
  const [adminViewMode, setAdminViewMode] = useAtom(adminViewModeAtom);
  const [localStatusOpen, setLocalStatusOpen] = useAtom(localStatusOpenAtom);
  const user = useAtomValue(userAtom);
  const staff = isStaffRole(user?.role);
  const finance = isFinanceRole(user?.role);
  const tools: ToolDescriptor[] = [];

  // 1. People & Devices Tab Selector (Docked Left of Face)
  if (staff) tools.push({
    id: 'control.tab.operators',
    moduleId: 'control',
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
    id: 'control.tab.financials',
    moduleId: 'control',
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
    id: 'control.local-status',
    moduleId: 'control',
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

  // Export actions in expanded surface
  tools.push({
    id: 'control-export-shopify',
    moduleId: 'control',
    label: tr('Download Shopify XLSX'),
    icon: Download,
    kind: 'action',
    group: tr('Export'),
    order: 40,
    disabled: handlers.isShopifyExporting,
    run: handlers.handleShopifyExportXLSX
  });

  tools.push({
    id: 'control-export-workbook',
    moduleId: 'control',
    label: tr('Download Full Workbook XLSX'),
    icon: Download,
    kind: 'action',
    group: tr('Export'),
    order: 50,
    disabled: handlers.isExporting,
    run: handlers.handleMasterExportXLSX
  });

  tools.push({
    id: 'control-export-workbook-v2',
    moduleId: 'control',
    label: 'Download Workbook V2',
    title: 'Download Workbook V2 (workbooks 825 and 326, Rare Earth Format)',
    icon: Download,
    kind: 'action',
    group: tr('Export'),
    order: 60,
    disabled: handlers.isExporting,
    run: handlers.handleMasterExportXLSX_V2
  });

  tools.push({
    id: 'control-export-workbook-v3',
    moduleId: 'control',
    label: tr('Download Workbook V3'),
    title: tr('Download Workbook V3 (workbook 826, ledger from September 2026)'),
    icon: Download,
    kind: 'action',
    group: tr('Export'),
    order: 70,
    disabled: handlers.isExporting,
    run: handlers.handleMasterExportXLSX_V3
  });

  return tools;
}

export const ControlToolsRegistrar: React.FC<{ handlers: ControlHandlers }> = ({ handlers }) => {
  const user = useAtomValue(userAtom);
  const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
  const allowed = (user?.role === 'Developer' || user?.role === 'Admin' || user?.role === 'ClientBoss') && islandEnabled;
  const tools = useControlTools(handlers);

  useRegisterTools('control', tools, allowed);

  return null;
};
