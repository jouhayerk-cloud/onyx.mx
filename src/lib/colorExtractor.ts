// src/lib/colorExtractor.ts

export const ALLOWED_SHOPIFY_COLORS = [
    "Black",
    "Blue",
    "Bronze",
    "Brown",
    "Clear",
    "Copper",
    "Cream",
    "Gold",
    "Gray",
    "Green",
    "Iridescent",
    "Multicolor",
    "Orange",
    "Pink",
    "Purple",
    "Rainbow",
    "Red",
    "Rose Gold",
    "Silver",
    "Tan",
    "Turquoise/Aqua",
    "White",
    "Yellow"
] as const;

export type ShopifyColor = typeof ALLOWED_SHOPIFY_COLORS[number];

// Reference RGB values for distance matching
const COLOR_PALETTE: { name: ShopifyColor; rgb: [number, number, number] }[] = [
    { name: "Black", rgb: [25, 25, 25] },
    { name: "White", rgb: [245, 245, 245] },
    { name: "Gray", rgb: [130, 130, 130] },
    { name: "Cream", rgb: [255, 253, 208] },
    { name: "Tan", rgb: [210, 180, 140] },
    { name: "Brown", rgb: [139, 69, 19] },
    { name: "Bronze", rgb: [205, 127, 50] },
    { name: "Copper", rgb: [184, 115, 51] },
    { name: "Gold", rgb: [218, 165, 32] },
    { name: "Rose Gold", rgb: [183, 110, 121] },
    { name: "Silver", rgb: [192, 192, 192] },
    { name: "Red", rgb: [220, 30, 30] },
    { name: "Orange", rgb: [255, 140, 0] },
    { name: "Yellow", rgb: [255, 215, 0] },
    { name: "Green", rgb: [40, 160, 40] },
    { name: "Blue", rgb: [30, 100, 220] },
    { name: "Turquoise/Aqua", rgb: [64, 224, 208] },
    { name: "Pink", rgb: [255, 182, 193] },
    { name: "Purple", rgb: [140, 40, 200] },
    { name: "Iridescent", rgb: [200, 220, 255] },
    { name: "Multicolor", rgb: [180, 150, 200] }
];

/**
 * Fallback / complement colors based on standard stone style or material name
 */
export function getStoneStyleColors(material: string = '', title: string = '', color: string = ''): ShopifyColor[] {
    const combined = `${material} ${title} ${color}`.toLowerCase();
    
    if (combined.includes('aqua') || combined.includes('blue') || combined.includes('azul') || combined.includes('turquoise')) {
        return ["Turquoise/Aqua", "Brown", "Tan"];
    }
    if (combined.includes('white') || combined.includes('blanco') || combined.includes('ivory')) {
        return ["White", "Cream", "Tan"];
    }
    if (combined.includes('green') || combined.includes('verde') || combined.includes('esmeralda')) {
        return ["Green", "Brown", "Tan"];
    }
    if (combined.includes('pink') || combined.includes('rosa') || combined.includes('rose')) {
        return ["Pink", "Cream", "Rose Gold"];
    }
    if (combined.includes('red') || combined.includes('rojo') || combined.includes('rubi')) {
        return ["Red", "Brown", "Orange"];
    }
    if (combined.includes('orange') || combined.includes('amber') || combined.includes('honey') || combined.includes('caramel') || combined.includes('miel') || combined.includes('naranja')) {
        return ["Orange", "Yellow", "Brown"];
    }
    if (combined.includes('brown') || combined.includes('cafe') || combined.includes('rustic') || combined.includes('tierra') || combined.includes('marron')) {
        return ["Brown", "Tan", "Bronze"];
    }
    if (combined.includes('black') || combined.includes('negro') || combined.includes('obsidian') || combined.includes('marble') || combined.includes('marmol')) {
        return ["Black", "Gray", "White"];
    }
    if (combined.includes('rainbow') || combined.includes('arcoiris') || combined.includes('multi')) {
        return ["Rainbow", "Multicolor", "Brown"];
    }
    if (combined.includes('amethyst') || combined.includes('quartz') || combined.includes('cuarzo') || combined.includes('ametista') || combined.includes('purple')) {
        return ["Purple", "Clear", "White"];
    }
    if (combined.includes('travertine') || combined.includes('limestone') || combined.includes('fossil') || combined.includes('travertino')) {
        return ["Tan", "Cream", "Brown"];
    }
    if (combined.includes('gold') || combined.includes('dorado') || combined.includes('oro')) {
        return ["Gold", "Cream", "Tan"];
    }
    if (combined.includes('cream') || combined.includes('crema')) {
        return ["Cream", "Tan", "White"];
    }
    if (combined.includes('gray') || combined.includes('grey') || combined.includes('gris') || combined.includes('silver')) {
        return ["Gray", "Silver", "White"];
    }
    if (combined.includes('yellow') || combined.includes('amarillo') || combined.includes('citrine')) {
        return ["Yellow", "Cream", "Gold"];
    }
    
    // Default stone colors for Mexican Onyx
    return ["Cream", "Tan", "Brown"];
}

