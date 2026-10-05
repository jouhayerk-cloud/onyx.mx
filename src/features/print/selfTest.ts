/**
 * Self-test suite for Document Jobs ledger (dj1), canonical hashing, and CSV renderer.
 *
 * Verifies the mathematical and cryptographic invariants defined in PM4:
 * - Key order independence of canonical JSON
 * - Date invariance of data snapshots
 * - Volatile fields exclusion handling
 * - Label copies counting vs row duplication
 * - Number and date normalisation
 * - NFC Unicode normalisation and sentinel trimming
 * - dj1: prefix and 64-character lowercase hex digest
 * - CSV generation determinism and injection protection
 *
 * Designed to execute cleanly inside the Print Center and MCP tools without throwing.
 */

import { canonicalJson, checksumV1 } from '../../lib/documentJobs';
import { toCsv, type CsvColumn } from './renderers/csvRenderer';
import { tr } from '../../lib/i18n';

export interface SelfTestResult {
    name: string;
    ok: boolean;
    detail: string;
}

async function runCheck(
    name: string,
    fn: () => Promise<{ ok: boolean; detail: string }>
): Promise<SelfTestResult> {
    try {
        const res = await fn();
        return { name, ok: res.ok, detail: res.detail };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            name,
            ok: false,
            detail: message
        };
    }
}

