import re

with open("src/features/logistics/LabelWizard.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Import PreviewLabels
import_str = "import { PreviewLabels } from '../../components/PreviewLabels';"
if import_str not in content:
    content = content.replace("import { ScannerCenter } from '../../components/ScannerCenter';", 
                              "import { ScannerCenter } from '../../components/ScannerCenter';\n" + import_str)

# 2. Add isPreviewOverlayOpen state
state_search = "const [isPrinterOverlayOpen, setIsPrinterOverlayOpen] = useState(false);"
if "isPreviewOverlayOpen" not in content:
    content = content.replace(state_search, state_search + "\n    const [isPreviewOverlayOpen, setIsPreviewOverlayOpen] = useState(false);")


# 3. Change buildBatchJSONAsync signature
old_build_sig = "const buildBatchJSONAsync = async (items: any[], workbookPrefix: string, activeLabelSize: string = '50x30') => {"
new_build_sig = "const buildBatchJSONAsync = async (items: any[], workbookPrefix: string, activeLabelSize: string = '50x30', qOverride?: Record<string, number>) => {"
content = content.replace(old_build_sig, new_build_sig)

old_quant_line = '"QUANTITY": quantities[String(item.row)] ?? (d.quantity || 1),'
new_quant_line = '"QUANTITY": (qOverride || quantities)[String(item.row)] ?? (d.quantity || 1),'
content = content.replace(old_quant_line, new_quant_line)


# 4. Change handlePrintBluetooth and add handleLaunchIframe
old_print_fn = """    const handlePrintBluetooth = async () => {
        setProgress(p => ({ ...p, printer: 5 }));
        const tid = toast.loading('Generating dynamic 3D structures for labels...');
        try {
            const batchProject = await buildBatchJSONAsync(selectedItems, workbookPrefix);
            localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
            pendingBatchRef.current = batchProject;
            setProgress(p => ({ ...p, printer: 100 }));
            toast.success('Batch Prepared! Launching Print Engine', { id: tid });
            setIsPrinterOverlayOpen(true);
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || 'Failed to prepare batch', { id: tid });
            setProgress(p => ({ ...p, printer: -1 }));
        }
    };"""

new_print_fn = """    const handlePrintBluetooth = async () => {
        setIsPreviewOverlayOpen(true);
    };

    const handleLaunchIframe = async (selectedIndices: Set<number>, allLabelInstances: any[]) => {
        const newQuantities: Record<string, number> = {};
        for (const idx of selectedIndices) {
            const rowStr = String(allLabelInstances[idx].item.row);
            newQuantities[rowStr] = (newQuantities[rowStr] || 0) + 1;
        }
        
        setQuantities(newQuantities);
        setIsPreviewOverlayOpen(false);

        setProgress(p => ({ ...p, printer: 5 }));
        const tid = toast.loading('Generating dynamic 3D structures for labels...');
        try {
            const batchProject = await buildBatchJSONAsync(selectedItems, workbookPrefix, '50x30', newQuantities);
            localStorage.setItem('onyx_packing_batch', JSON.stringify(batchProject));
            pendingBatchRef.current = batchProject;
            setProgress(p => ({ ...p, printer: 100 }));
            toast.success('Batch Prepared! Launching Print Engine', { id: tid });
            setIsPrinterOverlayOpen(true);
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || 'Failed to prepare batch', { id: tid });
            setProgress(p => ({ ...p, printer: -1 }));
        }
    };"""

if old_print_fn in content:
    content = content.replace(old_print_fn, new_print_fn)
else:
    print("Could not find handlePrintBluetooth!")


# 5. Add <PreviewLabels /> in the render return
old_preview_overlay = "{/* ── LABEL PREVIEW OVERLAY — Fullscreen Glass Panel ── */}"
new_preview_overlay = """            {/* ── NEW NATIVE PREVIEW LABELS ── */}
            {isPreviewOverlayOpen && (
                <PreviewLabels 
                    items={selectedItems} 
                    quantities={quantities} 
                    onClose={() => setIsPreviewOverlayOpen(false)}
                    onLaunchIframe={handleLaunchIframe}
                />
            )}

            {/* ── LABEL PREVIEW OVERLAY — Fullscreen Glass Panel ── */}"""
content = content.replace(old_preview_overlay, new_preview_overlay)

with open("src/features/logistics/LabelWizard.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated LabelWizard.tsx successfully.")
