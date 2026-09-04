

import { segmentationColors, SCRIPT_URL, vendors , DEFAULT_EXCHANGE_RATE} from './consts';
import type { BoundingBoxMaskType } from './Types';
import type { UserRole } from './atoms';
import { supabase } from './supabase';
import heic2any from 'heic2any';
export { reconstructRgbPixelMap, type RgbPixel, type ReconstructedPixelMap } from './colorExtractor';

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

    const vendorCodes = vendorList
        .filter(v => !['JUAN', 'SIMONA'].includes(v.toUpperCase()))
        .map(v => {
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
  if (file.type.startsWith('video/')) {
    try {
      console.log(`[Supabase] Uploading video ${file.name} (${Math.round(file.size / 1024 / 1024)}MB)...`);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { data, error } = await supabase.storage.from('inventory-media').upload(`videos/${fileName}`, file, {
        cacheControl: '3600',
        upsert: false
      });
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage.from('inventory-media').getPublicUrl(`videos/${fileName}`);
      
      console.log(`[Supabase] Successfully uploaded video: ${publicUrl}`);
      return {
        fileId: fileName,
        thumbnailUrl: publicUrl,
        originalFile: file
      };
    } catch (error) {
      console.error('Supabase video upload error:', error);
      throw error;
    }
  }

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

export async function handleProcessedFileUpload(base64Data: string, fileName: string, user: any): Promise<{ fileId: string; thumbnailUrl: string } | null> {
  try {
    console.log(`[Drive] Uploading PROCESSED MEDIA ${fileName} using action: uploadMedia...`);
    
    // Detect mimeType from prefix before removing it
    let mimeType = 'image/png';
    if (base64Data.startsWith('data:image/webp')) mimeType = 'image/webp';
    else if (base64Data.startsWith('data:image/jpeg')) mimeType = 'image/jpeg';
    
    // Ensure base64 doesn't have the data URL prefix if it does
    let cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    
    // Google APIs often return web-safe base64 (- and _), but Apps Script base64Decode expects standard (+ and /)
    // We also remove any whitespace and ensure proper padding.
    cleanBase64 = cleanBase64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    while (cleanBase64.length % 4 !== 0) {
      cleanBase64 += '=';
    }
    
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-cache',
      body: JSON.stringify({
        action: 'uploadMedia',
        fileName: fileName,
        mimeType: mimeType,
        base64: cleanBase64,
        folderType: 'processed',
        user
      }),
    });

    if (!response.ok) throw new Error(`Network response error: ${response.status}`);

    const result = await response.json();
    if (result.status === 'success') {
      console.log(`[Drive] Successfully uploaded processed media: ${result.fileId}`);
      return {
        fileId: result.fileId,
        thumbnailUrl: result.url || `https://drive.google.com/uc?export=view&id=${result.fileId}`
      };
    } else {
      throw new Error(result.message || 'Drive Upload failed');
    }
  } catch (error) {
    console.error('Drive processed media upload error:', error);
    throw error;
  }
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
 * Is this URL served by Google's Drive/CDN hosts?
 *
 * Matched against the parsed hostname and anchored at BOTH ends of the label,
 * so `drive.google.com.evil.tld` and `notdrive.google.com` are both rejected.
 * An earlier version anchored only the start, which let any hostname merely
 * *beginning* with a Google domain through.
 */
export function isGoogleHostedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let host = '';
  try { host = new URL(String(url).trim()).hostname; } catch { return false; }
  return /(^|\.)(googleusercontent\.com|drive\.google\.com|docs\.google\.com)$/i.test(host);
}

/**
 * The form an outside service must be given to fetch one of our Drive images.
 *
 * getCleanImageUrl above produces `lh3.googleusercontent.com/d/<id>`, which is
 * right for an <img> in the app and wrong for anyone else: it is an
 * undocumented CDN endpoint. Matrixify -- which is how Rare Earth import the
 * workbook, not Shopify's own CSV importer -- wants the documented download
 * endpoint instead.
 *
 * This replaces a chain of `includes()` branches in the Shopify export that
 * got two things wrong. It took the whole tail after '/d/', so an id carrying
 * a suffix (`/d/<id>?.png`, the exact form written elsewhere in the app) came
 * out as `...&id=<id>?.png` and resolved to nothing. And it treated ANY url
 * containing the substring `id=` as a Drive link, rewriting unrelated URLs
 * that merely had an `id=` parameter. extractFileId already parses every id
 * form we produce, so ask it rather than re-deriving the answer by hand.
 *
 * Anything that is not Drive-hosted -- including a Supabase URL from before
 * the migration -- is returned unchanged rather than mangled into a Drive link
 * that cannot exist.
 */
export function toDriveDownloadUrl(url: string | null | undefined): string {
  if (!url) return '';
  const s = String(url).trim();
  // The $ matters: without it, `drive.google.com.evil.tld` matches at position
  // zero and an attacker-controlled host is treated as Drive.
  if (!isGoogleHostedUrl(s)) return s;
  const fileId = extractFileId(s);
  return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : s;
}

/**
 * Robustly collects all unique images from every possible field (including legacy ones).
 */
export function collectAllImages(normData: any, opts?: { dropVideos?: boolean }): string[] {
  if (!normData) return [];

  const collect = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.flatMap(v => collect(v));
    // Split by comma or semicolon (legacy data sometimes uses semicolon)
    return String(val).split(/[,;]/).map(v => v.trim()).filter(Boolean);
  };

  const rawUrls = [
    ...collect(normData.mediaUrls),
    ...collect(normData.image_url),
    ...collect(normData.item_image),
    ...collect(normData.imageUrl),
    ...collect(normData.itemImage),
    ...collect(normData.videoGen)
  ].filter(Boolean).map(u => String(u).trim()).filter(Boolean);
  
  // Drop videos BEFORE cleaning, never after.
  //
  // getCleanImageUrl turns a Drive video into `uc?export=download&id=<id>`,
  // which has no file extension left for isVideoFile to recognise -- so a
  // filter applied downstream of it silently keeps every Drive-hosted clip.
  // That is how .mp4 links were reaching the Shopify sheet's Image Src and the
  // catalogue's image loader, which then spent a full timeout failing to
  // decode them. Only the raw stored value still carries the extension.
  const kept = opts?.dropVideos ? rawUrls.filter(u => !isVideoFile(u)) : rawUrls;

  // Deduplicate AFTER cleaning to catch identical visuals with different tracking tags
  const cleanedUrls = kept.map(u => getCleanImageUrl(u)).filter(Boolean) as string[];
  return Array.from(new Set(cleanedUrls));
}

