import React, { useMemo } from 'react';
import { Play, RefreshCw, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { CatalogProcess } from '../lib/catalogHubProcesses';

interface Props {
    processes: readonly CatalogProcess[];
    selected: Record<string, boolean>;
    onToggle: (id: string) => void;
    onRun: (id: string) => void;
    onReload: (id: string) => void;
    results: Record<string, any>;
    busy: Record<string, boolean>;
    hasPhoto: boolean;
    hasVideo: boolean;
    /** Optional: a message per failed process id. AlertCircle was imported and
     *  never wired to anything — the only way a caller could report a failure
     *  was the page-level toast, which says nothing about which of eight
     *  processes it was. Callers that don't track errors can omit this. */
    errors?: Record<string, string>;
}

const sanitizeHtml = (html: string) => {
    if (!html) return '';
    // Allow only p, ul, ol, li, strong, em, br, and strip all attributes.
    // Extremely strict and simple approach:
    // 1. Remove everything between < > that is not in the allowed list
    const allowedTags = ['p', '/p', 'ul', '/ul', 'ol', '/ol', 'li', '/li', 'strong', '/strong', 'em', '/em', 'br', 'br/', 'br /'];
    const sanitized = html.replace(/<([^>]+)>/g, (match, p1) => {
        const tagName = p1.trim().split(/\s+/)[0].toLowerCase();
        if (allowedTags.includes(tagName) || allowedTags.includes(tagName.replace('/', ''))) {
            // Reconstruct tag without any attributes
            if (p1.trim().endsWith('/')) {
                return `<${tagName} />`;
            } else if (p1.trim().startsWith('/')) {
                return `</${tagName.replace('/', '')}>`;
            }
            return `<${tagName}>`;
        }
        return '';
    });
    return sanitized;
};

export const CatalogHubProcessesPanel: React.FC<Props> = ({
    processes,
    selected,
    onToggle,
    onRun,
    onReload,
    results,
    busy,
    hasPhoto,
    hasVideo,
    errors = {}
}) => {
    const allSelected = processes.every(p => selected[p.id]);
    const someSelected = processes.some(p => selected[p.id]);

    const handleSelectAll = () => {
        processes.forEach(p => {
            if (!selected[p.id]) onToggle(p.id);
        });
    };

    const handleDeselectAll = () => {
        processes.forEach(p => {
            if (selected[p.id]) onToggle(p.id);
        });
    };

    const handleRunChecked = () => {
        processes.forEach(p => {
            if (selected[p.id] && !busy[p.id]) {
                onRun(p.id);
            }
        });
    };

    // .glass-panel, not bg-white/5: html.style-slab flattens every bg-white/*
    // "flat on data"), which would make this whole panel disappear into the
    // page on the light Aqua slab. .glass-panel is the escape hatch SLAB
    // already carries for exactly this — chrome that must stay a distinct,
    // translucent surface over content, see slab-glass.css.
    return (
        <div className="w-full flex flex-col gap-4 rounded-xl p-0">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-medium text-white/70 text-sm tracking-wide uppercase">AI PROCESSES</h3>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={allSelected ? handleDeselectAll : handleSelectAll}
                        className="text-xs text-white/40 font-medium px-2 py-1 rounded-md transition-colors hover:text-white"
                    >
                        {allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                    <button 
                        onClick={handleRunChecked}
                        disabled={!someSelected}
                        className="flex items-center justify-center h-8 px-3 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 disabled:grayscale"
                    >
                        Run Checked
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                {processes.map(p => {
                    const isBusy = busy[p.id];
                    const hasResult = !!results[p.id];
                    
                    let disabledReason = '';
                    if (p.requiresMedia && !hasPhoto) disabledReason = 'Requires a photograph';
                    if (p.requiresVideo && !hasVideo) disabledReason = 'Requires a video';
                    
                    const isDisabled = !!disabledReason;
                    const errorMsg = errors[p.id];

                    return (
                        <div key={p.id} className={`flex flex-col gap-2 p-2 rounded-lg border border-transparent transition-colors ${isDisabled ? 'opacity-50 grayscale' : 'hover:bg-white/5'} ${errorMsg ? 'bg-red-500/10' : ''}`} title={disabledReason || errorMsg}>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center justify-center w-5 h-5 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={!!selected[p.id]} 
                                        onChange={() => onToggle(p.id)}
                                        disabled={isDisabled}
                                        className="w-4 h-4 rounded border-white/10 bg-black/20 text-cyan-400 focus:ring-cyan-400/50 cursor-pointer"
                                    />
                                </label>
                                
                                <span className="flex-1 font-medium text-sm text-white/80 select-none">
                                    {p.label}
                                </span>

                                <div className="flex items-center gap-2">
                                    <div className="flex items-center h-8 min-w-[2rem] justify-center">
                                        {isBusy ? (
                                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--amber-500, #f59e0b)' }} />
                                        ) : errorMsg ? (
                                            // AlertCircle was imported and never used —
                                            // the only failure signal was a page-level
                                            // toast naming no process, so a run that
                                            // failed silently looked identical to one
                                            // nobody had pressed yet.
                                            <AlertCircle className="w-4 h-4" style={{ color: 'var(--red-500, #ef4444)' }} />
                                        ) : hasResult ? (
                                            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--emerald-500, #10b981)' }} />
                                        ) : null}
                                    </div>
                                    <button 
                                        onClick={() => onRun(p.id)} 
                                        disabled={isDisabled || isBusy}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 border border-white/20 hover:bg-white/20 hover:text-white text-white/80 disabled:opacity-50 transition-all"
                                        aria-pressed={isBusy ? "true" : "false"}
                                    >
                                        <Play className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => onReload(p.id)} 
                                        disabled={isDisabled || isBusy || !hasResult}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 border border-white/20 hover:bg-white/20 hover:text-white text-white/80 disabled:opacity-50 transition-all"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Previews based on result type */}
                            {hasResult && p.id === 'marketing_desc' && (
                                // .glass-sm over bg-black/10 — same flattening trap as the
                                // outer panel; this box floats over the previous row's
                                // content and needs a real surface under SLAB.
                                <div className="glass-sm ml-8 mr-12 p-3 rounded text-xs text-white/80/80 max-h-32 overflow-y-auto"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(results[p.id]) }}
                                />
                            )}
                            {hasResult && p.id === 'dominant_colors' && Array.isArray(results[p.id]) && (
                                <div className="ml-8 flex items-center gap-2">
                                    {results[p.id].map((c: string, idx: number) => (
                                        <span key={idx} className="inv-badge text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {hasResult && p.id === 'product_type' && (
                                <div className="ml-8">
                                    <span className="inv-badge text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
                                        {results[p.id]}
                                    </span>
                                </div>
                            )}
                            {hasResult && p.id === 'img_clean' && results[p.id] && (
                                <div className="ml-8 w-16 h-16 rounded overflow-hidden border border-white/10">
                                    <img src={results[p.id]} className="w-full h-full object-cover" alt="Cleaned preview" />
                                </div>
                            )}
                            {hasResult && p.id === 'hex_map' && results[p.id] && (
                                <div className="ml-8 w-16 h-16 rounded overflow-hidden border border-white/10">
                                    <img src={results[p.id]} className="w-full h-full object-cover" alt="Hex map preview" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
