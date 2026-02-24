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

import { useSetAtom, useAtomValue } from 'jotai/react';
import { useCallback, useEffect, useState } from 'react';
import {
  activeViewAtom,
  allAnnotationDataAtom,
  catalogMarketViewModeAtom,
  createViewActiveTabAtom,
  creationGalleryFilesAtom,
  dashboardActiveTabAtom,
  dashboardStatusFilterAtom,
  detailsPanelDataAtom,
  detailsPanelFilesAtom,
  ImageSrcAtom,
  is3DWorkspaceDetailsOpenAtom,
  is3DWorkspaceInventoryOpenAtom,
  is3DWorkspaceOpenAtom,
  isCatalogViewOpenAtom,
  isDashboardOpenAtom,
  isDetailsPanelOpenAtom,
  isInventoryPanelOpenAtom,
  isShippingOpenAtom,
  IsUploadedImageAtom,
  languageAtom,
  marketActiveTabAtom,
  marketMultiSelectItemsAtom,
  isMarketMultiSelectModeAtom,
  newItemGeneratedFilesAtom,
  SelectedItemDataAtom,
  SelectedItemRowAtom,
  SelectedMasksAtom,
  sidebarStateAtom,
  userAtom,
  workflowStepAtom,
} from './atoms';
import { translations } from './translations';
import { InventoryItemData } from './Types';
import { SCRIPT_URL } from './consts';
import { fetchImageBatch, imageCache } from './utils';
import toast from 'react-hot-toast';

export function useTranslation() {
  const lang = useAtomValue(languageAtom);
  return translations[lang];
}

export const useNotify = () => toast;

export function useResetState() {
  const setWorkflowStep = useSetAtom(workflowStepAtom);
  const setImageSrc = useSetAtom(ImageSrcAtom);
  const setIsUploadedImage = useSetAtom(IsUploadedImageAtom);
  const setAllAnnotationData = useSetAtom(allAnnotationDataAtom);
  const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
  const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
  const setSidebarState = useSetAtom(sidebarStateAtom);
  const setIsInventoryPanelOpen = useSetAtom(isInventoryPanelOpenAtom);
  const setIsDetailsPanelOpen = useSetAtom(isDetailsPanelOpenAtom);
  const setActiveView = useSetAtom(activeViewAtom);
  const setCreateViewActiveTab = useSetAtom(createViewActiveTabAtom);
  const setDashboardActiveTab = useSetAtom(dashboardActiveTabAtom);
  const setCatalogMarketViewMode = useSetAtom(catalogMarketViewModeAtom);
  const setMarketActiveTab = useSetAtom(marketActiveTabAtom);
  const setCreationGalleryFiles = useSetAtom(creationGalleryFilesAtom);
  const setNewItemGeneratedFiles = useSetAtom(newItemGeneratedFilesAtom);
  const setIs3DWorkspaceOpen = useSetAtom(is3DWorkspaceOpenAtom);
  const setIs3DWorkspaceInventoryOpen = useSetAtom(is3DWorkspaceInventoryOpenAtom);
  const setIs3DWorkspaceDetailsOpen = useSetAtom(is3DWorkspaceDetailsOpenAtom);

  return useCallback(() => {
    console.log('[State] Resetting application state to default.');
    // Core workflow
    setWorkflowStep('idle');
    setImageSrc(null);
    setIsUploadedImage(false);
    setAllAnnotationData({ boxes: [], masks: [], points: [] });

    // Item selection
    setSelectedItemRow(null);
    setSelectedItemData(null);

    // Panel visibility
    setSidebarState('expanded');
    setIsInventoryPanelOpen(true);
    setIsDetailsPanelOpen(false);

    // View states
    setActiveView('catalog');
    setCreateViewActiveTab('new');
    setDashboardActiveTab('acquisitions');
    setCatalogMarketViewMode('catalog');
    setMarketActiveTab('images');

    // Item creation
    setCreationGalleryFiles([]);
    setNewItemGeneratedFiles({ pngData: null, svgData: null });

    // 3D states
    setIs3DWorkspaceOpen(false);
    setIs3DWorkspaceInventoryOpen(true);
    setIs3DWorkspaceDetailsOpen(false);
  }, [
    setWorkflowStep, setImageSrc, setIsUploadedImage, setAllAnnotationData,
    setSelectedItemRow, setSelectedItemData, setSidebarState,
    setIsInventoryPanelOpen, setIsDetailsPanelOpen, setActiveView,
    setCreateViewActiveTab, setDashboardActiveTab, setCatalogMarketViewMode,
    setMarketActiveTab, setCreationGalleryFiles, setNewItemGeneratedFiles,
    setIs3DWorkspaceOpen, setIs3DWorkspaceInventoryOpen, setIs3DWorkspaceDetailsOpen
  ]);
}

export function useLogout() {
  const setUser = useSetAtom(userAtom);
  const resetState = useResetState();
  return useCallback(() => {
    setUser(null);
    resetState();
    // Also clear any other sensitive data from storage if necessary
    localStorage.removeItem('userSession');
  }, [setUser, resetState]);
}

export const useItemImage = (itemData: InventoryItemData | null) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const urlToLoad = itemData?.generatedPngUrl || (itemData?.mediaUrls ? itemData.mediaUrls.split(',')[0].trim() : null);

    if (!urlToLoad) {
      setImageUrl(null);
      return;
    }

    let isActive = true;
    setIsLoading(true);

    const fileId = (urlToLoad.match(/id=([\w-]+)/) || [])[1];
    if (!fileId) {
      setIsLoading(false);
      return;
    }

    if (imageCache.has(fileId)) {
      setImageUrl(imageCache.get(fileId)!);
      setIsLoading(false);
      return;
    }

    fetchImageBatch(fileId)
      .then(data => {
        if (isActive) {
          const dataUrl = `data:${data.mimeType};base64,${data.base64}`;
          imageCache.set(fileId, dataUrl);
          setImageUrl(dataUrl);
        }
      })
      .catch(error => {
        console.error('Failed to load item image:', error);
        if (isActive) setImageUrl(null);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [itemData]);

  return { imageUrl, isLoading };
};

export const useDatabase = () => {
  const [db, setDb] = useState<any>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!db) console.warn('🕒 [DB] Database resolution taking longer than 3s...');
    }, 3000);
    import('./database').then(m => m.getDatabase()).then(newDb => {
      clearTimeout(timer);
      setDb(newDb);
    });
  }, []);
  return db;
};