export const isVideoMime = (mime: string) => mime?.startsWith('video/');
export const isVideoFile = (fileName: string) => {
  if (!fileName) return false;
  // Remove query string and hash, then get extension
  const cleanUrl = fileName.split(/[?#]/)[0];
  const ext = cleanUrl.split('.').pop()?.toLowerCase();
  return ['mov', 'mp4', 'webm', 'ogg', 'm4v', 'avi', 'mkv'].includes(ext || '');
};

export const isGooglePhotos = (url: string) => {
  if (!url) return false;
  return url.toLowerCase().includes('photos.app.goo.gl') || url.toLowerCase().includes('photos.google.com');
};

/**
 * Images for an OUTBOUND artefact -- the print catalogue and the Shopify
 * sheet. Differs from collectAllImages in the two ways that only matter once
 * a picture leaves the app:
 *
 *  - The AI-generated video is dropped. collectAllImages includes videoGen,
 *    which is right for a gallery and wrong here: the PDF loader tries to
 *    decode the .mp4 as an image and logs "All image loading strategies
 *    failed", and Shopify rejects a row whose Image Src is a video.
 *  - Each source photo is swapped for its background-replaced version when
 *    one exists. PER IMAGE, not all-or-nothing: an item with three photos of
 *    which one is cleaned exports that cleaned one plus the two originals.
 *    The gallery's version of this returns only the cleaned subset and drops
 *    the rest, which is survivable on screen and would silently shrink a
 *    catalogue.
 *
 * processed_media_urls mixes two kinds of entry -- "_"-prefixed metadata and
 * real image entries keyed by the source URL -- so the lookup must be by key,
 * never by "the map is non-empty". See lib/aiContent.ts for why.
 */
export function collectExportImages(normData: any): string[] {
  if (!normData) return [];

  let processedMap: Record<string, any> = {};
  const rawMedia = normData.processedMediaUrls || normData.processed_media_urls;
  if (rawMedia) {
    if (typeof rawMedia === 'object') {
      processedMap = rawMedia as Record<string, any>;
    } else {
      const str = String(rawMedia).trim();
      if (str.startsWith('{')) {
        try { processedMap = JSON.parse(str) || {}; } catch (e) { /* leave empty */ }
      }
    }
  }

  const resolved = collectAllImages(normData, { dropVideos: true })
    .map(url => {
      // The map may be keyed by the raw URL or by its cleaned form, depending
      // on which build wrote the row.
      const hit = processedMap[url];
      if (typeof hit === 'string' && /^https?:\/\//i.test(hit)) {
        return getCleanImageUrl(hit) || url;
      }
      return url;
    })
    .filter(Boolean) as string[];

  return Array.from(new Set(resolved));
}

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

  // A browser fetch never times out on its own, and Apps Script can stall for
  // minutes under load or quota pressure. Every caller of this batch is behind
  // an await, so one stalled call used to hang the caller forever: the
  // catalogue export warms its images through here before it draws anything,
  // so a stall showed up as the whole export hanging with no error in the
  // console -- nothing had thrown, it was still waiting. Failing after 30s
  // instead lets loadExternalImageAsDataUrl fall through to its next strategy
  // and the catalogue finish, at worst with a gap where one image should be.
  const ac = new AbortController();
  const stall = setTimeout(() => ac.abort(), 30_000);

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'batchGetImageBase64FromDriveIds', fileIds }),
      signal: ac.signal,
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
    const reason = (error as any)?.name === 'AbortError'
      ? new Error(`Drive image proxy did not answer within 30s (${fileIds.length} ids)`)
      : error;

    fileIds.forEach(fileId => {
      const resolvers = promiseResolvers.get(fileId);
      if (resolvers) {
        resolvers.forEach(({ reject }) => reject(reason as any));
        promiseResolvers.delete(fileId);
      }
    });
    console.error("Image batch request failed:", reason);
  } finally {
    clearTimeout(stall);
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
      
      // Off-black studio background for padding (#121212)
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, targetSize, targetSize);

      const paddingPercent = 0.10;
      const availableSize = targetSize * (1 - 2 * paddingPercent);

      let drawW = availableSize;
      let drawH = availableSize;

      if (width > height) {
        drawH = Math.round(availableSize * (height / width));
      } else {
        drawW = Math.round(availableSize * (width / height));
      }

      const offsetX = Math.round((targetSize - drawW) / 2);
      const offsetY = Math.round((targetSize - drawH) / 2);
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      reject(new Error('Failed to load image for resizing.'));
    };
    img.src = dataUrl;
  });
}

/**
 * Formats an image (JPEG, PNG, DataURL) to a 1:1 square canvas.
 * - For transparent PNGs: centers subject with padding (default 12%), keeping background transparent or off-black.
 * - For regular photos: scales subject centered into a 1:1 square, filling letterboxed margins with off-black (#121212).
 */
export async function formatImageToSquareCanvas(
  src: string,
  targetSize: number = 1024,
  bgColor: string = '#121212',
  paddingPercent: number = 0.12,
  preserveAlpha: boolean = false
): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      const img = await loadImage(src);
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d')!;

      if (!preserveAlpha) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, targetSize, targetSize);
      } else {
        ctx.clearRect(0, 0, targetSize, targetSize);
      }

      const availableSize = targetSize * (1 - 2 * paddingPercent);
      const { width, height } = img;

      let drawW = availableSize;
      let drawH = availableSize;

      if (width > height) {
        drawH = Math.round(availableSize * (height / width));
      } else {
        drawW = Math.round(availableSize * (width / height));
      }

      const offsetX = Math.round((targetSize - drawW) / 2);
      const offsetY = Math.round((targetSize - drawH) / 2);

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      const mimeType = preserveAlpha ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(mimeType, 0.92));
    } catch (err) {
      resolve(src);
    }
  });
}

/**
 * Extracts average color from the edge pixels of an image.
 */
