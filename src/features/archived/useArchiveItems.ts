import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { ArchiveBook, ArchiveItem, ArchiveFinance } from '../archive/types';

const db = supabase as any;

export type ArchiveSort = 'tag' | 'date' | 'vendor' | 'weight' | 'price';

export interface UseArchiveItemsResult {
  book: ArchiveBook | null;
  items: ArchiveItem[];
  financeMap: Record<string, ArchiveFinance>;
  vendors: { id: string; count: number }[];
  totalCount: number;
  scopeTotals: {
    items: number;
    quantity: number;
    weightKg: number;
    usd: number | null;
  };
  status: 'loading' | 'ready' | 'empty' | 'error';
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: string | null;
  retry: () => void;
}

/** Loads archived items for a vendor, search and sort, one page at a time, with the book's totals. */
export function useArchiveItems(
  vendor: string | 'ALL',
  search: string,
  sort: ArchiveSort,
  finance: boolean
): UseArchiveItemsResult {
  const [book, setBook] = useState<ArchiveBook | null>(null);
  const [bookItems, setBookItems] = useState<{ id: string; vendor: string; quantity: number | null; weight_kg: number | null }[]>([]);
  const [bookFinance, setBookFinance] = useState<Record<string, number>>({});
  
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [financeMap, setFinanceMap] = useState<Record<string, ArchiveFinance>>({});
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  
  const [retryCount, setRetryCount] = useState<number>(0);
  const reqIdRef = useRef<number>(0);

  // 1. Load book and global aggregates
  useEffect(() => {
    let mounted = true;
    
    async function loadBookData() {
      if (book) return;
      
      try {
        setStatus('loading');
        setError(null);
        
        const { data: bookData, error: bookErr } = await db
          .from('archive_books')
          .select('*')
          .eq('complete', true)
          .order('imported_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (bookErr) throw bookErr;
        
        if (!bookData) {
          if (mounted) {
            setBook(null);
            setStatus('empty');
          }
          return;
        }

        const itemsAgg: any[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error: itemsErr } = await db
            .from('archive_items')
            .select('id, vendor, quantity, weight_kg')
            .eq('book_id', bookData.id)
            .order('src_row', { ascending: true })
            .range(from, from + 999);
            
          if (itemsErr) throw itemsErr;
          if (data) itemsAgg.push(...data);
          if (!data || data.length < 1000) break;
        }

        let finData: Record<string, number> = {};
        if (finance && itemsAgg.length > 0) {
          // The ids go in the URL (.in), so keep every request small: 740 ids at once is a ~27 KB URL and the API answers 400.
          // The finance total is only a KPI: if it fails the items must still load.
          try {
            const allIds = itemsAgg.map((i: any) => i.id);
            const chunks: string[][] = [];
            for (let i = 0; i < allIds.length; i += 80) chunks.push(allIds.slice(i, i + 80));
            const results = await Promise.all(chunks.map(chunk =>
              db.from('archive_finance').select('item_id, total_usd').in('item_id', chunk)));
            for (const { data, error: finErr } of results) {
              if (finErr) throw finErr;
              (data || []).forEach((r: any) => { finData[r.item_id] = Number(r.total_usd) || 0; });
            }
          } catch {
            finData = {};
          }
        }

        if (mounted) {
          setBook(bookData);
          setBookItems(itemsAgg);
          setBookFinance(finData);
        }
      } catch (err: any) {
        if (mounted) {
          setError('Archive Unavailable');
          setStatus('error');
        }
      }
    }
    
    loadBookData();
    return () => { mounted = false; };
  }, [finance, retryCount, book]);

  // 2. Reset pages when filters change
  useEffect(() => {
    setItems([]);
    setFinanceMap({});
    setPage(0);
  }, [vendor, search, sort, book?.id]);

  // 3. Load pages
  useEffect(() => {
    if (!book) return;
    
    let mounted = true;
    const reqId = ++reqIdRef.current;
    
    async function loadPage() {
      try {
        if (page === 0) {
          setStatus('loading');
        } else {
          setLoadingMore(true);
        }
        setError(null);
        
        let currentTotalCount = totalCount;
        
        if (page === 0) {
          let countQuery = db
            .from('archive_items')
            .select('id', { count: 'exact', head: true })
            .eq('book_id', book.id);
            
          if (vendor !== 'ALL') {
            countQuery = countQuery.eq('vendor', vendor);
          }
          if (search) {
            countQuery = countQuery.textSearch('search', search, { config: 'simple', type: 'websearch' });
            const safeText = search.replace(/[,()*%\\"]/g, '').trim().substring(0, 40);
            if (safeText) {
              countQuery = countQuery.or(`tag_id.ilike.${safeText}%,item_number.ilike.${safeText}%`);
            }
          }
          
          const { count, error: countErr } = await countQuery;
          if (countErr) throw countErr;
          
          currentTotalCount = count || 0;
          if (mounted && reqId === reqIdRef.current) {
            setTotalCount(currentTotalCount);
          }
        }
        
        if (currentTotalCount === 0) {
          if (mounted && reqId === reqIdRef.current) {
            setItems([]);
            setFinanceMap({});
            setStatus('empty');
            setHasMore(false);
            setLoadingMore(false);
          }
          return;
        }
        
        let selectStr = '*';
        if (finance && sort === 'price') {
          selectStr = '*, archive_finance!left(total_usd)';
        }
        
        let query = db
          .from('archive_items')
          .select(selectStr)
          .eq('book_id', book.id);
          
        if (vendor !== 'ALL') {
          query = query.eq('vendor', vendor);
        }
        if (search) {
          query = query.textSearch('search', search, { config: 'simple', type: 'websearch' });
          const safeText = search.replace(/[,()*%\\"]/g, '').trim().substring(0, 40);
          if (safeText) {
            const q = safeText.replace(/"/g, '""');   // quoted values: spaces are safe inside the or() list
            query = query.or(`tag_id.ilike."${q}%",item_number.ilike."${q}%"`);
          }
        }
        
        switch (sort) {
          case 'tag':
            query = query.order('tag_id', { ascending: true });
            break;
          case 'date':
            query = query.order('item_date', { ascending: false, nullsFirst: false });
            break;
          case 'vendor':
            query = query.order('vendor', { ascending: true }).order('tag_id', { ascending: true });
            break;
          case 'weight':
            query = query.order('weight_kg', { ascending: false, nullsFirst: false });
            break;
          case 'price':
            if (finance) {
              query = (query as any).order('total_usd', { foreignTable: 'archive_finance', ascending: false, nullsFirst: false });
            } else {
              query = query.order('tag_id', { ascending: true });
            }
            break;
        }
        query = query.order('src_row', { ascending: true });
        
        query = query.range(page * 120, page * 120 + 119);
        
        const { data: pageItems, error: pageErr } = await query;
        if (pageErr) throw pageErr;
        
        if (!mounted || reqId !== reqIdRef.current) return;
        
        const newItems = pageItems || [];
        
        let finData: Record<string, ArchiveFinance> = {};
        if (finance && newItems.length > 0) {
          const ids = newItems.map((i: any) => i.id);
          const { data: fData, error: fErr } = await db
            .from('archive_finance')
            .select('*')
            .in('item_id', ids);
          if (fErr) throw fErr;
          
          fData?.forEach((f: any) => {
            finData[f.item_id] = f;
          });
        }
        
        if (!mounted || reqId !== reqIdRef.current) return;
        
        setItems(prev => page === 0 ? newItems : [...prev, ...newItems]);
        if (finance) {
          setFinanceMap(prev => page === 0 ? finData : { ...prev, ...finData });
        }
        
        setHasMore(newItems.length === 120);
        setStatus('ready');
        setLoadingMore(false);
      } catch (err: any) {
        if (mounted && reqId === reqIdRef.current) {
          setError('Archive Unavailable');
          setStatus('error');
          setLoadingMore(false);
        }
      }
    }
    
    loadPage();
    return () => { mounted = false; };
  }, [book, vendor, search, sort, page, finance, retryCount]);

  const { vendors, scopeTotals } = useMemo(() => {
    const vCounts: Record<string, number> = {};
    let itemsInScope = 0;
    let qtyInScope = 0;
    let weightInScope = 0;
    let usdInScope: number | null = finance ? 0 : null;

    bookItems.forEach(item => {
      const v = item.vendor;
      if (v) {
        vCounts[v] = (vCounts[v] || 0) + 1;
      }
      
      if (vendor === 'ALL' || vendor === v) {
        itemsInScope++;
        qtyInScope += Number(item.quantity) || 0;   // numeric columns may arrive as strings
        weightInScope += Number(item.weight_kg) || 0;
        if (finance && usdInScope !== null) {
          usdInScope += (bookFinance[item.id] || 0);
        }
      }
    });

    const vList = Object.keys(vCounts).sort().map(id => ({
      id,
      count: vCounts[id]
    }));

    return {
      vendors: vList,
      scopeTotals: {
        items: itemsInScope,
        quantity: qtyInScope,
        weightKg: weightInScope,
        usd: usdInScope
      }
    };
  }, [bookItems, bookFinance, vendor, finance]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && status === 'ready') {
      setLoadingMore(true);   // block a second observer callback before React applies the page change
      setPage(p => p + 1);
    }
  }, [loadingMore, hasMore, status]);

  const handleRetry = useCallback(() => {
    setRetryCount(c => c + 1);
  }, []);

  return {
    book,
    items,
    financeMap,
    vendors,
    totalCount,
    scopeTotals,
    status,
    loadingMore,
    hasMore,
    loadMore,
    error,
    retry: handleRetry
  };
}
