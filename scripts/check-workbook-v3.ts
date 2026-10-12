import assert from 'node:assert';
import {
    WORKBOOK_V3_SEASON,
    WORKBOOK_V3_LEDGER_FROM,
    isWorkbookV3Item,
    isWorkbookV3LedgerEntry,
    parseLedgerDateToComparable
} from '../src/features/workbook/workbookV3';

// ─── 1. Constants ────────────────────────────────────────────────────────────
assert.strictEqual(WORKBOOK_V3_SEASON, 826, 'WORKBOOK_V3_SEASON must be 826');
assert.strictEqual(WORKBOOK_V3_LEDGER_FROM, '2026-09-01', 'WORKBOOK_V3_LEDGER_FROM must be 2026-09-01');

// ─── 2. Item workbook values ─────────────────────────────────────────────────
// Case 1: 826 as number
assert.strictEqual(isWorkbookV3Item({ workbook: 826 }), true, '826 as number must match');

// Case 2: 826 as string
assert.strictEqual(isWorkbookV3Item({ workbook: '826' }), true, '"826" as string must match');

// Case 3: "v826" (in V2, parseInt("v826", 10) yields NaN, so without an 826 tag it does NOT match)
assert.strictEqual(isWorkbookV3Item({ workbook: 'v826' }), false, '"v826" yields NaN in V2 and must not match without tag');

// Case 4: 825 (archived season)
assert.strictEqual(isWorkbookV3Item({ workbook: 825 }), false, '825 must not match');

// Case 5: 827
assert.strictEqual(isWorkbookV3Item({ workbook: 827 }), false, '827 must not match');

// Case 6: 0
assert.strictEqual(isWorkbookV3Item({ workbook: 0 }), false, '0 must not match');

// Case 7: null
assert.strictEqual(isWorkbookV3Item({ workbook: null }), false, 'null workbook must not match');

// Case 8: undefined
assert.strictEqual(isWorkbookV3Item({ workbook: undefined }), false, 'undefined workbook must not match');

// Case 9: garbage
assert.strictEqual(isWorkbookV3Item({ workbook: 'garbage' }), false, 'garbage workbook must not match');

// Case 10: nested data.workbook as number
assert.strictEqual(isWorkbookV3Item({ data: { workbook: 826 } }), true, 'data.workbook as 826 must match');

// Case 11: nested data.workbook as string
assert.strictEqual(isWorkbookV3Item({ data: { workbook: '826' } }), true, 'data.workbook as "826" must match');

// Case 12: tag-derived workbook 826 (like V2 fallback)
assert.strictEqual(isWorkbookV3Item({ data: { itemId: 'JM826-001' } }), true, 'Tag JM826-001 must match via fallback');

// Case 13: tag-derived workbook 825
assert.strictEqual(isWorkbookV3Item({ data: { itemId: 'JM825-001' } }), false, 'Tag JM825-001 must not match');

// Case 14: empty object
assert.strictEqual(isWorkbookV3Item({}), false, 'empty item must not match');


// ─── 3. Ledger entry dates at boundaries ─────────────────────────────────────
// Case 15: 2026-08-31 excluded
assert.strictEqual(isWorkbookV3LedgerEntry({ date: '2026-08-31' }), false, '2026-08-31 must be excluded');

// Case 16: 2026-09-01 included
assert.strictEqual(isWorkbookV3LedgerEntry({ date: '2026-09-01' }), true, '2026-09-01 must be included');

// Case 17: 2026-09-01T00:00:00Z included
assert.strictEqual(isWorkbookV3LedgerEntry({ date: '2026-09-01T00:00:00Z' }), true, '2026-09-01T00:00:00Z must be included');

// Case 18: 2026-08-31T23:59:59 excluded
assert.strictEqual(isWorkbookV3LedgerEntry({ date: '2026-08-31T23:59:59' }), false, '2026-08-31T23:59:59 must be excluded');

