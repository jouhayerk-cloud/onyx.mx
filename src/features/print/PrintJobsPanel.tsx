import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { listDocumentJobs, verifyDocumentJob } from '../../lib/documentJobs';
import { tr } from '../../lib/i18n';
import { FileDown, FileText, CheckCircle, XCircle, Printer, Copy, AlertCircle, Loader2 } from 'lucide-react';

interface PrintJobsPanelProps {
    season: '825' | '826';
}

export function PrintJobsPanel({ season }: PrintJobsPanelProps) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<Record<string, 'match'|'mismatch'|'unverifiable'|'loading'>>({});

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const djPromise = listDocumentJobs({ season, limit: 30 });
        
        // Fetch legacy print_jobs. We fetch recent jobs and infer the season from tag_id prefix
        // Since there is no season column in print_jobs, we infer based on whether tag_id starts with "826-" or "825-"
        const pjPromise = supabase
          .from('print_jobs')
          .select('id, printed_at, source, label_count, checksum, is_reprint, print_job_items(tag_id)')
          .order('printed_at', { ascending: false })
          .limit(100);

        const [djRows, pjRes] = await Promise.all([djPromise, pjPromise]);
        if (!active) return;

        const legacyJobs = (pjRes.data || []).map(row => {
          const tags = (row.print_job_items as any[]) || [];
          const firstTag = tags.find(t => t.tag_id)?.tag_id || '';
          
          let derivedSeason = '826'; 
          // If tag has explicit indicator like 825
          if (firstTag.includes('825')) derivedSeason = '825';
          else if (firstTag.includes('326') || firstTag.includes('325')) derivedSeason = '825'; // maps to legacy archive

          return {
             _type: 'legacy',
             id: row.id,
             kind: 'label', // print_jobs were only labels
             created_at: row.printed_at,
             count: row.label_count,
             checksum: row.checksum || '',
             is_reprint: row.is_reprint,
             status: 'printed', 
             season: derivedSeason,
             verifiable: false
          };
        }).filter(j => j.season === season);

        const newJobs = djRows.map(row => ({
             _type: 'ledger',
             id: row.id,
             kind: row.kind,
             created_at: row.created_at,
             count: row.parameters?.count ?? '-', 
             checksum: row.data_hash || '',
             is_reprint: !!row.parent_job_id,
             status: row.current_status || 'requested',
             season: season,
             verifiable: true
        }));

        const merged = [...legacyJobs, ...newJobs].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setJobs(merged);
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load jobs');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [season]);

  const handleCopy = (text: string) => {
      if (text) navigator.clipboard.writeText(text);
  };

  const handleVerify = async (id: string) => {
      setVerifyStatus(prev => ({ ...prev, [id]: 'loading' }));
      const result = await verifyDocumentJob(id);
      setVerifyStatus(prev => ({ ...prev, [id]: result }));
  };

  const renderIcon = (kind: string) => {
      switch (kind) {
          case 'pdf': return <FileText className="w-4 h-4 text-red-400" />;
          case 'xlsx':
          case 'csv': return <FileDown className="w-4 h-4 text-green-400" />;
          case 'label': return <Printer className="w-4 h-4 text-blue-400" />;
          default: return <FileText className="w-4 h-4 text-gray-400" />;
      }
  };

  return (
    <div className="w-full max-w-[720px] min-w-[480px] flex flex-col gap-4 text-white rounded-lg h-full overflow-hidden pb-4" style={{ background: 'rgba(20, 20, 20, 0.8)', backdropFilter: 'blur(12px)' }}>
        {loading && (
            <div className="flex justify-center items-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        )}

        {error && (
            <div className="flex gap-2 items-center p-3 m-4 rounded bg-red-900/50 text-red-200">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
            </div>
        )}

        {!loading && !error && jobs.length === 0 && (
            <div className="text-center py-8 text-gray-400">
                {tr('No print jobs found for this season.')}
            </div>
        )}

        {!loading && jobs.length > 0 && (
            <div className="flex flex-col gap-2 overflow-y-auto h-full px-4 pt-4 pb-2">
                {jobs.map(job => (
                    <div key={job.id} className="flex flex-col p-3 rounded bg-gray-800/60 hover:bg-gray-700/60 transition-colors border border-gray-700/50">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex gap-2 items-center">
                                {renderIcon(job.kind)}
                                <span className="font-medium capitalize text-sm">{job.kind}</span>
                                <span className="text-xs text-gray-400">{new Date(job.created_at).toLocaleString()}</span>
                            </div>
                            <div className="flex gap-2 items-center">
                                {job.is_reprint && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400">Reprint</span>}
                                <span className={`text-xs px-1.5 py-0.5 rounded ${job.status === 'void' ? 'bg-red-900/50 text-red-400' : 'bg-gray-700 text-gray-300'}`}>
                                    {job.status}
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">Count: {job.count}</span>
                                <div className="flex items-center gap-1 bg-gray-900/50 px-2 py-1 rounded text-xs font-mono text-gray-300">
                                    <span title={job.checksum}>{job.checksum ? job.checksum.slice(0, 12) + '...' : 'none'}</span>
                                    {job.checksum && (
                                        <button onClick={() => handleCopy(job.checksum)} className="hover:text-white transition-colors" title="Copy checksum">
                                            <Copy className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div>
                                {job.verifiable ? (
                                    <div className="flex items-center gap-2">
                                        {verifyStatus[job.id] === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                                        {verifyStatus[job.id] === 'match' && <span title="Match"><CheckCircle className="w-4 h-4 text-green-400" /></span>}
                                        {verifyStatus[job.id] === 'mismatch' && <span title="Mismatch"><XCircle className="w-4 h-4 text-red-400" /></span>}
                                        {verifyStatus[job.id] === 'unverifiable' && <span title="Unverifiable"><AlertCircle className="w-4 h-4 text-yellow-400" /></span>}
                                        
                                        {!verifyStatus[job.id] && (
                                            <button 
                                                onClick={() => handleVerify(job.id)}
                                                className="text-xs px-2 py-1 rounded border border-blue-500/50 text-blue-300 hover:bg-blue-900/30 transition-colors"
                                            >
                                                Verify
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-xs text-gray-500 italic" title="Legacy jobs cannot be re-verified because their input was never stored.">
                                        legacy, not re-verifiable
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
}
