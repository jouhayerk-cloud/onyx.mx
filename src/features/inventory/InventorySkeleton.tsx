import React from 'react';
import { SkeletonBox, SkeletonText, SkeletonAvatar, SkeletonBadge } from '../../components/Skeleton';
import { tr } from '../../lib/i18n';

/** Grid skeleton — the Standard card's own shell (cards.css): photo well,
 *  tag line, name, readout and codes, so nothing moves when the data lands. */
export const InventorySkeletonGrid = () => (
    <div
        role="status"
        aria-busy="true"
        aria-label={tr("Loading inventory")}
        className="grid gap-5 px-3 pt-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
    >
        {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="inv-card inv-card--skel" aria-hidden="true">
                <div className="inv-card-media"><SkeletonBox /></div>
                <div className="inv-card-body">
                    <div className="inv-card-id">
                        <SkeletonBox className="h-5 w-28" />
                        <SkeletonBox className="h-3 w-6" />
                    </div>
                    <SkeletonText lines={2} lastLineWidth="60%" />
                    <div className="inv-readout" style={{ height: 50 }} />
                    <div className="inv-card-foot">
                        <SkeletonBox className="h-3 w-16" />
                        <SkeletonBox className="h-3 w-16" />
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
