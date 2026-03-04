import React from 'react';
import { LucideIcon, LucideProps } from 'lucide-react';

interface IconProps extends Omit<LucideProps, 'ref'> {
    icon: LucideIcon;
    size?: number;
}
export const Icon: React.FC<IconProps> = ({ icon: LucideIconComp, size = 18, strokeWidth = 1.75, ...props }) => {
    return <LucideIconComp size={size} strokeWidth={strokeWidth} {...props} />;
};

export default Icon;
