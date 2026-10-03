import { useMemo } from 'react';
import { vendors, DEFAULT_EXCHANGE_RATE } from '../../lib/consts';
import { calculateCodesAndPrices, normalizeInventoryData } from '../../lib/utils';
import { tr } from '../../lib/i18n';
import { cx } from './types';

export interface ItemTagParts {
    /** Vendor prefix, e.g. "EM". */
    vendor: string;
    vendorName: string;
    /** Vendor colour from lib/consts (a printed standard). */
    color: string;
    /** Ink that reads on that colour. */
    ink: string;
    /** Vendor + book, the coloured half: "EM826". */
    head: string;
    /** Item number: "52". */
    number: string;
    /** Landed code after the number, or '' when there is none yet. */
    code: string;
    /** The whole barcode as stored or computed; '' when neither exists. */
    barcode: string;
    /** True when the barcode came from the row (it is printed on a label). */
    stored: boolean;
}

/** Relative luminance, for picking black or white ink on a vendor colour. */
function luminance(hex: string): number {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return 0;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The tag fields for one inventory row (raw snake_case or normalized).
 *
 * A stored book_barcode always wins: it is printed on a label and is never
 * recomputed. It is read from the row itself, not from
 * normalizeInventoryData, whose book_barcode falls back to tag_id / item_id
 * ("AN-001") when the column is empty; a workbook id has a dash, a barcode
 * never does. Without a stored one, calculateCodesAndPrices computes it at
 * the 17 book rate (never the live market rate), as every book code is.
 */
export function resolveItemTag(row: any, opts: { exchangeRate?: number; workbook?: string } = {}): ItemTagParts {
    const norm = normalizeInventoryData(row ?? {});
    const rawId = String(norm.vendorId || norm.itemId || '').toUpperCase();
    const vendor = (rawId.split('-')[0] || rawId.slice(0, 2)).toUpperCase();
    const vendorData = (vendors as Record<string, { name: string; color: string }>)[vendor];
    const color = vendorData?.color ?? '#555555';
    const book = String(norm.workbook || opts.workbook || '').replace(/v/gi, '');
    const itemNumber = String(parseInt(String(norm.itemNumber ?? ''), 10) || '');

    const rawStored = String(row?.book_barcode ?? row?.bookBarcode ?? '').trim();
    const stored = !!rawStored && rawStored !== '-' && !rawStored.includes('-');
    let barcode = stored ? rawStored : '';
    let head = `${vendor}${book}`;
    let rest = '';
    if (!barcode) {
        const codes = calculateCodesAndPrices(row, opts.exchangeRate ?? DEFAULT_EXCHANGE_RATE, opts.workbook ?? '');
        if (codes.bookBarcode && codes.bookBarcode !== '-') {
            barcode = codes.bookBarcode;
            // The display field already carries the split: "EM826 52MAF".
            const [h, r] = codes.bookBarcodeDisplay.split(' ');
            if (h && r !== undefined) { head = h; rest = r; }
        }
    }
    if (barcode && !rest) {
        const upper = barcode.toUpperCase();
        if (head && upper.startsWith(head)) rest = barcode.slice(head.length);
        else {
            // A stored barcode from another book or an older scheme: split it
            // on its own shape (letters + three-digit book) rather than ours.
            const m = /^([A-Z]+\d{3})(.*)$/i.exec(barcode);
            head = m ? m[1] : barcode;
            rest = m ? m[2] : '';
        }
    }
    let number = itemNumber;
    let code = '';
    if (rest) {
        const m = /^(\d+)(.*)$/.exec(rest);
        number = m ? m[1] : itemNumber;
        code = m ? m[2] : rest;
    }
    // numberToCypher returns an em dash when the cypher key is not in the
    // bundle; that is "no code", not a code.
    if (code === '—') code = '';

    return {
        vendor,
        vendorName: vendorData?.name ?? vendor,
        color,
        ink: luminance(color) > 0.2 ? '#0b0908' : '#ffffff',
        head: head || vendor || '?',
        number,
        code,
        barcode,
        stored,
    };
}

export interface ItemTagProps {
    /** An inventory row (raw or normalized), a BatchCreateItem, or entry form state. */
    item: any;
    /** Book rate; defaults to DEFAULT_EXCHANGE_RATE (17). */
    exchangeRate?: number;
    /** Book used when the row has none (e.g. "826"). */
    workbook?: string;
    size?: 'md' | 'lg';
    /** Hide the landed code (e.g. on a public-facing surface). */
    hideCode?: boolean;
    className?: string;
}

/** Vendor + book on the vendor's colour, then number and landed code. */
export function ItemTag({ item, exchangeRate, workbook, size = 'md', hideCode = false, className }: ItemTagProps) {
    const t = useMemo(() => resolveItemTag(item, { exchangeRate, workbook }), [item, exchangeRate, workbook]);
    const title = [t.barcode || `${t.head} ${t.number}`, t.vendorName, t.stored ? tr('Printed barcode') : '']
        .filter(Boolean).join(' · ');
    return (
        <span
            className={cx('ui-tag', size === 'lg' && 'ui-tag--lg', className)}
            title={title}
            style={{ ['--ui-tag-bg' as string]: t.color, ['--ui-tag-ink' as string]: t.ink }}
        >
            <span className="ui-tag__v">{t.head}</span>
            <span className="ui-tag__n">
                {t.number || '—'}
                {!hideCode && (t.code
                    ? <span className="ui-tag__c">{t.code}</span>
                    : <span className="ui-tag__c ui-tag__c--none" aria-hidden="true">·····</span>)}
            </span>
        </span>
    );
}