// Case 19: 2026-08-31T23:59:59Z excluded
assert.strictEqual(isWorkbookV3LedgerEntry({ date: '2026-08-31T23:59:59Z' }), false, '2026-08-31T23:59:59Z must be excluded');

// Case 20: later date 2026-09-15 included
assert.strictEqual(isWorkbookV3LedgerEntry({ date: '2026-09-15' }), true, '2026-09-15 must be included');

// Case 21: later date 2026-10-11 included
assert.strictEqual(isWorkbookV3LedgerEntry({ date: '2026-10-11' }), true, '2026-10-11 must be included');

// Case 22: text format "01 Sep 2026" included
assert.strictEqual(isWorkbookV3LedgerEntry({ date: '01 Sep 2026' }), true, '"01 Sep 2026" must be included');

// Case 23: text format "31 Aug 2026" excluded
assert.strictEqual(isWorkbookV3LedgerEntry({ date: '31 Aug 2026' }), false, '"31 Aug 2026" must be excluded');

// Case 24: text format "Sep 1, 2026" included
assert.strictEqual(isWorkbookV3LedgerEntry({ date: 'Sep 1, 2026' }), true, '"Sep 1, 2026" must be included');

// Case 25: text format "August 31, 2026" excluded
assert.strictEqual(isWorkbookV3LedgerEntry({ date: 'August 31, 2026' }), false, '"August 31, 2026" must be excluded');

// Case 26: Date object 2026-09-01 (month index 8 in JS) included
assert.strictEqual(isWorkbookV3LedgerEntry({ date: new Date(2026, 8, 1) }), true, 'Date object 2026-09-01 must be included');

// Case 27: Date object 2026-08-31 (month index 7 in JS) excluded
assert.strictEqual(isWorkbookV3LedgerEntry({ date: new Date(2026, 7, 31) }), false, 'Date object 2026-08-31 must be excluded');

// Case 28: pay_date fallback field included
assert.strictEqual(isWorkbookV3LedgerEntry({ pay_date: '2026-09-02' }), true, 'pay_date 2026-09-02 must be included');

// Case 29: pay_date fallback field excluded
assert.strictEqual(isWorkbookV3LedgerEntry({ pay_date: '2026-08-30' }), false, 'pay_date 2026-08-30 must be excluded');

// Case 30: created_at fallback field included
assert.strictEqual(isWorkbookV3LedgerEntry({ created_at: '2026-09-05' }), true, 'created_at 2026-09-05 must be included');

// Case 31: missing date (null) excluded
assert.strictEqual(isWorkbookV3LedgerEntry({ date: null }), false, 'null date must be excluded');

// Case 32: missing date (undefined) excluded
assert.strictEqual(isWorkbookV3LedgerEntry({}), false, 'missing date must be excluded');

// Case 33: empty string date excluded
assert.strictEqual(isWorkbookV3LedgerEntry({ date: '' }), false, 'empty string date must be excluded');

// Case 34: invalid string date excluded
assert.strictEqual(isWorkbookV3LedgerEntry({ date: 'not-a-date' }), false, 'invalid date string must be excluded');

// Case 35: null entry excluded
assert.strictEqual(isWorkbookV3LedgerEntry(null), false, 'null entry must be excluded');

// Case 36: parseLedgerDateToComparable helper validation
assert.strictEqual(parseLedgerDateToComparable('2026-09-01'), '2026-09-01');
assert.strictEqual(parseLedgerDateToComparable('2026-08-31'), '2026-08-31');
assert.strictEqual(parseLedgerDateToComparable('2026-09-01T00:00:00Z'), '2026-09-01');
assert.strictEqual(parseLedgerDateToComparable('2026-08-31T23:59:59'), '2026-08-31');
assert.strictEqual(parseLedgerDateToComparable(null), null);
assert.strictEqual(parseLedgerDateToComparable(''), null);
assert.strictEqual(parseLedgerDateToComparable('garbage'), null);

console.log('workbook v3 checks passed');
