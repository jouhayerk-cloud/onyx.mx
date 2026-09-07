/**
 * Finding a donor item for an item that has no photograph.
 *
 * 87 of the 497 live rows carry no image, and not one of them has a
 * description, a colour or a type -- the AI pipeline needs a photo, so those
 * items have never been through it. They cannot be sold and they cannot be
 * exported, and they stay that way until someone photographs them.
 *
 * Most of them are not novel objects, though. They are another piece of a shape
 * and type the catalogue already describes. So rather than wait for a
 * photograph, we find the closest item that DOES have generated content and
 * write a variation of it.
 *
 * Match rates measured against the live table on 7 September 2026, 87 orphans
 * against 208 donors:
 *
 *   shape + type + material + colour   11 / 87
 *   shape + type + material            76 / 87     <- the workhorse
 *   shape + type                       80 / 87
 *   shape alone                        86 / 87
 *
 * Colour is deliberately NOT part of the primary key. It is the attribute that
 * varies most between two pieces cut from the same stone, which is exactly what
 * we are asking the model to vary -- keying on it collapses the match rate to
 * 11 and matches only the items that needed the least help.
 */

export type MatchTier = 'exact' | 'strong' | 'medium' | 'weak';

export interface DonorCandidate {
    id: string;
    shape: string;
    type: string;
    material: string;
    color: string;
    widthCm: number;
    heightCm: number;
    lengthCm: number;
    /** The generated content this donor can lend. */
    description: string;
    marketingDescription: string;
    dominantColors: string[];
    generatedType: string;
}

export interface DonorMatch {
    donor: DonorCandidate;
    tier: MatchTier;
    /** How close the donor's dimensions are, 0 = identical. Used only to rank
     *  within a tier, never to cross one. */
    sizeDistance: number;
}

const TIER_ORDER: MatchTier[] = ['exact', 'strong', 'medium', 'weak'];

/** Human-readable confidence, for the run log and the review UI. */
export const TIER_LABEL: Record<MatchTier, string> = {
    exact:  'shape, type, material and colour',
    strong: 'shape, type and material',
    medium: 'shape and type',
    weak:   'shape only',
};

const norm = (v: unknown): string => String(v ?? '').trim().toUpperCase();

/**
 * Relative dimension distance, so a 5 cm difference on a 10 cm bowl outranks a
 * 5 cm difference on a 180 cm panel. Missing dimensions on either side
 * contribute nothing rather than counting as a perfect match.
 */
export const sizeDistance = (a: DonorCandidate, b: DonorCandidate): number => {
    const axes: Array<keyof DonorCandidate> = ['widthCm', 'heightCm', 'lengthCm'];
    let total = 0;
    let counted = 0;
    for (const axis of axes) {
        const av = Number(a[axis]) || 0;
        const bv = Number(b[axis]) || 0;
        if (av <= 0 || bv <= 0) continue;
        total += Math.abs(av - bv) / Math.max(av, bv);
        counted += 1;
    }
    // No comparable axis: rank last within the tier rather than first.
    return counted === 0 ? Number.POSITIVE_INFINITY : total / counted;
};

const tierFor = (orphan: DonorCandidate, donor: DonorCandidate): MatchTier | null => {
    const sameShape = norm(orphan.shape) === norm(donor.shape) && norm(orphan.shape) !== '';
    if (!sameShape) return null;

    const sameType = norm(orphan.type) === norm(donor.type) && norm(orphan.type) !== '';
    const sameMat  = norm(orphan.material) === norm(donor.material) && norm(orphan.material) !== '';
    const sameCol  = norm(orphan.color) === norm(donor.color) && norm(orphan.color) !== '';

    if (sameType && sameMat && sameCol) return 'exact';
    if (sameType && sameMat) return 'strong';
    if (sameType) return 'medium';
    return 'weak';
};

/** A donor is only useful if it actually has content to lend. */
export const isUsableDonor = (d: DonorCandidate): boolean =>
    !!(d.description?.trim() || d.marketingDescription?.trim());

/**
 * Best donor for one orphan, or null when nothing shares even its shape.
 *
 * Strictly tier-first: a 'strong' match with wildly different dimensions still
 * beats an 'exact'-tier... there is no such case, but the ordering matters for
 * strong vs medium. Size only breaks ties inside a tier.
 */
export function findDonor(orphan: DonorCandidate, donors: DonorCandidate[]): DonorMatch | null {
    let best: DonorMatch | null = null;

    for (const donor of donors) {
        if (donor.id === orphan.id) continue;
        if (!isUsableDonor(donor)) continue;

        const tier = tierFor(orphan, donor);
        if (!tier) continue;

        const dist = sizeDistance(orphan, donor);
        if (!best) { best = { donor, tier, sizeDistance: dist }; continue; }

        const better =
            TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(best.tier) ||
            (tier === best.tier && dist < best.sizeDistance);

        if (better) best = { donor, tier, sizeDistance: dist };
    }

    return best;
}