export function extractEdgeColor(img: HTMLImageElement): string {
  try {
    const canvas = document.createElement('canvas');
    const sampleSize = 100;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
    const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const data = imgData.data;

    let rSum = 0, gSum = 0, bSum = 0, count = 0;

    for (let i = 0; i < sampleSize; i++) {
      // Top edge
      let idx = (0 * sampleSize + i) * 4;
      if (data[idx + 3] > 20) { rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2]; count++; }

      // Bottom edge
      idx = ((sampleSize - 1) * sampleSize + i) * 4;
      if (data[idx + 3] > 20) { rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2]; count++; }

      // Left edge
      idx = (i * sampleSize + 0) * 4;
      if (data[idx + 3] > 20) { rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2]; count++; }

      // Right edge
      idx = (i * sampleSize + (sampleSize - 1)) * 4;
      if (data[idx + 3] > 20) { rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2]; count++; }
    }

    if (count === 0) return '#121212';

    const r = Math.round(rSum / count).toString(16).padStart(2, '0');
    const g = Math.round(gSum / count).toString(16).padStart(2, '0');
    const b = Math.round(bSum / count).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
  } catch (e) {
    return '#121212';
  }
}

export interface PixelStretchConfig {
  enabled: boolean;
  linePosition: 'top' | 'bottom' | 'left' | 'right' | 'center-h' | 'center-v';
  blur: number;
}

export function cropImage(
  src: string, 
  x: number, y: number, w: number, h: number, 
  targetSize: number = 1024,
  bgColor: string = '#121212',
  pixelStretch?: PixelStretchConfig
): Promise<string> {
  return new Promise(async (resolve) => {
    try {
      const img = await loadImage(src);
      
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d')!;
      
      if (pixelStretch && pixelStretch.enabled) {
        // Draw Pixel Stretch Effect background
        let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;
        const pos = pixelStretch.linePosition || 'top';
        if (pos === 'top') { srcX = 0; srcY = 0; srcW = img.width; srcH = 1; }
        else if (pos === 'bottom') { srcX = 0; srcY = img.height - 1; srcW = img.width; srcH = 1; }
        else if (pos === 'left') { srcX = 0; srcY = 0; srcW = 1; srcH = img.height; }
        else if (pos === 'right') { srcX = img.width - 1; srcY = 0; srcW = 1; srcH = img.height; }
        else if (pos === 'center-h') { srcX = 0; srcY = Math.floor(img.height / 2); srcW = img.width; srcH = 1; }
        else if (pos === 'center-v') { srcX = Math.floor(img.width / 2); srcY = 0; srcW = 1; srcH = img.height; }

        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, srcX, srcY, Math.max(1, srcW), Math.max(1, srcH), 0, 0, targetSize, targetSize);

        if (pixelStretch.blur > 0) {
          ctx.filter = `blur(${pixelStretch.blur}px)`;
          ctx.drawImage(canvas, 0, 0);
          ctx.filter = 'none';
        }
      } else {
        // Fill solid background color
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, targetSize, targetSize);
      }
      
      // Calculate crop box in pixels on source image
      // To prevent aspect ratio stretching, crop region size MUST be uniform in pixel scale
      const cropX_px = x * img.width;
      const cropY_px = y * img.height;
      const cropW_px = w * img.width;
      const cropH_px = h * img.height;

      // Determine valid source image pixel sub-rectangle
      const validSx = Math.max(0, cropX_px);
      const validSy = Math.max(0, cropY_px);
      const validEx = Math.min(img.width, cropX_px + cropW_px);
      const validEy = Math.min(img.height, cropY_px + cropH_px);

      const validSw = validEx - validSx;
      const validSh = validEy - validSy;

      if (validSw > 0 && validSh > 0) {
        // Map valid source sub-rectangle to target canvas while preserving exact 1:1 scale (no distortion)
        const dstX = ((validSx - cropX_px) / cropW_px) * targetSize;
        const dstY = ((validSy - cropY_px) / cropH_px) * targetSize;
        const dstW = (validSw / cropW_px) * targetSize;
        const dstH = (validSh / cropH_px) * targetSize;

        ctx.drawImage(img, validSx, validSy, validSw, validSh, dstX, dstY, dstW, dstH);
      }

      resolve(canvas.toDataURL('image/jpeg', 0.92));
    } catch (e) {
      resolve(src);
    }
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
  
  // Create a copy of the alpha channel to avoid modifying the original
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = data[i * 4];
  }

  const offsets = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }
  ];

  let bestContour: { x: number; y: number }[] = [];

  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      if (alpha[startY * width + startX] > 128) {
        // 1. Trace the contour for this blob
        const contour: { x: number; y: number }[] = [];
        let p = { x: startX, y: startY };
        let dir = 0;
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
            
            if (q.x >= 0 && q.x < width && q.y >= 0 && q.y < height && alpha[q.y * width + q.x] > 128) {
              p = q;
              foundNext = true;
              break;
            }
          }
          if (!foundNext) break; // Isolated pixel
          count++;
        } while ((p.x !== startX || p.y !== startY) && count < maxCount);

        if (contour.length > bestContour.length) {
          bestContour = contour;
        }

        // 2. Erase this blob using flood fill so we don't scan it again
        const stack = [{ x: startX, y: startY }];
        while (stack.length > 0) {
          const { x, y } = stack.pop()!;
          const idx = y * width + x;
          if (alpha[idx] > 128) {
            alpha[idx] = 0; // Erase
            if (x > 0) stack.push({ x: x - 1, y });
            if (x < width - 1) stack.push({ x: x + 1, y });
            if (y > 0) stack.push({ x, y: y - 1 });
            if (y < height - 1) stack.push({ x, y: y + 1 });
          }
        }
      }
    }
  }

  return bestContour;
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
    if (points.length < 1) return '';
    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
    }
    path += ' Z';
    return path;
}

