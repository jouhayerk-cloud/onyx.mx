import { vendors } from '../../lib/consts';
import type { ArchiveItem } from '../archive/types';

export function parseDescription(description: string | null): { color: string | null; shape: string | null; title: string } {
    if (!description) return { color: null, shape: null, title: '' };
    const str = String(description).trim();
    const dashIndex = str.indexOf('-');
    if (dashIndex === -1) {
        return { color: null, shape: null, title: str };
    }
    const color = str.slice(0, dashIndex).trim();
    const shapeStr = str.slice(dashIndex + 1).trim();
    return { color: color || null, shape: shapeStr || null, title: str };
}

export function formatDims(item: ArchiveItem): string {
    const parts = [];
    if (item.height_cm != null) parts.push(item.height_cm);
    if (item.width_cm != null) parts.push(item.width_cm);
    if (item.length_cm != null) parts.push(item.length_cm);
    if (parts.length === 0) return '';
    return parts.join(' × ') + ' cm';
}

export function formatWeight(kg: number | null): string {
    if (kg == null) return '';
    return `${kg} kg`;
}

export function formatNumber(value: number | null, maxDecimals: number = 2): string {
    if (value == null || isNaN(value)) return '—';
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDecimals
    }).format(value);
}

export function formatMoney(value: number | null, currency: 'MXN' | 'USD'): string {
    if (value == null || isNaN(value)) return '—';
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    return formatter.format(value);
}

export function vendorColor(vendor: string): string {
    if (!vendor) return '#4B5563';
    const v = vendors[vendor as keyof typeof vendors];
    return v ? v.color : '#4B5563';
}

export function formatDate(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
