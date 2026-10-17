/**
 * Packaging Studio Parametric Generators & Math
 * Pure TypeScript geometry for FEFCO 0201 Corrugated, ISPM-15 Cleated Crates, and GMA/EUR Pallets.
 * Zero external CLI dependency — runs 100% in-browser offline.
 */

import {
  PackagingSpec,
  PackagingCutList,
  BomItem,
  CARDBOARD_MATERIALS,
  PLYWOOD_MATERIALS,
  LUMBER_MATERIALS,
  PALLET_STANDARDS,
  DimensionsCm
} from './types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';

// ── Inside <-> Outside Dimension Resolution ──────────────────────────────────

export function resolvePackagingDimensions(input: Partial<PackagingSpec>): {
  innerCm: DimensionsCm;
  outerCm: DimensionsCm;
  boardThicknessMm: number;
  foamPaddingMm: number;
} {
  const kind = input.kind || 'cardboard';
  const dimBasis = input.dimBasis || 'inside';
  const foamPaddingMm = input.foamPaddingMm ?? (kind === 'cardboard' ? 15 : kind === 'crate' ? 25 : 0);
  
  let boardThicknessMm = input.boardThicknessMm;
  if (!boardThicknessMm) {
    if (kind === 'cardboard') boardThicknessMm = 7.0; // BC-flute double-wall default
    else if (kind === 'crate') boardThicknessMm = 12.0; // 12mm CDX pine default
    else boardThicknessMm = 20.0; // 20mm deckboard default
  }

  const cleatThickMm = input.cleatMm?.thick ?? 19;
  const skidHeightMm = input.skidMm?.height ?? (kind === 'crate' ? 89 : 140);
  const floorPlyMm = kind === 'crate' ? 18 : 0;
  const lidPlyMm = kind === 'crate' ? boardThicknessMm : 0;

  let innerW = input.innerCm?.w ?? 40;
  let innerL = input.innerCm?.l ?? 40;
  let innerH = input.innerCm?.h ?? 40;

  let outerW = input.outerCm?.w ?? 45;
  let outerL = input.outerCm?.l ?? 45;
  let outerH = input.outerCm?.h ?? 50;

  if (kind === 'cardboard') {
    // FEFCO 0201 RSC offsets
    const deltaWcm = (2 * (foamPaddingMm + boardThicknessMm)) / 10;
    const deltaLcm = (2 * (foamPaddingMm + boardThicknessMm)) / 10;
    const deltaHcm = (2 * foamPaddingMm + 4 * boardThicknessMm) / 10; // Top/bottom flap overlap

    if (dimBasis === 'inside') {
      outerW = Number((innerW + deltaWcm).toFixed(1));
      outerL = Number((innerL + deltaLcm).toFixed(1));
      outerH = Number((innerH + deltaHcm).toFixed(1));
    } else {
      innerW = Math.max(5, Number((outerW - deltaWcm).toFixed(1)));
      innerL = Math.max(5, Number((outerL - deltaLcm).toFixed(1)));
      innerH = Math.max(5, Number((outerH - deltaHcm).toFixed(1)));
    }
  } else if (kind === 'crate') {
    // ISPM-15 Cleated Plywood Crate offsets
    // Wall stack = Plywood (12mm) + Solid Cleat (19mm) + Foam (25mm)
    const wallThickPerSideMm = boardThicknessMm + cleatThickMm + foamPaddingMm;
    const deltaWcm = (2 * wallThickPerSideMm) / 10;
    const deltaLcm = (2 * wallThickPerSideMm) / 10;

    // Height stack: Skid runners (89mm) + Floor (18mm) + Foam bottom (f) + Cavity + Foam top (f) + Lid (12mm) + Top Cleats (19mm)
    const deltaHcm = (skidHeightMm + floorPlyMm + lidPlyMm + cleatThickMm + 2 * foamPaddingMm) / 10;

    if (dimBasis === 'inside') {
      outerW = Number((innerW + deltaWcm).toFixed(1));
      outerL = Number((innerL + deltaLcm).toFixed(1));
      outerH = Number((innerH + deltaHcm).toFixed(1));
    } else {
      innerW = Math.max(10, Number((outerW - deltaWcm).toFixed(1)));
      innerL = Math.max(10, Number((outerL - deltaLcm).toFixed(1)));
      innerH = Math.max(10, Number((outerH - deltaHcm).toFixed(1)));
    }
  } else {
    // Freight Pallet
    if (input.style === 'pallet_gma') {
      outerW = PALLET_STANDARDS.gma.widthCm;
      outerL = PALLET_STANDARDS.gma.lengthCm;
      outerH = PALLET_STANDARDS.gma.heightCm;
      innerW = outerW;
      innerL = outerL;
      innerH = Math.max(10, outerH);
    } else if (input.style === 'pallet_eur') {
      outerW = PALLET_STANDARDS.eur.widthCm;
      outerL = PALLET_STANDARDS.eur.lengthCm;
      outerH = PALLET_STANDARDS.eur.heightCm;
      innerW = outerW;
      innerL = outerL;
      innerH = Math.max(10, outerH);
    } else {
      // Custom pallet
      const deckThickMm = input.deckboards?.thickMm ?? 20;
      const runnerH = input.skidMm?.height ?? 89;
      outerH = (runnerH + 2 * deckThickMm) / 10;
      if (dimBasis === 'inside') {
        outerW = innerW;
        outerL = innerL;
      } else {
        innerW = outerW;
        innerL = outerL;
      }
    }
  }

  return {
    innerCm: { w: innerW, l: innerL, h: innerH },
    outerCm: { w: outerW, l: outerL, h: outerH },
    boardThicknessMm,
    foamPaddingMm
  };
}

// ── Metrics & Cost Math ───────────────────────────────────────────────────────

