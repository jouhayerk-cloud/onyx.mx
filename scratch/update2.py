import re

with open("src/features/logistics/LabelWizard.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add CircularProgress
circular_progress = """import { createPortal } from 'react-dom';

const CircularProgress = ({ progress, size = 64, strokeWidth = 4, children, colorClass }: any) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = progress < 0 ? circumference : circumference - (progress / 100) * circumference;
    
    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg className="absolute inset-0 transform -rotate-90 w-full h-full">
                <circle
                    className="text-white/10"
                    strokeWidth={strokeWidth}
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                <circle
                    className={colorClass}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                    style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                {children}
            </div>
        </div>
    );
};

export const LabelWizard: React.FC = () => {"""

content = content.replace("export const LabelWizard: React.FC = () => {", circular_progress)


# 2. Add state
old_state = "const [name, setName] = useState(`BATCH_${new Date().toISOString().split('T')[0]}`);"
new_state = "const [name, setName] = useState(`BATCH_${new Date().toISOString().split('T')[0]}`);\n    const [isNameEditing, setIsNameEditing] = useState(false);"
content = content.replace(old_state, new_state)


# 3. Replace the return layout
old_return_start = """    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[1000] flex flex-col pointer-events-none animate-in fade-in duration-700 overflow-hidden">
            <div className="absolute inset-0 backdrop-blur-xl bg-black/40 pointer-events-auto" onClick={() => setIsOpen(false)} />
            
            <div className="relative w-full h-full flex flex-col pointer-events-auto p-8 md:p-12 lg:p-16 overflow-y-auto no-scrollbar max-w-7xl mx-auto bg-black/10 backdrop-blur-3xl border border-white/5 shadow-2xl">"""

old_return_end = """                <div className="mt-auto pt-16 flex justify-between items-end opacity-5"><Cpu size={16} strokeWidth={1} /></div>
            </div>

            {/* ── LABEL PREVIEW OVERLAY — Fullscreen Glass Panel ── */}"""


new_layout = """    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[5000] flex items-center justify-center animate-in fade-in duration-700 overflow-hidden">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[80px] pointer-events-auto" onClick={() => setIsOpen(false)} />
            
            <div className="relative w-full h-[100dvh] md:w-[95vw] md:h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-700 pointer-events-auto bg-black/40 border border-white/10 rounded-3xl shadow-2xl">
                
                {/* Floating Close Button */}
                <button 
                    onClick={() => setIsOpen(false)} 
                    className="absolute top-6 right-6 md:top-10 md:right-10 z-[20002] flex items-center justify-center w-10 h-10 md:w-14 md:h-14 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 transition-all shadow-[0_0_80px_rgba(0,0,0,0.8)] group active:scale-95"
                >
                    <X size={24} className="group-hover:rotate-90 transition-transform duration-700" strokeWidth={1.5} />
                </button>

                <div className="flex-1 flex flex-col p-8 md:p-12 lg:p-16 overflow-y-auto no-scrollbar">
                    
                    <div className="flex flex-col mb-16 shrink-0 max-w-3xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Terminal size={14} className="text-(--main-color)" />
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">PRINTABLES WIZARD</span>
                        </div>
                        
                        {/* Collapsible Name Input */}
                        <div className="flex items-center gap-4 mt-2 border-b border-white/5 pb-8">
                            {isNameEditing ? (
                                <div className="flex items-center gap-2 bg-white/5 border border-white/20 rounded-xl px-4 py-2 w-full max-w-md">
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        autoFocus
                                        onBlur={() => setIsNameEditing(false)}
                                        onKeyDown={e => e.key === 'Enter' && setIsNameEditing(false)}
                                        className="bg-transparent border-none outline-none w-full text-2xl font-black text-white uppercase tracking-tighter placeholder:text-white/20"
                                        placeholder="BATCH NAME"
                                    />
                                    <button onClick={() => setIsNameEditing(false)} className="text-(--main-color) hover:text-white transition-colors">
                                        <Check size={20} />
                                    </button>
                                </div>
                            ) : (
                                <div 
                                    onClick={() => setIsNameEditing(true)}
                                    className="group flex items-center gap-4 cursor-pointer"
                                >
                                    <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter group-hover:text-(--main-color) transition-colors pb-1">
                                        {name}
                                    </h1>
                                    <Edit3 size={24} className="text-white/20 group-hover:text-(--main-color) transition-colors mt-2" />
                                </div>
                            )}
                            <div className="ml-auto flex flex-col items-end opacity-50">
                                <span className="text-[10px] font-black text-white uppercase tracking-[0.4em]">ITEMS</span>
                                <span className="text-4xl font-black text-white leading-none tabular-nums tracking-tighter">{selectedItems.length}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-center justify-between flex-1">
                        
                        {/* Main Element: PRINTER */}
                        <div className="flex-1 w-full lg:w-auto h-full flex flex-col items-center justify-center p-8 md:p-12 border-2 border-white/5 bg-white/[0.02] rounded-[3rem] hover:bg-white/[0.04] hover:border-(--main-color)/20 transition-all duration-500 group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-tr from-(--main-color)/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                            <button 
                                onClick={handlePrintBluetooth} 
                                disabled={progress.printer > 0 && progress.printer < 100} 
                                className="relative flex flex-col items-center justify-center gap-10 transition-all active:scale-95 disabled:opacity-50 w-full"
                            >
                                <CircularProgress progress={progress.printer} size={200} strokeWidth={6} colorClass="text-(--main-color)">
                                    <Printer size={80} strokeWidth={1} className={`transition-all duration-500 ${progress.printer === 100 ? 'text-(--main-color) drop-shadow-[0_0_30px_rgba(var(--main-color-rgb),0.6)]' : 'text-white/40 group-hover:text-white'}`} />
                                </CircularProgress>
                                <div className="flex flex-col items-center gap-3">
                                    <span className="text-4xl md:text-5xl font-black text-white uppercase tracking-widest group-hover:text-(--main-color) transition-colors drop-shadow-md">PRINT</span>
                                    <span className="text-xs font-black text-white/40 uppercase tracking-[0.5em]">DEPLOY TO PRINTER</span>
                                </div>
                            </button>
                        </div>

                        {/* Files Generation Icons Panel */}
                        <div className="flex w-full lg:w-auto justify-around lg:justify-end gap-10 md:gap-16 items-center shrink-0">
                            
                            {/* Control Page (PDF) */}
                            <div className="flex flex-col items-center gap-6 relative group/icon">
                                <button 
                                    onClick={handleGeneratePDF} 
                                    disabled={progress.pdf > 0 && progress.pdf < 100} 
                                    className="relative flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <CircularProgress progress={progress.pdf} size={90} strokeWidth={4} colorClass="text-red-400">
                                        {progress.pdf === 100 && urls.pdf ? (
                                            <button onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = urls.pdf; a.download = `ControlPage_${name}.pdf`; a.click(); }} className="absolute inset-0 flex items-center justify-center bg-red-500/20 rounded-full hover:bg-red-500/40 transition-colors">
                                                <Download size={32} className="text-red-400" />
                                            </button>
                                        ) : (
                                            <FileText size={36} strokeWidth={1.5} className="text-white/30 group-hover/icon:text-red-400 transition-colors" />
                                        )}
                                    </CircularProgress>
                                </button>
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] group-hover/icon:text-white transition-colors">Control</span>
                            </div>

                            {/* Labels (XLSX) */}
                            <div className="flex flex-col items-center gap-6 relative group/icon">
                                <button 
                                    onClick={handleGenerateXLSX} 
                                    disabled={progress.xlsx > 0 && progress.xlsx < 100} 
                                    className="relative flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <CircularProgress progress={progress.xlsx} size={90} strokeWidth={4} colorClass="text-emerald-400">
                                        {progress.xlsx === 100 && urls.xlsx ? (
                                            <button onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = urls.xlsx; a.download = `Labels_${name}.xlsx`; a.click(); }} className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 rounded-full hover:bg-emerald-500/40 transition-colors">
                                                <Download size={32} className="text-emerald-400" />
                                            </button>
                                        ) : (
                                            <FileSpreadsheet size={36} strokeWidth={1.5} className="text-white/30 group-hover/icon:text-emerald-400 transition-colors" />
                                        )}
                                    </CircularProgress>
                                </button>
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] group-hover/icon:text-white transition-colors">Labels</span>
                            </div>

                            {/* Catalog (PDF) */}
                            <div className="flex flex-col items-center gap-6 relative group/icon">
                                <button 
                                    onClick={handleGenerateCatalog} 
                                    disabled={progress.catalog > 0 && progress.catalog < 100} 
                                    className="relative flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <CircularProgress progress={progress.catalog} size={90} strokeWidth={4} colorClass="text-blue-400">
                                        {progress.catalog === 100 && urls.catalog ? (
                                            <button onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = urls.catalog; a.download = `Catalog_${name}.pdf`; a.click(); }} className="absolute inset-0 flex items-center justify-center bg-blue-500/20 rounded-full hover:bg-blue-500/40 transition-colors">
                                                <Download size={32} className="text-blue-400" />
                                            </button>
                                        ) : (
                                            <BookOpen size={36} strokeWidth={1.5} className="text-white/30 group-hover/icon:text-blue-400 transition-colors" />
                                        )}
                                    </CircularProgress>
                                </button>
                                <div className="flex flex-col items-center gap-2">
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] group-hover/icon:text-white transition-colors">Catalog</span>
                                    <div className="flex gap-2">
                                        {['grid', 'single'].map(m => (
                                            <button 
                                                key={m} 
                                                onClick={() => setCatalogMethod(m as any)} 
                                                className={`text-[8px] font-black uppercase tracking-widest transition-all px-2 py-1 rounded-sm border ${catalogMethod === m ? 'text-blue-400 border-blue-500/40 bg-blue-500/10' : 'text-white/20 border-transparent hover:text-white/40'}`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            {/* ── LABEL PREVIEW OVERLAY — Fullscreen Glass Panel ── */}"""

start_idx = content.find(old_return_start)
end_idx = content.find(old_return_end) + len(old_return_end)

if start_idx != -1 and end_idx != -1:
    # Also we need to change the final `        </div>\n    );\n};` to `        </div>,\n        document.body\n    );\n};`
    # Let's find the end of LabelWizard.
    old_end = "        </div>\n    );\n};\n\nexport const CrateManifesto"
    new_end = "        </div>,\n        document.body\n    );\n};\n\nexport const CrateManifesto"
    
    # We construct the new content:
    content = content[:start_idx] + new_layout + content[end_idx:]
    
    content = content.replace(old_end, new_end)

    with open("src/features/logistics/LabelWizard.tsx", "w", encoding="utf-8") as f:
        f.write(content)
    print("Success")
else:
    print("Could not find blocks")
