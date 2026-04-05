
import React from 'react';
import { createPortal } from 'react-dom';
import { X, Info, Sparkles, Github, Zap, AlertCircle } from 'lucide-react';
import { OnyxMiniLogo } from './OnyxLogo';

// Import markdown files as raw strings from assets to ensure bundling
import changelogText from '../assets/CHANGELOG.md?raw';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

declare const __APP_VERSION__: string;

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
    if (!isOpen) return null;

    // A more robust markdown parser
    const renderMarkdown = (text: string) => {
        if (!text || text.trim().length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-20 text-white/20 gap-4">
                    <AlertCircle size={40} strokeWidth={1} />
                    <p className="text-xs font-black uppercase tracking-[0.2em]">Documentation Offline</p>
                </div>
            );
        }

        // 1. Strip HTML bits and comments entirely
        const cleanText = text.replace(/<!--[\s\S]*?-->/g, '').trim();
        const lines = cleanText.split('\n');
        const rendered: React.ReactNode[] = [];

        lines.forEach((line, i) => {
            const trimmedLine = line.trim();
            if (trimmedLine === '') {
                rendered.push(<div key={i} className="h-4" />);
                return;
            }

            // Headers
            if (line.startsWith('### ')) {
                rendered.push(
                    <h3 key={i} className="text-blue-300 font-black mt-8 mb-3 text-sm tracking-widest uppercase flex items-center gap-2">
                        <Zap size={14} className="text-blue-400" /> {line.replace('### ', '').trim()}
                    </h3>
                );
            } else if (line.startsWith('## ')) {
                rendered.push(
                    <h2 key={i} className="text-white font-black mt-10 mb-5 text-lg border-b border-white/10 pb-2 flex items-center gap-2">
                        <Sparkles size={18} className="text-yellow-400" /> {line.replace('## ', '').trim()}
                    </h2>
                );
            } 
            // List Items with Bold
            else if (line.startsWith('- **')) {
                const parts = line.split('**');
                rendered.push(
                    <div key={i} className="flex gap-4 mb-3 pl-2 group">
                        <span className="text-blue-500 mt-1.5 shrink-0 transition-all group-hover:scale-125">•</span>
                        <p className="text-white/90 text-xs leading-relaxed">
                            <strong className="text-blue-100 font-bold">{parts[1] || ''} </strong>
                            {parts.slice(2).join('')}
                        </p>
                    </div>
                );
            } 
            // Simple List Items
            else if (line.startsWith('- ')) {
                rendered.push(
                    <div key={i} className="flex gap-4 mb-3 pl-2">
                        <span className="text-white/30 mt-1.5 shrink-0">•</span>
                        <p className="text-white/70 text-xs leading-relaxed">{line.replace('- ', '').trim()}</p>
                    </div>
                );
            } 
            // Separators
            else if (line.includes('---')) {
                rendered.push(<hr key={i} className="border-white/5 my-10" />);
            } 
            // Normal Text (excluding top title)
            else if (!line.startsWith('# ')) {
                rendered.push(<p key={i} className="text-white/50 text-[11px] leading-normal mb-2 pl-2 border-l border-white/5">{line.trim()}</p>);
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
            <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col glass-panel shadow-[0_0_100px_rgba(0,0,0,0.6)] border border-white/10 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-6 duration-500">
                
                {/* Header */}
                <div className="flex items-center justify-between p-7 border-b border-white/10 bg-white/5 shadow-2xl">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 flex items-center justify-center group transition-all hover:scale-105">
                            <OnyxMiniLogo className="w-12 h-12 transition-all group-hover:rotate-12 drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black uppercase tracking-[0.25em] text-white leading-none mb-1 shadow-sm">Onyx.mx Studio</h1>
                            <div className="flex items-center gap-3">
                                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-[10px] font-black text-blue-300 uppercase tracking-widest">Version v{__APP_VERSION__}</span>
                                <span className="text-[10px] text-white/40 font-bold tracking-widest uppercase">System Log</span>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all border border-white/10 hover:border-white/20 active:scale-95 shadow-lg"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content Viewer */}
                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-black/20 select-text">
                    <div className="max-w-3xl mx-auto py-6">
                        {renderMarkdown(changelogText)}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 bg-white/5 border-t border-white/10 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-white/30">
                        <span className="flex items-center gap-2 hover:text-white/60 transition-colors"><Info size={14} /> Technical Preview</span>
                        <span className="flex items-center gap-2 hover:text-white/60 transition-colors"><Sparkles size={14} /> Studio v4 Engine</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <a href="https://github.com/jouhayerk-cloud/onyx.mx" target="_blank" rel="noreferrer" 
                           className="flex items-center gap-3 px-4 py-2 rounded-xl bg-black/40 border border-white/5 text-[11px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-white/20 hover:bg-black/60 transition-all shadow-xl active:scale-95">
                            <Github size={15} />
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
