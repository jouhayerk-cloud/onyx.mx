import React from 'react';

/**
 * ViewSkeleton — Generic route-level loading skeleton
 * Shown via <Suspense> while lazy-loaded views are downloading.
 * Matches the dark glass aesthetic of the app.
 */
export const ViewSkeleton: React.FC<{ rows?: number; cards?: number }> = ({
    rows = 2,
    cards = 6,
}) => (
    <div className="flex-1 p-6 animate-pulse space-y-6">
        {/* Header bar skeleton */}
        <div className="flex items-center gap-4 mb-8">
            <div className="h-7 w-7 rounded-lg bg-white/5" />
            <div className="h-5 w-40 rounded-lg bg-white/5" />
            <div className="ml-auto h-8 w-24 rounded-xl bg-white/5" />
        </div>

        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-white/[0.03] border border-white/5" />
            ))}
        </div>

        {/* Content rows skeleton */}
        {Array.from({ length: rows }).map((_, ri) => (
            <div key={ri} className="space-y-3">
                <div className="h-3 w-28 rounded bg-white/5" />
                <div className={`grid gap-4 grid-cols-${Math.min(cards, 3)} md:grid-cols-${Math.min(cards, 6)}`}>
                    {Array.from({ length: cards }).map((_, ci) => (
                        <div
                            key={ci}
                            className="rounded-2xl bg-white/[0.03] border border-white/5"
                            style={{ height: `${100 + (ci % 3) * 20}px` }}
                        />
                    ))}
                </div>
            </div>
        ))}
    </div>
);

/**
 * TableSkeleton — For list/table view loading states (finance, dashboard)
 */
export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 8 }) => (
    <div className="flex-1 p-6 animate-pulse space-y-2">
        <div className="flex items-center gap-4 mb-6">
            <div className="h-6 w-48 rounded-lg bg-white/5" />
            <div className="ml-auto h-8 w-32 rounded-xl bg-white/5" />
        </div>
        {/* Table header */}
        <div className="flex gap-4 px-4 py-2 border-b border-white/5">
            {[120, 80, 60, 100, 80].map((w, i) => (
                <div key={i} className="h-3 rounded bg-white/5" style={{ width: w }} />
            ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b border-white/[0.03]">
                {[120, 80, 60, 100, 80].map((w, j) => (
                    <div
                        key={j}
                        className="h-4 rounded bg-white/[0.04]"
                        style={{ width: w + (i % 3 === 0 ? -20 : 0) }}
                    />
                ))}
            </div>
        ))}
    </div>
);
