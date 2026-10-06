import React from 'react';

type OnyxLogoProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & { mono?: boolean };

export const OnyxLogo = ({ className, mono, style, ...props }: OnyxLogoProps) => (
    <img
        src={`${import.meta.env.BASE_URL}onyxlogo.webp`}
        alt="Onyx.mx"
        className={`onyx-logo object-contain ${mono ? 'grayscale opacity-70 drop-shadow-md' : ''} ${className || ''}`}
        style={style}
        {...props}
    />
);

export const OnyxMiniLogo = ({ className, mono, style, ...props }: OnyxLogoProps) => (
    <img
        src={`${import.meta.env.BASE_URL}onyxmini.webp`}
        alt="Onyx.mx Mini"
        className={`onyx-logo-mini object-contain ${mono ? 'grayscale opacity-70 drop-shadow-md' : ''} ${className || ''}`}
        style={style}
        {...props}
    />
);

export const OnyxFallbackLogo = ({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img
        src={`${import.meta.env.BASE_URL}favicon.png?v=1.85`}
        alt="Onyx.mx"
        className={`onyx-logo-fallback object-contain ${className || ''}`}
        {...props}
    />
);
