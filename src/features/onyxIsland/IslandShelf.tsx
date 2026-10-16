import React, { useState, useMemo, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Send, Search, Sparkles, X } from 'lucide-react';
import { tr } from '../../lib/i18n';
import { onyxAgentPhaseAtom } from '../onyxAgent/agentState';
import { 
  inventoryAtom, 
  inventorySearchTermAtom, 
  TOP_BAR_SEARCH_ATOM, 
  activeViewAtom 
} from '../../lib/atoms';
import type { InventoryItem } from '../../lib/Types';
import toast from 'react-hot-toast';

interface IslandShelfProps {
  /** "Good afternoon" (already translated) and the name beside it. */
  greeting: string;
  name: string;
  /** Role and page, one line. */
  meta: string;
  /** The totals of the page (inventory: types, quantity, value), the same nodes the panel header shows. */
  figures: React.ReactNode;
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

/** Filters inventory items by query tokens against all searchable fields, supporting spaces (OR), + (AND), and * (wildcards). */
function filterInventoryMatches(items: InventoryItem[], query: string): InventoryItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return items;
  // Space = OR between groups; + = AND within a group; * = wildcard
  const groups = trimmed.split(/\s+/).filter(Boolean);

  return items.filter(item => {
    const d = item.data;
    if (!d) return false;
    const searchStr = [
      String(d.itemId || d.item_id || ''),
      String(d.itemId || d.item_id || '').replace(/[^a-z0-9]/g, ''),
      d.name || '',
      d.shape || '',
      d.material || '',
      d.color || '',
      d.category || '',
      d.description || d.shortDescription || '',
      String(d.price || d.price_mxn || ''),
      String(d.quantity || ''),
      String(item.row || '')
    ].join(' ').toLowerCase();

    return groups.some(group => {
      const tokens = group.split('+').filter(Boolean);
      return tokens.every(t => {
        if (t.includes('*')) {
          const regexStr = t.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
          try {
            return new RegExp(regexStr).test(searchStr);
          } catch {
            return searchStr.includes(t.replace(/\*/g, ''));
          }
        }
        return searchStr.includes(t);
      });
    });
  });
}

/**
 * The deployed island (level 3): Chan as one unified card, the greeting with the totals of the page and an interactive field to
 * live-search the inventory (supporting spaces, +, *), chat with Chan, or both simultaneously (filtering inventory live and feeding matching items to Chan).
 */
