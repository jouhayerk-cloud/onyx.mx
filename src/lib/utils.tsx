

import { segmentationColors, SCRIPT_URL, vendors } from './consts';
import type { BoundingBoxMaskType } from './Types';
import type { UserRole } from './atoms';
import heic2any from 'heic2any';

export function resolveUserRole(email: string): UserRole {
  const adminEmails = ['martha@jouhayek.com'];
  const devEmails = ['ramses@jouhayerk.com'];
  const clientEmails = [
    'wayne@aissilver.com',
    'chad@rareearthgallerycc.com',
    'stefi@rareearthgallerycc.com',
    'accounting@aissilver.com'
  ];

  const normalizedEmail = email.toLowerCase().trim();

  if (devEmails.includes(normalizedEmail)) return 'Developer';
  if (adminEmails.includes(normalizedEmail)) return 'Admin';
  if (clientEmails.includes(normalizedEmail)) return 'Client';

  return 'Vendor';
}

export function generateUniqueId(): string {
  return Array.from({ length: 8 }, () => Math.random().toString(36).charAt(2)).join('').toUpperCase();
}
export function toTitleCase(str: string): string {
  if (!str) return '';
  return str.toString()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
export function getCrateDisplayName(crate: any, allCrates: any[], allInventory: any[], truckSeq?: number) {
    const vSet = new Set<string>();
    const contentSet = new Set<string>();
    
    // 1. Collect vendors from explicit field
    if (crate.vendors) {
        crate.vendors.split(',').forEach((v: string) => {
            const trimmed = v.trim().toUpperCase();
            if (trimmed) vSet.add(trimmed);
        });
    }

    // 2. Collect from items
    if (crate.inventory_ids) {
        crate.inventory_ids.split(',').filter(Boolean).forEach((e: string) => {
            const [id] = e.split(':');
            const inv = allInventory.find((i: any) => String(i.row) === id);
            if (inv?.data) { 
                const p = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0]; 
                if (p) vSet.add(p.toUpperCase()); 
                
                // Track content types for subtitling
                const content = inv.data.shape || inv.data.shortDescription;
                if (content) contentSet.add(content.toUpperCase());
            }
        });
    }

    if (vSet.size === 0 && crate.vendor_id) {
        vSet.add(crate.vendor_id.toUpperCase());
    }

    const vendorList = Array.from(vSet).sort();
    
    // CONTENT BASED SUBTITLE LOGIC
    // Combine unit type (CRATE/PALLET) with specific content types
    const contentList = Array.from(contentSet).sort();
    const unitType = (crate.type || 'UNIT').toUpperCase();
    const contentSubtitle = contentList.length > 0 
        ? `${unitType} / ${contentList.slice(0, 2).join(' | ')}` 
        : unitType;

    const vendorCodes = vendorList.map(v => {
        if (v.length >= 2) return v.toUpperCase();
        const full = (vendors as any)[v]?.name || v;
        return full.slice(0, 2).toUpperCase();
    }).join('&');

    // PRIORITIZE DATABASE SAVED LABEL
    const primaryLabel = crate.label || crate.name || vendorCodes || (crate.type || 'UNIT').toUpperCase();
    const sequenceId = crate.id ? crate.id.substring(0, 4).toUpperCase() : '00';

    if (truckSeq != null) {
        return { 
            label: crate.label || `${primaryLabel}-${String(truckSeq).padStart(2, '0')}`, 
            subtitle: contentSubtitle, 
            vendorList 
        };
    }
    
    return {
        label: crate.label || `${primaryLabel}-${sequenceId}`,
        subtitle: contentSubtitle,
        vendorList
    };
}

export function formatCurrency(amount: number | string, currency: string = 'MXN'): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

import { uploadMedia } from './storage';

export async function handleFileUpload(file: File, user: any): Promise<{ fileId: string; thumbnailUrl: string; originalFile: File } | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        console.log(`[Drive] Uploading ${file.name} (${Math.round(file.size / 1024)}KB) using action: uploadMedia...`);
        const base64Data = (reader.result as string).split(',')[1];
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          mode: 'cors',
          cache: 'no-cache',
          body: JSON.stringify({
            action: 'uploadMedia',
            fileName: file.name,
            mimeType: file.type,
            base64: base64Data,
            user
          }),
        });

        if (!response.ok) throw new Error(`Network response error: ${response.status}`);

        const result = await response.json();
        if (result.status === 'success') {
          console.log(`[Drive] Successfully uploaded: ${result.fileId}`);
          resolve({
            fileId: result.fileId,
            thumbnailUrl: result.url || `https://drive.google.com/uc?export=view&id=${result.fileId}`,
            originalFile: file
          });
        } else {
          throw new Error(result.message || 'Drive Upload failed');
        }
      } catch (error) {
        console.error('Drive upload error:', error);
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
  });
}

