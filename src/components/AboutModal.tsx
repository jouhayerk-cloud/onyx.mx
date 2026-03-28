
import React from 'react';
import { createPortal } from 'react-dom';
import { X, Info, Sparkles, Github, Zap } from 'lucide-react';
import { OnyxMiniLogo } from './OnyxLogo';

// Import markdown files as raw strings
import changelogText from '../../CHANGELOG.md?raw';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

declare const __APP_VERSION__: string;

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
    if (!isOpen) return null;

    // A very basic markdown parser for the few styles we need
    const renderMarkdown = (text: string) => {
        const lines = text.split('\n');
        const rendered: React.ReactNode[] = [];
        let inComment = false;

        lines.forEach((line, i) => {
            const trimmedLine = line.trim();
            
            // Handle HTML Comments (one-liners or blocks)
            if (trimmedLine.startsWith('<!--')) {
                inComment = true;
                if (trimmedLine.endsWith('-->')) inComment = false;
                return;
            }
            if (trimmedLine.endsWith('-->')) {
                inComment = false;
                return;
            }
            if (inComment) return;

            if (line.startsWith('### ')) {
                rendered.push(
                    <h3 key={i} className="text-blue-300 font-black mt-6 mb-2 text-sm tracking-widest uppercase flex items-center gap-2">
                        <Zap size={14} className="text-blue-400" /> {line.replace('### ', '')}
                    </h3>
                );
            } else if (line.startsWith('## ')) {
                rendered.push(
                    <h2 key={i} className="text-white font-black mt-8 mb-4 text-lg border-b border-white/10 pb-2 flex items-center gap-2">
                        <Sparkles size={18} className="text-yellow-400" /> {line.replace('## ', '')}
                    </h2>
                );
            } else if (line.startsWith('- **')) {
                const parts = line.split('**');
                rendered.push(
                    <div key={i} className="flex gap-3 mb-2 pl-2">
                        <span className="text-blue-400 mt-1.5 shrink-0">•</span>
                        <p className="text-white/80 text-xs leading-relaxed">
                            <strong className="text-blue-200">{parts[1]}</strong>
                            {parts.slice(2).join('')}
                        </p>
                    </div>
                );
            } else if (line.startsWith('- ')) {
                rendered.push(
                    <div key={i} className="flex gap-3 mb-2 pl-2">
                        <span className="text-white/20 mt-1.5 shrink-0">•</span>
                        <p className="text-white/60 text-xs leading-relaxed">{line.replace('- ', '')}</p>
                    </div>
                );
            } else if (line.includes('---')) {
                rendered.push(<hr key={i} className="border-white/5 my-8" />);
            } else if (trimmedLine === '') {
                rendered.push(<div key={i} className="h-2" />);
            } else if (!line.startsWith('# ')) { // Skip top-level # titles as we have the modal header
                rendered.push(<p key={i} className="text-white/40 text-[11px] mb-1 italic">{line}</p>);
            }
        });

        return rendered;
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-2000 flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Backdrop Blur */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />

            {/* Modal Container */}
            <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col glass-panel shadow-[0_0_80px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 shadow-inner">
                            <OnyxMiniLogo className="w-8 h-8" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black uppercase tracking-[0.2em] text-white leading-none mb-1">Onyx.mx Studio</h1>
                            <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-[9px] font-black text-blue-300 uppercase tracking-widest">Version v{__APP_VERSION__}</span>
                                <span className="text-[10px] text-white/30 font-medium">Release Log</span>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/10"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content Viewer */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/10 select-text">
                    <div className="max-w-2xl mx-auto py-4">
                        {renderMarkdown(changelogText)}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-white/5 border-t border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-white/30">
                        <span className="flex items-center gap-1.5"><Info size={12} /> Technical Preview</span>
                        <span className="flex items-center gap-1.5"><Sparkles size={12} /> Studio v4 Engine</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <a href="https://github.com/jouhayerk-cloud/onyx.mx" target="_blank" rel="noreferrer" 
                           className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 text-[10px] font-bold text-white/50 hover:text-white hover:border-white/20 transition-all">
                            <Github size={13} />
                            Repository
                        </a>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}} />
        </div>,
        document.body
    );
}
