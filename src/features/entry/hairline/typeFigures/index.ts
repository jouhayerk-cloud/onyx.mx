import type { Dims, FigurePart } from '../types';
import { buildLampFigure } from './lamps';
import { buildVesselFigure } from './vessels';
import { buildStoneFigure } from './stone';
import { buildFurnitureFigure } from './furniture';
import { buildMirrorFigure, mirrorVariantOf } from './mirrors';

/**
 * One hairline figure per canonical Type (src/lib/canonicalType.ts ids). Each group builder returns null for ids that
 * are not its own, so the first one that answers wins. null for an unknown id: the caller falls back to the family figure.
 */
export function buildTypeFigure(id: string | null | undefined, dims: Dims | null, holes?: number, variant?: string | null): FigurePart[] | null {
    if (!id) return null;
    // Mirrors have one drawing per shape (round, squared, rectangular); the variant is the Shape text.
    if (id === 'mirror') return buildMirrorFigure(mirrorVariantOf(variant), dims);
    // Order matters: the first group that knows the id wins.
    return buildLampFigure(id, dims, holes, variant)
        ?? buildVesselFigure(id, dims, holes)
        ?? buildStoneFigure(id, dims, holes)
        ?? buildFurnitureFigure(id, dims, holes);
}
