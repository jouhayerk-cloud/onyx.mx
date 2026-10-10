import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const db = supabase as any;

export type BalancesStatus = 'loading' | 'ready' | 'empty' | 'unavailable';

export interface ArchiveBalanceRow {
  vendor: string;
  payload: Record<string, any>;
}

/** Loads the vendor balance rows of the newest complete archive book, with their columns. */
export function useArchiveBalances() {
  const [status, setStatus] = useState<BalancesStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ArchiveBalanceRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    
    async function init() {
      try {
        setStatus('loading');
        
        // Load newest complete book
        const { data: bookData, error: bookErr } = await db
          .from('archive_books')
          .select('id')
          .eq('complete', true)
          .order('imported_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (bookErr) throw bookErr;
        
        if (!bookData) {
          if (mounted) {
            setStatus('empty');
          }
          return;
        }

        const { data: balancesData, error: balancesErr } = await db
          .from('archive_balances')
          .select('vendor, payload')
          .eq('book_id', bookData.id);

        if (balancesErr) throw balancesErr;

        if (mounted) {
          if (!balancesData || balancesData.length === 0) {
            setStatus('empty');
            return;
          }

          const sortedRows = [...balancesData].sort((a, b) => {
            const aRow = a.payload?._src_row ?? Number.MAX_SAFE_INTEGER;   // rows without a source row go last
            const bRow = b.payload?._src_row ?? Number.MAX_SAFE_INTEGER;
            return aRow - bRow;
          });

          const colsSet = new Set<string>();
          for (const row of sortedRows) {
            if (row.payload) {
              for (const key of Object.keys(row.payload)) {
                if (key !== '_label' && key !== '_src_row') {
                  colsSet.add(key);
                }
              }
            }
          }

          const cols = Array.from(colsSet);
          
          const namedCols = cols.filter(c => !/^Col\d+$/.test(c));
          const colCols = cols.filter(c => /^Col\d+$/.test(c)).sort((a, b) => {
            return parseInt(a.slice(3), 10) - parseInt(b.slice(3), 10);
          });
          
          setRows(sortedRows);
          setColumns([...namedCols, ...colCols]);
          setStatus('ready');
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

  return { status, error, rows, columns };
}
