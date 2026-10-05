import { ONYX_WORKBOOK_THEME, sanitizeSheetName } from '../design/xlsxDesignSystem';

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface XlsxSpec {
    creator: string;
    created: Date;
    sheets: {
        name: string;
        columns: { key: string; header: string; width?: number; format?: string }[];
        rows: Record<string, any>[];
        freezeHeader?: boolean;
        autoFilter?: boolean;
        printSetup?: any;
        titleRows?: { values: any[]; style?: string }[];
        summaryRows?: { values: any[]; style?: string }[];
    }[];
}

function sanitizeValue(val: any): any {
    if (typeof val === 'string' && val.startsWith('=')) {
        return "'" + val;
    }
    return val;
}

export async function renderWorkbook(spec: XlsxSpec): Promise<Uint8Array> {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    
    workbook.creator = spec.creator;
    workbook.created = spec.created;

    for (const sheetSpec of spec.sheets) {
        const sheetName = sanitizeSheetName(sheetSpec.name);
        const sheet = workbook.addWorksheet(sheetName);

        if (sheetSpec.printSetup) {
            Object.assign(sheet.pageSetup, sheetSpec.printSetup);
        }

        let currentRow = 1;

        if (sheetSpec.titleRows) {
            for (const titleRow of sheetSpec.titleRows) {
                const row = sheet.addRow(titleRow.values.map(sanitizeValue));
                row.eachCell((cell) => {
                    cell.font = ONYX_WORKBOOK_THEME.fonts.banner;
                    cell.alignment = ONYX_WORKBOOK_THEME.alignments.left;
                });
                currentRow++;
            }
        }

        sheet.columns = sheetSpec.columns.map(col => ({
            header: col.header,
            key: col.key,
            width: col.width,
            style: col.format ? { numFmt: col.format } : undefined
        }));

        const headerRow = sheet.getRow(currentRow);
        headerRow.eachCell((cell) => {
            cell.font = ONYX_WORKBOOK_THEME.fonts.header;
            cell.fill = ONYX_WORKBOOK_THEME.fills.headerPrimary;
            cell.alignment = ONYX_WORKBOOK_THEME.alignments.header;
            cell.border = ONYX_WORKBOOK_THEME.borders.headerBottom;
        });
        currentRow++;

        for (const rowData of sheetSpec.rows) {
            const rowValues = sheetSpec.columns.map(c => sanitizeValue(rowData[c.key]));
            const row = sheet.addRow(rowValues);
            row.eachCell((cell) => {
                cell.font = ONYX_WORKBOOK_THEME.fonts.body;
                cell.alignment = ONYX_WORKBOOK_THEME.alignments.left;
                cell.border = ONYX_WORKBOOK_THEME.borders.thin;
            });
            currentRow++;
        }

        if (sheetSpec.summaryRows) {
            for (const sumRow of sheetSpec.summaryRows) {
                const row = sheet.addRow(sumRow.values.map(sanitizeValue));
                row.eachCell((cell) => {
                    cell.font = ONYX_WORKBOOK_THEME.fonts.subtotal;
                    cell.alignment = ONYX_WORKBOOK_THEME.alignments.left;
                });
                currentRow++;
            }
        }

        if (sheetSpec.freezeHeader) {
            const splitY = sheetSpec.titleRows ? sheetSpec.titleRows.length + 1 : 1;
            sheet.views = [
                { state: 'frozen', ySplit: splitY, xSplit: 0, activeCell: 'A1' }
            ];
        }

        if (sheetSpec.autoFilter) {
            const filterRow = sheetSpec.titleRows ? sheetSpec.titleRows.length + 1 : 1;
            sheet.autoFilter = {
                from: { row: filterRow, column: 1 },
                to: { row: filterRow, column: sheetSpec.columns.length }
            };
        }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Uint8Array(buffer as ArrayBuffer);
}
