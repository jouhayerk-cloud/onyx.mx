# Headless extracts C: archive 825 csv

Script-extracted, verbatim, with source line numbers.

## imports, helpers (fmtDate, csvCell) and the hook usage (src/features/archive/ArchivePanel.tsx, lines 1-30)
```tsx
1: import React, { useState, useEffect, Suspense, lazy, useMemo } from 'react';
2: import { useArchive } from './useArchive';
3: import { tr } from '../../lib/i18n';
4: import { vendors } from '../../lib/consts';
5: import { getTextColorForBg } from '../../lib/utils';
6: import { useAtomValue } from 'jotai/react';
7: import { workbookDensityAtom, workbookViewModeAtom, exchangeRateAtom } from '../../lib/atoms';
8: import { trackDocumentJob } from '../print/jobTracking';
9: 
10: const ArchiveBalances = lazy(() => import('./ArchiveBalances'));
11: 
12: const fmtMXN = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
13: const fmtUSD = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
14: const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';
15: 
16: // CSV cell: double the quotes, and defuse spreadsheet formulas (a leading = + - @ tab or CR makes Excel run the cell)
17: const csvCell = (v: unknown): string => {
18:   const t = String(v ?? '').replace(/"/g, '""');
19:   return '"' + (/^[=+\-@\t\r]/.test(t) ? "'" + t : t) + '"';
20: };
21: 
22: export const ArchivePanel: React.FC<{ fallback: React.ReactNode }> = ({ fallback }) => {
23:   const { 
24:     status, book, vendors: bookVendors, selectedVendor, setVendor,
25:     search, setSearch, page, hasMore, nextPage, prevPage,
26:     items, finance, counts, isFinanceRole
27:   } = useArchive();
28: 
29:   const density = useAtomValue(workbookDensityAtom);
30:   const viewMode = useAtomValue(workbookViewModeAtom);
```

