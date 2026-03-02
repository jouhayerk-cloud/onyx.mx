import React from 'react';
import { LucideIcon, LucideProps } from 'lucide-react';

interface IconProps extends Omit<LucideProps, 'ref'> {
    icon: LucideIcon;
    size?: number;
}

/**
 * Unified Icon component using Lucide React.
 * Default stroke-width is 1.75 for an elegant, refined look.
 * Size defaults to 18px for nav, pass `size` to override.
 */
export const Icon: React.FC<IconProps> = ({ icon: LucideIconComp, size = 18, strokeWidth = 1.75, ...props }) => {
    return <LucideIconComp size={size} strokeWidth={strokeWidth} {...props} />;
};

export default Icon;
