

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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SCRIPT_URL, vendors } from '../../lib/consts';
import { useTranslation } from '../../lib/hooks';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { DetectTypes, InventoryItem, InventoryItemData } from '../../lib/Types';
import { imageCache, fetchImageBatch, calculateCodesAndPrices, normalizeInventoryData, getCleanImageUrl, extractFileId, resizeImage, generateVideoThumbnail } from '../../lib/utils';
import { tr } from '../../lib/i18n';
import { MediaOriginBadge, MediaOriginNote, mediaOriginOf } from './ItemMediaPanel';

/* The list's value classes, restated here so a card and a row render the same
   figure the same way. Kept in sync with UnifiedInventoryView's COL_TEXT by
   hand: it is not exported, and importing the 2,000-line list into the grid to
   get five class strings would be a worse trade. */
const COL_TEXT = {
    color:  'text-[12px] font-black text-(--text-color)/65 uppercase tracking-[0.05em]',
    size:   'text-[13px] font-mono font-black text-(--text-color)',
    weight: 'text-[13px] font-mono font-bold text-(--text-color)/70',
    price:  'text-[14px] font-black text-(--text-color)',
    total:  'text-[14px] font-black text-(--main-color)',
    aq:     'text-[13px] font-mono font-black text-(--text-color)/75',
    ld:     'text-[13px] font-mono font-black text-yellow-500/90',
};

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
      <div className="catalog-hub cat-markers cat-markers--select">
        {interactiveMarkers.map(({ key, label, title, detectType }) => (
          <button
            key={key as string}
            type="button"
            title={`View saved ${title}`}
            onClick={() => onMarkerClick && onMarkerClick(key, detectType!)}
            className="cat-marker">
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="catalog-hub cat-markers">
      {markers.map(({ key, label, title }) => {
        const isActive = !!data[key as keyof InventoryItemData];
        return (
          <span
            key={key as string}
            title={`${title}: ${isActive ? tr("saved") : tr("not generated yet")}`}
            className={`cat-marker${isActive ? ' is-on' : ''}`}>
            {label}
          </span>
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
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
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

  /* The gallery is built the same way everywhere in this module: the cleaned
     PNG first, then the raw uploads. `cleanedUrl` is kept beside it so the
     frame on screen can say WHICH of the two it is, rather than leaving the
     reader to infer it from an array position they cannot see. */
  const cleanedUrl = useMemo(
    () => normalizeInventoryData(item.data).generatedPngUrl || null,
    [item.data],
  );

  const mediaUrls = useMemo(() => {
    const norm = normalizeInventoryData(item.data);
    const urls = [norm.generatedPngUrl, ...(norm.mediaUrls ? String(norm.mediaUrls).split(',').map(u => u.trim()).filter(Boolean) : [])];
    return urls.filter(Boolean);
  }, [item.data]);

  useEffect(() => {
    if (!isVisible) return;

    let isActive = true;
    setIsLoading(true);

    const rawUrl = mediaUrls[activeMediaIndex];
    if (!rawUrl) {
        setIsLoading(false);
        return;
    }

    const fileId = extractFileId(rawUrl);

    if (!fileId) {
      setImageDataUrl(rawUrl);
      setIsVideo(rawUrl.toLowerCase().includes('.mov') || rawUrl.toLowerCase().includes('.mp4'));
      setIsLoading(false);
      return;
    }

    const thumbKey = fileId + '_thumb';
    if (imageCache.has(thumbKey)) {
      const cached = imageCache.get(thumbKey)!;
      setImageDataUrl(cached);
      setIsVideo(rawUrl.toLowerCase().includes('.mov') || rawUrl.toLowerCase().includes('.mp4'));
      setIsLoading(false);
      return;
    }

    if (imageCache.has(fileId)) {
        const cached = imageCache.get(fileId)!;
        if (cached.startsWith('data:video/')) {
            setIsVideo(true);
            generateVideoThumbnail(cached).then(thumb => {
                if (isActive) {
                    setImageDataUrl(thumb);
                    imageCache.set(thumbKey, thumb);
                }
            }).catch(() => {
                if (isActive) setImageDataUrl(cached);
            });
        } else {
            setImageDataUrl(cached);
            setIsVideo(false);
        }
        setIsLoading(false);
        return;
    }

    fetchImageBatch(fileId)
      .then(async (data) => {
        if (!isActive) return;
        const mime = data.mimeType;
        const dataUrl = `data:${mime};base64,${data.base64}`;
        let finalThumb = dataUrl;

        try {
          if (mime.startsWith('video/')) {
            setIsVideo(true);
            finalThumb = await generateVideoThumbnail(dataUrl);
          } else {
            setIsVideo(false);
            finalThumb = await resizeImage(dataUrl, 512); 
          }
        } catch (e) {
          console.warn("[Grid] Thumb gen failed for " + fileId, e);
        }

        if (isActive) {
          if (mime.startsWith('video/')) {
             imageCache.set(fileId, dataUrl);
             imageCache.set(thumbKey, finalThumb);
          } else {
             imageCache.set(fileId, finalThumb);
          }
          setImageDataUrl(finalThumb);
        }
      })
      .catch((err) => {
        console.error("Failed to load grid item image:", err);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => { isActive = false; };
  }, [isVisible, activeMediaIndex, mediaUrls]);

  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!isHovered || mediaUrls.length <= 1) return;
    
    const interval = setInterval(() => {
      setActiveMediaIndex(prev => (prev + 1) % mediaUrls.length);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [isHovered, mediaUrls.length]);

  const handleNavigate = (e: React.MouseEvent, dir: number) => {
    e.stopPropagation();
    setActiveMediaIndex((prev) => (prev + dir + mediaUrls.length) % mediaUrls.length);
  };

  const handleClick = () => {
    if (isSelectMode) {
      onToggleSelect(item);
    } else {
      onClick(item, imageDataUrl);
    }
  };

  const norm = normalizeInventoryData(item.data);
  const vendorPrefix = String(norm?.itemId || '').split('-')[0] || '';
  const vendorColor =
    vendors[vendorPrefix as keyof typeof vendors]?.color || '#ccc';

  const dimensions = [norm.widthCm, norm.heightCm, norm.lengthCm].filter(Boolean).join('x');
  const calculated = calculateCodesAndPrices(norm, exchangeRate, '326');

  /* Which of the two this frame is. The badge names it on the face of the
     photograph, because the whole point of the cleaning STUDIO is telling a
     cleaned shot from the original it came from. */
  const origin = mediaOriginOf(mediaUrls[activeMediaIndex], cleanedUrl);

  const openOnKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <article
      ref={ref as unknown as React.RefObject<HTMLElement>}
      className={`catalog-hub inv-card inv-card--std${isSelected ? ' is-open' : ''}`}
      tabIndex={0}
      aria-label={`${calculated.bookBarcode || norm.itemId || ''} · ${norm.shape || tr("Unknown Object")}`}
      title={item.label}
      onClick={handleClick}
      onKeyDown={openOnKey}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isSelectMode && (
        <button
          type="button"
          className="inv-card-select"
          aria-pressed={isSelected}
          aria-label={tr("Select item")}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(item); }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      )}

      {/* The photograph, in the pressed well cards.css already defines. The
          information used to be painted ON this picture over a black scrim;
          on the light slab SLAB floors every `text-white` to near-black ink
          while Tailwind v4's `bg-linear-*` scrim survives untouched, so the
          whole caption rendered black-on-black. It lives in .inv-card-body
          below the photo now, which is where a card puts it anyway. */}
      <div
        className="inv-card-media cat-media"
        onClick={(e) => { if (mediaUrls.length > 1) { e.stopPropagation(); handleNavigate(e, 1); } }}>
        {imageDataUrl ? (
          <img src={imageDataUrl} alt={norm.shape || ''} className="inv-card-img" />
        ) : !isLoading && (
          <div className="cat-media-empty">{error || tr("No photo yet")}</div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="scale-50"><LoadingIndicator /></div>
          </div>
        )}

        {isVideo && imageDataUrl && (
          <span className="inv-card-video" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
        )}

        {/* The distinction, in a word, on the face of the frame it describes. */}
        {imageDataUrl && <MediaOriginBadge origin={origin} variant="onmedia" />}

        {mediaUrls.length > 1 && (
          <>
            <button
              type="button"
              className="cat-media-key cat-media-key--prev"
              aria-label={tr("Previous photo")}
              onClick={(e) => handleNavigate(e, -1)}>
              <ChevronLeft size={15} strokeWidth={3} />
            </button>
            <button
              type="button"
              className="cat-media-key cat-media-key--next"
              aria-label={tr("Next photo")}
              onClick={(e) => handleNavigate(e, 1)}>
              <ChevronRight size={15} strokeWidth={3} />
            </button>
            <span className="cat-media-count">{activeMediaIndex + 1} / {mediaUrls.length}</span>
          </>
        )}
      </div>

      <div className="inv-card-body">
        <div className="inv-card-id">
          <span
            className="vendor-tag inline-flex items-center text-black text-[12px] leading-none font-black uppercase tracking-tight w-fit max-w-full overflow-hidden"
            title={`${tr("Vendor")}: ${vendorPrefix}`}>
            <span className="px-1.5 py-1 shrink-0" style={{ backgroundColor: vendorColor }}>{vendorPrefix || '?'}</span>
          </span>
          <span className="inv-card-qty" title={tr("Quantity")}>{norm.quantity || 1}</span>
          <span className="cat-num ml-auto text-[11px] font-bold text-(--text-color)/60">#{norm.itemNumber}</span>
        </div>

        <h3 className="inv-card-name" title={item.label}>
          <b>{norm.shape || tr("Unknown Object")}</b>
          {norm.shortDescription && <> <span>{norm.shortDescription}</span></>}
        </h3>
        <p className={`inv-card-stone ${COL_TEXT.color}`} title={norm.material || ''}>
          {norm.material || tr("Mixed Material")}
        </p>

        {/* The instrument: size and weight over landed and retail. Every cell
            is a figure column, so every cell is tabular — both webfaces ship
            proportional digits and a stack of them visibly drifts. */}
        <div className="inv-readout">
          <span className={`inv-ro-v ${COL_TEXT.size}`}>{dimensions ? `${dimensions}cm` : '—'}</span>
          <span className={`inv-ro-v inv-r ${COL_TEXT.weight}`}>{norm.weightKg ? `${norm.weightKg}kg` : '—'}</span>
          <span className="inv-ro">
            <span className="inv-ro-l">{tr("Landed")}</span>
            <span className={`inv-ro-v ${COL_TEXT.price}`}>{calculated.bookLanded !== '-' ? `$${calculated.bookLanded}` : '—'}</span>
          </span>
          <span className="inv-ro inv-r">
            <span className="inv-ro-l">{tr("Retail")}</span>
            <span className={`inv-ro-v ${COL_TEXT.total}`}>{calculated.bookRetail !== '-' ? `$${calculated.bookRetail}` : '—'}</span>
          </span>
        </div>

        <div className="inv-card-foot">
          <span className="inv-card-codes">
            <span className="inv-card-code"><span className="inv-code-k">AQ</span><span className={COL_TEXT.aq}>{calculated.bookAqCode || '—'}</span></span>
            <span className="inv-card-code"><span className="inv-code-k inv-code-k--next">LD</span><span className={COL_TEXT.ld}>{calculated.bookLandCode || '—'}</span></span>
          </span>
        </div>
      </div>
    </article>
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
        sub = db.inventory.find({
          selector: {
            status: { $ne: 'Pending Deletion' }
          }
        }).$.subscribe((docs: any) => {
          setInventory(docs.map((doc: any) => {
            const norm = normalizeInventoryData(doc.toJSON());
            return {
              row: doc.id,
              label: `${norm.shape || '?'} #${norm.itemNumber || '?'}`,
              imageUrl: getCleanImageUrl(norm.generatedPngUrl || (norm.mediaUrls ? String(norm.mediaUrls).split(',')[0].trim() : null)),
              data: norm
            };
          }));
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

  /* The selection bars used to be `bg-black/20`, which SLAB flattens to the
     page colour with !important — the bar and the page behind it resolved to
     the same rgb, so on the light slab a live selection was invisible. They
     are readouts now: pressed, hairlined, and the count is tabular. */
  return (
    <div className="catalog-hub flex flex-col gap-4 w-full h-full min-h-0">
      <div className="cat-head">
        <h2 className="cat-title">{t.inventory}</h2>
        <button
          type="button"
          aria-pressed={isSelectMode}
          onClick={() => {
            if (mode === 'catalog') {
              setIsCatSelect(!isCatSelect);
              setCatSelected([]);
            } else {
              setIsMarketSelect(!isMarketSelect);
              setMarketSelected([]);
            }
          }}
          className="cat-key">
          {isSelectMode ? t.cancel : t.select}
        </button>
      </div>

      {/* Said once per surface, so the badge on each frame does not have to
          carry the whole rule on its own. */}
      <MediaOriginNote />

      {isSelectMode && mode === 'catalog' && catSelected.length > 0 && (
        <div className="cat-selbar">
          <span className="cat-selbar-n">{catSelected.length} {tr("selected")}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCatSelected([])} className="cat-key cat-key--quiet">{t.clear}</button>
            <button type="button" onClick={handleBatchAction} className="cat-key">{t.batchActions}</button>
          </div>
        </div>
      )}

      {isSelectMode && mode === 'market' && marketSelected.length > 0 && (
        <div className="cat-selbar">
          <span className="cat-selbar-n">{marketSelected.length} {tr("selected")}</span>
          <button type="button" onClick={() => setMarketSelected([])} className="cat-key cat-key--quiet">{t.clear}</button>
        </div>
      )}

      <div className="cat-scroll">
        {inventory.length === 0 && !isLoading ? (
          <div className="cat-empty">{t.noInventoryFound}</div>
        ) : (
          <div className="cat-grid">
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