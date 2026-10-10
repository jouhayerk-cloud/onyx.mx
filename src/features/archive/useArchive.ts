import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAtomValue } from 'jotai/react';
import { userAtom } from '../../lib/atoms';
import type { ArchiveBook, ArchiveItem, ArchiveFinance } from './types';

const db = supabase as any;

export type ArchiveStatus = 'loading' | 'ready' | 'empty' | 'unavailable';

/** Archive data hook: loads the newest book, its vendor list and items a page at a time. */
export function useArchive() {
  const user = useAtomValue(userAtom);
  const isFinanceRole = user?.role === 'Developer' || user?.role === 'Admin';
  
  const [status, setStatus] = useState<ArchiveStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  
  const [book, setBook] = useState<ArchiveBook | null>(null);
  const [vendors, setVendors] = useState<string[]>([]);
  
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [finance, setFinance] = useState<Record<string, ArchiveFinance>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [hasMore, setHasMore] = useState<boolean>(false);

  const pageSize = 200;

  // Load the book and vendor list
  useEffect(() => {
    let mounted = true;
    
    async function init() {
      try {
        setStatus('loading');
        
        // Load newest complete book
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
        
        if (mounted) {
          setBook(bookData);
        }
        
        // Load vendors for this book
        // PostgREST returns at most 1000 rows per request: page through them so no vendor or count is lost
        const vendorData: Array<{ vendor: string }> = [];
        for (let from = 0; ; from += 1000) {
          const { data: chunk, error: vendorErr } = await db
            .from('archive_items')
            .select('vendor')
            .eq('book_id', bookData.id)
            .order('src_row', { ascending: true })
            .range(from, from + 999);
          if (vendorErr) throw vendorErr;
          vendorData.push(...(chunk || []));
          if (!chunk || chunk.length < 1000) break;
        }

        if (mounted) {
          const vCounts: Record<string, number> = {};
          vendorData.forEach((v: any) => {
            const vendor = v.vendor;
            if (vendor) {
              vCounts[vendor] = (vCounts[vendor] || 0) + 1;
            }
          });
          setCounts(vCounts);
          
          // unique vendors
          const uniqueVendors = Object.keys(vCounts).sort();
          setVendors(uniqueVendors);
          if (uniqueVendors.length > 0 && !selectedVendor) {
            setSelectedVendor(uniqueVendors[0]);
          }
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message);
          setStatus('unavailable');
        }
      }
    }
    
    init();
    return () => { mounted = false; };
  }, []);

  // Load items when vendor, search or page changes
  useEffect(() => {
    let mounted = true;
    
    async function loadItems() {
      if (!book || !selectedVendor) return;
      
      try {
        setStatus('loading');
        
        let query = db
          .from('archive_items')
          .select('*')
          .eq('book_id', book.id)
          .eq('vendor', selectedVendor);
          
        if (search) {
          query = query.textSearch('search', search, { config: 'simple', type: 'websearch' }); // websearch: spaces and quotes must not raise a tsquery syntax error
        }
        
        // order to make pagination deterministic
        query = query.order('src_row', { ascending: true });
        
        // pagination
        query = query.range(page * pageSize, (page + 1) * pageSize - 1);
        
        const { data: itemData, error: itemErr } = await query;
        if (itemErr) throw itemErr;
        
        if (!mounted) return;
        
        setItems(itemData || []);
        setHasMore((itemData || []).length === pageSize);
        
        // Load finance if applicable
        if (isFinanceRole && itemData && itemData.length > 0) {
          const itemIds = itemData.map((i: any) => i.id);
          const { data: financeData, error: financeErr } = await db
            .from('archive_finance')
            .select('*')
            .in('item_id', itemIds);
            
          if (financeErr) throw financeErr;
          
          if (mounted) {
            const finMap: Record<string, ArchiveFinance> = {};
            (financeData || []).forEach((f: any) => {
              finMap[f.item_id] = f;
            });
            setFinance(finMap);
          }
        } else {
          setFinance({});
        }
        
        if (mounted) setStatus('ready');
      } catch (err: any) {
        if (mounted) {
          setError(err.message);
          setStatus('unavailable');
        }
      }
    }
    
    // We only want to load items if the book exists
    if (book) {
      loadItems();
    }
    return () => { mounted = false; };
  }, [book, selectedVendor, search, page, isFinanceRole]);

  // When changing vendor or search, reset page to 0
  const handleSetVendor = useCallback((v: string) => {
    setSelectedVendor(v);
    setPage(0);
  }, []);
  
  const handleSetSearch = useCallback((s: string) => {
    setSearch(s);
    setPage(0);
  }, []);
  
  const nextPage = useCallback(() => {
    if (hasMore) setPage(p => p + 1);
  }, [hasMore]);
  
  const prevPage = useCallback(() => {
    setPage(p => Math.max(0, p - 1));
  }, []);

  return {
    status,
    error,
    book,
    vendors,
    selectedVendor,
    setVendor: handleSetVendor,
    search,
    setSearch: handleSetSearch,
    page,
    hasMore,
    nextPage,
    prevPage,
    items,
    finance,
    counts,
    isFinanceRole
  };
}