export function extractFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  const sForm = String(url);

  const patterns = [
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]{10,})/,
    /docs\.google\.com\/.*id=([a-zA-Z0-9_-]{10,})/
  ];

  for (const p of patterns) {
    const m = sForm.match(p);
    if (m && m[1]) return m[1];
  }
  
  // Fallback: if it looks like just an ID
  if (/^[a-zA-Z0-9_-]{15,}$/.test(sForm)) return sForm;

  return null;
}

export function getCleanImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const sForm = String(url);

  let clean = sForm.split('&tag=')[0].trim();

  const fileId = extractFileId(clean);
  if (fileId && clean.toLowerCase().includes('drive.google.com')) {
    if (isVideoFile(clean)) {
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
    }
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }

  return clean;
}

/**
 * Robustly collects all unique images from every possible field (including legacy ones).
 */
export function collectAllImages(normData: any): string[] {
  if (!normData) return [];
  
  const collect = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.flatMap(v => collect(v));
    // Split by comma or semicolon (legacy data sometimes uses semicolon)
    return String(val).split(/[,;]/).map(v => v.trim()).filter(Boolean);
  };

  const rawUrls = [
    ...collect(normData.mediaUrls),
    ...collect(normData.generatedImageUrls),
    ...collect(normData.image_url),
    ...collect(normData.item_image),
    ...collect(normData.imageUrl),
    ...collect(normData.itemImage),
    normData.generatedPngUrl
  ].filter(Boolean).map(u => String(u).trim()).filter(Boolean);
  
  // Deduplicate AFTER cleaning to catch identical visuals with different tracking tags
  const cleanedUrls = rawUrls.map(u => getCleanImageUrl(u)).filter(Boolean) as string[];
  return Array.from(new Set(cleanedUrls));
}

export const isVideoMime = (mime: string) => mime?.startsWith('video/');
export const isVideoFile = (fileName: string) => {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  return ['mov', 'mp4', 'webm', 'ogg', 'm4v'].includes(ext || '');
};

export async function generateVideoThumbnail(videoSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = videoSrc;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;

    const timeout = setTimeout(() => {
      video.src = '';
      reject(new Error('Thumbnail generation timeout'));
    }, 5000);

    video.onloadedmetadata = () => {
      video.currentTime = 0.5;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.7);
        video.src = '';
        resolve(data);
      } else {
        reject(new Error('Canvas context failed'));
      }
    };

    video.onerror = (e) => {
      clearTimeout(timeout);
      reject(new Error('Video load failed for thumbnail'));
    };
  });
}

export const imageCache = new Map<string, string>();

let imageRequestQueue = new Set<string>();
let promiseResolvers = new Map<string, { resolve: (data: any) => void, reject: (reason?: any) => void }[]>();
let batchTimeout: number | null = null;

const BATCH_DELAY = 50; // ms

async function processImageBatch() {
  if (imageRequestQueue.size === 0) return;

  const fileIds = Array.from(imageRequestQueue);
  imageRequestQueue.clear();
  batchTimeout = null;

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'batchGetImageBase64FromDriveIds', fileIds }),
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const result = await response.json();
    if (result.status !== 'success') throw new Error(result.message);

    fileIds.forEach(fileId => {
      const data = result.data[fileId];
      const resolvers = promiseResolvers.get(fileId);
      if (resolvers) {
        if (data && !data.error) {
          resolvers.forEach(({ resolve }) => resolve(data));
        } else {
          const errorMsg = data ? data.error : 'Image not found in batch response';
          resolvers.forEach(({ reject }) => reject(new Error(errorMsg)));
        }
        promiseResolvers.delete(fileId);
      }
    });
  } catch (error) {

    fileIds.forEach(fileId => {
      const resolvers = promiseResolvers.get(fileId);
      if (resolvers) {
        resolvers.forEach(({ reject }) => reject(error as any));
        promiseResolvers.delete(fileId);
      }
    });
    console.error("Image batch request failed:", error);
  }
}

export function fetchImageBatch(fileId: string): Promise<{ base64: string, mimeType: string }> {
  return new Promise((resolve, reject) => {
    if (!promiseResolvers.has(fileId)) {
      promiseResolvers.set(fileId, []);
    }
    promiseResolvers.get(fileId)!.push({ resolve, reject });
    imageRequestQueue.add(fileId);

    if (batchTimeout) {
      clearTimeout(batchTimeout);
    }
    batchTimeout = window.setTimeout(processImageBatch, BATCH_DELAY);
  });
}

