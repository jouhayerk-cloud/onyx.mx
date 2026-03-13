

import React, { useEffect, useState } from 'react';
import { vendors } from '../lib/consts';
import { useTranslation } from '../lib/hooks';
import { InventoryItemData, UploadedFile } from '../lib/Types';
import { readFileAsDataURL } from '../lib/utils';

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
          <div className="flex flex-col gap-1 pt-2 border-t border-(--border-color)">
            <label className="text-xs font-bold uppercase text-(--text-color-secondary)">
              Media
            </label>
            <input
              type="file"
              multiple
              onChange={handleNewFiles}
              accept="image/*,video/*"
              className="w-full text-xs"
            />
            {newFiles.length > 0 && (
              <div className="flex gap-2 mt-2 overflow-x-auto p-1 text-(--text-color-secondary)">
                {newFiles.map((file, index) => (
                  <img key={index} src={file.dataUrl} className="h-14 w-14 object-cover rounded-lg shrink-0 border border-white/10" alt="Preview" />
                ))}
              </div>
            )}
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