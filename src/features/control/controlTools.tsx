import React from 'react';
import { useAtomValue } from 'jotai/react';
import { Download } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { userAtom } from '../../lib/atoms';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';

export interface ControlHandlers {
  handleShopifyExportXLSX: () => void;
  isShopifyExporting: boolean;
  handleMasterExportXLSX: () => void;
  isExporting: boolean;
  handleMasterExportXLSX_V2: () => void;
}

export function useControlTools(handlers: ControlHandlers): ToolDescriptor[] {
  const tools: ToolDescriptor[] = [];

  tools.push({
    id: 'control-export-shopify',
    moduleId: 'control',
    label: tr('Download Shopify XLSX'),
    icon: Download,
    kind: 'action',
    group: tr('Export'),
    order: 10,
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
    order: 20,
    disabled: handlers.isExporting,
    run: handlers.handleMasterExportXLSX
  });

  tools.push({
    id: 'control-export-workbook-v2',
    moduleId: 'control',
    label: 'Download Workbook V2', // Hard-coded in original
    title: 'Download Workbook V2 (Rare Earth Format)',
    icon: Download,
    kind: 'action',
    group: tr('Export'),
    order: 30,
    disabled: handlers.isExporting,
    run: handlers.handleMasterExportXLSX_V2
  });

  return tools;
}

export const ControlToolsRegistrar: React.FC<{ handlers: ControlHandlers }> = ({ handlers }) => {
  const user = useAtomValue(userAtom);
  const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
  const allowed = (user?.role === 'Developer' || user?.role === 'Admin') && islandEnabled;
  const tools = useControlTools(handlers);

  useRegisterTools('control', tools, allowed);

  return null;
}
