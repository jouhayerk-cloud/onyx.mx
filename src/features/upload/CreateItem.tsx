import React, { useState } from 'react';
import { useAtom, useAtomValue } from 'jotai/react';
import { batchCreateModeAtom, isUploadWizardOpenAtom, userAtom } from '../../lib/atoms';
import { FileSpreadsheet, FilePenLine } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { Field, Segmented, VendorPicker } from '../../components/ui';
import { islandCommandsEnabledAtom, useRegisterTools, type ToolDescriptor } from '../../lib/toolRegistry';
import { BatchCreateWizard } from './BatchCreateWizard';
import { EntryScreen } from '../entry/EntryScreen';
import { VENDOR_CODES, isKnownVendor } from '../entry/entryModel';

type Mode = 'single' | 'batch';

/**
 * Create Item (the 'upload' view): Single Item is the Add Entry screen
 * inline (features/entry/EntryScreen, the same one the header launcher and
 * the inventory's Edit open as a modal); Batch XLSX is BatchCreateWizard,
 * which creates the rows and hands them to the Catalog Hub for the AI.
 *
 * The single form used to live here with its own numbering (db.from() on an
 * RxDatabase, which threw, so every vendor restarted at 001), no duplicate
 * check, no status, weight or note, and its state in uploadItemDataAtom,
 * where a stale Edit Entry pre-filled it. The "Add Entry 826 · 326 · 825"
 * key that opened the old wizard for the other books is gone: the screen
 * takes every book.
 *
 * The Single Item / Batch XLSX switch lives in the Onyx Island (two pinned
 * toggles registered here while this page is on screen); the page keeps its own
 * Segmented only when the island's commands are turned off.
 */
export function CreateItem() {
    const [mode, setMode] = useAtom(batchCreateModeAtom);
    const isWizardOpen = useAtomValue(isUploadWizardOpenAtom);
    const user = useAtomValue(userAtom);
    const vendorLock = user?.role === 'Vendor' && isKnownVendor(user?.name) ? String(user.name) : '';
    // Batch Create's vendor. Kept here, not in uploadItemDataAtom, which the
    // Edit Entry modal fills and clears.
    const [batchVendor, setBatchVendor] = useState(vendorLock);

    // The mode switch in the island: two pinned toggles, exactly one pressed.
    const islandEnabled = useAtomValue(islandCommandsEnabledAtom);
    const modeTools: ToolDescriptor[] = [
        {
            id: 'upload.single', moduleId: 'upload', label: tr('Single Item'), short: tr('Single'), title: tr('Add one item'),
            icon: FilePenLine, kind: 'toggle', group: tr('Entry mode'), order: 10, pinned: true, dock: 'left', essential: true,
            pressed: mode === 'single', run: () => setMode('single'),
        },
        {
            id: 'upload.batch', moduleId: 'upload', label: tr('Batch'), short: tr('Batch'), title: tr('Add many items from a vendor XLSX'),
            icon: FileSpreadsheet, kind: 'toggle', group: tr('Entry mode'), order: 20, pinned: true, dock: 'right', essential: true,
            pressed: mode === 'batch', run: () => setMode('batch'),
        },
    ];
    useRegisterTools('upload', modeTools, islandEnabled);

    // The vendor selector sits inside the Batch panel, above the file drop (not in the page bar under the island).
    const vendorPicker = (
        <Field label={tr('Vendor')} group>
            <VendorPicker codes={VENDOR_CODES} value={batchVendor} onChange={setBatchVendor} book="826"
                lockedReason={vendorLock ? tr('Your account enters stock for this vendor only.') : undefined} />
        </Field>
    );

    return (
        <div className={`entry-page${mode === 'batch' ? ' entry-page--batch' : ''}`}>
            {!islandEnabled && (
                <div className="ui-root entry-page__bar">
                    <Segmented<Mode>
                        label={tr('Entry mode')}
                        value={mode}
                        onChange={setMode}
                        options={[
                            { value: 'single', label: tr('Single Item') },
                            { value: 'batch', label: tr('Batch XLSX') },
                        ]}
                    />
                </div>
            )}

            {/* The single entry stays mounted while Batch XLSX is shown, only
                hidden: unmounting it lost its photos and generated content and
                stopped a running Generate. Shortcuts pause while it is hidden,
                and while the modal entry is open over this page, so Ctrl+S
                saves the one on top and not both. */}
            <div className="entry-page__single" hidden={mode !== 'single'}>
                <EntryScreen variant="page" mode="create" preset={{ workbook: 'v826' }} shortcuts={mode === 'single' && !isWizardOpen} />
            </div>
            {mode === 'batch' && (
                // On the kit like the single screen (its own .ui-root panel), so
                // the legacy .create-item wrapper and its remaps are not needed.
                <BatchCreateWizard vendorKey={batchVendor} vendorPicker={vendorPicker} />
            )}
        </div>
    );
}
