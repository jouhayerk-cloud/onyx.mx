import React, { useState, useEffect } from 'react';
import { useArchive } from './useArchive';
import { tr } from '../../lib/i18n';
import { vendors } from '../../lib/consts';
import { getTextColorForBg } from '../../lib/utils';

const fmtMXN = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const fmtUSD = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';

export const ArchivePanel: React.FC<{ fallback: React.ReactNode }> = ({ fallback }) => {
  const { 
    status, book, vendors: bookVendors, selectedVendor, setVendor,
    search, setSearch, page, hasMore, nextPage, prevPage,
    items, finance, isFinanceRole
  } = useArchive();

  const [localSearch, setLocalSearch] = useState(search);

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(localSearch);
    }, 300);
    return () => clearTimeout(handler);
  }, [localSearch, setSearch]);

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

  const handleExportCSV = () => {
    let csv = '';
    const headers = ['VND', 'TAG ID', 'Item Number', 'Date', 'Description', 'Qty', 'Wt.', 'Dimensions'];
    if (isFinanceRole) {
      headers.push('Price MXN', 'Total Pesos', 'AQ', 'LND', 'Retail', 'Total USD', 'AQC', 'LC', 'SQM Price');
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
            fin.sqm_price?.toString() || ''
          );
        } else {
          row.push('', '', '', '', '', '', '', '', '');
        }
      }
      
      csv += row.map(v => `"${v}"`).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `archive_${book?.season || 'export'}_${selectedVendor || 'vendor'}_page${page}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black/40">
      {/* Banner */}
      {book && (
        <div className="flex gap-4 p-4 border-b border-white/5 items-center shrink-0">
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
          {bookVendors.map(v => (
            <button
              key={v}
              onClick={() => setVendor(v)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest transition-all whitespace-nowrap ${selectedVendor === v ? 'bg-[var(--main-color)] text-black shadow-lg' : 'text-white/40 hover:text-white/60'}`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-4 items-center">
          {status === 'loading' && <span className="text-[10px] font-mono text-white/40 uppercase animate-pulse">{tr("Loading...")}</span>}
          
          <button onClick={handleExportCSV} className="px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase text-white/60 hover:text-white hover:bg-white/5 transition-all">
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

      {/* Table */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        <div className="rounded-2xl border border-white/5 overflow-hidden bg-white/[0.01] backdrop-blur-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5 bg-white/[0.02] whitespace-nowrap">
                <th className="px-4 py-3 w-12 text-center">{tr("VND")}</th>
                <th className="px-4 py-3">{tr("TAG ID")}</th>
                <th className="px-4 py-3">{tr("Num")}</th>
                <th className="px-4 py-3">{tr("Date")}</th>
                <th className="px-4 py-3 max-w-[200px]">{tr("Description")}</th>
                <th className="px-4 py-3">{tr("Qty")}</th>
                <th className="px-4 py-3">{tr("Wt.")}</th>
                <th className="px-4 py-3">{tr("Dimensions")}</th>
                {isFinanceRole && (
                  <>
                    <th className="px-4 py-3 text-right">{tr("Price MXN")}</th>
                    <th className="px-4 py-3 text-right">{tr("Total Pesos")}</th>
                    <th className="px-4 py-3 text-right">AQ</th>
                    <th className="px-4 py-3 text-right">LND</th>
                    <th className="px-4 py-3 text-right">{tr("Retail")}</th>
                    <th className="px-4 py-3 text-right">{tr("Total USD")}</th>
                    <th className="px-4 py-3 text-right">AQC</th>
                    <th className="px-4 py-3 text-right">LC</th>
                    <th className="px-4 py-3 text-right">SQM Price</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {items.map((item) => {
                const vColor = vendors[item.vendor as keyof typeof vendors]?.color || '#555';
                const fin = finance[item.id];
                return (
                  <tr key={item.id} className="hover:bg-white/[0.04] group transition-all duration-200">
                    <td className="px-4 py-2 text-center">
                      <div className="inline-flex w-7 h-6 rounded-md items-center justify-center text-[10px] font-black shadow-lg" style={{ backgroundColor: vColor, color: getTextColorForBg(vColor) }}>
                        {item.vendor}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-[10px] text-white/40 uppercase">{item.tag_id || '—'}</td>
                    <td className="px-4 py-2 font-mono text-[10px] text-white/60">{item.item_number || '—'}</td>
                    <td className="px-4 py-2 font-mono text-[9px] text-white/30">{fmtDate(item.item_date)}</td>
                    <td className="px-4 py-2">
                      <div className="text-xs text-white/70 line-clamp-2 max-w-[250px]">{item.description || item.shape || '—'}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-white/80">{item.quantity ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-white/80">{item.weight_kg ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-[9px] text-white/40">{item.height_cm||0}x{item.width_cm||0}x{item.length_cm||0}</td>
                    
                    {isFinanceRole && (
                      <>
                        <td className="px-4 py-2 text-right font-mono text-[10px] text-white/60">{fmtMXN(fin?.price_mxn ?? null)}</td>
                        <td className="px-4 py-2 text-right font-mono text-[10px] text-white/60">{fmtMXN(fin?.total_pesos ?? null)}</td>
                        <td className="px-4 py-2 text-right font-mono text-[10px] text-white/60">{fmtUSD(fin?.aq ?? null)}</td>
                        <td className="px-4 py-2 text-right font-mono text-[10px] text-white/60">{fmtUSD(fin?.lnd ?? null)}</td>
                        <td className="px-4 py-2 text-right font-mono text-[10px] text-white/60">{fmtUSD(fin?.retail ?? null)}</td>
                        <td className="px-4 py-2 text-right font-mono text-[10px] text-[var(--main-color)]">{fmtUSD(fin?.total_usd ?? null)}</td>
                        <td className="px-4 py-2 text-right font-mono text-[10px] text-white/60">{fmtUSD(fin?.aqc ?? null)}</td>
                        <td className="px-4 py-2 text-right font-mono text-[10px] text-white/60">{fmtUSD(fin?.lc ?? null)}</td>
                        <td className="px-4 py-2 text-right font-mono text-[10px] text-white/60">{fmtUSD(fin?.sqm_price ?? null)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
              {items.length === 0 && status !== 'loading' && (
                <tr>
                  <td colSpan={isFinanceRole ? 14 : 8} className="px-4 py-12 text-center text-white/20 text-xs font-black uppercase tracking-widest">
                    {tr("No records found in the archive.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
