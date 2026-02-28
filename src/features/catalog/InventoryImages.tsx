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

import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ImageSrcAtom,
  InventoryVersionAtom,
  IsUploadedImageAtom,
  SelectedItemDataAtom,
  SelectedItemRowAtom,
  userAtom,
  isDetailsPanelOpenAtom,
  detailsPanelModeAtom,
  isCatalogBatchSelectModeAtom,
  catalogBatchSelectedItemsAtom,
  isMarketMultiSelectModeAtom,
  marketMultiSelectItemsAtom,
  isBatchActionsModalOpenAtom,
  batchActionItemsDataAtom,
  inventoryAtom,
  inventorySearchTermAtom,
  inventoryActiveFilterAtom,
  marketActiveTabAtom,
  allAnnotationDataAtom,
  workflowStepAtom,
  exchangeRateAtom,
} from '../../lib/atoms';
import { SCRIPT_URL, vendors } from '../../lib/consts';
import { useTranslation } from '../../lib/hooks';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { DetectTypes, InventoryItem, InventoryItemData } from '../../lib/Types';
import { imageCache, fetchImageBatch, calculateCodesAndPrices } from '../../lib/utils';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

export const StatusMarkers = ({
  data,
  displayStyle = 'dots',
  onMarkerClick,
}: {
  data: InventoryItemData;
  displayStyle?: 'dots' | 'selector';
  onMarkerClick?: (
    key: keyof InventoryItemData,
    detectType: DetectTypes,
  ) => void;
}) => {
  const markers: {
    key: keyof InventoryItemData;
    label: string;
    title: string;
    detectType?: DetectTypes;
  }[] = [
      {
        key: 'spatialMasks',
        label: 'M',
        title: 'Masks Saved',
        detectType: 'Segmentation masks',
      },
      {
        key: 'spatialBoxes2d',
        label: 'B',
        title: 'Box Data Saved',
        detectType: '2D bounding boxes',
      },
      {
        key: 'spatialPoints',
        label: 'P',
        title: 'Points Saved',
        detectType: 'Points',
      },
      { key: 'generatedDescription', label: 'D', title: 'Description Saved' },
      { key: 'generatedImageUrls', label: 'G', title: 'Generated Images Saved' },
    ];

  if (displayStyle === 'selector') {
    const interactiveMarkers = markers.filter(
      (m) => m.detectType && data[m.key],
    );
    if (interactiveMarkers.length === 0) return null;

    return (
      <div className="flex border border-gray-500 rounded-full p-0.5 text-xs bg-black/10 dark:bg-white/10">
        {interactiveMarkers.map(({ key, label, title, detectType }) => (
          <button
            key={key as string}
            title={`View saved ${title}`}
            onClick={() => onMarkerClick && onMarkerClick(key, detectType!)}
            className="px-3 py-0.5 rounded-full font-bold bg-transparent text-[var(--text-color-primary)] hover:bg-[var(--accent-color)] hover:text-white transition-colors">
            {label}
          </button>
        ))}
      </div>
    );
  }

  // Default 'dots' style
  return (
    <div className="flex flex-row gap-1">
      {markers.map(({ key, label, title }) => {
        const isActive = !!data[key as keyof InventoryItemData];
        const activeClasses = 'bg-green-500 text-black';
        const inactiveClasses =
          'bg-transparent border border-[var(--text-color-secondary)] text-[var(--text-color-secondary)] opacity-40';
        return (
          <div
            key={key as string}
            title={title}
            className={`w-4 h-4 text-[8px] rounded-full flex items-center justify-center font-bold cursor-default ${isActive ? activeClasses : inactiveClasses
              }`}>
            {label}
          </div>
        );
      })}
    </div>
  );
};

type InventoryImageItemProps = {
  item: InventoryItem;
  onClick: (item: InventoryItem, dataUrl: string | null) => void;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (item: InventoryItem) => void;
  exchangeRate: number;
};

