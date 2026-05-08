

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
  sharedToastAtom
} from './atoms';
import { translations } from './translations';
import { InventoryItemData } from './Types';
import { SCRIPT_URL } from './consts';
import { fetchImageBatch, imageCache, resizeImage, extractFileId, generateVideoThumbnail } from './utils';
import toast from 'react-hot-toast';

export function useTranslation() {
  const lang = useAtomValue(languageAtom);
  return translations[lang];
}

export const useNotify = () => {
  const setSharedToast = useSetAtom(sharedToastAtom);

  const notify = (message: string, options?: any) => {
    const id = options?.id || Math.random().toString(36).substr(2, 9);
    const type = options?.type || 'default';
    setSharedToast({
      id,
      message,
      type: type as any,
      timestamp: Date.now()
    });
    return toast(message, options);
  };

  notify.success = (message: string, options?: any) => {
    const id = options?.id || Math.random().toString(36).substr(2, 9);
    setSharedToast({
      id,
      message,
      type: 'success',
      timestamp: Date.now()
    });
    return toast.success(message, options);
  };

  notify.error = (message: string, options?: any) => {
    const id = options?.id || Math.random().toString(36).substr(2, 9);
    setSharedToast({
      id,
      message,
      type: 'error',
      timestamp: Date.now()
    });
    return toast.error(message, options);
  };

  notify.loading = (message: string, options?: any) => {
    const id = options?.id || Math.random().toString(36).substr(2, 9);
    setSharedToast({
      id,
      message,
      type: 'loading',
      timestamp: Date.now()
    });
    return toast.loading(message, options);
  };

  notify.dismiss = (id?: string) => toast.dismiss(id);

  return notify;
};

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
  const [isVideo, setIsVideo] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const urlToLoad = itemData?.generatedPngUrl || (itemData?.mediaUrls ? itemData.mediaUrls.split(',')[0].trim() : null);

    if (!urlToLoad) {
      setImageUrl(null);
      setIsVideo(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);

    const fileId = extractFileId(urlToLoad);
    if (!fileId) {
      setIsLoading(false);
      return;
    }

    // Rough check before fetch
    const isVidPossible = urlToLoad.toLowerCase().includes('.mov') || urlToLoad.toLowerCase().includes('.mp4');

    const thumbKey = fileId + '_thumb';
    if (imageCache.has(thumbKey)) {
        const cached = imageCache.get(thumbKey)!;
        setImageUrl(cached);
        setIsVideo(isVidPossible);
        setIsLoading(false);
        return;
    }

    if (imageCache.has(fileId)) {
      const cached = imageCache.get(fileId)!;
      if (cached.startsWith('data:video/')) {
        setIsVideo(true);
        generateVideoThumbnail(cached).then(thumb => {
            if (isActive) {
                setImageUrl(thumb);
                imageCache.set(thumbKey, thumb);
            }
        }).catch(() => {
            if (isActive) setImageUrl(cached);
        });
      } else {
        setImageUrl(cached);
        setIsVideo(false);
      }
      setIsLoading(false);
      return;
    }

    fetchImageBatch(fileId)
      .then(async data => {
        if (!isActive) return;
        const mime = data.mimeType;
        const isVid = mime.startsWith('video/');
        const dataUrl = `data:${mime};base64,${data.base64}`;
        
        setIsVideo(isVid);
        
        let finalUrl = dataUrl;
        if (isVid) {
          try {
            // We want the actual video for playback, but an image tag needs a thumbnail.
            // Component should decide which to use if possible, but here we provide a thumbnail as the primary URL
            // and keep the video flag. 
            // WAIT: If we want playback in fullscreen, we need the video URL.
            // If we want a preview, we need a thumbnail.
            // Let's generate a thumbnail but keep the video source available?
            // Actually, we'll store the thumbnail in imageCache for this fileId
            // and return the thumbnail. Components that need playback will fetch the video again or we can provide it.
            imageCache.set(fileId, dataUrl); // Always store full video in main cache
            const thumb = await generateVideoThumbnail(dataUrl);
            imageCache.set(thumbKey, thumb); // Store thumb separately
            finalUrl = thumb;
          } catch (e) { 
            console.warn("Video thumb failed", e); 
            finalUrl = null; 
          }
        } else {
          // Resize large images for better performance and memory
          try { 
            finalUrl = await resizeImage(dataUrl, 1200); 
            imageCache.set(fileId, finalUrl); // Store high-res thumb/image in main cache
          } catch (e) { console.warn("Resize failed", e); }
        }

        setImageUrl(finalUrl);
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

  return { imageUrl, isVideo, isLoading };
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
