import type { Dims, FigurePart } from '../types';
import { buildLampFigure } from './lamps';
import { buildVesselFigure } from './vessels';
import { buildStoneFigure } from './stone';
import { buildFurnitureFigure } from './furniture';
import { buildMirrorFigure, mirrorVariantOf } from './mirrors';
import { currentTypeId, resolveVariant } from '../variantOptions';

/**
 * One hairline figure per canonical Type (src/lib/canonicalType.ts ids). Each group builder returns null for ids that
 * are not its own, so the first one that answers wins. null for an unknown id: the caller falls back to the family figure.
 */
export function buildTypeFigure(rawId: string | null | undefined, dims: Dims | null, holes?: number, variant?: string | null, top?: string | null): FigurePart[] | null {
    if (!rawId) return null;
    // Unified Types (variantOptions UNIFIED_TYPE_IDS): a luminary is a wall panel (every wall panel is lit), a tower lamp is a floor lamp.
    const id = currentTypeId(rawId) ?? rawId;
    // Mirrors have one drawing per shape (round, squared, rectangular); the variant is the Shape text.
    if (id === 'mirror') return buildMirrorFigure(mirrorVariantOf(variant), dims);
    // The sub-shape: an option value or the legacy Shape text, resolved against the Type's options (variantOptions.ts); every builder gets the option VALUE.
    const v = resolveVariant(id, variant);
    // Order matters: the first group that knows the id wins.
    return buildLampFigure(id, dims, holes, v, top)
        ?? buildVesselFigure(id, dims, holes, v)
        ?? buildStoneFigure(id, dims, holes, v)
        ?? buildFurnitureFigure(id, dims, holes, v);
}
