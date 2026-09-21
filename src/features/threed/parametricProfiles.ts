/**
 * Parametric profiles: real geometry for items that have no mask.
 *
 * This is the highest-coverage piece of the 3D visualizer. Of 497 production
 * items only 109 carry usable mask data -- 336 of the 445 `spatial_masks` rows
 * are an empty `{}` -- but 437 have complete dimensions and 444 have a
 * `generated_type`. Type tells us the FORM, dimensions tell us the SIZE, and
 * between them we can build a recognisable piece without any image at all.
 *
 * Profiles are stored normalised so one profile serves every item of that type:
 *
 *   · Lathe profiles are `[radius, height]` in 0..1. Radius is a fraction of the
 *     piece's half-width, height a fraction of its total height. Points run
 *     bottom to top; for a hollow vessel the path continues back DOWN the
 *     inside, so a single revolve produces both walls and the rim between them.
 *
 *   · Outline profiles are `[x, y]` in -0.5..0.5, a footprint to be extruded.
 *
 * The numbers are hand-tuned against the product photography. They are honest
 * approximations, not measurements, which is why `meshGenerators` badges
 * mask-derived and captured models differently in the UI.
 */
import type { InventoryItemData } from '../../lib/Types';
import { normalizeType } from './geometryStrategy';

export interface LatheProfile {
  kind: 'lathe';
  /** `[radius, height]` pairs in 0..1, bottom to top; closed vessels return down the inside. */
  points: ReadonlyArray<readonly [number, number]>;
  /** Interior is visible through the opening, so the revolve needs both faces. */
  doubleSided?: boolean;
}

export interface OutlineProfile {
  kind: 'outline';
  /** `[x, y]` pairs in -0.5..0.5 tracing the footprint. */
  points: ReadonlyArray<readonly [number, number]>;
  /** Fraction of depth hollowed out from the top face. Trays and canoes only. */
  recess?: number;
}

export type Profile = LatheProfile | OutlineProfile;

/** Ellipse footprint, for round and oval pieces. */
function ellipse(rx: number, ry: number, segments = 48): Array<readonly [number, number]> {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [Math.cos(a) * rx, Math.sin(a) * ry] as const;
  });
}

/** Rounded rectangle footprint, for slabs and panels. */
function roundedRect(w: number, h: number, r: number, perCorner = 6): Array<readonly [number, number]> {
  const x = w / 2 - r;
  const y = h / 2 - r;
  const corners = [
    [x, y, 0],
    [-x, y, Math.PI / 2],
    [-x, -y, Math.PI],
    [x, -y, (3 * Math.PI) / 2],
  ] as const;

  const points: Array<readonly [number, number]> = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= perCorner; i += 1) {
      const a = start + (i / perCorner) * (Math.PI / 2);
      points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const);
    }
  }
  return points;
}

/** Half-circle revolve profile, for spheres and decorative balls. */
function hemisphereProfile(segments = 20): Array<readonly [number, number]> {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    return [Math.sin(Math.PI * t), t] as const;
  });
}

