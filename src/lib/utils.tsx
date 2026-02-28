/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { segmentationColors, SCRIPT_URL } from './consts';
import type { BoundingBoxMaskType } from './Types';
import type { UserRole } from './atoms';

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

export async function handleFileUpload(file: File, user: any): Promise<{ fileId: string; thumbnailUrl: string; } | null> {
  // Placeholder logic for now, matching the shape required by UploadReviewStep
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        fileId: `drive-id-${Date.now()}`,
        thumbnailUrl: URL.createObjectURL(file)
      });
    }, 1000);
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
    // If the whole batch fails, reject all promises in that batch.
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
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('Image source is null or empty.'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'Anonymous'; // Allow loading from other domains for canvas
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      const errorMsg = `Failed to load image resource.`;
      console.error(errorMsg, e, src ? src.substring(0, 100) : 'null src'); // Log for debugging
      reject(new Error(errorMsg)); // Reject with a proper Error object
    };
    img.src = src;
  });
}

export function resizeImage(
  dataUrl: string,
  maxDimension: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get 2D context for image resize.'));
      }
      ctx.drawImage(img, 0, 0, width, height);
      // Use JPEG for smaller file size for photos
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      reject(new Error('Failed to load image for resizing.'));
    };
    img.src = dataUrl;
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

// Helper function to trace the contour of a mask from pixel data.
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

// Ramer-Douglas-Peucker algorithm for path simplification.
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

// Creates a closed, curved SVG path string from a series of points.
export function createCurvePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) {
    return '';
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const midPoint = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
    d += ` Q${p1.x},${p1.y} ${midPoint.x},${midPoint.y}`;
  }
  d += ' Z';
  return d;
}

export const readFileAsDataURL = (file: File, type: 'image' | 'video') =>
  new Promise<string>((resolve) => {
    if (type === 'image') {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target!.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 800 / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
      };
    } else {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target!.result as string);
      reader.readAsDataURL(file);
    }
  });

// Color Utility Functions
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

    // Draw the image first
    ctx.drawImage(image, 0, 0, imageDimensions.width, imageDimensions.height);

    // Create a path for the mask
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

    // Get the bounding box of the mask to sample within it
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

      // Only sample pixels that are inside the vector path
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
  // Alphabet is stored in VITE_CYPHER_KEY (env, gitignored).
  // Format: 10-char string where index = digit (index 0 = char for '0', index 1 = char for '1', etc.)
  const key = import.meta.env.VITE_CYPHER_KEY as string | undefined;
  if (!key || key.length < 10) return '—';
  return String(Math.ceil(num)).split('').map(digit => key[parseInt(digit, 10)] || '').join('');
};

export const calculateCodesAndPrices = (data: any, exchangeRate: number, workbookPrefix: string) => {
  const costMxn = parseFloat(data.price) || 0;
  if (costMxn === 0 || !exchangeRate || isNaN(exchangeRate)) {
    return {
      bookLanded: '-',
      bookRetail: '-',
      bookAqCode: '-',
      bookLandCode: '-',
      bookBardcode: '-',
    };
  }

  // The user defined exchange rate passed to this function will be 18 as default
  const costUsd = costMxn / exchangeRate;
  const landedCost = costUsd * 1.4;
  const retailPrice = landedCost * 12;

  const costUsdRounded = Math.ceil(costUsd);
  const landedCostRounded = Math.ceil(landedCost);

  return {
    bookLanded: landedCost.toFixed(2),
    bookRetail: retailPrice.toFixed(2),
    bookAqCode: numberToCypher(costUsdRounded),
    bookLandCode: numberToCypher(landedCostRounded),
    bookBardcode: `${data.itemId || ''}${data.workbook || workbookPrefix}${data.itemNumber || '1'}${numberToCypher(landedCostRounded)}`,
  };
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

  // --- PNG Generation (Cropped) ---
  // 1. Calculate the combined bounding box of all masks in pixel coordinates
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

  // 2. Create a new canvas with the size of the bounding box
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = cropWidth;
  exportCanvas.height = cropHeight;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');

  // 3. Create a composite clipping path, translated to the new canvas's coordinate system
  const clippingPath = new Path2D();
  for (const mask of masksToExport) {
    const finalW = mask.width * width;
    const finalH = mask.height * height;
    const finalX = mask.x * width;
    const finalY = mask.y * height;

    const path = new Path2D(mask.path);
    const matrix = new DOMMatrix();
    // Translate the mask path so its top-left corner on the original image
    // aligns with the top-left of our new cropped canvas
    matrix.translateSelf(finalX - minX, finalY - minY);
    matrix.scaleSelf(finalW / mask.maskWidth, finalH / mask.maskHeight);
    clippingPath.addPath(path, matrix);
  }
  ctx.clip(clippingPath);

  // 4. Draw the corresponding part of the original image onto the new canvas
  ctx.drawImage(
    image,
    minX, // source x
    minY, // source y
    cropWidth, // source width
    cropHeight, // source height
    0, // destination x
    0, // destination y
    cropWidth, // destination width
    cropHeight, // destination height
  );

  const pngData = exportCanvas.toDataURL('image/png');

  // --- SVG Generation (remains the same, full size) ---
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