export function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return '';

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q'],
  );

  d.push('Z');
  return d.join(' ');
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise(async (resolve, reject) => {
    if (!src) {
      reject(new Error('Image source is null or empty.'));
      return;
    }

    let finalSrc = src;

    // HEIC/HEIF Support
    if (src.toLowerCase().includes('.heic') || src.toLowerCase().includes('.heif')) {
      try {
        console.log(`[Engine] HEIC Detected: Converting ${src.split('/').pop()} to compatible JPEG...`);
        const response = await fetch(src);
        const blob = await response.blob();
        const converted = await heic2any({
          blob,
          toType: 'image/jpeg',
          quality: 0.8
        });
        const resultBlob = Array.isArray(converted) ? converted[0] : converted;
        finalSrc = URL.createObjectURL(resultBlob);
        console.log(`[Engine] Conversion Complete.`);
      } catch (heicErr: any) {
        console.error("HEIC conversion failed:", heicErr);
      }
    }

    if (!finalSrc || (finalSrc.startsWith('data:image') && finalSrc.length < 128)) {
      return reject(new Error("Invalid or truncated image data provided to engine."));
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous'; // Allow loading from other domains for canvas

    // Safety Timeout: Prevent browser hang on malformed data URLs/Network issues
    const timeoutId = setTimeout(() => {
      img.src = '';
      reject(new Error("Image load timed out (10s limit)"));
    }, 10000);

    img.onload = () => {
      clearTimeout(timeoutId);
      resolve(img);
    };
    img.onerror = (e) => {
      clearTimeout(timeoutId);
      const errorMsg = `Failed to load image resource.`;
      console.error(errorMsg, e, finalSrc ? finalSrc.substring(0, 100) : 'null src');
      reject(new Error(errorMsg));
    };
    img.src = finalSrc;
  });
}

export function resizeImage(
  dataUrl: string,
  maxDimension: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const { width, height } = img;
      const targetSize = maxDimension;
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get 2D context for image resize.'));
      }
      
      // Black background for padding
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, targetSize, targetSize);

      let drawW, drawH;
      if (width > height) {
        drawW = targetSize;
        drawH = Math.round(height * (targetSize / width));
      } else {
        drawH = targetSize;
        drawW = Math.round(width * (targetSize / height));
      }

      const offsetX = (targetSize - drawW) / 2;
      const offsetY = (targetSize - drawH) / 2;
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      reject(new Error('Failed to load image for resizing.'));
    };
    img.src = dataUrl;
  });
}

export function cropImage(
  src: string, 
  x: number, y: number, w: number, h: number, 
  targetSize: number = 1024
): Promise<string> {
  return new Promise(async (resolve) => {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d')!;
    
    // Calculate dimensions in original pixels
    const sx = x * img.width;
    const sy = y * img.height;
    const sw = w * img.width;
    const sh = h * img.height;
    
    // Add context padding (15%) to avoid edge artifacts
    const px = sw * 0.15;
    const py = sh * 0.15;
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.drawImage(
      img, 
      Math.max(0, sx - px), Math.max(0, sy - py), 
      sw + (2 * px), sh + (2 * py), 
      0, 0, targetSize, targetSize
    );
    resolve(canvas.toDataURL('image/jpeg', 0.9));
  });
}

export function hash(): Record<string, string> {
  const hashVal = window.location.hash.substring(1);
  const params: Record<string, string> = {};
  if (hashVal) {
    hashVal.split('&').forEach((hk) => {
      const temp = hk.split('=', 2); // Split into at most 2 parts.
      if (temp[0]) {
        params[temp[0]] = temp[1] ? decodeURIComponent(temp[1]) : '';
      }
    });
  }
  return params;
}

export function findContour(imageData: ImageData): { x: number; y: number }[] {
  const { data, width, height } = imageData;
  let start: { x: number; y: number } | null = null;

  for (let y = 0; y < height && !start; y++) {
    for (let x = 0; x < width && !start; x++) {
      if (data[(y * width + x) * 4] > 128) {
        start = { x, y };
      }
    }
  }

  if (!start) return [];

  const contour: { x: number; y: number }[] = [];
  let p = start;
  let dir = 0;
  const offsets = [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
  ];

  let count = 0;
  const maxCount = width * height;

  do {
    contour.push({ x: p.x, y: p.y });
    let s_dir = (dir + 5) % 8;
    let foundNext = false;

    for (let i = 0; i < 8; i++) {
      dir = (s_dir + i) % 8;
      const offset = offsets[dir];
      let q = { x: p.x + offset.x, y: p.y + offset.y };

      if (
        q.x >= 0 &&
        q.x < width &&
        q.y >= 0 &&
        q.y < height &&
        data[(q.y * width + q.x) * 4] > 128
      ) {
        p = q;
        foundNext = true;
        break;
      }
    }
    if (!foundNext) break;
    if (++count > maxCount) {
      console.warn('Contour trace exceeded max iterations, breaking.');
      break;
    }
  } while (p.x !== start.x || p.y !== start.y);

  return contour;
}

