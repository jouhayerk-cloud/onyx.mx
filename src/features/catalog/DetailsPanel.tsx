

import { ai } from '@/lib/ai';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import {
  allAnnotationDataAtom,
  detailsPanelDataAtom,
  detailsPanelFilesAtom,
  detailsPanelModeAtom,
  editingMaskIndexAtom,
  ImageSrcAtom,
  InventoryVersionAtom,
  is3DViewerOpenAtom,
  isDetailsPanelOpenAtom,
  marketActiveTabAtom,
  newItemGeneratedFilesAtom,
  SelectedItemDataAtom,
  SelectedItemRowAtom,
  userAtom,
  workflowStepAtom,
} from '../../lib/atoms';
import { SCRIPT_URL } from '../../lib/consts';
import { useItemImage, useTranslation } from '../../lib/hooks';
import { InventoryForm, type FormState } from '../../components/InventoryForm';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { ProductPoster } from '../../components/ProductPoster';
import { BoundingBoxMaskType, InventoryItemData, UploadedFile } from '../../lib/Types';
import { createCurvePath, imageCache, normalizeInventoryData, calculateCodesAndPrices, handleFileUpload } from '../../lib/utils';
import { exchangeRateAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';



type DescriptionType = 'short' | 'normal' | 'detailed';

const DetailRow = ({ label, value }: { label: string; value: any }) => {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-(--text-color-secondary) tracking-widest">{label}</p>
      <p className="text-sm text-(--text-color-primary)">{value}</p>
    </div>
  );
};

