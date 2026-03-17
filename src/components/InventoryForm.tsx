

import React, { useEffect, useState } from 'react';
import { vendors } from '../lib/consts';
import { useTranslation } from '../lib/hooks';
import { InventoryItemData, UploadedFile } from '../lib/Types';
import { readFileAsDataURL, extractFileId, fetchImageBatch, imageCache, generateVideoThumbnail, resizeImage } from '../lib/utils';
import { Play, FileVideo, ImageIcon, Plus } from 'lucide-react';

export type FormState = {
  itemId: string;
  itemNumber: string;
  expires: string;
  shape: string;
  material: string;
  description: string;
  weightKg: string;
  heightCm: string;
  widthCm: string;
  lengthCm: string;
  price: string;
  quantity: string;
  color: string;
  vendorId: string;
  itemType: string;
  status: string;
  workbook: string;
};

interface InventoryFormProps {
  initialData?: Partial<InventoryItemData>;
  onSubmit: (data: { formState: FormState, newFiles: UploadedFile[] }) => Promise<void>;
  isSaving: boolean;
  submitButtonText: string;
  autofillData?: Partial<FormState>;
  itemData?: InventoryItemData;
  imageUrl?: string | null;
  imageDimensions?: { width: number; height: number };
  isEditMode?: boolean;
}

const defaultFormState: FormState = {
  itemId: '',
  itemNumber: '',
  expires: new Date().toISOString().slice(0, 10),
  shape: '',
  material: '',
  description: '',
  weightKg: '',
  heightCm: '',
  widthCm: '',
  lengthCm: '',
  price: '',
  quantity: '1',
  color: '',
  vendorId: '',
  itemType: '',
  status: 'Catalog',
  workbook: 'v326',
};

const FormInput = ({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-bold uppercase text-(--text-color-secondary)">
      {label}
    </label>
    <input {...props} className="w-full" />
  </div>
);

const FormSelect = ({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-bold uppercase text-(--text-color-secondary)">
      {label}
    </label>
    <select {...props} className="w-full">
      {children}
    </select>
  </div>
);

const FormTextarea = ({
  label,
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-bold uppercase text-(--text-color-secondary)">
      {label}
    </label>
    <textarea {...props} className="w-full" rows={3} />
  </div>
);

const DriveThumbnail = ({ url }: { url: string }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fileId = extractFileId(url);
    if (!fileId) {
      setDataUrl(url);
      setIsVideo(url.toLowerCase().includes('.mov') || url.toLowerCase().includes('.mp4'));
      return;
    }

    const thumbKey = fileId + '_thumb';
    if (imageCache.has(thumbKey)) {
      setDataUrl(imageCache.get(thumbKey)!);
      setIsVideo(url.toLowerCase().includes('.mov') || url.toLowerCase().includes('.mp4'));
      return;
    }

    let active = true;
    setIsLoading(true);
    fetchImageBatch(fileId)
      .then(async (res) => {
        if (!active) return;
        const mime = res.mimeType;
        const rawBase64 = `data:${mime};base64,${res.base64}`;
        let finalUrl = rawBase64;
        const isVid = mime.startsWith('video/');
        
        if (isVid) {
          try {
            finalUrl = await generateVideoThumbnail(rawBase64);
            imageCache.set(fileId, rawBase64);
            imageCache.set(thumbKey, finalUrl);
          } catch (e) { finalUrl = rawBase64; }
        } else {
          try {
            finalUrl = await resizeImage(rawBase64, 200);
            imageCache.set(fileId, finalUrl);
          } catch (e) {}
        }
        
        if (active) {
          setDataUrl(finalUrl);
          setIsVideo(isVid);
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setIsLoading(false); });

    return () => { active = false; };
  }, [url]);

  if (isLoading) return <div className="h-14 w-14 bg-white/5 rounded-lg flex items-center justify-center animate-pulse"><div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /></div>;
  if (!dataUrl) return <div className="h-14 w-14 bg-white/5 rounded-lg flex items-center justify-center text-white/10"><ImageIcon size={16} /></div>;

  return (
    <div className="relative group shrink-0">
      <img src={dataUrl} className="h-14 w-14 object-cover rounded-lg border border-white/10" alt="Preview" />
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
          <Play size={14} className="text-white fill-white" />
        </div>
      )}
    </div>
  );
};