export function simplifyContour(
  points: { x: number; y: number }[],
  tolerance: number,
): { x: number; y: number }[] {
  if (points.length <= 2) return points;

  const perpendicularDistance = (
    point: { x: number; y: number },
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number },
  ) => {
    let dx = lineEnd.x - lineStart.x;
    let dy = lineEnd.y - lineStart.y;
    if (dx === 0 && dy === 0) {
      return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
    }
    let t =
      ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) /
      (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    const closestX = lineStart.x + t * dx;
    const closestY = lineStart.y + t * dy;
    return Math.hypot(point.x - closestX, point.y - closestY);
  };

  let firstPoint = points[0];
  let lastPoint = points[points.length - 1];
  let index = -1;
  let maxDist = 0;

  for (let i = 1; i < points.length - 1; i++) {
    let dist = perpendicularDistance(points[i], firstPoint, lastPoint);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    let recResults1 = simplifyContour(points.slice(0, index + 1), tolerance);
    let recResults2 = simplifyContour(points.slice(index), tolerance);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [firstPoint, lastPoint];
  }
}

export function createCurvePath(points: { x: number; y: number }[]): string {
  if (points.length < 3) {
    if (points.length < 1) return '';
    let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
    }
    return d + ' Z';
  }

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    path += ` Q ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}, ${midPoint.x.toFixed(2)} ${midPoint.y.toFixed(2)}`;
  }
  path += ' Z';
  return path;
}

export const readFileAsDataURL = (file: File, type: 'image' | 'video', forAI = false) =>
  new Promise<string>(async (resolve, reject) => {
    if (type === 'video') {
      try {
        const url = URL.createObjectURL(file);
        const thumb = await generateVideoThumbnail(url);
        resolve(thumb);
      } catch (e) {
        console.warn("Video thumbnail failed:", e);
        resolve(URL.createObjectURL(file));
      }
      return;
    }

    if (forAI && type === 'image') {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target!.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => reject(new Error('AI Image processing failed'));
      };
      reader.onerror = () => reject(new Error('File reading failed'));
    } else {
      resolve(URL.createObjectURL(file));
    }
  });

export const useNativePreview = (file: File) => URL.createObjectURL(file);

export const getTextColorForBg = (hexColor: string | undefined): string => {
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
};

export const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    }
    : null;
};
export const rgbToHex = (r: number, g: number, b: number) =>
  '#' +
  [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
export const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s,
    l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
};
export const hslToRgb = (h: number, s: number, l: number) => {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
};

