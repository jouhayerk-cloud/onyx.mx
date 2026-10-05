import ExcelJS from 'exceljs';
import { getCrateDisplayName, normalizeInventoryData, calculateCodesAndPrices } from './utils';

// Helper for TruckingModule: Consolidated Manifesto
export async function generateConsolidatedManifestoXlsx(
    items: any[],
    bookRate: number
): Promise<Blob> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Manifesto');
    ws.columns = [
        { header: 'Book TAG ID', key: 'tag', width: 20 },
        { header: 'Quantity', key: 'qty', width: 10 },
        { header: 'Description', key: 'desc', width: 50 },
        { header: 'Weight (KG)', key: 'weight', width: 15 },
        { header: 'Dimensions (CM)', key: 'dims', width: 20 },
        { header: 'Acq. Cost MXN', key: 'cost', width: 20 },
    ];
    items.forEach((item) => {
        const inv = item.inv;
        const data = inv.data || {};
        const norm = normalizeInventoryData(inv);
        const calculated = calculateCodesAndPrices(norm, bookRate, '326');
        const tag = calculated.bookBarcode || norm.book_barcode || norm.itemId || inv.row;
        const desc = [data.color || data.Color, data.material || data.Material, data.shape || data.Shape, data.shortDescription || data.short_description].filter(Boolean).join(' - ');
        const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : '');
        const cost = calculated.acquisitionCostMxn || 0;
        ws.addRow({ tag, qty: item.qty, desc: desc || 'Artifact', weight: data.weightKg || data.weight_kg || '', dims, cost });
    });
    ws.getRow(1).font = { bold: true };
    const buffer = await wb.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Helper for TruckingModule: Crate Spreadsheets
export async function generateCrateSpreadsheetsXlsx(
    rootCrates: any[],
    allCrates: any[],
    allInventory: any[],
    bookRate: number,
    getItemsFromCrate: (crate: any) => any[]
): Promise<Blob> {
    const wb = new ExcelJS.Workbook();
    for (let i = 0; i < rootCrates.length; i++) {
        const crate = rootCrates[i];
        const { label } = getCrateDisplayName(crate, allCrates, allInventory);
        const safeLabel = label.replace(/[\[\]\*\/\?\:\\]/g, '').substring(0, 31) || `Crate ${i+1}`;
        let sheetName = safeLabel; let counter = 1;
        while (wb.worksheets.find(s => s.name === sheetName)) sheetName = `${safeLabel.substring(0, 28)}_${counter++}`;
        const ws = wb.addWorksheet(sheetName);
        ws.columns = [
            { header: 'Book TAG ID', key: 'tag', width: 20 }, { header: 'Quantity', key: 'qty', width: 10 },
            { header: 'Description', key: 'desc', width: 40 }, { header: 'Weight (KG)', key: 'weight', width: 15 },
            { header: 'Dimensions (CM)', key: 'dims', width: 20 },
            { header: 'Container', key: 'container', width: 25 }
        ];
        getItemsFromCrate(crate).forEach((item: any) => {
            const inv = item.inv; const data = inv.data || {};
            const norm = normalizeInventoryData(inv);
            const calculated = calculateCodesAndPrices(norm, bookRate, '326');
            const tag = calculated.bookBarcode || norm.book_barcode || norm.itemId || inv.row;
            const desc = [data.color || data.Color, data.material || data.Material, data.shape || data.Shape, data.shortDescription || data.short_description].filter(Boolean).join(' - ');
            const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×') + (data.lengthCm ? ' cm' : '');
            ws.addRow({ 
                tag, 
                qty: item.qty, 
                desc: desc || 'Artifact', 
                weight: data.weightKg || data.weight_kg || '', 
                dims,
                container: item.packetIn || ''
            });
        });
        ws.getRow(1).font = { bold: true };
    }
    const buffer = await wb.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Helper for ExportCratesWizard: Master Packing List
export async function generateMasterPackingListXlsx(
    selectedCrates: any[],
    allCrates: any[],
    allInventory: any[],
    bookRate: number,
    fields: { shipmentRef: string; senders: string[]; truckPlates: string; notes: string },
    getItemsFromCrate: (crate: any) => any[]
): Promise<Blob> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Master Packing List');

    const headerFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
    const sectionFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    const textWhite: any = { color: { argb: 'FFFFFFFF' }, bold: true };

    ws.addRow(['ONYX LOGISTICS · MASTER PACKING LIST']);
    ws.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFF97316' } };
    ws.addRow([`Exported At: ${new Date().toLocaleString()}`]);
    ws.addRow([]);

    ws.addRow(['SHIPMENT METADATA']);
    ws.getRow(4).font = { bold: true };
    ws.addRow(['Reference', fields.shipmentRef]);
    ws.addRow(['Senders', (fields.senders || []).join(', ') || 'N/A']);
    ws.addRow(['Truck Plates', fields.truckPlates || 'N/A']);
    ws.addRow(['Notes', fields.notes || 'N/A']);
    ws.addRow([]);

    const startRow = ws.rowCount + 1;
    ws.addRow(['Crate / Unit', 'Book TAG ID', 'Qty', 'Description', 'Dimensions (CM)', 'Weight (KG)', 'Sub-Container']);
    const headerRow = ws.getRow(startRow);
    headerRow.font = textWhite;
    headerRow.eachCell(cell => { cell.fill = headerFill; cell.alignment = { horizontal: 'center' }; });

    ws.columns = [
        { key: 'crate', width: 25 },
        { key: 'tag', width: 22 },
        { key: 'qty', width: 8 },
        { key: 'desc', width: 50 },
        { key: 'dims', width: 22 },
        { key: 'weight', width: 12 },
        { key: 'box', width: 25 }
    ];

    selectedCrates.forEach((crate, cIdx) => {
        const { label } = getCrateDisplayName(crate, allCrates, allInventory);
        
        const sRow = ws.addRow([`UNIT ${cIdx + 1}: ${label.toUpperCase()}`]);
        ws.mergeCells(sRow.number, 1, sRow.number, 7);
        sRow.font = { bold: true };
        sRow.getCell(1).fill = sectionFill;

        const items = getItemsFromCrate(crate);
        items.forEach((item: any) => {
            const inv = item.inv; const data = inv.data || {};
            const norm = normalizeInventoryData(inv);
            const calculated = calculateCodesAndPrices(norm, bookRate, '326');
            const tag = calculated.bookBarcode || data.book_barcode || data.itemId || String(inv.row);
            const desc = [data.color, data.material, data.shape, data.shortDescription].filter(Boolean).join(' - ');
            const dims = [data.lengthCm, data.widthCm, data.heightCm].filter(Boolean).join('×');
            
            const row = ws.addRow({
                crate: label,
                tag: tag,
                qty: item.qty,
                desc: desc || 'Artifact',
                dims: dims || 'N/A',
                weight: data.weightKg || data.weight_kg || 0,
                box: item.boxLabel || ''
            });
            row.getCell('qty').alignment = { horizontal: 'center' };
            row.getCell('weight').alignment = { horizontal: 'center' };
        });
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
