import type { Dims, FigurePart } from '../types';
import { buildLampFigure } from './lamps';
import { buildVesselFigure } from './vessels';
import { buildStoneFigure } from './stone';
import { buildFurnitureFigure } from './furniture';

/**
 * One hairline figure per canonical Type (src/lib/canonicalType.ts ids). Each group builder returns null for ids that
 * are not its own, so the first one that answers wins. null for an unknown id: the caller falls back to the family figure.
 */
export function buildTypeFigure(id: string | null | undefined, dims: Dims | null, holes?: number): FigurePart[] | null {
    if (!id) return null;
    return buildLampFigure(id, dims, holes)
        ?? buildVesselFigure(id, dims, holes)
        ?? buildStoneFigure(id, dims, holes)
        ?? buildFurnitureFigure(id, dims, holes);
}