export const processSelectionPixelData = (
  imageData: ImageData,
  rectWidth: number,
  rectHeight: number,
  direction: 'horizontal' | 'vertical',
) => {
  const data = imageData.data,
    palette = [],
    numSamples = 24;
  for (let i = 0; i < numSamples; i++) {
    const x =
      direction === 'horizontal'
        ? Math.floor((rectWidth / numSamples) * (i + 0.5))
        : Math.floor(rectWidth / 2);
    const y =
      direction === 'vertical'
        ? Math.floor((rectHeight / numSamples) * (i + 0.5))
        : Math.floor(rectHeight / 2);
    const idx = (y * Math.floor(rectWidth) + x) * 4;
    const [r, g, b, a] = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    if (a < 250) continue;
    let { h, s, l } = rgbToHsl(r, g, b);
    s = Math.min(1, s * 1.2);
    l = 0.1 + l * 0.8;
    const newRgb = hslToRgb(h, s, l);
    palette.push(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
  }
  return palette;
};

export const applyGradientAdjustments = (
  originalPalette: string[],
  brightness: number,
  temperature: number,
  saturation: number,
) => {
  return originalPalette.map((hex) => {
    if (!hex) return '#ffffff';
    let rgb = hexToRgb(hex);
    if (!rgb) return '#ffffff';
    let hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.l = Math.max(0, Math.min(1, hsl.l + brightness / 200));
    hsl.s = Math.max(0, Math.min(1, hsl.s + saturation / 200));
    rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    rgb.r = Math.max(0, Math.min(255, rgb.r + temperature));
    rgb.b = Math.max(0, Math.min(255, rgb.b - temperature));
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  });
};

export async function extractGradientFromMask(
  imageSrc: string,
  mask: BoundingBoxMaskType,
  imageDimensions: { width: number; height: number },
): Promise<string> {
  if (!imageSrc || !mask || !mask.path) {
    return '';
  }

  try {
    const image = await loadImage(imageSrc);
    const canvas = document.createElement('canvas');
    canvas.width = imageDimensions.width;
    canvas.height = imageDimensions.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';

    ctx.drawImage(image, 0, 0, imageDimensions.width, imageDimensions.height);

    const path = new Path2D(mask.path);
    const matrix = new DOMMatrix();
    const finalW = mask.width * imageDimensions.width;
    const finalH = mask.height * imageDimensions.height;
    const finalX = mask.x * imageDimensions.width;
    const finalY = mask.y * imageDimensions.height;
    matrix.translateSelf(finalX, finalY);
    matrix.scaleSelf(finalW / mask.maskWidth, finalH / mask.maskHeight);
    const transformedPath = new Path2D();
    transformedPath.addPath(path, matrix);

    const bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    if (mask.points && mask.points.length > 0) {
      mask.points.forEach((p) => {
        const transformed = new DOMPoint(p.x, p.y).matrixTransform(matrix);
        bounds.minX = Math.min(bounds.minX, transformed.x);
        bounds.minY = Math.min(bounds.minY, transformed.y);
        bounds.maxX = Math.max(bounds.maxX, transformed.x);
        bounds.maxY = Math.max(bounds.maxY, transformed.y);
      });
    } else {
      bounds.minX = finalX;
      bounds.minY = finalY;
      bounds.maxX = finalX + finalW;
      bounds.maxY = finalY + finalH;
    }

    const sampleWidth = bounds.maxX - bounds.minX;
    const centerY = bounds.minY + (bounds.maxY - bounds.minY) / 2;

    const palette: string[] = [];
    const numSamples = 24;
    for (let i = 0; i < numSamples; i++) {
      const x = Math.round(bounds.minX + (sampleWidth / numSamples) * (i + 0.5));
      const y = Math.round(centerY);

      if (ctx.isPointInPath(transformedPath, x, y)) {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const [r, g, b, a] = pixel;

        if (a > 200) {
          let { h, s, l } = rgbToHsl(r, g, b);
          s = Math.min(1, s * 1.2);
          l = 0.1 + l * 0.8;
          const newRgb = hslToRgb(h, s, l);
          palette.push(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
        }
      }
    }

    if (palette.length < 2) {
      return palette.length === 1 ? palette[0] : '';
    }

    return `linear-gradient(90deg, ${palette.join(', ')})`;
  } catch (error) {
    console.error('Error extracting gradient:', error);
    return '';
  }
}

export const numberToCypher = (num: number): string => {

  const key = (import.meta.env.VITE_CYPHER_KEY as string) || 'DMOXHELFAN';
  if (!key || key.length < 10) return '—';

  return String(Math.floor(num))
    .split('')
    .map(digit => key[parseInt(digit, 10)] || '')
    .join('');
};

export const normalizeInventoryData = (data: any): any => {
  if (!data) return {};
  const d = data;
  return {
    ...d,
    itemId: d.item_id ?? d.itemId,
    vendorId: d.vendor_id || d.vendorId || (String(d.item_id || d.itemId || '').includes('-') ? String(d.item_id || d.itemId || '').split('-')[0] : ''),
    itemNumber: d.item_number ?? d.itemNumber,
    shape: d.shape,
    material: d.material,
    description: d.description,
    color: d.color,
    workbook: d.workbook,
    shortDescription: d.short_description || d.shortDescription,
    generatedPngUrl: d.generated_png_url || d.generatedPngUrl,
    generatedSvgUrl: d.generated_svg_url || d.generatedSvgUrl,
    spatialMasks: d.spatial_masks || d.spatialMasks,
    spatialBoxes2d: d.spatial_boxes_2d || d.spatialBoxes2d,
    spatialPoints: d.spatial_points || d.spatialPoints,
    generatedDescription: d.generated_description || d.generatedDescription,
    generatedImageUrls: d.generated_image_urls || d.generatedImageUrls,
    mediaUrls: d.media_urls || d.mediaUrls,
    imageUrl: d.image_url || d.imageUrl,
    itemImage: d.item_image || d.itemImage,
    payDate: d.pay_date || d.payDate,
    payReq: d.pay_req || d.payReq,
    payment_ids: d.payment_ids || d.paymentIds,
    sentDate: d.sent_date || d.sentDate,
    sentManifestId: d.sent_manifest_id || d.sentManifestId,
    printDate: d.print_date || d.printDate,
    isClientVisible: d.is_client_visible || d.isClientVisible,
    rating: d.rating ?? 0,
    is_hidden: d.is_hidden ?? false,
    hidden_reason: d.hidden_reason || d.hiddenReason || '',
    dispersal_status: d.dispersal_status,
    book_barcode: d.book_barcode || d.bookBarcode || d.tag_id || d.item_id || d.itemId || d.item_number || '',
    book_aq_code: d.book_aq_code || d.bookAqCode || d.aq_code || '-',
    price: d.price_mxn || d.acquisition_price_mxn || d.acq_price_mxn || d.price_unit || d.price || d.cost_mxn || d.cost || 0,
    width_cm: d.width_cm || d.widthCm || d.width || d.w,
    height_cm: d.height_cm || d.heightCm || d.height || d.h,
    length_cm: d.length_cm || d.lengthCm || d.length || d.l,
    weight_kg: d.weight_kg || d.weightKg || d.weight || d.wt,
    dims: d.dims || [d.width_cm || d.widthCm || d.width || d.w, d.height_cm || d.heightCm || d.height || d.h, d.length_cm || d.lengthCm || d.length || d.l].filter(Boolean).join('×'),
    // Add camelCase aliases for backward compatibility
    widthCm: d.width_cm || d.widthCm || d.width || d.w,
    heightCm: d.height_cm || d.heightCm || d.height || d.h,
    lengthCm: d.length_cm || d.lengthCm || d.length || d.l,
    weightKg: d.weight_kg || d.weightKg || d.weight || d.wt,
  };
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const onyxRound = (n: number) => {
  const floor = Math.floor(n);
  return (n - floor >= 0.4) ? floor + 1 : floor;
};

export const calculateCodesAndPrices = (data: any, exchangeRate: number, workbookPrefix: string) => {
  const norm = normalizeInventoryData(data);
  const costMxn = round2(parseFloat(norm.price) || 0);
  
  if (costMxn === 0 || !exchangeRate || isNaN(exchangeRate)) {
    return {
      bookAcquisition: '-',
      bookLanded: '-',
      bookRetail: '-',
      bookAqCode: '-',
      bookLandCode: '-',
      bookBarcode: '-',
      bookBarcodeDisplay: '-',
      bookBardcode: '-', // Legacy typo alias
      vendorColor: '#555',
    };
  }

  try {
    // Formula: Acquisition USD = MXN Price / Rate
    const costUsd     = round2(costMxn / exchangeRate);
    // Formula: Landed USD = Acquisition USD * 1.4
    const landedCost  = round2(costUsd * 1.4);
    // Formula: Retail USD = Landed USD * 12
    const retailPrice = round2(landedCost * 12);

    // Codes are based on the custom rounded integer value of USD costs (.40 threshold)
    const costUsdRounded    = onyxRound(costUsd);
    const landedCostRounded = onyxRound(landedCost);

    const rawId = (norm.vendorId || norm.itemId || norm.tag_id || '').toUpperCase();
    const vendorPrefix = rawId.split('-')[0] || rawId.substring(0, 2);
    const vendorData = (vendors as any)[vendorPrefix] || (vendors as any)[rawId.substring(0, 2)] || (vendors as any)[rawId.substring(0, 1)];
    
    const bookStr = String(norm.workbook || workbookPrefix).replace(/v/gi, '');
    const itemCountNumber = parseInt(norm.itemNumber, 10) || 1;
    const itemCountStr = itemCountNumber.toString();

    const cypherString = isNaN(landedCostRounded) ? 'XXXX' : numberToCypher(landedCostRounded);
    const newTagId = `${vendorPrefix}${bookStr}${itemCountStr}${cypherString}`;
    const displayTagId = `${vendorPrefix}${bookStr} ${itemCountStr}${cypherString}`;

    return {
      bookAcquisition: isNaN(costUsd) ? '-' : onyxRound(costUsd).toString(),
      bookLanded:   isNaN(landedCost) ? '-' : onyxRound(landedCost).toString(),
      bookRetail:   isNaN(retailPrice) ? '-' : onyxRound(retailPrice).toString(),
      bookAqCode:   isNaN(costUsdRounded) ? '-' : numberToCypher(costUsdRounded),
      bookLandCode: cypherString,
      bookBarcode: newTagId,
      bookTagId: norm.itemId || '-', // The original workbook tag ID (e.g. EM-001-T)
      bookBarcodeDisplay: displayTagId,
      bookBardcode: newTagId, // Legacy typo alias
      vendorColor: vendorData?.color || '#555',
      acquisitionCostMxn: costMxn
    };
  } catch (e) {
    console.error('calculateCodesAndPrices error:', e);
    return {
      bookAcquisition: '-',
      bookLanded: '-',
      bookRetail: '-',
      bookAqCode: '-',
      bookLandCode: '-',
      bookBarcode: '-',
      bookBarcodeDisplay: '-',
      bookBardcode: '-',
      vendorColor: '#555',
    };
  }
};

/**
 * Logistics Volume & Unit Calculators
 */

export const formatWeightMetricOnly = (kg: any): string => {
  const val = parseFloat(kg);
  return (val && !isNaN(val)) ? `${val}kg` : '';
};

export const formatWeightImperialOnly = (kg: any): string => {
  const val = parseFloat(kg);
  if (!val || isNaN(val)) return '';
  const lbs = (val * 2.20462).toFixed(1);
  return `${lbs} lbs`;
};

export const cmToImperial = (cm: number | string | undefined): string => {
  const val = typeof cm === 'string' ? parseFloat(cm) : cm;
  if (val === undefined || val === null || isNaN(val) || val === 0) return '';
  
  const totalInches = val / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  const wholeInches = Math.floor(inches);
  const fractionalInches = inches - wholeInches;
  
  let sixteenths = Math.round(fractionalInches * 16);
  let finalFeet = feet;
  let finalInches = wholeInches;
  
  if (sixteenths === 16) {
    finalInches += 1;
    sixteenths = 0;
  }
  if (finalInches === 12) {
    finalFeet += 1;
    finalInches = 0;
  }

  let num = sixteenths;
  let den = 16;
  if (num > 0) {
    while (num % 2 === 0 && den % 2 === 0) {
      num /= 2; den /= 2;
    }
  }

  const ftPart = finalFeet > 0 ? `${finalFeet}' ` : '';
  const inPart = `${finalInches}${num > 0 ? ` ${num}/${den}` : ''}"`;
  
  return `${ftPart}${inPart}`.trim();
};

export const formatCmToFeetIn = (cm: any): string => {
  return cmToImperial(cm);
};

export const formatDimensionsMetricOnly = (w: any, h: any, l: any): string => {
  const parts = [w, h, l].filter(p => p !== undefined && p !== null && p !== '');
  return parts.length > 0 ? parts.join('x') + 'cm' : '';
};

export const formatDimensionsImperialOnly = (w: any, h: any, l: any): string => {
  const parts = [w, h, l].filter(p => p !== undefined && p !== null && p !== '');
  if (parts.length === 0) return '';
  const imperial = parts.map(p => formatCmToFeetIn(p)).join(' x ');
  return imperial;
};

export const formatWeightImperial = (kg: any): string => {
  const val = parseFloat(kg);
  if (!val || isNaN(val)) return '';
  const lbs = (val * 2.20462).toFixed(1);
  return `${val}kg (${lbs} lbs)`;
};

export const formatDimensionsImperial = (w: any, h: any, l: any): string => {
  const parts = [w, h, l].filter(p => p !== undefined && p !== null && p !== '');
  if (parts.length === 0) return '';
  const metric = parts.join('x') + 'cm';
  const imperial = parts.map(p => formatCmToFeetIn(p)).join(' x ');
  return `${metric} (${imperial})`;
};

/**
 * Calculates the internal volume of a crate or pallet in cm3.
 * For now, we assume net internal is 100% of external dimensions for calculation.
 */
export const getCrateInternalVolume = (crate: { width_cm?: number; length_cm?: number; height_cm?: number }) => {
  return (crate.width_cm || 0) * (crate.length_cm || 0) * (crate.height_cm || 0);
};

/**
 * Calculates the padded volume of an item (including packing material) in cm3.
 * factor = 1.15 (15% padding)
 */
export const getItemPaddedVolume = (itemData: any, qty: number = 1) => {
  const norm = normalizeInventoryData(itemData);
  const w = parseFloat(norm.width_cm || norm.widthCm || 0);
  const l = parseFloat(norm.length_cm || norm.lengthCm || 0);
  const h = parseFloat(norm.height_cm || norm.heightCm || 0);
  const itemVol = w * l * h;
  return itemVol * qty * 1.15; // 15% packing material padding
};

export async function generatePngAndSvgFromMasks(
  imageSrc: string | null,
  imageDimensions: { width: number; height: number },
  masksToExport: BoundingBoxMaskType[],
): Promise<{ pngData: string | null; svgData: string | null }> {
  if (!imageSrc || masksToExport.length === 0) {
    return { pngData: null, svgData: null };
  }

  const image = await loadImage(imageSrc);
  const { width, height } = imageDimensions;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  masksToExport.forEach((mask) => {
    const maskX = mask.x * width;
    const maskY = mask.y * height;
    const maskW = mask.width * width;
    const maskH = mask.height * height;
    if (maskX < minX) minX = maskX;
    if (maskY < minY) minY = maskY;
    if (maskX + maskW > maxX) maxX = maskX + maskW;
    if (maskY + maskH > maxY) maxY = maskY + maskH;
  });

  const cropWidth = maxX - minX;
  const cropHeight = maxY - minY;

  if (cropWidth <= 0 || cropHeight <= 0) {
    return { pngData: null, svgData: null }; // No valid area to crop
  }

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = cropWidth;
  exportCanvas.height = cropHeight;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  const clippingPath = new Path2D();
  for (const mask of masksToExport) {
    const finalW = mask.width * width;
    const finalH = mask.height * height;
    const finalX = mask.x * width;
    const finalY = mask.y * height;

    const path = new Path2D(mask.path);
    const matrix = new DOMMatrix();

    matrix.translateSelf(finalX - minX, finalY - minY);
    matrix.scaleSelf(finalW / mask.maskWidth, finalH / mask.maskHeight);
    clippingPath.addPath(path, matrix);
  }
  ctx.clip(clippingPath);
  ctx.filter = 'blur(0.5px)'; // Subtle edge softening

  ctx.drawImage(
    image,
    minX, // source x
    minY, // source y
    cropWidth, // source width
    cropHeight, // source height
    0, // target x
    0, // target y
    cropWidth, // target width
    cropHeight, // target height
  );

  const pngData = exportCanvas.toDataURL('image/png');

  let finalImageSrc = imageSrc;
  if (!imageSrc.startsWith('data:')) {
    const imgCanvas = document.createElement('canvas');
    imgCanvas.width = width;
    imgCanvas.height = height;
    const imgCtx = imgCanvas.getContext('2d')!;
    imgCtx.drawImage(image, 0, 0);
    finalImageSrc = imgCanvas.toDataURL();
  }

  let maskContent = '<g id="segmentation-masks">';
  masksToExport.forEach((mask, i) => {
    const color = segmentationColors[i % segmentationColors.length];
    const finalW = mask.width * width;
    const finalH = mask.height * height;
    const finalX = mask.x * width;
    const finalY = mask.y * height;
    const transform = `translate(${finalX}, ${finalY}) scale(${finalW / mask.maskWidth
      }, ${finalH / mask.maskHeight})`;
    maskContent += `<path d="${mask.path}" style="fill:${color};fill-opacity:0.5;" transform="${transform}" />`;
  });
  maskContent += '</g>';

  const svgData = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <image href="${finalImageSrc}" x="0" y="0" width="${width}" height="${height}" />
      ${maskContent}
    </svg>`;

  return { pngData, svgData };
}

export const getStatusClass = (item: any, partialPayIds?: Set<string>, fullPayIds?: Set<string>, requestedAcqIds?: Set<string>): 'RED' | 'YELLOW' | 'GREEN' | 'BLUE' | 'PURPLE' | null => {
  if (!item) return null;
  const payReqStr = String(item.payReq || item.pay_req || '').toLowerCase();
  const statusStr = String(item.status || item.item_status || '').toLowerCase();
  const dispStatus = String(item.dispersal_status || '').toLowerCase();
  
  // 0. Book 825 Override (Always Green)
  const workbook = String(item.workbook || item.data?.workbook || '').toLowerCase();
  const payReq = String(item.payReq || item.pay_req || item.data?.payReq || item.data?.pay_req || '').toLowerCase();
  if (workbook === 'v825' || workbook === '825' || payReq === 'prepaid' || payReq === 'paid') return 'GREEN';

  // 1. Precise status from calculation sets (highest priority)
  if (partialPayIds?.has(String(item.id))) return 'RED';
  if (fullPayIds?.has(String(item.id))) return 'GREEN';
  if (requestedAcqIds?.has(String(item.id))) return 'YELLOW';

  // 2. Fallback to item fields (Legacy or direct field check)
  if (item.payDate || item.pay_date || payReqStr === 'paid' || payReqStr === 'prepaid' || dispStatus === 'dispersed') return 'GREEN';
  
  if (payReqStr.includes('%') || payReqStr === 'partial') return 'RED';

  if (payReqStr === 'requested' || payReqStr === 'true' || statusStr === 'requested' || dispStatus === 'requested' || dispStatus === 'sent') {
    const isAcq = String(item.status || item.item_status || '').toLowerCase() === 'acquisition';
    return isAcq ? 'YELLOW' : 'RED';
  }

  // 5. Default: check for price/qty
  const qty = parseInt(String(item.quantity || 1));
  const price = parseFloat(String(item.price || 0));
  if (price > 0 && qty > 0 && statusStr === 'acquired') return 'PURPLE';
  if (price > 0 && qty > 0) return 'BLUE';
  return 'BLUE';
};
