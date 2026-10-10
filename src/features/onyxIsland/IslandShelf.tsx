import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { MessageCircle, Bell, Package } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { SelectedItemDataAtom } from '../../lib/atoms';
import { onyxAgentPhaseAtom } from '../onyxAgent/agentState';
import { useIslandNotifications } from './notify/store';
import { islandItemAtom, type IslandPane } from './islandState';

interface IslandShelfProps {
  /** Opens the full panel on the given tab. */
  onOpenPane: (pane: IslandPane) => void;
}

const PHASE_TEXT: Record<string, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  acting: 'Working',
  speaking: 'Answering',
  error: 'Something went wrong',
};

/**
 * The deployed island (level 3): three cards under the dock row and nothing else. Chan (the assistant), the
 * notifications and the details of the selected item. A card opens the full panel on its tab. The tools stay in the
 * dock row above.
 */
export const IslandShelf: React.FC<IslandShelfProps> = ({ onOpenPane }) => {
  const phase = useAtomValue(onyxAgentPhaseAtom);
  const { history, unread } = useIslandNotifications();
  const listItem = useAtomValue(islandItemAtom);
  const stored = useAtomValue(SelectedItemDataAtom);
  const item = (listItem ?? stored) as unknown as Record<string, unknown> | null;

  const latest = useMemo(
    () => [...history].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3),
    [history],
  );

  const text = (key: string): string => String(item?.[key] ?? '').trim();
  const itemTitle = [text('shape'), text('shortDescription') || text('short_description')].filter(Boolean).join(' · ') || text('name');
  const itemMaterial = [text('material'), text('color')].filter(Boolean).join(' · ');
  const dims = [text('widthCm'), text('heightCm'), text('lengthCm')].filter(Boolean);
  const itemSize = dims.length > 0 ? `${dims.join(' x ')} cm` : '';
  const priceNumber = Number(text('price'));
  const itemPrice = Number.isFinite(priceNumber) && text('price') !== '' ? `$${priceNumber.toLocaleString()}` : '';
  const itemId = text('itemId') || text('item_id') || text('tag_id');

  return (
    <div className="isl-deck" role="group" aria-label={tr('Chan, notifications and details')}>
      <button type="button" className="isl-deck-card" onClick={() => onOpenPane('chat')}>
        <span className="isl-deck-head"><MessageCircle size={18} aria-hidden="true" />{tr('Chan')}</span>
        <span className="isl-deck-line">{tr(PHASE_TEXT[phase] || 'Ready')}</span>
        <span className="isl-deck-line isl-deck-dim">{tr('Ask Chan about this page')}</span>
      </button>

      <button type="button" className="isl-deck-card" onClick={() => onOpenPane('notifications')}>
        <span className="isl-deck-head">
          <Bell size={18} aria-hidden="true" />{tr('Notifications')}
          {unread > 0 && <span className="isl-deck-badge">{unread}</span>}
        </span>
        {latest.length === 0
          ? <span className="isl-deck-line isl-deck-dim">{tr('No notifications')}</span>
          : latest.map(n => <span key={n.id} className="isl-deck-line">{n.title ? `${n.title}: ${n.message}` : n.message}</span>)}
      </button>

      <button type="button" className="isl-deck-card" onClick={() => onOpenPane('item')}>
        <span className="isl-deck-head"><Package size={18} aria-hidden="true" />{tr('Details')}</span>
        {item ? (
          <>
            <span className="isl-deck-line">{[itemId, itemTitle].filter(Boolean).join(' · ')}</span>
            {itemMaterial && <span className="isl-deck-line">{itemMaterial}</span>}
            {(itemSize || itemPrice) && <span className="isl-deck-line">{[itemSize, itemPrice].filter(Boolean).join(' · ')}</span>}
          </>
        ) : (
          <span className="isl-deck-line isl-deck-dim">{tr('Select an item in the list')}</span>
        )}
      </button>
    </div>
  );
};
