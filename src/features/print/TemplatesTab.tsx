import React, { useState, useEffect } from 'react';
import { useSetAtom } from 'jotai/react';
import { FileText, FileSpreadsheet, Tag, Search, ArrowRight, Printer } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { activeViewAtom } from '../../lib/atoms';
import { isPrintCenterOpenAtom } from './printState';
import { TEMPLATE_CATALOGUE, TemplateEntry, getTemplate, listTemplatesByModule } from './templateCatalogue';
import { getRecentTracked } from './jobTracking';
import { listDocumentJobs } from '../../lib/documentJobs';

const viewMapping: Record<string, string> = {
    inventory: 'inventory',
    logistics: 'logistics',
    packing: 'packing',
    trucking: 'trucking',
    archive: 'workbook',
    store: 'store',
    catalog: 'inventory',
    finance: 'finance',
    viewer: 'viewer'
};

const moduleTitles: Record<string, string> = {
    inventory: 'Inventory',
    logistics: 'Logistics',
    packing: 'Packing',
    trucking: 'Trucking',
    archive: 'Archive',
    store: 'Store',
    catalog: 'Catalog',
    finance: 'Finance',
    viewer: 'Viewer'
};

export const TemplatesTabContent: React.FC = () => {
    const setActiveView = useSetAtom(activeViewAtom);
    const setIsOpen = useSetAtom(isPrintCenterOpenAtom);
    const [search, setSearch] = useState('');
    const [selectedKind, setSelectedKind] = useState<string | null>(null);
    const [recentJobs, setRecentJobs] = useState<any[]>([]);

    useEffect(() => {
        async function fetchJobs() {
            try {
                // Fetch recent jobs, cast to any because templateId isn't in filter signature yet
                const jobs = await listDocumentJobs({ limit: 200 });
                setRecentJobs(jobs);
            } catch (err) {
                console.error(err);
            }
        }
        fetchJobs();
    }, []);

    const handleGoToModule = (mod: string) => {
        const view = viewMapping[mod];
        if (view) {
            (setActiveView as (v: string) => void)(view);   // viewMapping holds valid view ids
            setIsOpen(false);
        }
    };

    const modules = ["inventory", "logistics", "packing", "trucking", "archive", "store", "catalog", "finance", "viewer"] as const;

    const filteredTemplates = TEMPLATE_CATALOGUE.filter(t => {
        if (selectedKind && t.kind !== selectedKind) return false;
        if (search && !t.label.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const byModule: Record<string, TemplateEntry[]> = {};
    for (const mod of modules) {
        byModule[mod] = filteredTemplates.filter(t => t.module === mod);
    }

    const tracked = getRecentTracked();

    const getKindIcon = (kind: string) => {
        switch (kind) {
            case 'xlsx': return <FileSpreadsheet className="w-4 h-4 text-green-400" />;
            case 'csv': return <FileText className="w-4 h-4 text-green-300" />;
            case 'pdf': return <FileText className="w-4 h-4 text-red-400" />;
            case 'label': return <Tag className="w-4 h-4 text-blue-400" />;
            default: return <FileText className="w-4 h-4" />;
        }
    };

    return (
        <div className="flex flex-col h-full p-6 pc-templates-container overflow-y-auto">
            <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        value={search} 
                        onChange={e => setSearch(e.target.value)} 
                        placeholder={tr("Search templates...")}
                        className="pc-input w-full pl-9"
                    />
                </div>
                <div className="flex gap-2">
                    {['xlsx', 'pdf', 'label', 'csv'].map(k => (
                        <button 
                            key={k}
                            onClick={() => setSelectedKind(selectedKind === k ? null : k)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${selectedKind === k ? 'bg-blue-500/20 border-blue-500 text-blue-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200'}`}
                        >
                            {k}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-8">
                {modules.map(mod => {
                    const items = byModule[mod];
                    if (!items || items.length === 0) return null;
                    return (
                        <div key={mod} className="flex flex-col gap-4">
                            <h3 className="text-lg font-bold uppercase tracking-widest text-gray-400 border-b border-white/10 pb-2">
                                {tr(moduleTitles[mod] || mod)}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {items.map(t => {
                                    const trackedJob = tracked.find(j => j.templateId === t.id);
                                    const onlineJob = recentJobs.find(j => j.template_id === t.id);
                                    
                                    const lastJobAt = trackedJob?.at || onlineJob?.client_created_at || onlineJob?.created_at;
                                    
                                    return (
                                        <div key={t.id} className="pc-glass-card ui-root flex flex-col p-4 gap-3 relative">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-2">
                                                    {getKindIcon(t.kind)}
                                                    <span className="font-bold text-base">{t.label}</span>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${t.status === 'tracked' ? 'bg-green-500/20 text-green-400' : t.status === 'hub' ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                    {t.status}
                                                </span>
                                            </div>
                                            <div className="text-xs font-mono text-gray-400 opacity-70 truncate" title={t.source}>
                                                {t.source}
                                            </div>
                                            <div className="text-sm text-gray-300 line-clamp-2 min-h-[40px]">
                                                {t.description}
                                            </div>
                                            
                                            <div className="mt-auto pt-3 border-t border-white/10 flex flex-col gap-2">
                                                <div className="flex items-center justify-between text-xs text-gray-500">
                                                    <span>{tr("Last run:")}</span>
                                                    <span>{lastJobAt ? new Date(lastJobAt).toLocaleDateString() : tr("Never")}</span>
                                                </div>
                                                <button 
                                                    onClick={() => handleGoToModule(t.module)}
                                                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-semibold"
                                                >
                                                    {tr("Go to module")} <ArrowRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const QueueTabContent: React.FC = () => {
    const tracked = getRecentTracked();
    
    if (tracked.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                <Printer className="w-12 h-12 mb-4 opacity-50" />
                <p>{tr('No recent print jobs in the queue.')}</p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col h-full p-6 overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{tr("Recent Tracked Jobs")}</h3>
            <div className="flex flex-col gap-3 max-w-4xl mx-auto w-full">
                {tracked.map((job, idx) => {
                    const t = getTemplate(job.templateId);
                    return (
                        <div key={`${job.templateId}-${job.at}-${idx}`} className="pc-glass-card ui-root flex items-center justify-between p-4">
                            <div className="flex items-center gap-4">
                                <div className={`w-2 h-2 rounded-full ${job.ok ? 'bg-green-500' : 'bg-red-500'}`} />
                                <div className="flex flex-col">
                                    <span className="font-bold">{t?.label || job.templateId}</span>
                                    <span className="text-xs text-gray-400 font-mono">{job.fileName || 'unknown file'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-6 text-sm text-gray-400">
                                {job.outputBytes !== undefined && (
                                    <span>{(job.outputBytes / 1024).toFixed(1)} KB</span>
                                )}
                                <span>{new Date(job.at).toLocaleString()}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