export const InventoryImageItem: React.FC<InventoryImageItemProps> = ({
  item,
  onClick,
  isSelectMode,
  isSelected,
  onToggleSelect,
  exchangeRate,
}) => {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '200px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    setIsLoading(true);
    const firstUrl = item.data.generatedPngUrl || (item.imageUrl ? item.imageUrl.split(',')[0].trim() : null);

    if (!firstUrl) {
      setIsLoading(false);
      return;
    }

    try {
      const url = new URL(firstUrl);
      const fileId = url.searchParams.get('id');

      if (fileId) {
        if (imageCache.has(fileId)) {
          setImageDataUrl(imageCache.get(fileId)!);
          setIsLoading(false);
          return;
        }

        fetchImageBatch(fileId)
          .then((data) => {
            const dataUrl = `data:${data.mimeType};base64,${data.base64}`;
            imageCache.set(fileId, dataUrl);
            setImageDataUrl(dataUrl);
          })
          .catch((e) => {
            console.error(`[InventoryImageItem] Failed to fetch image (fileId: ${fileId}, url: ${firstUrl}):`, e.message);
            setError('Failed to load');
          })
          .finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    } catch (e) {
      console.error('Invalid image URL:', firstUrl);
      setError('Invalid URL');
      setIsLoading(false);
    }
  }, [isVisible, item.imageUrl, item.data.generatedPngUrl]);

  const handleClick = () => {
    if (isSelectMode) {
      onToggleSelect(item);
    } else {
      onClick(item, imageDataUrl);
    }
  };

  const vendorColor =
    vendors[item.data.itemId as keyof typeof vendors]?.color || '#ccc';

  const dimensions = [item.data.widthCm, item.data.heightCm, item.data.lengthCm].filter(Boolean).join('x');
  const calculated = calculateCodesAndPrices(item.data, exchangeRate, '326');

  return (
    <button
      ref={ref}
      className="inventory-item-card w-full aspect-[4/3] relative overflow-hidden flex items-center justify-center text-xs shadow-md focus:outline-none transition-all group rounded-2xl border border-white/5 bg-black/40 hover:border-white/20"
      onClick={handleClick}
      title={item.label}
      disabled={isLoading}>
      {isLoading && <div className="scale-50"><LoadingIndicator /></div>}
      {error && <div className="text-red-500">{error}</div>}
      {imageDataUrl && <img src={imageDataUrl} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110 opacity-80 group-hover:opacity-100" />}
      {!isLoading && !imageDataUrl && !error && (
        <div className="w-1/3 h-1/3 opacity-20 text-[var(--secondary-color)]">
          <OnyxMiniLogo />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />

      {/* Top badges */}
      <div className="absolute top-0 inset-x-0 p-3 flex justify-between items-start pointer-events-none">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-black shadow-lg text-[10px]"
          style={{ backgroundColor: vendorColor }}
          title={`Vendor: ${item.data.itemId}`}>
          {item.data.itemId?.split('-')[0] || '?'}
        </div>
        <StatusMarkers data={item.data} />
      </div>

      {/* Bottom text block */}
      <div className="absolute bottom-0 inset-x-0 p-3 pt-8 flex flex-col justify-end text-left pointer-events-none">
        <div className="flex items-end justify-between mb-1">
          <p className="font-black text-white text-base leading-tight truncate drop-shadow-md">{item.data.shape || 'Unknown Object'}</p>
          <p className="font-mono text-[9px] text-white/50 shrink-0 ml-2">#{item.data.itemNumber}</p>
        </div>

        <div className="flex items-center justify-between text-[10px] text-white/70 mb-2">
          <p className="truncate uppercase font-medium tracking-wide drop-shadow-md">{item.data.material || 'Mixed Material'} · {item.data.shortDescription || 'Misc'}</p>
        </div>

        <div className="flex items-center justify-between bg-white/10 rounded-lg px-2 py-1.5 backdrop-blur-sm border border-white/5">
          <div className="flex items-center gap-1.5 font-mono text-[9px] text-white/90 shrink-0">
            <svg className="w-3 h-3 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            <span>{dimensions ? `${dimensions}` : '—'}</span>
            <span className="text-white/40 ml-1">{item.data.weightKg ? `${item.data.weightKg}kg` : ''}</span>
          </div>
          <div className="flex flex-col items-end">
            {item.data.price ? (
              <span className="font-bold text-[11px] text-[#AEE6F5]">${item.data.price}</span>
            ) : <span className="text-[9px] text-white/30">NO PRICE</span>}
          </div>
        </div>
      </div>

      {isSelectMode && (
        <div className={`absolute top-3 right-3 w-5 h-5 border-2 rounded-sm flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-400' : 'bg-black/50 border-white/50'}`}>
          {isSelected && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
        </div>
      )}
    </button>
  );
};

export function InventoryImages({ mode = 'catalog', onItemSelect }: { mode?: 'catalog' | 'market', onItemSelect?: (item: InventoryItem, dataUrl: string | null) => void }) {
  const t = useTranslation();
  const [inventory, setInventory] = useAtom(inventoryAtom);
  const [isLoading, setIsLoading] = useState(true);
  const [inventoryVersion] = useAtom(InventoryVersionAtom);
  const setImageSrc = useSetAtom(ImageSrcAtom);
  const setIsUploadedImage = useSetAtom(IsUploadedImageAtom);
  const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
  const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
  const [user] = useAtom(userAtom);
  const setWorkflowStep = useSetAtom(workflowStepAtom);
  const setAllAnnotationData = useSetAtom(allAnnotationDataAtom);

  const [isCatSelect, setIsCatSelect] = useAtom(isCatalogBatchSelectModeAtom);
  const [catSelected, setCatSelected] = useAtom(catalogBatchSelectedItemsAtom);

  const [isMarketSelect, setIsMarketSelect] = useAtom(isMarketMultiSelectModeAtom);
  const [marketSelected, setMarketSelected] = useAtom(marketMultiSelectItemsAtom);

  const setIsBatchActionsModalOpen = useSetAtom(isBatchActionsModalOpenAtom);
  const setBatchActionItemsData = useSetAtom(batchActionItemsDataAtom);

  const searchTerm = useAtomValue(inventorySearchTermAtom);
  const activeFilter = useAtomValue(inventoryActiveFilterAtom);


  const setIsDetailsPanelOpen = useSetAtom(isDetailsPanelOpenAtom);
  const setDetailsPanelMode = useSetAtom(detailsPanelModeAtom);
  const setMarketActiveTab = useSetAtom(marketActiveTabAtom);

  const exchangeRate = useAtomValue(exchangeRateAtom);

  const isSelectMode = mode === 'catalog' ? isCatSelect : isMarketSelect;

  useEffect(() => {
    let sub: any;
    const initDb = async () => {
      setIsLoading(true);
      try {
        const db = await import('../../lib/database').then(m => m.getDatabase());
        sub = db.inventory.find().$.subscribe((docs: any) => {
          setInventory(docs.map((doc: any) => ({
            row: doc.id,
            label: `${doc.shape || '?'} #${doc.item_number || '?'}`,
            imageUrl: doc.generated_png_url || (doc.media_urls ? doc.media_urls.split(',')[0].trim() : null),
            data: doc.toJSON()
          })));
          setIsLoading(false);
        });
      } catch (error) {
        console.error('Failed to initialize RxDB:', error);
        setIsLoading(false);
      }
    };

    initDb();
    return () => {
      if (sub) sub.unsubscribe();
    };
  }, [setInventory]);

  const handleImageClick = (item: InventoryItem, imageDataUrl: string | null) => {
    setAllAnnotationData({ boxes: [], masks: [], points: [] });
    setWorkflowStep('idle');

    setSelectedItemRow(item.row);
    setSelectedItemData(item.data);
    if (onItemSelect) {
      onItemSelect(item, imageDataUrl);
      return;
    }
    setImageSrc(imageDataUrl);
    setIsUploadedImage(false);
    if (mode === 'market') {
      setDetailsPanelMode('market');
      setMarketActiveTab('description');
    } else {
      setDetailsPanelMode('view');
    }
    setIsDetailsPanelOpen(true);
  };

  const handleToggleSelect = (item: InventoryItem) => {
    if (mode === 'catalog') {
      setCatSelected((prev) => prev.includes(item.row) ? prev.filter((r) => r !== item.row) : [...prev, item.row]);
    } else {
      setMarketSelected((prev) => prev.some(i => i.row === item.row) ? prev.filter((i) => i.row !== item.row) : [...prev, item]);
    }
  };

  const handleBatchAction = () => {
    const selectedItemsData = inventory.filter(item => catSelected.includes(item.row));
    setBatchActionItemsData(selectedItemsData);
    setIsBatchActionsModalOpen(true);
  };

  const selectedItemRows = mode === 'catalog' ? catSelected : marketSelected.map(i => i.row);

  const filteredInventory = inventory
    .filter((item) => {
      if (mode === 'catalog') {
        return !item.data.status || item.data.status === 'Catalog';
      }
      return true;
    })
    .filter((item) => activeFilter === 'All' || item.data.itemId === activeFilter)
    .filter((item) => {
      const lowerCaseSearch = searchTerm.toLowerCase();
      if (!lowerCaseSearch) return true;
      return Object.values(item.data).some(value => String(value).toLowerCase().includes(lowerCaseSearch));
    });

  if (isLoading) {
    return <div className="flex justify-center items-center h-full"><LoadingIndicator /></div>;
  }

  return (
    <div className="flex flex-col gap-4 w-full h-full">
      <div className="flex justify-between items-center">
        <h2 className="uppercase font-bold">{t.inventory}</h2>
        <button
          onClick={() => {
            if (mode === 'catalog') {
              setIsCatSelect(!isCatSelect);
              setCatSelected([]);
            } else {
              setIsMarketSelect(!isMarketSelect);
              setMarketSelected([]);
            }
          }}
          className={`button secondary !min-h-0 text-xs py-1 ${!isSelectMode && 'opacity-60'}`}>
          {isSelectMode ? t.cancel : t.select}
        </button>
      </div>

      {isSelectMode && mode === 'catalog' && catSelected.length > 0 && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-black/20">
          <span className="text-xs font-semibold">{catSelected.length} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setCatSelected([])} className="text-xs underline opacity-70 hover:opacity-100">{t.clear}</button>
            <button onClick={handleBatchAction} className="button secondary !min-h-0 text-xs py-1">{t.batchActions}</button>
          </div>
        </div>
      )}

      {isSelectMode && mode === 'market' && marketSelected.length > 0 && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-black/20">
          <span className="text-xs font-semibold">{marketSelected.length} selected</span>
          <button onClick={() => setMarketSelected([])} className="text-xs underline opacity-70 hover:opacity-100">{t.clear}</button>
        </div>
      )}

      <div className="flex-grow overflow-y-auto pr-2 -mr-2">
        {inventory.length === 0 && !isLoading ? (
          <p className="text-center text-sm text-[var(--text-color-secondary)] pt-4">{t.noInventoryFound}</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
            {filteredInventory.map((item) => (
              <InventoryImageItem
                key={item.row}
                item={item}
                onClick={handleImageClick}
                isSelectMode={isSelectMode}
                isSelected={selectedItemRows.includes(item.row)}
                onToggleSelect={handleToggleSelect}
                exchangeRate={exchangeRate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}