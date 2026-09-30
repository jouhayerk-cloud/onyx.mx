import React from 'react';
import { ONYX_MARK } from './onyxMarkArt';

// The lettered Onyx cube, the same vector as public/favicon.svg (see onyxMarkArt.ts).
//
// Full colour by default, from the active theme: the right face is --main-color,
// the top and left faces mix it toward --text-color, and the floor is
// --secondary-color. Mixing toward the text colour keeps the cube readable on
// both grounds: darker teal on Aqua's cream, lighter sage on Talan's stone.
// The letters are holes, so they show whatever the logo sits on.
//
// `mono` draws every face in currentColor at stepped opacities instead, for
// watermarks and placeholders whose callers tint the logo with a text-* class.

type OnyxLogoProps = React.SVGProps<SVGSVGElement> & { mono?: boolean };

const mix = (pct: number) => `color-mix(in srgb, var(--main-color) ${pct}%, var(--text-color))`;

const OnyxCube = ({ className, viewBox, mono, ...props }: OnyxLogoProps) => (
    <svg
        width="100%"
        height="100%"
        viewBox={viewBox}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Onyx.mx"
        className={className}
        {...props}
    >
        {mono ? (
            <g fill="currentColor" fillRule="evenodd">
                <path d={ONYX_MARK.floor} fillOpacity={0.3} />
                <path d={ONYX_MARK.top} fillOpacity={0.75} />
                <path d={ONYX_MARK.left} fillOpacity={0.9} />
                <path d={ONYX_MARK.right} fillOpacity={0.6} />
            </g>
        ) : (
            // The fill attribute is the fallback where color-mix() is unsupported;
            // an invalid inline style value is dropped and the attribute applies.
            <g fillRule="evenodd">
                <path d={ONYX_MARK.floor} fill="var(--secondary-color)" fillOpacity={0.4} />
                <path d={ONYX_MARK.top} fill="var(--main-color)" style={{ fill: mix(80) }} />
                <path d={ONYX_MARK.left} fill="var(--main-color)" style={{ fill: mix(64) }} />
                <path d={ONYX_MARK.right} fill="var(--main-color)" />
            </g>
        )}
    </svg>
);

// Full mark: the cube with breathing room, for login, portals and watermarks.
export const OnyxLogo = ({ className, ...props }: OnyxLogoProps) => (
    <OnyxCube viewBox="22 14 212 228" className={`onyx-logo ${className || ''}`} {...props} />
);

// Compact mark: cropped to the cube and its floor, for keys, the sidebar and thumbnails.
export const OnyxMiniLogo = ({ className, ...props }: OnyxLogoProps) => (
    <OnyxCube viewBox="38 24 180 208" className={`onyx-logo-mini ${className || ''}`} {...props} />
);

export const OnyxFallbackLogo = ({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img
        src={`${import.meta.env.BASE_URL}favicon.png?v=1.84`}
        alt="Onyx.mx"
        className={`onyx-logo-fallback ${className || ''}`}
        {...props}
    />
);
