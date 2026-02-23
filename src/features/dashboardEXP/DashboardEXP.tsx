import React, { useEffect, useState, useMemo } from 'react';
import { useAtom } from 'jotai';
import * as XLSX from 'xlsx';
import { dashboardExpDataAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { getTextColorForBg } from '../../lib/utils';
import { WorkbookItemViewer } from './WorkbookItemViewer';

interface DashboardEXPProps {}

const DashboardEXP: React.FC<DashboardEXPProps> = () => {
  const [allSheetsRawData, setAllSheetsRawData] = useAtom(dashboardExpDataAtom);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [bookVData, setBookVData] = useState<any[]>([]);
  const [exchangeRate, setExchangeRate] = useState(18.0);
  const [workbookPrefix, setWorkbookPrefix] = useState('825');

  useEffect(() => {
    if (allSheetsRawData && Object.keys(allSheetsRawData).length > 0 && !activeSheet) {
      const availableSheetNames = Object.keys(allSheetsRawData);
      if (availableSheetNames.length > 0) {
        setActiveSheet(availableSheetNames[0]);
      }
    }
  }, [allSheetsRawData, activeSheet]);

  useEffect(() => {
            const fetchData = async () => {
                try {
                    setLoading(true);
                    const response = await fetch('/bookDASH.xlsx');
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    
                    let sheetNamesToRead = [
                        'RF', 'AM', 'EM', 'JM', 'AN', 'CP', 'ML', 'DH', 'FR',
                        'TE', 'GE', 'GS', 'BT', 'ET'
                    ]; // Removed bookV from this list as it's handled separately
                    const sheetsData: { [key: string]: any[] } = {};

                    // Process bookV data separately
                    const bookVWorksheet = workbook.Sheets['bookV'];
                    if (bookVWorksheet) {
                      setBookVData(XLSX.utils.sheet_to_json(bookVWorksheet));
                    } else {
                      console.warn(`Sheet "bookV" not found in bookDASH.xlsx`);
                      setBookVData([]);
                    }
    
                    sheetNamesToRead.forEach(sheetName => {
                        const worksheet = workbook.Sheets[sheetName];
                        if (worksheet) {
                            sheetsData[sheetName] = XLSX.utils.sheet_to_json(worksheet, {header: 1});
                        } else {
                            console.warn(`Sheet "${sheetName}" not found in bookDASH.xlsx`);
                            sheetsData[sheetName] = [];
                        }
                    });
    
                    setAllSheetsRawData(sheetsData);
                } catch (e: any) {
                    setError(e.message);
                    console.error("Error reading XLSX file:", e);
                } finally {
                    setLoading(false);
                }
            };
    fetchData();
  }, [setAllSheetsRawData]);

  if (loading) {
    return <div className="p-4 text-center">Loading dashboard data...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  }

  if (!allSheetsRawData || Object.keys(allSheetsRawData).length === 0) {
    return <div className="p-4 text-center">No data available for workbook.</div>;
  }

  // Memoize processed data for the active sheet or all sheets
  const processedData = useMemo(() => {
    let rawDataToProcess: { sheetName: string, data: any[][] }[] = [];

    // Only process the active sheet for now (no ALL filter yet)
    if (activeSheet && allSheetsRawData[activeSheet]) {
      rawDataToProcess.push({ sheetName: activeSheet, data: allSheetsRawData[activeSheet] });
    } else {
      return []; // No active sheet or data found
    }

    const compiledItems: any[] = [];
    rawDataToProcess.forEach(({ sheetName, data }) => {
      const headers = (data.length > 3) ? data[2] : []; // Headers are assumed to be in the 3rd row (index 2)

      const itemsForSheet = (data.length > 3) ? data.slice(3).map(row => {
        const rowData: {[key: string]: any} = {};
        headers.forEach((header: any, index: number) => {
            if (typeof header === 'string' && header.trim() !== '') {
                rowData[header] = row[index];
            } else {
                rowData[`__EMPTY_${index}`] = row[index];
            }
        });
        rowData.vendorSheet = sheetName; // Add original vendor sheet name
        return rowData;
      }) : [];
      compiledItems.push(...itemsForSheet);
    });

    return compiledItems;
  }, [allSheetsRawData, activeSheet]);

  const allSheetNames = Object.keys(allSheetsRawData);

  return (
    <div className="flex flex-col h-full gap-4">
      <h2 className="text-2xl font-bold mb-4">Workbook</h2>
      <div className="dashboard-stats">
          <div className="stat-card">
              <label htmlFor="exchange-rate">Exchange Rate (MXN to USD)</label>
              <input id="exchange-rate" type="number" value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value))} step="0.1" />
          </div>
          <div className="stat-card">
              <label htmlFor="workbook-prefix">Workbook Prefix</label>
              <input id="workbook-prefix" type="text" value={workbookPrefix} onChange={e => setWorkbookPrefix(e.target.value)} />
          </div>
      </div>
      {bookVData.length > 0 && (
        <div className="dashboard-stats mb-4">
          <div className="stat-card p-4 rounded-lg shadow-md bg-[var(--sidebar-bg)] border border-[var(--border-color)]">
            <h3 className="text-lg font-semibold mb-2">BookV Control Data</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(bookVData[0]).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="font-medium text-[var(--secondary-text-color)]">{key}:</span>
                  <span className="text-[var(--text-color)]">{value?.toString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="dashboard-tabs">
        {allSheetNames.map(sheetName => (
          <button
            key={sheetName}
            onClick={() => setActiveSheet(sheetName)}
            className={`tab-button ${activeSheet === sheetName ? 'active' : ''}`}
            style={activeSheet === sheetName ? {
              backgroundColor: vendors[sheetName as keyof typeof vendors]?.color || 'var(--accent-color)', // Fallback to accent color
              color: getTextColorForBg(vendors[sheetName as keyof typeof vendors]?.color)
            } : {}}
          >
            {sheetName}
            <span className="count" style={activeSheet === sheetName ? { backgroundColor: 'rgba(0,0,0,0.2)', color: getTextColorForBg(vendors[sheetName as keyof typeof vendors]?.color) } : {}}>{allSheetsRawData[sheetName].slice(3).length}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto dashboard-content">
        <div className="projects-section">
          <div className="projects-section-header">
            <p className="text-sm font-semibold">
              {activeSheet} Data
              <span className="ml-2 text-xs font-normal text-[var(--secondary-text-color)]">({processedData.length} items)</span>
            </p>
          </div>
          <div className="project-boxes">
            {processedData.map((row: any, rowIndex: number) => (
              <WorkbookItemViewer 
                key={rowIndex} 
                item={row} 
                vendor={row.vendorSheet || activeSheet} // Pass the individual item's vendor sheet
                exchangeRate={exchangeRate} 
                workbookPrefix={workbookPrefix} 
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardEXP;