import React, { useState, useEffect, Suspense, lazy, useMemo } from 'react';
import { useArchive } from './useArchive';
import { tr } from '../../lib/i18n';
import { vendors } from '../../lib/consts';
import { getTextColorForBg } from '../../lib/utils';
import { useAtomValue } from 'jotai/react';
import { workbookDensityAtom, workbookViewModeAtom, exchangeRateAtom } from '../../lib/atoms';
import { trackDocumentJob } from '../print/jobTracking';

const ArchiveBalances = lazy(() => import('./ArchiveBalances'));

const fmtMXN = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const fmtUSD = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';

// CSV cell: double the quotes, and defuse spreadsheet formulas (a leading = + - @ tab or CR makes Excel run the cell)
const csvCell = (v: unknown): string => {
  const t = String(v ?? '').replace(/"/g, '""');
  return '"' + (/^[=+\-@\t\r]/.test(t) ? "'" + t : t) + '"';
};

export const ArchivePanel: React.FC<{ fallback: React.ReactNode }> = ({ fallback }) => {
  const { 
    status, book, vendors: bookVendors, selectedVendor, setVendor,
    search, setSearch, page, hasMore, nextPage, prevPage,
    items, finance, counts, isFinanceRole
  } = useArchive();

  const density = useAtomValue(workbookDensityAtom);
  const viewMode = useAtomValue(workbookViewModeAtom);
  const exchangeRate = useAtomValue(exchangeRateAtom);

  const [localSearch, setLocalSearch] = useState(search);
  const [tab, setTab] = useState<'Items' | 'Ledger'>('Items');

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(localSearch);
    }, 300);
    return () => clearTimeout(handler);
  }, [localSearch, setSearch]);

  const pageQty = useMemo(() => items.reduce((s, i) => s + (i.quantity || 0), 0), [items]);
  const pageWt = useMemo(() => items.reduce((s, i) => s + (i.weight_kg || 0), 0), [items]);
  const pageUsd = useMemo(() => items.reduce((s, i) => {
    const fin = finance[i.id];
    if (!fin) return s;
    const usd = fin.total_usd != null ? fin.total_usd : (fin.total_pesos != null && exchangeRate > 0 ? fin.total_pesos / exchangeRate : 0);
    return s + usd;
  }, 0), [items, finance, exchangeRate]);

  if (status === 'empty' || status === 'unavailable') {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex h-full items-center justify-center p-8 bg-black/40">
        <div className="text-sm font-black tracking-widest uppercase text-white/40">
          {status === 'empty' ? tr("Archive Empty") : tr("Archive Unavailable")}
        </div>
      </div>
    );
  }

  const handleExportCSV = () => trackDocumentJob({
    templateId: 'fmt-archive-season-825-csv',
    kind: 'csv',
    season: 'legacy',
    getSnapshot: () => items
  }, () => {
    let csv = '';
    const headers = ['VND', 'TAG ID', 'Item Number', 'Date', 'Description', 'Qty', 'Wt.', 'Dimensions'];
    if (isFinanceRole) {
      headers.push('Price MXN', 'Total Pesos', 'AQ', 'LND', 'Retail', 'Total USD', 'AQC', 'LC', 'SQM Price', 'AQ Round', 'LND Round', 'Desc Price');
    }
    csv += headers.map(h => `"${h}"`).join(',') + '\n';
    
    items.forEach(item => {
      const row = [
        item.vendor,
        item.tag_id || '',
        item.item_number || '',
        fmtDate(item.item_date),
        (item.description || '').replace(/"/g, '""'),
        item.quantity?.toString() || '',
        item.weight_kg?.toString() || '',
        `${item.height_cm||0}x${item.width_cm||0}x${item.length_cm||0}`
      ];
      
      if (isFinanceRole) {
        const fin = finance[item.id];
        if (fin) {
          row.push(
            fin.price_mxn?.toString() || '',
            fin.total_pesos?.toString() || '',
            fin.aq?.toString() || '',
            fin.lnd?.toString() || '',
            fin.retail?.toString() || '',
            fin.total_usd?.toString() || '',
            fin.aqc?.toString() || '',
            fin.lc?.toString() || '',
            fin.sqm_price?.toString() || '',
            fin.aq_round?.toString() || '',
            fin.lnd_round?.toString() || '',
            fin.desc_price?.toString() || ''
          );
        } else {
          row.push('', '', '', '', '', '', '', '', '', '', '', '');
        }
      }
      
      csv += row.map(csvCell).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `archive_${book?.season || 'export'}_${selectedVendor || 'vendor'}_page${page}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  const pyClass = density === 'compact' ? 'py-1' : 'py-3';
  const isGallery = viewMode === 'gallery';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black/40">
      {/* Top Segmented Control */}
      <div className="flex justify-center p-3 border-b border-white/5 bg-black/20 shrink-0">
        <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
          <button onClick={() => setTab('Items')} className={`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2px-6 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'Items' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}>
            {tr('Items')}
          </button>
          {isFinanceRole && (
            <button onClick={() => setTab('Ledger')} className={`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2px-6 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'Ledger' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}>
              {tr('Ledger')}
            </button>
          )}
        </div>
      </div>

      {tab === 'Ledger' && isFinanceRole ? (
        <div className="flex-1 overflow-hidden relative">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-white/40 text-xs font-mono uppercase">{tr("Loading Ledger...")}</div>}>
            <ArchiveBalances />
          </Suspense>
        </div>
      ) : (
        <>
          {/* Banner */}
          {book && (
            <div className="flex gap-4 p-4 border-b border-white/5 items-center shrink-0 bg-black/20">
              <div className="flex flex-col">
                <h1 className="text-xl font-black tracking-tighter text-white/90 uppercase">{tr("ARCHIVE BOOK")}</h1>
                <span className="text-[10px] font-mono text-white/50">{tr("Season")}: {book.season}</span>
              </div>
              <div className="ml-auto flex items-center gap-6">
                <div className="flex flex-col items-end">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{tr("Source File")}</span>
                  <span className="text-xs font-mono font-bold text-white">{book.source_file}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{tr("Imported")}</span>
                  <span className="text-xs font-mono font-bold text-white">{new Date(book.imported_at).toLocaleString()}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">{tr("SHA256")}</span>
                  <span className="text-xs font-mono font-bold text-[var(--main-color)]">{book.sha256.substring(0, 8)}</span>
                </div>
              </div>
            </div>
          )}

          {/* KPI Strip */}
          <div className="flex gap-4 p-4 border-b border-white/5 bg-black/20 overflow-x-auto shrink-0 custom-scrollbar">
            <div className="flex flex-col bg-white/[0.02] border border-white/5 p-3 rounded-2xl min-w-[140px]">
              <span className="text-[9px] font-black tracking-widest text-white/40 uppercase">{tr("Vendor Items")}</span>
              <span className="text-xl font-mono font-bold text-white mt-1">{selectedVendor ? (counts[selectedVendor] || 0) : 0}</span>
            </div>
            <div className="flex flex-col bg-white/[0.02] border border-white/5 p-3 rounded-2xl min-w-[140px]">
              <span className="text-[9px] font-black tracking-widest text-white/40 uppercase">{tr("Total Quantity")}</span>
              <span className="text-xl font-mono font-bold text-white mt-1">{pageQty}</span>
            </div>
            <div className="flex flex-col bg-white/[0.02] border border-white/5 p-3 rounded-2xl min-w-[140px]">
              <span className="text-[9px] font-black tracking-widest text-white/40 uppercase">{tr("Total Weight (KG)")}</span>
              <span className="text-xl font-mono font-bold text-white mt-1">{pageWt.toFixed(2)}</span>
            </div>
            {isFinanceRole && (
              <div className="flex flex-col bg-white/[0.02] border border-white/5 p-3 rounded-2xl min-w-[140px]">
                <span className="text-[9px] font-black tracking-widest text-white/40 uppercase">{tr("Page Total")} (USD)</span>
                <span className="text-xl font-mono font-bold text-[var(--main-color)] mt-1">{fmtUSD(pageUsd)}</span>
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex gap-3 p-3 items-center shrink-0 border-b border-white/5 bg-black/10">
            {/* Search */}
            <div className="relative w-64">
              <input 
                type="text" 
                value={localSearch} 
                onChange={e => setLocalSearch(e.target.value)} 
                placeholder={tr("Search")} 
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2 text-xs text-white/80 focus:ring-1 focus:ring-[var(--main-color)] transition-all placeholder:text-white/10" 
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-20">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>

            {/* Vendors */}
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 overflow-x-auto max-w-md custom-scrollbar">
              {bookVendors.map(v => {
                const vColor = vendors[v as keyof typeof vendors]?.color || '#555';
                const isActive = selectedVendor === v;
                return (
                  <button
                    key={v}
                    onClick={() => setVendor(v)}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all whitespace-nowrap shadow-sm`}
                    style={isActive ? { backgroundColor: vColor, color: getTextColorForBg(vColor) } : { color: vColor, border: `1px solid ${vColor}40`, backgroundColor: 'transparent' }}
                  >
                    {v}
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex gap-4 items-center">
              {status === 'loading' && <span className="text-[10px] font-mono text-white/40 uppercase animate-pulse">{tr("Loading...")}</span>}
              
              <button onClick={handleExportCSV} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase text-white/60 hover:text-white hover:bg-white/5 transition-all">
                {tr("Export CSV")}
              </button>
              
              <div className="flex gap-2 items-center">
                <button 
                  onClick={prevPage} 
                  disabled={page === 0} 
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  {tr("Previous")}
                </button>
                <span className="text-[10px] font-mono text-white/40 uppercase">{tr("Page")} {page + 1}</span>
                <button 
                  onClick={nextPage} 
                  disabled={!hasMore} 
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  {tr("Next")}
                </button>
              </div>
            </div>
          </div>

          {/* Items View */}
          <div className="flex-1 overflow-auto custom-scrollbar p-3">
            {isGallery ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {items.map(item => {
                  const vColor = vendors[item.vendor as keyof typeof vendors]?.color || '#555';
                  return (
                    <div key={item.id} className="relative bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:bg-white/[0.04] transition-all overflow-hidden flex flex-col gap-2">
                      <div className="flex items-start justify-between">
                        <div className="px-2 py-1 rounded-md text-[10px] font-black shadow-lg uppercase" style={{ backgroundColor: vColor, color: getTextColorForBg(vColor) }}>
                          {item.vendor}
                        </div>
                        <div className="text-right flex flex-col">
                          <span className="text-[14px] font-black font-mono text-white/80 uppercase">{item.tag_id || '—'}</span>
                          <span className="text-[9px] font-mono text-white/40">{item.item_number || '—'}</span>
                        </div>
                      </div>
                      <div className="text-xs text-white/80 line-clamp-3 mt-2">{item.description || '—'}</div>
                      <div className="flex flex-wrap gap-1 mt-auto pt-2">
                        {item.color && <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-white/60">{item.color}</span>}
                        {item.shape && <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-white/60">{item.shape}</span>}
                      </div>
                      <div className="flex justify-between items-end border-t border-white/5 pt-2 mt-2">
                        <div className="flex flex-col">
                          <span className="text-[8px] font-black text-white/20 uppercase">{tr("Qty / Wt")}</span>
                          <span className="text-[10px] font-mono text-white/60">{item.quantity ?? '—'} / {item.weight_kg ?? '—'}kg</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[8px] font-black text-white/20 uppercase">{tr("Dimensions")}</span>
                          <span className="text-[9px] font-mono text-white/40">{item.height_cm||0}x{item.width_cm||0}x{item.length_cm||0}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {status === 'loading' && items.length === 0 && Array.from({length: 12}).map((_, i) => (
                  <div key={i} className="h-40 bg-white/[0.02] border border-white/5 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/5 overflow-auto custom-scrollbar bg-white/[0.01] backdrop-blur-md h-full">
                <table className="w-full text-left border-collapse min-w-max">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/[0.02] whitespace-nowrap">
                      <th className={`px-4 ${pyClass} w-12 text-center sticky left-0 z-10 bg-[#1c1c1c] shadow-[1px_0_0_rgba(255,255,255,0.05)]`}>{tr("VND")}</th>
                      <th className={`px-4 ${pyClass}`}>{tr("TAG ID")}</th>
                      <th className={`px-4 ${pyClass}`}>{tr("Num")}</th>
                      <th className={`px-4 ${pyClass}`}>{tr("Date")}</th>
                      <th className={`px-4 ${pyClass} max-w-[200px]`}>{tr("Description")}</th>
                      <th className={`px-4 ${pyClass}`}>{tr("Qty")}</th>
                      <th className={`px-4 ${pyClass}`}>{tr("Wt.")}</th>
                      <th className={`px-4 ${pyClass}`}>{tr("Dimensions")}</th>
                      {isFinanceRole && (
                        <>
                          <th className={`px-4 ${pyClass} text-right`}>{tr("Price MXN")}</th>
                          <th className={`px-4 ${pyClass} text-right`}>{tr("Total Pesos")}</th>
                          <th className={`px-4 ${pyClass} text-right`}>AQ</th>
                          <th className={`px-4 ${pyClass} text-right`}>LND</th>
                          <th className={`px-4 ${pyClass} text-right`}>{tr("Retail")}</th>
                          <th className={`px-4 ${pyClass} text-right`}>{tr("Total USD")}</th>
                          <th className={`px-4 ${pyClass} text-right`}>AQC</th>
                          <th className={`px-4 ${pyClass} text-right`}>LC</th>
                          <th className={`px-4 ${pyClass} text-right`}>SQM Price</th>
                          <th className={`px-4 ${pyClass} text-right`}>{tr("AQ Round")}</th>
                          <th className={`px-4 ${pyClass} text-right`}>{tr("LND Round")}</th>
                          <th className={`px-4 ${pyClass} text-right`}>{tr("Desc Price")}</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {status === 'loading' && items.length === 0 ? (
                      Array.from({length: 10}).map((_, i) => (
                        <tr key={`skel-${i}`} className="animate-pulse">
                          <td className={`px-4 ${pyClass} sticky left-0 z-10 bg-[#1c1c1c] shadow-[1px_0_0_rgba(255,255,255,0.05)]`}><div className="h-6 w-8 bg-white/5 rounded mx-auto"></div></td>
                          <td className={`px-4 ${pyClass}`}><div className="h-4 w-16 bg-white/5 rounded"></div></td>
                          <td className={`px-4 ${pyClass}`}><div className="h-4 w-12 bg-white/5 rounded"></div></td>
                          <td className={`px-4 ${pyClass}`}><div className="h-4 w-20 bg-white/5 rounded"></div></td>
                          <td className={`px-4 ${pyClass}`}><div className="h-4 w-40 bg-white/5 rounded"></div></td>
                          <td className={`px-4 ${pyClass}`}><div className="h-4 w-8 bg-white/5 rounded"></div></td>
                          <td className={`px-4 ${pyClass}`}><div className="h-4 w-8 bg-white/5 rounded"></div></td>
                          <td className={`px-4 ${pyClass}`}><div className="h-4 w-16 bg-white/5 rounded"></div></td>
                          {isFinanceRole && Array.from({length: 12}).map((_, j) => (
                             <td key={j} className={`px-4 ${pyClass}`}><div className="h-4 w-16 bg-white/5 rounded ml-auto"></div></td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      items.map((item) => {
                        const vColor = vendors[item.vendor as keyof typeof vendors]?.color || '#555';
                        const fin = finance[item.id];
                        return (
                          <tr key={item.id} className="hover:bg-white/[0.04] group transition-all duration-200">
                            <td className={`px-4 ${pyClass} text-center sticky left-0 z-10 bg-[#1c1c1c] shadow-[1px_0_0_rgba(255,255,255,0.05)] group-hover:bg-[#252525]`}>
                              <div className="inline-flex w-7 h-6 rounded-md items-center justify-center text-[10px] font-black shadow-lg" style={{ backgroundColor: vColor, color: getTextColorForBg(vColor) }}>
                                {item.vendor}
                              </div>
                            </td>
                            <td className={`px-4 ${pyClass} font-mono text-[10px] text-white/40 uppercase`}>{item.tag_id || '—'}</td>
                            <td className={`px-4 ${pyClass} font-mono text-[10px] text-white/60`}>{item.item_number || '—'}</td>
                            <td className={`px-4 ${pyClass} font-mono text-[9px] text-white/30`}>{fmtDate(item.item_date)}</td>
                            <td className={`px-4 ${pyClass}`}>
                              <div className="text-xs text-white/70 line-clamp-2 max-w-[250px]">{item.description || item.shape || '—'}</div>
                            </td>
                            <td className={`px-4 ${pyClass} font-mono text-xs text-white/80`}>{item.quantity ?? '—'}</td>
                            <td className={`px-4 ${pyClass} font-mono text-xs text-white/80`}>{item.weight_kg ?? '—'}</td>
                            <td className={`px-4 ${pyClass} font-mono text-[9px] text-white/40`}>{item.height_cm||0}x{item.width_cm||0}x{item.length_cm||0}</td>
                            
                            {isFinanceRole && (
                              <>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtMXN(fin?.price_mxn ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtMXN(fin?.total_pesos ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtUSD(fin?.aq ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtUSD(fin?.lnd ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtUSD(fin?.retail ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-[var(--main-color)]`}>{fmtUSD(fin?.total_usd ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtUSD(fin?.aqc ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtUSD(fin?.lc ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtUSD(fin?.sqm_price ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtUSD(fin?.aq_round ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtUSD(fin?.lnd_round ?? null)}</td>
                                <td className={`px-4 ${pyClass} text-right font-mono text-[10px] text-white/60`}>{fmtUSD(fin?.desc_price ?? null)}</td>
                              </>
                            )}
                          </tr>
                        );
                      })
                    )}
                    {items.length === 0 && status !== 'loading' && (
                      <tr>
                        <td colSpan={isFinanceRole ? 20 : 8} className={`px-4 py-12 text-center text-white/20 text-xs font-black uppercase tracking-widest`}>
                          {tr("No records found in the archive.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
