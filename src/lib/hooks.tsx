

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

    setWorkflowStep('idle');
    setImageSrc(null);
    setIsUploadedImage(false);
    setAllAnnotationData({ boxes: [], masks: [], points: [] });

    setSelectedItemRow(null);
    setSelectedItemData(null);

    setSidebarState('expanded');
    setIsInventoryPanelOpen(true);
    setIsDetailsPanelOpen(false);

    setActiveView('inventory');
    setCreateViewActiveTab('new');
    setDashboardActiveTab('acquisitions');
    setCatalogMarketViewMode('catalog');
    setMarketActiveTab('images');

    setCreationGalleryFiles([]);
    setNewItemGeneratedFiles({ pngData: null, svgData: null });

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
    const hardTimeout = setTimeout(() => {
      if (!db && Date.now() - parseInt(localStorage.getItem('onyx_last_reload') || '0') > 60000) {
        console.error('🔥 [DB] Fatal initialization hang. Attempting emergency recovery...');
        localStorage.setItem('onyx_last_reload', Date.now().toString());
        window.location.reload();
      }
    }, 20000); // 20s hard timeout

    import('./database').then(m => m.getDatabase()).then(newDb => {
      clearTimeout(timer);
      clearTimeout(hardTimeout);
      setDb(newDb);
    }).catch(async (err) => {
      clearTimeout(timer);
      clearTimeout(hardTimeout);
      console.error('❌ [DB] useDatabase failed:', err?.message || err);
      const lastReload = parseInt(localStorage.getItem('onyx_last_reload') || '0');
      if (Date.now() - lastReload > 15000) {
        localStorage.setItem('onyx_last_reload', Date.now().toString());
        try {
          const dbs = await window.indexedDB.databases();
          await Promise.all(
            dbs.filter(d => d.name?.startsWith('onyxdb')).map(d =>
              new Promise<void>(resolve => {
                const req = window.indexedDB.deleteDatabase(d.name!);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
              })
            )
          );
        } catch (_) { /* fallback: indexedDB.databases() not supported */ }
        window.location.reload();
      }
    });
  }, []);
  return db;
};
