import React from 'react';

interface BoxProps { className?: string; style?: React.CSSProperties; }

/** A generic shimmer rectangle — use className for size/shape */
export const SkeletonBox = ({ className = '', style }: BoxProps) => (
    <div className={`skeleton ${className}`} style={style} />
);

/** One or more lines of shimmering text */
export const SkeletonText = ({
    lines = 1,
    className = '',
    lastLineWidth = '60%',
}: { lines?: number; className?: string; lastLineWidth?: string }) => (
    <div className={`flex flex-col gap-1.5 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
            <SkeletonBox
                key={i}
                className="h-2.5"
                style={{ width: i === lines - 1 && lines > 1 ? lastLineWidth : '100%' }}
            />
        ))}
    </div>
);

/** A circular avatar placeholder */
export const SkeletonAvatar = ({ size = 36 }: { size?: number }) => (
    <div
        className="skeleton shrink-0"
        style={{ width: size, height: size, borderRadius: '50%' }}
    />
);

/** A small pill/badge placeholder */
export const SkeletonBadge = ({ width = 48 }: { width?: number }) => (
    <SkeletonBox className="h-4 rounded-full" style={{ width }} />
);

/** A rounded card shell — wrap your skeleton layout inside */
export const SkeletonCard = ({
    className = '',
    children,
}: { className?: string; children?: React.ReactNode }) => (
    <div className={`bg-white/3 border border-white/5 rounded-2xl overflow-hidden ${className}`}>
        {children}
    </div>
);
