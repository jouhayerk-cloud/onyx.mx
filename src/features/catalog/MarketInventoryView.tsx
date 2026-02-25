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

import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import React, { useEffect, useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  ImageSrcAtom,
  IsUploadedImageAtom,
  SelectedItemDataAtom,
  SelectedItemRowAtom,
  isDetailsPanelOpenAtom,
  detailsPanelModeAtom,
  isMarketMultiSelectModeAtom,
  marketMultiSelectItemsAtom,
  inventoryAtom,
  inventorySearchTermAtom,
  inventoryActiveFilterAtom,
  marketActiveTabAtom,
  allAnnotationDataAtom,
  workflowStepAtom,
  exchangeRateAtom,
} from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { useTranslation } from '../../lib/hooks';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { InventoryItem, InventoryItemData } from '../../lib/Types';
import { imageCache, fetchImageBatch, calculateCodesAndPrices } from '../../lib/utils';
import { OnyxMiniLogo } from '../../components/OnyxLogo';

const getTextColorForBg = (hexColor: string | undefined): string => {
  if (!hexColor) return '#000000';
  try {
    const rgb = parseInt(hexColor.substring(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma < 128 ? '#FFFFFF' : '#000000';
  } catch {
    return '#000000';
  }
}

const getStatusClass = (data: InventoryItemData): 'RED' | 'YELLOW' | 'GREEN' | '' => {
  if (data.payDate) return 'GREEN'; // Paid
  if (data.payReq) return 'YELLOW'; // Payment Requested
  if (data.status === 'YES' || data.printDate) return 'RED'; // Approved, pending request
  return ''; // Default
};

type MarketItemCardProps = {
  item: InventoryItem;
  onClick: (item: InventoryItem, dataUrl: string | null) => void;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (item: InventoryItem) => void;
  exchangeRate: number;
};

const MarketItemCard: React.FC<MarketItemCardProps> = ({
  item,
  onClick,
  isSelectMode,
  isSelected,
  onToggleSelect,
  exchangeRate,
}) => {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const pngUrl = item.data.generatedPngUrl;
    if (!pngUrl) {
      setIsLoading(false);
      return;
    }
    let isActive = true;
    try {
      const url = new URL(pngUrl);
      const fileId = url.searchParams.get('id');
      if (fileId) {
        if (imageCache.has(fileId)) {
          setImageDataUrl(imageCache.get(fileId)!);
          setIsLoading(false);
          return;
        }

        fetchImageBatch(fileId)
          .then(data => {
            if (isActive) {
              const dataUrl = `data:${data.mimeType};base64,${data.base64}`;
              imageCache.set(fileId, dataUrl);
              setImageDataUrl(dataUrl);
            }
          })
          .catch(e => {
            console.error(`Failed to fetch image:`, e);
            if (isActive) toast.error("Failed to load an item image.");
          })
          .finally(() => { if (isActive) setIsLoading(false) });
      }
    } catch (e) {
      console.error('Invalid URL for market item card:', pngUrl);
      setIsLoading(false);
    }
    return () => { isActive = false; };
  }, [item.data.generatedPngUrl]);

  const handleClick = () => {
    if (isSelectMode) {
      onToggleSelect(item);
    } else {
      onClick(item, imageDataUrl);
    }
  };

  const vendorColor = vendors[item.data.itemId as keyof typeof vendors]?.color || '#ccc';
  const dimensions = [item.data.widthCm, item.data.heightCm, item.data.lengthCm].filter(Boolean).join('x');
  const statusClass = getStatusClass(item.data);
  const calculated = calculateCodesAndPrices(item.data, exchangeRate, '326');

  return (
    <button
      className={`w-full h-24 p-2 rounded-lg flex gap-3 text-left transition-all duration-200 relative overflow-hidden inventory-item-card ${isSelected ? 'ring-2 ring-[var(--main-color)]' : ''}`}
      onClick={handleClick}
      title={`${item.data.shape} #${item.data.itemNumber}`}
    >
      {/* Background Gradient */}
      <div
        className="absolute inset-0 opacity-40"
        style={{ background: item.data.color || 'transparent' }}
      />

      {/* Moved ID Tag */}
      <div
        className="vendor-tag !text-xs !px-2 !py-1 absolute top-0 left-0 !rounded-none rounded-br-lg rounded-tl-lg z-20"
        style={{ backgroundColor: vendorColor, color: getTextColorForBg(vendorColor) }}
      >
        {item.data.itemId}
      </div>

      {/* Floating Image */}
      <div className="w-20 h-20 shrink-0 relative flex items-center justify-center">
        {statusClass && <div className={`status-dot ${statusClass} absolute top-1 right-1 z-10`} title={`Status: ${statusClass}`}></div>}
        {isLoading && <div className="scale-50"><LoadingIndicator /></div>}
        {imageDataUrl ? (
          <img src={imageDataUrl} alt={item.data.shape} className="max-w-full max-h-full object-contain drop-shadow-lg" />
        ) : (
          !isLoading && <div className="w-1/2 h-1/2 opacity-30 text-[var(--secondary-color)]"><OnyxMiniLogo /></div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-grow min-w-0 relative z-10 justify-between py-1">
        <div className="flex justify-between items-start">
          <p className="font-bold text-sm truncate">{item.data.shape}</p>
          <span className="font-mono text-[10px] opacity-70 shrink-0 ml-2">#{item.data.itemNumber}</span>
        </div>

        <div>
          <p className="text-xs opacity-80 truncate">{item.data.material}</p>
          {dimensions && <p className="text-[10px] opacity-70 truncate font-mono mt-1">{dimensions} cm</p>}
        </div>

        <div className="flex justify-end items-center mt-1">
          {item.data.price && (
            <div className="flex gap-2 items-center">
              <div className="flex flex-col text-[9px] text-right font-mono opacity-80 leading-none">
                <span>AQ: {calculated.bookAqCode}</span>
                <span>LD: {calculated.bookLandCode}</span>
              </div>
              <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
                <span className="font-bold text-green-300 text-sm">${(parseFloat(String(item.data.price)) / exchangeRate).toFixed(2)}</span>
                <span className="text-[10px] text-green-300/60 leading-tight">({calculated.bookRetail})</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {isSelectMode && (
        <div className={`absolute top-2 right-2 w-4 h-4 border-2 rounded-sm flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-400' : 'bg-black/50 border-white/50'}`}>
          {isSelected && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
        </div>
      )}
    </button>
  );
};

export function MarketInventoryView({ onItemSelect }: { onItemSelect?: (item: InventoryItem, dataUrl: string | null) => void }) {
  const t = useTranslation();
  const inventory = useAtomValue(inventoryAtom);
  const [isMarketSelect, setIsMarketSelect] = useAtom(isMarketMultiSelectModeAtom);
  const [marketSelected, setMarketSelected] = useAtom(marketMultiSelectItemsAtom);
  const searchTerm = useAtomValue(inventorySearchTermAtom);
  const activeFilter = useAtomValue(inventoryActiveFilterAtom);

  const setAllAnnotationData = useSetAtom(allAnnotationDataAtom);
  const setWorkflowStep = useSetAtom(workflowStepAtom);
  const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
  const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
  const setIsUploadedImage = useSetAtom(IsUploadedImageAtom);
  const setImageSrc = useSetAtom(ImageSrcAtom);
  const setDetailsPanelMode = useSetAtom(detailsPanelModeAtom);
  const setMarketActiveTab = useSetAtom(marketActiveTabAtom);
  const setIsDetailsPanelOpen = useSetAtom(isDetailsPanelOpenAtom);

  const exchangeRate = useAtomValue(exchangeRateAtom);

  const handleItemClick = (item: InventoryItem, imageDataUrl: string | null) => {
    setAllAnnotationData({ boxes: [], masks: [], points: [] });
    setWorkflowStep('idle');
    setSelectedItemRow(item.row);
    setSelectedItemData(item.data);
    setIsUploadedImage(false);
    setImageSrc(imageDataUrl);
    setDetailsPanelMode('market');
    setMarketActiveTab('description');
    setIsDetailsPanelOpen(true);

    if (onItemSelect) {
      onItemSelect(item, imageDataUrl);
    }
  };

  const handleToggleSelect = (item: InventoryItem) => {
    setMarketSelected(prev =>
      prev.some(i => i.row === item.row)
        ? prev.filter(i => i.row !== item.row)
        : [...prev, item]
    );
  };

  const filteredInventory = inventory
    .filter(item => activeFilter === 'All' || item.data.itemId === activeFilter)
    .filter(item => {
      const lowerCaseSearch = searchTerm.toLowerCase();
      if (!lowerCaseSearch) return true;
      return Object.values(item.data).some(value =>
        String(value).toLowerCase().includes(lowerCaseSearch)
      );
    });

  return (
    <div className="glass-panel rounded-xl shrink-0 w-full h-full p-4 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h2 className="uppercase font-bold text-sm">Market Inventory</h2>
        <button
          onClick={() => {
            setIsMarketSelect(!isMarketSelect);
            if (isMarketSelect) setMarketSelected([]); // Clear selection when exiting select mode
          }}
          className={`button secondary !min-h-0 text-xs py-1 ${!isMarketSelect && 'opacity-60'}`}
        >
          {isMarketSelect ? 'Cancel' : 'Select'}
        </button>
      </div>

      {isMarketSelect && marketSelected.length > 0 && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-black/20">
          <span className="text-xs font-semibold">{marketSelected.length} selected</span>
          <button onClick={() => setMarketSelected([])} className="text-xs underline opacity-70 hover:opacity-100">Clear</button>
        </div>
      )}

      <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-2">
        {filteredInventory.length === 0 ? (
          <p className="text-center text-sm text-[var(--text-color-secondary)] pt-4">{t.noInventoryFound}</p>
        ) : (
          filteredInventory.map(item => (
            <MarketItemCard
              key={item.row}
              item={item}
              onClick={handleItemClick}
              isSelectMode={isMarketSelect}
              isSelected={marketSelected.some(i => i.row === item.row)}
              onToggleSelect={handleToggleSelect}
              exchangeRate={exchangeRate}
            />
          ))
        )}
      </div>
    </div>
  );
}