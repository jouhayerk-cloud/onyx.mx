import * as XLSX from 'xlsx';
import { getGeminiKey } from './ai/keys';

export interface ParsedVendorItem {
    code: string;
    description?: string;
    shape?: string;
    type?: string;
    material?: string;
    color?: string;
    length_cm?: number | null;
    width_cm?: number | null;
    height_cm?: number | null;
    dimensions_in?: string;
    dimensions_cm?: string;
    weight_kg?: number | null;
    quantity?: number;
    marked_price?: number | null;
    discount_pct?: number | null;
    cost_mxn?: number | null;
    notes?: string;
    matchedPhoto?: File | Blob | null;
    matchedPhotoUrl?: string | null;
    rawOcrText?: string;
}

export interface IntakeParseResult {
    vendor: string;
    format: 'AM' | 'JM' | 'EM' | 'GE' | 'XLSX_STANDARD' | 'AI_OCR' | 'IMAGE_CATALOG' | 'GOOGLE_DOC';
    items: ParsedVendorItem[];
    rawText?: string;
}

/**
 * Universal file intake parser: handles .xlsx, .xls, .csv, and .pdf
 */
export async function universalIntakeParser(file: File, vendorHint: string = 'JM'): Promise<IntakeParseResult> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        return parseSpreadsheetFile(file, vendorHint);
    }

    if (ext === 'pdf') {
        return parsePdfFile(file, vendorHint);
    }

    if (ext === 'zip') {
        return parseCatalogZipFile(file, vendorHint);
    }

    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        return parseCatalogImagesBatch([file], vendorHint);
    }

    throw new Error(`Unsupported file type: .${ext}. Please upload .xlsx, .xls, .csv, .pdf, .zip, or image.`);
}

/**
 * Parses spreadsheet or CSV files supporting JM, AM, EM, and standard formats
 */
export async function parseSpreadsheetFile(file: File, vendorHint: string): Promise<IntakeParseResult> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rows.length < 2) throw new Error('Spreadsheet has no data rows.');

    // Check if JM format: Header contains 'COD.', 'CONCEPTO', 'COST.UNIT.'
    const headerStr = rows.slice(0, 10).map(r => r.join(' ')).join(' ').toUpperCase();
    if (headerStr.includes('COD.') || headerStr.includes('CONCEPTO') || headerStr.includes('COST.UNIT.')) {
        return parseJmSpreadsheet(rows, 'JM');
    }

    // Check standard Onyx batch spreadsheet
    return parseStandardSpreadsheet(rows, vendorHint);
}

/**
 * Parser for JM (Jose Meza) quotation format
 */
function parseJmSpreadsheet(rows: any[][], vendor: string): IntakeParseResult {
    const items: ParsedVendorItem[] = [];

    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const rowStr = rows[i].join(' ').toUpperCase();
        if (rowStr.includes('COD') && rowStr.includes('CONCEPTO')) {
            headerIdx = i;
            break;
        }
    }

    const dataRows = headerIdx !== -1 ? rows.slice(headerIdx + 1) : rows.slice(1);

    for (const r of dataRows) {
        const code = String(r[0] || '').trim();
        if (!code || code.startsWith('SUMA') || code.startsWith('TOTAL') || code.includes('DESCUENTO') || code.includes('PIEZAS')) {
            continue;
        }

        const qty = parseInt(String(r[2] || '1'), 10) || 1;
        const concepto = String(r[3] || '').trim();
        const medidasRaw = String(r[4] || '').trim();
        const colorRaw = String(r[6] || '').trim();
        const costStr = String(r[7] || '').replace(/[$,]/g, '').trim();
        const cost = parseFloat(costStr);

        if (isNaN(cost) && !concepto) continue;

        let length_cm: number | null = null;
        let width_cm: number | null = null;
        let height_cm: number | null = null;

        if (medidasRaw.toUpperCase().includes('DIAM')) {
            const parts = medidasRaw.split(/diamx?/i);
            length_cm = parseFloat(parts[0]) || null;
            width_cm = length_cm;
            height_cm = parseFloat(parts[1]) || null;
        } else if (medidasRaw) {
            const parts = medidasRaw.split(/x/i).map(s => parseFloat(s.trim()));
            length_cm = parts[0] || null;
            width_cm = parts[1] || null;
            height_cm = parts[2] || null;
        }

        let material = 'Onyx';
        if (/m[aá]rmol/i.test(colorRaw) || /m[aá]rmol/i.test(concepto)) material = 'Mármol';
        else if (/onix|ónix/i.test(colorRaw)) material = 'Onyx';

        const color = colorRaw.replace(/m[aá]rmol|onix|ónix/gi, '').trim() || 'Natural';

        items.push({
            code,
            quantity: qty,
            shape: concepto,
            type: concepto,
            material,
            color,
            length_cm,
            width_cm,
            height_cm,
            cost_mxn: isNaN(cost) ? null : cost,
            description: `${concepto} ${colorRaw} ${medidasRaw}`.trim()
        });
    }

    return {
        vendor: 'JM',
        format: 'JM',
        items
    };
}

/**
 * Standard Onyx spreadsheet parser
 */
