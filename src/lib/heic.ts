/**
 * HEIC / HEIF image conversion and rendering utility.
 *
 * Browsers outside Safari cannot natively render HEIC images in <img> tags.
 * This module converts HEIC Blobs/Files to standard JPEG on picking/upload,
 * and converts remote HEIC URLs on-the-fly for rendering in inventory.
 */
import heic2any from 'heic2any';

/** Check if a file, blob, or URL represents a HEIC/HEIF image */
export function isHeic(target: File | Blob | string | null | undefined): boolean {
  if (!target) return false;
  if (typeof target === 'string') {
    const clean = target.split('?')[0].split('#')[0].toLowerCase();
    return clean.endsWith('.heic') || clean.endsWith('.heif');
  }
  const file = target as File;
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

/** Convert a HEIC Blob into a standard JPEG Blob */
export async function convertHeicBlobToJpegBlob(blob: Blob, quality = 0.85): Promise<Blob> {
  const result = await heic2any({
    blob,
    toType: 'image/jpeg',
    quality,
  });
  return Array.isArray(result) ? result[0] : result;
}

/** Convert a HEIC File to a JPEG File with .jpg extension and image/jpeg MIME type */
export async function convertHeicFileToJpegFile(file: File, quality = 0.85): Promise<File> {
  if (!isHeic(file)) return file;
  try {
    const jpegBlob = await convertHeicBlobToJpegBlob(file, quality);
    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([jpegBlob], newName, {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    });
  } catch (err) {
    console.error(`[HEIC] Conversion failed for ${file.name}:`, err);
    return file;
  }
}

// In-memory cache of converted HEIC URLs to avoid re-fetching and re-converting
const heicUrlCache = new Map<string, string>();
const inFlightConversions = new Map<string, Promise<string>>();

/**
 * Fetch a HEIC image URL, convert it to JPEG, and return a renderable object URL.
 */
export async function getRenderableHeicUrl(url: string, quality = 0.85): Promise<string> {
  if (heicUrlCache.has(url)) return heicUrlCache.get(url)!;
  if (inFlightConversions.has(url)) return inFlightConversions.get(url)!;

  const promise = (async () => {
    try {
      console.log(`[HEIC] Converting image for display: ${url.substring(0, 60)}...`);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
      const blob = await resp.blob();
      const jpegBlob = await convertHeicBlobToJpegBlob(blob, quality);
      const objectUrl = URL.createObjectURL(jpegBlob);
      heicUrlCache.set(url, objectUrl);
      console.log(`[HEIC] Image converted successfully.`);
      return objectUrl;
    } catch (err) {
      console.error('[HEIC] URL conversion failed:', err);
      throw err;
    } finally {
      inFlightConversions.delete(url);
    }
  })();

  inFlightConversions.set(url, promise);
  return promise;
}
