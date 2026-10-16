import React from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Download, Shield, Users, Cpu, BarChart3, Radio } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { userAtom, adminViewModeAtom } from '../../lib/atoms';
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
  const user = useAtomValue(userAtom);
  const staff = isStaffRole(user?.role);
  const finance = isFinanceRole(user?.role);
  const tools: ToolDescriptor[] = [];

  // Mesh, Operators, Edge Fleet and Colibri are Developer/Admin only; Financials also serves the finance client roles.
  // 1. Mesh Node Icon (Docked Left of Face)
  if (staff) tools.push({
    id: 'control.mesh-node',
    moduleId: 'control',
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
  if (staff) tools.push({
    id: 'control.tab.operators',
    moduleId: 'control',
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
  if (staff) tools.push({
    id: 'control.tab.edge_fleet',
    moduleId: 'control',
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

  // 5. Colibrì MoE Host Status Icon (Docked Right of Face)
  if (staff) tools.push({
    id: 'control.colibri-moe',
    moduleId: 'control',
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
    title: 'Download Workbook V2 (Rare Earth Format)',
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
