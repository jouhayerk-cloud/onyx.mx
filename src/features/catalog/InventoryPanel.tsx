/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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