## handleExportCSV (the whole csv builder lives inside the click handler) (src/features/archive/ArchivePanel.tsx, lines 61-138)
```tsx
61:   }
62: 
63:   const handleExportCSV = () => trackDocumentJob({
64:     templateId: 'fmt-archive-season-825-csv',
65:     kind: 'csv',
66:     season: 'legacy',
67:     getSnapshot: () => items
68:   }, () => {
69:     let csv = '';
70:     const headers = ['VND', 'TAG ID', 'Item Number', 'Date', 'Description', 'Qty', 'Wt.', 'Dimensions'];
71:     if (isFinanceRole) {
72:       headers.push('Price MXN', 'Total Pesos', 'AQ', 'LND', 'Retail', 'Total USD', 'AQC', 'LC', 'SQM Price', 'AQ Round', 'LND Round', 'Desc Price');
73:     }
74:     csv += headers.map(h => `"${h}"`).join(',') + '\n';
75:     
76:     items.forEach(item => {
77:       const row = [
78:         item.vendor,
79:         item.tag_id || '',
80:         item.item_number || '',
81:         fmtDate(item.item_date),
82:         (item.description || '').replace(/"/g, '""'),
83:         item.quantity?.toString() || '',
84:         item.weight_kg?.toString() || '',
85:         `${item.height_cm||0}x${item.width_cm||0}x${item.length_cm||0}`
86:       ];
87:       
88:       if (isFinanceRole) {
89:         const fin = finance[item.id];
90:         if (fin) {
91:           row.push(
92:             fin.price_mxn?.toString() || '',
93:             fin.total_pesos?.toString() || '',
94:             fin.aq?.toString() || '',
95:             fin.lnd?.toString() || '',
96:             fin.retail?.toString() || '',
97:             fin.total_usd?.toString() || '',
98:             fin.aqc?.toString() || '',
99:             fin.lc?.toString() || '',
100:             fin.sqm_price?.toString() || '',
101:             fin.aq_round?.toString() || '',
102:             fin.lnd_round?.toString() || '',
103:             fin.desc_price?.toString() || ''
104:           );
105:         } else {
106:           row.push('', '', '', '', '', '', '', '', '', '', '', '');
107:         }
108:       }
109:       
110:       csv += row.map(csvCell).join(',') + '\n';
111:     });
112:     
113:     const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
114:     const url = URL.createObjectURL(blob);
115:     const link = document.createElement('a');
116:     link.href = url;
117:     link.setAttribute('download', `archive_${book?.season || 'export'}_${selectedVendor || 'vendor'}_page${page}.csv`);
118:     document.body.appendChild(link);
119:     link.click();
120:     document.body.removeChild(link);
121:   });
122: 
123:   const pyClass = density === 'compact' ? 'py-1' : 'py-3';
124:   const isGallery = viewMode === 'gallery';
125: 
126:   return (
127:     <div className="flex flex-col h-full overflow-hidden bg-black/40">
128:       {/* Top Segmented Control */}
129:       <div className="flex justify-center p-3 border-b border-white/5 bg-black/20 shrink-0">
130:         <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
131:           <button onClick={() => setTab('Items')} className={`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2px-6 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'Items' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}>
132:             {tr('Items')}
133:           </button>
134:           {isFinanceRole && (
135:             <button onClick={() => setTab('Ledger')} className={`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2px-6 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'Ledger' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}>
136:               {tr('Ledger')}
137:             </button>
138:           )}
```

## useArchive (item and finance shapes, paging) (src/features/archive/useArchive.ts, lines 1-120)
```tsx
1: import { useState, useEffect, useCallback, useMemo } from 'react';
2: import { supabase } from '../../lib/supabase';
3: import { useAtomValue } from 'jotai/react';
4: import { userAtom } from '../../lib/atoms';
5: import type { ArchiveBook, ArchiveItem, ArchiveFinance } from './types';
6: 
7: const db = supabase as any;
8: 
9: export type ArchiveStatus = 'loading' | 'ready' | 'empty' | 'unavailable';
10: 
11: export function useArchive() {
12:   const user = useAtomValue(userAtom);
13:   const isFinanceRole = user?.role === 'Developer' || user?.role === 'Admin';
14:   
15:   const [status, setStatus] = useState<ArchiveStatus>('loading');
16:   const [error, setError] = useState<string | null>(null);
17:   
18:   const [book, setBook] = useState<ArchiveBook | null>(null);
19:   const [vendors, setVendors] = useState<string[]>([]);
20:   
21:   const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
22:   const [search, setSearch] = useState<string>('');
23:   const [page, setPage] = useState<number>(0);
24:   
25:   const [items, setItems] = useState<ArchiveItem[]>([]);
26:   const [finance, setFinance] = useState<Record<string, ArchiveFinance>>({});
27:   const [counts, setCounts] = useState<Record<string, number>>({});
28:   const [hasMore, setHasMore] = useState<boolean>(false);
29: 
30:   const pageSize = 200;
31: 
32:   // Load the book and vendor list
33:   useEffect(() => {
34:     let mounted = true;
35:     
36:     async function init() {
37:       try {
38:         setStatus('loading');
39:         
40:         // Load newest complete book
41:         const { data: bookData, error: bookErr } = await db
42:           .from('archive_books')
43:           .select('*')
44:           .eq('complete', true)
45:           .order('imported_at', { ascending: false })
46:           .limit(1)
47:           .maybeSingle();
48:           
49:         if (bookErr) throw bookErr;
50:         
51:         if (!bookData) {
52:           if (mounted) {
53:             setBook(null);
54:             setStatus('empty');
55:           }
56:           return;
57:         }
58:         
59:         if (mounted) {
60:           setBook(bookData);
61:         }
62:         
63:         // Load vendors for this book
64:         // PostgREST returns at most 1000 rows per request: page through them so no vendor or count is lost
65:         const vendorData: Array<{ vendor: string }> = [];
66:         for (let from = 0; ; from += 1000) {
67:           const { data: chunk, error: vendorErr } = await db
68:             .from('archive_items')
69:             .select('vendor')
70:             .eq('book_id', bookData.id)
71:             .order('src_row', { ascending: true })
72:             .range(from, from + 999);
73:           if (vendorErr) throw vendorErr;
74:           vendorData.push(...(chunk || []));
75:           if (!chunk || chunk.length < 1000) break;
76:         }
77: 
78:         if (mounted) {
79:           const vCounts: Record<string, number> = {};
80:           vendorData.forEach((v: any) => {
81:             const vendor = v.vendor;
82:             if (vendor) {
83:               vCounts[vendor] = (vCounts[vendor] || 0) + 1;
84:             }
85:           });
86:           setCounts(vCounts);
87:           
88:           // unique vendors
89:           const uniqueVendors = Object.keys(vCounts).sort();
90:           setVendors(uniqueVendors);
91:           if (uniqueVendors.length > 0 && !selectedVendor) {
92:             setSelectedVendor(uniqueVendors[0]);
93:           }
94:         }
95:       } catch (err: any) {
96:         if (mounted) {
97:           setError(err.message);
98:           setStatus('unavailable');
99:         }
100:       }
101:     }
102:     
103:     init();
104:     return () => { mounted = false; };
105:   }, []);
106: 
107:   // Load items when vendor, search or page changes
108:   useEffect(() => {
109:     let mounted = true;
110:     
111:     async function loadItems() {
112:       if (!book || !selectedVendor) return;
113:       
114:       try {
115:         setStatus('loading');
116:         
117:         let query = db
118:           .from('archive_items')
119:           .select('*')
120:           .eq('book_id', book.id)
```
