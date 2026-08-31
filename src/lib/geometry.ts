/**
 * geometry.ts — the shape taxonomy.
 *
 * Extracted verbatim from generateAxonometricDataUrl() in axonometric.ts, where
 * it had been the private first step of drawing an icon. It is pulled out here
 * because two unrelated consumers need the same answer:
 *
 *   1. the axonometric renderer, which picks a mesh from it
 *   2. the inventory tag filters, which use it as the top of their hierarchy
 *
 * That second use is the reason this file exists. Inventory `shape` and
 * `short_description` are free text typed by several people across two
 * languages, so deriving filter tags from them directly yields hundreds of
 * near-duplicate chips. This classifier collapses that text into EIGHT stable
 * values — a bounded vocabulary that can head a hierarchy and already has an
 * icon per entry.
 *
 * Living in its own module rather than in axonometric.ts also keeps the filter
 * bar off the 800-line 3D rasteriser, which is lazy-loaded on purpose.
 *
 * Semantics are preserved exactly, including the branch ORDER, which carries
 * real meaning: `plate` must be tested before `cylinder` or a round dish
 * becomes a cylinder, and `mirror` before `cylinder` or a round mirror does
 * the same. Do not reorder these to tidy them.
 *
 * Scope note: this replaces the geometry selection only. The separate plate
 * test that forces shallow round DIMENSIONS stays in axonometric.ts — it is
 * about the mesh's proportions, not its class, and no other consumer wants it.
 */

export type Geometry =
    | 'box'
    | 'bowl'
    | 'plate'
    | 'mirror'
    | 'cylinder'
    | 'sphere'
    | 'octahedron'
    | 'polyhedron';

/** Display order for filter UI: most common first, then by visual family. */
export const GEOMETRIES: Geometry[] = [
    'box', 'bowl', 'plate', 'cylinder', 'sphere', 'mirror', 'octahedron', 'polyhedron',
];

/**
 * Human labels. These name what the operator sees on a shelf, not what the
 * renderer draws — `octahedron` is a sculpture and `polyhedron` is a rough
 * stone, and nobody in the warehouse calls them by their mesh.
 */
export const GEOMETRY_LABELS: Record<Geometry, string> = {
    box: 'Box',
    bowl: 'Bowl',
    plate: 'Plate',
    cylinder: 'Cylinder',
    sphere: 'Sphere',
    mirror: 'Mirror',
    octahedron: 'Sculpture',
    polyhedron: 'Rock',
};

export interface GeometryClass {
    geom: Geometry;
    /**
     * True for any mirror, INCLUDING one classified as `box`. A rectangular
     * mirror is drawn as a box but still needs the reflective surface
     * treatment, so this is deliberately not derivable from `geom`.
     */
    isMirror: boolean;
}

/**
 * Classifies an item from its shape and description strings.
 *
 * Both fields are searched because the vocabulary is split between them
 * inconsistently across the 500-row history — "Bowl" lands in `shape` on some
 * rows and in `short_description` on others. Spanish terms appear throughout
 * for the same reason.
 */
export function classifyGeometry(shapeStr: string = '', descStr: string = ''): GeometryClass {
    const s = String(shapeStr ?? '').toLowerCase();
    const t = String(descStr ?? '').toLowerCase();
    const has = (...words: string[]) => words.some(w => s.includes(w) || t.includes(w));

    if (has('bowl', 'canoe', 'canoa')) return { geom: 'bowl', isMirror: false };

    if (has('plate', 'plato', 'tray', 'dish')) return { geom: 'plate', isMirror: false };

    if (has('mirror')) {
        // A mirror's outline decides the mesh; everything unqualified is a box,
        // because a rectangular mirror is by far the common case.
        if (has('rectangular', 'squared')) return { geom: 'box', isMirror: true };
        if (has('round', 'circle', 'redondo', 'oval')) return { geom: 'mirror', isMirror: true };
        return { geom: 'box', isMirror: true };
    }

    // 'cilinder' is a real recurring misspelling in the data, not a typo here.
    // The original only tested it against the description; testing `shape` too
    // is the one deliberate widening in this extraction, and it can only pull
    // misspelled rows into the class they already belonged in.
    if (has('cylinder', 'cilinder', 'round', 'pendant')) return { geom: 'cylinder', isMirror: false };

    if (has('sphere', 'esfera')) return { geom: 'sphere', isMirror: false };

    if (has('sculpture')) return { geom: 'octahedron', isMirror: false };

    if (has('rock', 'fountain')) return { geom: 'polyhedron', isMirror: false };

    return { geom: 'box', isMirror: false };
}

/** Convenience for callers holding a normalised inventory row. */
export function classifyItem(d: any): GeometryClass {
    return classifyGeometry(
        d?.shape ?? '',
        d?.shortDescription ?? d?.short_description ?? d?.description ?? '',
    );
}
