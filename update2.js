const fs = require('fs');
const file = 'src/features/logistics/LabelWizard.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /{\/\* Floating Close Button - Studio Standard \*\/}\s*<button\s*onClick={\(\) => setIsOpen\(false\)}\s*className="fixed top-6 right-6 md:top-10 md:right-10 z-\[20002\].*?<\/button>\s*<div className="flex justify-between items-start mb-16 shrink-0">/s;

const match = content.match(regex);
if (match) {
    const replacement = {/* Floating Close Button - Studio Standard */}
                {!isPrintWorkflowOpen && (
                    <button 
                        onClick={() => setIsOpen(false)} 
                        className="fixed top-6 right-6 md:top-10 md:right-10 z-[20002] flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 text-white/20 hover:text-white hover:bg-white/10 hover:scale-110 transition-all pointer-events-auto shadow-[0_0_80px_rgba(0,0,0,0.8)] group active:scale-95"
                    >
                        <X size={32} className="md:w-[48px] md:h-[48px] group-hover:rotate-90 transition-transform duration-700" strokeWidth={1} />
                    </button>
                )}

                <div className="flex justify-between items-start mb-16 shrink-0">;
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content);
    console.log("Successfully replaced button!");
} else {
    console.log("Could not find button using regex!");
}
