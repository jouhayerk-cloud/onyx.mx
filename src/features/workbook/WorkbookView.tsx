import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useAtom, useSetAtom, useAtomValue } from 'jotai/react';
import { getTextColorForBg } from '../../lib/utils';
import { vendors } from '../../lib/consts';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import {
    workbookSearchTermAtom,
    workbookSelectedItemsAtom,
    workbookActiveTabAtom,
    workbookAtom,
    workbookActiveSheetAtom,
    workbookDataAtom,
    workbookPropertiesDataAtom,
    workbookShippingLogsAtom,
    workbookBookVDataAtom,
    workbookVersionAtom,
    workbookLogDataAtom,
    workbookProductionDataAtom,
    workbookSuppliesDataAtom,
    workbookCratesFileDataAtom,
    workbookPayLogDataAtom
} from '../../lib/atoms';
import { WorkbookPaymentModal } from './WorkbookPaymentModal';
import { AcquisitionsView } from '../dashboard/AcquisitionsView';
import { PaymentsView } from '../dashboard/PaymentsView';
import { WorkbookShippingView } from './WorkbookShippingView';
import { WorkbookPropertiesView } from './WorkbookPropertiesView';
import { WorkbookLogView } from './WorkbookLogView';
import { WorkbookProductionView } from './WorkbookProductionView';
import { WorkbookSuppliesView } from './WorkbookSuppliesView';
import { WorkbookCratesView } from './WorkbookCratesView';
import { WorkbookPayLogView } from './WorkbookPayLogView';

interface WorkbookViewProps { }

/**
 * Column mapping for Inventory Sheets (Columns A-V)
 * Version 825: A=ID, B=Date, C=Desc, D=Tag, E=Qty, F=Kg, G=H, H=W, I=D, V=Status
 * Version 326: A=#, B=Date, C=Color, D=Object, E=Type, F=Tag-ID, G=Q, H=Kg, I=H, J=W, K=D, L=Price
 */
const COLUMN_CONFIG_825 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'V'];
const COLUMN_CONFIG_326 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'V', 'W'];
const COLUMN_HEADERS_326: Record<string, string> = {
    A: '#', B: 'Date', C: 'Color', D: 'Object', E: 'Type', F: 'Tag-ID', G: 'Q', V: 'Retail', W: 'Total'
};