function parseStandardSpreadsheet(rows: any[][], vendor: string): IntakeParseResult {
    const items: ParsedVendorItem[] = [];
    const headers = rows[0].map(h => String(h || '').trim().toLowerCase());

    const findCol = (names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));

    const colQty = findCol(['cant', 'qty']);
    const colShape = findCol(['forma', 'shape']);
    const colType = findCol(['tipo', 'type']);
    const colColor = findCol(['color']);
    const colMaterial = findCol(['material']);
    const colW = findCol(['ancho', 'width', 'w']);
    const colH = findCol(['alto', 'height', 'h']);
    const colL = findCol(['fondo', 'length', 'l', 'depth']);
    const colPrice = findCol(['precio', 'price', 'cost']);
    const colCode = findCol(['#', 'code', 'codigo', 'item']);

    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;

        const price = colPrice !== -1 ? parseFloat(String(r[colPrice] || '').replace(/[$,]/g, '')) : null;
        const code = colCode !== -1 && r[colCode] ? String(r[colCode]).trim() : String(i);

        items.push({
            code,
            quantity: colQty !== -1 ? parseInt(String(r[colQty] || '1'), 10) || 1 : 1,
            shape: colShape !== -1 ? String(r[colShape] || '') : undefined,
            type: colType !== -1 ? String(r[colType] || '') : undefined,
            color: colColor !== -1 ? String(r[colColor] || '') : undefined,
            material: colMaterial !== -1 ? String(r[colMaterial] || '') : undefined,
            length_cm: colL !== -1 ? parseFloat(String(r[colL] || '')) || null : null,
            width_cm: colW !== -1 ? parseFloat(String(r[colW] || '')) || null : null,
            height_cm: colH !== -1 ? parseFloat(String(r[colH] || '')) || null : null,
            cost_mxn: isNaN(price || 0) ? null : price,
        });
    }

    return {
        vendor,
        format: 'XLSX_STANDARD',
        items
    };
}

/**
 * Parses PDF files: extracts text using pdfjs-dist. If format matches AM or JM, parses deterministically;
 * otherwise invokes free Gemini OCR.
 */
export async function parsePdfFile(file: File, vendorHint: string): Promise<IntakeParseResult> {
    try {
        const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const buffer = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

        let fullText = '';
        for (let p = 1; p <= doc.numPages; p++) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            const pageText = content.items.map((it: any) => it.str).join(' ');
            fullText += pageText + '\n';
        }

        // Test if Emmanuel De Los Santos / EM format (Format 1: "3ra Orden / Cilindro", Format 2: "WAYNE")
        if (fullText.includes('Emmanuel') || fullText.includes('WAYNE') || fullText.includes('Cilindro') || fullText.includes('Costo Unitario Pesos') || vendorHint === 'EM') {
            const parsed = parseEmText(fullText);
            if (parsed.length > 0) {
                return {
                    vendor: 'EM',
                    format: 'EM',
                    items: parsed,
                    rawText: fullText
                };
            }
        }

        // Test if Estefany Meza / AM format (COTIZACIÓN ESTEFANY MEZA)
        if (fullText.includes('ESTEFANY MEZA') || fullText.includes('Panel de onix') || fullText.includes('CABALLOS') || vendorHint === 'AM' || vendorHint === 'EM') {
            const parsed = parseAmText(fullText);
            if (parsed.length > 0) {
                return {
                    vendor: 'AM',
                    format: 'AM',
                    items: parsed,
                    rawText: fullText
                };
            }
        }

        // Test if JM format in text
        if (fullText.includes('COD-') || fullText.includes('MESAS CENTRO') || fullText.includes('CONCEPTO')) {
            const parsed = parseJmText(fullText);
            if (parsed.length > 0) {
                return {
                    vendor: 'JM',
                    format: 'JM',
                    items: parsed,
                    rawText: fullText
                };
            }
        }

        // If digital text extraction didn't yield structured items (e.g. scanned PDF), fallback to free Gemini OCR
        if (fullText.trim().length < 50) {
            console.log('[PDF Intake] Scanned PDF detected, routing to Gemini Flash free OCR...');
            return parseDocumentWithFreeAI(file, 'application/pdf', vendorHint);
        }

        // For other text PDFs, ask Gemini Flash to structure the extracted text into clean JSON items
        return structureTextWithFreeAI(fullText, vendorHint);
    } catch (err: any) {
        console.warn('[PDF Intake] Client-side extraction failed, falling back to Gemini OCR:', err.message);
        return parseDocumentWithFreeAI(file, 'application/pdf', vendorHint);
    }
}

/**
 * Deterministic line parser for AM (Estefany Meza) quotations
 */