/**
 * On-device image processing: pixelates the extracted mask/image on a canvas,
 * extracts hex color of each non-transparent block, and returns the 2-3 most apparent colors.
 */
export async function extractDominantColorsFromImage(
    imageUrl?: string | null,
    material: string = '',
    title: string = '',
    color: string = ''
): Promise<ShopifyColor[]> {
    const fallbacks = getStoneStyleColors(material, title, color);
    if (!imageUrl || typeof window === 'undefined') {
        return fallbacks;
    }

    try {
        return await new Promise<ShopifyColor[]>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            
            const timeout = setTimeout(() => {
                resolve(fallbacks);
            }, 3000);

            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return resolve(fallbacks);

                    // Pixelate by downsampling to a small grid (25x25 blocks)
                    const gridW = 25;
                    const gridH = 25;
                    canvas.width = gridW;
                    canvas.height = gridH;

                    // Draw image scaled down (pixelation effect)
                    ctx.drawImage(img, 0, 0, gridW, gridH);
                    const imgData = ctx.getImageData(0, 0, gridW, gridH).data;

                    const colorCounts: Record<string, number> = {};
                    let validBlocks = 0;

                    for (let i = 0; i < imgData.length; i += 4) {
                        const r = imgData[i];
                        const g = imgData[i + 1];
                        const b = imgData[i + 2];
                        const a = imgData[i + 3];

                        // Ignore transparent or nearly transparent pixels (cutout background)
                        if (a < 50) continue;
                        
                        validBlocks++;

                        // Find closest color in our palette using weighted Euclidean distance
                        let minDist = Infinity;
                        let bestColor: ShopifyColor = "Cream";

                        for (const pal of COLOR_PALETTE) {
                            const [pr, pg, pb] = pal.rgb;
                            const dist = 0.3 * Math.pow(r - pr, 2) + 0.59 * Math.pow(g - pg, 2) + 0.11 * Math.pow(b - pb, 2);
                            if (dist < minDist) {
                                minDist = dist;
                                bestColor = pal.name;
                            }
                        }

                        colorCounts[bestColor] = (colorCounts[bestColor] || 0) + 1;
                    }

                    if (validBlocks === 0) {
                        return resolve(fallbacks);
                    }

                    // Sort identified colors by frequency
                    const sorted = Object.entries(colorCounts)
                        .sort((a, b) => b[1] - a[1])
                        .filter(([_, count]) => (count / validBlocks) >= 0.05) // at least 5% presence
                        .map(([col]) => col as ShopifyColor);

                    // Combine extracted colors with stone style fallbacks to ensure 2-3 colors
                    const combined = Array.from(new Set([...sorted, ...fallbacks])).slice(0, 3);
                    resolve(combined);
                } catch (e) {
                    resolve(fallbacks);
                }
            };

            img.onerror = () => {
                clearTimeout(timeout);
                resolve(fallbacks);
            };

            // Fix google drive url formatting if needed for image loading
            let cleanUrl = imageUrl;
            if (cleanUrl && cleanUrl.includes('google') && !cleanUrl.includes('export=view') && cleanUrl.includes('id=')) {
                const idMatch = cleanUrl.match(/id=([a-zA-Z0-9_-]+)/);
                if (idMatch) {
                    cleanUrl = `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w600`;
                }
            }

            img.src = cleanUrl;
        });
    } catch (e) {
        return fallbacks;
    }
}

/**
 * Generates a structured 1000-1200 character SEO-friendly marketing description in HTML format
 * based on available fields when AI generation hasn't been cached.
 */