export async function preprocessForMasking(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d')!;
            
            // Draw original image
            ctx.drawImage(img, 0, 0);
            
            // Get pixel data
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Apply color contrast and saturation boost (color contrast rules) to aid edge detection
            const contrast = 1.25; // 25% contrast boost
            const intercept = 128 * (1 - contrast);
            const saturation = 1.4; // 40% saturation boost
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // 1. Contrast Boost
                let cr = r * contrast + intercept;
                let cg = g * contrast + intercept;
                let cb = b * contrast + intercept;
                
                // 2. Saturation Boost
                // Find luminance
                const luma = 0.299 * cr + 0.587 * cg + 0.114 * cb;
                
                // Interpolate between luma and color
                cr = luma + saturation * (cr - luma);
                cg = luma + saturation * (cg - luma);
                cb = luma + saturation * (cb - luma);
                
                // Clamp
                data[i] = Math.max(0, Math.min(255, cr));
                data[i + 1] = Math.max(0, Math.min(255, cg));
                data[i + 2] = Math.max(0, Math.min(255, cb));
            }
            
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.src = dataUrl;
    });
}

export function trimTransparentCanvas(canvas: HTMLCanvasElement, padding = 4): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return canvas;

  try {
    const { width, height } = canvas;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX || maxY < minY) return canvas;
    if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) return canvas;

    const trimX = Math.max(0, minX - padding);
    const trimY = Math.max(0, minY - padding);
    const trimW = Math.min(width - trimX, (maxX - minX + 1) + padding * 2);
    const trimH = Math.min(height - trimY, (maxY - minY + 1) + padding * 2);

    if (trimW <= 0 || trimH <= 0 || (trimW === width && trimH === height)) return canvas;

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = trimW;
    trimmedCanvas.height = trimH;
    const trimmedCtx = trimmedCanvas.getContext('2d');
    if (!trimmedCtx) return canvas;

    trimmedCtx.drawImage(
      canvas,
      trimX, trimY, trimW, trimH,
      0, 0, trimW, trimH
    );

    return trimmedCanvas;
  } catch (e) {
    console.error('Error trimming transparent canvas:', e);
    return canvas;
  }
}

