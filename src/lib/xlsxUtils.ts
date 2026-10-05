import { renderWorkbook as renderXlsx, XlsxSpec } from '../features/print/renderers/xlsxRenderer';
import { recordDocumentJob, DocumentJob } from './documentJobs';
import { tr } from './i18n';

/**
 * Sanitizes an individual cell value for Excel / OpenXML / ExcelJS export.
 * Strips out illegal XML 1.0 control characters and enforces cell char limit.
 */
export const sanitizeExcelValue = (val: any): any => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    let str = String(val);
    str = str.replace(/[\v\f\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
    if (str.length > 32767) {
        str = str.slice(0, 32764) + '...';
    }
    return str;
};

/**
 * Sanitizes an entire row array or row object for Excel export.
 */
export const sanitizeExcelRow = (row: any): any => {
    if (!row) return row;
    if (Array.isArray(row)) {
        return row.map(sanitizeExcelValue);
    }
    if (typeof row === 'object') {
        const cleaned: Record<string, any> = {};
        for (const key of Object.keys(row)) {
            cleaned[key] = sanitizeExcelValue(row[key]);
        }
        return cleaned;
    }
    return sanitizeExcelValue(row);
};

export const exportToXLSX = async (
    fileName: string, 
    sheets: { name: string; data: any[][] }[],
    _styles: { [key: string]: { bgColor?: string; bold?: boolean; textColor?: string } } = {},
    output: 'download' | 'blob' = 'download'
): Promise<Blob | void> => {
    const spec: XlsxSpec = {
        creator: 'Onyx',
        created: new Date(),
        sheets: sheets.map((sheet, idx) => {
            let columns: { key: string; header: string }[] = [];
            let rows: Record<string, any>[] = [];
            
            if (sheet.data && sheet.data.length > 0) {
                const firstRow = sheet.data[0];
                columns = firstRow.map((colData, index) => {
                    const isObject = colData && typeof colData === 'object' && colData.value !== undefined;
                    const val = isObject ? colData.value : colData;
                    return { key: `col${index}`, header: String(sanitizeExcelValue(val) ?? '') };
                });
                
                for (let i = 1; i < sheet.data.length; i++) {
                    const r = sheet.data[i];
                    const rowData: Record<string, any> = {};
                    columns.forEach((col, index) => {
                        const cellData = r ? r[index] : '';
                        const isObject = cellData && typeof cellData === 'object' && cellData.value !== undefined;
                        rowData[col.key] = sanitizeExcelValue(isObject ? cellData.value : cellData);
                    });
                    rows.push(rowData);
                }
            } else {
                columns = [{ key: 'col0', header: tr('Empty') }];
            }
            
            return {
                name: sheet.name || `${tr('Sheet')} ${idx + 1}`,
                columns,
                rows,
                freezeHeader: true,
                autoFilter: true
            };
        })
    };

    const uint8 = await renderXlsx(spec);
    const blob = new Blob([uint8 as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const job: DocumentJob = {
        kind: 'xlsx',
        templateId: 'exportToXLSX',
        templateVersion: '1.0',
        season: '826',
        fileName: `${fileName}.xlsx`,
        outputBytes: blob.size,
    };
    
    try {
        await recordDocumentJob(job);
    } catch (e) {
        // Silently ignore tracking errors so they don't break the user export
    }

    if (output === 'blob') {
        return blob;
    }

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};

export const exportToCSV = async (
    fileName: string,
    data: any[][],
    output: 'download' | 'blob' = 'download'
): Promise<Blob | void> => {
    let csvContent = '';
    for (const row of data) {
        if (!row) continue;
        const rowString = row.map(cell => {
            const isObject = cell && typeof cell === 'object' && cell.value !== undefined;
            const val = isObject ? cell.value : cell;
            const str = String(sanitizeExcelValue(val) ?? '');
            return `"${str.replace(/"/g, '""')}"`;
        }).join(',');
        csvContent += rowString + '\r\n';
    }

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });

    const job: DocumentJob = {
        kind: 'csv',
        templateId: 'exportToCSV',
        templateVersion: '1.0',
        season: '826',
        fileName: `${fileName}.csv`,
        outputBytes: blob.size,
    };
    
    try {
        await recordDocumentJob(job);
    } catch (e) {
        // Silently ignore tracking errors
    }

    if (output === 'blob') {
        return blob;
    }

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};


