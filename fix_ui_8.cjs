const fs = require('fs');

const path = 'src/features/inventory/BatchProcessingWizard.tsx';
let content = fs.readFileSync(path, 'utf8');

const startStr = `                {/* Queue List */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">`;

const endStr = `                            </div>
                        </div>
                    ))}
                </div>`;

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr) + endStr.length;

if (startIdx === -1 || content.indexOf(endStr) === -1) {
    console.error("Could not find start or end block");
    process.exit(1);
}

const newBlock = `                {/* Queue List */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                    {queue.map((op, idx) => (
                        <div key={op.id} className="relative overflow-hidden bg-black/20 border border-white/5 backdrop-blur-2xl rounded-3xl p-6 flex flex-col gap-6 shadow-2xl shrink-0 group">
                            {/* Glowing Progress Background */}
                            <div 
                                className="absolute top-0 left-0 bottom-0 bg-(--main-color)/20 shadow-[0_0_30px_var(--main-color)] transition-all duration-500 ease-out z-0"
                                style={{ width: \`\${op.progress}%\` }}
                            />
                            
                            <div className="relative z-10 w-full flex flex-col gap-4">
                                {/* Header: Title, Indicators, Logs, Buttons */}
                                <div className="flex flex-col md:flex-row items-start md:items-center justify-between w-full gap-4">
                                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                                        <div className="flex items-center gap-2 text-[7px] font-black uppercase tracking-widest mb-1">
                                            <div className={\`flex items-center gap-1 transition-all \${op.progress >= 0 ? 'text-(--main-color)' : 'text-white/20'}\`}>
                                                <div className={\`w-1 h-1 rounded-full \${op.progress >= 0 ? 'bg-(--main-color) shadow-[0_0_8px_var(--main-color)]' : 'bg-white/20'}\`} /> IMG
                                            </div>
                                            <div className="w-2 h-[1px] bg-white/5" />
                                            <div className={\`flex items-center gap-1 transition-all \${op.progress >= 15 ? 'text-(--main-color)' : 'text-white/20'}\`}>
                                                <div className={\`w-1 h-1 rounded-full \${op.progress >= 15 ? 'bg-(--main-color) shadow-[0_0_8px_var(--main-color)]' : 'bg-white/20'}\`} /> MASK
                                            </div>
                                            <div className="w-2 h-[1px] bg-white/5" />
                                            <div className={\`flex items-center gap-1 transition-all \${op.progress >= 70 ? 'text-(--main-color)' : 'text-white/20'}\`}>
                                                <div className={\`w-1 h-1 rounded-full \${op.progress >= 70 ? 'bg-(--main-color) shadow-[0_0_8px_var(--main-color)]' : 'bg-white/20'}\`} /> TITLE
                                            </div>
                                            <div className="w-2 h-[1px] bg-white/5" />
                                            <div className={\`flex items-center gap-1 transition-all \${op.status === 'completed' ? 'text-emerald-400' : 'text-white/20'}\`}>
                                                <div className={\`w-1 h-1 rounded-full \${op.status === 'completed' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]' : 'bg-white/20'}\`} /> DONE
                                            </div>
                                        </div>
                                        <h4 className="text-xl md:text-2xl font-black uppercase tracking-tight">
                                            {(() => {
                                                const norm = normalizeInventoryData(op.item.data || op.item);
                                                const calc = calculateCodesAndPrices(norm, 20, '326');
                                                const tagId = calc?.printCode || calc?.bookBarcode || norm.book_barcode || norm.itemId || \`Item \${norm.itemNumber}\`;
                                                
                                                const match = tagId.replace(/\\s+/g, '').match(/^([A-Za-z]+\\d{2,4})(\\d{2}[A-Za-z]*)$/);
                                                if (match) {
                                                    const [_, section1, section2] = match;
                                                    return (
                                                        <div className="flex gap-2 items-center">
                                                            <span style={{ color: resolveVendorColor(section1) }}>{section1}</span>
                                                            <span className="text-white/90">{section2}</span>
                                                        </div>
                                                    );
                                                }
                                                return <span style={{ color: resolveVendorColor(tagId) }} className="block">{tagId}</span>;
                                            })()}
                                        </h4>
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-black uppercase tracking-widest text-white/50">
                                            <span className="text-white/80">{(op.item.data || op.item).shape || 'N/A'}</span>
                                            <span>•</span>
                                            <span className="text-white/80">{(op.item.data || op.item).color || 'N/A'}</span>
                                            <span>•</span>
                                            <span className="text-white/80">{(op.item.data || op.item).material || 'N/A'}</span>
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 text-[9px] font-mono opacity-80 truncate max-w-[250px] sm:max-w-sm">
                                            {op.status === 'processing' && <Loader2 size={10} className="animate-spin text-(--main-color)" />}
                                            {op.status === 'completed' && <CheckCircle2 size={10} className="text-emerald-400" />}
                                            {op.status === 'failed' && <AlertCircle size={10} className="text-rose-400" />}
                                            {op.status === 'idle' && <span className="font-black text-white/40">WAIT</span>}
                                            <span className={
                                                op.status === 'failed' ? 'text-rose-400' : 
                                                op.status === 'completed' ? 'text-emerald-400' :
                                                op.status === 'processing' ? 'text-(--main-color)' : 'text-white/40'
                                            }>
                                                {op.logs.length > 0 ? \`> \${op.logs[op.logs.length - 1]}\` : '> Waiting...'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* Free Floating Buttons */}
                                    <div className="flex items-center gap-4 shrink-0">
                                        <button 
                                            onClick={() => toggleImageProcessing(op.id)}
                                            disabled={op.status !== 'idle'}
                                            className={\`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all \${
                                                !op.skipImageProcessing ? 'text-(--main-color) hover:text-(--main-color)' : 'text-white/30 hover:text-white/60'
                                            } \${op.status !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}\`}
                                            title="Toggle AI background removal"
                                        >
                                            <UploadCloud size={14} /> IMG
                                        </button>
                                        <button 
                                            onClick={() => toggleProcessingMode(op.id)}
                                            disabled={op.status !== 'idle' || op.skipImageProcessing}
                                            className={\`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all \${
                                                op.processingMode === 'local' ? 'text-(--main-color) hover:text-(--main-color)' : 'text-cyan-400 hover:text-cyan-300'
                                            } \${op.status !== 'idle' || op.skipImageProcessing ? 'opacity-50 cursor-not-allowed' : ''}\`}
                                            title="Toggle Local/Cloud AI processing"
                                        >
                                            <Cpu size={14} /> {op.processingMode === 'local' ? 'LOCAL' : 'CLOUD'}
                                        </button>
                                        {op.status === 'completed' && (
                                            <button 
                                                onClick={() => processItem(op.item)}
                                                className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-amber-400 hover:text-amber-300 transition-all"
                                            >
                                                <RefreshCw size={14} /> RE-GENERATE
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Content Panel: Image and Generated Data Side by Side */}
                                <div className="mt-2 flex flex-col sm:flex-row gap-6 w-full">
                                    {/* Source Image */}
                                    <div 
                                        className={\`rounded-2xl bg-black/40 overflow-hidden shrink-0 relative border border-white/10 cursor-pointer group/img transition-all \${op.result ? 'w-full sm:w-1/3 aspect-[4/3] sm:aspect-square' : 'w-full aspect-[21/9]'}\`}
                                        onClick={() => {
                                            const img = op.imageUrl || op.item.generatedPngUrl || op.item.imageUrl || (op.item.data && op.item.data.mediaUrls ? op.item.data.mediaUrls.split(',')[0] : null);
                                            if (img) setFullscreenImage(getCleanImageUrl(img)!);
                                        }}
                                    >
                                        {op.imageUrl || op.item.generatedPngUrl || op.item.imageUrl || (op.item.data && op.item.data.mediaUrls) ? (
                                            <>
                                                <img src={getCleanImageUrl(op.imageUrl || op.item.generatedPngUrl || op.item.imageUrl || op.item.data.mediaUrls.split(',')[0])!} className="w-full h-full object-cover opacity-80 group-hover/img:opacity-100 group-hover/img:scale-105 transition-all duration-700" />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 bg-black/40 transition-all">
                                                    <ZoomIn size={24} className="text-white drop-shadow-md" />
                                                </div>
                                            </>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/20"><Bot size={32}/></div>
                                        )}
                                    </div>

                                    {/* Generated Content Panel */}
                                    {op.result && (
                                        <div className="flex-1 flex gap-4 p-4 rounded-2xl bg-black/30 border border-white/5 overflow-hidden">
                                            {/* Mask Preview */}
                                            {op.result.maskUrl && (
                                                <div 
                                                    className="w-20 sm:w-24 shrink-0 rounded-xl overflow-hidden bg-black/50 border border-white/10 relative cursor-pointer group/mask"
                                                    onClick={() => setFullscreenImage(getCleanImageUrl(op.result.maskUrl)!)}
                                                >
                                                    <img src={getCleanImageUrl(op.result.maskUrl)!} className="w-full h-full object-cover opacity-80 group-hover/mask:opacity-100 group-hover/mask:scale-110 transition-all duration-500" />
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/mask:opacity-100 bg-black/40 transition-all">
                                                        <ZoomIn size={16} className="text-white" />
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {/* Description Editor */}
                                            <div className="flex-1 min-w-0 flex flex-col relative">
                                                <textarea 
                                                    className="w-full h-full min-h-[80px] bg-transparent text-white/80 text-xs font-mono border-none focus:ring-0 resize-none outline-none leading-relaxed"
                                                    value={op.result.description}
                                                    onChange={(e) => updateOp(op.id, { result: { ...op.result, description: e.target.value } })}
                                                    placeholder="AI Description..."
                                                />
                                                <div className="absolute bottom-0 right-0 flex items-center gap-2">
                                                    <span className="text-[9px] font-black tracking-widest text-white/20 uppercase bg-black/60 px-2 py-1 rounded-md backdrop-blur-md">EDITABLE</span>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleSaveDescription(op); }}
                                                        className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-[9px] font-black tracking-widest text-white/60 transition-all flex items-center gap-1 backdrop-blur-md"
                                                    >
                                                        <Save size={10} /> SAVE
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>`;

content = content.substring(0, startIdx) + newBlock + content.substring(endIdx);
fs.writeFileSync(path, content, 'utf8');
console.log("File replaced successfully");