function fillInternalMaskHoles(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const visited = new Uint8Array(width * height);
    const stack: number[] = [];

    for (let x = 0; x < width; x++) {
        if (data[x * 4 + 3] < 128 || data[x * 4] < 128) { stack.push(x); visited[x] = 1; }
        const bBottom = (height - 1) * width + x;
        if (data[bBottom * 4 + 3] < 128 || data[bBottom * 4] < 128) { stack.push(bBottom); visited[bBottom] = 1; }
    }
    for (let y = 0; y < height; y++) {
        const bLeft = y * width;
        if (data[bLeft * 4 + 3] < 128 || data[bLeft * 4] < 128) { stack.push(bLeft); visited[bLeft] = 1; }
        const bRight = y * width + (width - 1);
        if (data[bRight * 4 + 3] < 128 || data[bRight * 4] < 128) { stack.push(bRight); visited[bRight] = 1; }
    }

    while (stack.length > 0) {
        const idx = stack.pop()!;
        const x = idx % width;
        const y = Math.floor(idx / width);

        if (x > 0 && !visited[idx - 1]) {
            if (data[(idx - 1) * 4 + 3] < 128 || data[(idx - 1) * 4] < 128) { visited[idx - 1] = 1; stack.push(idx - 1); }
        }
        if (x < width - 1 && !visited[idx + 1]) {
            if (data[(idx + 1) * 4 + 3] < 128 || data[(idx + 1) * 4] < 128) { visited[idx + 1] = 1; stack.push(idx + 1); }
        }
        if (y > 0 && !visited[idx - width]) {
            if (data[(idx - width) * 4 + 3] < 128 || data[(idx - width) * 4] < 128) { visited[idx - width] = 1; stack.push(idx - width); }
        }
        if (y < height - 1 && !visited[idx + width]) {
            if (data[(idx + width) * 4 + 3] < 128 || data[(idx + width) * 4] < 128) { visited[idx + width] = 1; stack.push(idx + width); }
        }
    }

    for (let i = 0; i < width * height; i++) {
        if (!visited[i]) {
            const idx = i * 4;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

export async function applyAlphaMask(originalUrl: string, maskBlob: Blob, isCylinderPendant: boolean = false): Promise<string> {
    return new Promise(async (resolve) => {
        const origImg = await loadImage(originalUrl);
        
        const maskReader = new FileReader();
        const maskDataUrl = await new Promise<string>((r) => {
            maskReader.onloadend = () => r(maskReader.result as string);
            maskReader.readAsDataURL(maskBlob);
        });
        const maskImg = await loadImage(maskDataUrl);

        const canvas = document.createElement('canvas');
        
        // Scale down to max 1600px for web performance
        const MAX_DIM = 1600;
        let scale = 1;
        if (origImg.width > MAX_DIM || origImg.height > MAX_DIM) {
            scale = MAX_DIM / Math.max(origImg.width, origImg.height);
        }
        
        canvas.width = Math.round(origImg.width * scale);
        canvas.height = Math.round(origImg.height * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;
        const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })!;
        maskCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
        
        if (!isCylinderPendant) {
            fillInternalMaskHoles(maskCtx, canvas.width, canvas.height);
        }

        // Draw original scaled
        ctx.drawImage(origImg, 0, 0, canvas.width, canvas.height);
        
        if (!isCylinderPendant) {
            // Mask it out based on the alpha channel of the cleaned mask image
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
        }

        // RULE: Post-process alpha to eliminate black studio background and prevent semi-transparent elements!
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (isCylinderPendant) {
                const isBlackBg = r <= 60 && g <= 60 && b <= 60 && (Math.max(r, g, b) - Math.min(r, g, b)) <= 25;
                data[i + 3] = isBlackBg ? 0 : 255;
            } else if (a > 0) {
                const isBlackBg = r <= 45 && g <= 45 && b <= 45 && (Math.max(r, g, b) - Math.min(r, g, b)) <= 15;
                if (isBlackBg) {
                    data[i + 3] = 0;
                    continue;
                }

                if (a > 30) {
                    data[i + 3] = 255;
                } else {
                    data[i + 3] = 0;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);

        const trimmed = trimTransparentCanvas(canvas, 4);
        resolve(trimmed.toDataURL('image/png'));
    });
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

/**
 * DEPRECATED — the cypher now lives in the database.
 *
 * public.onyx_cypher() computes book_aq_code / book_land_code / book_barcode on
 * write, and the app reads those stored values. This client-side path exists only
 * as a fallback for records written before that trigger, and has NO key of its
 * own: the previous hardcoded fallback key meant every printed label could be
 * reversed to acquisition cost by anyone reading the JS bundle.
 *
 * Without VITE_CYPHER_KEY set — which is now the intended state — this returns a
 * placeholder rather than leaking a working cypher.
 */
export const numberToCypher = (num: number): string => {

  const key = import.meta.env.VITE_CYPHER_KEY as string;
  if (!key || key.length < 10) return '—';

  return String(Math.floor(num))
    .split('')
    .map(digit => key[parseInt(digit, 10)] || '')
    .join('');
};

const MATERIAL_WORDS_TO_STRIP = [
  'ONYX', 'MARBLE', 'FLUORITE', 'CONCRETE', 'TRAVERTINE', 'CALCITE', 
  'ROCK', 'STONE', 'CRYSTAL', 'QUARTZ', 'RESIN', 'WOOD', 'AGATE', 'JADE', 'JASPER'
];

export const cleanColorString = (colorStr?: string, itemMaterial?: string): string => {
  if (!colorStr || typeof colorStr !== 'string') return colorStr || '';
  let c = colorStr.trim();
  
  const mats = [...MATERIAL_WORDS_TO_STRIP];
  if (itemMaterial && typeof itemMaterial === 'string' && itemMaterial.trim()) {
    mats.push(itemMaterial.trim().toUpperCase());
  }
  
  mats.sort((a, b) => b.length - a.length);
  
  for (const mat of mats) {
    if (!mat) continue;
    const regex = new RegExp('\\b' + mat + '\\b', 'gi');
    c = c.replace(regex, '');
  }
  
  const cleaned = c.replace(/\s+/g, ' ').replace(/[-,/]\s*$/, '').trim();
  return cleaned !== '' || !itemMaterial ? cleaned : colorStr.trim();
};

export const normalizeInventoryData = (data: any): any => {
  if (!data) return {};
  const d = data;
  let processedMap: Record<string, string> = {};
  const rawMedia = d.processedMediaUrls || d.processed_media_urls;
  if (rawMedia && typeof rawMedia === 'string' && rawMedia.startsWith('{')) {
    try { processedMap = JSON.parse(rawMedia); } catch (e) {}
  }
  const generatedColor = d.generated_color || d.generatedColor || processedMap['_generated_color'] || (Array.isArray(d.dominantColors) ? d.dominantColors.join(', ') : (d.dominantColors || ''));
  const generatedType = d.generated_type || d.generatedType || processedMap['_generated_type'] || '';
  return {
    ...d,
    itemId: d.item_id ?? d.itemId,
    vendorId: d.vendor_id || d.vendorId || (String(d.item_id || d.itemId || '').includes('-') ? String(d.item_id || d.itemId || '').split('-')[0] : ''),
    itemNumber: d.item_number ?? d.itemNumber,
    status: d.status || d.item_status || d.itemStatus || '',
    shape: d.shape,
    material: d.material,
    description: d.description,
    color: cleanColorString(d.color, d.material),
    generatedColor,
    generatedType,
    workbook: d.workbook,
    shortDescription: d.short_description || d.shortDescription,
    generatedPngUrl: d.generated_png_url || d.generatedPngUrl,
    generatedSvgUrl: d.generated_svg_url || d.generatedSvgUrl,
    spatialMasks: d.spatial_masks || d.spatialMasks,
    localSegmentationMasks: d.local_segmentation_masks || d.localSegmentationMasks || null,
    cloudSegmentationMasks: d.cloud_segmentation_masks || d.cloudSegmentationMasks || null,
    spatialBoxes2d: d.spatial_boxes_2d || d.spatialBoxes2d,
    spatialPoints: d.spatial_points || d.spatialPoints,
    generatedDescription: d.generated_description || d.generatedDescription,
    detailedDescription: d.detailed_description || d.detailedDescription,
    generatedImageUrls: d.generated_image_urls || d.generatedImageUrls,
    mediaUrls: d.media_urls || d.mediaUrls,
    videoGen: processedMap['videoGen'] || d.video_gen || d.videoGen,
    imageUrl: d.image_url || d.imageUrl,
    itemImage: d.item_image || d.itemImage,
    payDate: d.pay_date || d.payDate,
    payReq: d.pay_req || d.payReq,
    payment_ids: d.payment_ids || d.paymentIds,
    sentDate: d.sent_date || d.sentDate,
    sentManifestId: d.sent_manifest_id || d.sentManifestId,
    printDate: d.print_date || d.printDate,
    packDate: d.pack_date || d.packDate,
    createdAt: d.created_at || d.createdAt || d.timestamp,
    printJobChecksum: d.print_job_checksum || d.printJobChecksum,
    printJobId: d.print_job_id || d.printJobId,
    paymentRequestedAt: d.payment_requested_at || d.paymentRequestedAt,
    // Server-derived. Read these rather than re-deriving the ladder locally;
    // getStatusClass still exists for the colour mapping the UI needs.
    lifecycleStatus: d.lifecycle_status || d.lifecycleStatus,
    paymentStatus: d.payment_status || d.paymentStatus,
    isClientVisible: d.is_client_visible || d.isClientVisible,
    rating: d.rating ?? 0,
    is_hidden: d.is_hidden ?? false,
    hidden_reason: d.hidden_reason || d.hiddenReason || '',
    dispersal_status: d.dispersal_status,
    crateId: d.crate_id || d.crateId,
    packingStatus: d.packing_status || d.packingStatus,
    book_barcode: d.book_barcode || d.bookBarcode || d.tag_id || d.item_id || d.itemId || d.item_number || '',
    book_aq_code: d.book_aq_code || d.bookAqCode || d.aq_code || '-',
    // Computed by the database trigger alongside book_aq_code; surfaced here so
    // calculateCodesAndPrices can prefer the stored value over recomputing.
    book_land_code: d.book_land_code || d.bookLandCode || d.land_code || '-',
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
    quantity: d.quantity ?? d.qty ?? 1,
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

    // A stored barcode wins over recomputing: rebuilding unconditionally from
    // cypherString meant that once the cypher key left the bundle the display lost
    // its landed-code suffix (FR825 15— instead of FR825 15MAF) while copy, which
    // reads bookBarcode, stayed correct.
    //
    // But it must be a real barcode. normalizeInventoryData falls back
    // book_barcode -> tag_id -> item_id -> item_number, so norm.book_barcode is the
    // workbook id (AN-001) for any row whose book_barcode is empty. Trusting that
    // blindly replaced the tag with AN-001 after an edit, because DetailsPanel's
    // edit payload omits book_barcode. A genuine barcode always begins with
    // vendorPrefix + bookStr; anything else is the fallback leaking through and is
    // recomputed instead.
    const storedBarcode = String(norm.book_barcode ?? '').trim();
    const expectedPrefix = `${vendorPrefix}${bookStr}`;
    const effectiveBarcode =
      storedBarcode && storedBarcode !== '-' && storedBarcode.toUpperCase().startsWith(expectedPrefix)
        ? storedBarcode
        : newTagId;

    // Display format is the barcode with a space after the vendor+workbook prefix.
    const splitAt = vendorPrefix.length + bookStr.length;
    const displayTagId = effectiveBarcode.length > splitAt
      ? `${effectiveBarcode.slice(0, splitAt)} ${effectiveBarcode.slice(splitAt)}`
      : effectiveBarcode;

    return {
      bookAcquisition: isNaN(costUsd) ? '-' : onyxRound(costUsd).toString(),
      bookLanded:   isNaN(landedCost) ? '-' : onyxRound(landedCost).toString(),
      bookRetail:   isNaN(retailPrice) ? '-' : onyxRound(retailPrice).toString(),
      // Stored values win. The database computes these on write and they are what
      // is printed on physical labels — recomputing here could disagree with a tag
      // already in the field. The client-side path is only a fallback for rows
      // written before the trigger existed.
      bookAqCode:   norm.book_aq_code && norm.book_aq_code !== '-'
                      ? norm.book_aq_code
                      : (isNaN(costUsdRounded) ? '-' : numberToCypher(costUsdRounded)),
      bookLandCode: norm.book_land_code && norm.book_land_code !== '-'
                      ? norm.book_land_code
                      : cypherString,
      bookBarcode:  effectiveBarcode,
      bookTagId: norm.itemId || '-', // The original workbook tag ID (e.g. EM-001-T)
      bookBarcodeDisplay: displayTagId,
      bookBardcode: effectiveBarcode, // Legacy typo alias; also had the recompute bug
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
  isCylinderPendant: boolean = false,
): Promise<{ pngData: string | null; svgData: string | null }> {
  if (!imageSrc || masksToExport.length === 0) {
    return { pngData: null, svgData: null };
  }

  const image = await loadImage(imageSrc);
  
  // Scale down to max 1600px for web performance
  const MAX_DIM = 1600;
  let scale = 1;
  if (imageDimensions.width > MAX_DIM || imageDimensions.height > MAX_DIM) {
      scale = MAX_DIM / Math.max(imageDimensions.width, imageDimensions.height);
  }
  
  const width = Math.round(imageDimensions.width * scale);
  const height = Math.round(imageDimensions.height * scale);

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

  if (!isCylinderPendant) {
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
    ctx.clip(clippingPath, 'nonzero');
  }
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

  // Post-process alpha to eliminate black background and prevent semi-transparent elements
  const imgData = ctx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (isCylinderPendant) {
          const isBlackBg = r <= 60 && g <= 60 && b <= 60 && (Math.max(r, g, b) - Math.min(r, g, b)) <= 25;
          data[i + 3] = isBlackBg ? 0 : 255;
      } else if (a > 0) {
          const isBlackBg = r <= 45 && g <= 45 && b <= 45 && (Math.max(r, g, b) - Math.min(r, g, b)) <= 15;
          if (isBlackBg) {
              data[i + 3] = 0;
          } else if (a > 40) {
              data[i + 3] = a > 20 ? 255 : 0;
          }
      }
  }
  ctx.putImageData(imgData, 0, 0);

  const trimmedCanvas = trimTransparentCanvas(exportCanvas, 4);
  const pngData = trimmedCanvas.toDataURL('image/png');

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
  
  // 1. Precise status from calculation sets (highest priority)
  if (fullPayIds?.has(String(item.id))) return 'GREEN';
  if (requestedAcqIds?.has(String(item.id))) return 'YELLOW';
  if (partialPayIds?.has(String(item.id))) return 'RED';

  // 2. Book 825 / Prepaid Override (Now with production safety)
  const workbook = String(item.workbook || item.data?.workbook || '').toLowerCase();
  const payReq = String(item.payReq || item.pay_req || item.data?.payReq || item.data?.pay_req || '').toLowerCase();
  const isProductionItem = statusStr.includes('production') || String(item.source || '').toLowerCase().includes('production');
  if ((workbook === 'v825' || workbook === '825' || payReq === 'prepaid' || payReq === 'paid') && !isProductionItem) return 'GREEN';

  // 2. Fallback to item fields (Legacy or direct field check)
  if (item.payDate || item.pay_date || payReqStr === 'paid' || payReqStr === 'prepaid' || dispStatus === 'dispersed') return 'GREEN';
  
  if (payReqStr.includes('%') || payReqStr === 'partial') return 'RED';

  if (payReqStr === 'requested' || payReqStr === 'true' || statusStr === 'requested' || dispStatus === 'requested' || dispStatus === 'sent') {
    return 'YELLOW';
  }

  // 5. Default: BLUE (NEW) for items with no payment data
  return 'BLUE';
};
export function getDynamicCrateIdComponents(crate: any, allCrates: any[], allInventory: any[]) {
    if (!crate.inventory_ids || crate.status === 'Empty') return { date: '', vendors: [], sequence: crate.id.slice(0, 8).toUpperCase() };
    
    const d = crate.updated_at ? new Date(crate.updated_at) : (crate.date ? new Date(crate.date) : new Date());
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const datePrefix = `${months[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
    
    const vSet = new Set<string>();
    crate.inventory_ids.split(',').filter(Boolean).forEach((entry: string) => {
        const [id] = entry.split(':');
        const inv = allInventory.find((i: any) => String(i.row) === id);
        if (inv?.data) {
            const p = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0];
            if (p) vSet.add(p.toUpperCase());
        }
    });
    const vendorsList = Array.from(vSet).sort();
    const vendorsStr = vendorsList.join('');
    
    const matchingCrates = allCrates.filter((c: any) => {
        if (c.status === 'Empty' || !c.inventory_ids) return false;
        const cVSet = new Set<string>();
        c.inventory_ids.split(',').filter(Boolean).forEach((entry: string) => {
            const [id] = entry.split(':');
            const inv = allInventory.find((i: any) => String(i.row) === id);
            if (inv?.data) {
                const p = (inv.data.vendor_id || inv.data.itemId || '').split('-')[0];
                if (p) cVSet.add(p.toUpperCase());
            }
        });
        return Array.from(cVSet).sort().join('') === vendorsStr;
    });

    matchingCrates.sort((a: any, b: any) => {
        const tA = (a.updated_at || a.date) ? new Date(a.updated_at || a.date!).getTime() : 0;
        const tB = (b.updated_at || b.date) ? new Date(b.updated_at || b.date!).getTime() : 0;
        return tA === tB ? a.id.localeCompare(b.id) : tA - tB;
    });

    const index = matchingCrates.findIndex((c: any) => c.id === crate.id);
    const sequence = index >= 0 ? index + 1 : 1;

    return { date: datePrefix, vendors: vendorsList, sequence: String(sequence) };
}

export function extractItemHexString(itemData: any): string | undefined {
    if (!itemData) return undefined;
    if (itemData.hexString) return itemData.hexString;
    if (itemData.hex_string) return itemData.hex_string;
    
    if (itemData.spatial_points || itemData.spatialPoints) {
        let sp = itemData.spatial_points || itemData.spatialPoints;
        if (typeof sp === 'string') {
            try { sp = JSON.parse(sp); } catch(e){}
        }
        if (Array.isArray(sp)) {
            const pm = sp.find((p: any) => p && (p.type === 'pixel_map' || p.hex_string || p.hexString));
            if (pm) return pm.hex_string || pm.hexString;
        } else if (typeof sp === 'object' && sp) {
            if (sp.hex_string || sp.hexString) return sp.hex_string || sp.hexString;
        }
    }
    
    if (itemData.processed_media_urls || itemData.processedMediaUrls) {
        let pmu = itemData.processed_media_urls || itemData.processedMediaUrls;
        if (typeof pmu === 'string') {
            try { pmu = JSON.parse(pmu); } catch(e){}
        }
        if (typeof pmu === 'object' && pmu && pmu['_pixel_map_hex']) {
            return pmu['_pixel_map_hex'];
        }
    }
    return undefined;
}

export async function syncAllCalculatedFieldsToDB(
    items: any[],
    exchangeRate: number,
    db?: any,
    onProgress?: (pct: number, current: number, total: number) => void
): Promise<number> {
    if (!items || items.length === 0) return 0;

    let updatedCount = 0;
    const chunkSize = 20;
    const total = items.length;

    for (let i = 0; i < total; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (item) => {
            const id = item.data?.id || item.row || item.id;
            if (!id) return;

            const norm = normalizeInventoryData(item.data || item);
            const calculated = calculateCodesAndPrices(norm, exchangeRate || DEFAULT_EXCHANGE_RATE, norm.workbook || 'v326');

            const costMxn = parseFloat(norm.price || norm.price_mxn) || 0;
            const costUsd = costMxn / (exchangeRate || DEFAULT_EXCHANGE_RATE);

            const parseNumOrNull = (val: any) => {
                if (val === '-' || val === null || val === undefined || val === '') return null;
                const n = Number(val);
                return isNaN(n) ? null : n;
            };

            const updatePayload: any = {
                book_barcode: calculated.bookBarcode && calculated.bookBarcode !== '-' ? calculated.bookBarcode : null,
                book_aq_code: calculated.bookAqCode && calculated.bookAqCode !== '-' ? calculated.bookAqCode : null,
                book_land_code: calculated.bookLandCode && calculated.bookLandCode !== '-' ? calculated.bookLandCode : null,
                box_land_code: calculated.bookLandCode && calculated.bookLandCode !== '-' ? calculated.bookLandCode : null,
                book_retail: parseNumOrNull(calculated.bookRetail),
                book_landed: parseNumOrNull(calculated.bookLanded),
                book_acquisition: parseNumOrNull(calculated.bookAcquisition),
                price_mxn: parseNumOrNull(norm.price || norm.price_mxn),
                price_usd: !isNaN(costUsd) && costUsd > 0 ? Math.round(costUsd * 100) / 100 : null,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase.from('inventory').update(updatePayload).eq('id', id);
            if (!error) {
                updatedCount++;
                if (db) {
                    try {
                        const existing = await db.inventory.findOne(String(id)).exec();
                        if (existing) {
                            await existing.patch({
                                book_barcode: updatePayload.book_barcode,
                                book_aq_code: updatePayload.book_aq_code,
                                box_land_code: updatePayload.box_land_code,
                                book_retail: updatePayload.book_retail,
                                book_landed: updatePayload.book_landed,
                                price_mxn: updatePayload.price_mxn,
                                price_usd: updatePayload.price_usd,
                                updated_at: updatePayload.updated_at
                            });
                        }
                    } catch (rxErr) {
                        // ignore schema mismatch
                    }
                }
            } else {
                console.warn(`[Sync DB] Failed to update item ${id}:`, error);
            }
        }));

        if (onProgress) {
            const current = Math.min(total, i + chunkSize);
            onProgress(Math.round((current / total) * 100), current, total);
        }
    }

    return updatedCount;
}

/**
 * The Shopify "Type" vocabulary, as agreed with Rare Earth Gallery.
 *
 * ONE list, used in two places that must never drift apart: the batch
 * prompt interpolates it so the model can only choose from it, and the
 * Shopify export validates against it before trusting generated_type.
 * They used to be two hand-copied literals. That is exactly how the
 * polish_type import failure happened -- the sheet carried a value the
 * store had never heard of, and Shopify answered "Value does not exist in
 * provided choices".
 */
export const SHOPIFY_PRODUCT_TYPES = [
    'Barware > Wine Stoppers', 'Bathtubs', 'Board Games > Chess Sets',
    'Home Decor > Candleholders', 'Home Decor > Coasters',
    'Home Decor > Decorative Bowls', 'Home Decor > Decorative Plates',
    'Home Decor > Decorative Trays', 'Home Decor > Floor Lamps',
    'Home Decor > Mirrors', 'Home Decor > Pendant Lights',
    'Home Decor > Sculptures', 'Home Decor > Sinks',
    'Home Decor > Table Lamps', 'Home Decor > Tables',
    'Home Decor > Vases', 'Home Decor > Wall Panels',
    'Home Decor > Wine Racks', 'Outdoor Decor > Fountains',
] as const;

const PRODUCT_TYPE_SET = new Set<string>(SHOPIFY_PRODUCT_TYPES as readonly string[]);

/** True when a generated type is one the store will actually accept. */
export const isAllowedProductType = (t: unknown): boolean =>
    typeof t === 'string' && PRODUCT_TYPE_SET.has(t.trim());

export function getProductCategoryAndType(item: any): { category: string, type: string } {
    const title = `${item.shape || ''} ${item.shortDescription || ''} ${item.description || ''} ${item.type || ''}`.toLowerCase();
    if (title.includes('wine rack')) return { category: 'Furniture > Cabinets & Storage > Wine Racks', type: 'Home Decor > Wine Racks' };
    if (title.includes('bathtub') || title.includes('bath tub') || title.includes('tina')) return { category: 'Hardware > Plumbing > Plumbing Fixtures > Bathtubs', type: 'Bathtubs' };
    if (title.includes('sink') || title.includes('washbasin') || title.includes('lavabo')) return { category: 'Hardware > Plumbing > Plumbing Fixtures > Sinks', type: 'Home Decor > Sinks' };
    if (title.includes('sculpture') || title.includes('statue') || title.includes('animal') || title.includes('figura')) return { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Home Decor > Sculptures' };
    if (title.includes('bowl') || title.includes('tazon')) return { category: 'Home & Garden > Decor > Decorative Bowls', type: 'Home Decor > Decorative Bowls' };
    if (title.includes('plate') || title.includes('plato')) return { category: 'Home & Garden > Decor > Decorative Plates', type: 'Home Decor > Decorative Plates' };
    if (title.includes('tray') || title.includes('charola')) return { category: 'Home & Garden > Decor > Decorative Trays', type: 'Home Decor > Decorative Trays' };
    if (title.includes('fountain') || title.includes('cascada') || title.includes('fuente')) return { category: 'Home & Garden > Decor > Fountains & Ponds > Fountains & Waterfalls > Fountains', type: 'Outdoor Decor > Fountains' };
    if (title.includes('mirror') || title.includes('espejo')) return { category: 'Home & Garden > Decor > Mirrors', type: 'Home Decor > Mirrors' };
    if (title.includes('coaster') || title.includes('portavaso')) return { category: 'Home & Garden > Kitchen & Dining > Barware > Coasters', type: 'Home Decor > Coasters' };
    if (title.includes('shot glass') || title.includes('tequilero')) return { category: 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Shot Glasses', type: 'Home Decor > Sculptures' }; 
    if (title.includes('desk lamp') || title.includes('table lamp')) return { category: 'Home & Garden > Lighting > Lamps > Desk Lamps', type: 'Home Decor > Table Lamps' };
    if (title.includes('floor lamp')) return { category: 'Home & Garden > Lighting > Lamps > Floor Lamps', type: 'Home Decor > Floor Lamps' };
    if (title.includes('pendant') || title.includes('hanging') || title.includes('colgante')) return { category: 'Home & Garden > Lighting > Lighting Fixtures > Pendant Light Fixtures', type: 'Home Decor > Pendant Lights' };
    if (title.includes('wall light') || title.includes('sconce')) return { category: 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures', type: 'Home Decor > Pendant Lights' }; 
    
    if (title.includes('wall panel') || title.includes('panel')) return { category: 'Home & Garden > Lighting > Lighting Fixtures > Wall Light Fixtures', type: 'Home Decor > Wall Panels' };
    
    if (title.includes('wine stopper')) return { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Barware > Wine Stoppers' };
    if (title.includes('chess') || title.includes('board') || title.includes('ajedrez')) return { category: 'Toys & Games > Games > Board Games', type: 'Board Games > Chess Sets' };
    if (title.includes('candle') || title.includes('vela')) return { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Home Decor > Candleholders' };
    if (title.includes('vase') || title.includes('florero')) return { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Home Decor > Vases' };
    if (title.includes('table') || title.includes('mesa') || title.includes('stand') || title.includes('pedestal')) return { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Home Decor > Tables' };
    
    return { category: 'Home & Garden > Decor > Artwork > Sculptures & Statues', type: 'Home Decor > Sculptures' }; 
}

/**
 * Client vocabulary corrections, applied to generated text on its way out.
 *
 * Grant asked on 21 Jul for "Luminarie" to be spelled "Luminary". Fixing the
 * batch prompt only helps rows generated after the fix -- 79 rows already in
 * the table carry the misspelling and would keep shipping it to Shopify and
 * into the printed catalogue until every one of them is regenerated. So the
 * correction is applied at the point of use as well.
 *
 * "Luminaries" is left alone: it is already the correct plural of Luminary,
 * and the word boundary after "Luminarie" is what keeps this from turning it
 * into "Luminarys".
 */
export function normalizeBrandTerms(text: string): string {
    if (!text) return '';
    return String(text)
        .replace(/\bLUMINARIE\b/g, 'LUMINARY')
        .replace(/\bLuminarie\b/g, 'Luminary')
        .replace(/\bluminarie\b/g, 'luminary');
}

export function formatProductTitle(title: string): string {
    if (!title) return '';
    let formatted = title;
    
    // Remove articles
    formatted = formatted.replace(/\b(a|an|the|and)\b/gi, ' ');
    
    // Replace multiple spaces
    formatted = formatted.replace(/\s+/g, ' ').trim();
    
    // Remove trailing period
    if (formatted.endsWith('.')) {
        formatted = formatted.slice(0, -1);
    }
    
    // Title Case (capitalize every word)
    formatted = formatted.split(' ').map(word => {
        if (!word) return '';
        // Handle hyphenated words (e.g. Hand-Carved)
        return word.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('-');
    }).join(' ');
    
    return formatted;
}
