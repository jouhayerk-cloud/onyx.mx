import React from 'react';

interface CurrencyTagProps {
    type: 'USD' | 'MXN';
    amount: number;
    size?: 'small' | 'medium' | 'large';
    className?: string;
}

export const CurrencyTag: React.FC<CurrencyTagProps> = ({ type, amount, size = 'medium', className = '' }) => {
    const formatter = new Intl.NumberFormat(type === 'MXN' ? 'es-MX' : 'en-US', {
        style: 'currency',
        currency: type,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });

    const sizeClasses = {
        small: 'text-[9px]',
        medium: 'text-[11px]',
        large: 'text-[14px]'
    };

    const colorClasses = {
        MXN: 'text-white/80',
        USD: 'text-white/40'
    };

    return (
        <span className={`font-mono font-black uppercase tracking-tighter ${sizeClasses[size]} ${colorClasses[type]} ${className}`}>
            {formatter.format(amount)} <span className="text-[0.7em] opacity-50 ml-0.5">{type}</span>
        </span>
    );
};