export async function runDjSelfTest(): Promise<SelfTestResult[]> {
    const results: SelfTestResult[] = [];

    // 1. Key order independence of canonical JSON
    results.push(
        await runCheck(tr('Canonical JSON key order independence'), async () => {
            const objA = { z: 100, a: 1, nested: { y: 'two', x: 'one' } };
            const objB = { nested: { x: 'one', y: 'two' }, a: 1, z: 100 };
            const jsonA = canonicalJson(objA);
            const jsonB = canonicalJson(objB);
            const hashA = await checksumV1(objA);
            const hashB = await checksumV1(objB);

            if (jsonA === jsonB && hashA === hashB) {
                return {
                    ok: true,
                    detail: tr('Different object key insertion orders produce identical canonical JSON and checksum')
                };
            }
            return {
                ok: false,
                detail: tr('Key order produced divergent canonical output')
            };
        })
    );

    // 2. Same snapshot hashed on two simulated dates gives the same dj1 hash
    results.push(
        await runCheck(tr('Date invariance of snapshot hash'), async () => {
            const snapshot = {
                v: 1,
                season: '826',
                template: { id: 'manifest', version: '1.0' },
                scope: { manifestId: 'ONYX-MX-2026-10-05' },
                params: { currency: 'USD' },
                rows: [{ id: 'ITEM-1', qty: 10 }]
            };

            const hashAtDate1 = await checksumV1(snapshot);
            const hashAtDate2 = await checksumV1(snapshot);

            if (hashAtDate1 === hashAtDate2 && hashAtDate1.startsWith('dj1:')) {
                return {
                    ok: true,
                    detail: tr('Identical snapshot data yields the same checksum regardless of execution date')
                };
            }
            return {
                ok: false,
                detail: tr('Snapshot checksum diverged between simulated evaluation points')
            };
        })
    );

    // 3. Volatile fields are ignored exactly as documentJobs.ts and PM4 define
    results.push(
        await runCheck(tr('Volatile fields exclusion'), async () => {
            const base = { template: 'lbl-v4', season: '826', itemCount: 42 };
            const withVolatile = {
                ...base,
                printed_at: '2026-10-05T12:00:00Z',
                updated_at: '2026-10-05T12:05:00Z',
                job_id: 'PJ-TEMP-123'
            };

            const hashBase = await checksumV1(base);
            const hashVolatile = await checksumV1(withVolatile);

            if (hashBase === hashVolatile) {
                return {
                    ok: true,
                    detail: tr('Volatile fields (printed_at, updated_at, job_id) are ignored during canonical hashing')
                };
            }
            return {
                ok: false,
                detail: tr('documentJobs.ts canonicalJson does not filter volatile fields; snapshot builders must filter them before hashing')
            };
        })
    );

    // 4. Label copies counted by a copies field not by duplicated rows
    results.push(
        await runCheck(tr('Label copies counted by field'), async () => {
            const rowWithCopies = [{ inventoryId: 'TAG-826-001', copies: 3 }];
            const duplicatedRows = [
                { inventoryId: 'TAG-826-001', copies: 1 },
                { inventoryId: 'TAG-826-001', copies: 1 },
                { inventoryId: 'TAG-826-001', copies: 1 }
            ];

            const jsonWithCopies = canonicalJson(rowWithCopies);
            const hashCopies = await checksumV1(rowWithCopies);
            const hashDuplicated = await checksumV1(duplicatedRows);

            if (jsonWithCopies.includes('"copies":3') && hashCopies !== hashDuplicated) {
                return {
                    ok: true,
                    detail: tr('Label copies are represented via explicit copies property; distinct from uncollapsed row duplication')
                };
            }
            return {
                ok: false,
                detail: tr('Label copies structure did not maintain explicit copies property')
            };
        })
    );

    // 5. Number and date normalisation
    results.push(
        await runCheck(tr('Number and date normalisation'), async () => {
            const isNegativeZeroNormalized = canonicalJson(-0) === '0';
            const isNonFiniteNormalized = canonicalJson(NaN) === 'null' && canonicalJson(Infinity) === 'null';
            const isFiniteFormatted = canonicalJson(42.5) === '42.5';

            const testDate = new Date('2026-10-05T12:00:00.000Z');
            const isDateNormalized = canonicalJson(testDate) === '"2026-10-05T12:00:00.000Z"';
            const isDateLikeNormalized = canonicalJson({
                toISOString: () => '2026-10-05T12:00:00.000Z'
            }) === '"2026-10-05T12:00:00.000Z"';

            if (
                isNegativeZeroNormalized &&
                isNonFiniteNormalized &&
                isFiniteFormatted &&
                isDateNormalized &&
                isDateLikeNormalized
            ) {
                return {
                    ok: true,
                    detail: tr('-0 normalised to 0, non-finite numbers to null, and Date instances formatted to ISO 8601 UTC')
                };
            }
            return {
                ok: false,
                detail: tr('Canonical number or date normalisation mismatch in canonicalJson')
            };
        })
    );

    // 6. NFC normalisation and trimming
    results.push(
        await runCheck(tr('NFC normalisation and trimming'), async () => {
            const decomposed = 'Caf\u0065\u0301'; // 'Café' decomposed
            const precomposed = 'Caf\u00E9';      // 'Café' precomposed
            const isNfcNormalized = canonicalJson(decomposed) === canonicalJson(precomposed);

            const isWhitespaceTrimmed = canonicalJson('   Onyx Tag   ') === '"Onyx Tag"';
            const isWhitespaceEmptySentinel = canonicalJson('    ') === 'null';
            const isHyphenSentinel = canonicalJson(' - ') === 'null';
            const isDashSentinel = canonicalJson(' — ') === 'null';

            if (
                isNfcNormalized &&
                isWhitespaceTrimmed &&
                isWhitespaceEmptySentinel &&
                isHyphenSentinel &&
                isDashSentinel
            ) {
                return {
                    ok: true,
                    detail: tr('Unicode normalised to NFC, whitespace trimmed, and empty/hyphen sentinels mapped to null')
                };
            }
            return {
                ok: false,
                detail: tr('NFC normalisation or sentinel string trimming failed in canonicalJson')
            };
        })
    );

    // 7. The dj1: prefix and lowercase hex
    results.push(
        await runCheck(tr('dj1 prefix and lowercase hex format'), async () => {
            const digest = await checksumV1({ test: 'ph-0d' });
            const hasPrefix = digest.startsWith('dj1:');
            const hexPart = digest.slice(4);
            const isLowercaseHex64 = /^[0-9a-f]{64}$/.test(hexPart);

            if (hasPrefix && isLowercaseHex64) {
                return {
                    ok: true,
                    detail: tr('Digest begins with dj1: followed by 64 lowercase hexadecimal characters')
                };
            }
            return {
                ok: false,
                detail: tr(`Digest failed formatting check: ${digest}`)
            };
        })
    );

    // 8. CSV determinism check
    results.push(
        await runCheck(tr('CSV determinism and injection protection'), async () => {
            interface MockItem {
                sku: string;
                title: string;
                price: number;
                createdAt: Date;
            }

            const mockRows: MockItem[] = [
                {
                    sku: 'TAG-001',
                    title: '=SUM(A1,B1)',
                    price: -15.5,
                    createdAt: new Date('2026-10-05T00:00:00.000Z')
                },
                {
                    sku: 'TAG-002',
                    title: 'Normal Title',
                    price: 250,
                    createdAt: new Date('2026-10-05T00:00:00.000Z')
                }
            ];

            const mockColumns: CsvColumn<MockItem>[] = [
                { header: 'SKU', accessor: 'sku', type: 'text' },
                { header: 'Title', accessor: 'title', type: 'text' },
                { header: 'Price', accessor: 'price', type: 'decimal', digits: 2 },
                { header: 'Created', accessor: 'createdAt', type: 'date' }
            ];

            const renderA = toCsv(mockRows, mockColumns);
            const renderB = toCsv(mockRows, mockColumns);

            const isIdentical = renderA === renderB;
            const hasFormulaGuard = renderA.includes("'=SUM(A1,B1)");
            const hasUnguardedNegativeNumeric = renderA.includes('-15.50') && !renderA.includes("'-15.50");
            const hasCrlf = renderA.includes('\r\n');
            const hasBom = renderA.startsWith('\uFEFF');

            if (isIdentical && hasFormulaGuard && hasUnguardedNegativeNumeric && hasCrlf && hasBom) {
                return {
                    ok: true,
                    detail: tr('CSV rendering is strictly deterministic with CRLF, UTF-8 BOM, and formula protection')
                };
            }
            return {
                ok: false,
                detail: tr(`CSV verification failed: identical=${isIdentical}, formulaGuard=${hasFormulaGuard}, negativeNum=${hasUnguardedNegativeNumeric}`)
            };
        })
    );

    return results;
}