const FullDetailsDisplay = ({ data }: { data: InventoryItemData }) => {
  const { imageUrl, isLoading } = useItemImage(data);
  const exchangeRate = useAtomValue(exchangeRateAtom);
  const dimensions = [data.widthCm, data.heightCm, data.lengthCm].filter(Boolean).join(' x ');

  const vendorPrefix = data.itemId?.split('-')[0] || '';
  const vendorColor = vendors[vendorPrefix as keyof typeof vendors]?.color || '#ccc';
  const calculated = calculateCodesAndPrices(data, exchangeRate, '326');

  const setWorkflowStep = useSetAtom(workflowStepAtom);
  const setAllAnnotationData = useSetAtom(allAnnotationDataAtom);
  const setEditingMaskIndex = useSetAtom(editingMaskIndexAtom);
  const setImageSrc = useSetAtom(ImageSrcAtom);

  const handleEditMasks = async () => {
    if (!data.spatialMasks) {
      toast.error("No masks available to edit for this item.");
      return;
    }

    const originalImageUrl = data.mediaUrls?.split(',')[0].trim();
    if (!originalImageUrl) {
      toast.error("Original source image not found for this item.");
      return;
    }

    const toastId = toast.loading("Loading original image for editor...");

    try {
      const url = new URL(originalImageUrl);
      const fileId = url.searchParams.get('id');
      if (!fileId) throw new Error("Invalid image URL");

      let originalImageDataUrl: string;
      if (imageCache.has(fileId)) {
        originalImageDataUrl = imageCache.get(fileId)!;
      } else {
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'getImageBase64FromDriveId', fileId }),
        });
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
        originalImageDataUrl = `data:${result.data.mimeType};base64,${result.data.base64}`;
        imageCache.set(fileId, originalImageDataUrl);
      }

      setImageSrc(originalImageDataUrl);
      toast.dismiss(toastId);

      const parsedMasks = JSON.parse(data.spatialMasks);
      if (parsedMasks.length === 0) {
        toast.error("No masks found to edit.");
        return;
      }
      const parsedBoxes = data.spatialBoxes2d ? JSON.parse(data.spatialBoxes2d) : [];
      const parsedPoints = data.spatialPoints ? JSON.parse(data.spatialPoints) : [];

      const fullMasks: BoundingBoxMaskType[] = parsedMasks.map((mask: any) => ({
        ...mask,
        path: mask.points ? createCurvePath(mask.points) : '',
      }));

      setAllAnnotationData({
        boxes: parsedBoxes,
        points: parsedPoints,
        masks: fullMasks,
      });

      setEditingMaskIndex(0);
      setWorkflowStep('fullscreenEdit');

    } catch (e: any) {
      console.error("Failed to load original image for editing:", e);
      toast.error(`Failed to load editor: ${e.message}`, { id: toastId });
    }
  };

  return (
    <div className="space-y-4">
      {isLoading ? <div className="aspect-square w-full bg-black/20 rounded-lg flex items-center justify-center"><LoadingIndicator /></div> :
        imageUrl && <img src={imageUrl} alt={data.shape} className="w-full h-auto max-h-64 object-contain rounded-lg bg-black/20" />
      }
      <div className="flex gap-2">
        <DetailRow label="Vendor" value={data.itemId} />
        {calculated.bookBardcode && (
          <div className="ml-auto">
            <p className="text-[10px] font-bold uppercase text-(--text-color-secondary) tracking-widest">TAG ID</p>
            <span
              className="px-2 py-0.5 text-[10px] font-black tracking-wider rounded border border-black text-black shadow-sm"
              style={{ backgroundColor: vendorColor }}
            >
              {calculated.bookBardcode}
            </span>
          </div>
        )}
      </div>
      <DetailRow label="Num" value={data.itemNumber} />
      <DetailRow label="Shape" value={data.shape} />
      <DetailRow label="Mat" value={data.material} />
      <DetailRow label="Desc" value={data.description} />
      <DetailRow label="Dims" value={dimensions ? `${dimensions} cm` : '—'} />
      <DetailRow label="Wght" value={data.weightKg ? `${data.weightKg} kg` : '—'} />
      <DetailRow label="Cost" value={data.price ? `$${Math.ceil(Number(data.price))} MXN` : '—'} />
      <DetailRow label="Qty" value={data.quantity} />
      {data.color && (
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold uppercase text-(--text-color-secondary) tracking-widest">Color</p>
          <div className="w-10 h-5 rounded" style={{ background: data.color }}></div>
        </div>
      )}
      {data.shortDescription && <DetailRow label="Short" value={data.shortDescription} />}
      {data.generatedDescription && <DetailRow label="Points" value={<div className="whitespace-pre-wrap">{data.generatedDescription}</div>} />}
      {data.detailedDescription && <DetailRow label="Details" value={<div className="prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: data.detailedDescription }}></div>} />}
      {data.spatialMasks && (
        <div className="pt-4 border-t border-(--border-color)">
          <button onClick={handleEditMasks} className="button w-full"><svg className="w-3 h-3 inline-block mr-1"><use href="#edit" /></svg>Masks</button>
        </div>
      )}
    </div>
  );
};

export function DetailsPanel() {
  const t = useTranslation();
  const [isOpen, setIsOpen] = useAtom(isDetailsPanelOpenAtom);
  const setIs3DViewerOpen = useSetAtom(is3DViewerOpenAtom);
  const [mode, setMode] = useAtom(detailsPanelModeAtom);
  const [itemData, setItemData] = useAtom(SelectedItemDataAtom);
  const [itemRow] = useAtom(SelectedItemRowAtom);
  const [user] = useAtom(userAtom);
  const setInventoryVersion = useSetAtom(InventoryVersionAtom);

  const [createModeData, setCreateModeData] = useAtom(detailsPanelDataAtom);
  const [createModeFiles, setCreateModeFiles] = useAtom(detailsPanelFilesAtom);
  const [newItemFiles, setNewItemFiles] = useAtom(newItemGeneratedFilesAtom);

  const [activeTab, setActiveTab] = useState<'description' | 'poster'>('description');

  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState<DescriptionType | 'image' | false>(false);
  const [generatedDesc, setGeneratedDesc] = useState('');

  const { imageUrl: currentItemImageUrl, isLoading: isImageLoading } = useItemImage(itemData);

  const data = mode === 'create' ? createModeData : itemData;
  const mainImage = mode === 'create' ? createModeFiles?.find(f => f.type === 'image')?.dataUrl : currentItemImageUrl;

  const handleClose = () => {
    if (isSaving || isGenerating) return;
    if (mode === 'edit') {
      setMode('view');
      return;
    }
    setIsOpen(false);
    setActiveTab('description');
  };

  const handleTabClick = (tab: 'description' | '3d' | 'poster') => {
    if (mode === 'create' || mode === 'edit') return;
    if (tab === '3d') {
      if (itemData?.spatialMasks || itemData?.generatedSvgUrl) {
        setIs3DViewerOpen(true);
      } else {
        toast.error('3D preview requires generated mask or SVG data.');
      }
    } else {
      setActiveTab(tab as any);
    }
  };

  const handleGenerateDescription = async (type: DescriptionType) => {
    if (!data || !mainImage) return;
    setIsGenerating(type);
    setGeneratedDesc('');

    const itemInfo = `Shape: ${data.shape}, Material: ${data.material}, Dimensions: ${data.widthCm}x${data.lengthCm}x${data.heightCm}cm.`;
    let prompt: string;
    switch (type) {
      case 'short':
        prompt = `Write a short, one-sentence product description for an item with these details: ${itemInfo}.`;
        break;
      case 'normal':
        prompt = `Write 3 to 5 advertisement-style selling bullet points for an item with these details: ${itemInfo}. Each bullet point must be a short, single phrase. Format as a single string, with each bullet point starting with a '*' and separated by a newline. Do not use HTML tags.`;
        break;
      case 'detailed':
        prompt = `Write a detailed product description for an item with these details: ${itemInfo}. Use simple HTML tags like <p>, <ul>, <li>, and <strong> for formatting.`;
        break;
    }

    try {
      const response = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      for await (const chunk of response) {
        setGeneratedDesc(prev => prev + chunk.text);
      }
    } catch (error: any) {
      toast.error(`Description generation failed: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const saveDescription = async (type: 'shortDescription' | 'generatedDescription' | 'detailedDescription') => {
    if (!itemData || !itemRow) return;
    setIsSaving(true);
    try {
      const payload = { [type]: generatedDesc };
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'updateFullItem', row: itemRow, itemData: payload, user }),
      });
      const result = await response.json();
      if (result.status !== 'success') throw new Error(result.message);

      setItemData(prev => prev ? { ...prev, ...payload } : null);
      setGeneratedDesc('');
      toast.success('Description saved!');
    } catch (error: any) {
      toast.error(`Save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFormSubmit = async ({ formState, newFiles }: { formState: FormState, newFiles: UploadedFile[] }) => {
    setIsSaving(true);
    const toastId = toast.loading(t.saving);

    try {
      let uploadedUrls: string[] = [];
      if (newFiles.length > 0) {
        toast.loading("Uploading new files to Drive...", { id: toastId });
        for (const file of newFiles) {
          const fileToUpload = file.originalFile;
          if (fileToUpload) {
            try {
              const result = await handleFileUpload(fileToUpload, user);
              if (result) {
                uploadedUrls.push(result.thumbnailUrl);
                console.log('[DetailsPanel] File uploaded:', fileToUpload.name, '=>', result.fileId);
              }
            } catch (uploadErr: any) {
              console.error('[DetailsPanel] Single file failed:', fileToUpload.name, uploadErr);
              throw new Error(`Upload failed for ${fileToUpload.name}: ${uploadErr.message}`);
            }
          }
        }
      }

      const existingPhotos = (mode === 'edit' && itemData?.mediaUrls)
        ? itemData.mediaUrls.split(',').map((url: string) => url.trim()).filter(Boolean)
        : [];

      const mediaUrlsStr = mode === 'edit'
        ? [...existingPhotos, ...uploadedUrls].join(',')
        : createModeFiles ? createModeFiles.map((f: any) => f.dataUrl).join(',') : '';

      if (mode === 'edit') {
        const dbRow = {
          shape: formState.shape,
          material: formState.material,
          color: formState.color,
          description: formState.description,
          weight_kg: formState.weightKg ? Number(formState.weightKg) : null,
          height_cm: formState.heightCm ? Number(formState.heightCm) : null,
          width_cm: formState.widthCm ? Number(formState.widthCm) : null,
          length_cm: formState.lengthCm ? Number(formState.lengthCm) : null,
          price_mxn: formState.price ? Number(formState.price) : null,
          quantity: formState.quantity ? Number(formState.quantity) : 1,
          media_urls: mediaUrlsStr,
          updated_at: new Date().toISOString()
        };

        const tableName = itemData?.status === 'Production' ? 'production' : 'inventory';
        const { error } = await supabase.from(tableName).update(dbRow).eq('id', itemRow);
        if (error) throw error;
      } else {
        const payload = { ...formState, ...newItemFiles, photos: createModeFiles || [] };
        const body = JSON.stringify({ action: 'appendInventory', inventory: [payload], user });
        const response = await fetch(SCRIPT_URL, { method: 'POST', body });
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
      }

      toast.success(t.itemSavedSuccess, { id: toastId });
      setInventoryVersion(v => v + 1);
      handleClose();
    } catch (error: any) {
      toast.error(`${t.saveFailed} ${error.message}`, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!itemData || !itemRow) return;

    const isDeveloper = user?.role === 'Developer';
    const confirmMsg = isDeveloper
      ? `Are you SURE you want to PERMANENTLY delete ${itemData.shape}? This cannot be undone.`
      : `Are you sure you want to request deletion for ${itemData.shape}? It will be hidden until a developer confirms.`;

    if (!window.confirm(confirmMsg)) return;

    setIsSaving(true);
    const toastId = toast.loading(isDeveloper ? 'Deleting...' : 'Marking for deletion...');
    try {
      if (isDeveloper) {
        const { error } = await supabase.from('inventory').delete().eq('id', itemRow);
        if (error) throw error;
        toast.success('Item deleted permanently', { id: toastId });
      } else {
        const { error } = await supabase.from('inventory').update({
          status: 'Pending Deletion',
          marked_by: user?.email,
          updated_at: new Date().toISOString()
        }).eq('id', itemRow);
        if (error) throw error;
        toast.success('Deletion requested', { id: toastId });
      }

      setInventoryVersion(v => v + 1);
      setIsOpen(false);
    } catch (error: any) {
      toast.error(`Operation failed: ${error.message}`, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const title = mode === 'create' ? t.createNewItem : mode === 'edit' ? t.editItem : t.itemDetails;
  const TABS = [
    { id: 'description', label: 'Description' },
    { id: '3d', label: '3D' },
    { id: 'poster', label: 'Poster' }
  ];

  const renderContent = () => {
    if (mode === 'market') {
      if (!data) return <div className="p-4 text-center text-sm text-(--text-color-secondary)">Select an item to see its details.</div>;
      return <FullDetailsDisplay data={data as InventoryItemData} />;
    }

    switch (activeTab) {
      case 'poster':
        return <ProductPoster item={itemData!} imageUrl={mainImage || null} />;
      case 'description':
      default:
        if (mode === 'create' || mode === 'edit') {
          return <InventoryForm
            initialData={data || {}}
            onSubmit={handleFormSubmit}
            isSaving={isSaving}
            submitButtonText={t.saveItemToSheet}
            isEditMode={mode === 'edit'}
          />;
        }
        if (!itemData) return <div className="p-4 text-center text-sm text-(--text-color-secondary)">Select an item to see its details.</div>;
        return <FullDetailsDisplay data={itemData} />;
    }
  };

  const isFullscreen = mode === 'edit';

  const panelClasses = isFullscreen
    ? "fixed inset-0 z-[100] w-full h-full bg-black/95 backdrop-blur-md overflow-y-auto"
    : `glass-panel rounded-xl shrink-0 w-[85vw] max-w-sm h-full fixed top-0 right-0 z-50 lg:static lg:w-[420px] lg:h-full lg:transform-none transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`;

  if (!isOpen) return null;

  return (
    <div className={panelClasses}>
      <div className={`flex flex-col h-full ${isFullscreen ? 'max-w-2xl mx-auto w-full pt-8' : ''}`}>
        <div className={`p-4 border-b border-(--border-color) flex justify-between items-center shrink-0 ${isFullscreen ? 'bg-black/40 rounded-t-2xl' : ''}`}>
          <h2 className={`font-bold ${isFullscreen ? 'text-2xl' : ''}`}>{title}</h2>
          <button onClick={handleClose} className="text-2xl hover:text-white/50 transition-colors">&times;</button>
        </div>
        <div className={`grow overflow-y-auto ${isFullscreen ? 'bg-black/20 p-4' : ''}`}>
          <div className="p-4">
            {isImageLoading && mode !== 'create' ? <LoadingIndicator /> : renderContent()}
          </div>
        </div>
        {(mode === 'view' && (user?.role === 'Admin' || user?.role === 'Developer')) && (
          <div className="p-4 border-t border-(--border-color) shrink-0 flex gap-2">
            <button className="button w-full" onClick={() => setMode('edit')}><svg className="w-4 h-4 inline-block mr-2"><use href="#edit" /></svg>Edit</button>
          </div>
        )}
        {(mode === 'edit' && (user?.role === 'Admin' || user?.role === 'Developer')) && (
          <div className={`p-4 border-(--border-color) shrink-0 flex gap-2 ${isFullscreen ? 'border-t-0 pb-8' : 'border-t'}`}>
            <button className={`button ${user?.role === 'Developer' ? 'bg-red-600!' : 'bg-orange-500!'} grow`} onClick={handleDelete} disabled={isSaving}>
              <svg className="w-4 h-4 inline-block mr-2"><use href="#trash" /></svg>
              {user?.role === 'Developer' ? 'DELETE' : 'Mark Del'}
            </button>
          </div>
        )}
        {(mode === 'view' && (user?.role === 'Admin' || user?.role === 'Client' || user?.role === 'Developer') && (!itemData?.status || itemData?.status === 'Catalog')) && (
          <div className="p-4 border-t border-(--border-color) shrink-0">
            <button
              className="button w-full bg-(--main-color)! text-black! font-black"
              onClick={async () => {
                if (!itemData || !itemRow) return;
                setIsSaving(true);
                const toastId = toast.loading('Marking as Acquired...');
                try {
                  const payload = {
                    status: 'Acquired',
                    acquired_by: user?.email,
                    acquired_at: new Date().toISOString(),
                    workbook: '326' // Ensure it goes to active workbook
                  };
                  const response = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'updateFullItem', row: itemRow, itemData: payload, user })
                  });
                  const result = await response.json();
                  if (result.status !== 'success') throw new Error(result.message);

                  setItemData(prev => prev ? { ...prev, ...payload } : null);
                  setInventoryVersion(v => v + 1);
                  toast.success('Acquired!', { id: toastId });
                  handleClose();
                } catch (e: any) {
                  toast.error(`Acquisition failed: ${e.message}`, { id: toastId });
                } finally {
                  setIsSaving(false);
                }
              }}
              disabled={isSaving}
            >
              <svg className="w-4 h-4 inline-block mr-2"><use href="#check" /></svg>Acquire
            </button>
          </div>
        )}
        {(mode === 'view' && (user?.role === 'Admin' || user?.role === 'Developer') && itemData?.status === 'Acquired') && (
          <div className="p-4 border-t border-(--border-color) shrink-0">
            <button
              className="button w-full bg-[#F7941D]! text-black! font-black"
              onClick={async () => {
                if (!itemData || !itemRow) return;
                setIsSaving(true);
                const toastId = toast.loading('Marking as Archive...');
                try {
                  const payload = {
                    status: 'Archive',
                    workbook: '825'
                  };
                  const response = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'updateFullItem', row: itemRow, itemData: payload, user })
                  });
                  const result = await response.json();
                  if (result.status !== 'success') throw new Error(result.message);

                  setItemData(prev => prev ? { ...prev, ...payload } : null);
                  setInventoryVersion(v => v + 1);
                  toast.success('Archived!', { id: toastId });
                  handleClose();
                } catch (e: any) {
                  toast.error(`Archive failed: ${e.message}`, { id: toastId });
                } finally {
                  setIsSaving(false);
                }
              }}
              disabled={isSaving}
            >
              <svg className="w-4 h-4 inline-block mr-2"><use href="#archive" /></svg>Archive
            </button>
          </div>
        )}
        {(mode === 'view' && (user?.role === 'Admin' || user?.role === 'Developer') && (itemData?.status === 'Archive' || itemData?.workbook === '825') && itemData?.status !== 'Shipped') && (
          <div className="p-4 border-t border-(--border-color) shrink-0">
            <button
              className="button w-full bg-[#8DC63F]! text-black! font-black"
              onClick={async () => {
                if (!itemData || !itemRow) return;
                setIsSaving(true);
                const toastId = toast.loading('Marking as Shipped...');
                try {
                  const payload = {
                    status: 'Shipped'
                  };
                  const response = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'updateFullItem', row: itemRow, itemData: payload, user })
                  });
                  const result = await response.json();
                  if (result.status !== 'success') throw new Error(result.message);

                  setItemData(prev => prev ? { ...prev, ...payload } : null);
                  setInventoryVersion(v => v + 1);
                  toast.success('Shipped!', { id: toastId });
                  handleClose();
                } catch (e: any) {
                  toast.error(`Shipping failed: ${e.message}`, { id: toastId });
                } finally {
                  setIsSaving(false);
                }
              }}
              disabled={isSaving}
            >
              <svg className="w-4 h-4 inline-block mr-2"><use href="#truck" /></svg>Ship
            </button>
          </div>
        )}
        {mode === 'edit' && (
          <div className="p-4 border-t border-(--border-color) shrink-0 flex gap-2">
            <button className="button secondary grow" onClick={handleClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}