export function computePackagingMetrics(spec: PackagingSpec): {
  innerVolumeLiters: number;
  outerVolumeCbm: number;
  tareWeightKg: number;
  estimatedCostMxn: number;
} {
  const { innerCm, outerCm, kind, boardThicknessMm, foamPaddingMm } = spec;
  const innerVolumeLiters = Number(((innerCm.w * innerCm.l * innerCm.h) / 1000).toFixed(2));
  const outerVolumeCbm = Number(((outerCm.w * outerCm.l * outerCm.h) / 1000000).toFixed(3));

  let tareWeightKg = 0;
  let estimatedCostMxn = 0;

  if (kind === 'cardboard') {
    // Blank sheet dimensions: 2(L+W) + g (35mm) + 4t by H + W + 2t
    const gMm = 35;
    const tMm = boardThicknessMm;
    const blankWidthM = (2 * (innerCm.l * 10 + innerCm.w * 10) + gMm + 4 * tMm) / 1000;
    const blankHeightM = (innerCm.h * 10 + innerCm.w * 10 + 2 * tMm) / 1000;
    const sheetAreaM2 = blankWidthM * blankHeightM;

    const mat = CARDBOARD_MATERIALS.find(m => m.id === spec.materialId) || CARDBOARD_MATERIALS[3];
    const cardWeightKg = sheetAreaM2 * ((mat.grammageGsm || 1100) / 1000);

    // Foam cushioning weight (6 internal faces)
    const foamAreaM2 = (2 * (innerCm.w * innerCm.l + innerCm.w * innerCm.h + innerCm.l * innerCm.h)) / 10000;
    const foamVolumeM3 = foamAreaM2 * (foamPaddingMm / 1000);
    const foamWeightKg = foamVolumeM3 * LUMBER_MATERIALS.foamPE.densityKgM3;

    tareWeightKg = Number((cardWeightKg + foamWeightKg).toFixed(1));
    estimatedCostMxn = Math.round(
      sheetAreaM2 * mat.costMxnPerM2 + foamVolumeM3 * LUMBER_MATERIALS.foamPE.costMxnPerM3 + 25 // tape & glue
    );
  } else if (kind === 'crate') {
    // Plywood sheathing area: 2 Sides, 2 Ends, Floor, Lid
    const wM = (outerCm.w * 10) / 1000;
    const lM = (outerCm.l * 10) / 1000;
    const hM = (outerCm.h * 10) / 1000;

    const floorAreaM2 = wM * lM;
    const lidAreaM2 = wM * lM;
    const sidesAreaM2 = 2 * (lM * hM);
    const endsAreaM2 = 2 * (wM * hM);
    const totalPlywoodM2 = floorAreaM2 + lidAreaM2 + sidesAreaM2 + endsAreaM2;

    const plyMat = PLYWOOD_MATERIALS.find(m => m.id === spec.materialId) || PLYWOOD_MATERIALS[1];
    const plyWeightKg = totalPlywoodM2 * (spec.boardThicknessMm / 1000) * plyMat.densityKgM3;

    // Skid runners: Pine 4x4" (89x89mm)
    const skidCount = spec.skidMm?.count ?? 3;
    const runnerLengthM = lM;
    const totalRunnerLengthM = skidCount * runnerLengthM;
    const runnerVolumeM3 = totalRunnerLengthM * 0.089 * 0.089;
    const runnerWeightKg = runnerVolumeM3 * LUMBER_MATERIALS.skidRunner.densityKgM3;

    // Cleats: Pine 1x4" (19x89mm) around perimeter of all 4 walls and lid + diagonals
    const wallPerimeterCleatsM = 2 * (lM * 2 + hM * 2) + 2 * (wM * 2 + hM * 2);
    const lidPerimeterCleatsM = 2 * (wM + lM);
    const diagonalCleatsM = 4 * Math.sqrt(wM * wM + hM * hM);
    const totalCleatM = wallPerimeterCleatsM + lidPerimeterCleatsM + diagonalCleatsM;
    const cleatVolumeM3 = totalCleatM * 0.019 * 0.089;
    const cleatWeightKg = cleatVolumeM3 * LUMBER_MATERIALS.cleat.densityKgM3;

    // Foam cushioning
    const innerWm = (innerCm.w * 10) / 1000;
    const innerLm = (innerCm.l * 10) / 1000;
    const innerHm = (innerCm.h * 10) / 1000;
    const foamAreaM2 = 2 * (innerWm * innerLm + innerWm * innerHm + innerLm * innerHm);
    const foamVolumeM3 = foamAreaM2 * (foamPaddingMm / 1000);
    const foamWeightKg = foamVolumeM3 * LUMBER_MATERIALS.foamPE.densityKgM3;

    // Hardware (screws, nails, handles, corner brackets) ~ 2.5 kg
    const hardwareKg = 2.5;

    tareWeightKg = Number((plyWeightKg + runnerWeightKg + cleatWeightKg + foamWeightKg + hardwareKg).toFixed(1));
    estimatedCostMxn = Math.round(
      totalPlywoodM2 * plyMat.costMxnPerM2 +
      totalRunnerLengthM * LUMBER_MATERIALS.skidRunner.costMxnPerMeter +
      totalCleatM * LUMBER_MATERIALS.cleat.costMxnPerMeter +
      foamVolumeM3 * LUMBER_MATERIALS.foamPE.costMxnPerM3 +
      150 // fasteners & HT markings
    );
  } else {
    // Pallet
    if (spec.style === 'pallet_gma') {
      tareWeightKg = PALLET_STANDARDS.gma.tareKg;
      estimatedCostMxn = PALLET_STANDARDS.gma.costMxn;
    } else if (spec.style === 'pallet_eur') {
      tareWeightKg = PALLET_STANDARDS.eur.tareKg;
      estimatedCostMxn = PALLET_STANDARDS.eur.costMxn;
    } else {
      const runnerCount = spec.skidMm?.count ?? 3;
      const runnerLengthM = (outerCm.l * 10) / 1000;
      const totalRunnerM = runnerCount * runnerLengthM;
      const deckCount = (spec.deckboards?.countTop ?? 7) + (spec.deckboards?.countBottom ?? 5);
      const deckLengthM = (outerCm.w * 10) / 1000;
      const totalDeckM = deckCount * deckLengthM;

      const lumberVolM3 = (totalRunnerM * 0.089 * 0.089) + (totalDeckM * 0.02 * 0.089);
      tareWeightKg = Number((lumberVolM3 * 520).toFixed(1));
      estimatedCostMxn = Math.round(
        totalRunnerM * LUMBER_MATERIALS.skidRunner.costMxnPerMeter +
        totalDeckM * 35 +
        80 // nails & HT mark
      );
    }
  }

  return {
    innerVolumeLiters,
    outerVolumeCbm,
    tareWeightKg: Math.max(1, tareWeightKg),
    estimatedCostMxn: Math.max(50, estimatedCostMxn)
  };
}

// ── BOM (Bill of Materials) Cut List Generator ────────────────────────────────