export function generateFallbackMarketingHtml(itemData: any): string {
    const title = itemData.description || itemData.shortDescription || itemData.type || 'Artisanal Mexican Onyx Piece';
    const material = itemData.material ? itemData.material.charAt(0).toUpperCase() + itemData.material.slice(1) : 'Onyx';
    const shape = itemData.shape || 'Sculptural Form';
    const color = itemData.color || 'Natural Veining';
    const dimensions = itemData.dimensions || (itemData.lengthCm && itemData.widthCm ? `${itemData.lengthCm}x${itemData.widthCm}x${itemData.heightCm || 0} cm` : 'Custom Dimensions');
    const weight = itemData.weightKg ? `${itemData.weightKg} kg` : 'Solid Stone Weight';

    const p1 = `<p>Experience the timeless sophistication of our handcrafted <strong>${title}</strong>, a masterwork of natural Mexican artistry. Mined from the rich, mineral-dense quarries of Mexico, this exquisite piece is carved from authentic <strong>${material}</strong> featuring striking <strong>${color}</strong> tones and translucent crystalline banding. Each geological layer tells a multi-millennia story, ensuring that no two specimens in the world share the exact same veining pattern or coloration.</p>`;
    
    const p2 = `<p>Designed to elevate modern interior landscapes, luxury residences, and executive spaces, this <strong>${shape}</strong> serves as both a functional architectural element and a museum-grade focal point. When illuminated by ambient or natural lighting, the inherent translucency of authentic Mexican stone radiates a warm, captivating glow that transforms the atmosphere of any room, highlighting its organic polish and smooth contours.</p>`;
    
    const p3 = `<p>Our master artisans combine traditional hand-carving techniques with precision finishing to honor the natural structural integrity of the stone. Whether positioned as an anchor piece in a grand foyer, an executive desk accent, or a centerpiece for bespoke gallery collections, this creation embodies enduring durability and unmatched aesthetic grandeur. Invest in authentic, ethically sourced natural stone art that bridges geological wonder with refined luxury décor.</p>`;
    
    const list = `<ul><li><strong>Material:</strong> 100% Authentic Handcrafted Mexican ${material}</li><li><strong>Color Profile:</strong> ${color} with unique natural banding</li><li><strong>Form & Shape:</strong> Artisanal ${shape}</li><li><strong>Dimensions:</strong> Approximately ${dimensions}</li><li><strong>Weight:</strong> ${weight}</li><li><strong>Craftsmanship:</strong> Hand-carved and polished by master stone artisans in Mexico</li></ul>`;

    let html = `${p1}\n${p2}\n${p3}\n${list}`;
    
    // Ensure length is comfortably in the 1000-1200 character range
    if (html.length < 1000) {
        html += `\n<p>Bring the unmatched elegance of natural Mexican stone into your curated design space today.</p>`;
    } else if (html.length > 1300) {
        html = `${p1}\n${p2}\n${list}`;
    }

    return html;
}

export interface PixelationResult {
    bitmapDataUrl: string;
    hexString: string;
    dominantColors: ShopifyColor[];
    cols: number;
    rows: number;
}

/**
 * Generates a low-resolution high-pixelation bitmap with grid borders (e.g. 20x8 = 160px)
 * and extracts the pixel map as a comma-separated hexadecimal string.
 */