function parseAmText(text: string): ParsedVendorItem[] {
    const items: ParsedVendorItem[] = [];
    const lines = text.split(/\r?\n|(?=\b\d+\s+Panel\b|\b\d+\s+panel\b)/i);

    // Pattern: [Code/Num] [Description] [LxWxH] $ [Price]
    const regex = /(\d+)\s+([Pp]anel\s+de\s+[^0-9$]+?)\s+(\d+\s*[xX]\s*\d+\s*[xX]\s*\d+)\s+\$\s*([\d,]+(?:\.\d+)?)/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const code = match[1];
        const desc = match[2].trim();
        const dims = match[3].replace(/\s+/g, '').toLowerCase().split('x').map(Number);
        const price = parseFloat(match[4].replace(/,/g, ''));

        let material = 'Onyx';
        if (/m[aá]rmol/i.test(desc)) material = 'Mármol';
        if (/onix|ónix/i.test(desc) && /m[aá]rmol/i.test(desc)) material = 'Ónix y Mármol';

        let color = 'Natural';
        const colorMatch = desc.match(/(crema|blanco|naranja|yelow|yellow|amarillo|n[aá]car|rosa|verde|gris|negro|pink|aqua)/i);
        if (colorMatch) color = colorMatch[1];

        items.push({
            code,
            quantity: 1,
            description: desc,
            shape: 'Panel',
            type: 'Panel',
            material,
            color,
            length_cm: dims[0] || null,
            width_cm: dims[1] || null,
            height_cm: dims[2] || null,
            cost_mxn: isNaN(price) ? null : price
        });
    }

    return items;
}

/**
 * Deterministic line parser for JM text format
 */
function parseJmText(text: string): ParsedVendorItem[] {
    const items: ParsedVendorItem[] = [];
    // Match COD-XXXX or B-X pattern followed by Concept and Dimensions
    const regex = /(COD-\d+|B-\d+)\s*,*\s*(\d+)*\s*,*\s*([A-Z\s]+?)\s*,*\s*(\d+\s*[xX]\s*\d+\s*[xX]\s*\d+|\d+\s*DIAM\s*[xX]\s*\d+)\s*,*[^,]*\s*,*\s*([^,]+?)\s*,*\s*([\d,]+)/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const code = match[1];
        const qty = parseInt(match[2] || '1', 10) || 1;
        const concepto = match[3].trim();
        const medidas = match[4].replace(/\s+/g, '');
        const colorRaw = match[5].trim();
        const price = parseFloat(match[6].replace(/,/g, ''));

        let length_cm: number | null = null;
        let width_cm: number | null = null;
        let height_cm: number | null = null;

        if (medidas.toUpperCase().includes('DIAM')) {
            const parts = medidas.split(/diamx?/i);
            length_cm = parseFloat(parts[0]) || null;
            width_cm = length_cm;
            height_cm = parseFloat(parts[1]) || null;
        } else {
            const parts = medidas.split(/x/i).map(Number);
            length_cm = parts[0] || null;
            width_cm = parts[1] || null;
            height_cm = parts[2] || null;
        }

        let material = 'Onyx';
        if (/m[aá]rmol/i.test(colorRaw) || /m[aá]rmol/i.test(concepto)) material = 'Mármol';

        items.push({
            code,
            quantity: qty,
            shape: concepto,
            type: concepto,
            material,
            color: colorRaw.replace(/m[aá]rmol|onix|ónix/gi, '').trim() || 'Natural',
            length_cm,
            width_cm,
            height_cm,
            cost_mxn: isNaN(price) ? null : price,
            description: `${concepto} ${colorRaw}`.trim()
        });
    }

    return items;
}

/**
 * Free Gemini 2.5 Flash / 1.5 Flash Document Parser & OCR
 */
export async function parseDocumentWithFreeAI(file: File, mimeType: string, vendorHint: string): Promise<IntakeParseResult> {
    const key = getGeminiKey();
    if (!key) throw new Error('Please configure your Gemini API Key in Settings to run AI OCR.');

    const buffer = await file.arrayBuffer();
    const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const prompt = `You are an expert procurement and stone catalog document extractor for Onyx and Marble art items from Mexican vendors (AM, JM, etc.).
Extract all listed products/items from this document into a structured JSON array.
For each item return:
- "code": item code or invoice line number (e.g. "1", "2", "COD-3552", "B-1")
- "quantity": number (e.g. 1)
- "description": full product description
- "shape": e.g. "Panel", "Mesa Centro", "Torre", "Canoa", "Bowl", "Sink", "Mirror"
- "type": e.g. "Panel", "Mesa", "Lámpara", "Espejo", "Lavabo"
- "material": e.g. "Onyx", "Mármol"
- "color": e.g. "Crema", "Blanco", "Naranja", "Nácar", "Negro"
- "length_cm": number or null
- "width_cm": number or null
- "height_cm": number or null
- "cost_mxn": unit cost price in Mexican Pesos (number only, strip currency symbols)

Return ONLY valid JSON matching this schema:
{
  "vendor": "${vendorHint}",
  "items": [
     { "code": "...", "quantity": 1, "description": "...", "shape": "...", "type": "...", "material": "...", "color": "...", "length_cm": 160, "width_cm": 70, "height_cm": 10, "cost_mxn": 11000 }
  ]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const payload = {
        contents: [
            {
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: base64 } }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: 'application/json'
        }
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`Gemini OCR API error: ${res.statusText}`);

    const data = await res.json();
    const textOut = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(textOut);

    return {
        vendor: parsed.vendor || vendorHint,
        format: 'AI_OCR',
        items: parsed.items || []
    };
}

/**
 * Text-only AI structuring helper for unstructured PDF text
 */
async function structureTextWithFreeAI(fullText: string, vendorHint: string): Promise<IntakeParseResult> {
    const key = getGeminiKey();
    if (!key) throw new Error('Gemini Key needed for structuring irregular document.');

    const prompt = `Extract all stone/craft catalog items from this raw text into a clean JSON array with: code, quantity, description, shape, type, material, color, length_cm, width_cm, height_cm, cost_mxn:
${fullText.slice(0, 15000)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
        })
    });

    const data = await res.json();
    const textOut = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(textOut);

    return {
        vendor: vendorHint,
        format: 'AI_OCR',
        items: parsed.items || parsed || []
    };
}

