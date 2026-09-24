import React from 'react';

// Lettered Onyx cube, redrawn 2026-09-23 from the flat reference artwork.
// Generated path data: each face is a 1000x1000 box mapped onto the cube by a
// 4-point homography, so the drawing's slight perspective survives and strokes
// stay straight. Letters are polygons, not a font, so the mark renders the same
// everywhere (public/favicon.svg carries the same paths and cannot load web
// fonts). Faces are --main-color at three densities over a --secondary-color
// floor, so the mark follows Aqua / Talan; the letters are one frosted white
// path, so overlapping strokes never double up.
const ART = {
    floor: 'M208.0 843.0L600.0 617.0L992.0 843.0L600.0 1070.0Z',
    left: 'M213.0 332.0L600.0 557.0L600.0 990.0L231.0 790.0Z',
    right: 'M600.0 557.0L987.0 332.0L969.0 790.0L600.0 990.0Z',
    top: 'M213.0 332.0L600.0 137.0L987.0 332.0L600.0 557.0Z',
    letters: 'M403.0 667.9L403.0 685.6L402.4 702.7L401.2 719.1L399.4 734.7L397.0 749.5L394.0 763.2L390.5 775.9L386.4 787.3L381.8 797.5L376.8 806.3L371.4 813.8L365.6 819.8L359.4 824.3L352.9 827.4L346.2 828.8L339.3 828.8L332.2 827.1L325.0 824.0L317.8 819.3L310.6 813.1L303.4 805.5L296.3 796.5L289.4 786.2L282.7 774.6L276.2 761.8L270.0 747.8L264.2 732.9L258.8 717.1L253.8 700.5L249.2 683.3L245.2 665.5L241.8 647.2L238.9 628.7L236.6 610.1L234.9 591.5L233.9 573.0L233.6 554.9L233.8 537.1L234.8 520.0L236.4 503.5L238.6 488.0L241.5 473.4L245.0 459.9L249.0 447.6L253.7 436.7L258.8 427.2L264.4 419.1L270.4 412.6L276.9 407.8L283.6 404.6L290.7 403.0L297.9 403.2L305.3 405.1L312.8 408.6L320.4 413.8L327.9 420.6L335.4 428.9L342.7 438.7L349.8 449.9L356.6 462.4L363.1 476.0L369.3 490.7L375.1 506.4L380.4 522.9L385.2 540.1L389.5 557.8L393.3 576.0L396.4 594.4L399.0 612.9L400.9 631.4L402.3 649.8ZM349.7 638.0L349.3 624.9L348.6 611.6L347.7 598.4L346.5 585.4L345.2 572.5L343.6 560.1L341.9 548.0L339.9 536.5L337.8 525.6L335.6 515.3L333.2 505.9L330.7 497.4L328.2 489.8L325.5 483.2L322.8 477.6L320.1 473.2L317.3 469.8L314.6 467.7L311.9 466.7L309.2 466.9L306.6 468.3L304.2 470.9L301.8 474.7L299.6 479.5L297.5 485.5L295.6 492.5L293.9 500.5L292.4 509.4L291.0 519.1L289.9 529.6L289.1 540.8L288.4 552.5L288.0 564.8L287.9 577.4L287.9 590.4L288.3 603.5L288.8 616.8L289.6 630.0L290.6 643.1L291.8 656.1L293.2 668.7L294.8 680.9L296.6 692.6L298.5 703.8L300.6 714.3L302.9 724.1L305.2 733.1L307.7 741.2L310.2 748.5L312.8 754.7L315.5 759.9L318.1 764.1L320.8 767.2L323.4 769.2L326.1 770.1L328.6 769.9L331.1 768.5L333.5 766.1L335.8 762.5L338.0 757.9L340.0 752.3L341.9 745.6L343.6 738.1L345.1 729.6L346.5 720.3L347.6 710.2L348.5 699.4L349.2 688.0L349.7 676.1L349.9 663.7L349.9 651.0ZM425.6 474.0L479.3 505.1L484.3 910.6L433.0 882.7ZM536.2 538.1L588.8 568.6L589.3 967.6L538.9 940.2ZM425.6 474.0L488.8 510.6L589.3 967.6L529.8 935.3ZM611.2 568.6L673.2 532.6L718.0 725.4L666.0 754.5ZM715.0 508.4L778.2 471.8L718.0 725.4L666.0 754.5ZM666.1 741.4L718.1 712.2L715.7 910.6L664.8 938.2ZM805.3 456.1L869.5 418.9L958.2 778.7L895.7 812.7ZM908.8 396.1L974.3 358.1L858.1 833.2L796.6 866.6ZM540.6 503.4L600.0 469.8L659.4 503.4L600.0 537.7ZM329.3 288.8L384.8 260.7L741.2 456.1L685.6 488.3ZM419.9 242.9L473.7 215.6L830.0 404.8L776.3 435.8ZM329.3 288.8L394.6 255.7L686.2 371.1L621.8 407.0ZM410.2 247.8L473.7 215.6L686.2 371.1L621.8 407.0ZM496.4 204.1L557.9 173.0L959.7 329.9L899.4 364.7ZM543.1 180.5L603.6 149.8L914.1 356.2L852.7 391.7Z',
};

const OnyxCube = ({ className, viewBox, ...props }: React.SVGProps<SVGSVGElement>) => (
    <svg
        width="100%"
        height="100%"
        viewBox={viewBox}
        xmlns="http://www.w3.org/2000/svg"
        className={`onyx-logo ${className || ''}`}
        {...props}
    >
        <path d={ART.floor} fill="var(--secondary-color)" fillOpacity="0.45" />
        <path d={ART.left} fill="var(--main-color)" fillOpacity="0.66" />
        <path d={ART.right} fill="var(--main-color)" fillOpacity="0.82" />
        <path d={ART.top} fill="var(--main-color)" fillOpacity="0.52" />
        <path d={ART.letters} fill="#fff" opacity="0.62" />
    </svg>
);

// Full mark: the cube with breathing room, for login, portals and watermarks.
export const OnyxLogo = (props: React.SVGProps<SVGSVGElement>) => <OnyxCube viewBox="150 100 900 1000" {...props} />;

// Compact mark: cropped tight to cube + floor, for keys, the sidebar and thumbnails.
export const OnyxMiniLogo = (props: React.SVGProps<SVGSVGElement>) => <OnyxCube viewBox="200 130 800 948" {...props} />;

export const OnyxFallbackLogo = ({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img
        src={`${import.meta.env.BASE_URL}OnyxLogo.png`}
        alt="Onyx.mx"
        className={`onyx-logo-fallback ${className || ''}`}
        {...props}
    />
);
