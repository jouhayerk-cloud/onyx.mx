import { renderPdf, PdfSpec, PdfBlock } from '../print/renderers/pdfRenderer';
import { CatalogArtifact } from '../../lib/pdfExport';
import { normalizeInventoryData } from '../../lib/utils';
import { tr } from '../../lib/i18n';

export async function exportCrateManifest(
    crateId: string,
    items: CatalogArtifact[],
    jobRef: string,
    dj1Hash: string
): Promise<Blob> {
    const blocks: PdfBlock[] = [];

    const rows = items.map(item => {
        const norm = normalizeInventoryData(item.data || item);
        const codes = (item as any).codes || {};
        return {
            barcode: codes.bookBarcodeDisplay || codes.bookBarcode || codes.bookTagId || '—',
            name: norm.shortDescription || norm.shape || tr('Artifact'),
            qty: norm.quantity || 1,
            weight: norm.weightKg ? `${norm.weightKg}kg` : '—'
        };
    });

    blocks.push({
        type: 'table',
        columns: [
            { header: tr('Tag/Barcode'), key: 'barcode' },
            { header: tr('Description'), key: 'name' },
            { header: tr('QTY'), key: 'qty' },
            { header: tr('Weight'), key: 'weight' }
        ],
        rows
    });

    const spec: PdfSpec = {
        preset: 'A4',
        title: `${tr('Crate Manifest')}: ${crateId}`,
        subtitle: `${tr('Total Items')}: ${items.length}`,
        blocks,
        footer: {
            jobRef,
            dj1Hash
        }
    };

    const bytes = await renderPdf(spec);
    return new Blob([bytes as any], { type: 'application/pdf' });
}

