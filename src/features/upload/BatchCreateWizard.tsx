import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { batchCreateItemsAtom, inventoryAtom, userAtom, exchangeRateAtom, isAiProcessingEnabledAtom, BatchCreateItem } from '../../lib/atoms';
import { supabase } from '../../lib/supabase';
import { vendors , DEFAULT_EXCHANGE_RATE} from '../../lib/consts';
import { ai } from '../../lib/ai';
import { calculateCodesAndPrices, handleFileUpload, readFileAsDataURL, getTextColorForBg, generateUniqueId, getCleanImageUrl, normalizeBrandTerms, formatProductTitle } from '../../lib/utils';
import { useDatabase } from '../../lib/hooks';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Trash2, Save, X, Plus, Image as ImageIcon, FileSpreadsheet, ChevronLeft, Check, AlertTriangle, Languages, Loader2 } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { processSingleItem, type BatchOp, type PipelineContext } from '../../lib/catalogHubPipeline';
import { CatalogHubProcessesPanel } from '../../components/CatalogHubProcessesPanel';
import { CATALOG_PROCESSES, mapResultsByProcessId } from '../../lib/catalogHubProcesses';
import { processQueueWithConcurrency } from '../../lib/queueProcessor';
import { callGemini } from '../../lib/geminiClient';


const lbl = "text-[9px] font-black text-white/50 uppercase tracking-[0.1em] mb-0.5 flex items-center gap-1";
const inp = "h-8 w-full px-2 bg-black/20 backdrop-blur-3xl border border-white/10 rounded text-[11px] font-bold text-white placeholder-white/20 outline-none focus:ring-1 focus:ring-cyan-400/50 transition-all";

// Spanish → English column header mapping
const COLUMN_MAP: Record<string, string> = {
  'cantidad': 'quantity', 'qty': 'quantity', 'q': 'quantity',
  'forma': 'shape', 'shape': 'shape',
  'tipo': 'itemType', 'type': 'itemType',
  'color': 'color',
  'material': 'material',
  'ancho': 'widthCm', 'width': 'widthCm', 'w cm': 'widthCm',
  'alto': 'heightCm', 'height': 'heightCm', 'h cm': 'heightCm',
  'fondo': 'lengthCm', 'depth': 'lengthCm', 'd cm': 'lengthCm', 'd cm ': 'lengthCm',
  'precio': 'price', 'price': 'price', 'per piece mxn$': 'price', 'per piece mxn': 'price',
  'total': '_total', 'total pesos': '_total',
  'description': 'description', 'description color - object type': 'description', 'descripcion': 'description',
  '#': 'itemNumber',
  'date': '_date', 'fecha': '_date',
  'tag-id': '_tagId', 'tag id': '_tagId',
  'kg': 'weightKg', 'peso': 'weightKg',
  'aqc': '_aqc', 'lc': '_lc',
};

const MAX_ITEMS = 100;

interface BatchCreateWizardProps {
  vendorKey: string;
}

