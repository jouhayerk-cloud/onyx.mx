import { useMemo } from 'react';
import { tr } from '../../lib/i18n';
import { calculateCodesAndPrices } from '../../lib/utils';
import { DEFAULT_EXCHANGE_RATE } from '../../lib/consts';
import { resolveItemTag, cx } from '../ui';
import '../../features/entry/entry.css';

export interface LivePreviewCardProps {
    /**
     * The entry as a row (snake_case, as lib/inventoryCreate builds it). For
     * an edit it carries the stored book_barcode, which is shown as printed
     * and never replaced by a recomputed one.
     */
    row: Record<string, any>;
    className?: string;
}

/** "$1,234"; a dash for the '-' placeholder. The old helper rendered "$$1,234". */
const money = (v: unknown): string => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
};

const codeOr = (v: unknown): string => {
    const s = String(v ?? '').trim();
    return s && s !== '-' && !s.includes('—') ? s : '—';
};

/**
 * Prices and book codes for the entry being typed: acquisition, landed and
 * retail in USD, the AQ and LD codes and the barcode.
 *
 * Everything is at the book rate (DEFAULT_EXCHANGE_RATE, 17), as the database
 * trigger computes it; the card used the editable exchangeRateAtom while the
 * header used 17, so one screen showed two answers. It also always computed
 * for v826 (the wizard state had no book), showed a recomputed barcode on an
 * edit instead of the printed one, and read `itemType` while the form held
 * `type`. Those now come from the row.
 */
export function LivePreviewCard({ row, className }: LivePreviewCardProps) {
    const { codes, tag } = useMemo(() => {
        const workbook = String(row?.workbook || '');
        return {
            codes: calculateCodesAndPrices(row || {}, DEFAULT_EXCHANGE_RATE, workbook),
            tag: resolveItemTag(row || {}, { workbook }),
        };
    }, [row]);

    const barcode = tag.barcode || codeOr(codes.bookBarcode);
    const cells: { label: string; value: string; note?: string }[] = [
        { label: tr('Price MXN'), value: money(row?.price_mxn) },
        { label: tr('Acq. USD'), value: money(codes.bookAcquisition) },
        { label: tr('Landed USD'), value: money(codes.bookLanded) },
        { label: tr('Retail USD'), value: money(codes.bookRetail) },
        { label: tr('AQ code'), value: codeOr(codes.bookAqCode) },
        { label: tr('LD code'), value: codeOr(codes.bookLandCode) },
        { label: tr('Barcode'), value: barcode, note: tag.stored ? tr('printed') : undefined },
        { label: tr('Book rate'), value: String(DEFAULT_EXCHANGE_RATE) },
    ];

    return (
        <dl className={cx('entry-codes', className)} aria-label={tr('Prices and codes')}>
            {cells.map(c => (
                <div key={c.label} className="entry-codes__cell">
                    <dt>{c.label}</dt>
                    <dd className="ui-tnum">
                        {c.value}
                        {c.note && <small> · {c.note}</small>}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