export const IslandShelf: React.FC<IslandShelfProps> = ({ greeting, name, meta, figures, onAsk }) => {
  const phase = useAtomValue(onyxAgentPhaseAtom);
  const items = useAtomValue(inventoryAtom);
  const [invSearchTerm, setInventorySearchTerm] = useAtom(inventorySearchTermAtom);
  const [, setTopBarSearch] = useAtom(TOP_BAR_SEARCH_ATOM);
  const [activeView, setActiveView] = useAtom(activeViewAtom);

  const [searchMode, setSearchMode] = useState(true);
  const [chatMode, setChatMode] = useState(true);
  const [text, setText] = useState(() => invSearchTerm || '');

  // Keep text in sync if external component updates inventorySearchTermAtom
  useEffect(() => {
    if (searchMode && invSearchTerm !== text) {
      setText(invSearchTerm);
    }
  }, [invSearchTerm, searchMode]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    if (searchMode) {
      setInventorySearchTerm(val);
      setTopBarSearch(val);
      if (activeView !== 'inventory' && val.trim().length > 0) {
        setActiveView('inventory');
      }
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setText('');
    if (searchMode) {
      setInventorySearchTerm('');
      setTopBarSearch('');
    }
  };

  const toggleSearch = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (searchMode && !chatMode) {
      setChatMode(true);
      setSearchMode(false);
      setInventorySearchTerm('');
      setTopBarSearch('');
    } else {
      const next = !searchMode;
      setSearchMode(next);
      if (next) {
        setInventorySearchTerm(text);
        setTopBarSearch(text);
        if (activeView !== 'inventory' && text.trim().length > 0) {
          setActiveView('inventory');
        }
      } else {
        setInventorySearchTerm('');
        setTopBarSearch('');
      }
    }
  };

  const toggleChat = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (chatMode && !searchMode) {
      setSearchMode(true);
      setChatMode(false);
      setInventorySearchTerm(text);
      setTopBarSearch(text);
    } else {
      setChatMode(!chatMode);
    }
  };

  const placeholderText = useMemo(() => {
    if (searchMode && chatMode) return tr('Search inventory & ask Chan...');
    if (searchMode) return tr('Search inventory items (*, +, space)...');
    return tr('Ask Chan...');
  }, [searchMode, chatMode]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = text.trim();

    if (!query) {
      if (chatMode) onAsk('');
      return;
    }

    // 1. Search-only execution: already live filtered, confirm with notification
    if (searchMode && !chatMode) {
      setInventorySearchTerm(query);
      setTopBarSearch(query);
      if (activeView !== 'inventory') {
        setActiveView('inventory');
      }
      toast.success(tr('Filtering inventory: ') + query);
      return;
    }

    // 2. Chat-only execution
    if (!searchMode && chatMode) {
      onAsk(query);
      setText('');
      return;
    }

    // 3. Both Search and Chat active: Live-filter inventory AND feed matched items to Chan
    setInventorySearchTerm(query);
    setTopBarSearch(query);
    if (activeView !== 'inventory') {
      setActiveView('inventory');
    }

    const matches = filterInventoryMatches(items, query);
    const count = matches.length;

    let enrichedPrompt = query;
    if (count > 0) {
      const sample = matches.slice(0, 8).map((it, idx) => {
        const d = it.data;
        const id = d?.itemId || it.row || `#${idx + 1}`;
        const shape = d?.shape ? `${d.shape}` : '';
        const mat = d?.material ? `[${d.material}]` : '';
        const color = d?.color ? `${d.color}` : '';
        const price = (d?.price || d?.price_mxn) ? `$${d?.price || d?.price_mxn}` : '';
        const qty = d?.quantity ? `Qty: ${d.quantity}` : '';
        return `• [${id}] ${shape} ${mat} ${color} ${qty} ${price}`.trim();
      }).join('\n');

      enrichedPrompt = `${query}\n\n[Inventory Context: ${count} matching item(s) found in inventory]:\n${sample}${count > 8 ? `\n...and ${count - 8} more matching item(s).` : ''}\n\nPlease analyze these matching inventory items and assist with my query.`;
    } else {
      enrichedPrompt = `${query}\n\n[Inventory Context: 0 items in current inventory directly matched "${query}"]\n\nPlease answer the user query based on overall inventory context.`;
    }

    onAsk(enrichedPrompt);
    setText('');
  };

  return (
    <div className="isl-deck" role="group" aria-label={tr('Chan')}>
      <section className="isl-chan" aria-label={tr('Chan')}>
        <div className="isl-chan-top">
          <div className="isl-chan-text">
            <p className="isl-chan-greet">{greeting}, <span className="isl-greet-name">{name}</span></p>
            <p className="isl-chan-meta">{meta} · {tr(PHASE_TEXT[phase] || 'Ready')}</p>
          </div>
          {figures && <div className="isl-chan-figures">{figures}</div>}
        </div>
        <form className="isl-chan-form" onSubmit={submit}>
          <button
            type="button"
            className={`isl-chan-mode-btn isl-chan-mode-search ${searchMode ? 'is-active' : ''}`}
            onClick={toggleSearch}
            aria-pressed={searchMode}
            aria-label={tr('Toggle inventory search')}
            title={searchMode ? tr('Inventory search: ON (Live filtering active)') : tr('Inventory search: OFF (Click to enable)')}
          >
            <Search size={15} aria-hidden="true" />
          </button>

          <div className="isl-chan-input-wrap">
            <input
              className="isl-chan-input"
              type="text"
              value={text}
              onChange={handleInputChange}
              placeholder={placeholderText}
              aria-label={placeholderText}
              autoComplete="off"
            />
            {text.length > 0 && (
              <button
                type="button"
                className="isl-chan-clear-btn"
                onClick={handleClear}
                aria-label={tr('Clear search')}
                title={tr('Clear')}
              >
                <X size={12} strokeWidth={2.5} aria-hidden="true" />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`isl-chan-mode-btn isl-chan-mode-chat ${chatMode ? 'is-active' : ''}`}
            onClick={toggleChat}
            aria-pressed={chatMode}
            aria-label={tr('Toggle Chan chat')}
            title={chatMode ? tr('Chan chat: ON (Click to toggle)') : tr('Chan chat: OFF (Click to toggle)')}
          >
            <Sparkles size={15} aria-hidden="true" />
          </button>

          <button 
            type="submit" 
            className={`isl-chan-send ${searchMode && !chatMode ? 'isl-chan-send--search' : ''}`} 
            aria-label={
              searchMode && chatMode
                ? tr('Search and ask Chan')
                : searchMode
                ? tr('Search inventory')
                : tr('Send to Chan')
            }
            title={
              searchMode && chatMode
                ? tr('Filter inventory and send to Chan')
                : searchMode
                ? tr('Filter inventory table')
                : tr('Send to Chan')
            }
          >
            {searchMode && !chatMode ? (
              <Search size={16} aria-hidden="true" />
            ) : (
              <Send size={16} aria-hidden="true" />
            )}
          </button>
        </form>
      </section>
    </div>
  );
};


