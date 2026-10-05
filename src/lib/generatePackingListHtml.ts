import { renderPdf } from '../features/print/renderers/pdfRenderer';
import type { PdfSpec } from '../features/print/renderers/pdfRenderer';
import { tr } from './i18n';

export async function generatePackingListHtml(items: Record<string, any>[]): Promise<Uint8Array> {
    const columns = items && items.length > 0 && items[0]
        ? Object.keys(items[0]).map(key => ({ header: key, key }))
        : [];
    
    const spec: PdfSpec = {
        preset: 'A4',
        title: tr('Packing List'),
        blocks: [
            {
                type: 'table',
                columns,
                rows: items
            }
        ]
    };

    return await renderPdf(spec);
}
