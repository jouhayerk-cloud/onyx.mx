import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import { workflowStepAtom, userAtom, allAnnotationDataAtom, editingMaskIndexAtom, SelectedItemRowAtom, SelectedItemDataAtom, languageAtom, ImageSrcAtom } from '../../lib/atoms';
import { SCRIPT_URL, vendors } from '../../lib/consts';
import { GoogleGenAI, Type } from '@google/genai';
import { AudioVisualizer } from '../../components/AudioVisualizer';
import { useResetState, useNotify, useDatabase } from '../../lib/hooks';
import { useFormDraft } from '../../lib/useFormDraft';
import { buildAttributeSuggestions } from '../../lib/attributeSuggestions';
import { BoundingBox2DType, BoundingBoxMaskType, PointingType } from '../../lib/Types';
import { createCurvePath, findContour, generatePngAndSvgFromMasks, loadImage, readFileAsDataURL, simplifyContour, extractGradientFromMask, handleFileUpload } from '../../lib/utils';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { CheckCircle2, XCircle, Search } from 'lucide-react';

const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: API_KEY });

const initialFormState = {
    itemId: '', itemNumber: '', shape: '', material: '', description: '',
    weightKg: '', heightCm: '', widthCm: '', lengthCm: '', price: '',
    quantity: '1', color: '', expires: new Date().toISOString().slice(0, 10),
    status: 'Catalog', workbook: 'v326',
    shortDescription: '', generatedDescription: '', detailedDescription: '',
};

const formFields = [
    { name: 'media', placeholder: 'Upload Image', type: 'file', required: true },
    { name: 'shape', placeholder: 'Shape', type: 'text', required: true },
    { name: 'material', placeholder: 'Material', type: 'text', required: true },
    { name: 'itemId', placeholder: 'Vendor ID', type: 'select', required: true, options: Object.keys(vendors) },
    { name: 'itemNumber', placeholder: 'Item Number', type: 'number', required: true },
    { name: 'price', placeholder: 'Price (MXN)', type: 'number', required: false },
    { name: 'quantity', placeholder: 'Quantity', type: 'number', required: false },
    { name: 'description', placeholder: 'Description', type: 'textarea', required: false },
    { name: 'dimensions', placeholder: 'Dimensions', type: 'group' },
    { name: 'submit', placeholder: 'Save Item', type: 'submit' },
];

/**
 * True once the user has entered something worth keeping. Fields the form
 * pre-populates (status, workbook, quantity, expires) are ignored on purpose —
 * they are present on a blank form and would make every empty form look like a draft.
 */
const hasEntryContent = (s: Partial<typeof initialFormState> | null): boolean =>
    Boolean(s && (s.itemId || s.shape || s.material || s.description || s.price || s.color));

type AIStatus = 'idle' | 'loading' | 'success' | 'error';

const AIStatusIndicator: React.FC<{ status: AIStatus; label: string }> = ({ status, label }) => {
    return (
        <div className={`ai-status-indicator ${status}`}>
            {status === 'loading' && <div className="progress-bar"></div>}
            {status === 'success' && <CheckCircle2 size={16} className="text-[#8DC63F]" />}
            {status === 'error' && <XCircle size={16} className="text-red-500" />}
            <span className="label">{label}</span>
        </div>
    );
};

