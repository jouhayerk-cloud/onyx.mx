/**
 * Pure pixel computations for the image pipeline. No DOM access, so the exact
 * same code runs inside imageWorker.ts and, as the fallback, on the main
 * thread: results are identical either way.
 */

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/** Largest blob's contour; reads the red channel of RGBA `data`. */
export function findContourPixels(data: ArrayLike<number>, width: number, height: number): Pt[] {
  // Create a copy of the alpha channel to avoid modifying the original
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = data[i * 4];
  }

  const offsets = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }
  ];

  let bestContour: Pt[] = [];

  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      if (alpha[startY * width + startX] > 128) {
        // 1. Trace the contour for this blob
        const contour: Pt[] = [];
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

export function simplifyContourPoints(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points;

  const perpendicularDistance = (point: Pt, lineStart: Pt, lineEnd: Pt) => {
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
    let recResults1 = simplifyContourPoints(points.slice(0, index + 1), tolerance);
    let recResults2 = simplifyContourPoints(points.slice(index), tolerance);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [firstPoint, lastPoint];
  }
}

/** Bounding box of pixels with alpha > 10, padded; null means "leave the canvas as is". */
export function trimRectPixels(data: ArrayLike<number>, width: number, height: number, padding = 4): Rect | null {
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

  if (maxX < minX || maxY < minY) return null;
  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) return null;

  const trimX = Math.max(0, minX - padding);
  const trimY = Math.max(0, minY - padding);
  const trimW = Math.min(width - trimX, (maxX - minX + 1) + padding * 2);
  const trimH = Math.min(height - trimY, (maxY - minY + 1) + padding * 2);

  if (trimW <= 0 || trimH <= 0 || (trimW === width && trimH === height)) return null;
  return { x: trimX, y: trimY, w: trimW, h: trimH };
}

/** Flood the outside of the mask; whatever is not reachable becomes opaque white. */
export function fillMaskHolesPixels(data: Uint8ClampedArray, width: number, height: number): void {
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
}

/** Alpha post-process of generatePngAndSvgFromMasks: drop the black studio backdrop. */
export function alphaCropPixels(data: Uint8ClampedArray, isCylinderPendant: boolean): void {
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
}

/** Alpha post-process of applyAlphaMask. */
export function alphaMaskPixels(data: Uint8ClampedArray, isCylinderPendant: boolean): void {
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
}

/** White wherever the piece is, black elsewhere. */
export function mattePixels(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    const on = px[i + 3] > 0 ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = on;
    px[i + 3] = 255;
  }
}

/** Every op the worker serves; the main-thread fallback calls the same table. */
export const pixelOps = {
  contour(p: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number; tolerance?: number }) {
    const raw = findContourPixels(p.data, p.width, p.height);
    return { result: p.tolerance === undefined ? raw : simplifyContourPoints(raw, p.tolerance), transfer: [] as ArrayBuffer[] };
  },
  alphaCrop(p: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number; cyl: boolean }) {
    alphaCropPixels(p.data, p.cyl);
    return { result: { data: p.data, rect: trimRectPixels(p.data, p.width, p.height, 4) }, transfer: [p.data.buffer as ArrayBuffer] };
  },
  alphaMask(p: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number; cyl: boolean }) {
    alphaMaskPixels(p.data, p.cyl);
    return { result: { data: p.data, rect: trimRectPixels(p.data, p.width, p.height, 4) }, transfer: [p.data.buffer as ArrayBuffer] };
  },
  fillHoles(p: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }) {
    fillMaskHolesPixels(p.data, p.width, p.height);
    return { result: p.data, transfer: [p.data.buffer as ArrayBuffer] };
  },
  matte(p: { data: Uint8ClampedArray<ArrayBuffer> }) {
    mattePixels(p.data);
    return { result: p.data, transfer: [p.data.buffer as ArrayBuffer] };
  },
};
export type PixelOpName = keyof typeof pixelOps;
