
import re

with open(r"C:\Jouhayerk\git\app\src\features\print\PrintCenter.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Remove LabelWizard imports
code = re.sub(r"import \{ NFCWizard, LabelWizard \} from \x27\.\./logistics/LabelWizard\x27;\n?", "", code)

# Replace NFC Tab
nfc_ui = """
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 max-w-sm mx-auto">
                            <div className="w-32 h-32 rounded-full border-4 border-dashed border-gray-600 flex items-center justify-center mb-6 animate-pulse">
                                <span className="text-gray-500">NFC</span>
                            </div>
                            <button className="pc-btn-primary w-full py-4 text-lg font-semibold tracking-wider rounded-xl">
                                WRITE TO TAG
                            </button>
                        </div>"""
code = re.sub(r"<div className=\x22pc-embedded-wizard relative w-full h-full overflow-hidden\x22>\s*<NFCWizard />\s*</div>", nfc_ui.strip(), code)

# Replace Templates Tab
templates_ui = """
                        <div className="flex h-full w-full">
                            <div className="w-1/2 p-6 border-r border-gray-700/50 flex flex-col gap-4">
                                <h3 className="text-xl font-semibold mb-2">Configure Label</h3>
                                <div className="space-y-4">
                                    <input type="text" placeholder="Title" className="pc-input w-full" />
                                    <input type="text" placeholder="Subtitle" className="pc-input w-full" />
                                    <select className="pc-input w-full bg-black/20">
                                        <option>Standard Format</option>
                                        <option>Compact Format</option>
                                    </select>
                                </div>
                            </div>
                            <div className="w-1/2 p-6 flex flex-col items-center justify-center bg-black/10">
                                <div className="w-64 h-40 bg-white rounded flex items-center justify-center text-black font-mono text-sm border-2 border-dashed border-gray-400">
                                    [ Preview Box ]
                                </div>
                            </div>
                        </div>"""
code = re.sub(r"<div className=\x22pc-embedded-wizard relative w-full h-full overflow-hidden\x22>\s*<LabelWizard />\s*</div>", templates_ui.strip(), code)

with open(r"C:\Jouhayerk\git\app\src\features\print\PrintCenter.tsx", "w", encoding="utf-8") as f:
    f.write(code)