export const WorkbookView: React.FC<WorkbookViewProps> = () => {
    const [workbook, setWorkbook] = useAtom(workbookAtom);
    const [activeSheet, setActiveSheet] = useAtom(workbookActiveSheetAtom);
    const [version, setVersion] = useAtom(workbookVersionAtom);

    // Split Data Atoms
    const [inventoryData, setInventoryData] = useAtom(workbookDataAtom);
    const setPropertiesData = useSetAtom(workbookPropertiesDataAtom);
    const setShippingLogsData = useSetAtom(workbookShippingLogsAtom);

    const [bookVData, setBookVData] = useAtom(workbookBookVDataAtom);

    // v326 Operational Setters
    const setLogData = useSetAtom(workbookLogDataAtom);
    const setProductionData = useSetAtom(workbookProductionDataAtom);
    const setSuppliesData = useSetAtom(workbookSuppliesDataAtom);
    const setCratesFileData = useSetAtom(workbookCratesFileDataAtom);
    const setPayLogData = useSetAtom(workbookPayLogDataAtom);

    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useAtom(workbookSearchTermAtom);
    const [selectedItems, setSelectedItems] = useAtom(workbookSelectedItemsAtom);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useAtom(workbookActiveTabAtom);

    /**
     * LOAD WORKBOOK & PARSE CATEGORIES
     */
    const [headers, setHeaders] = useState<string[]>([]);
    const [headerMap, setHeaderMap] = useState<Record<string, number>>({});

    /**
     * LOAD WORKBOOK & PARSE CATEGORIES
     */
    useEffect(() => {
        const loadWorkbook = async () => {
            if (workbook) {
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const fileName = version === '326' ? '/book0326.xlsx' : '/bookDASH.xlsx';
                const response = await fetch(fileName, { cache: 'no-store' });
                if (!response.ok) throw new Error('Failed to fetch workbook file');

                const arrayBuffer = await response.arrayBuffer();
                const wb = XLSX.read(arrayBuffer, { type: 'array' });
                setWorkbook(wb);

                // --- 1. Parse bookV (Global Totals) ---
                if (wb.SheetNames.includes('bookV')) {
                    const vSheet = wb.Sheets['bookV'];
                    const vData = XLSX.utils.sheet_to_json(vSheet);
                    if (vData.length > 0) setBookVData(vData[0]);
                }

                // --- 2. Categorize Sheets ---
                const inventorySheets: string[] = [];
                const propertySheets: { sheetName: string, data: any[] }[] = [];
                const shippingSheets: { sheetName: string, data: any[] }[] = [];

                const specialSheets: Record<string, any[][]> = {};

                wb.SheetNames.forEach(name => {
                    if (name === 'bookV') return;

                    const sheet = wb.Sheets[name];
                    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

                    if (name.startsWith('-v')) {
                        propertySheets.push({ sheetName: name, data });
                    } else if (name.startsWith('-TRK')) {
                        shippingSheets.push({ sheetName: name, data });
                    } else if (version === '326' && ['-Log', '-Production', '-Supplies', '-Crates', '-PayLog'].includes(name)) {
                        specialSheets[name] = data;
                    } else if (!name.startsWith('-')) {
                        inventorySheets.push(name);
                    }
                });

                setPropertiesData(propertySheets);
                setShippingLogsData(shippingSheets);

                // Set v326 Specific Atoms
                if (version === '326') {
                    if (specialSheets['-Log']) setLogData(specialSheets['-Log']);
                    if (specialSheets['-Production']) setProductionData(specialSheets['-Production']);
                    if (specialSheets['-Supplies']) setSuppliesData(specialSheets['-Supplies']);
                    if (specialSheets['-Crates']) setCratesFileData(specialSheets['-Crates']);
                    if (specialSheets['-PayLog']) setPayLogData(specialSheets['-PayLog']);
                }

                // Default active sheet for Inventory Tab
                if (inventorySheets.length > 0) {
                    setActiveSheet('All'); // or inventorySheets[0]
                }

            } catch (err: any) {
                console.error("Error loading workbook:", err);
                setError(err.message || 'Failed to load workbook');
            } finally {
                setIsLoading(false);
            }
        };

        loadWorkbook();
    }, [workbook, setWorkbook, setBookVData, setActiveSheet, setPropertiesData, setShippingLogsData, setLogData, setProductionData, setSuppliesData, setCratesFileData, setPayLogData, version]);

    /**
     * AGGREGATE INVENTORY DATA (When activeSheet changes in Inventory Tab)
     */
    useEffect(() => {
        if (!workbook || activeTab !== 'inventory') return;

        let aggregatedData: { data: any[], sheetName: string }[] = [];
        let currentHeaders: string[] = [];

        // Filter out non-inventory sheets for the "All" view
        const inventorySheetNames = workbook.SheetNames.filter(name => !name.startsWith('-') && name !== 'bookV');

        const sheetsToProcess = activeSheet === 'All'
            ? inventorySheetNames
            : [activeSheet];

        sheetsToProcess.forEach((sheetName, index) => {
            const sheet = workbook.Sheets[sheetName];
            if (sheet) {
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

                // Capture Headers from the first sheet processed
                if (index === 0 && jsonData.length > 2) {
                    currentHeaders = jsonData[1].map(h => String(h).toUpperCase());
                }

                // Slice from 3rd row (index 2) to skip titles/headers
                const rawRows = jsonData.slice(2);

                // PERFORMANCE OPTIMIZATION: Filter out placeholder rows for v326.
                // Placeholder rows contain only formulas/formatting but lack a valid TAGID (Column F, index 5).
                const validRows = version === '326'
                    ? rawRows.filter(row => row[5] !== undefined && String(row[5]).trim() !== '')
                    : rawRows;

                const rows = validRows.map(row => ({
                    data: row,
                    sheetName: sheetName
                }));
                aggregatedData = [...aggregatedData, ...rows];
            }
        });

        setInventoryData(aggregatedData);
        setHeaders(currentHeaders);

        // Build Header Map for quick lookup
        const map: Record<string, number> = {};
        currentHeaders.forEach((h, i) => map[h] = i);
        setHeaderMap(map);

    }, [workbook, activeSheet, activeTab, setInventoryData, version]);


    // --- RENDERING HELPERS ---

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedItems);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedItems(newSet);
    };

    // Filter Inventory
    const filteredInventory = inventoryData.filter(item => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return item.data.some(cell => cell !== undefined && String(cell).toLowerCase().includes(term));
    });

    const colLetterToIndex = (letter: string) => {
        let column = 0;
        for (let i = 0; i < letter.length; i++) {
            column += (letter.charCodeAt(i) - 64) * Math.pow(26, letter.length - i - 1);
        }
        return column - 1;
    };
    const COLUMN_HEADERS_825: { [key: string]: string } = {
        'A': 'ID', 'B': 'Date', 'C': 'Description', 'D': 'Tag',
        'E': 'Qty', 'F': 'Kg', 'G': 'H', 'H': 'W', 'I': 'D', 'V': 'Stat'
    };

    const COLUMN_HEADERS_326: { [key: string]: string } = {
        'A': '#', 'B': 'Date', 'C': 'Color', 'D': 'Object', 'E': 'Type', 'F': 'Tag-ID',
        'G': 'Q', 'H': 'Kg', 'I': 'H', 'J': 'W', 'K': 'D', 'L': 'Price'
    };

    const activeConfig = version === '326' ? COLUMN_CONFIG_326 : COLUMN_CONFIG_825;
    const activeHeaders = version === '326' ? COLUMN_HEADERS_326 : COLUMN_HEADERS_825;
    const displayIndices = activeConfig.map(colLetterToIndex);

    // Grid Template: Adjust based on version? 
    // 326 has more columns. 
    // 825: 60px 80px 2fr 100px 40px 50px 40px 40px 40px 50px (10 cols)
    // 326: 40px 80px 80px 2fr 80px 100px 40px 50px 40px 40px 40px 60px (12 cols)
    const customGridTemplate = version === '326'
        ? '40px 80px 100px 2fr 100px 120px 40px 80px 80px'
        : '60px 80px 2fr 100px 40px 50px 40px 40px 40px 50px';

    const [expandedRow, setExpandedRow] = useState<number | null>(null);

    // Helper to get value by header name or fuzzy match
    const getValueByHeader = (row: any[], headerPart: string) => {
        const key = Object.keys(headerMap).find(k => k.includes(headerPart.toUpperCase()));
        if (key && headerMap[key] !== undefined) return row[headerMap[key]];
        return undefined;
    };

    // --- MAIN RENDER ---
    return (
        <div className="flex flex-col h-full gap-4 p-4 overflow-hidden font-sans">

            {/* 1. Error Banner */}
            <div className="shrink-0 px-2 overflow-hidden">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        {error}
                    </div>
                )}
            </div>

            {/* 2. Content Area */}
            {isLoading ? (
                <div className="flex-grow flex items-center justify-center"><LoadingIndicator /></div>
            ) : (
                <div className="flex-grow overflow-hidden">
                    {/* --- INVENTORY VIEW --- */}
                    {activeTab === 'inventory' && (
                        <AcquisitionsView mode="archive" />
                    )}

                    {/* --- EXPENSES VIEW --- */}
                    {activeTab === 'expenses' && (
                        <AcquisitionsView mode="archive" />
                    )}

                    {/* --- SHIPPING VIEW --- */}
                    {activeTab === 'shipping' && (
                        <WorkbookShippingView />
                    )}

                    {/* --- PAYMENTS VIEW --- */}
                    {activeTab === 'payments' && (
                        <PaymentsView />
                    )}

                    {/* --- v326 SPECIAL VIEWS --- */}
                    {activeTab === 'log' && (
                        <WorkbookLogView />
                    )}
                    {activeTab === 'production' && (
                        <WorkbookProductionView />
                    )}
                    {activeTab === 'supplies' && (
                        <WorkbookSuppliesView />
                    )}
                    {activeTab === 'crates' && (
                        <WorkbookCratesView />
                    )}
                    {activeTab === 'paylog' && (
                        <WorkbookPayLogView />
                    )}
                </div>
            )}
        </div>
    );
};