export const PROFILES: Record<string, Profile> = {
  /**
   * Open bowl. Out along the base, up the outside to the rim, across the rim
   * thickness, then back down the inside -- so the wall has real thickness and
   * the interior catches the transmission the way stone does.
   */
  bowl: {
    kind: 'lathe',
    doubleSided: true,
    points: [
      [0.00, 0.00], [0.34, 0.01], [0.62, 0.06], [0.84, 0.20],
      [0.95, 0.45], [1.00, 0.78], [1.00, 1.00],
      [0.91, 1.00],
      [0.88, 0.76], [0.83, 0.46], [0.71, 0.22], [0.50, 0.09],
      [0.27, 0.05], [0.00, 0.05],
    ],
  },

  /** Hanging shade: narrow at the cord, flaring to an open bottom rim. */
  pendant: {
    kind: 'lathe',
    doubleSided: true,
    points: [
      [0.20, 1.00], [0.44, 0.84], [0.68, 0.60], [0.86, 0.33],
      [0.97, 0.10], [1.00, 0.00],
      [0.92, 0.00],
      [0.89, 0.12], [0.78, 0.35], [0.60, 0.61], [0.36, 0.85], [0.14, 1.00],
    ],
  },

  /** Turned table lamp body: wide foot, shoulder, tapering neck. */
  'table-lamp': {
    kind: 'lathe',
    points: [
      [0.00, 0.00], [0.86, 0.00], [1.00, 0.05], [0.96, 0.14],
      [0.80, 0.28], [0.62, 0.45], [0.49, 0.63], [0.44, 0.80],
      [0.47, 0.93], [0.42, 1.00], [0.00, 1.00],
    ],
  },

  /** Floor lamp: heavy foot, long slender column. */
  'floor-lamp': {
    kind: 'lathe',
    points: [
      [0.00, 0.00], [0.88, 0.00], [1.00, 0.03], [0.74, 0.09],
      [0.46, 0.20], [0.33, 0.38], [0.29, 0.60], [0.30, 0.82],
      [0.35, 0.96], [0.31, 1.00], [0.00, 1.00],
    ],
  },

  /** Tiered fountain -- rotationally symmetric, so a revolve reads surprisingly well. */
  fountain: {
    kind: 'lathe',
    doubleSided: true,
    points: [
      [0.00, 0.00], [1.00, 0.00], [1.00, 0.09], [0.82, 0.13],
      [0.40, 0.17], [0.30, 0.30], [0.66, 0.36], [0.70, 0.45],
      [0.52, 0.49], [0.26, 0.54], [0.22, 0.70], [0.40, 0.76],
      [0.38, 0.85], [0.20, 0.90], [0.14, 1.00], [0.00, 1.00],
    ],
  },

  /** Washbasin: shallower and squarer in section than a bowl. */
  basin: {
    kind: 'lathe',
    doubleSided: true,
    points: [
      [0.00, 0.00], [0.50, 0.00], [0.82, 0.06], [0.96, 0.28],
      [1.00, 0.62], [1.00, 1.00],
      [0.90, 1.00],
      [0.89, 0.60], [0.85, 0.30], [0.68, 0.14], [0.42, 0.09], [0.00, 0.09],
    ],
  },

  sphere: { kind: 'lathe', points: hemisphereProfile() },

  /** Flat wall slab, softened corners. */
  panel: { kind: 'outline', points: roundedRect(1, 1, 0.06) },

  /** Shallow serving tray: rounded footprint with a recessed well. */
  tray: { kind: 'outline', points: roundedRect(1, 1, 0.16), recess: 0.55 },

  /** Canoe tray: long pointed oval, deeper well. */
  canoe: {
    kind: 'outline',
    recess: 0.62,
    points: (() => {
      // A lens shape -- two arcs meeting at points at either end.
      const n = 28;
      const top: Array<readonly [number, number]> = [];
      const bottom: Array<readonly [number, number]> = [];
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        const x = -0.5 + t;
        const y = Math.sin(Math.PI * t) * 0.28;
        top.push([x, y] as const);
        bottom.unshift([x, -y] as const);
      }
      return [...top, ...bottom];
    })(),
  },

  /** Mirror frame: circular by default; `createMirrorMesh` rescales to the real aspect. */
  mirror: { kind: 'outline', points: ellipse(0.5, 0.5) },

  /** Wine rack: upright slab. Real bottle bores need the GLB pipeline. */
  'wine-rack': { kind: 'outline', points: roundedRect(1, 1, 0.04) },
};

/**
 * Map a normalised type leaf to a profile key.
 *
 * Ordered most specific first -- 'table lamp' and 'floor lamp' both contain
 * 'lamp', and 'canoe tray' contains 'tray'.
 */
const PROFILE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/canoe/,                'canoe'],
  [/tray/,                 'tray'],
  [/mirror/,               'mirror'],
  [/wine rack/,            'wine-rack'],
  [/fountain/,             'fountain'],
  [/basin|sink/,           'basin'],
  [/ball|sphere/,          'sphere'],
  [/floor lamp/,           'floor-lamp'],
  [/table lamp/,           'table-lamp'],
  [/pendant|hanging/,      'pendant'],
  [/bowl|vessel|vase/,     'bowl'],
  [/panel|table|tile/,     'panel'],
  [/lamp|light/,           'pendant'],   // any remaining luminaire
];

/** Fallbacks by raw `shape` when `generated_type` gave nothing usable. */
const SHAPE_PROFILE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/canoe/,                        'canoe'],
  [/sphere|ball/,                  'sphere'],
  [/basin|sink/,                   'basin'],
  [/cylinder|round/,               'bowl'],
  [/panel|squar|rectang|cube|diamond/, 'panel'],
];

/** The profile for an item, or null when nothing sensible applies. */
export function profileFor(item: InventoryItemData): Profile | null {
  const typeLeaf = normalizeType(item.generatedType);
  for (const [pattern, key] of PROFILE_RULES) {
    if (pattern.test(typeLeaf)) return PROFILES[key] ?? null;
  }

  const shape = (item.shape || '').toLowerCase();
  for (const [pattern, key] of SHAPE_PROFILE_RULES) {
    if (pattern.test(shape)) return PROFILES[key] ?? null;
  }

  return null;
}
