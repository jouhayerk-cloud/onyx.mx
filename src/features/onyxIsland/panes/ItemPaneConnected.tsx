import React, { useEffect, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { SelectedItemDataAtom, isDetailsPanelOpenAtom, inventorySearchTermAtom, activeViewAtom } from '../../../lib/atoms';
import { getCleanImageUrl } from '../../../lib/utils';
import { describeAxoIcon, getAxoIcon } from '../../../lib/axoIconCache';
import { tr, trf } from '../../../lib/i18n';
import toast from '../notify/toast';
import { islandModeAtom, islandItemAtom } from '../islandState';
import { ItemPane } from './ItemPane';

/**
 * The Item tab: the inventory row the user selected (SelectedItemDataAtom), with its first photo or, when it has none,
 * its axonometric icon (the stored link, else rendered through the shared cache). Pure ItemPane underneath.
 */
export const ItemPaneConnected: React.FC = () => {
    const listItem = useAtomValue(islandItemAtom);
    const selected = useAtomValue(SelectedItemDataAtom);
    const item = listItem ?? selected;
    const setDetailsOpen = useSetAtom(isDetailsPanelOpenAtom);
    const setSearch = useSetAtom(inventorySearchTermAtom);
    const setView = useSetAtom(activeViewAtom);
    const setMode = useSetAtom(islandModeAtom);

    const photoUrl = useMemo(() => {
        const first = item?.mediaUrls ? item.mediaUrls.split(',').map(u => u.trim()).filter(Boolean)[0] : '';
        return first ? getCleanImageUrl(first) : null;
    }, [item?.mediaUrls]);

    const storedIcon = useMemo(() => {
        const raw = (item as { axo_icon_url?: string; axoIconUrl?: string } | null);
        const link = raw?.axo_icon_url || raw?.axoIconUrl;
        return link ? getCleanImageUrl(link) : null;
    }, [item]);

    const [renderedIcon, setRenderedIcon] = useState<string | null>(null);
    useEffect(() => {
        setRenderedIcon(null);
        if (!item || photoUrl || storedIcon) return;   // only an item with nothing else to show needs a rendered icon
        let alive = true;
        getAxoIcon(describeAxoIcon(item)).then(url => { if (alive) setRenderedIcon(url); }).catch(() => { /* the pane shows its placeholder */ });
        return () => { alive = false; };
    }, [item, photoUrl, storedIcon]);

    const tag = String(item?.itemId || item?.itemNumber || '').trim();

    return (
        <ItemPane
            item={item}
            photoUrl={photoUrl}
            iconUrl={storedIcon || renderedIcon}
            onOpenDetails={() => { setDetailsOpen(true); setMode('rest'); }}
            onCopyTag={() => {
                if (!tag) return;
                navigator.clipboard?.writeText(tag).then(
                    () => toast.success(trf('Copied {tag}', { tag })),
                    () => toast.error(tr('Could not copy the tag')),
                );
            }}
            onShowInList={() => { if (tag) setSearch(tag); setView('inventory'); setMode('rest'); }}
        />
    );
};
