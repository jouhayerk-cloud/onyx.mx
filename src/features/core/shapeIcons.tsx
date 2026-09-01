/**
 * shapeIcons.tsx
 *
 * One small icon per geometry class from lib/geometry.ts, for heading the
 * Shape smart-filter bar. This is deliberately NOT generateAxonometricDataUrl:
 * that function rasterises a 400x400 canvas per call and is lazy-loaded on
 * purpose so the filter bar doesn't pull in an 800-line 3D renderer just to
 * label eight chips. A filter chip needs a recognisable glyph, not a faithful
 * render — the axonometric icon and the filter chip are different jobs that
 * happened to want the same classifier, not the same artwork.
 *
 * Six of the eight already have a good lucide-react match (box, cylinder,
 * sphere-as-circle, plate-as-disc, sculpture-as-gem, rock-as-mountain); bowl
 * and mirror don't, so those two are hand-authored here in the same stroke
 * style (24x24 viewBox, currentColor, strokeWidth 2, round joins) so all
 * eight read as one set rather than six library icons plus two outliers.
 */

import React from 'react';
import { Box, Cylinder, Circle, Disc3, Gem, Mountain } from 'lucide-react';
import type { Geometry } from '../../lib/geometry';

type IconProps = { size?: number; strokeWidth?: number; className?: string };

const BowlIcon: React.FC<IconProps> = ({ size = 18, strokeWidth = 2, className }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <ellipse cx="12" cy="6.5" rx="8" ry="2.5" />
        <path d="M4 6.5c0 6 2.7 11 8 11s8-5 8-11" />
    </svg>
);

const MirrorIcon: React.FC<IconProps> = ({ size = 18, strokeWidth = 2, className }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <ellipse cx="12" cy="9" rx="7" ry="8" />
        <path d="M12 17v4M8 21h8" />
    </svg>
);

/**
 * Wraps a lucide icon so it fits the same slot as the two hand-authored ones.
 * Needed because lucide ships its icons typed as ForwardRefExoticComponent,
 * which TypeScript will not structurally accept where a Record<Geometry, ...>
 * of plain function components is expected — this wrapper renders the icon
 * through ordinary JSX (`<Icon {...props} />`), which React itself resolves
 * dynamically, sidestepping the mismatch instead of fighting the icon
 * library's own type or widening every consumer's type to accommodate it.
 */
const lucide = (Icon: React.ElementType): React.FC<IconProps> =>
    ({ size, strokeWidth, className }) => <Icon size={size} strokeWidth={strokeWidth} className={className} />;

/**
 * Order and labels come from lib/geometry.ts (GEOMETRIES / GEOMETRY_LABELS) —
 * this map only supplies the glyph, so the two files can't drift apart on
 * which eight values exist.
 */
const ICONS: Record<Geometry, React.FC<IconProps>> = {
    box: lucide(Box),
    bowl: BowlIcon,
    plate: lucide(Disc3),
    cylinder: lucide(Cylinder),
    sphere: lucide(Circle),
    mirror: MirrorIcon,
    octahedron: lucide(Gem),
    polyhedron: lucide(Mountain),
};

export const GeometryIcon: React.FC<{ geom: Geometry } & IconProps> = ({ geom, ...props }) => {
    const Icon = ICONS[geom];
    return <Icon {...props} />;
};