export function FastEntryForm() {
    const db = useDatabase();
    const workflowStep = useAtomValue(workflowStepAtom);
    const resetState = useResetState();
    const user = useAtomValue(userAtom);
    const lang = useAtomValue(languageAtom);
    const setWorkflowStep = useSetAtom(workflowStepAtom);
    const setAllAnnotationData = useSetAtom(allAnnotationDataAtom);
    const setEditingMaskIndex = useSetAtom(editingMaskIndexAtom);
    const setSelectedItemRow = useSetAtom(SelectedItemRowAtom);
    const setSelectedItemData = useSetAtom(SelectedItemDataAtom);
    const selectedItemRow = useAtomValue(SelectedItemRowAtom);
    const [imageSrc, setImageSrc] = useAtom(ImageSrcAtom);
    const notify = useNotify();

    const [formState, setFormState] = useState(initialFormState);
    const [activeInput, setActiveInput] = useState('media');
    const [suggestions, setSuggestions] = useState<{ [key: string]: string[] }>({});
    const [suggestionRows, setSuggestionRows] = useState<any[]>([]);
    const [draftCreated, setDraftCreated] = useState(false);

    // Keeps the half-filled form alive across reloads. Stored in the local `drafts`
    // collection, which is never synced — so unlike the old placeholder row in
    // `inventory`, it can't be pruned away mid-entry.
    //
    // Only entries the user actually started are persisted: without this guard,
    // handleCancel's resetState would autosave the blank form over a real draft and
    // the next visit would "restore" an empty entry.
    const { restored: restoredDraft, ready: draftReady, clear: clearDraft } = useFormDraft(
        'inventory-entry',
        formState,
        { ownerKey: user?.id ?? user?.name ?? null, enabled: hasEntryContent(formState) }
    );

    // Restore once, when the initial lookup settles.
    useEffect(() => {
        if (!draftReady || !restoredDraft || !hasEntryContent(restoredDraft)) return;
        setFormState(prev => ({ ...prev, ...restoredDraft }));
        notify.success('Restored your unsaved entry');
    }, [draftReady]);

    const [detectionStatus, setDetectionStatus] = useState<AIStatus>('idle');
    const [segmentationStatus, setSegmentationStatus] = useState<AIStatus>('idle');
    const [formFillStatus, setFormFillStatus] = useState<AIStatus>('idle');

    const [generatedData, setGeneratedData] = useState<{ boxes?: BoundingBox2DType[], points?: PointingType[], masks?: BoundingBoxMaskType[], pngData?: string, svgData?: string } | null>(null);
    const [floatingText, setFloatingText] = useState<string | null>(null);

    const inputRefs = useRef<{ [key: string]: HTMLElement | null }>({});
    const formSubmitted = useRef(false);
    const aiTasksTriggered = useRef(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const dataUrl = await readFileAsDataURL(file, 'image', true);
            setImageSrc(dataUrl);
            setActiveInput('shape'); // Auto-advance after image upload
        }
    };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: value }));
    };

    // Load the catalogue once. The previous version ran a full find() per field, so
    // every mount read the whole inventory twice to build two flat value lists.
    useEffect(() => {
        if (!db) return;
        let cancelled = false;

        (async () => {
            try {
                const items = await db.inventory.find().exec();
                if (cancelled) return;
                setSuggestionRows(items.map((i: any) => i.toJSON?.() ?? i));
            } catch (error) {
                console.error('Failed to load attribute suggestions:', error);
            }
        })();

        return () => { cancelled = true; };
    }, [db]);

    // Cross-filtered suggestions: each field offers only values that co-occur with
    // what's already chosen, so picking a shape narrows Type and Material, and
    // picking a type narrows Shape.
    useEffect(() => {
        if (suggestionRows.length === 0) return;
        setSuggestions(buildAttributeSuggestions(suggestionRows, {
            shape: formState.shape,
            material: formState.material,
            color: formState.color,
            type: (formState as any).type
        }));
    }, [suggestionRows, formState.shape, formState.material, formState.color]);

    useEffect(() => {
        if (user?.role === 'Vendor') {
            setFormState(prev => ({ ...prev, itemId: user.id }));
        }
    }, [user]);

    const handleNavigation = useCallback((direction: 'next' | 'prev') => {
        const currentIndex = formFields.findIndex(f => f.name === activeInput);
        let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
        if (nextIndex >= 0 && nextIndex < formFields.length) {
            setActiveInput(formFields[nextIndex].name);
        }
    }, [activeInput]);

    useEffect(() => {
        if (activeInput && inputRefs.current[activeInput]) {
            inputRefs.current[activeInput]?.focus();
        }
    }, [activeInput]);

    useEffect(() => {
        if (imageSrc && formState.itemId && !draftCreated && db) {
            setDraftCreated(true);
            // Reserves the row id and item number. No placeholder row is written to
            // `inventory` any more — a local-only row there was pruned by the next
            // sync, taking the in-progress entry with it. The partial state now lives
            // in the `drafts` collection (see useFormDraft above) until handleSubmit
            // saves the item for real.
            const startEntry = async () => {
                try {
                    const newId = crypto.randomUUID();

                    // `item_id` is the stored column; the old `itemId` selector matched
                    // nothing, so every entry was numbered 0001.
                    const existingItems = await db.inventory.find({
                        selector: { item_id: formState.itemId }
                    }).exec();
                    const itemNumber = String(existingItems.length + 1).padStart(4, '0');

                    setSelectedItemRow(newId);
                    setSelectedItemData({
                        id: newId,
                        item_id: formState.itemId,
                        item_number: itemNumber,
                        created_by: user?.name,
                        timestamp: new Date().toISOString(),
                        status: 'Draft'
                    } as any);
                    setFormState(prev => ({ ...prev, itemNumber }));
                } catch (error: any) {
                    notify.error(`Could not start entry: ${error.message}`);
                    setDraftCreated(false);
                }
            };
            startEntry();
        }
    }, [imageSrc, formState.itemId, draftCreated, user, setSelectedItemRow, setSelectedItemData, notify, db]);

    const handleTranscription = (text: string, isFinal: boolean) => {
        if (activeInput === 'media' || activeInput === 'dimensions' || activeInput === 'submit') return;
        setFormState(prev => ({ ...prev, [activeInput]: text }));
        if (isFinal && text.trim().length > 0) {
            setTimeout(() => handleNavigation('next'), 500);
        }
    };

    const runAiAnalysisChain = useCallback(async () => {
        if (!imageSrc || !formState.shape || !formState.material || aiTasksTriggered.current) return;

        aiTasksTriggered.current = true;
        setGeneratedData(null);
        setDetectionStatus('idle');
        setSegmentationStatus('idle');
        setFormFillStatus('idle');
        setAllAnnotationData({ boxes: [], points: [], masks: [] });

        try {
            setDetectionStatus('loading');
            notify.loading('Detecting objects...', { id: 'detection' });
            const prompt1 = `Detect and tag ${formState.shape}. Output a single JSON object with two keys: "boxes" and "points". "boxes" is a list of {"box_2d": [y_min, x_min, y_max, x_max], "label": "..."}. "points" is a list of {"point": [y, x], "label": "..."}. Coordinates are normalized to 1000.`;
            let result1 = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ inlineData: { data: imageSrc.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt1 }] }, config: { responseMimeType: 'application/json' } });
            const data1 = JSON.parse(result1.text);
            const boxes: BoundingBox2DType[] = (data1.boxes || []).map((b: any) => ({ x: b.box_2d[1] / 1000, y: b.box_2d[0] / 1000, width: (b.box_2d[3] - b.box_2d[1]) / 1000, height: (b.box_2d[2] - b.box_2d[0]) / 1000, label: b.label }));
            const points: PointingType[] = (data1.points || []).map((p: any) => ({ point: { x: p.point[1] / 1000, y: p.point[0] / 1000 }, label: p.label }));
            setGeneratedData(prev => ({ ...prev, boxes, points }));
            setDetectionStatus('success');
            notify.success('Objects detected!', { id: 'detection' });

            await new Promise(resolve => setTimeout(resolve, 2000));

            setSegmentationStatus('loading');
            notify.loading('Generating masks...', { id: 'segmentation' });
            const prompt2 = `Give segmentation masks for ${formState.shape}. Output a JSON list of masks, each with "box_2d", "mask" (base64 string), and "label".`;
            const image = await loadImage(imageSrc);
            const imageDimensions = { width: image.width, height: image.height };
            let result2 = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ inlineData: { data: imageSrc.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt2 }] }, config: { responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } });
            const rawMasks = JSON.parse(result2.text);
            const masks: BoundingBoxMaskType[] = await Promise.all((rawMasks || []).map(async (m: any) => {
                const maskData = m.mask.startsWith('data:image') ? m.mask : `data:image/png;base64,${m.mask}`;
                const maskImage = await loadImage(maskData);
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = maskImage.width; maskCanvas.height = maskImage.height;
                const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
                maskCtx.drawImage(maskImage, 0, 0);
                const imageData = maskCtx.getImageData(0, 0, maskImage.width, maskImage.height);
                const contour = findContour(imageData);
                const simplified = simplifyContour(contour, 1.5);
                return { x: m.box_2d[1] / 1000, y: m.box_2d[0] / 1000, width: (m.box_2d[3] - m.box_2d[1]) / 1000, height: (m.box_2d[2] - m.box_2d[0]) / 1000, label: m.label, maskWidth: maskImage.width, maskHeight: maskImage.height, path: createCurvePath(simplified), points: simplified };
            }));
            const { pngData, svgData } = await generatePngAndSvgFromMasks(imageSrc, imageDimensions, masks);
            const gradientColor = masks.length > 0 ? await extractGradientFromMask(imageSrc, masks[0], imageDimensions) : null;
            setGeneratedData(prev => ({ ...prev, masks, pngData, svgData }));
            if (gradientColor) setFormState(prev => ({ ...prev, color: gradientColor }));
            setSegmentationStatus('success');
            notify.success('Masks generated!', { id: 'segmentation' });

            await new Promise(resolve => setTimeout(resolve, 2000));

            setFormFillStatus('loading');
            notify.loading('Generating details...', { id: 'details' });
            const prompt3 = `Analyze the product in the image, a ${formState.shape} made of ${formState.material}. Estimate its dimensions (widthCm, heightCm, lengthCm), weightKg, and provide three descriptions: a "shortDescription" (one sentence), "generatedDescription" (3-5 bullet points as a single string), and a "detailedDescription" (HTML format). Return a single JSON object.`;
            const schema3 = { type: Type.OBJECT, properties: { widthCm: { type: Type.STRING }, heightCm: { type: Type.STRING }, lengthCm: { type: Type.STRING }, weightKg: { type: Type.STRING }, shortDescription: { type: Type.STRING }, generatedDescription: { type: Type.STRING }, detailedDescription: { type: Type.STRING } } };
            let result3 = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: { parts: [{ inlineData: { data: imageSrc.split(',')[1], mimeType: 'image/jpeg' } }, { text: prompt3 }] }, config: { responseMimeType: 'application/json', responseSchema: schema3 } });
            const details = JSON.parse(result3.text);
            setFormState(prev => ({ ...prev, ...details }));
            const dimensionText = `${details.widthCm || '?'}W x ${details.heightCm || '?'}H x ${details.lengthCm || '?'}D cm`;
            setFloatingText(dimensionText);
            setTimeout(() => setFloatingText(null), 4000);
            setFormFillStatus('success');
            notify.success('Details generated!', { id: 'details' });
        } catch (error) {
            console.error('AI Analysis Chain Error:', error);
            notify.error('An AI analysis step failed.', { id: 'detection' });
            setDetectionStatus(s => s === 'loading' ? 'error' : s);
            setSegmentationStatus(s => s === 'loading' ? 'error' : s);
            setFormFillStatus(s => s === 'loading' ? 'error' : s);
        }
    }, [imageSrc, formState.shape, formState.material, aiTasksTriggered, setAllAnnotationData, notify]);

    useEffect(() => {
        runAiAnalysisChain();
    }, [runAiAnalysisChain]);

    const handleCancel = () => {
        setImageSrc(null); // Clear image from atom
        resetState();
    };

    const handleSubmit = async () => {
        if (formSubmitted.current || !selectedItemRow || !db) return;
        formSubmitted.current = true;
        const toastId = notify.loading('Saving item...');

        try {

            let publicMediaUrl = '';
            if (imageSrc) {

                const res = await fetch(imageSrc);
                const blob = await res.blob();
                const file = new File([blob], 'main_item.jpg', { type: 'image/jpeg' });
                const result = await handleFileUpload(file, user);
                if (result) publicMediaUrl = result.thumbnailUrl;
            }

            let pngPublicUrl = '';
            if (generatedData?.pngData) {
                const res = await fetch(generatedData.pngData);
                const blob = await res.blob();
                const file = new File([blob], 'mask.png', { type: 'image/png' });
                const result = await handleFileUpload(file, user);
                if (result) pngPublicUrl = result.thumbnailUrl;
            }

            let finalShape = formState.shape;
            let finalMaterial = formState.material;
            let finalDesc = formState.description;

            try {
                if (user?.role === 'Vendor' && (formState.shape || formState.material || formState.description)) {
                    notify.loading('Translating to Standard English...', { id: toastId });
                    const promptText = `Translate the following product attributes from Spanish to standard English and autocorrect spelling errors. Return a JSON object with only the properties provided:
                    shape: "${formState.shape || ''}",
                    material: "${formState.material || ''}",
                    description: "${formState.description || ''}"`;

                    const schema = {
                        type: Type.OBJECT,
                        properties: {
                            shape: { type: Type.STRING },
                            material: { type: Type.STRING },
                            description: { type: Type.STRING }
                        }
                    };

                    const aiResult = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: promptText,
                        config: { responseMimeType: 'application/json', responseSchema: schema, thinkingConfig: { thinkingBudget: 0 } }
                    });

                    const parsed = JSON.parse(aiResult.text.trim());
                    finalShape = parsed.shape || finalShape;
                    finalMaterial = parsed.material || finalMaterial;
                    finalDesc = parsed.description || finalDesc;
                }
            } catch (aiErr) {
                console.warn('AI Translation failed:', aiErr);
            }

            const masksForSaving = generatedData?.masks?.map(({ path, ...rest }) => rest) || [];

            const payload = {
                id: selectedItemRow,
                item_id: formState.itemId,
                item_number: Number(formState.itemNumber) || null,
                shape: finalShape,
                material: finalMaterial,
                description: finalDesc,
                weight_kg: Number(formState.weightKg) || null,
                height_cm: Number(formState.heightCm) || null,
                width_cm: Number(formState.widthCm) || null,
                length_cm: Number(formState.lengthCm) || null,
                price_mxn: Number(formState.price) || 0,
                quantity: Number(formState.quantity) || 1,
                color: formState.color,
                status: 'Catalog',
                workbook: 'v326',
                short_description: formState.shortDescription,
                generated_description: formState.generatedDescription,
                detailed_description: formState.detailedDescription,
                media_urls: publicMediaUrl,
                generated_png_url: pngPublicUrl,
                spatial_boxes_2d: JSON.stringify(generatedData?.boxes || []),
                spatial_points: JSON.stringify(generatedData?.points || []),
                spatial_masks: JSON.stringify(masksForSaving),
                updated_at: new Date().toISOString()
            };

            await db.inventory.upsert(payload);

            // The entry is committed — drop the in-progress copy so it isn't offered
            // for restore next time the form opens.
            await clearDraft();

            notify.success('Item saved!', { id: toastId });
            handleCancel();
        } catch (error: any) {
            console.error('Save failed:', error);
            notify.error(`Save failed: ${error.message}`, { id: toastId });
            formSubmitted.current = false;
        }
    };

    const speechLang = lang === 'es' ? 'es-ES' : 'en-US';

    return (
        <div className="fast-entry-form-container glass-panel">
            <div className="fast-entry-background" style={{ backgroundImage: imageSrc ? `url(${imageSrc})` : 'none' }} />
            {workflowStep === 'voiceEntry' && (
                <AudioVisualizer onFinalTranscription={(text) => handleTranscription(text, true)} onInterimTranscription={(text) => handleTranscription(text, false)} lang={speechLang} autoStart />
            )}
            {floatingText && <div className="floating-ai-text">{floatingText}</div>}

            <div className="ai-status-indicators">
                <AIStatusIndicator status={detectionStatus} label="Detect & Tag" />
                <AIStatusIndicator status={segmentationStatus} label="Segmentation" />
                <AIStatusIndicator status={formFillStatus} label="Details" />
            </div>

            <button onClick={handleCancel} className="absolute top-4 right-4 z-20 text-3xl opacity-70 hover:opacity-100">&times;</button>
            <div className="fast-entry-nav">
                <button type="button" onClick={() => handleNavigation('prev')} title="Previous"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path></svg></button>
                <button type="button" onClick={() => handleNavigation('next')} title="Next"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg></button>
            </div>
            <form className="fast-entry-form" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
                {formFields.map(field => (
                    <div key={field.name} className={`fast-entry-field ${activeInput === field.name ? 'active' : ''}`}>
                        <span className="fast-entry-label-text">{field.placeholder}</span>
                        {field.type === 'file' ? (
                            <div className="w-full h-64 border-2 border-dashed border-gray-500 rounded-lg flex items-center justify-center">
                                <input id={field.name} name={field.name} type="file" className="sr-only" onChange={handleFileChange} accept="image/*" ref={el => { if (el) inputRefs.current[field.name] = el; }} onFocus={() => setActiveInput(field.name)} />
                                <label htmlFor={field.name} className="w-full h-full cursor-pointer flex items-center justify-center">
                                    {imageSrc ? <img src={imageSrc} alt="Preview" className="max-w-full max-h-full object-contain" /> : <div className="text-gray-400"><svg className="w-12 h-12 mx-auto"><use href="#camera"></use></svg><span>Click to upload</span></div>}
                                </label>
                            </div>
                        ) : field.type === 'submit' ? (
                            <button type="submit" className="button text-2xl! px-12!" onFocus={() => setActiveInput(field.name)} ref={el => { if (el) inputRefs.current[field.name] = el; }} disabled={formSubmitted.current}>{field.placeholder}</button>
                        ) : field.type === 'group' ? (
                            <div className="flex gap-4" ref={el => { if (el) inputRefs.current[field.name] = el; }} onFocus={() => setActiveInput(field.name)} tabIndex={-1}>
                                <input type="number" name="widthCm" value={formState.widthCm} onChange={handleInputChange} placeholder="W cm" className="text-xl!" />
                                <input type="number" name="heightCm" value={formState.heightCm} onChange={handleInputChange} placeholder="H cm" className="text-xl!" />
                                <input type="number" name="lengthCm" value={formState.lengthCm} onChange={handleInputChange} placeholder="L cm" className="text-xl!" />
                                <input type="number" name="weightKg" value={formState.weightKg} onChange={handleInputChange} placeholder="kg" className="text-xl!" />
                            </div>
                        ) : (
                            React.createElement(field.type === 'select' ? 'select' : field.type === 'textarea' ? 'textarea' : 'input', {
                                id: field.name, name: field.name, onFocus: () => setActiveInput(field.name), onChange: handleInputChange, value: (formState as any)[field.name],
                                ref: (el: any) => { if (el) inputRefs.current[field.name] = el; }, autoComplete: "off",
                                list: suggestions[field.name] ? `${field.name}-suggestions` : undefined,
                                children: field.type === 'select' ? [<option key="" value="" disabled>Select...</option>, ...(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)] : null
                            })
                        )}
                        <span className="fast-entry-tip">Press Enter or ↓ to continue</span>
                        {suggestions[field.name] && <datalist id={`${field.name}-suggestions`}>{suggestions[field.name].map(s => <option key={s} value={s} />)}</datalist>}
                    </div>
                ))}
            </form>
        </div>
    );
}