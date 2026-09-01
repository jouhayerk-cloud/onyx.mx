import React from 'react';
import { SkeletonBox, SkeletonText, SkeletonAvatar, SkeletonBadge } from '../../components/Skeleton';
import { tr } from '../../lib/i18n';

/** Grid skeleton — mirrors the 2→3→4→5 col responsive grid */
export const InventorySkeletonGrid = () => (
    <div
        role="status"
        aria-busy="true"
        aria-label={tr("Loading inventory")}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
    >
        {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="bg-white/3 border border-white/5 rounded-2xl overflow-hidden flex flex-col">
                {/* Image area */}
                <SkeletonBox className="w-full aspect-square rounded-none" />
                {/* Content */}
                <div className="p-2.5 flex flex-col gap-2">
                    <SkeletonText lines={2} lastLineWidth="55%" />
                    <div className="flex gap-1.5 mt-1">
                        <SkeletonBadge width={38} />
                        <SkeletonBadge width={38} />
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <SkeletonBox className="h-3 w-16" />
                        <SkeletonBox className="h-3 w-8" />
                    </div>
                </div>
            </div>
        ))}
        <span className="sr-only">{tr("Loading inventory items…")}</span>
    </div>
);

/** List skeleton — mirrors the compact row layout */
export const InventorySkeletonList = () => (
    <div
        role="status"
        aria-busy="true"
        aria-label={tr("Loading inventory")}
        className="flex flex-col gap-1.5"
    >
        {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/3 border border-white/5">
                {/* Thumbnail */}
                <SkeletonBox className="w-12 h-12 rounded-xl shrink-0" />
                {/* Name + sub */}
                <div className="flex-1 min-w-0">
                    <SkeletonText lines={2} lastLineWidth="50%" />
                </div>
                {/* 4 stat columns */}
                <div className="hidden sm:flex items-center gap-4 shrink-0">
                    {[40, 36, 50, 44].map((w, j) => (
                        <SkeletonBox key={j} className="h-3 rounded-full" style={{ width: w }} />
                    ))}
                </div>
                {/* Expand btn */}
                <SkeletonBox className="w-6 h-6 rounded-lg shrink-0" />
            </div>
        ))}
        <span className="sr-only">{tr("Loading inventory items…")}</span>
    </div>
);