export function BatchCreateWizard({ vendorKey }: BatchCreateWizardProps) {
  const allItems = useAtomValue(inventoryAtom);
  const [batchItems, setBatchItems] = useAtom(batchCreateItemsAtom);
  const user = useAtomValue(userAtom);
  const exchangeRate = useAtomValue(exchangeRateAtom);
  const aiEnabled = useAtomValue(isAiProcessingEnabledAtom);
  const db = useDatabase();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(batchItems.length > 0 ? 2 : 1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveResults, setSaveResults] = useState<{ success: number; errors: number }>({ success: 0, errors: 0 });
  const [failedItems, setFailedItems] = useState<{ row: number; label: string; reason: string }[]>([]);
  const [processedItems, setProcessedItems] = useState<any[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [aiSelected, setAiSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    CATALOG_PROCESSES.forEach(p => init[p.id] = p.defaultChecked);
    return init;
  });
  const [aiBusy, setAiBusy] = useState<Record<string, boolean>>({});
  const [aiResults, setAiResults] = useState<Record<string, any>>({});
  
  const handleAiToggle = (id: string) => setAiSelected(prev => ({ ...prev, [id]: !prev[id] }));
  const handleAiRun = (id: string) => {
    toast.error("Manual pre-run requires the image to be saved first. Please use SAVE BATCH to run processes.");
  };

    const [editingItem, setEditingItem] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  
  // Track DB max index to prevent collisions
  const [maxVendorItemNumber, setMaxVendorItemNumber] = useState<number>(0);
  
  useEffect(() => {
    if (!vendorKey) return;
    let maxNum = 0;
    allItems.forEach((item) => {
        const data = (item.data || item) as any;
        const vId = data.vendorId || data.vendor_id || (data.itemId || data.item_id || '').split('-')[0];
        if (vId === vendorKey && (data.workbook || "v826") === "v826") {
            const numStr = String(data.itemNumber || data.item_number || '');
            if (numStr) {
                const num = parseInt(numStr, 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        }
    });
    setMaxVendorItemNumber(maxNum);
  }, [vendorKey, allItems]);

  const vendorData = vendorKey ? vendors[vendorKey as keyof typeof vendors] : null;

  // ─── Auto-translate Spanish→English using Gemini ─────────────────
  const translateItems = useCallback(async (items: BatchCreateItem[]): Promise<BatchCreateItem[]> => {
    const textsToTranslate: string[] = [];
    const textSet = new Set<string>();

    items.forEach(item => {
      ['shape', 'itemType', 'color', 'material', 'description'].forEach(field => {
        const val = (item as any)[field]?.trim();
        if (val && !textSet.has(val.toUpperCase())) {
          textSet.add(val.toUpperCase());
          textsToTranslate.push(val);
        }
      });
    });

    if (textsToTranslate.length === 0) return items;

    try {
      const prompt = `You are a translator for a stone/fountain/garden decor inventory system.
Translate the following Spanish words/phrases to English. These are product attributes: shapes, types, colors, materials, and descriptions for stone items like fountains, planters, statues, benches, etc.

RULES:
- Return ONLY a JSON array of translated strings in the same order as input
- Keep translations SHORT (1-3 words max for single attributes)
- Use standard inventory/product terminology in English
- If a word is already English or is a proper noun, keep it as-is
- ALL CAPS output

Input array:
${JSON.stringify(textsToTranslate)}

Return ONLY the JSON array, no markdown, no explanation.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      const responseText = response.text?.trim() || '';
      const cleanJson = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const translated: unknown = JSON.parse(cleanJson);

      // Inputs and outputs are matched by position, so a response of a different
      // length silently shifts every translation after the discrepancy — writing the
      // wrong shape/colour/material onto real inventory with no error shown. If the
      // model didn't return exactly what we asked for, keep the Spanish originals.
      if (!Array.isArray(translated) || translated.length !== textsToTranslate.length) {
        console.error('[BatchCreate] Translation response shape mismatch', {
          expected: textsToTranslate.length,
          received: Array.isArray(translated) ? translated.length : typeof translated
        });
        toast.error(tr("Translation returned unexpected data — items loaded untranslated"));
        return items;
      }

      const translationMap = new Map<string, string>();
      textsToTranslate.forEach((original, i) => {
        const value = translated[i];
        if (typeof value === 'string' && value.trim()) {
          translationMap.set(original.toUpperCase(), value.trim().toUpperCase());
        }
      });

      return items.map(item => ({
        ...item,
        shape: translationMap.get(item.shape.toUpperCase()) || item.shape,
        itemType: translationMap.get(item.itemType.toUpperCase()) || item.itemType,
        color: translationMap.get(item.color.toUpperCase()) || item.color,
        material: translationMap.get(item.material.toUpperCase()) || item.material,
        description: translationMap.get(item.description.toUpperCase()) || item.description,
      }));
    } catch (err: any) {
      console.error('Translation error:', err);
      toast.error(tr("Translation failed — items loaded without translation"));
      return items;
    }
  }, []);

  // ─── Parse XLSX file ─────────────────────────────────────────────
  const parseXlsx = useCallback((file: File) => {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        let sheetName = workbook.SheetNames[0];
        if (vendorKey && workbook.SheetNames.includes(vendorKey)) {
          sheetName = vendorKey;
        }
        const sheet = workbook.Sheets[sheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (rawRows.length < 2) {
          setParseError('No data rows found in the spreadsheet.');
          return;
        }

        const headers = rawRows[0].map((h: any) => String(h).trim().toLowerCase());
        const fieldMap: Record<number, string> = {};
        headers.forEach((h: string, i: number) => {
          const mapped = COLUMN_MAP[h];
          if (mapped) fieldMap[i] = mapped;
        });

        if (Object.keys(fieldMap).length === 0) {
          setParseError('Could not recognize any column headers. Expected: cantidad, forma, tipo, color, material, ancho, alto, fondo, precio');
          return;
        }

        const items: BatchCreateItem[] = [];
        let skippedForLimit = 0;
        for (let r = 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.every((c: any) => c === '' || c === null || c === undefined)) continue;

          const mapped: Record<string, string> = {};
          Object.entries(fieldMap).forEach(([colIdx, field]) => {
            if (!field.startsWith('_')) {
              mapped[field] = String(row[Number(colIdx)] ?? '').trim();
            }
          });

          if (!mapped.price && !mapped.shape && !mapped.itemType && !mapped.description) continue;

          // Count what the cap excludes instead of stopping silently — the old loop
          // dropped every row past MAX_ITEMS and still reported success.
          if (items.length >= MAX_ITEMS) { skippedForLimit++; continue; }

          items.push({
            id: generateUniqueId(),
            itemNumber: mapped.itemNumber || String(maxVendorItemNumber + items.length + 1),
            shape: (mapped.shape || '').toUpperCase(),
            itemType: (mapped.itemType || '').toUpperCase(),
            color: (mapped.color || '').toUpperCase(),
            material: (mapped.material || '').toUpperCase(),
            widthCm: mapped.widthCm || '',
            heightCm: mapped.heightCm || '',
            lengthCm: mapped.lengthCm || '',
            weightKg: mapped.weightKg || '',
            price: mapped.price || '',
            quantity: mapped.quantity || '1',
            description: (mapped.description || '').toUpperCase(),
            mediaFiles: [],
          });
        }

        if (items.length === 0) {
          setParseError('No valid data rows found after parsing.');
          return;
        }

        // Auto-translate Spanish → English via Gemini
        setIsTranslating(true);
        toast.loading(tr("Translating items ES → EN..."), { id: 'translate' });
        const translatedItems = await translateItems(items);
        toast.dismiss('translate');
        setIsTranslating(false);

        setBatchItems(translatedItems);
        setStep(2);
        toast.success(`Loaded ${translatedItems.length} item${translatedItems.length > 1 ? 's' : ''} from spreadsheet`);

        if (skippedForLimit > 0) {
          toast(
            `${skippedForLimit} more row${skippedForLimit > 1 ? 's were' : ' was'} not imported — the limit is ${MAX_ITEMS} per batch. Split the sheet to load the rest.`,
            { icon: '⚠️', duration: 8000 }
          );
        }
      } catch (err: any) {
        setParseError(err.message || 'Failed to parse XLSX file');
        setIsTranslating(false);
      }
    };
    reader.onerror = () => {
      setParseError('Could not read the file. It may be open in another program.');
      setIsTranslating(false);
    };
    reader.readAsArrayBuffer(file);
  }, [vendorKey, setBatchItems, translateItems]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      parseXlsx(file);
    } else {
      toast.error(tr("Please drop an .xlsx file"));
    }
  }, [parseXlsx]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseXlsx(file);
    e.target.value = '';
  }, [parseXlsx]);

  const updateItem = useCallback((id: string, field: string, value: string) => {
    setBatchItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, [setBatchItems]);

  const removeItem = useCallback((id: string) => {
    setBatchItems(prev => prev.filter(item => item.id !== id));
  }, [setBatchItems]);

  const addImageToItem = useCallback(async (id: string, files: FileList) => {
    const uploaded = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const localUrl = await readFileAsDataURL(file, 'image');
      uploaded.push({ type: 'image' as const, localUrl, originalFile: file, tag: 'Item' });
    }
    setBatchItems(prev => prev.map(item =>
      item.id === id ? { ...item, mediaFiles: [...item.mediaFiles, ...uploaded] } : item
    ));
  }, [setBatchItems]);

  const removeImageFromItem = useCallback((id: string, imgIdx: number) => {
    setBatchItems(prev => prev.map(item =>
      item.id === id ? { ...item, mediaFiles: item.mediaFiles.filter((_, i) => i !== imgIdx) } : item
    ));
  }, [setBatchItems]);

  const getItemCodes = useCallback((item: BatchCreateItem) => {
    const finalItemId = `${vendorKey}-${item.id}`;
    return calculateCodesAndPrices(
      { price: item.price, itemId: finalItemId, workbook: 'v826', itemNumber: item.itemNumber || '1' },
      exchangeRate || DEFAULT_EXCHANGE_RATE,
      'v826'
    );
  }, [vendorKey, exchangeRate]);

  const suggestions = useMemo(() => {
    const getCascadingVals = (targetField: string) => {
      const counts: Record<string, number> = {};
      allItems.forEach(i => {
        const d = i.data || i;
        let val = String(d[targetField] || '').trim().toUpperCase();
        if (targetField === 'short_description' && (!val || val === 'NULL')) val = '';
        if (val && val !== '-' && val !== 'NULL' && val.length > 1) {
          counts[val] = (counts[val] || 0) + 1;
        }
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 6);
    };
    return {
      shape: getCascadingVals('shape'),
      itemType: getCascadingVals('short_description'),
      color: getCascadingVals('color'),
      material: getCascadingVals('material'),
    };
  }, [allItems]);

  // ─── Batch save ──────────────────────────────────────────────────

  const handleBatchSave = async () => {
    if (!vendorKey) return toast.error(tr("Select a vendor first"));
    if (batchItems.length === 0) return toast.error(tr("No items to save"));

    setIsSaving(true);
    setSaveProgress(0);
    setSaveResults({ success: 0, errors: 0 });
    setStep(3);

    let successCount = 0;
    let errorCount = 0;
    const failed: { row: number; label: string; reason: string }[] = [];
    setFailedItems([]);
    setProcessedItems([]);

    const anyAiSelected = aiEnabled && Object.values(aiSelected).some(Boolean);
    const cancelTokens = { current: {} };

    // Pass 1: Upload media & Prepare AI Ops
    const ops: BatchOp[] = [];
    const itemDataCache: any[] = [];
    
    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      let uploadedUrls: string[] = [];
      try {
        for (const media of item.mediaFiles) {
          if (media.originalFile) {
            const result = await handleFileUpload(media.originalFile, user);
            if (result) uploadedUrls.push(result.thumbnailUrl);
          }
        }
      } catch (err) {
        console.error("Media upload error:", err);
      }
      
      itemDataCache[i] = { uploadedUrls, aiResults: {} as Record<string, any> };

      if (anyAiSelected && uploadedUrls.length > 0) {
        uploadedUrls.forEach((url, idx) => {
          ops.push({
            id: crypto.randomUUID(),
            item: item,
            imageUrl: url,
            imageIndex: idx,
            status: 'idle',
            progress: 0,
            logs: [],
            skipImageProcessing: !(aiSelected['img_clean'] || aiSelected['image_segmentation']),
            forceRegenerateDescription: aiSelected['title_desc'] || aiSelected['marketing_desc'] || aiSelected['dominant_colors'] || aiSelected['product_type'],
            result: itemDataCache[i].aiResults
          });
        });
      }
      setSaveProgress(Math.round(((i + 1) / batchItems.length) * 30)); // 30% for media
    }

    // Pass 2: Run AI across all items
    if (anyAiSelected && ops.length > 0) {
      const pipelineCtx: PipelineContext = {
        updateOp: (id, updates) => {
          if (typeof updates === 'function') return;
          const op = ops.find(o => o.id === id);
          if (op && updates.result) {
             Object.assign(op.result, updates.result);
             setAiResults(prev => ({ ...prev, ...updates.result }));
          }
        },
        logOp: (id, text) => console.log(`[AI ${id}]`, text),
        checkAbort: async (id, promise) => await promise,
        callGemini,
        user,
        bgQuality: '2K',
        cancelTokens,
        setHasUnsavedChanges: () => {}
      };

      setAiBusy(prev => {
        const next = { ...prev };
        CATALOG_PROCESSES.forEach(p => { if (aiSelected[p.id]) next[p.id] = true; });
        return next;
      });

      try {
        await processQueueWithConcurrency(ops, 2, async (op) => {
          await processSingleItem(op, pipelineCtx);
        });
      } catch (aiErr) {
        console.error("AI Batch Processing Error:", aiErr);
      } finally {
        setAiBusy({});
      }
      setSaveProgress(60); // 60% after AI
    }

    // Pass 3: DB Insert
    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      const { uploadedUrls, aiResults } = itemDataCache[i];
      
      try {
        // CORRECTED 2026-09-22: item.id is generateUniqueId()/crypto.randomUUID()
        // (a row key for this batch's local state), not the item's index — see
        // catalogHubProcesses.ts and the CreateItem.tsx fix for the same bug and
        // the EM8261ONAF item that exposed it.
        const itemNumber = Number(item.itemNumber) || (maxVendorItemNumber + i + 1);
        const finalItemId = `${vendorKey}-${String(itemNumber).padStart(3, '0')}`;
        const calculated = calculateCodesAndPrices(
          { price: item.price, itemId: finalItemId, workbook: 'v826', itemNumber: item.itemNumber || String(maxVendorItemNumber + i + 1) },
          exchangeRate || DEFAULT_EXCHANGE_RATE,
          'v826'
        );

        // Same image-result mapping as CreateItem.tsx: see that file for why
        // processed_media_urls is a JSON map and not the bare cleanedUrl.
        const processedMap: Record<string, string> = {};
        if (aiResults.cleanedUrl && uploadedUrls[0]) processedMap[getCleanImageUrl(uploadedUrls[0]) || uploadedUrls[0]] = aiResults.cleanedUrl;
        if (aiResults.dominantColors?.length) processedMap['_generated_color'] = aiResults.dominantColors.join(', ');
        if (aiResults.generatedType) processedMap['_generated_type'] = aiResults.generatedType;

        const dbRow = {
          item_id: finalItemId,
          item_number: itemNumber,
          vendor_id: vendorKey,
          shape: item.shape || null,
          material: item.material || null,
          // Canonical map (catalogHubProcesses.ts, BatchProcessingWizard
          // handleSaveDescription): color and description are the vendor's own
          // fields and no AI process writes them. AI title -> detailed_description,
          // marketing HTML -> generated_description, AI colours -> generated_color.
          color: item.color || null,
          generated_color: aiResults.dominantColors?.length ? aiResults.dominantColors.join(', ') : null,
          // short_description is the manual "Type" field, never AI content —
          // see catalogHubProcesses.ts.
          short_description: item.itemType || null,
          description: item.description || null,
          detailed_description: aiResults.description ? formatProductTitle(normalizeBrandTerms(aiResults.description)) : null,
          generated_description: aiResults.marketingDescription ? normalizeBrandTerms(aiResults.marketingDescription) : null,
          generated_type: aiResults.generatedType || null,
          generated_png_url: aiResults.cleanedUrl || null,
          generated_svg_url: aiResults.svgUrl || null,
          axo_icon_url: aiResults.axoIconUrl || null,
          processed_media_urls: Object.keys(processedMap).length ? JSON.stringify(processedMap) : null,
          spatial_points: aiResults.hexString ? [{
            type: 'pixel_map',
            dimensions: `${aiResults.cols || 20}x${aiResults.rows || 20}`,
            cols: aiResults.cols || 20,
            rows: aiResults.rows || 20,
            hex_string: aiResults.hexString,
            bitmap_url: aiResults.bitmapUrl || null
          }] : null,
          width_cm: item.widthCm ? Number(item.widthCm) : null,
          length_cm: item.lengthCm ? Number(item.lengthCm) : null,
          height_cm: item.heightCm ? Number(item.heightCm) : null,
          weight_kg: item.weightKg ? Number(item.weightKg) : null,
          price_mxn: item.price ? Number(item.price) : null,
          quantity: item.quantity ? Number(item.quantity) : 1,
          status: 'Acquisition',
          workbook: 'v826',
          media_urls: uploadedUrls.join(','),
          timestamp: new Date().toISOString(),
          book_barcode: calculated.bookBarcode,
          book_aq_code: calculated.bookAqCode,
          book_landed: isNaN(Number(calculated.bookLanded)) ? null : Number(calculated.bookLanded),
          book_retail: isNaN(Number(calculated.bookRetail)) ? null : Number(calculated.bookRetail),
        };

        const { data, error } = await supabase.from('inventory').insert(dbRow).select().single();
        if (error) throw error;

        if (db && data) {
          try {
            await db.inventory.upsert({
              ...data,
              id: String(data.id),
              workbook: data.workbook != null ? String(data.workbook) : null,
            });
          } catch (err) { console.error(err); }
        }

        successCount++; setProcessedItems(prev => [...prev, dbRow]);
      } catch (err: any) {
        console.error(`Error saving item ${i + 1}:`, err);
        errorCount++;
        failed.push({
          row: i + 1,
          label: [item.itemNumber, item.shape, item.itemType].filter(Boolean).join(' - ') || `Row ${i + 1}`,
          reason: err?.message || 'Unknown error'
        });
      }

      setSaveProgress(Math.round(60 + (((i + 1) / batchItems.length) * 40)));
      setSaveResults({ success: successCount, errors: errorCount });
    }

    setIsSaving(false);
    setFailedItems(failed);
    if (errorCount === 0) {
      toast.success(`All ${successCount} items saved successfully!`);
    } else {
      toast(`${successCount} saved, ${errorCount} failed - see the list below`, { icon: '⚠️', duration: 8000 });
    }
  };

  const handleReset = () => {
    setBatchItems([]);
    setStep(1);
    setSaveProgress(0);
    setSaveResults({ success: 0, errors: 0 });
    setFailedItems([]);
    setProcessedItems([]);
  };

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Upload XLSX
  // ═══════════════════════════════════════════════════════════════
  if (step === 1) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-12 animate-in fade-in duration-300">
        <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls" onChange={handleFileSelect} />

        <div
          className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${
            dragOver ? 'border-cyan-400 bg-cyan-500/20 scale-[1.02]' : 'border-white/15 hover:border-white/30 hover:bg-black/20 backdrop-blur-3xl'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => !isTranslating && fileInputRef.current?.click()}
        >
          {isTranslating ? (
            <>
              <Loader2 size={48} className="text-cyan-400 animate-spin" strokeWidth={1.5} />
              <div className="text-center">
                <p className="text-sm font-black text-cyan-400 uppercase tracking-wider">{tr("Translating...")}</p>
                <p className="text-xs text-white/40 mt-1">{tr("Converting Spanish → English via Gemini")}</p>
              </div>
            </>
          ) : (
            <>
              <FileSpreadsheet size={48} className="text-white/20" strokeWidth={1.5} />
              <div className="text-center">
                <p className="text-sm font-black text-white/70 uppercase tracking-wider">{tr("Drop XLSX file here")}</p>
                <p className="text-xs text-white/40 mt-1">or click to browse</p>
              </div>
              <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-white/5 rounded-lg">
                <Languages size={12} className="text-white/30" />
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">{tr("Auto-translates ES → EN")}</span>
              </div>
            </>
          )}
        </div>

        {parseError && (
          <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/20 border border-rose-500/20 rounded-lg max-w-lg">
            <AlertTriangle size={14} className="text-rose-400 shrink-0" />
            <span className="text-xs text-rose-400 font-bold">{parseError}</span>
          </div>
        )}

        <p className="text-[10px] text-white/30 uppercase tracking-wider max-w-lg text-center">
          {tr("Columns: cantidad · forma · tipo · color · material · ancho · alto · fondo · precio")}
        </p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Save Progress / Results
  // ═══════════════════════════════════════════════════════════════
  if (step === 3) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 animate-in fade-in duration-300">
        {isSaving ? (
          <>
            <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${saveProgress}%` }} />
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-white/60">
              {tr("Saving")} {saveResults.success + saveResults.errors} / {batchItems.length}...
            </span>
            <div className="flex gap-4 text-[10px] font-black uppercase tracking-wider">
              <span className="text-emerald-400">{saveResults.success} ✓</span>
              {saveResults.errors > 0 && <span className="text-rose-400">{saveResults.errors} ✗</span>}
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check size={32} className="text-emerald-400" strokeWidth={3} />
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-white/80">{saveResults.success} {tr("Items Saved")}</p>
              {saveResults.errors > 0 && <p className="text-sm text-rose-400 font-bold mt-1">{saveResults.errors} failed</p>}
            </div>

            {/* Saved items stay committed, so name the rows that didn't make it. */}
            {failedItems.length > 0 && (
              <div className="w-full max-w-md max-h-48 overflow-y-auto rounded-lg border border-rose-500/20 bg-red-50/50 p-3 flex flex-col gap-2">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-400">{tr("Not saved — re-enter these")}</p>
                {failedItems.map(f => (
                  <div key={f.row} className="text-left">
                    <p className="text-[11px] font-black text-white/70">{tr("Row")} {f.row} • {f.label}</p>
                    <p className="text-[10px] text-rose-400/80 font-medium break-words">{f.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {/* AI Generated Content Visualizer */}
            {processedItems.length > 0 && (
              <div className="w-full max-w-4xl mt-6 flex flex-col gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">{tr("Generated Content")}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                  {processedItems.map((pi, idx) => (
                    <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-3 flex gap-4 items-start">
                      {/* Image / Vectors */}
                      <div className="shrink-0 flex flex-col gap-2 w-24">
                        {pi.generated_png_url || pi.generated_svg_url ? (
                          <>
                            {pi.generated_png_url && <img src={pi.generated_png_url} className="w-24 h-24 object-contain bg-black/40 rounded-lg border border-white/10" />}
                            {pi.generated_svg_url && <img src={pi.generated_svg_url} className="w-24 h-24 object-contain bg-black/40 rounded-lg border border-white/10" />}
                          </>
                        ) : (
                          <div className="w-24 h-24 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center">
                            <ImageIcon size={20} className="text-white/20" />
                          </div>
                        )}
                        {pi.spatial_points?.[0]?.hex_string && (
                          <div className="flex flex-wrap gap-0.5 w-24 h-24 bg-black/40 rounded-lg p-1 border border-white/10 overflow-hidden">
                            {pi.spatial_points[0].hex_string.split(',').slice(0, 100).map((hex: string, i: number) => (
                              <div key={i} className="w-2 h-2 rounded-[1px]" style={{ backgroundColor: hex }} />
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Text / Data */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-black text-white">{pi.item_id}</span>
                          <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[8px] font-black uppercase tracking-wider">{pi.short_description || 'N/A'}</span>
                        </div>
                        <p className="text-[11px] text-white/80 font-medium mb-1 line-clamp-2">{pi.description || tr("No title generated")}</p>
                        <p className="text-[9px] text-white/50 mb-2 line-clamp-3">{pi.detailed_description || tr("No marketing description")}</p>
                        
                        <div className="flex flex-wrap gap-1.5">
                          {pi.generated_color?.split(',').map((c: string) => c.trim()).filter(Boolean).map((c: string, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 bg-white/10 text-white/70 rounded-[4px] text-[8px] font-bold uppercase tracking-wider">{c}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button type="button" onClick={handleReset}
              className="px-6 py-2 mt-4 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-black uppercase tracking-wider transition-all">
              {tr("New Batch")}
            </button>
          </>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Review & Edit Items
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col gap-3 animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={() => setStep(1)}
          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors">
          <ChevronLeft size={14} /> {tr("Back")}
        </button>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
          {batchItems.length} item{batchItems.length !== 1 ? 's' : ''} loaded
        </span>
        <button type="button" onClick={handleBatchSave} disabled={batchItems.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-400 text-black rounded-xl text-[12px] font-black uppercase tracking-wider hover:bg-cyan-500 transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:grayscale">
          <Save size={16} strokeWidth={3} /> {tr("Save All")}
        </button>
      </div>

      {/* Items list */}
      <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
        {batchItems.map((item, idx) => {
          const codes = getItemCodes(item);
          const isEditing = editingItem === item.id;
          const itemImgInputRef = React.createRef<HTMLInputElement>();

          return (
            <div key={item.id} className="bg-black/20 backdrop-blur-3xl rounded-xl border border-white/10 p-3 shadow-sm hover:shadow-md transition-shadow">
              {/* Row 1: Tag preview + core info + actions */}
              <div className="flex items-start gap-3">
                {/* Item number */}
                <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-black text-white/40">{idx + 1}</span>
                </div>

                {/* Tag ID preview */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className="vendor-tag px-2 py-0.5 rounded text-[10px] font-black"
                    style={{ ['--vendor-color' as string]: vendorData?.color || '#ccc', backgroundColor: vendorData?.color || '#ccc', color: getTextColorForBg(vendorData?.color || '#ccc') } as React.CSSProperties}>
                    {vendorKey} 826
                  </span>
                  <span className="text-xs font-black text-white">{item.itemNumber}</span>
                  <span className="text-xs font-black text-white">{codes.bookLandCode || tr("XXXX")}</span>
                </div>

                {/* Description summary */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-white/70 truncate">
                    {[item.color, item.material, item.shape, item.itemType].filter(Boolean).join(' · ') || item.description || '—'}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 text-[9px] font-bold text-white/40">
                    {item.widthCm && <span>{item.widthCm}W</span>}
                    {item.heightCm && <span>{item.heightCm}H</span>}
                    {item.lengthCm && <span>{item.lengthCm}D</span>}
                    {item.weightKg && <span>{item.weightKg}kg</span>}
                    <span className="text-cyan-400">Q{item.quantity || '1'}</span>
                  </div>
                </div>

                {/* Price + Codes */}
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-white">${item.price || '0'}<span className="text-[8px] text-white/40 ml-0.5">MXN</span></p>
                  <div className="flex items-center gap-1.5 justify-end text-[8px] font-bold text-white/30">
                    <span>{tr("AQ:")}{codes.bookAqCode}</span>
                    <span>{tr("LC:")}{codes.bookLandCode}</span>
                    <span className="text-emerald-400">${codes.bookRetail}</span>
                  </div>
                </div>

                {/* Image slot */}
                <div className="shrink-0 flex items-center gap-1">
                  <input type="file" ref={itemImgInputRef} className="hidden" multiple accept="image/*"
                    onChange={(e) => { if (e.target.files) addImageToItem(item.id, e.target.files); e.target.value = ''; }} />
                  {item.mediaFiles.length > 0 && (
                    <div className="flex gap-0.5">
                      {item.mediaFiles.slice(0, 2).map((f, mi) => (
                        <div key={mi} className="relative w-8 h-8 rounded overflow-hidden group">
                          <img src={f.localUrl} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removeImageFromItem(item.id, mi)}
                            className="absolute inset-0 bg-red-500/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={10} className="text-white" strokeWidth={3} />
                          </button>
                        </div>
                      ))}
                      {item.mediaFiles.length > 2 && (
                        <span className="text-[8px] font-black text-white/30 self-center">+{item.mediaFiles.length - 2}</span>
                      )}
                    </div>
                  )}
                  <button type="button" onClick={() => itemImgInputRef.current?.click()}
                    className="w-8 h-8 border border-dashed border-white/15 rounded flex items-center justify-center hover:border-cyan-400 hover:bg-cyan-500/20 transition-all text-white/20">
                    <ImageIcon size={12} />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => setEditingItem(isEditing ? null : item.id)}
                    className={`w-6 h-6 rounded flex items-center justify-center transition-all text-[10px] font-black ${
                      isEditing ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                    }`}>
                    ✎
                  </button>
                  <button type="button" onClick={() => removeItem(item.id)}
                    className="w-6 h-6 rounded flex items-center justify-center text-white/20 hover:text-rose-400 hover:bg-red-500/20 transition-all">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Expandable edit row */}
              {isEditing && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/10 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className={lbl}>{tr("SHAPE")}</label>
                    <input type="text" value={item.shape} onChange={e => updateItem(item.id, 'shape', e.target.value)} className={inp} />
                    {suggestions.shape.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {suggestions.shape.slice(0, 4).map(s => (
                          <button key={s} type="button" onMouseDown={e => { e.preventDefault(); updateItem(item.id, 'shape', s); }}
                            className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-600 rounded text-[8px] font-black uppercase hover:bg-cyan-100 transition-colors">{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={lbl}>{tr("TYPE")}</label>
                    <input type="text" value={item.itemType} onChange={e => updateItem(item.id, 'itemType', e.target.value)} className={inp} />
                    {suggestions.itemType.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {suggestions.itemType.slice(0, 4).map(s => (
                          <button key={s} type="button" onMouseDown={e => { e.preventDefault(); updateItem(item.id, 'itemType', s); }}
                            className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-600 rounded text-[8px] font-black uppercase hover:bg-cyan-100 transition-colors">{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={lbl}>{tr("COLOR")}</label>
                    <input type="text" value={item.color} onChange={e => updateItem(item.id, 'color', e.target.value)} className={inp} />
                    {suggestions.color.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {suggestions.color.slice(0, 4).map(s => (
                          <button key={s} type="button" onMouseDown={e => { e.preventDefault(); updateItem(item.id, 'color', s); }}
                            className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-600 rounded text-[8px] font-black uppercase hover:bg-cyan-100 transition-colors">{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={lbl}>{tr("MATERIAL")}</label>
                    <input type="text" value={item.material} onChange={e => updateItem(item.id, 'material', e.target.value)} className={inp} />
                    {suggestions.material.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {suggestions.material.slice(0, 4).map(s => (
                          <button key={s} type="button" onMouseDown={e => { e.preventDefault(); updateItem(item.id, 'material', s); }}
                            className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-600 rounded text-[8px] font-black uppercase hover:bg-cyan-100 transition-colors">{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={lbl}>{tr("WIDTH CM")}</label>
                    <input type="number" min="0" value={item.widthCm} onChange={e => updateItem(item.id, 'widthCm', e.target.value)} className={inp + ' text-center'} />
                  </div>
                  <div>
                    <label className={lbl}>{tr("HEIGHT CM")}</label>
                    <input type="number" min="0" value={item.heightCm} onChange={e => updateItem(item.id, 'heightCm', e.target.value)} className={inp + ' text-center'} />
                  </div>
                  <div>
                    <label className={lbl}>{tr("DEPTH CM")}</label>
                    <input type="number" min="0" value={item.lengthCm} onChange={e => updateItem(item.id, 'lengthCm', e.target.value)} className={inp + ' text-center'} />
                  </div>
                  <div>
                    <label className={lbl}>{tr("WEIGHT KG")}</label>
                    <input type="number" min="0" value={item.weightKg} onChange={e => updateItem(item.id, 'weightKg', e.target.value)} className={inp + ' text-center'} />
                  </div>
                  <div>
                    <label className={lbl}>{tr("QTY")}</label>
                    <input type="number" min="1" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} className={inp + ' text-center'} />
                  </div>
                  <div>
                    <label className={lbl}>{tr("PRICE MXN")}</label>
                    <input type="number" min="0" value={item.price} onChange={e => updateItem(item.id, 'price', e.target.value)} className={inp + ' text-center font-black'} />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>{tr("DESCRIPTION")}</label>
                    <input type="text" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} className={inp} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {aiEnabled && batchItems.length > 0 && (
          <div className="mb-4 border border-white/10 rounded-xl bg-black/20 backdrop-blur-3xl p-4">
            <CatalogHubProcessesPanel
              processes={CATALOG_PROCESSES}
              selected={aiSelected}
              onToggle={handleAiToggle}
              onRun={handleAiRun}
              onReload={handleAiRun}
              results={mapResultsByProcessId(aiResults)}
              busy={aiBusy}
              hasPhoto={batchItems.some(i => i.mediaFiles.some(m => m.type === 'image'))}
              hasVideo={batchItems.some(i => i.mediaFiles.some(m => m.type === 'video'))}
            />
          </div>
      )}

      {/* Bottom summary bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/20 backdrop-blur-3xl rounded-lg border border-white/10 mt-1">
        <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-wider text-white/40">
          <span>{tr("Items:")} {batchItems.length}</span>
          <span>{tr("Qty:")} {batchItems.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0)}</span>
          <span>{tr("MXN: $")}{batchItems.reduce((acc, i) => acc + ((Number(i.price) || 0) * (Number(i.quantity) || 1)), 0).toLocaleString()}</span>
          <span>{tr("Images:")} {batchItems.filter(i => i.mediaFiles.length > 0).length}</span>
        </div>
      </div>
    </div>
  );
}