/**
 * Auto-matches folder photos to parsed items by code/number
 * Supports filenames like:
 * - "1.jpg", "01.png", "item-1.jpg" for code "1"
 * - "COD-3552.jpg", "3552.png", "COD3552.jpg" for code "COD-3552"
 * - "B-1.jpg", "B1.png" for code "B-1"
 */
export function matchPhotosToParsedItems(items: ParsedVendorItem[], photos: (File | Blob)[]): ParsedVendorItem[] {
    const photoByCodeOrDigit = new Map<string, File | Blob>();
    const availablePhotos: { file: File | Blob; name: string; color: string; height_cm: number | null }[] = [];

    function normalizeColor(c: string): string {
        if (!c) return '';
        let n = c.toUpperCase().replace(/\s+/g, ' ').trim();
        if (n === 'GALAXYA') n = 'GALAXIA';
        if (n === 'ARCO IRIS') n = 'ARCOIRIS';
        return n;
    }

    const KNOWN_COLORS = [
        'CHERRY BLUE', 'CHERRY PINK', 'ARCOIRIS', 'ARCO IRIS', 'GALAXIA', 'GALAXYA',
        'NACAR', 'NÁCAR', 'BLANCO', 'NEGRO', 'VERDE', 'AMBAR', 'ÁMBAR', 'NARANJA',
        'ROJO', 'PIEL DE TIGRE', 'CAFÉ', 'CAFE', 'BEIGE'
    ];

    for (const file of photos) {
        const rawName = (file as any).name || 'photo.jpg';
        const base = rawName.substring(0, rawName.lastIndexOf('.')) || rawName;
        const normalized = base.toUpperCase().replace(/[^A-Z0-9]/g, '');
        photoByCodeOrDigit.set(normalized, file);

        const digitsOnly = base.replace(/\D/g, '');
        if (digitsOnly) photoByCodeOrDigit.set(digitsOnly, file);

        // Extract color and height for vendor photo matching (e.g. "GALAXIA de .30x.30x2.20.jpg", "Cherry_Pink_1.50.jpg")
        const baseSpaced = base.toUpperCase().replace(/[_-]/g, ' ');
        let detectedColor = '';
        for (const col of KNOWN_COLORS) {
            if (baseSpaced.includes(col)) {
                detectedColor = normalizeColor(col);
                break;
            }
        }

        let detectedHeightCm: number | null = null;
        const hMatchM = baseSpaced.match(/(?:[xX*]|\s|\b)(1\.\d{1,2}|2\.\d{1,2}|[12]M|[12]\.00?)(?:\b|[\s])/);
        if (hMatchM) {
            const numStr = hMatchM[1].replace(/M/i, '');
            detectedHeightCm = Math.round(parseFloat(numStr) * 100);
        } else {
            const hMatchCm = baseSpaced.match(/(?:[xX*]|\s|\b)(1[0-9]{2}|2[0-9]{2})\b/);
            if (hMatchCm) {
                detectedHeightCm = parseInt(hMatchCm[1], 10);
            }
        }

        availablePhotos.push({
            file,
            name: rawName,
            color: detectedColor,
            height_cm: detectedHeightCm
        });
    }

    const matchedPhotoSet = new Set<File | Blob>();

    return items.map(item => {
        // 1. Direct code or line number match
        const itemCodeNorm = item.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const digitsOnly = item.code.replace(/\D/g, '');

        let matched = photoByCodeOrDigit.get(itemCodeNorm) || (digitsOnly ? photoByCodeOrDigit.get(digitsOnly) : null);

        // 2. Color + Dimension match (GE / Vendor naming convention)
        if (!matched && (item.color || item.height_cm)) {
            const itemColorNorm = normalizeColor(item.color || '');
            const candidate = availablePhotos.find(p => {
                if (matchedPhotoSet.has(p.file)) return false;
                const colorMatches = itemColorNorm && p.color && (itemColorNorm === p.color || itemColorNorm.includes(p.color));
                const heightMatches = !p.height_cm || !item.height_cm || Math.abs(p.height_cm - item.height_cm) <= 5;
                return colorMatches && heightMatches;
            });

            if (candidate) {
                matched = candidate.file;
            }
        }

        if (matched) {
            matchedPhotoSet.add(matched);
            return {
                ...item,
                matchedPhoto: matched,
                matchedPhotoUrl: URL.createObjectURL(matched)
            };
        }

        return item;
    });
}


/**
 * Deterministically parses OCR text from a JM catalog photo into a structured item.
 * Extracts: Code (COD-XXXX, LP-XXX), Concept/Shape, Material, Color, Imperial & Metric Dimensions,
 * Marked Price ($), and automatically applies 30% JM discount.
 */
