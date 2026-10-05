import { renderPdf } from '../features/print/renderers/pdfRenderer';
import type { PdfSpec } from '../features/print/renderers/pdfRenderer';
import { tr } from './i18n';

export async function generateCratesListHtml(crates: Record<string, any>[]): Promise<Uint8Array> {
    const columns = crates && crates.length > 0 && crates[0]
        ? Object.keys(crates[0]).map(key => ({ header: key, key }))
        : [];
    
    const spec: PdfSpec = {
        preset: 'A4',
        title: tr('Crates List'),
        blocks: [
            {
                type: 'table',
                columns,
                rows: crates
            }
        ]
    };

    return await renderPdf(spec);
}
