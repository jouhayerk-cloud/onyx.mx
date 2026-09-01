import React, { useEffect, useState, useMemo } from 'react';
import { useAtom } from 'jotai';
import { dashboardExpDataAtom } from '../../lib/atoms';
import { vendors } from '../../lib/consts';
import { getTextColorForBg } from '../../lib/utils';
import { WorkbookItemViewer } from './WorkbookItemViewer';
import { useDatabase } from '../../lib/hooks';
import { tr } from '../../lib/i18n';

interface DashboardEXPProps { }

const DashboardEXP: React.FC<DashboardEXPProps> = () => {
  const [allSheetsRawData, setAllSheetsRawData] = useAtom(dashboardExpDataAtom);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState(18.0);
  const [workbookPrefix, setWorkbookPrefix] = useState('825');
  const db = useDatabase();

  useEffect(() => {
    if (allSheetsRawData && Object.keys(allSheetsRawData).length > 0 && !activeSheet) {
      const availableSheetNames = Object.keys(allSheetsRawData);
      if (availableSheetNames.length > 0) {
        setActiveSheet(availableSheetNames[0]);
      }
    }
  }, [allSheetsRawData, activeSheet]);

  useEffect(() => {
    if (!db) return;
    const sub = db.inventory.find().$.subscribe((docs: any) => {
      try {

        const sheetsData: { [key: string]: any[] } = {};
        docs.forEach((doc: any) => {
          const data = doc.toJSON();
          const vendorId = data.itemId || data.item_id || 'Unknown';
          if (!sheetsData[vendorId]) sheetsData[vendorId] = [];

          const row: any = {};
          Object.entries(data).forEach(([key, value]) => {
            if (typeof key === 'string' && key.trim() !== '') {
              row[key] = value;
            }
          });
          row.vendorSheet = vendorId;
          sheetsData[vendorId].push(row);
        });

        setAllSheetsRawData(sheetsData);
        setLoading(false);
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => sub.unsubscribe();
  }, [db, setAllSheetsRawData]);

  if (loading) {
    return <div className="p-4 text-center">{tr("Loading dashboard data...")}</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">{tr("Error:")} {error}</div>;
  }

  if (!allSheetsRawData || Object.keys(allSheetsRawData).length === 0) {
    return <div className="p-4 text-center">{tr("No data available for workbook.")}</div>;
  }

  const processedData = useMemo(() => {
    if (!activeSheet || !allSheetsRawData[activeSheet]) return [];
    return allSheetsRawData[activeSheet];
  }, [allSheetsRawData, activeSheet]);

  const allSheetNames = Object.keys(allSheetsRawData);

  return (
    <div className="flex flex-col h-full gap-4">
      <h2 className="text-2xl font-bold mb-4">{tr("Workbook")}</h2>
      <div className="dashboard-stats">
        <div className="stat-card">
          <label htmlFor="exchange-rate">{tr("Exchange Rate (MXN to USD)")}</label>
          <input id="exchange-rate" type="number" value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value))} step="0.1" />
        </div>
        <div className="stat-card">
          <label htmlFor="workbook-prefix">{tr("Workbook Prefix")}</label>
          <input id="workbook-prefix" type="text" value={workbookPrefix} onChange={e => setWorkbookPrefix(e.target.value)} />
        </div>
      </div>
      <div className="dashboard-tabs">
        {allSheetNames.map(sheetName => (
          <button
            key={sheetName}
            onClick={() => setActiveSheet(sheetName)}
            className={`tab-button ${activeSheet === sheetName ? 'active' : ''}`}
            style={activeSheet === sheetName ? {
              backgroundColor: vendors[sheetName as keyof typeof vendors]?.color || 'var(--accent-color)',
              color: getTextColorForBg(vendors[sheetName as keyof typeof vendors]?.color)
            } : {}}
          >
            {sheetName}
            <span className="count" style={activeSheet === sheetName ? { backgroundColor: 'rgba(0,0,0,0.2)', color: getTextColorForBg(vendors[sheetName as keyof typeof vendors]?.color) } : {}}>{allSheetsRawData[sheetName]?.length || 0}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto dashboard-content">
        <div className="projects-section">
          <div className="projects-section-header">
            <p className="text-sm font-semibold">
              {activeSheet} {tr("Data")}
              <span className="ml-2 text-xs font-normal text-[var(--secondary-text-color)]">({processedData.length} {tr("items)")}</span>
            </p>
          </div>
          <div className="project-boxes">
            {processedData.map((row: any, rowIndex: number) => (
              <WorkbookItemViewer
                key={rowIndex}
                item={row}
                vendor={row.vendorSheet || activeSheet}
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