import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import {
    userAtom,
    isUploadWizardOpenAtom,
    uploadItemDataAtom,
    isInventoryViewSliderOpenAtom,
    isInventoryFiltersPanelOpenAtom,
    isInventorySearchOpenAtom,
    isPaymentsSearchOpenAtom,
    isPaymentFiltersOpenAtom,
    isPaymentActionPanelOpenAtom,
    isPaymentQueueOpenAtom,
    isPaymentUpcomingOpenAtom,
    isPaymentPendingBarOpenAtom,
    truckShowSaveDraftAtom,
    truckShowOpenDraftAtom,
    truckShowExportModalAtom,
    truckShowReadyWizardAtom,
    truckShowPanelsAtom,
} from '../../lib/atoms';
import { EntryScreen } from '../entry/EntryScreen';

/**
 * The app-wide Add Entry / Edit Entry modal: the header's launcher opens it
 * to add, an inventory row's Edit opens it with that row in
 * uploadItemDataAtom. The screen itself is features/entry/EntryScreen, the
 * same one Create Item shows inline.
 *
 * uploadItemDataAtom is read once, when the modal opens, and cleared when it
 * closes. It used to stay filled after an Edit Entry (the clearing effect was
 * commented out), and Create Item then opened pre-filled with that item and
 * inserted a duplicate of it. The 826 hand-off to Create Item is gone too:
 * the form handles every book, so there is nothing to hand off.
 */
export const UploadWizard: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(isUploadWizardOpenAtom);
    const [itemData, setItemData] = useAtom(uploadItemDataAtom);
    const user = useAtomValue(userAtom);

    // The toolbars that float over the views would sit on top of the modal.
    const setIsViewSliderOpen = useSetAtom(isInventoryViewSliderOpenAtom);
    const setIsFiltersOpen = useSetAtom(isInventoryFiltersPanelOpenAtom);
    const setIsSearchOpen = useSetAtom(isInventorySearchOpenAtom);
    const setIsPaySearchOpen = useSetAtom(isPaymentsSearchOpenAtom);
    const setIsPayFiltersOpen = useSetAtom(isPaymentFiltersOpenAtom);
    const setIsPayActionOpen = useSetAtom(isPaymentActionPanelOpenAtom);
    const setIsPayQueueOpen = useSetAtom(isPaymentQueueOpenAtom);
    const setIsPayUpcomingOpen = useSetAtom(isPaymentUpcomingOpenAtom);
    const setIsPayPendingOpen = useSetAtom(isPaymentPendingBarOpenAtom);
    const setTrkSave = useSetAtom(truckShowSaveDraftAtom);
    const setTrkOpen = useSetAtom(truckShowOpenDraftAtom);
    const setTrkExport = useSetAtom(truckShowExportModalAtom);
    const setTrkReady = useSetAtom(truckShowReadyWizardAtom);
    const setTrkPanels = useSetAtom(truckShowPanelsAtom);

    useEffect(() => {
        if (!isOpen) return;
        [
            setIsViewSliderOpen, setIsFiltersOpen, setIsSearchOpen,
            setIsPaySearchOpen, setIsPayFiltersOpen, setIsPayActionOpen, setIsPayQueueOpen, setIsPayUpcomingOpen, setIsPayPendingOpen,
            setTrkSave, setTrkOpen, setTrkExport, setTrkReady, setTrkPanels,
        ].forEach(set => set(false));
    }, [
        isOpen,
        setIsViewSliderOpen, setIsFiltersOpen, setIsSearchOpen,
        setIsPaySearchOpen, setIsPayFiltersOpen, setIsPayActionOpen, setIsPayQueueOpen, setIsPayUpcomingOpen, setIsPayPendingOpen,
        setTrkSave, setTrkOpen, setTrkExport, setTrkReady, setTrkPanels,
    ]);

    // A modal dialog: focus moves into it when it opens, Tab stays inside it
    // (the page behind is covered), and focus goes back to the key that
    // opened it (the row's Edit, the header launcher) when it closes. The
    // screen re-takes focus itself when its loading state is replaced by the
    // editor (see EntryScreen's useModalFocus).
    const hostRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!isOpen) return;
        const opener = document.activeElement as HTMLElement | null;
        const dialog = hostRef.current?.querySelector<HTMLElement>('[role="dialog"]');
        if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
        return () => {
            if (opener && opener !== document.body && opener.isConnected && !hostRef.current?.contains(opener)) opener.focus?.();
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const trapTab = (e: React.KeyboardEvent) => {
        const host = hostRef.current;
        if (e.key !== 'Tab' || e.defaultPrevented || !host || !host.contains(e.target as Node)) return;
        const nodes = Array.from(host.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled):not([type="hidden"]):not([hidden]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        )).filter(n => n.offsetParent !== null || n === document.activeElement);
        if (!nodes.length) { e.preventDefault(); return; }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement;
        const dialog = host.querySelector('[role="dialog"]');
        if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    const editId = itemData?.id ? String(itemData.id) : undefined;
    const close = () => {
        setIsOpen(false);
        setItemData({});
    };

    return createPortal(
        <div className="entry-modal" ref={hostRef} onKeyDown={trapTab}>
            <EntryScreen
                key={editId || 'new'}
                variant="modal"
                mode={editId ? 'edit' : 'create'}
                editId={editId}
                editRow={editId ? (itemData as Record<string, any>) : null}
                preset={{
                    vendorId: user?.role === 'Vendor' ? user.name : (itemData?.vendorId ?? (itemData as any)?.vendor_id ?? null),
                    workbook: (itemData as any)?.workbook ?? null,
                }}
                onClose={close}
            />
        </div>,
        document.body,
    );
};
