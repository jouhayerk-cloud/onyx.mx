import React, { useState, useEffect } from 'react';
import { Image, MousePointerClick, ExternalLink, Copy, List } from 'lucide-react';
import type { InventoryItemData } from '../../../lib/Types';
import { vendors } from '../../../lib/consts';
import { tr } from '../../../lib/i18n';
import './itemPane.css';

export interface ItemPaneProps {
    item: InventoryItemData | null;
    photoUrl?: string | null;
    iconUrl?: string | null;
    onOpenDetails: () => void;
    onCopyTag: () => void;
    onShowInList: () => void;
}

function parseHex(hex: string): [number, number, number] | null {
    const clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
        const r = parseInt(clean[0] + clean[0], 16);
        const g = parseInt(clean[1] + clean[1], 16);
        const b = parseInt(clean[2] + clean[2], 16);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
        return [r, g, b];
    }
    if (clean.length === 6) {
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
        return [r, g, b];
    }
    return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
    const toLinear = (val: number) => {
        const c = val / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Computes whether black or white text offers higher WCAG contrast
 * (at least 4.5:1) against the given background hex color.
 */
export function inkOn(hex: string): '#000000' | '#ffffff' {
    const rgb = parseHex(hex);
    if (!rgb) return '#ffffff';
    const L = relativeLuminance(rgb[0], rgb[1], rgb[2]);
    const contrastWhite = (1.0 + 0.05) / (L + 0.05);
    const contrastBlack = (L + 0.05) / 0.05;
    return contrastWhite >= contrastBlack ? '#ffffff' : '#000000';
}

const NAME_SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

/** The vendors table stores names in capitals ("EMMANUEL DE LOS SANTOS"): shown as a person's name, Title Case with the Spanish small words in lower case. */
function toSentenceCase(str: string): string {
    const trimmed = (str || '').trim();
    if (!trimmed) return '';
    return trimmed
        .toLowerCase()
        .split(/\s+/)
        .map((w, i) => (i > 0 && NAME_SMALL_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function resolveVendor(tag: string): { code: string | null; name: string | null; color: string } {
    if (!tag) {
        return { code: null, name: null, color: '#4B5563' };
    }
    const tagUpper = tag.toUpperCase().trim();
    const sortedKeys = Object.keys(vendors).sort((a, b) => b.length - a.length);
    const matchedKey = sortedKeys.find(key => tagUpper.startsWith(key.toUpperCase()));
    if (matchedKey && matchedKey in vendors) {
        const v = vendors[matchedKey as keyof typeof vendors];
        return {
            code: matchedKey,
            name: toSentenceCase(v.name),
            color: v.color,
        };
    }
    return { code: null, name: null, color: '#4B5563' };
}

const numFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
});

function formatDim(val: string | undefined | null): string | null {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (!str || str === '0' || str === '0.0' || str === '0.00') return null;
    const num = Number(str);
    if (!Number.isNaN(num)) {
        if (num <= 0) return null;
        return numFormatter.format(num);
    }
    return str;
}

function formatWeight(val: string | undefined | null): string | null {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (!str || str === '0' || str === '0.0' || str === '0.00') return null;
    const num = Number(str);
    if (!Number.isNaN(num)) {
        if (num <= 0) return null;
        return `${numFormatter.format(num)} kg`;
    }
    return `${str} kg`;
}

function formatPrice(val: string | undefined | null): string | null {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (!str) return null;
    const num = Number(str);
    if (!Number.isNaN(num)) {
        return `$${numFormatter.format(num)}`;
    }
    return str;
}

function formatQuantity(val: string | undefined | null): string | null {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (!str) return null;
    const num = Number(str);
    if (!Number.isNaN(num)) {
        return numFormatter.format(num);
    }
    return str;
}

export const ItemPane: React.FC<ItemPaneProps> = ({
    item,
    photoUrl,
    iconUrl,
    onOpenDetails,
    onCopyTag,
    onShowInList,
}) => {
    const [photoFailed, setPhotoFailed] = useState(false);
    const [iconFailed, setIconFailed] = useState(false);

    useEffect(() => {
        setPhotoFailed(false);
        setIconFailed(false);
    }, [item?.itemId, item?.itemNumber, photoUrl, iconUrl]);

    if (!item) {
        return (
            <section
                className="isl-pane isl-item-pane"
                role="region"
                aria-label={tr('Selected item')}
            >
                <div className="isl-item-empty">
                    <MousePointerClick
                        className="isl-item-empty-icon"
                        size={32}
                        aria-hidden="true"
                    />
                    <h3 className="isl-title">{tr('Nothing selected')}</h3>
                    <p className="isl-caption">
                        {tr('Select an item in the list to see it here.')}
                    </p>
                </div>
            </section>
        );
    }

    const tag = (item.itemId || item.itemNumber || '').trim();
    const vendor = resolveVendor(tag);
    const vendorColor = vendor.color;
    const vendorInk = inkOn(vendorColor);

    const activeSrc = (!photoFailed && photoUrl)
        ? photoUrl
        : (!iconFailed && iconUrl)
            ? iconUrl
            : null;

    const shape = item.shape?.trim() || '';
    const itemType = (item.shortDescription || item.short_description || '').trim();
    const titleParts = [shape, itemType].filter(Boolean);
    const titleLine = titleParts.length > 0 ? titleParts.join(' · ') : (item.name?.trim() || '');

    const material = item.material?.trim() || '';
    const color = item.color?.trim() || '';
    const secondaryParts = [material, color].filter(Boolean);
    const secondaryLine = secondaryParts.join(' · ');

    const dimParts = [
        formatDim(item.widthCm),
        formatDim(item.heightCm),
        formatDim(item.lengthCm),
    ].filter((d): d is string => d !== null);

    const sizeValue = dimParts.length > 0 ? `${dimParts.join(' x ')} cm` : '–';
    const weightValue = formatWeight(item.weightKg);
    const priceValue = formatPrice(item.price);
    const qtyValue = formatQuantity(item.quantity);
    const workbookValue = item.workbook?.trim() || null;

    const statusText = item.status?.trim() || null;
    const isHidden = Boolean(item.is_hidden);
    const hiddenReason = item.hidden_reason?.trim() || undefined;
    const isDescribed = Boolean(
        item.generated_description?.trim() || item.generatedDescription?.trim()
    );
    const isCleaned = Boolean(item.generatedImageUrls?.trim());
    const hasChips = Boolean(statusText || isHidden || isDescribed || isCleaned);

    return (
        <section
            className="isl-pane isl-item-pane"
            role="region"
            aria-label={tr('Selected item')}
        >
            {/* 1. Header row with vendor chip and vendor name */}
            <div className="isl-item-header">
                <span
                    className="isl-item-tag-chip"
                    style={{
                        backgroundColor: vendorColor,
                        color: vendorInk,
                    }}
                >
                    {tag}
                </span>
                {vendor.name ? (
                    <span className="isl-caption isl-item-vendor-name">
                        {vendor.name}
                    </span>
                ) : null}
            </div>

            {/* 2. 4:3 picture box */}
            <div
                className={`isl-item-picture-box${
                    !activeSrc ? ' isl-item-picture-placeholder' : ''
                }`}
            >
                {activeSrc ? (
                    <img
                        src={activeSrc}
                        alt={tag}
                        className="isl-item-picture-img"
                        onError={() => {
                            if (activeSrc === photoUrl) {
                                setPhotoFailed(true);
                            } else {
                                setIconFailed(true);
                            }
                        }}
                    />
                ) : (
                    <>
                        <Image
                            size={28}
                            className="isl-item-placeholder-icon"
                            aria-hidden="true"
                        />
                        <span className="isl-caption">{tr('No photo yet')}</span>
                    </>
                )}
            </div>

            {/* 3. Title line and secondary line */}
            {(titleLine || secondaryLine) ? (
                <div className="isl-item-titles">
                    {titleLine ? (
                        <h2 className="isl-title isl-item-title-primary">
                            {titleLine}
                        </h2>
                    ) : null}
                    {secondaryLine ? (
                        <p className="isl-caption isl-item-title-secondary">
                            {secondaryLine}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {/* 4. Two-column definition list */}
            <dl className="isl-item-dl">
                <div className="isl-item-dl-entry">
                    <dt className="isl-caption">{tr('Size')}</dt>
                    <dd className="isl-title isl-num">{sizeValue}</dd>
                </div>
                {weightValue ? (
                    <div className="isl-item-dl-entry">
                        <dt className="isl-caption">{tr('Weight')}</dt>
                        <dd className="isl-title isl-num">{weightValue}</dd>
                    </div>
                ) : null}
                {priceValue ? (
                    <div className="isl-item-dl-entry">
                        <dt className="isl-caption">{tr('Price')}</dt>
                        <dd className="isl-title isl-num">{priceValue}</dd>
                    </div>
                ) : null}
                {qtyValue ? (
                    <div className="isl-item-dl-entry">
                        <dt className="isl-caption">{tr('Quantity')}</dt>
                        <dd className="isl-title isl-num">{qtyValue}</dd>
                    </div>
                ) : null}
                {workbookValue ? (
                    <div className="isl-item-dl-entry">
                        <dt className="isl-caption">{tr('Workbook')}</dt>
                        <dd className="isl-title isl-num">{workbookValue}</dd>
                    </div>
                ) : null}
            </dl>

            {/* 5. Status chips */}
            {hasChips ? (
                <div className="isl-item-chips" role="list">
                    {statusText ? (
                        <span className="isl-chip" role="listitem">
                            {tr(statusText)}
                        </span>
                    ) : null}
                    {isHidden ? (
                        <span
                            className="isl-chip isl-chip--hidden"
                            role="listitem"
                            title={hiddenReason}
                        >
                            {tr('Hidden')}
                        </span>
                    ) : null}
                    {isDescribed ? (
                        <span className="isl-chip" role="listitem">
                            <span className="isl-dot isl-dot--quiet" aria-hidden="true" />
                            <span>{tr('Described')}</span>
                        </span>
                    ) : null}
                    {isCleaned ? (
                        <span className="isl-chip" role="listitem">
                            <span className="isl-dot isl-dot--quiet" aria-hidden="true" />
                            <span>{tr('Cleaned')}</span>
                        </span>
                    ) : null}
                </div>
            ) : null}

            {/* 6. Three buttons in a row that wraps */}
            <div className="isl-item-actions">
                <button
                    type="button"
                    className="isl-btn isl-btn--primary"
                    onClick={onOpenDetails}
                >
                    <ExternalLink size={14} aria-hidden="true" />
                    <span>{tr('Open details')}</span>
                </button>
                <button
                    type="button"
                    className="isl-btn"
                    onClick={onCopyTag}
                >
                    <Copy size={14} aria-hidden="true" />
                    <span>{tr('Copy tag')}</span>
                </button>
                <button
                    type="button"
                    className="isl-btn"
                    onClick={onShowInList}
                >
                    <List size={14} aria-hidden="true" />
                    <span>{tr('Show in list')}</span>
                </button>
            </div>
        </section>
    );
};
