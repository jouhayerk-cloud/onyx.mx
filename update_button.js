const fs = require('fs');
let content = fs.readFileSync('src/features/logistics/LabelWizard.tsx', 'utf8');

// The second close button is in LabelWizard, followed by mb-16 shrink-0
const searchStr = \                <button 
                    onClick={() => setIsOpen(false)} 
                    className="fixed top-6 right-6 md:top-10 md:right-10 z-[20002] flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_80px_rgba(0,0,0,0.8)] group active:scale-95"
                >
                    <X size={32} className="md:w-[48px] md:h-[48px] group-hover:rotate-90 transition-transform duration-700" strokeWidth={1} />
                </button>

                <div className="flex justify-between items-start mb-16 shrink-0">\;

const replacement = \                {!isPrintWorkflowOpen && (
                    <button 
                        onClick={() => setIsOpen(false)} 
                        className="fixed top-6 right-6 md:top-10 md:right-10 z-[20002] flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_80px_rgba(0,0,0,0.8)] group active:scale-95"
                    >
                        <X size={32} className="md:w-[48px] md:h-[48px] group-hover:rotate-90 transition-transform duration-700" strokeWidth={1} />
                    </button>
                )}

                <div className="flex justify-between items-start mb-16 shrink-0">\;

content = content.replace(searchStr, replacement);
fs.writeFileSync('src/features/logistics/LabelWizard.tsx', content);
