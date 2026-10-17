/**
 * Packaging Studio Data Model & Types
 * Conforms to FEFCO International Corrugated Code, IPPC ISPM-15, and GMA/EUR Pallet Standards.
 */

export type PackagingKind = 'cardboard' | 'crate' | 'pallet';

export type PackagingStyle = 
  | 'fefco_0201'     // Regular Slotted Container (RSC)
  | 'fefco_0427'     // Roll End Tuck Front (RETF) Mailer (Wave 2)
  | 'fefco_0300'     // Full Telescope Two-Piece Box (Wave 2)
  | 'crate_cleated'   // ISPM-15 Cleated Plywood Crate with Skid Runners
  | 'crate_slatted'   // ISPM-15 Open Slatted Lumber Crate
  | 'pallet_gma'      // GMA North America 48×40"
  | 'pallet_eur'      // EUR / EPAL 1 1200×800mm
  | 'pallet_custom';  // Custom Freight Skid / Pallet

export type DimensionBasis = 'inside' | 'outside';

export interface DimensionsCm {
  w: number;
  l: number;
  h: number;
}

export interface CleatSpecMm {
  thick: number;  // Default: 19 mm (3/4" nominal)
  width: number;  // Default: 89 mm (3.5" nominal 2x4 face)
}

export interface SkidSpecMm {
  height: number; // Default: 89 mm (3.5" nominal)
  width: number;  // Default: 89 mm (4x4) or 38 mm (2x4)
  count: number;  // Default: 2 to 4 runners
  chamfered: boolean; // 45° chamfered ends for forklift blades
}

export interface DeckboardSpecMm {
  countTop: number;
  countBottom: number;
  thickMm: number;
  widthMm: number;
  fourWayNotched: boolean;
}

export interface MaterialOption {
  id: string;
  name: string;
  kind: 'cardboard' | 'plywood' | 'lumber';
  thicknessMm: number;
  densityKgM3: number;
  grammageGsm?: number;
  costMxnPerM2: number;
  description: string;
}

export interface PackagingSpec {
  kind: PackagingKind;
  style: PackagingStyle;
  dimBasis: DimensionBasis;
  innerCm: DimensionsCm;
  outerCm: DimensionsCm;
  materialId: string;
  boardThicknessMm: number;
  cleatMm: CleatSpecMm;
  skidMm: SkidSpecMm;
  deckboards: DeckboardSpecMm;
  foamPaddingMm: number; // Internal cushioning (15mm boxes, 25mm crates)
  ispm15Ht: boolean;     // Mandatory for solid lumber crossing US/MX border
  tareWeightKg: number;
  estimatedCostMxn: number;
  stagedItemsSummary?: string;
  laserDividersEnabled?: boolean;
}

export interface BomItem {
  part: string;
  qty: number;
  material: string;
  dimsMm: string;
  purpose: string;
  areaM2?: number;
  volumeM3?: number;
}

export interface PackagingCutList {
  items: BomItem[];
  totalPlywoodM2: number;
  totalLumberM: number;
  totalCardboardM2: number;
  totalFoamM3: number;
  tareWeightKg: number;
  estimatedCostMxn: number;
}

// ── Standard Presets ──────────────────────────────────────────────────────────

export const CARDBOARD_MATERIALS: MaterialOption[] = [
  {
    id: 'flute_e_1_5',
    name: 'E-Flute (1.5mm Micro-corrugated)',
    kind: 'cardboard',
    thicknessMm: 1.5,
    densityKgM3: 300,
    grammageGsm: 450,
    costMxnPerM2: 32,
    description: 'Lightweight presentation & mailers (up to 4 kg)'
  },
  {
    id: 'flute_b_3',
    name: 'B-Flute (3.0mm Single-Wall)',
    kind: 'cardboard',
    thicknessMm: 3.0,
    densityKgM3: 183,
    grammageGsm: 550,
    costMxnPerM2: 42,
    description: 'Standard medium shipping carton (up to 15 kg)'
  },
  {
    id: 'flute_c_4',
    name: 'C-Flute (4.0mm Single-Wall)',
    kind: 'cardboard',
    thicknessMm: 4.0,
    densityKgM3: 162,
    grammageGsm: 650,
    costMxnPerM2: 50,
    description: 'Heavy single-wall box with compression strength (up to 25 kg)'
  },
  {
    id: 'flute_bc_7',
    name: 'BC-Flute (7.0mm Double-Wall)',
    kind: 'cardboard',
    thicknessMm: 7.0,
    densityKgM3: 157,
    grammageGsm: 1100,
    costMxnPerM2: 78,
    description: 'Heavy duty double-wall for stone lamps, mirrors & panels (up to 50 kg)'
  }
];

export const PLYWOOD_MATERIALS: MaterialOption[] = [
  {
    id: 'ply_9_ht_pine',
    name: '9mm Radiata Pine Plywood (ISPM-15 Exempt)',
    kind: 'plywood',
    thicknessMm: 9,
    densityKgM3: 580,
    costMxnPerM2: 175,
    description: 'Light crate sheathing for small to medium sculptures'
  },
  {
    id: 'ply_12_ht_pine',
    name: '12mm CDX Pine Plywood (ISPM-15 Exempt)',
    kind: 'plywood',
    thicknessMm: 12,
    densityKgM3: 600,
    costMxnPerM2: 230,
    description: 'Standard export crate walls & lid for stone decor'
  },
  {
    id: 'ply_18_ht_pine',
    name: '18mm Structural Pine Plywood (ISPM-15 Exempt)',
    kind: 'plywood',
    thicknessMm: 18,
    densityKgM3: 620,
    costMxnPerM2: 340,
    description: 'Heavy crate base floor and heavy sculpture enclosures'
  }
];

export const LUMBER_MATERIALS = {
  skidRunner: {
    name: 'Solid Pine 4×4" Runner (Heat-Treated HT MX-ISPM-15)',
    heightMm: 89,
    widthMm: 89,
    densityKgM3: 520,
    costMxnPerMeter: 68
  },
  cleat: {
    name: 'Solid Pine 1×4" Cleat (Heat-Treated HT MX-ISPM-15)',
    thickMm: 19,
    widthMm: 89,
    densityKgM3: 520,
    costMxnPerMeter: 38
  },
  foamPE: {
    name: 'Polyethylene Closed-Cell Foam (2.2 pcf / 35 kg/m³)',
    densityKgM3: 35,
    costMxnPerM3: 3800
  }
};

export const PALLET_STANDARDS = {
  gma: {
    name: 'GMA North America Standard (48 × 40 in)',
    widthCm: 101.6,
    lengthCm: 121.9,
    heightCm: 14.0,
    tareKg: 18.5,
    costMxn: 320,
    runners: 3,
    topBoards: 7,
    bottomBoards: 5
  },
  eur: {
    name: 'EUR / EPAL 1 Standard (1200 × 800 mm)',
    widthCm: 80.0,
    lengthCm: 120.0,
    heightCm: 14.4,
    tareKg: 24.5,
    costMxn: 450,
    runners: 3,
    topBoards: 5,
    bottomBoards: 3
  }
};
