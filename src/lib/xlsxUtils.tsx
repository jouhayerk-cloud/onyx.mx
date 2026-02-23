/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// FIX: Reverted jszip import to a namespace import to resolve type inference issues.
// Using `import * as JSZip` is safer when module resolution settings are unknown and prevents global type pollution.
import * as JSZip from 'jszip';


// Simple XML escaping
const escapeXml = (str: string) => {
    return String(str ?? '').replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
};

const createSheetXml = (data: any[][], styleMap: Map<string, number>): string => {
    const rowsXml = data.map((row, rowIndex) => {
        if (!row || row.length === 0) {
            return `<row r="${rowIndex + 1}"/>`;
        }
        const cellsXml = row.map((cellData, cellIndex) => {
            const isObject = cellData && typeof cellData === 'object' && cellData.value !== undefined;
            const cellValue = isObject ? cellData.value : cellData;
            const styleKey = isObject ? cellData.styleKey : null;

            const col = String.fromCharCode(65 + cellIndex);
            const ref = `${col}${rowIndex + 1}`;
            
            let styleIndex = 0; // Default: normal
            if (styleKey && styleMap.has(styleKey)) {
                styleIndex = styleMap.get(styleKey)!;
            } else if (rowIndex === 0 && !isObject) { // Default bold for header if no style specified
                styleIndex = 1; 
            }

            const style = ` s="${styleIndex}"`;

            if (typeof cellValue === 'number') {
                return `<c r="${ref}"${style}><v>${cellValue}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(String(cellValue ?? ''))}</t></is></c>`;
        }).join('');
        return `<row r="${rowIndex + 1}">${cellsXml}</row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
};


const createWorkbookXml = (sheetName: string): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

const createWorkbookRelsXml = (): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const createContentTypesXml = (): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const createRootRelsXml = (): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const createStylesXml = (styles: { [key: string]: {bgColor?: string, bold?: boolean, textColor?: string} } = {}): { styleSheet: string, styleMap: Map<string, number> } => {
    const fonts = [
        '<font><sz val="11"/><name val="Calibri"/></font>', // Font 0: Normal
        '<font><b/><sz val="11"/><name val="Calibri"/></font>', // Font 1: Bold
    ];
    const fills = [
        '<fill><patternFill patternType="none"/></fill>', // Fill 0: No fill
        '<fill><patternFill patternType="gray125"/></fill>' // Fill 1: Default gray fill
    ];
    const cellXfs = [
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', // Style 0: Normal
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' // Style 1: Bold Header
    ];
    const styleMap = new Map<string, number>();

    Object.keys(styles).forEach(styleKey => {
        const style = styles[styleKey];
        let fontId = style.bold ? 1 : 0;
        let fillId = 0;

        if(style.bgColor) {
            const argb = `FF${style.bgColor.slice(1)}`;
            fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${argb}"/></patternFill></fill>`);
            fillId = fills.length - 1;
        }
        
        // This is a simplified implementation. A full implementation would check if an identical font/fill already exists.
        if (style.textColor) {
            const colorXml = `<color rgb="FF${style.textColor.slice(1)}"/>`;
            fonts.push(`<font>${style.bold ? '<b/>' : ''}<sz val="11"/><name val="Calibri"/>${colorXml}</font>`);
            fontId = fonts.length - 1;
        }

        cellXfs.push(`<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`);
        const xfId = cellXfs.length - 1;
        styleMap.set(styleKey, xfId);
    });

    const styleSheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <fonts count="${fonts.length}">${fonts.join('')}</fonts>
    <fills count="${fills.length}">${fills.join('')}</fills>
    <borders count="1">
        <border><left/><right/><top/><bottom/><diagonal/></border>
    </borders>
    <cellStyleXfs count="1">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    </cellStyleXfs>
    <cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs>
</styleSheet>`;

    return { styleSheet, styleMap };
};

export const exportToXLSX = async (
    fileName: string, 
    sheets: { name: string, data: any[][] }[],
    styles: { [key: string]: {bgColor?: string, bold?: boolean, textColor?: string} } = {}
): Promise<void> => {
    const zip = new JSZip();
    
    // For simplicity, we only support one sheet for now
    const sheet = sheets[0];
    if (!sheet) return;

    const { styleSheet, styleMap } = createStylesXml(styles);

    zip.file('[Content_Types].xml', createContentTypesXml());

    const rels = zip.folder('_rels');
    rels!.file('.rels', createRootRelsXml());

    const xl = zip.folder('xl');
    xl!.file('workbook.xml', createWorkbookXml(sheet.name));
    xl!.file('styles.xml', styleSheet);

    const xlRels = xl!.folder('_rels');
    xlRels!.file('workbook.xml.rels', createWorkbookRelsXml());

    const worksheets = xl!.folder('worksheets');
    worksheets!.file('sheet1.xml', createSheetXml(sheet.data, styleMap));

    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};