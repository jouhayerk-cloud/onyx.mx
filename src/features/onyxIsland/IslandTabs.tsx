import React, { useRef } from 'react';
import { LayoutGrid, Package, MessageCircle, Bell } from 'lucide-react';
import { tr, trf } from '../../lib/i18n';
import type { IslandPane } from './islandState';

/**
 * The panel's tab bar: where you are, and a way sideways, always visible (design doc 4).
 * Roving tabindex, arrow keys, Home and End, as a WAI-ARIA tablist.
 */

interface TabDef { id: IslandPane; label: string; icon: React.ElementType }

export const IslandTabs: React.FC<{
    value: IslandPane;
    onChange: (pane: IslandPane) => void;
    unread: number;
    /** An item is selected in the list (shows a dot on the Item tab). */
    itemSelected: boolean;
}> = ({ value, onChange, unread, itemSelected }) => {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const tabs: TabDef[] = [
        { id: 'tools', label: tr('Tools'), icon: LayoutGrid },
        { id: 'item', label: tr('Item'), icon: Package },
        { id: 'chat', label: 'Chan', icon: MessageCircle },
        { id: 'notifications', label: tr('Inbox'), icon: Bell },
    ];

    const onKeyDown = (e: React.KeyboardEvent, index: number) => {
        let next = index;
        if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        else return;
        e.preventDefault();
        onChange(tabs[next].id);
        refs.current[next]?.focus();
    };

    return (
        <div role="tablist" aria-label={tr('Island sections')} className="isl-tabs">
            {tabs.map((t, i) => {
                const selected = t.id === value;
                const Icon = t.icon;
                const badge = t.id === 'notifications' ? unread : 0;
                const label = badge > 0 ? trf('{label}, {n} unread', { label: t.label, n: badge }) : t.label;
                return (
                    <button
                        key={t.id}
                        ref={el => { refs.current[i] = el; }}
                        type="button"
                        role="tab"
                        id={`isl-tab-${t.id}`}
                        aria-selected={selected}
                        aria-controls="isl-panel"
                        aria-label={label}
                        tabIndex={selected ? 0 : -1}
                        className={`isl-tab${selected ? ' is-selected' : ''}`}
                        onClick={() => onChange(t.id)}
                        onKeyDown={e => onKeyDown(e, i)}
                    >
                        <Icon size={16} strokeWidth={2} aria-hidden="true" />
                        <span>{t.label}</span>
                        {badge > 0 && <span className="isl-tab-count isl-num" aria-hidden="true">{badge > 9 ? '9+' : badge}</span>}
                        {t.id === 'item' && itemSelected && <span className="isl-dot" aria-hidden="true" />}
                    </button>
                );
            })}
        </div>
    );
};