export async function generateBitmapAndHexMap(
    imageUrl?: string | null,
    cols = 20,
    rows = 8,
    pixelSize = 80,
    brightness = 149,
    contrast = 61,
    saturation = 199,
    material = '',
    title = '',
    color = ''
): Promise<PixelationResult> {
    const fallbacks = getStoneStyleColors(material, title, color);
    if (!imageUrl || typeof window === 'undefined') {
        return {
            bitmapDataUrl: '',
            hexString: Array(cols * rows).fill('#FFFFFF').join(','),
            dominantColors: fallbacks,
            cols,
            rows
        };
    }

    try {
        return await new Promise<PixelationResult>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';

            const timeout = setTimeout(() => {
                resolve({
                    bitmapDataUrl: '',
                    hexString: Array(cols * rows).fill('#FFFFFF').join(','),
                    dominantColors: fallbacks,
                    cols,
                    rows
                });
            }, 5000);

            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const aspect = img.width / Math.max(1, img.height);
                    const maxDim = Math.max(cols, rows) || 20;
                    let actualCols = cols;
                    let actualRows = rows;
                    if (aspect >= 1) {
                        actualCols = maxDim;
                        actualRows = Math.max(4, Math.round(maxDim / aspect));
                    } else {
                        actualRows = maxDim;
                        actualCols = Math.max(4, Math.round(maxDim * aspect));
                    }

                    // 1. Create small sampling canvas
                    const smallCanvas = document.createElement('canvas');
                    const smallCtx = smallCanvas.getContext('2d');
                    if (!smallCtx) throw new Error("No 2d context");

                    smallCanvas.width = actualCols;
                    smallCanvas.height = actualRows;
                    smallCtx.drawImage(img, 0, 0, actualCols, actualRows);
                    const imgData = smallCtx.getImageData(0, 0, actualCols, actualRows).data;

                    // 2. Prepare high-res output canvas for grid bitmap (e.g. 40px blocks)
                    const blockSize = Math.max(16, Math.round(pixelSize / 2));
                    const outCanvas = document.createElement('canvas');
                    const outCtx = outCanvas.getContext('2d')!;
                    outCanvas.width = actualCols * blockSize;
                    outCanvas.height = actualRows * blockSize;

                    const hexCodes: string[] = [];
                    const colorCounts: Record<string, number> = {};
                    let validBlocks = 0;

                    // Helper to format hex
                    const toHex = (n: number) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();

                    // Sliders math adjustments
                    const bOffset = (brightness - 100) * 1.2;
                    const cFactor = (259 * ((contrast - 50) * 2 + 255)) / (255 * (259 - (contrast - 50) * 2));
                    const sFactor = saturation / 100;

                    for (let r = 0; r < actualRows; r++) {
                        for (let c = 0; c < actualCols; c++) {
                            const idx = (r * actualCols + c) * 4;
                            let pr = imgData[idx];
                            let pg = imgData[idx + 1];
                            let pb = imgData[idx + 2];
                            const pa = imgData[idx + 3];

                            let hex = '#FFFFFF';
                            if (pa >= 50) {
                                // Apply Brightness
                                pr += bOffset; pg += bOffset; pb += bOffset;
                                // Apply Contrast
                                pr = cFactor * (pr - 128) + 128;
                                pg = cFactor * (pg - 128) + 128;
                                pb = cFactor * (pb - 128) + 128;
                                // Apply Saturation (simple luminance adjustment)
                                const gray = 0.2989 * pr + 0.5870 * pg + 0.1140 * pb;
                                pr = gray + (pr - gray) * sFactor;
                                pg = gray + (pg - gray) * sFactor;
                                pb = gray + (pb - gray) * sFactor;

                                hex = `#${toHex(pr)}${toHex(pg)}${toHex(pb)}`;
                                validBlocks++;

                                // Color palette matching for Shopify
                                let minDist = Infinity;
                                let bestColor: ShopifyColor = "Cream";
                                for (const pal of COLOR_PALETTE) {
                                    const [targetR, targetG, targetB] = pal.rgb;
                                    const dist = 0.3 * Math.pow(pr - targetR, 2) + 0.59 * Math.pow(pg - targetG, 2) + 0.11 * Math.pow(pb - targetB, 2);
                                    if (dist < minDist) {
                                        minDist = dist;
                                        bestColor = pal.name;
                                    }
                                }
                                colorCounts[bestColor] = (colorCounts[bestColor] || 0) + 1;
                            }

                            hexCodes.push(hex);

                            // Draw square on output canvas
                            outCtx.fillStyle = hex;
                            outCtx.fillRect(c * blockSize, r * blockSize, blockSize, blockSize);

                            // Draw black grid border around each pixel block (like in user screenshot)
                            outCtx.strokeStyle = '#000000';
                            outCtx.lineWidth = 2;
                            outCtx.strokeRect(c * blockSize, r * blockSize, blockSize, blockSize);
                        }
                    }

                    const bitmapDataUrl = outCanvas.toDataURL('image/webp', 0.9);
                    const hexString = hexCodes.join(',');

                    let dominantColors = fallbacks;
                    if (validBlocks > 0) {
                        const sorted = Object.entries(colorCounts)
                            .sort((a, b) => b[1] - a[1])
                            .filter(([_, count]) => (count / validBlocks) >= 0.05)
                            .map(([col]) => col as ShopifyColor);
                        dominantColors = Array.from(new Set([...sorted, ...fallbacks])).slice(0, 3);
                    }

                    resolve({
                        bitmapDataUrl,
                        hexString,
                        dominantColors,
                        cols: actualCols,
                        rows: actualRows
                    });
                } catch (e) {
                    resolve({
                        bitmapDataUrl: '',
                        hexString: Array(cols * rows).fill('#FFFFFF').join(','),
                        dominantColors: fallbacks,
                        cols,
                        rows
                    });
                }
            };

            img.onerror = () => {
                clearTimeout(timeout);
                resolve({
                    bitmapDataUrl: '',
                    hexString: Array(cols * rows).fill('#FFFFFF').join(','),
                    dominantColors: fallbacks,
                    cols,
                    rows
                });
            };

            let cleanUrl = imageUrl;
            if (cleanUrl && cleanUrl.includes('google') && !cleanUrl.includes('export=view') && cleanUrl.includes('id=')) {
                const idMatch = cleanUrl.match(/id=([a-zA-Z0-9_-]+)/);
                if (idMatch) {
                    cleanUrl = `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w600`;
                }
            }
            img.src = cleanUrl;
        });
    } catch (e) {
        return {
            bitmapDataUrl: '',
            hexString: Array(cols * rows).fill('#FFFFFF').join(','),
            dominantColors: fallbacks,
            cols,
            rows
        };
    }
}