export function generateBomCutList(spec: PackagingSpec): PackagingCutList {
  const { kind, innerCm, outerCm, boardThicknessMm, foamPaddingMm } = spec;
  const items: BomItem[] = [];

  let totalPlywoodM2 = 0;
  let totalLumberM = 0;
  let totalCardboardM2 = 0;
  let totalFoamM3 = 0;

  if (kind === 'cardboard') {
    const gMm = 35;
    const tMm = boardThicknessMm;
    const blankWidthMm = 2 * (innerCm.l * 10 + innerCm.w * 10) + gMm + 4 * tMm;
    const blankHeightMm = innerCm.h * 10 + innerCm.w * 10 + 2 * tMm;
    const blankAreaM2 = (blankWidthMm * blankHeightMm) / 1000000;
    totalCardboardM2 += blankAreaM2;

    const mat = CARDBOARD_MATERIALS.find(m => m.id === spec.materialId) || CARDBOARD_MATERIALS[3];

    items.push({
      part: 'FEFCO 0201 Corrugated Blank',
      qty: 1,
      material: mat.name,
      dimsMm: `${Math.round(blankWidthMm)} × ${Math.round(blankHeightMm)} × ${tMm} mm`,
      purpose: 'Single-piece die-cut carton blank with glue flap & slotted flaps',
      areaM2: Number(blankAreaM2.toFixed(3))
    });

    if (foamPaddingMm > 0) {
      const foamTopBottomArea = (2 * (innerCm.w * 10 * innerCm.l * 10)) / 1000000;
      const foamSidesArea = (2 * (innerCm.l * 10 * innerCm.h * 10)) / 1000000;
      const foamEndsArea = (2 * (innerCm.w * 10 * innerCm.h * 10)) / 1000000;
      const totalFoamArea = foamTopBottomArea + foamSidesArea + foamEndsArea;
      totalFoamM3 = totalFoamArea * (foamPaddingMm / 1000);

      items.push({
        part: 'Foam Top & Bottom Pads',
        qty: 2,
        material: `PE Foam ${foamPaddingMm}mm`,
        dimsMm: `${Math.round(innerCm.w * 10)} × ${Math.round(innerCm.l * 10)} × ${foamPaddingMm} mm`,
        purpose: 'Drop cushioning top & bottom impact absorbing plates'
      });
      items.push({
        part: 'Foam Side Panels',
        qty: 2,
        material: `PE Foam ${foamPaddingMm}mm`,
        dimsMm: `${Math.round(innerCm.l * 10)} × ${Math.round(innerCm.h * 10)} × ${foamPaddingMm} mm`,
        purpose: 'Long side face perimeter wall cushioning'
      });
      items.push({
        part: 'Foam End Panels',
        qty: 2,
        material: `PE Foam ${foamPaddingMm}mm`,
        dimsMm: `${Math.round(innerCm.w * 10)} × ${Math.round(innerCm.h * 10)} × ${foamPaddingMm} mm`,
        purpose: 'End face perimeter wall cushioning'
      });
    }

    if (spec.laserDividersEnabled) {
      items.push({
        part: 'Boxes.py Internal Laser Grid',
        qty: 1,
        material: '3mm Baltic Birch / MDF',
        dimsMm: `${Math.round(innerCm.w * 10 - 20)} × ${Math.round(innerCm.l * 10 - 20)} × ${Math.round(innerCm.h * 10 - 20)} mm`,
        purpose: 'Interlocking slotted separator grid for fragile items'
      });
    }
  } else if (kind === 'crate') {
    const wMm = Math.round(outerCm.w * 10);
    const lMm = Math.round(outerCm.l * 10);
    const hMm = Math.round(outerCm.h * 10);
    const plyMat = PLYWOOD_MATERIALS.find(m => m.id === spec.materialId) || PLYWOOD_MATERIALS[1];

    // Base floor panel (18mm structural ply)
    const floorArea = (wMm * lMm) / 1000000;
    totalPlywoodM2 += floorArea;
    items.push({
      part: 'Crate Floor Panel',
      qty: 1,
      material: '18mm Radiata Pine Plywood (ISPM-15 Exempt)',
      dimsMm: `${wMm} × ${lMm} × 18 mm`,
      purpose: 'Structural heavy-load floor bed fastened to skid runners',
      areaM2: Number(floorArea.toFixed(3))
    });

    // Top Lid panel (12mm ply)
    const lidArea = (wMm * lMm) / 1000000;
    totalPlywoodM2 += lidArea;
    items.push({
      part: 'Crate Top Lid Panel',
      qty: 1,
      material: plyMat.name,
      dimsMm: `${wMm} × ${lMm} × ${spec.boardThicknessMm} mm`,
      purpose: 'Removable top sheathing panel with screw fastening',
      areaM2: Number(lidArea.toFixed(3))
    });

    // Side Panels (2x length walls)
    const wallHeightMm = hMm - (spec.skidMm?.height ?? 89) - 18;
    const sideArea = (2 * (lMm * wallHeightMm)) / 1000000;
    totalPlywoodM2 += sideArea;
    items.push({
      part: 'Long Side Panels',
      qty: 2,
      material: plyMat.name,
      dimsMm: `${lMm} × ${wallHeightMm} × ${spec.boardThicknessMm} mm`,
      purpose: 'Main longitudinal cleated wall sheathing',
      areaM2: Number(sideArea.toFixed(3))
    });

    // End Panels (2x width walls)
    const endWidthMm = wMm - (2 * spec.boardThicknessMm);
    const endArea = (2 * (endWidthMm * wallHeightMm)) / 1000000;
    totalPlywoodM2 += endArea;
    items.push({
      part: 'End Panels',
      qty: 2,
      material: plyMat.name,
      dimsMm: `${endWidthMm} × ${wallHeightMm} × ${spec.boardThicknessMm} mm`,
      purpose: 'Transverse wall sheathing panels',
      areaM2: Number(endArea.toFixed(3))
    });

    // Skid Runners (Solid HT Pine 4x4")
    const skidCount = spec.skidMm?.count ?? 3;
    const runnerLengthM = lMm / 1000;
    const runnerLumberM = skidCount * runnerLengthM;
    totalLumberM += runnerLumberM;
    items.push({
      part: 'Skid Runners (Forklift Chamfered)',
      qty: skidCount,
      material: 'Solid Pine 4×4" HT (MX-HT-ISPM15)',
      dimsMm: `89 × 89 × ${lMm} mm`,
      purpose: 'Longitudinal base runners with 45° chamfers for pallet jack entry'
    });

    // Perimeter & Corner Cleats (Solid Pine 1x4")
    const cleatLumberM = ((4 * lMm + 4 * wMm + 8 * wallHeightMm) / 1000);
    totalLumberM += cleatLumberM;
    items.push({
      part: 'Perimeter Wall & Lid Cleats',
      qty: 12,
      material: 'Solid Pine 1×4" HT (MX-HT-ISPM15)',
      dimsMm: `19 × 89 × Var mm (Total: ${cleatLumberM.toFixed(1)}m)`,
      purpose: 'External perimeter structural framing to stiffen plywood sheets'
    });

    // Foam Lining
    if (foamPaddingMm > 0) {
      const foamArea = (2 * (outerCm.w * 10 * outerCm.l * 10) + 2 * (outerCm.l * 10 * outerCm.h * 10) + 2 * (outerCm.w * 10 * outerCm.h * 10)) / 1000000;
      totalFoamM3 = foamArea * (foamPaddingMm / 1000);
      items.push({
        part: 'Interior Foam Cushioning Lining',
        qty: 6,
        material: `Closed-Cell PE Foam ${foamPaddingMm}mm`,
        dimsMm: `Fitted to internal cavity × ${foamPaddingMm} mm`,
        purpose: 'Non-abrasive stone shock and vibration dampening envelope'
      });
    }
  } else {
    // Pallet
    const isGma = spec.style === 'pallet_gma';
    const runnerCount = spec.skidMm?.count ?? 3;
    const topCount = spec.deckboards?.countTop ?? (isGma ? 7 : 5);
    const bottomCount = spec.deckboards?.countBottom ?? (isGma ? 5 : 3);
    const lMm = Math.round(outerCm.l * 10);
    const wMm = Math.round(outerCm.w * 10);

    totalLumberM = (runnerCount * lMm + (topCount + bottomCount) * wMm) / 1000;

    items.push({
      part: 'Pallet Stringers / Runners',
      qty: runnerCount,
      material: 'Solid Pine HT Lumber (MX-HT-ISPM15)',
      dimsMm: `38 × 89 × ${lMm} mm`,
      purpose: 'Four-way notched stringer runners for forklift tine entry'
    });
    items.push({
      part: 'Top Deckboards',
      qty: topCount,
      material: 'Solid Pine HT Board (MX-HT-ISPM15)',
      dimsMm: `20 × 95 × ${wMm} mm`,
      purpose: 'Cargo supporting top surface with balanced deck gaps'
    });
    items.push({
      part: 'Bottom Deckboards',
      qty: bottomCount,
      material: 'Solid Pine HT Board (MX-HT-ISPM15)',
      dimsMm: `20 × 95 × ${wMm} mm`,
      purpose: 'Ground bearing bottom skid boards for conveyor & stacking'
    });
  }

  const metrics = computePackagingMetrics(spec);

  return {
    items,
    totalPlywoodM2: Number(totalPlywoodM2.toFixed(2)),
    totalLumberM: Number(totalLumberM.toFixed(1)),
    totalCardboardM2: Number(totalCardboardM2.toFixed(2)),
    totalFoamM3: Number(totalFoamM3.toFixed(3)),
    tareWeightKg: metrics.tareWeightKg,
    estimatedCostMxn: metrics.estimatedCostMxn
  };
}

