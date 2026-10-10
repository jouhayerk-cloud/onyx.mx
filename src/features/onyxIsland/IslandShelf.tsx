import React, { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Bell, Send } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { onyxAgentPhaseAtom } from '../onyxAgent/agentState';
import { useIslandNotifications } from './notify/store';
import type { IslandPane } from './islandState';

interface IslandShelfProps {
  /** "Good afternoon" (already translated) and the name beside it. */
  greeting: string;
  name: string;
  /** Role and page, one line. */
  meta: string;
  /** The totals of the page (inventory: types, quantity, value), the same nodes the panel header shows. */
  figures: React.ReactNode;
  /** Opens the full panel on the given tab. */
  onOpenPane: (pane: IslandPane) => void;
  /** Starts the full Chan conversation with the typed message (an empty message just opens Chan). */
  onAsk: (text: string) => void;
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
 * The deployed island (level 3). Left: Chan as one unified card, the greeting with the totals of the page and a field
 * to start the full conversation. Right: the latest notifications. The tools stay in the dock row above.
 */
export const IslandShelf: React.FC<IslandShelfProps> = ({ greeting, name, meta, figures, onOpenPane, onAsk }) => {
  const phase = useAtomValue(onyxAgentPhaseAtom);
  const { history, unread } = useIslandNotifications();
  const [text, setText] = useState('');

  const latest = useMemo(
    () => [...history].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3),
    [history],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onAsk(text.trim());
    setText('');
  };

  return (
    <div className="isl-deck" role="group" aria-label={tr('Chan and notifications')}>
      <section className="isl-chan" aria-label={tr('Chan')}>
        <div className="isl-chan-top">
          <div className="isl-chan-text">
            <p className="isl-chan-greet">{greeting}, <span className="isl-greet-name">{name}</span></p>
            <p className="isl-chan-meta">{meta} · {tr(PHASE_TEXT[phase] || 'Ready')}</p>
          </div>
          {figures && <div className="isl-chan-figures">{figures}</div>}
        </div>
        <form className="isl-chan-form" onSubmit={submit}>
          <input
            className="isl-chan-input"
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={tr('Ask Chan...')}
            aria-label={tr('Message to Chan')}
            autoComplete="off"
          />
          <button type="submit" className="isl-chan-send" aria-label={tr('Send to Chan')}>
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
      </section>

      <button type="button" className="isl-deck-card" onClick={() => onOpenPane('notifications')}>
        <span className="isl-deck-head">
          <Bell size={18} aria-hidden="true" />{tr('Notifications')}
          {unread > 0 && <span className="isl-deck-badge">{unread}</span>}
        </span>
        {latest.length === 0
          ? <span className="isl-deck-line isl-deck-dim">{tr('No notifications')}</span>
          : latest.map(n => <span key={n.id} className="isl-deck-line">{n.title ? `${n.title}: ${n.message}` : n.message}</span>)}
      </button>
    </div>
  );
};
