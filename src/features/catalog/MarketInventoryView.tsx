

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
import { imageCache, fetchImageBatch, calculateCodesAndPrices, normalizeInventoryData, onyxRound } from '../../lib/utils';
import { OnyxMiniLogo } from '../../components/OnyxLogo';
import { tr } from '../../lib/i18n';

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
            if (isActive) toast.error(tr("Failed to load an item image."));
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

  const fmtMXN = (v: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
  const fmtUSD = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
  const norm = normalizeInventoryData(item.data);
  const vendorPrefix = norm.itemId?.split('-')[0] || '';
  const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#ccc';
  const dimensions = [norm.widthCm, norm.heightCm, norm.lengthCm].filter(Boolean).join('x');
  const statusClass = getStatusClass(norm);
  const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');

  /* Rule 2, flat on data: this is a list row in a 280px rail, not an object on
     the slab, so it carries no relief and selection is a tint plus an inset
     accent bar rather than a depth change or a ring. The row used to paint the
     item's own gradient across its full width at opacity-40 and then stack
     white-on-it text; on the light slab SLAB floors that text to near-black
     while the inline gradient survives, so the row went unreadable. The colour
     is a swatch on the thumbnail now — meaning colour rides ON the slab. */
  return (
    <button
      type="button"
      className={`cat-row${isSelected ? ' is-on' : ''}`}
      onClick={handleClick}
      aria-pressed={isSelectMode ? isSelected : undefined}
      title={`${norm.shape} #${norm.itemNumber}`}
    >
      <div className="cat-row-media">
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: item.data.color || 'transparent' }}
        />
        {statusClass && <div className={`status-dot ${statusClass} absolute top-1 right-1 z-[2]`} title={`Status: ${statusClass}`}></div>}
        {isLoading && <div className="absolute inset-0 flex items-center justify-center scale-50"><LoadingIndicator /></div>}
        {imageDataUrl ? (
          <img src={imageDataUrl} alt={norm.shape} />
        ) : (
          !isLoading && <div className="absolute inset-0 m-auto w-1/2 h-1/2 opacity-30 text-(--secondary-color)"><OnyxMiniLogo /></div>
        )}
      </div>

      <div className="cat-row-body">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="vendor-tag shrink-0 px-1.5 py-0.5 text-[10px] font-black leading-none"
            style={{ backgroundColor: vendorColor, color: getTextColorForBg(vendorColor) }}
            title={`${tr("Vendor")}: ${vendorPrefix}`}>
            {vendorPrefix}
          </span>
          <p className="cat-row-name">{norm.shape}</p>
          <span className="cat-num ml-auto shrink-0 text-[10px] font-bold opacity-70">#{norm.itemNumber}</span>
        </div>

        <p className="cat-row-meta">
          {norm.material}{dimensions ? ` · ${dimensions} cm` : ''}
        </p>

        {norm.price && (
          <div className="cat-figs">
            <span><span className="cat-fig-k">{tr("AQ")}</span> {calculated.bookAqCode}</span>
            <span><span className="cat-fig-k">{tr("LD")}</span> {calculated.bookLandCode}</span>
            <span className="ml-auto font-black text-(--cat-ink)">
              {fmtUSD(onyxRound(parseFloat(String(norm.price)) / exchangeRate))}
            </span>
          </div>
        )}
      </div>
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
    .filter(item => item.data.status !== 'Pending Deletion')
    .filter(item => activeFilter === 'All' || item.data.itemId?.split('-')[0] === activeFilter)
    .filter(item => {
      const lowerCaseSearch = searchTerm.toLowerCase();
      if (!lowerCaseSearch) return true;
      return Object.values(item.data).some(value =>
        String(value).toLowerCase().includes(lowerCaseSearch)
      );
    });

  /* This view mounts inside LABS > 3D and AR, outside the #catalog root, so
     it carries .catalog-hub itself. */
  return (
    <div className="catalog-hub glass-panel rounded-xl shrink-0 w-full h-full p-4 flex flex-col gap-4 min-h-0">
      <div className="cat-head">
        <h2 className="cat-title">{tr("Market Inventory")}</h2>
        <button
          type="button"
          aria-pressed={isMarketSelect}
          onClick={() => {
            setIsMarketSelect(!isMarketSelect);
            if (isMarketSelect) setMarketSelected([]); // Clear selection when exiting select mode
          }}
          className="cat-key"
        >
          {isMarketSelect ? tr("Cancel") : tr("Select")}
        </button>
      </div>

      {isMarketSelect && marketSelected.length > 0 && (
        <div className="cat-selbar">
          <span className="cat-selbar-n">{marketSelected.length} {tr("selected")}</span>
          <button type="button" onClick={() => setMarketSelected([])} className="cat-key cat-key--quiet">{tr("Clear")}</button>
        </div>
      )}

      <div className="cat-scroll cat-rail">
        {filteredInventory.length === 0 ? (
          <div className="cat-empty">{t.noInventoryFound}</div>
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