// ── 2D Dieline & Cut Layout SVG Generator ─────────────────────────────────────

export function generateDielineSvg(spec: PackagingSpec): string {
  const { kind, innerCm, outerCm, boardThicknessMm } = spec;

  if (kind === 'cardboard') {
    // FEFCO 0201 Unfolded Blank Diagram
    // Width = Glue flap (g) + Length 1 + Width 1 + Length 2 + Width 2
    const g = 35;
    const t = boardThicknessMm;
    const L = Math.round(innerCm.l * 10);
    const W = Math.round(innerCm.w * 10);
    const H = Math.round(innerCm.h * 10);
    const flapH = Math.round(W / 2);

    const totalW = g + 2 * L + 2 * W;
    const totalH = H + 2 * flapH;

    // ViewBox with padding
    const pad = 60;
    const vbW = totalW + pad * 2;
    const vbH = totalH + pad * 2;

    const x0 = pad;
    const yFlapTop = pad;
    const yBodyTop = pad + flapH;
    const yBodyBottom = yBodyTop + H;
    const yFlapBottom = yBodyBottom + flapH;

    const xG = x0;
    const xL1 = xG + g;
    const xW1 = xL1 + L;
    const xL2 = xW1 + W;
    const xW2 = xL2 + L;
    const xEnd = xW2 + W;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" style="background:#090b0e; font-family: ui-monospace, monospace;">
      <defs>
        <pattern id="glue-hatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#7FBBFF" stroke-width="1.5" opacity="0.6" />
        </pattern>
      </defs>

      <!-- Grid lines -->
      <line x1="${pad}" y1="${vbH - 20}" x2="${vbW - pad}" y2="${vbH - 20}" stroke="#ffffff" stroke-opacity="0.15" stroke-dasharray="4,4" />

      <!-- Glue Flap -->
      <polygon points="${xG},${yBodyTop + 15} ${xL1},${yBodyTop} ${xL1},${yBodyBottom} ${xG},${yBodyBottom - 15}" fill="url(#glue-hatch)" stroke="#7FBBFF" stroke-width="1.5" />
      <text x="${xG + 10}" y="${yBodyTop + H / 2}" fill="#7FBBFF" font-size="11" font-weight="bold" transform="rotate(-90 ${xG + 10} ${yBodyTop + H / 2})" text-anchor="middle">GLUE FLAP (35mm)</text>

      <!-- Main Panels Outline (Solid Cuts) -->
      <!-- Top flap cuts -->
      <line x1="${xL1}" y1="${yFlapTop}" x2="${xEnd}" y2="${yFlapTop}" stroke="#ffffff" stroke-width="2" />
      <line x1="${xL1}" y1="${yFlapTop}" x2="${xL1}" y2="${yBodyTop}" stroke="#ffffff" stroke-width="2" />
      <line x1="${xW1}" y1="${yFlapTop}" x2="${xW1}" y2="${yBodyTop}" stroke="#ffffff" stroke-width="2" />
      <line x1="${xL2}" y1="${yFlapTop}" x2="${xL2}" y2="${yBodyTop}" stroke="#ffffff" stroke-width="2" />
      <line x1="${xW2}" y1="${yFlapTop}" x2="${xW2}" y2="${yBodyTop}" stroke="#ffffff" stroke-width="2" />
      <line x1="${xEnd}" y1="${yFlapTop}" x2="${xEnd}" y2="${yBodyTop}" stroke="#ffffff" stroke-width="2" />

      <!-- Bottom flap cuts -->
      <line x1="${xL1}" y1="${yFlapBottom}" x2="${xEnd}" y2="${yFlapBottom}" stroke="#ffffff" stroke-width="2" />
      <line x1="${xL1}" y1="${yBodyBottom}" x2="${xL1}" y2="${yFlapBottom}" stroke="#ffffff" stroke-width="2" />
      <line x1="${xW1}" y1="${yBodyBottom}" x2="${xW1}" y2="${yFlapBottom}" stroke="#ffffff" stroke-width="2" />
      <line x1="${xL2}" y1="${yBodyBottom}" x2="${xL2}" y2="${yFlapBottom}" stroke="#ffffff" stroke-width="2" />
      <line x1="${xW2}" y1="${yBodyBottom}" x2="${xW2}" y2="${yFlapBottom}" stroke="#ffffff" stroke-width="2" />
      <line x1="${xEnd}" y1="${yBodyBottom}" x2="${xEnd}" y2="${yFlapBottom}" stroke="#ffffff" stroke-width="2" />

      <!-- Outer perimeter right side -->
      <line x1="${xEnd}" y1="${yBodyTop}" x2="${xEnd}" y2="${yBodyBottom}" stroke="#ffffff" stroke-width="2" />

      <!-- Score / Crease lines (Dashed Cyan) -->
      <!-- Horizontal crease: top flaps -->
      <line x1="${xL1}" y1="${yBodyTop}" x2="${xEnd}" y2="${yBodyTop}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />
      <!-- Horizontal crease: bottom flaps -->
      <line x1="${xL1}" y1="${yBodyBottom}" x2="${xEnd}" y2="${yBodyBottom}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />
      <!-- Vertical crease folds between body panels -->
      <line x1="${xL1}" y1="${yBodyTop}" x2="${xL1}" y2="${yBodyBottom}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />
      <line x1="${xW1}" y1="${yBodyTop}" x2="${xW1}" y2="${yBodyBottom}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />
      <line x1="${xL2}" y1="${yBodyTop}" x2="${xL2}" y2="${yBodyBottom}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />
      <line x1="${xW2}" y1="${yBodyTop}" x2="${xW2}" y2="${yBodyBottom}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="6,4" />

      <!-- Body Panel Labels -->
      <rect x="${xL1 + 10}" y="${yBodyTop + 10}" width="${L - 20}" height="${H - 20}" rx="6" fill="#38bdf8" fill-opacity="0.04" stroke="#38bdf8" stroke-opacity="0.1" />
      <text x="${xL1 + L / 2}" y="${yBodyTop + H / 2 - 8}" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">FRONT (L)</text>
      <text x="${xL1 + L / 2}" y="${yBodyTop + H / 2 + 12}" fill="#38bdf8" font-size="11" text-anchor="middle">${innerCm.l} cm</text>

      <rect x="${xW1 + 10}" y="${yBodyTop + 10}" width="${W - 20}" height="${H - 20}" rx="6" fill="#38bdf8" fill-opacity="0.04" stroke="#38bdf8" stroke-opacity="0.1" />
      <text x="${xW1 + W / 2}" y="${yBodyTop + H / 2 - 8}" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">SIDE (W)</text>
      <text x="${xW1 + W / 2}" y="${yBodyTop + H / 2 + 12}" fill="#38bdf8" font-size="11" text-anchor="middle">${innerCm.w} cm</text>

      <rect x="${xL2 + 10}" y="${yBodyTop + 10}" width="${L - 20}" height="${H - 20}" rx="6" fill="#38bdf8" fill-opacity="0.04" stroke="#38bdf8" stroke-opacity="0.1" />
      <text x="${xL2 + L / 2}" y="${yBodyTop + H / 2 - 8}" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">BACK (L)</text>
      <text x="${xL2 + L / 2}" y="${yBodyTop + H / 2 + 12}" fill="#38bdf8" font-size="11" text-anchor="middle">${innerCm.l} cm</text>

      <rect x="${xW2 + 10}" y="${yBodyTop + 10}" width="${W - 20}" height="${H - 20}" rx="6" fill="#38bdf8" fill-opacity="0.04" stroke="#38bdf8" stroke-opacity="0.1" />
      <text x="${xW2 + W / 2}" y="${yBodyTop + H / 2 - 8}" fill="#ffffff" font-size="14" font-weight="bold" text-anchor="middle">SIDE (W)</text>
      <text x="${xW2 + W / 2}" y="${yBodyTop + H / 2 + 12}" fill="#38bdf8" font-size="11" text-anchor="middle">${innerCm.w} cm</text>

      <!-- Flap Labels -->
      <text x="${xL1 + L / 2}" y="${yFlapTop + flapH / 2}" fill="#ffffff" fill-opacity="0.4" font-size="10" text-anchor="middle">Top Flap (${(innerCm.w / 2).toFixed(1)}cm)</text>
      <text x="${xL1 + L / 2}" y="${yFlapBottom - flapH / 2}" fill="#ffffff" fill-opacity="0.4" font-size="10" text-anchor="middle">Bottom Flap (${(innerCm.w / 2).toFixed(1)}cm)</text>

      <!-- Dimension Callouts -->
      <text x="${pad}" y="${pad - 22}" fill="#94a3b8" font-size="12" font-weight="bold">FEFCO 0201 RSC DIE-CUT BLANK — BLANK: ${totalW} × ${totalH} mm (t = ${t}mm)</text>
      <text x="${pad}" y="${pad - 8}" fill="#64748b" font-size="10">Solid White: Outer Cut / Slit Line · Dashed Cyan: Score / Bend Crease Line</text>
    </svg>`;
  } else if (kind === 'crate') {
    // ISPM-15 Cleated Plywood Crate Panel Layout
    const pad = 40;
    const vbW = 900;
    const vbH = 540;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" style="background:#090b0e; font-family: ui-monospace, monospace;">
      <defs>
        <pattern id="wood-hatch" width="12" height="12" patternTransform="rotate(25 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="12" stroke="#d97706" stroke-width="0.8" opacity="0.3" />
        </pattern>
      </defs>

      <!-- Title & ISPM-15 Mark -->
      <text x="${pad}" y="32" fill="#f59e0b" font-size="14" font-weight="bold">ISPM-15 CLEATED PLYWOOD CRATE PANEL FABRICATION LAYOUT</text>
      <text x="${pad}" y="48" fill="#78716c" font-size="10">External: ${outerCm.w} × ${outerCm.l} × ${outerCm.h} cm · Usable Inner: ${innerCm.w} × ${innerCm.l} × ${innerCm.h} cm</text>

      <!-- Official IPPC Wheat Mark Vector Stamp -->
      <g transform="translate(680, 16)">
        <rect x="0" y="0" width="170" height="64" rx="4" fill="#1c1917" stroke="#f59e0b" stroke-width="1.8" />
        <line x1="50" y1="0" x2="50" y2="64" stroke="#f59e0b" stroke-width="1.8" />
        <!-- IPPC symbol -->
        <text x="25" y="24" fill="#f59e0b" font-size="10" font-weight="bold" text-anchor="middle">IPPC</text>
        <path d="M 25 30 L 25 56 M 20 38 L 25 32 L 30 38 M 20 48 L 25 42 L 30 48" stroke="#f59e0b" stroke-width="1.5" fill="none" />
        <!-- HT MX registration mark -->
        <text x="60" y="24" fill="#f59e0b" font-size="11" font-weight="bold">MX - 042</text>
        <text x="60" y="44" fill="#f59e0b" font-size="11" font-weight="bold">HT</text>
        <text x="60" y="56" fill="#78716c" font-size="8">ISPM-15 COMPLIANT</text>
      </g>

      <!-- Panel 1: Floor Bed (18mm) -->
      <g transform="translate(40, 90)">
        <rect x="0" y="0" width="240" height="170" rx="4" fill="url(#wood-hatch)" stroke="#f59e0b" stroke-width="1.5" />
        <rect x="0" y="0" width="240" height="170" fill="#f59e0b" fill-opacity="0.05" />
        <!-- Skid runner positions underneath (dashed) -->
        <line x1="20" y1="0" x2="20" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        <line x1="120" y1="0" x2="120" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        <line x1="220" y1="0" x2="220" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        <text x="120" y="80" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">1. CRATE FLOOR PANEL</text>
        <text x="120" y="98" fill="#f59e0b" font-size="10" text-anchor="middle">18mm Plywood + 3× Skids (89×89mm)</text>
        <text x="120" y="114" fill="#78716c" font-size="9" text-anchor="middle">${outerCm.w} × ${outerCm.l} cm</text>
      </g>

      <!-- Panel 2: Top Lid (12mm) -->
      <g transform="translate(310, 90)">
        <rect x="0" y="0" width="240" height="170" rx="4" fill="url(#wood-hatch)" stroke="#f59e0b" stroke-width="1.5" />
        <rect x="0" y="0" width="240" height="170" fill="#f59e0b" fill-opacity="0.05" />
        <!-- Cleats perimeter -->
        <rect x="8" y="8" width="224" height="154" fill="none" stroke="#d97706" stroke-width="1.5" stroke-dasharray="4,3" />
        <text x="120" y="80" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">2. TOP LID PANEL</text>
        <text x="120" y="98" fill="#f59e0b" font-size="10" text-anchor="middle">12mm Plywood + Cleat Frame</text>
        <text x="120" y="114" fill="#78716c" font-size="9" text-anchor="middle">${outerCm.w} × ${outerCm.l} cm</text>
      </g>

      <!-- Panel 3: Long Side Panel 1 -->
      <g transform="translate(580, 90)">
        <rect x="0" y="0" width="280" height="170" rx="4" fill="url(#wood-hatch)" stroke="#f59e0b" stroke-width="1.5" />
        <rect x="0" y="0" width="280" height="170" fill="#f59e0b" fill-opacity="0.05" />
        <!-- Cleat frame & diagonal brace -->
        <rect x="6" y="6" width="268" height="158" fill="none" stroke="#d97706" stroke-width="1.5" />
        <line x1="6" y1="6" x2="274" y2="164" stroke="#d97706" stroke-width="1.5" />
        <text x="140" y="80" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">3. LONG SIDE (2×)</text>
        <text x="140" y="98" fill="#f59e0b" font-size="10" text-anchor="middle">12mm Plywood + Diagonal Cleat</text>
        <text x="140" y="114" fill="#78716c" font-size="9" text-anchor="middle">${outerCm.l} × ${outerCm.h} cm</text>
      </g>

      <!-- Panel 4: End Panel (2x) -->
      <g transform="translate(40, 290)">
        <rect x="0" y="0" width="180" height="170" rx="4" fill="url(#wood-hatch)" stroke="#f59e0b" stroke-width="1.5" />
        <rect x="0" y="0" width="180" height="170" fill="#f59e0b" fill-opacity="0.05" />
        <rect x="6" y="6" width="168" height="158" fill="none" stroke="#d97706" stroke-width="1.5" />
        <text x="90" y="80" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">4. END PANEL (2×)</text>
        <text x="90" y="98" fill="#f59e0b" font-size="10" text-anchor="middle">12mm Plywood Cleated</text>
        <text x="90" y="114" fill="#78716c" font-size="9" text-anchor="middle">${outerCm.w} × ${outerCm.h} cm</text>
      </g>

      <!-- Skid Detail -->
      <g transform="translate(250, 290)">
        <rect x="0" y="0" width="610" height="80" rx="4" fill="#1c1917" stroke="#f59e0b" stroke-width="1.2" />
        <text x="20" y="26" fill="#f59e0b" font-size="11" font-weight="bold">5. SOLID PINE SKID RUNNERS (3× RUNNERS)</text>
        <text x="20" y="46" fill="#ffffff" font-size="10">89 × 89 × ${Math.round(outerCm.l * 10)} mm Solid Pine HT · 45° chamfers on leading edges for pallet jacks</text>
        <!-- Chamfer diagram -->
        <polygon points="540,65 560,35 590,35 590,65" fill="#d97706" fill-opacity="0.4" stroke="#d97706" stroke-width="1.5" />
        <text x="565" y="24" fill="#78716c" font-size="8" text-anchor="middle">45° Chamfer</text>
      </g>

      <!-- Hardware & Assembly note -->
      <g transform="translate(250, 390)">
        <rect x="0" y="0" width="610" height="70" rx="4" fill="#141819" stroke="#ffffff" stroke-opacity="0.1" />
        <text x="20" y="24" fill="#94a3b8" font-size="10" font-weight="bold">ASSEMBLY FASTENING SPECIFICATION:</text>
        <text x="20" y="42" fill="#64748b" font-size="9">• Skid runners through-screwed from floor using #10 × 3" exterior screws @ 150mm spacing</text>
        <text x="20" y="56" fill="#64748b" font-size="9">• Wall cleats ring-shank nailed or screwed from exterior; top lid fastened with removable Torx T25 screws</text>
      </g>
    </svg>`;
  } else {
    // Freight Pallet Layout
    const pad = 40;
    const vbW = 800;
    const vbH = 500;
    const isGma = spec.style === 'pallet_gma';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="100%" height="100%" style="background:#090b0e; font-family: ui-monospace, monospace;">
      <text x="${pad}" y="32" fill="#38bdf8" font-size="14" font-weight="bold">${isGma ? 'GMA NORTH AMERICA (48×40") FREIGHT PALLET' : 'EUR / EPAL 1 STANDARD FREIGHT PALLET'}</text>
      <text x="${pad}" y="48" fill="#64748b" font-size="10">Overall Dimensions: ${outerCm.w} × ${outerCm.l} × ${outerCm.h} cm · 4-Way Entry</text>

      <!-- Pallet Top View Diagram -->
      <g transform="translate(60, 80)">
        <rect x="0" y="0" width="300" height="360" rx="4" fill="#1e293b" fill-opacity="0.3" stroke="#38bdf8" stroke-width="1.5" />
        <!-- Top deckboards -->
        <rect x="0" y="0" width="300" height="35" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="50" width="300" height="30" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="100" width="300" height="30" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="150" width="300" height="30" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="200" width="300" height="30" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="260" width="300" height="30" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />
        <rect x="0" y="325" width="300" height="35" fill="#38bdf8" fill-opacity="0.2" stroke="#38bdf8" stroke-width="1" />

        <!-- Runners visible through gaps (dashed) -->
        <line x1="15" y1="0" x2="15" y2="360" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        <line x1="150" y1="0" x2="150" y2="360" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        <line x1="285" y1="0" x2="285" y2="360" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />

        <text x="150" y="190" fill="#ffffff" font-size="12" font-weight="bold" text-anchor="middle">TOP DECK (7 BOARDS)</text>
      </g>

      <!-- Side Elevation with Notches -->
      <g transform="translate(400, 100)">
        <text x="0" y="0" fill="#38bdf8" font-size="11" font-weight="bold">STRINGER ELEVATION WITH FORKLIFT NOTCHES</text>
        <rect x="0" y="15" width="340" height="70" fill="#f59e0b" fill-opacity="0.2" stroke="#f59e0b" stroke-width="1.5" />
        <!-- Notches -->
        <rect x="40" y="55" width="80" height="30" fill="#090b0e" stroke="#f59e0b" stroke-width="1.2" />
        <rect x="220" y="55" width="80" height="30" fill="#090b0e" stroke="#f59e0b" stroke-width="1.2" />
        <text x="80" y="72" fill="#f59e0b" font-size="9" text-anchor="middle">Fork Notch</text>
        <text x="260" y="72" fill="#f59e0b" font-size="9" text-anchor="middle">Fork Notch</text>
      </g>

      <!-- Spec details -->
      <g transform="translate(400, 240)">
        <rect x="0" y="0" width="340" height="200" rx="4" fill="#141819" stroke="#ffffff" stroke-opacity="0.1" />
        <text x="16" y="24" fill="#ffffff" font-size="11" font-weight="bold">SPECIFICATIONS & COMPLIANCE</text>
        <text x="16" y="48" fill="#94a3b8" font-size="10">• Standard: ${isGma ? 'NWPCA GMA (US Dry Van)' : 'EPAL 1 (European Logistics)'}</text>
        <text x="16" y="68" fill="#94a3b8" font-size="10">• Dynamic Load: ${isGma ? '1,134 kg (2,500 lbs)' : '1,500 kg (3,300 lbs)'}</text>
        <text x="16" y="88" fill="#94a3b8" font-size="10">• Static Load: 4,000 kg (8,800 lbs)</text>
        <text x="16" y="108" fill="#94a3b8" font-size="10">• Phytosanitary: IPPC ISPM-15 Heat-Treated (HT 56°C/30m)</text>
        <text x="16" y="128" fill="#94a3b8" font-size="10">• Tare Weight: ~${spec.tareWeightKg} kg</text>
        <text x="16" y="148" fill="#94a3b8" font-size="10">• 4-Way Entry (Forklift & Pallet Jack)</text>
      </g>
    </svg>`;
  }
}

// ── Packaging Recommendation Engine ──────────────────────────────────────────

export function recommendPackaging(items: any[]): PackagingSpec {
  let totalWeightKg = 0;
  let maxW = 0;
  let maxL = 0;
  let maxH = 0;
  let isMirrorOrPanel = false;
  let isHeavySculpture = false;

  items.forEach(item => {
    const d = item.data || item;
    const w = Number(d.width_cm || d.widthCm || 20);
    const l = Number(d.length_cm || d.lengthCm || 20);
    const h = Number(d.height_cm || d.heightCm || 20);
    const wt = Number(d.weight_kg || d.weightKg || 5);
    const qty = Number(d.quantity || 1);

    totalWeightKg += wt * qty;
    maxW = Math.max(maxW, w);
    maxL = Math.max(maxL, l);
    maxH = Math.max(maxH, h);

    const desc = `${d.shortDescription || ''} ${d.shape || ''} ${d.type || ''}`.toLowerCase();
    if (desc.includes('mirror') || desc.includes('panel') || desc.includes('sconce')) {
      isMirrorOrPanel = true;
    }
    if (desc.includes('sculpture') || desc.includes('mesa') || desc.includes('table') || wt > 25) {
      isHeavySculpture = true;
    }
  });

  const count = items.length;

  // Decision logic
  if (isHeavySculpture || totalWeightKg > 35 || maxW > 90 || maxL > 90 || maxH > 90) {
    // Solid ISPM-15 Cleated Crate
    const innerCm: DimensionsCm = {
      w: Math.ceil(maxW + 6),
      l: Math.ceil(maxL + 6),
      h: Math.ceil(maxH + 6)
    };
    const resolved = resolvePackagingDimensions({
      kind: 'crate',
      style: 'crate_cleated',
      dimBasis: 'inside',
      innerCm,
      boardThicknessMm: 12,
      foamPaddingMm: 25
    });

    const spec: PackagingSpec = {
      kind: 'crate',
      style: 'crate_cleated',
      dimBasis: 'inside',
      innerCm: resolved.innerCm,
      outerCm: resolved.outerCm,
      materialId: 'ply_12_ht_pine',
      boardThicknessMm: 12,
      cleatMm: { thick: 19, width: 89 },
      skidMm: { height: 89, width: 89, count: 3, chamfered: true },
      deckboards: { countTop: 0, countBottom: 0, thickMm: 0, widthMm: 0, fourWayNotched: false },
      foamPaddingMm: 25,
      ispm15Ht: true,
      tareWeightKg: 0,
      estimatedCostMxn: 0
    };
    const m = computePackagingMetrics(spec);
    spec.tareWeightKg = m.tareWeightKg;
    spec.estimatedCostMxn = m.estimatedCostMxn;
    return spec;
  } else if (count > 8 && totalWeightKg > 150) {
    // Freight Pallet load
    const spec: PackagingSpec = {
      kind: 'pallet',
      style: 'pallet_gma',
      dimBasis: 'outside',
      innerCm: { w: 101.6, l: 121.9, h: 120 },
      outerCm: { w: 101.6, l: 121.9, h: 14 },
      materialId: 'pine_ht_solid',
      boardThicknessMm: 20,
      cleatMm: { thick: 19, width: 89 },
      skidMm: { height: 89, width: 38, count: 3, chamfered: true },
      deckboards: { countTop: 7, countBottom: 5, thickMm: 20, widthMm: 95, fourWayNotched: true },
      foamPaddingMm: 0,
      ispm15Ht: true,
      tareWeightKg: PALLET_STANDARDS.gma.tareKg,
      estimatedCostMxn: PALLET_STANDARDS.gma.costMxn
    };
    return spec;
  } else {
    // FEFCO 0201 Corrugated Cardboard Box
    const foam = isMirrorOrPanel ? 20 : 15;
    const innerCm: DimensionsCm = {
      w: Math.max(16, Math.ceil(maxW + (foam * 2) / 10)),
      l: Math.max(16, Math.ceil(maxL + (foam * 2) / 10)),
      h: Math.max(12, Math.ceil(maxH + (foam * 2) / 10))
    };
    const resolved = resolvePackagingDimensions({
      kind: 'cardboard',
      style: 'fefco_0201',
      dimBasis: 'inside',
      innerCm,
      boardThicknessMm: 7.0, // BC double-wall
      foamPaddingMm: foam
    });

    const spec: PackagingSpec = {
      kind: 'cardboard',
      style: 'fefco_0201',
      dimBasis: 'inside',
      innerCm: resolved.innerCm,
      outerCm: resolved.outerCm,
      materialId: 'flute_bc_7',
      boardThicknessMm: 7.0,
      cleatMm: { thick: 19, width: 89 },
      skidMm: { height: 0, width: 0, count: 0, chamfered: false },
      deckboards: { countTop: 0, countBottom: 0, thickMm: 0, widthMm: 0, fourWayNotched: false },
      foamPaddingMm: foam,
      ispm15Ht: false,
      tareWeightKg: 0,
      estimatedCostMxn: 0
    };
    const m = computePackagingMetrics(spec);
    spec.tareWeightKg = m.tareWeightKg;
    spec.estimatedCostMxn = m.estimatedCostMxn;
    return spec;
  }
}

// ── Export Helpers ────────────────────────────────────────────────────────────

export function downloadSvgFile(filename: string, svgContent: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportPackagingPdf(spec: PackagingSpec, bom: PackagingCutList, title = 'Packaging Specification'): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ONYX.MX PACKAGING STUDIO', 14, 12);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(`WORKSHOP CUT LIST & SPECIFICATION SHEET — ${title.toUpperCase()}`, 14, 20);

  // Specs Box
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 34, pageWidth - 28, 38, 3, 3, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Packaging Type: ${spec.kind.toUpperCase()} (${spec.style})`, 20, 42);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Internal Cavity: ${spec.innerCm.w} × ${spec.innerCm.l} × ${spec.innerCm.h} cm (${(spec.innerCm.w * spec.innerCm.l * spec.innerCm.h / 1000).toFixed(1)} L)`, 20, 49);
  doc.text(`External Footprint: ${spec.outerCm.w} × ${spec.outerCm.l} × ${spec.outerCm.h} cm (${(spec.outerCm.w * spec.outerCm.l * spec.outerCm.h / 1000000).toFixed(3)} m³)`, 20, 56);
  doc.text(`Material: ${spec.materialId} · Board: ${spec.boardThicknessMm}mm · Foam: ${spec.foamPaddingMm}mm`, 20, 63);

  doc.text(`Tare Weight: ~${bom.tareWeightKg} kg`, 120, 49);
  doc.text(`Est. Cost: $${bom.estimatedCostMxn.toLocaleString()} MXN`, 120, 56);
  doc.text(`Phytosanitary: ${spec.ispm15Ht ? 'ISPM-15 Heat-Treated (HT 56°C/30m MX-HT-042)' : 'Non-Wood Exempt'}`, 120, 63);

  // Bill of Materials Table
  const tableRows = bom.items.map(item => [
    item.part,
    item.qty.toString(),
    item.material,
    item.dimsMm,
    item.purpose
  ]);

  autoTable(doc, {
    startY: 78,
    head: [['Part Name', 'Qty', 'Material', 'Dimensions (W × L × T)', 'Assembly Purpose']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 }
  });

  // Footer notes
  const finalY = (doc as any).lastAutoTable.finalY + 12;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Compliance Note: Cross-border trade Mexico-USA requires IPPC HT stamp verification on all solid pine runners & cleats.', 14, finalY);
  doc.text(`Generated by Onyx.mx Logistics Hub on ${new Date().toLocaleDateString()}`, 14, finalY + 5);

  doc.save(`${spec.kind}_${spec.style}_specification.pdf`);
}

export async function exportPackagingXlsx(spec: PackagingSpec, bom: PackagingCutList, title = 'Packaging Cut List'): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Onyx.mx Logistics Packaging Studio';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Cut List & BOM');

  // Title Row
  sheet.mergeCells('A1:E1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `ONYX.MX PACKAGING BOM — ${title.toUpperCase()}`;
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 30;

  // Metadata rows
  sheet.addRow(['Packaging Type', `${spec.kind.toUpperCase()} (${spec.style})`]);
  sheet.addRow(['Inside Dimensions (cm)', `${spec.innerCm.w} × ${spec.innerCm.l} × ${spec.innerCm.h} cm`]);
  sheet.addRow(['Outside Dimensions (cm)', `${spec.outerCm.w} × ${spec.outerCm.l} × ${spec.outerCm.h} cm`]);
  sheet.addRow(['Tare Weight (kg)', bom.tareWeightKg]);
  sheet.addRow(['Estimated Cost (MXN)', bom.estimatedCostMxn]);
  sheet.addRow(['ISPM-15 Phytosanitary', spec.ispm15Ht ? 'YES (Heat-Treated HT)' : 'NO (Exempt)']);
  sheet.addRow([]);

  // Table Header
  const headerRow = sheet.addRow(['Part Name', 'Qty', 'Material', 'Dimensions (mm)', 'Purpose']);
  headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  sheet.getRow(9).height = 22;

  // Data rows
  bom.items.forEach(item => {
    sheet.addRow([item.part, item.qty, item.material, item.dimsMm, item.purpose]);
  });

  // Auto-width columns
  sheet.columns = [
    { key: 'part', width: 32 },
    { key: 'qty', width: 8 },
    { key: 'material', width: 34 },
    { key: 'dims', width: 30 },
    { key: 'purpose', width: 50 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${spec.kind}_${spec.style}_cutlist.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateBoxesCliRecipe(spec: PackagingSpec): string {
  const wMm = Math.round(spec.innerCm.w * 10);
  const lMm = Math.round(spec.innerCm.l * 10);
  const hMm = Math.round(spec.innerCm.h * 10);
  const tMm = 3.0; // 3mm laser bed plywood or MDF divider
  const burnMm = 0.09;

  return `# Boxes.py Divider Recipe for Onyx Workshop Laser PC
# Run in terminal with python -m boxes or boxes.exe:
boxes.exe TypeTray --x=${wMm} --y=${lMm} --h=${hMm} --thickness=${tMm} --burn=${burnMm} --sx="100*2" --sy="100*2" --output=divider_${wMm}x${lMm}.svg`;
}
