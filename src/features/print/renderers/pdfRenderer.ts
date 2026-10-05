import { PDF_PAGE_PRESETS, PDF_MARGINS, PDF_TYPE_SCALE, PDF_COLORS, PDF_TABLE_STYLE, PDF_FOOTER_TEMPLATE } from '../design/pdfDesignSystem';

export const PDF_MIME_TYPE = 'application/pdf';

export type PdfBlock =
    | { type: 'heading'; text: string; level?: 1 | 2 | 3 }
    | { type: 'paragraph'; text: string }
    | { type: 'kvlist'; items: { key: string; value: string }[] }
    | { type: 'table'; columns: { header: string; key: string }[]; rows: Record<string, any>[] }
    | { type: 'image'; dataUrl: string; width?: number; height?: number };

export interface PdfSpec {
    preset: keyof typeof PDF_PAGE_PRESETS;
    title: string;
    subtitle?: string;
    blocks: PdfBlock[];
    footer?: {
        jobRef: string;
        dj1Hash: string;
    };
}

export async function renderPdf(spec: PdfSpec): Promise<Uint8Array> {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const preset = PDF_PAGE_PRESETS[spec.preset] || PDF_PAGE_PRESETS.A4;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: preset.format === 'unknown' ? 'a4' : preset.format
    });

    const margin = PDF_MARGINS.global;
    let y = margin;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;

    const applyTypeScale = (scale: { size: number; weight: number }) => {
        doc.setFont('helvetica', scale.weight === 700 ? 'bold' : 'normal');
        doc.setFontSize(scale.size);
    };

    const applyColor = (color: string) => {
        doc.setTextColor(color);
    };

    const addText = (text: string, scale: { size: number; weight: number }, color: string, gap: number) => {
        applyTypeScale(scale);
        applyColor(color);
        const lines = doc.splitTextToSize(text, contentWidth);
        const lineHeight = scale.size * 0.352778 * 1.15;
        const blockHeight = lines.length * lineHeight;
        if (y + blockHeight > pageHeight - margin - 15) {
            doc.addPage();
            y = margin;
        }
        doc.text(lines, margin, y + lineHeight * 0.8);
        y += blockHeight + gap;
    };

    if (spec.title) {
        addText(spec.title, PDF_TYPE_SCALE.display, PDF_COLORS.primary, PDF_MARGINS.gapSmall);
    }
    if (spec.subtitle) {
        addText(spec.subtitle, PDF_TYPE_SCALE.title, PDF_COLORS.secondary, PDF_MARGINS.gapLarge);
    }

    for (const block of spec.blocks) {
        if (block.type === 'heading') {
            const scale = block.level === 1 ? PDF_TYPE_SCALE.title : PDF_TYPE_SCALE.bodyBold;
            addText(block.text, scale, PDF_COLORS.primary, PDF_MARGINS.gapMedium);
        } else if (block.type === 'paragraph') {
            addText(block.text, PDF_TYPE_SCALE.body, PDF_COLORS.primary, PDF_MARGINS.gapMedium);
        } else if (block.type === 'kvlist') {
            applyTypeScale(PDF_TYPE_SCALE.body);
            applyColor(PDF_COLORS.primary);
            const lineHeight = PDF_TYPE_SCALE.body.size * 0.352778 * 1.15;
            for (const item of block.items) {
                if (y + lineHeight > pageHeight - margin - 15) {
                    doc.addPage();
                    y = margin;
                }
                doc.setFont('helvetica', 'bold');
                doc.text(item.key + ':', margin, y + lineHeight * 0.8);
                const keyWidth = doc.getTextWidth(item.key + ': ');
                doc.setFont('helvetica', 'normal');
                doc.text(item.value, margin + keyWidth, y + lineHeight * 0.8);
                y += lineHeight + PDF_MARGINS.gapSmall;
            }
            y += PDF_MARGINS.gapMedium;
        } else if (block.type === 'table') {
            const head = [block.columns.map(c => c.header)];
            const body = block.rows.map(r => block.columns.map(c => {
                const val = r[c.key];
                return val !== undefined && val !== null ? String(val) : '';
            }));

            // Make sure autoTable isn't called as a class
            const autoTableFn = typeof autoTable === 'function' ? autoTable : (autoTable as any).default || (doc as any).autoTable;

            if (autoTableFn) {
                autoTableFn(doc, {
                    startY: y,
                    head: head,
                    body: body,
                    margin: { left: margin, right: margin, top: margin, bottom: margin + 15 },
                    styles: {
                        font: 'helvetica',
                        fontSize: PDF_TYPE_SCALE.body.size,
                        textColor: PDF_COLORS.primary,
                        lineColor: PDF_COLORS.border,
                        cellPadding: PDF_TABLE_STYLE.paddingTop,
                    },
                    headStyles: {
                        fontStyle: 'bold',
                        fillColor: PDF_COLORS.white,
                        textColor: PDF_COLORS.primary,
                        lineWidth: { bottom: PDF_TABLE_STYLE.borderBottomWidth },
                    },
                    bodyStyles: {
                        fillColor: PDF_COLORS.white,
                    },
                    alternateRowStyles: PDF_TABLE_STYLE.zebra === 'none' ? {} : {
                        fillColor: '#F9FAFB'
                    },
                    showHead: 'everyPage',
                    rowPageBreak: 'avoid',
                    theme: 'plain',
                });
                y = (doc as any).lastAutoTable.finalY + PDF_MARGINS.gapLarge;
            }
        } else if (block.type === 'image') {
            const imgWidth = block.width || contentWidth;
            const imgHeight = block.height || (imgWidth * 0.75);
            if (y + imgHeight > pageHeight - margin - 15) {
                doc.addPage();
                y = margin;
            }
            doc.addImage(block.dataUrl, 'JPEG', margin, y, imgWidth, imgHeight);
            y += imgHeight + PDF_MARGINS.gapLarge;
        }
    }

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        applyTypeScale(PDF_TYPE_SCALE.caption);
        applyColor(PDF_COLORS.secondary);

        const footerY = pageHeight - margin;
        
        let footerLeft = PDF_FOOTER_TEMPLATE.brandString;
        if (spec.footer) {
            const dj1Snippet = spec.footer.dj1Hash.substring(0, 12);
            footerLeft += ' | ' + PDF_FOOTER_TEMPLATE.jobRefPlaceholder.replace('{jobRef}', spec.footer.jobRef) + ' | ' + PDF_FOOTER_TEMPLATE.dj1HashPlaceholder.replace('{hash}', dj1Snippet);
        }

        const pageString = PDF_FOOTER_TEMPLATE.pageNumberString
            .replace('{current}', String(i))
            .replace('{total}', String(totalPages));

        doc.text(footerLeft, margin, footerY);
        const pageStringWidth = doc.getTextWidth(pageString);
        doc.text(pageString, pageWidth - margin - pageStringWidth, footerY);
    }

    const arrayBuffer = doc.output('arraybuffer');
    return new Uint8Array(arrayBuffer);
}