export function parseJmImageText(rawText: string, filename: string = '', vendorHint: string = 'JM'): ParsedVendorItem {
    // 1. Code
    let code = '';
    const codeMatch = rawText.match(/\b(COD[-\s]?\d+|LP[-\s]?\d+|[A-Z]{1,4}[-\s]?\d+)\b/i);
    if (codeMatch) {
        code = codeMatch[1].toUpperCase().replace(/\s+/g, '-');
    } else {
        code = filename.replace(/\.[^/.]+$/, '').toUpperCase();
    }

    // 2. Shape / Concept
    let shape = 'TORRE';
    const shapeMatch = rawText.match(/\b(TORRE|MESA(?: CENTRO)?|PANEL|ESPEJO|L[ÁA]MPARA|CANOA|BOWL|LAVABO|CUBO|ESCULTURA|PLATO|PEDESTAL)\b/i);
    if (shapeMatch) {
        shape = shapeMatch[1].toUpperCase();
    }

    // 3. Material & Color
    let material = 'Onyx';
    let color = '';
    const matMatch = rawText.match(/\b([ÓO]NIX|M[ÁA]RMOL)\s*([A-ZÁÉÍÓÚÑ]+)?\b/i);
    if (matMatch) {
        material = matMatch[1].toUpperCase().includes('M') ? 'Mármol' : 'Onyx';
        if (matMatch[2] && !['TORRE','MESA','PANEL','CENTRO'].includes(matMatch[2].toUpperCase())) {
            color = matMatch[2].toUpperCase();
        }
    }

    // 4. Dimensions
    let length_cm: number | null = null;
    let width_cm: number | null = null;
    let height_cm: number | null = null;
    let dimensions_in = '';
    let dimensions_cm = '';

    // Explicit inches with quote or in (e.g. 12x12x40" or 29x12x12”)
    const inMatch = rawText.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*(?:["”]|in|IN)/);
    if (inMatch) {
        dimensions_in = `${inMatch[1]}x${inMatch[2]}x${inMatch[3]}"`;
    }

    // Explicit cm with cm unit (e.g. 75x30x30cm)
    const explicitCmMatch = rawText.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*(?:cm|CM)/i);
    if (explicitCmMatch) {
        length_cm = parseFloat(explicitCmMatch[1]);
        width_cm = parseFloat(explicitCmMatch[2]);
        height_cm = parseFloat(explicitCmMatch[3]);
        dimensions_cm = `${length_cm}x${width_cm}x${height_cm} cm`;
    } else {
        // Look for 3 numbers line without quotes (e.g. 30x30x100)
        const all3NumMatches = Array.from(rawText.matchAll(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/g));
        for (const m of all3NumMatches) {
            const matchStr = m[0];
            const afterMatch = rawText.slice((m.index || 0) + matchStr.length, (m.index || 0) + matchStr.length + 3);
            if (!/["”]/i.test(afterMatch)) {
                length_cm = parseFloat(m[1]);
                width_cm = parseFloat(m[2]);
                height_cm = parseFloat(m[3]);
                dimensions_cm = `${length_cm}x${width_cm}x${height_cm} cm`;
                break;
            }
        }
    }

    // Fallback: If cm not found but inches found, convert to cm
    if (length_cm == null && inMatch) {
        length_cm = Math.round(parseFloat(inMatch[1]) * 2.54);
        width_cm = Math.round(parseFloat(inMatch[2]) * 2.54);
        height_cm = Math.round(parseFloat(inMatch[3]) * 2.54);
        dimensions_cm = `${length_cm}x${width_cm}x${height_cm} cm`;
    }

    // 5. Marked Price & JM 30% discount
    let marked_price: number | null = null;
    const priceMatch = rawText.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
    if (priceMatch) {
        marked_price = parseFloat(priceMatch[1].replace(/,/g, ''));
    }

    let cost_mxn: number | null = null;
    let discount_pct = 0;
    let notes = '';

    if (marked_price != null && !isNaN(marked_price)) {
        if (vendorHint === 'JM' || code.startsWith('COD-') || code.startsWith('LP-')) {
            discount_pct = 30; // Automatically calculate 30% discount on JM image catalog marked prices
            cost_mxn = Math.round(marked_price * 0.70);
            notes = `JM marked price: $${marked_price.toLocaleString()} MXN (-30% discount applied -> $${cost_mxn.toLocaleString()} MXN)`;
        } else {
            cost_mxn = marked_price;
        }
    }

    return {
        code,
        description: shape + (color ? ' ' + color : ''),
        shape,
        type: shape,
        material,
        color,
        length_cm,
        width_cm,
        height_cm,
        dimensions_in,
        dimensions_cm,
        quantity: 1,
        marked_price,
        discount_pct,
        cost_mxn,
        notes,
        rawOcrText: rawText.replace(/\s+/g, ' ').trim()
    };
}

/**
 * Extracts and parses all catalog images from a .zip file (e.g. downloaded Google Doc zip)
 */
export async function parseCatalogZipFile(
    zipFile: File,
    vendorHint: string = 'JM',
    onProgress?: (done: number, total: number, item?: ParsedVendorItem) => void
): Promise<IntakeParseResult> {
    const JSZip = (await import('jszip')).default || await import('jszip');
    const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());

    const imageNames = Object.keys(zip.files)
        .filter(name => !zip.files[name].dir && /\.(jpe?g|png|webp)$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    if (imageNames.length === 0) {
        throw new Error('No image files found inside the zip archive.');
    }

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');

    const items: ParsedVendorItem[] = [];

    for (let i = 0; i < imageNames.length; i++) {
        const name = imageNames[i];
        const entry = zip.files[name];
        const blob = await entry.async('blob');
        const fileName = name.split('/').pop() || name;

        try {
            const ocrResult = await worker.recognize(blob);
            const rawText = ocrResult?.data?.text || '';
            const parsed = parseJmImageText(rawText, fileName, vendorHint);
            parsed.matchedPhoto = blob;
            parsed.matchedPhotoUrl = URL.createObjectURL(blob);
            items.push(parsed);
            onProgress?.(i + 1, imageNames.length, parsed);
        } catch (err: any) {
            console.warn(`[OCR] Failed recognizing ${fileName}:`, err);
            const fallback: ParsedVendorItem = {
                code: fileName.replace(/\.[^/.]+$/, '').toUpperCase(),
                shape: 'PIEZA ONIX',
                quantity: 1,
                matchedPhoto: blob,
                matchedPhotoUrl: URL.createObjectURL(blob)
            };
            items.push(fallback);
            onProgress?.(i + 1, imageNames.length, fallback);
        }
    }

    await worker.terminate();

    return {
        vendor: vendorHint,
        format: 'IMAGE_CATALOG',
        items
    };
}

/**
 * Extracts and parses a list of image files (e.g. drag & drop photo catalog)
 */
export async function parseCatalogImagesBatch(
    files: File[],
    vendorHint: string = 'JM',
    onProgress?: (done: number, total: number, item?: ParsedVendorItem) => void
): Promise<IntakeParseResult> {
    const validImages = files.filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (validImages.length === 0) {
        throw new Error('No valid image files provided.');
    }

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');

    const items: ParsedVendorItem[] = [];

    for (let i = 0; i < validImages.length; i++) {
        const file = validImages[i];
        try {
            const ocrResult = await worker.recognize(file);
            const rawText = ocrResult?.data?.text || '';
            const parsed = parseJmImageText(rawText, file.name, vendorHint);
            parsed.matchedPhoto = file;
            parsed.matchedPhotoUrl = URL.createObjectURL(file);
            items.push(parsed);
            onProgress?.(i + 1, validImages.length, parsed);
        } catch (err: any) {
            console.warn(`[OCR] Failed recognizing ${file.name}:`, err);
            const fallback: ParsedVendorItem = {
                code: file.name.replace(/\.[^/.]+$/, '').toUpperCase(),
                shape: 'PIEZA ONIX',
                quantity: 1,
                matchedPhoto: file,
                matchedPhotoUrl: URL.createObjectURL(file)
            };
            items.push(fallback);
            onProgress?.(i + 1, validImages.length, fallback);
        }
    }

    await worker.terminate();

    return {
        vendor: vendorHint,
        format: 'IMAGE_CATALOG',
        items
    };
}

/**
 * Parses Google Doc URL to extract Document ID
 */
export function extractGoogleDocId(url: string): string | null {
    if (!url) return null;
    const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
    return null;
}

/**
 * Returns the public direct export zip link for a Google Doc
 */
export function getGoogleDocExportZipUrl(docId: string): string {
    return `https://docs.google.com/document/d/${docId}/export?format=zip`;
}


/**
 * Parser for GE (Gerardo) quotation format (handwritten notebook or WhatsApp message)
 * e.g. "1 Arcoiris 30x30x2M. $5478 + $500 = $5978"
 * e.g. "1 Galaxia 30x30x2.20 $6006 $600 = $6606"
 * e.g. "GALAXIA de .30x.30x2.20"
 */
export function parseGeText(rawText: string, vendor: string = 'GE'): IntakeParseResult {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const items: ParsedVendorItem[] = [];
    let itemCounter = 1;

    for (const line of lines) {
        // Skip header lines or summary total lines
        if (line.match(/^(Gerardo|Total|Esta por|Lamparas|\d+\s+\d+\s+\d{4})/i)) continue;

        // Try to match dimensions: e.g. 30x30x2M or 30x30x1.70 or .30x.30x2.20 or 30x30 x 240
        const dimMatch = line.match(/(?:de\s+)?(\.?\d+(?:[.,]\d+)?)\s*[xX*]\s*(\.?\d+(?:[.,]\d+)?)\s*[xX*]\s*(\.?\d+(?:[.,]\d+)?(?:M|m|\.)*)/i);
        if (!dimMatch) continue;

        let w = parseFloat(dimMatch[1].replace(',', '.'));
        let l = parseFloat(dimMatch[2].replace(',', '.'));
        let hStr = dimMatch[3].toUpperCase().replace(/[M.]/g, '').replace(',', '.');
        let h = parseFloat(hStr);

        // Convert meters to cm if needed
        if (w < 1) w = Math.round(w * 100);
        if (l < 1) l = Math.round(l * 100);
        if (h < 10) h = Math.round(h * 100); // 2.20 -> 220cm, 1.70 -> 170cm

        // Extract Color / Concept: text before dimensions
        const beforeDim = line.slice(0, dimMatch.index).trim();
        // Strip leading quantity like "1 " and trailing "de"
        let colorRaw = beforeDim.replace(/^\d+\s+/, '').replace(/\s+de$/i, '').trim();
        if (colorRaw.toUpperCase() === 'GALAXYA') colorRaw = 'Galaxia';
        if (colorRaw.toUpperCase() === 'ARCO IRIS') colorRaw = 'Arcoiris';
        const color = colorRaw || 'Onyx';

        // Extract Prices
        const afterDim = line.slice(dimMatch.index + dimMatch[0].length);
        const priceMatches = Array.from(afterDim.matchAll(/\$?\s*(\d[\d,]+(?:\.\d{2})?)/g)).map(m => parseFloat(m[1].replace(/,/g, '')));

        let cost_mxn: number | null = null;
        let base_cost: number | null = null;
        let install_cost: number | null = null;

        if (priceMatches.length >= 3) {
            base_cost = priceMatches[0];
            install_cost = priceMatches[1];
            cost_mxn = priceMatches[2]; // the final total
        } else if (priceMatches.length === 2) {
            base_cost = priceMatches[0];
            install_cost = priceMatches[1];
            cost_mxn = base_cost + install_cost;
        } else if (priceMatches.length === 1) {
            cost_mxn = priceMatches[0];
        }

        const code = `GE-${String(itemCounter++).padStart(2, '0')}`;

        items.push({
            code,
            shape: 'TORRE',
            type: 'Lámpara',
            material: 'Onyx',
            color,
            description: `Lámpara Torre ${color} ${w}x${l}x${h} cm`,
            length_cm: l,
            width_cm: w,
            height_cm: h,
            dimensions_cm: `${w}x${l}x${h} cm`,
            quantity: 1,
            cost_mxn,
            notes: base_cost && install_cost 
                ? `Base: $${base_cost} + Instalación: $${install_cost} = $${cost_mxn} MXN` 
                : undefined
        });
    }

    return {
        vendor: 'GE',
        format: 'GE',
        items,
        rawText
    };
}

/**
 * Universal text parser: recognizes WhatsApp text pastes from GE, AM, or JM
 */
export function parseRawVendorText(text: string, vendorHint: string = 'GE'): IntakeParseResult {
    const upper = text.toUpperCase();
    if (upper.includes('EMMANUEL') || upper.includes('WAYNE') || upper.includes('CILINDRO') || vendorHint === 'EM') {
        const items = parseEmText(text);
        return { vendor: 'EM', format: 'EM', items, rawText: text };
    }
    if (upper.includes('GERARDO') || upper.includes('ARCOIRIS') || upper.includes('GALAXIA') || upper.includes('CHERRY BLUE') || vendorHint === 'GE') {
        return parseGeText(text, 'GE');
    }
    if (upper.includes('ESTEFANY') || upper.includes('PANEL') || vendorHint === 'AM') {
        const items = parseAmText(text);
        return { vendor: 'AM', format: 'AM', items, rawText: text };
    }
    if (upper.includes('COD-') || vendorHint === 'JM') {
        const items = parseJmText(text);
        return { vendor: 'JM', format: 'JM', items, rawText: text };
    }
    return parseGeText(text, vendorHint);
}


/**
 * Parser for EM (Emmanuel De Los Santos) PDF formats:
 * - Format 1: Text quotation (Columns: Piezas, Producto, Dimencion, Kilos, Costo Unitario, Costo Total)
 * - Format 2: WAYNE Visual table (Columns: Qty, IMAGE, Item, Color, L, A, H, Costo Unitario Pesos, Subtotal USD, Subtotal Pesos)
 */
export function parseEmText(text: string): ParsedVendorItem[] {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const items: ParsedVendorItem[] = [];
    let itemCounter = 1;

    const isWayneFormat = text.includes('WAYNE') || text.includes('Costo Unitario Pesos') || text.includes('Wall Panel');

    if (isWayneFormat) {
        for (const line of lines) {
            if (line.match(/^(Date|Client|Qty|Subtotal|Total|\d+$)/i)) continue;

            const regex1 = /^(\d+)\s+(Wall Panel|Mirror|Canoes)\s+(.+?)\s+(\d+(?:\.\d+)?(?:M|m)?)\s+(\d+(?:\.\d+)?(?:M|m)?)\s+(\d+(?:\.\d+)?(?:M|m)?)\s+([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)$/i;
            const regex2 = /^(\d+)\s+(Wall Panel|Mirror|Canoes)\s+(.+?)\s+(\d+(?:\.\d+)?(?:M|m)?)\s+(\d+(?:\.\d+)?(?:M|m)?)\s+([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)$/i;

            const parseDim = (s: string) => {
                const v = parseFloat(s.replace(/M/i, ''));
                return s.toUpperCase().includes('M') || v < 10 ? Math.round(v * 100) : v;
            };

            let m = line.match(regex1);
            if (m) {
                const qty = parseInt(m[1], 10);
                const itemType = m[2].trim();
                const color = m[3].trim();
                const l = parseDim(m[4]);
                const a = parseDim(m[5]);
                const h = parseDim(m[6]);
                const unitCostMxn = parseFloat(m[7].replace(/,/g, ''));
                const subUsd = parseFloat(m[8].replace(/,/g, ''));

                items.push({
                    code: `EM-W-${String(itemCounter++).padStart(2, '0')}`,
                    quantity: qty,
                    shape: itemType,
                    type: itemType === 'Wall Panel' ? 'Panel' : (itemType === 'Mirror' ? 'Espejo' : 'Canoa'),
                    material: 'Onyx',
                    color,
                    description: `${itemType} ${color} ${l}x${a}x${h} cm`,
                    length_cm: l,
                    width_cm: a,
                    height_cm: h,
                    cost_mxn: unitCostMxn,
                    dimensions_cm: `${l}x${a}x${h} cm`
                });
                continue;
            }

            m = line.match(regex2);
            if (m) {
                const qty = parseInt(m[1], 10);
                const itemType = m[2].trim();
                const color = m[3].trim();
                const l = parseDim(m[4]);
                const h = parseDim(m[5]);
                const unitCostMxn = parseFloat(m[6].replace(/,/g, ''));

                items.push({
                    code: `EM-W-${String(itemCounter++).padStart(2, '0')}`,
                    quantity: qty,
                    shape: itemType,
                    type: itemType === 'Wall Panel' ? 'Panel' : (itemType === 'Mirror' ? 'Espejo' : 'Canoa'),
                    material: 'Onyx',
                    color,
                    description: `${itemType} ${color} ${l}x10x${h} cm`,
                    length_cm: l,
                    width_cm: 10,
                    height_cm: h,
                    cost_mxn: unitCostMxn,
                    dimensions_cm: `${l}x${h} cm`
                });
            }
        }
        return items;
    }

    // Format 1: Text quotation ("44 Piezas Cilindro Gris Critalino 35x12 4.6 $440 $19,360")
    for (const line of lines) {
        if (line.match(/^(Rare Earth|Emmanuel|3ra Orden|Kilos|Producto|total|\$)/i)) continue;

        const match = line.match(/^(\d+)\s*(?:Piezas?|piezas?)\s+(.+?)\s+(\d+(?:\.\d+)?\s*[xX*]\s*\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+\$?([\d,]+(?:\.\d{2})?)\s+\$?([\d,]+(?:\.\d{2})?)$/i);
        if (match) {
            const qty = parseInt(match[1], 10);
            const desc = match[2].trim();
            const dimStr = match[3].replace(/\s+/g, '');
            const weightKg = parseFloat(match[4]);
            const costMxn = parseFloat(match[5].replace(/,/g, ''));

            let shape = 'Cilindro';
            let color = desc;
            const shapeMatch = desc.match(/^(Cilindro|Espejo Redondo|Espejo Cuadrado|Espejo Rectangular|Espejo|Panel|Canoa|Mesa)\s*(.*)/i);
            if (shapeMatch) {
                shape = shapeMatch[1].trim();
                color = shapeMatch[2].trim();
            }

            const [d1, d2] = dimStr.split(/[xX*]/).map(parseFloat);
            let length_cm = d2;
            let width_cm = d2;
            let height_cm = d1;
            if (shape.toLowerCase().includes('espejo')) {
                length_cm = d1;
                width_cm = d2;
                height_cm = 10;
            }

            items.push({
                code: `EM-${String(itemCounter++).padStart(2, '0')}`,
                quantity: qty,
                shape,
                type: shape,
                material: 'Onyx',
                color,
                description: desc,
                length_cm,
                width_cm,
                height_cm,
                weight_kg: weightKg,
                cost_mxn: costMxn,
                dimensions_cm: `${dimStr} cm`
            });
        }
    }

    return items;
}

/**
 * Extracts Apple iCloud Shared Album token from URL or hash
 * e.g. "https://www.icloud.com/sharedalbum/#D29v3doz3uUVOnj5QQbp1CQMzoACAEQARogl2pxAO39kK_4HxPctQR6JuYRg00T9E0rPkPf4pEdS_Q"
 */
export function extractIcloudAlbumToken(url: string): string | null {
    if (!url) return null;
    const match = url.match(/sharedalbum\/#([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    if (url.includes('#')) {
        const afterHash = url.split('#')[1].trim();
        if (/^[a-zA-Z0-9_-]{20,}$/.test(afterHash)) return afterHash;
    }
    if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
    return null;
}

/**
 * Fetches Apple iCloud Shared Album photos via Google Apps Script bridge
 */
export async function fetchIcloudSharedAlbum(urlOrToken: string, scriptUrl?: string): Promise<{
    albumName: string;
    totalPhotos: number;
    photos: { name: string; url: string; width: number; height: number; caption: string }[];
}> {
    const token = extractIcloudAlbumToken(urlOrToken);
    if (!token) throw new Error('Invalid iCloud Shared Album URL or token.');

    const targetUrl = scriptUrl || 'https://script.google.com/macros/s/AKfycbz7HTsC9FEqbJ0jiMLjk327q4Qo07SWPh2zZzu7V4vjvdqOcc0iwsrtBWWvywRz_Jn5xw/exec';
    
    const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: 'fetchIcloudAlbum',
            token
        })
    });

    if (!response.ok) throw new Error(`Failed to connect to Google Apps Script bridge: ${response.status}`);
    const data = await response.json();

    if (data.status !== 'success') {
        throw new Error(data.message || 'Failed to fetch iCloud Shared Album photos.');
    }

    return {
        albumName: data.albumName,
        totalPhotos: data.totalPhotos,
        photos: data.photos || []
    };
}
