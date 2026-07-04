const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'features', 'logistics', 'LabelWizard.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add state variables
content = content.replace(
    "const [name, setName] = useState(`BATCH_${new Date().toISOString().split('T')[0]}`);",
    "const [name, setName] = useState(`BATCH_${new Date().toISOString().split('T')[0]}`);\n    const [activeWizardTab, setActiveWizardTab] = useState<'printer' | 'documents'>('printer');\n    const [isNameInputFocused, setIsNameInputFocused] = useState(false);"
);

// 2. Replace the JSX from <div className="relative w-full h-[100dvh] ... to the Cpu icon div
const startIndex = content.indexOf('<div className="relative w-full h-[100dvh] md:w-[95vw] md:h-[95vh] flex flex-col overflow-y-auto overflow-x-hidden no-scrollbar pointer-events-auto p-8 md:p-12 lg:p-16 max-w-7xl mx-auto animate-in zoom-in-95 duration-700 bg-transparent">');

const searchStr = '<div className="mt-auto pt-16 flex justify-between items-end opacity-5"><Cpu size={16} strokeWidth={1} /></div>\n            </div>';
const endIndex = content.indexOf(searchStr) + searchStr.length;

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find start or end index for JSX replacement");
    process.exit(1);
}

const newJSX = `
            <div className="relative w-full h-[100dvh] md:w-[95vw] md:h-[95vh] flex flex-col overflow-y-auto overflow-x-hidden no-scrollbar pointer-events-auto p-8 md:p-12 lg:p-16 max-w-7xl mx-auto animate-in zoom-in-95 duration-700 bg-transparent">
                
                {/* Floating Close Button */}
                {!isPrintWorkflowOpen && (
                    <button 
                        onClick={() => setIsOpen(false)} 
                        className="fixed top-6 right-6 md:top-10 md:right-10 z-[20002] flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_80px_rgba(0,0,0,0.8)] group active:scale-95"
                    >
                        <X size={32} className="md:w-[48px] md:h-[48px] group-hover:rotate-90 transition-transform duration-700" strokeWidth={1} />
                    </button>
                )}

                <div className="flex justify-between items-start mb-8 shrink-0">
                    <div className="flex flex-col gap-5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-(--main-color) flex items-center justify-center text-black shadow-[0_0_30px_rgba(var(--main-color-rgb),0.4)]">
                                <Terminal size={24} strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col">
                                <h2 className="text-3xl font-black text-white tracking-[0.3em] uppercase leading-none">PRINT WIZARD</h2>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-8 mb-12 shrink-0 max-w-4xl relative">
                    <div className="flex-1">
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2 block">BATCH NAME</span>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onFocus={() => setIsNameInputFocused(true)}
                            onBlur={() => setIsNameInputFocused(false)}
                            className={\`bg-transparent border-none outline-none w-full font-black text-white uppercase tracking-tighter placeholder:text-white/5 focus:text-(--main-color) transition-all duration-300 \${isNameInputFocused ? 'text-6xl md:text-7xl py-2' : 'text-5xl md:text-6xl'}\`}
                            placeholder="ID_NULL"
                        />
                    </div>
                    <div className="flex gap-8 shrink-0">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">TYPES</span>
                            <div className="text-4xl md:text-5xl font-black text-(--main-color) leading-none tabular-nums tracking-tighter drop-shadow-[0_0_30px_rgba(var(--main-color-rgb),0.3)]">
                                {selectedItems.length}
                            </div>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">TOTAL ITEMS</span>
                            <div className="text-4xl md:text-5xl font-black text-(--main-color) leading-none tabular-nums tracking-tighter drop-shadow-[0_0_30px_rgba(var(--main-color-rgb),0.3)]">
                                {selectedItems.reduce((acc, item) => acc + (quantities[String(item.row)] ?? (Number(item.normData.quantity) || 1)), 0)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Selectors */}
                <div className="flex gap-4 mb-8">
                    <button
                        onClick={() => setActiveWizardTab('printer')}
                        className={\`px-8 py-4 flex items-center gap-3 rounded-xl text-lg font-black uppercase tracking-[0.2em] transition-all \${activeWizardTab === 'printer' ? 'bg-(--main-color) text-black shadow-[0_0_20px_rgba(var(--main-color-rgb),0.4)] scale-[1.02]' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'}\`}
                    >
                        <Printer size={20} />
                        Printer
                    </button>
                    <button
                        onClick={() => setActiveWizardTab('documents')}
                        className={\`px-8 py-4 flex items-center gap-3 rounded-xl text-lg font-black uppercase tracking-[0.2em] transition-all \${activeWizardTab === 'documents' ? 'bg-blue-400 text-black shadow-[0_0_20px_rgba(96,165,250,0.4)] scale-[1.02]' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'}\`}
                    >
                        <FileText size={20} />
                        Documents
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-4">
                    {activeWizardTab === 'printer' && (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 lg:gap-16">
                            <div className="flex flex-col gap-6 md:col-span-3">
                                {/* Print Settings */}
                                <div className="bg-black/40 border border-white/5 rounded-3xl p-8 flex flex-col gap-8 shadow-2xl relative overflow-hidden">
                                    <div className="flex flex-col gap-2">
                                        <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Print Settings</h3>
                                        <p className="text-white/40 text-sm font-medium">Configure labels and export manifesting files.</p>
                                    </div>
                                    
                                    {/* Format Selectors */}
                                    <div className="flex flex-col gap-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Label Size</label>
                                        <div className="flex gap-4">
                                            {['50x30', '50x50'].map(size => (
                                                <button
                                                    key={size}
                                                    onClick={() => setActiveLabelSize(size as any)}
                                                    className={\`px-6 py-3 rounded-xl border \${activeLabelSize === size ? 'bg-(--main-color) text-black font-black border-(--main-color)' : 'bg-transparent text-white/40 font-bold border-white/10 hover:bg-white/5 hover:text-white'} transition-all uppercase tracking-widest text-xs\`}
                                                >
                                                    {size} mm
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Action Buttons Container */}
                                    <div className="grid grid-cols-2 gap-4 mt-4">
                                        {/* Control PDF */}
                                        <div className="flex flex-col gap-2">
                                            <button 
                                                onClick={handleGeneratePDF} 
                                                disabled={progress.pdf > 0 && progress.pdf < 100} 
                                                className="w-full py-3 bg-red-500/10 border border-red-500/30 text-red-400 font-black uppercase tracking-[0.1em] text-xs rounded-xl hover:bg-red-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {progress.pdf > 0 && progress.pdf < 100 ? <div className="w-4 h-4 border-2 border-red-500/20 border-t-red-500 animate-spin rounded-full" /> : <ListChecks size={16} />}
                                                {progress.pdf === 100 ? 'RE-GENERATE CONTROL PDF' : 'CONTROL PDF'}
                                            </button>
                                            {progress.pdf === 100 && urls.pdf && (
                                                <button 
                                                    onClick={() => { const a = document.createElement('a'); a.href = urls.pdf; a.download = \`ControlPage_\${name}.pdf\`; a.click(); }}
                                                    className="w-full py-2 bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex justify-center items-center gap-2 hover:bg-red-500/30 transition-all"
                                                >
                                                    <Download size={12} /> RETRIEVE PDF
                                                </button>
                                            )}
                                        </div>

                                        {/* XLS Labels */}
                                        <div className="flex flex-col gap-2">
                                            <button 
                                                onClick={handleGenerateXLSX} 
                                                disabled={progress.xlsx > 0 && progress.xlsx < 100} 
                                                className="w-full py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-black uppercase tracking-[0.1em] text-xs rounded-xl hover:bg-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {progress.xlsx > 0 && progress.xlsx < 100 ? <div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 animate-spin rounded-full" /> : <Sheet size={16} />}
                                                {progress.xlsx === 100 ? 'RE-GENERATE XLS LABELS' : 'XLS LABELS'}
                                            </button>
                                            {progress.xlsx === 100 && urls.xlsx && (
                                                <button 
                                                    onClick={() => { const a = document.createElement('a'); a.href = urls.xlsx; a.download = \`Labels_\${name}.xlsx\`; a.click(); }}
                                                    className="w-full py-2 bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex justify-center items-center gap-2 hover:bg-emerald-500/30 transition-all"
                                                >
                                                    <Download size={12} /> RETRIEVE XLS
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="mt-4">
                                        <button
                                            onClick={handlePrintBluetooth}
                                            disabled={progress.printer > 0 && progress.printer < 100}
                                            className="w-full py-4 bg-(--main-color) text-black font-black uppercase tracking-[0.2em] text-sm rounded-xl hover:shadow-[0_0_30px_rgba(var(--main-color-rgb),0.6)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            {progress.printer > 0 && progress.printer < 100 ? <div className="w-4 h-4 border-2 border-black/20 border-t-black animate-spin rounded-full" /> : <Printer size={18} />}
                                            {progress.printer > 0 && progress.printer < 100 ? 'GENERATING...' : 'LAUNCH PRINT ENGINE'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Preview Label */}
                            <div className="flex flex-col md:col-span-2 bg-black/30 border border-white/5 rounded-3xl p-6 items-center justify-center min-h-[300px]">
                                {activeLabelSize === '50x30' ? (
                                    <div className="w-[300px] h-[180px] bg-white rounded-md shadow-lg p-3 flex flex-col relative pointer-events-none overflow-hidden text-black font-sans">
                                        <div className="flex flex-1 gap-2">
                                            {/* Vertical Text */}
                                            <div className="w-4 flex flex-col justify-between items-center py-1">
                                                {Array.from("MADE IN MEXICO").map((char, i) => (
                                                    <span key={i} className="text-[6px] font-black leading-none">{char}</span>
                                                ))}
                                            </div>
                                            {/* Axometric Icon */}
                                            <div className="w-10 h-16 flex items-center justify-center">
                                                <div className="w-6 h-12 border border-gray-600 flex items-center justify-center skew-y-12"></div>
                                            </div>
                                            {/* Text Stack */}
                                            <div className="flex-1 flex flex-col justify-start gap-[2px] pt-1">
                                                <div className="text-[9px] font-black leading-none">ABC-123ABCDE</div>
                                                <div className="text-[14px] font-black leading-none mt-1">Shape Type</div>
                                                <div className="text-[12px] text-gray-700 leading-none">Color Material</div>
                                                <div className="text-[8px] font-black leading-none mt-1">12*12*12 CM 12Kg</div>
                                            </div>
                                            {/* QR Code */}
                                            <div className="w-16 h-16 border-[4px] border-black p-1 flex items-center justify-center">
                                                <div className="w-full h-full bg-black"></div>
                                            </div>
                                        </div>
                                        {/* Barcode */}
                                        <div className="h-14 w-full mt-2 flex flex-col">
                                            <div className="flex-1 w-full opacity-90 border-x-[1px] border-black flex" style={{backgroundImage: 'repeating-linear-gradient(to right, transparent, transparent 2px, black 2px, black 4px)'}}></div>
                                            <div className="h-3 flex justify-between items-center px-2 text-[7px] font-black mt-1">
                                                <span>V</span><span>C</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>A</span><span>B</span><span>C</span><span>D</span><span>E</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-[300px] h-[300px] bg-white rounded-md shadow-lg p-4 flex flex-col relative overflow-hidden pointer-events-none text-black font-sans">
                                        <div className="flex gap-4">
                                            {/* QR Code */}
                                            <div className="w-20 h-20 border-[4px] border-black p-1 flex items-center justify-center shrink-0">
                                                <div className="w-full h-full bg-black"></div>
                                            </div>
                                            {/* Text Stack */}
                                            <div className="flex-1 flex flex-col justify-start gap-1 pt-1">
                                                <div className="text-[16px] font-black leading-none">Shape Type</div>
                                                <div className="text-[14px] text-gray-700 leading-none">Color Material</div>
                                                <div className="text-[10px] font-black leading-none mt-1">12*12*12 CM WT 12KG</div>
                                            </div>
                                        </div>
                                        <div className="flex mt-6 gap-2 flex-1">
                                            <div className="flex-1 flex flex-col pt-2 gap-1">
                                                <div className="text-[14px] font-black leading-none">ABC-123456</div>
                                                <div className="text-[11px] text-gray-600 leading-none mt-2">Made in Mexico For</div>
                                                {/* Logo Placeholder */}
                                                <div className="mt-4 w-[120px] h-[30px] flex items-center justify-start">
                                                    <img src={logoVariant === 'ArtOfDecor' ? \`\${import.meta.env.BASE_URL}ArtOfDecorLogo.png\` : \`\${import.meta.env.BASE_URL}REG_Logo.png\`} alt="Logo" className="max-h-full object-contain" />
                                                </div>
                                            </div>
                                            {/* Axometric Icon */}
                                            <div className="w-16 h-24 mr-4 mt-2 flex items-center justify-center">
                                                <div className="w-10 h-20 border-[1.5px] border-gray-800 flex items-center justify-center skew-y-12 shrink-0">
                                                    <div className="w-8 h-16 border border-gray-300"></div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Barcode */}
                                        <div className="h-20 w-full mt-4 flex flex-col">
                                            <div className="flex-1 w-full opacity-90 border-x-[1px] border-black flex" style={{backgroundImage: 'repeating-linear-gradient(to right, transparent, transparent 2px, black 2px, black 4px)'}}></div>
                                            <div className="h-4 flex justify-between items-center px-4 text-[9px] font-black mt-1">
                                                <span>V</span><span>C</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>A</span><span>B</span><span>C</span><span>D</span><span>E</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeWizardTab === 'documents' && (
                        <div className="flex flex-col gap-6 max-w-2xl">
                            <div className="bg-black/40 border border-white/5 rounded-3xl p-8 flex flex-col gap-8 shadow-2xl relative overflow-hidden">
                                <div className="flex flex-col gap-2">
                                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Document Settings</h3>
                                    <p className="text-white/40 text-sm font-medium">Configure branded catalogs.</p>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="flex flex-col gap-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Layout Format</label>
                                        <div className="flex gap-4">
                                            {['grid', 'single'].map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => setCatalogMethod(m as any)}
                                                    className={\`px-6 py-3 rounded-xl border \${catalogMethod === m ? 'bg-blue-500/20 text-blue-400 font-black border-blue-500/50' : 'bg-transparent text-white/40 font-bold border-white/10 hover:bg-white/5 hover:text-white'} transition-all uppercase tracking-widest text-xs flex-1\`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col gap-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Branding Logo</label>
                                        <div className="flex gap-4">
                                            {['ArtOfDecor', 'RareEarth'].map(v => (
                                                <button
                                                    key={v}
                                                    onClick={() => setLogoVariant(v as any)}
                                                    className={\`px-6 py-3 rounded-xl border \${logoVariant === v ? 'bg-blue-500/20 text-blue-400 font-black border-blue-500/50' : 'bg-transparent text-white/40 font-bold border-white/10 hover:bg-white/5 hover:text-white'} transition-all uppercase tracking-widest text-xs flex-1 truncate\`}
                                                >
                                                    {v === 'ArtOfDecor' ? 'A.O.D' : 'R.E.G'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-col gap-2">
                                    <button 
                                        onClick={handleGenerateCatalog} 
                                        disabled={progress.catalog > 0 && progress.catalog < 100} 
                                        className="w-full py-4 bg-blue-500 border border-blue-400 text-black font-black uppercase tracking-[0.2em] text-sm rounded-xl hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        {progress.catalog > 0 && progress.catalog < 100 ? <div className="w-4 h-4 border-2 border-black/20 border-t-black animate-spin rounded-full" /> : <BookOpen size={18} />}
                                        {progress.catalog === 100 ? 'RE-GENERATE CATALOG' : 'GENERATE CATALOG'}
                                    </button>
                                    
                                    {progress.catalog === 100 && urls.catalog && (
                                        <button 
                                            onClick={() => { const a = document.createElement('a'); a.href = urls.catalog; a.download = \`Catalog_\${name}.pdf\`; a.click(); }}
                                            className="w-full py-2 bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex justify-center items-center gap-2 hover:bg-blue-500/30 transition-all"
                                        >
                                            <Download size={12} /> RETRIEVE CATALOG
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-auto pt-16 flex justify-between items-end opacity-5"><Cpu size={16} strokeWidth={1} /></div>
            </div>`;

content = content.substring(0, startIndex) + newJSX + content.substring(endIndex);

fs.writeFileSync(filePath, content, 'utf-8');
console.log("Successfully refactored LabelWizard.tsx");
