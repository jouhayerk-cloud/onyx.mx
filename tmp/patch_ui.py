
import os

filepath = r'c:\Jouhayerk\git\app\src\features\process\ProcessView.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

old_button = '<button onClick={runBatchSequence} disabled={isProcessingGlobal || batchQueue.length === 0} className="w-full py-5 rounded-2xl bg-(--main-color) text-black text-[12px] font-black uppercase tracking-[0.3em] shadow-xl shadow-(--main-color)/20 disabled:grayscale disabled:opacity-20 active:scale-[0.98] transition-all">Execute Batch Sequence</button>'

new_ui = """<div className="flex gap-4">
                                      {!isProcessingGlobal || isAborted ? (
                                          <button 
                                              onClick={runBatchSequence} 
                                              disabled={isProcessingGlobal || batchQueue.length === 0} 
                                              className="flex-1 py-5 rounded-2xl bg-(--main-color) text-black text-[12px] font-black uppercase tracking-[0.3em] shadow-xl shadow-(--main-color)/20 disabled:grayscale disabled:opacity-20 active:scale-[0.98] transition-all"
                                          >Execute Batch Sequence</button>
                                      ) : (
                                          <button 
                                              onClick={() => {
                                                  setIsAborted(true);
                                                  addLog("Termination signal sent to engine...", "warn");
                                              }} 
                                              className="flex-1 py-5 rounded-2xl bg-rose-500 text-white text-[12px] font-black uppercase tracking-[0.3em] shadow-xl shadow-rose-500/20 active:scale-[0.98] transition-all animate-pulse"
                                          >Stop Batch Sequence</button>
                                      )}
                                  </div>"""

if old_button in content:
    print("Found button, replacing...")
    new_content = content.replace(old_button, new_ui)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success.")
else:
    print("Could not find button text exactly. Trying fuzzy match...")
    # Try finding it without exact whitespace
    import re
    pattern = re.escape(old_button).replace(re.escape(' '), r'\s+')
    if re.search(pattern, content):
        print("Fuzzy found button, replacing...")
        new_content = re.sub(pattern, new_ui, content)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Success (fuzzy).")
    else:
        print("FAILED: Could not find button even with fuzzy match.")
