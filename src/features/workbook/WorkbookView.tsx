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
                <>
                    {/* --- INVENTORY VIEW --- */}
                    {activeTab === 'inventory' && (
                        <div className="flex flex-col h-full gap-4 overflow-hidden animate-in fade-in duration-300">
                            {/* Vendor Tabs */}
                            <div className="flex gap-2 overflow-x-auto p-4 scrollbar-hide px-2 items-center min-h-[60px]">
                                <button
                                    onClick={() => setActiveSheet('All')}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap ${activeSheet === 'All'
                                        ? 'bg-[var(--main-color)] text-white border-[var(--main-color)]'
                                        : 'bg-transparent text-[var(--text-color-secondary)] border-[var(--border-color)] hover:border-[var(--text-color-secondary)]'
                                        }`}
                                >
                                    ALL VENDORS
                                </button>
                                {workbook?.SheetNames
                                    .filter(name => !name.startsWith('-') && name !== 'bookV')
                                    .map(name => {
                                        const sheet = workbook.Sheets[name];
                                        // Try to pull color/name from sheet if defined, else generic
                                        const vendorIdRaw = sheet['A1'] ? sheet['A1'].v : '';
                                        const vendorKey = String(vendorIdRaw).trim() || name;

                                        // Find vendor config - Fix: Sort keys by length desc to match "EM" before "M"
                                        const vConfigKey = Object.keys(vendors)
                                            .sort((a, b) => b.length - a.length)
                                            .find(k => name === k || name.includes(k)) || 'default';

                                        const vConfig = vendors[vConfigKey as keyof typeof vendors];
                                        const color = vConfig?.color || 'var(--text-color-secondary)';
                                        const isActive = activeSheet === name;

                                        return (
                                            <button
                                                key={name}
                                                onClick={() => setActiveSheet(name)}
                                                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap flex items-center gap-2`}
                                                style={{
                                                    backgroundColor: isActive ? color : 'transparent',
                                                    color: isActive ? getTextColorForBg(color) : color,
                                                    borderColor: color
                                                }}
                                            >
                                                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                                                {name}
                                            </button>
                                        );
                                    })
                                }
                            </div>

                            {/* Inventory Grid */}
                            <div className="flex-grow glass-panel flex flex-col">
                                <div className="grid bg-[var(--glass-bg)] text-xs uppercase font-bold tracking-wider text-[var(--text-color-secondary)] py-3 px-4 border-b border-[var(--border-color)]" style={{ gridTemplateColumns: customGridTemplate, gap: '0.5rem' }}>
                                    {activeConfig.map(col => <div key={col} className={`${(col === 'C' || col === 'D') ? 'text-left' : 'text-center'}`}>{activeHeaders[col]}</div>)}
                                </div>

                                <div className="flex-grow overflow-y-auto p-2 space-y-1">
                                    {filteredInventory.map((item, idx) => {
                                        const row = item.data;
                                        const isExpanded = expandedRow === idx;
                                        const sheetName = item.sheetName;

                                        // Resolve Color - Robust Match
                                        const vConfigKey = Object.keys(vendors)
                                            .sort((a, b) => b.length - a.length)
                                            .find(k => sheetName === k || sheetName.includes(k));

                                        const color = vendors[vConfigKey as keyof typeof vendors]?.color || 'var(--text-color-secondary)';

                                        return (
                                            <div key={idx} className="flex flex-col border-[var(--border-color)]">
                                                {/* Main Row */}
                                                <div
                                                    onClick={() => setExpandedRow(isExpanded ? null : idx)}
                                                    className={`group grid items-center py-2 px-2 hover:bg-[var(--glass-bg)] transition-colors text-sm cursor-pointer relative ${isExpanded ? 'bg-[var(--glass-bg)]' : ''}`}
                                                    style={{ gridTemplateColumns: customGridTemplate, gap: '0.5rem' }}
                                                >
                                                    {/* Left Accent */}
                                                    <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md opacity-50 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: color }}></div>

                                                    {displayIndices.map((colErr, i) => {
                                                        const val = row[colErr];

                                                        // Date Column (Index 1 for both)
                                                        if (i === 1) {
                                                            let dateStr = val ? String(val) : '-';
                                                            if (typeof val === 'number') dateStr = new Date(Math.round((val - 25569) * 864e5)).toLocaleDateString('es-MX');
                                                            return <div key={i} className="text-center text-[var(--text-color-secondary)] text-xs">{dateStr}</div>;
                                                        }

                                                        // Tag Column (Index 3 for 825, Index 5 for 326)
                                                        const isTagCol = (version === '825' && i === 3) || (version === '326' && i === 5);
                                                        if (isTagCol) {
                                                            return (
                                                                <div key={i} className="flex justify-center">
                                                                    {val && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-black" style={{ backgroundColor: color }}>{val}</span>}
                                                                </div>
                                                            )
                                                        }

                                                        // Main Text Column (Desc/Object)
                                                        const isMainText = (version === '825' && i === 2) || (version === '326' && i === 3);

                                                        return (
                                                            <div key={i} className={`truncate ${isMainText ? 'text-[var(--text-color)] font-medium' : 'text-center text-[var(--text-color-secondary)]'} ${i === 0 ? 'pl-2' : ''}`}>
                                                                {val !== undefined ? val : '-'}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Expanded Details Row */}
                                                {isExpanded && (
                                                    <div className="bg-[#0a0a0a] border-y border-[var(--border-color)] relative">
                                                        {/* Industrial accent line */}
                                                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: color }}></div>

                                                        <div className="p-4 grid grid-cols-12 gap-6 text-sm">

                                                            {/* 1. Dimensions (H, W, D, Kg) */}
                                                            <div className="col-span-3 flex flex-col gap-2 border-r border-white/5 pr-4">
                                                                <h4 className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-color-secondary)] mb-1">Dimensions</h4>
                                                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[var(--text-color)] font-mono text-xs">
                                                                    <div className="flex justify-between"><span>H:</span> <span className="text-white">{row[colLetterToIndex(version === '326' ? 'I' : 'G')] || '-'} cm</span></div>
                                                                    <div className="flex justify-between"><span>W:</span> <span className="text-white">{row[colLetterToIndex(version === '326' ? 'J' : 'H')] || '-'} cm</span></div>
                                                                    <div className="flex justify-between"><span>D:</span> <span className="text-white">{row[colLetterToIndex(version === '326' ? 'K' : 'I')] || '-'} cm</span></div>
                                                                    <div className="flex justify-between border-t border-white/10 pt-1 mt-1 col-span-2"><span>Wt:</span> <span className="text-white">{row[colLetterToIndex(version === '326' ? 'H' : 'F')] || '-'} kg</span></div>
                                                                </div>
                                                            </div>

                                                            {/* 2. Financials (Cols 4-12) */}
                                                            <div className="col-span-9 grid grid-cols-3 gap-6 pl-2">

                                                                {/* Cost / Acquisition */}
                                                                <div className="flex flex-col gap-1">
                                                                    <h4 className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-color-secondary)]">Cost / Acquisition</h4>
                                                                    <div className="flex items-baseline gap-2">
                                                                        <span className="text-xl font-bold font-mono text-white">
                                                                            {Number(getValueByHeader(row, 'COST') || getValueByHeader(row, 'PRECIO') || getValueByHeader(row, 'MXN') || 0).toLocaleString('en-US', { style: 'currency', currency: 'MXN' })}
                                                                        </span>
                                                                        <span className="text-[10px] text-[var(--text-color-secondary)]">MXN</span>
                                                                    </div>
                                                                    <div className="text-xs font-mono text-[var(--text-color-secondary)] opacity-80 flex items-center gap-2">
                                                                        <span>{Number(getValueByHeader(row, 'AQ') || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                                                                        <span className="text-[10px] opacity-50 uppercase tracking-wide">USD (Aq)</span>
                                                                    </div>
                                                                </div>

                                                                {/* Landed */}
                                                                <div className="flex flex-col gap-1">
                                                                    <h4 className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-color-secondary)]">Landed</h4>
                                                                    <div className="flex items-baseline gap-2">
                                                                        <span className="text-xl font-bold font-mono text-blue-400">
                                                                            {Number(getValueByHeader(row, 'LND') || getValueByHeader(row, 'LANDED') || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                                                        </span>
                                                                        <span className="text-[10px] text-blue-400/50">USD</span>
                                                                    </div>
                                                                </div>

                                                                {/* Retail / Market */}
                                                                <div className="flex flex-col gap-1 relative">
                                                                    <h4 className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-color-secondary)]">Retail / Market</h4>
                                                                    <div className="flex items-baseline gap-2">
                                                                        <span className="text-2xl font-bold font-mono text-green-400">
                                                                            {Number(getValueByHeader(row, 'RETAIL') || getValueByHeader(row, 'MARKET') || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                                        </span>
                                                                        <span className="text-[10px] text-green-400/50">USD</span>
                                                                    </div>
                                                                    {/* Codes as pill */}
                                                                    <div className="mt-2 flex gap-2">
                                                                        {(getValueByHeader(row, 'AQC') || getValueByHeader(row, 'LC')) && (
                                                                            <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-mono text-[var(--text-color-secondary)] border border-white/5">
                                                                                {getValueByHeader(row, 'AQC')}/{getValueByHeader(row, 'LC')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- EXPENSES VIEW --- */}
                    {activeTab === 'expenses' && (
                        <div className="h-full animate-in slide-in-from-right-4 fade-in duration-300">
                            <WorkbookPropertiesView />
                        </div>
                    )}

                    {/* --- SHIPPING VIEW --- */}
                    {activeTab === 'shipping' && (
                        <div className="h-full animate-in slide-in-from-right-4 fade-in duration-300">
                            <WorkbookShippingView />
                        </div>
                    )}

                    {/* --- PAYMENTS VIEW --- */}
                    {activeTab === 'payments' && (
                        <div className="h-full animate-in slide-in-from-right-4 fade-in duration-300">
                            <PaymentsView />
                        </div>
                    )}

                    {/* --- v326 SPECIAL VIEWS --- */}
                    {activeTab === 'log' && (
                        <div className="h-full animate-in slide-in-from-right-4 fade-in duration-300">
                            <WorkbookLogView />
                        </div>
                    )}
                    {activeTab === 'production' && (
                        <div className="h-full animate-in slide-in-from-right-4 fade-in duration-300">
                            <WorkbookProductionView />
                        </div>
                    )}
                    {activeTab === 'supplies' && (
                        <div className="h-full animate-in slide-in-from-right-4 fade-in duration-300">
                            <WorkbookSuppliesView />
                        </div>
                    )}
                    {activeTab === 'crates' && (
                        <div className="h-full animate-in slide-in-from-right-4 fade-in duration-300">
                            <WorkbookCratesView />
                        </div>
                    )}
                    {activeTab === 'paylog' && (
                        <div className="h-full animate-in slide-in-from-right-4 fade-in duration-300">
                            <WorkbookPayLogView />
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
