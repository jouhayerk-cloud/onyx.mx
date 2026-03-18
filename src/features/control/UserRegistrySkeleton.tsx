import React from 'react';
import { SkeletonText, SkeletonAvatar, SkeletonBadge, SkeletonBox } from '../../components/Skeleton';

/** Skeleton for UserRegistryPanel user list */
export const UserRegistrySkeleton = () => (
    <div role="status" aria-busy="true" aria-label="Loading users" className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/3 border border-white/5">
                <SkeletonAvatar size={36} />
                <div className="flex-1 min-w-0">
                    <SkeletonText lines={2} lastLineWidth="40%" />
                </div>
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <SkeletonBadge width={52} />
                    <SkeletonBadge width={44} />
                    <SkeletonBadge width={60} />
                </div>
                <SkeletonBox className="w-5 h-5 rounded-lg shrink-0" />
            </div>
        ))}
        <span className="sr-only">Loading user list…</span>
    </div>
);
