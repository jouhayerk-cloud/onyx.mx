import React from 'react';

// Full mark: the new SVG favicon graphic.
export const OnyxLogo = ({ className, ...props }: any) => (
    <img
        src={`${import.meta.env.BASE_URL}favicon.svg?v=1.83`}
        alt="Onyx.mx"
        className={`onyx-logo ${className || ''}`}
        {...props}
    />
);

// Compact mark: we use the same SVG graphic for both now since the new favicon is fully stylized.
export const OnyxMiniLogo = ({ className, ...props }: any) => (
    <img
        src={`${import.meta.env.BASE_URL}favicon.svg?v=1.83`}
        alt="Onyx.mx"
        className={`onyx-logo-mini ${className || ''}`}
        {...props}
    />
);

export const OnyxFallbackLogo = ({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img
        src={`${import.meta.env.BASE_URL}favicon.png?v=1.83`}
        alt="Onyx.mx"
        className={`onyx-logo-fallback ${className || ''}`}
        {...props}
    />
);
