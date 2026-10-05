import React from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import { FolderUp, Brain } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { uploadItemDataAtom, isUploadWizardOpenAtom, isAiProcessingEnabledAtom } from '../../lib/atoms';
import { useRegisterTools, type ToolDescriptor, islandCommandsEnabledAtom } from '../../lib/toolRegistry';

export function useUploadTools(): ToolDescriptor[] {
  const setItemData = useSetAtom(uploadItemDataAtom);
  const setUploadWizardOpen = useSetAtom(isUploadWizardOpenAtom);
  const [aiEnabled, setAiEnabled] = useAtom(isAiProcessingEnabledAtom);

  const openEntryModal = () => {
    setItemData({ vendorId: '', workbook: 'v326' });
    setUploadWizardOpen(true);
  };

  const tools: ToolDescriptor[] = [];

  tools.push({
    id: 'upload-add-entry',
    moduleId: 'upload',
    label: tr('Add Entry'),
    icon: FolderUp,
    kind: 'action',
    group: tr('Actions'),
    order: 10,
    run: openEntryModal
  });

  tools.push({
    id: 'upload-ai-toggle',
    moduleId: 'upload',
    label: tr('AI PROCESSES'),
    icon: Brain,
    kind: 'toggle',
    group: tr('Settings'),
    order: 20,
    pressed: aiEnabled,
    run: () => setAiEnabled(!aiEnabled)
  });

  return tools;
}

export const UploadToolsRegistrar: React.FC = () => {
  const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
  const tools = useUploadTools();

  useRegisterTools('upload', tools, islandEnabled);

  return null;
}
