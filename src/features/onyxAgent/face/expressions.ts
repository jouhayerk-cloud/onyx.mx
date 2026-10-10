import type { OnyxChanFace } from '../../pico/useDeviceControl';

export type FaceExpression = OnyxChanFace;

export interface ShapeSpec {
  type: 'path' | 'circle' | 'ellipse' | 'line' | 'text';
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x?: number;
  y?: number;
  text?: string;
  fontSize?: string | number;
  fontFamily?: string;
  fill?: 'currentColor' | 'none' | 'white';
  stroke?: 'currentColor' | 'none' | 'white';
  className?: string;
}

const calmFace: { left: ShapeSpec; right: ShapeSpec; mouth: ShapeSpec; extras?: ShapeSpec[] } = {
  left: { type: 'circle', cx: 100, cy: 100, r: 16, fill: 'currentColor', stroke: 'none' },
  right: { type: 'circle', cx: 220, cy: 100, r: 16, fill: 'currentColor', stroke: 'none' },
  mouth: { type: 'line', x1: 140, y1: 160, x2: 180, y2: 160, fill: 'none', stroke: 'currentColor' }
};

export const EXPRESSIONS: Record<FaceExpression, { left: ShapeSpec; right: ShapeSpec; mouth: ShapeSpec; extras?: ShapeSpec[] }> = {
  calm: calmFace,
  happy: {
    left: { type: 'path', d: 'M 80 100 Q 100 80 120 100', fill: 'none', stroke: 'currentColor' },
    right: { type: 'path', d: 'M 200 100 Q 220 80 240 100', fill: 'none', stroke: 'currentColor' },
    mouth: { type: 'path', d: 'M 120 150 Q 160 190 200 150', fill: 'none', stroke: 'currentColor' }
  },
  sleepy: {
    left: { type: 'line', x1: 80, y1: 110, x2: 120, y2: 110, fill: 'none', stroke: 'currentColor' },
    right: { type: 'line', x1: 200, y1: 110, x2: 240, y2: 110, fill: 'none', stroke: 'currentColor' },
    mouth: { type: 'circle', cx: 160, cy: 160, r: 8, fill: 'currentColor', stroke: 'none' },
    extras: [
      { type: 'text', x: 240, y: 80, text: 'Z', fontSize: 24, fontFamily: 'monospace', fill: 'currentColor', stroke: 'none' },
      { type: 'text', x: 260, y: 60, text: 'z', fontSize: 16, fontFamily: 'monospace', fill: 'currentColor', stroke: 'none' }
    ]
  },
  listening: {
    left: { type: 'circle', cx: 100, cy: 100, r: 16, fill: 'currentColor', stroke: 'none' },
    right: { type: 'circle', cx: 220, cy: 100, r: 16, fill: 'currentColor', stroke: 'none' },
    mouth: { type: 'circle', cx: 160, cy: 160, r: 4, fill: 'currentColor', stroke: 'none' },
    extras: [
      { type: 'circle', cx: 140, cy: 160, r: 4, fill: 'currentColor', stroke: 'none' },
      { type: 'circle', cx: 180, cy: 160, r: 4, fill: 'currentColor', stroke: 'none' }
    ]
  },
  speaking: {
    left: { type: 'circle', cx: 100, cy: 100, r: 16, fill: 'currentColor', stroke: 'none' },
    right: { type: 'circle', cx: 220, cy: 100, r: 16, fill: 'currentColor', stroke: 'none' },
    mouth: { type: 'ellipse', cx: 160, cy: 160, rx: 30, ry: 20, fill: 'currentColor', stroke: 'none' }
  },
  thinking: {
    left: { type: 'circle', cx: 108, cy: 92, r: 16, fill: 'currentColor', stroke: 'none' },
    right: { type: 'circle', cx: 228, cy: 92, r: 16, fill: 'currentColor', stroke: 'none' },
    mouth: { type: 'line', x1: 150, y1: 165, x2: 170, y2: 165, fill: 'none', stroke: 'currentColor' },
    extras: [
      { type: 'path', d: 'M 80 70 Q 100 50 120 70', fill: 'none', stroke: 'currentColor' },
      { type: 'circle', cx: 260, cy: 70, r: 4, fill: 'currentColor', stroke: 'none', className: 'onyx-face-dot onyx-face-dot-1' },
      { type: 'circle', cx: 275, cy: 70, r: 4, fill: 'currentColor', stroke: 'none', className: 'onyx-face-dot onyx-face-dot-2' },
      { type: 'circle', cx: 290, cy: 70, r: 4, fill: 'currentColor', stroke: 'none', className: 'onyx-face-dot onyx-face-dot-3' }
    ]
  },
  shy: {
    left: { type: 'path', d: 'M 84 100 Q 100 115 116 100', fill: 'none', stroke: 'currentColor' },
    right: { type: 'path', d: 'M 204 100 Q 220 115 236 100', fill: 'none', stroke: 'currentColor' },
    mouth: { type: 'line', x1: 150, y1: 160, x2: 170, y2: 160, fill: 'none', stroke: 'currentColor' },
    extras: [
      { type: 'line', x1: 85, y1: 125, x2: 95, y2: 115, fill: 'none', stroke: 'currentColor' },
      { type: 'line', x1: 235, y1: 125, x2: 225, y2: 115, fill: 'none', stroke: 'currentColor' }
    ]
  },
  smug: {
    left: { type: 'path', d: 'M 84 100 A 16 16 0 0 0 116 100 Z', fill: 'currentColor', stroke: 'none' },
    right: { type: 'path', d: 'M 204 100 A 16 16 0 0 0 236 100 Z', fill: 'currentColor', stroke: 'none' },
    mouth: { type: 'path', d: 'M 140,160 Q 160,160 180,150', fill: 'none', stroke: 'currentColor' }
  },
  pouty: {
    left: { type: 'circle', cx: 100, cy: 105, r: 16, fill: 'currentColor', stroke: 'none' },
    right: { type: 'circle', cx: 220, cy: 105, r: 16, fill: 'currentColor', stroke: 'none' },
    mouth: { type: 'path', d: 'M 152 165 L 160 160 L 168 165', fill: 'none', stroke: 'currentColor' },
    extras: [
      { type: 'line', x1: 75, y1: 75, x2: 115, y2: 90, fill: 'none', stroke: 'currentColor' },
      { type: 'line', x1: 245, y1: 75, x2: 205, y2: 90, fill: 'none', stroke: 'currentColor' }
    ]
  },
  alert: {
    left: { type: 'circle', cx: 100, cy: 100, r: 24, fill: 'none', stroke: 'currentColor' },
    right: { type: 'circle', cx: 220, cy: 100, r: 24, fill: 'none', stroke: 'currentColor' },
    mouth: { type: 'circle', cx: 160, cy: 160, r: 8, fill: 'currentColor', stroke: 'none' }
  },
  error: {
    left: { type: 'path', d: 'M 84 84 L 116 116 M 84 116 L 116 84', fill: 'none', stroke: 'currentColor' },
    right: { type: 'path', d: 'M 204 84 L 236 116 M 204 116 L 236 84', fill: 'none', stroke: 'currentColor' },
    mouth: { type: 'path', d: 'M 130 160 Q 145 145 160 160 T 190 160', fill: 'none', stroke: 'currentColor' }
  },
  'vendor-display': calmFace,
  'inventory-display': calmFace,
};

/** Maps a wire expression name, ignoring case, to a face expression; unknown names fall back to calm. */
export function mapWireExpression(wire: string): FaceExpression {
  const ex = wire.toLowerCase();
  switch (ex) {
    case 'neutral': return 'calm';
    case 'sad': return 'pouty';
    case 'angry': return 'alert';
    case 'surprised': return 'alert';
    case 'happy':
    case 'sleepy':
    case 'listening':
    case 'speaking':
    case 'thinking':
    case 'shy':
    case 'smug':
    case 'pouty':
    case 'alert':
    case 'error':
    case 'calm':
    case 'vendor-display':
    case 'inventory-display':
      return ex as FaceExpression;
    default:
      return 'calm';
  }
}