export function InventoryForm({
  initialData,
  onSubmit,
  isSaving,
  submitButtonText,
  autofillData,
  isEditMode,
}: InventoryFormProps) {
  const t = useTranslation();
  const [formState, setFormState] = useState<FormState>({
    ...defaultFormState,
  });
  const [newFiles, setNewFiles] = useState<UploadedFile[]>([]);

  const existingMedia = React.useMemo(() => {
    const urls: string[] = [];
    if (initialData?.generatedPngUrl) urls.push(initialData.generatedPngUrl);
    if (initialData?.mediaUrls) {
      urls.push(...initialData.mediaUrls.split(',').map(u => u.trim()).filter(Boolean));
    }
    return urls;
  }, [initialData?.mediaUrls, initialData?.generatedPngUrl]);

  useEffect(() => {

    const mappedInitialData: Partial<FormState> = {
      ...initialData,
      expires: initialData?.expires
        ? new Date(initialData.expires).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    };
    setFormState({
      ...defaultFormState,
      ...mappedInitialData,
    });
  }, [initialData]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleNewFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const uploadedFiles: UploadedFile[] = [];
    for (const file of files) {
      const type = file.type.startsWith('image/') ? 'image' : 'video';
      const dataUrl = await readFileAsDataURL(file, type);
      uploadedFiles.push({ type, dataUrl, originalFile: file });
    }
    setNewFiles(prev => [...prev, ...uploadedFiles]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Form] Submitting form state:', formState, 'with new files:', newFiles);
    onSubmit({ formState, newFiles });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {autofillData && Object.keys(autofillData).length > 0 && (
          <div className="p-3 border border-(--border-color) rounded-lg space-y-2 bg-black/10">
            <h4 className="text-xs uppercase text-(--text-color-secondary)">
              {t.aiSuggestions}
            </h4>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-transparent p-0 max-h-40 overflow-y-auto">
              {JSON.stringify(autofillData, null, 2)}
            </pre>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormSelect
            label={t.formID}
            name="itemId"
            value={formState.itemId}
            onChange={handleInputChange}
            disabled={isEditMode}
            className={`w-full ${isEditMode ? 'opacity-50 cursor-not-allowed' : ''}`}
            required>
            <option value="" disabled>Select...</option>
            {Object.keys(vendors).map(v => <option key={v} value={v}>{v}</option>)}
          </FormSelect>
          <FormInput
            label={t.formItemNum}
            name="itemNumber"
            type="text"
            value={formState.itemNumber}
            onChange={handleInputChange}
            required
          />
        </div>

        <FormInput
          label={t.formShape}
          name="shape"
          type="text"
          value={formState.shape}
          onChange={handleInputChange}
          required
        />
        <FormInput
          label={t.formMaterial}
          name="material"
          type="text"
          value={formState.material}
          onChange={handleInputChange}
          required
        />
        <FormTextarea
          label={t.formDescription}
          name="description"
          value={formState.description}
          onChange={handleInputChange}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label={t.formWeight}
            name="weightKg"
            type="number"
            step="0.01"
            value={formState.weightKg}
            onChange={handleInputChange}
          />
          <FormInput
            label={t.formPrice}
            name="price"
            type="number"
            step="0.01"
            value={formState.price}
            onChange={handleInputChange}
          />
          <FormInput
            label={t.formQuantity}
            name="quantity"
            type="number"
            value={formState.quantity}
            onChange={handleInputChange}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FormInput
            label={t.formWidth}
            name="widthCm"
            type="number"
            step="0.1"
            value={formState.widthCm}
            onChange={handleInputChange}
          />
          <FormInput
            label={t.formHeight}
            name="heightCm"
            type="number"
            step="0.1"
            value={formState.heightCm}
            onChange={handleInputChange}
          />
          <FormInput
            label={t.formLength}
            name="lengthCm"
            type="number"
            step="0.1"
            value={formState.lengthCm}
            onChange={handleInputChange}
          />
        </div>

        {isEditMode && (
          <div className="flex flex-col gap-3 pt-4 border-t border-(--border-color)">
            <label className="text-xs font-black uppercase tracking-widest text-(--text-color-secondary)">
              Operational Media Gallery
            </label>
            
            {(existingMedia.length > 0 || newFiles.length > 0) && (
              <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                {/* Existing DB Media */}
                {existingMedia.map((url, idx) => (
                  <DriveThumbnail key={`existing-${idx}`} url={url} />
                ))}
                
                {/* Locally Uploaded Pending Files */}
                {newFiles.map((file, idx) => (
                  <div key={`new-${idx}`} className="relative group shrink-0">
                    <img src={file.dataUrl} className="h-14 w-14 object-cover rounded-lg border border-(--main-color)/30" alt="New Preview" />
                    <div className="absolute top-0 right-0 p-1">
                      <div className="bg-(--main-color) w-2 h-2 rounded-full shadow-[0_0_10px_var(--main-color)]" />
                    </div>
                    {file.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                        <Play size={14} className="text-white fill-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="relative">
              <input
                type="file"
                multiple
                id="inventory-media-upload"
                onChange={handleNewFiles}
                accept="image/*,video/*"
                className="hidden"
              />
              <label 
                htmlFor="inventory-media-upload"
                className="flex items-center justify-center gap-2 w-full h-12 border border-dashed border-white/20 hover:border-(--main-color)/50 hover:bg-(--main-color)/5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all cursor-pointer rounded-lg"
              >
                <Plus size={14} />
                Upload Additional Media
              </label>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="button w-full mt-4">
          {isSaving ? t.saving : submitButtonText}
        </button>
      </form>

    </>
  );
}