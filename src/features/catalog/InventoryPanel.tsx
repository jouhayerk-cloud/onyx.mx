

import { useSetAtom } from 'jotai/react';
import { useResizeDetector } from 'react-resize-detector';
import { InventoryImages } from './InventoryImages';
import { isInventoryPanelOpenAtom } from '../../lib/atoms';
import { InventoryItem } from '../../lib/Types';

interface InventoryPanelProps {
  onItemSelect?: (item: InventoryItem, dataUrl: string) => void;
  mode?: 'catalog' | 'market';
}

export function InventoryPanel({ onItemSelect, mode = 'catalog' }: InventoryPanelProps) {
  const setIsInventoryPanelOpen = useSetAtom(isInventoryPanelOpenAtom);

  const { width, ref } = useResizeDetector();
  const isMobile = width !== undefined && width < 768; // md breakpoint

  const handleItemSelectWrapper = (item: InventoryItem, dataUrl: string) => {
    if (onItemSelect) {
      onItemSelect(item, dataUrl);
    }
    if (isMobile) {
      setIsInventoryPanelOpen(false);
    }
  };

  return (
    <div ref={ref} className="glass-panel rounded-xl shrink-0 w-full h-full">
        <div
          className={`flex flex-col gap-6 h-full overflow-y-auto w-full p-5`}>
          <InventoryImages mode={mode} onItemSelect={handleItemSelectWrapper} />
        </div>
    </div>
  );
}