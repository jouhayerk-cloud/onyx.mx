import React, { useState } from 'react';
import { m } from 'framer-motion';

interface TactileSwitchProps {
    active: boolean;
    onChange: (active: boolean) => void;
    label?: string;
    width?: number;
    height?: number;
}

export const TactileSwitch: React.FC<TactileSwitchProps> = ({ active, onChange, label, width = 64, height = 32 }) => {
    return (
        <div className="flex flex-col items-center gap-2">
            <div 
                className="relative cursor-pointer rounded-full flex items-center transition-colors"
                style={{
                    width,
                    height,
                    backgroundColor: active ? 'var(--main-color, #00aeef)' : 'rgba(255,255,255,0.1)',
                    boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255,255,255,0.05)',
                }}
                onClick={() => onChange(!active)}
            >
                <m.div
                    layout
                    initial={false}
                    animate={{
                        x: active ? width - height + 2 : 2,
                        backgroundColor: active ? '#ffffff' : 'rgba(255,255,255,0.6)'
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                        width: height - 4,
                        height: height - 4,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4), inset 0 -2px 4px rgba(0,0,0,0.1)',
                    }}
                >
                    {/* Inner liquid effect from Cubiq Example 2 */}
                    <div className="absolute inset-0 rounded-full" style={{
                        backdropFilter: 'url(#liquid-glass-new)',
                        WebkitBackdropFilter: 'url(#liquid-glass-new)'
                    }} />
                </m.div>
            </div>
            {label && (
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-60 text-white">
                    {label}
                </span>
            )}
        </div>
    );
};
