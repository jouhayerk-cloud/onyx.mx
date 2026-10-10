import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
    Send, 
    Wrench, 
    Map, 
    Bot, 
    AlertTriangle, 
    AlertCircle, 
    Check, 
    X, 
    ChevronRight, 
    RotateCcw 
} from 'lucide-react';
import { useOnyxAgentWiring } from '../../onyxAgent/useOnyxAgentWiring';
import { tr } from '../../../lib/i18n';
import './chanPane.css';

export interface ChanPaneProps {
    view: string;
    onClose: () => void;
}

/** Chan pane of the island: the conversation with the Onyx agent and its message box. */
export const ChanPane: React.FC<ChanPaneProps> = ({ view, onClose }) => {
    void onClose;
    const wiring = useOnyxAgentWiring();
    const { agent, robot, mirror, setMirror } = wiring;

    const [text, setText] = useState('');
    const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

    const scrollRef = useRef<HTMLDivElement>(null);
    const isNearBottomRef = useRef(true);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const cancelBtnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    useEffect(() => {
        if (agent.pendingConfirm) {
            cancelBtnRef.current?.focus();
        }
    }, [agent.pendingConfirm]);

    const visibleMessages = useMemo(() => {
        return agent.messages.filter(m => m.role !== 'tool');
    }, [agent.messages]);

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    };

    useEffect(() => {
        if (isNearBottomRef.current && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [visibleMessages, agent.phase, agent.pendingConfirm, agent.error]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
    };

    const handleSend = () => {
        const trimmed = text.trim();
        if (trimmed && !agent.busy) {
            agent.send(trimmed);
            setText('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleChipClick = (chipText: string) => {
        if (!agent.busy) {
            agent.send(tr(chipText));
        }
    };

    const statusInfo = useMemo(() => {
        if (!isOnline || agent.phase === 'error') {
            return { label: tr('Offline'), dotClass: 'chan-status-dot--offline' };
        }
        switch (agent.phase) {
            case 'thinking':
                return { label: tr('Thinking'), dotClass: 'chan-status-dot--thinking' };
            case 'acting':
            case 'speaking':
                return { label: tr('Working'), dotClass: 'chan-status-dot--working' };
            case 'idle':
            case 'listening':
            default:
                return { label: tr('Ready'), dotClass: 'chan-status-dot--ready' };
        }
    }, [isOnline, agent.phase]);

    const suggestionChips = useMemo(() => {
        const v = (view || '').toLowerCase();
        if (v === 'inventory') {
            return [
                "Summarise today's inventory",
                "Which pieces have no photo?"
            ];
        }
        if (v === 'finance') {
            return [
                "Open the finance view",
                "Summarise pending payments"
            ];
        }
        if (v === 'trucking' || v === 'warehouse') {
            return [
                "Summarise the next shipment"
            ];
        }
        return [
            "Summarise today's inventory",
            "Open the finance view",
            "Say hello on the robot"
        ];
    }, [view]);

    const hasRobots = Boolean(robot.canUse && robot.devices && robot.devices.length > 0);
    const selectedRobot = robot.selectedId
        ? robot.devices.find(d => d.id === robot.selectedId)
        : (robot.devices.find(d => d.online) ?? null);
    const isRobotOnline = Boolean(selectedRobot?.online);

    return (
        <div className="chan-pane isl-pane">
            {/* (1) STATUS LINE */}
            <div className="chan-status-bar">
                <div className="chan-status-left">
                    <span className={`chan-status-dot ${statusInfo.dotClass}`} aria-hidden="true" />
                    <span className="chan-status-text">{statusInfo.label}</span>
                </div>
                {hasRobots && (
                    <div className="chan-status-right">
                        <select
                            value={robot.selectedId || ''}
                            onChange={(e) => robot.onSelect(e.target.value || null)}
                            aria-label={tr('Robot')}
                            className="chan-robot-select"
                        >
                            <option value="">{tr('None')}</option>
                            {robot.devices.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={mirror}
                            disabled={!isRobotOnline}
                            title={!isRobotOnline ? tr('No robot is online') : tr('Mirror to robot')}
                            onClick={() => setMirror(!mirror)}
                            className={`isl-btn chan-switch-btn ${mirror && isRobotOnline ? 'chan-switch-btn--checked' : ''}`}
                        >
                            <span
                                className={`chan-switch-dot ${mirror && isRobotOnline ? 'chan-switch-dot--checked' : ''}`}
                                aria-hidden="true"
                            />
                            <span>{tr('Mirror to robot')}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* (2) CONVERSATION & (3) HELPER CENTRE & (4) PENDING CONFIRM & (5) ERROR */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                role="log"
                aria-live="polite"
                className="chan-conversation-area custom-scrollbar"
            >
                {visibleMessages.length === 0 ? (
                    /* (3) HELPER CENTRE */
                    <div className="chan-helper-centre">
                        <div className="chan-helper-header">
                            <h3 className="chan-helper-title">{tr('How can I help?')}</h3>
                            <p className="chan-helper-caption">
                                {tr('Chan can read this page and run tools you confirm.')}
                            </p>
                        </div>

                        <div className="chan-chips-wrap">
                            {suggestionChips.map((chipText) => (
                                <button
                                    key={chipText}
                                    type="button"
                                    onClick={() => handleChipClick(chipText)}
                                    className="isl-btn chan-chip"
                                >
                                    {tr(chipText)}
                                </button>
                            ))}
                        </div>

                        <details className="chan-disclosure">
                            <summary className="chan-disclosure-summary isl-caption">
                                <ChevronRight size={12} className="chan-disclosure-chevron" aria-hidden="true" />
                                <span>{tr('What can Chan do here?')}</span>
                            </summary>
                            <div className="chan-disclosure-body">
                                <ul className="chan-disclosure-list">
                                    <li>{tr('Read page context and answer questions')}</li>
                                    <li>{tr('Search items and navigate between views')}</li>
                                </ul>
                                <p className="isl-caption chan-disclosure-note">
                                    {tr('Chan asks before it changes anything.')}
                                </p>
                            </div>
                        </details>
                    </div>
                ) : (
                    visibleMessages.map((m) => (
                        <div
                            key={m.id}
                            className={`chan-message-row ${
                                m.role === 'user' ? 'chan-message-row--user' : 'chan-message-row--assistant'
                            }`}
                        >
                            <div
                                className={`chan-bubble ${
                                    m.role === 'user' ? 'chan-bubble--user' : 'chan-bubble--assistant'
                                }`}
                            >
                                {m.text}
                            </div>
                        </div>
                    ))
                )}

                {/* Thinking indicator */}
                {agent.phase === 'thinking' && (
                    <div className="chan-message-row chan-message-row--assistant">
                        <div className="chan-thinking-bubble">
                            <span className="chan-thinking-dot" />
                            <span className="chan-thinking-dot" />
                            <span className="chan-thinking-dot" />
                            <span className="onyx-sr-only">{tr('Chan is thinking')}</span>
                        </div>
                    </div>
                )}

                {/* (5) ERROR */}
                {agent.error && (
                    <div role="alert" className="chan-error">
                        <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
                        <span>{agent.error}</span>
                    </div>
                )}

                {/* (4) PENDING CONFIRMATION CARD */}
                {agent.pendingConfirm && (
                    <div
                        role="group"
                        aria-label={tr('Confirm action')}
                        className="chan-confirm-card isl-row"
                    >
                        <div className="chan-confirm-summary">{agent.pendingConfirm.summary}</div>
                        <div className="chan-confirm-actions">
                            <button
                                ref={cancelBtnRef}
                                type="button"
                                onClick={() => agent.confirm(agent.pendingConfirm!.id, false)}
                                className="isl-btn"
                            >
                                {tr('Cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={() => agent.confirm(agent.pendingConfirm!.id, true)}
                                className="isl-btn isl-btn--primary"
                            >
                                {tr('Confirm')}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* (7) ACTION LOG */}
            {agent.activity.length > 0 && (
                <details className="chan-activity-details">
                    <summary className="chan-activity-summary isl-caption">
                        <ChevronRight size={12} className="chan-disclosure-chevron" aria-hidden="true" />
                        <span>{tr('Recent actions')}</span>
                        <span className="isl-num">({agent.activity.length})</span>
                    </summary>
                    <div className="chan-activity-list custom-scrollbar">
                        {[...agent.activity].reverse().slice(0, 10).map((act) => (
                            <div key={act.id} className="chan-activity-row">
                                <span className="isl-caption isl-num chan-activity-time">
                                    {new Date(act.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="chan-activity-icon" aria-hidden="true">
                                    {act.kind === 'tool' && <Wrench size={12} />}
                                    {act.kind === 'navigate' && <Map size={12} />}
                                    {act.kind === 'robot' && <Bot size={12} />}
                                    {act.kind !== 'tool' && act.kind !== 'navigate' && act.kind !== 'robot' && <AlertTriangle size={12} />}
                                </span>
                                <span className="chan-activity-label" title={act.label}>
                                    {act.label}
                                </span>
                                <span className="chan-activity-status" aria-hidden="true">
                                    {act.ok ? (
                                        <Check size={12} style={{ color: 'var(--isl-ok)' }} />
                                    ) : (
                                        <X size={12} style={{ color: 'var(--isl-err)' }} />
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {/* (6) COMPOSER */}
            <div className="chan-composer">
                {visibleMessages.length > 0 && (
                    <button
                        type="button"
                        onClick={agent.reset}
                        aria-label={tr('Reset conversation')}
                        title={tr('Reset conversation')}
                        className="isl-btn chan-reset-btn"
                    >
                        <RotateCcw size={16} aria-hidden="true" />
                    </button>
                )}
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={text}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    aria-label={tr('Message Chan')}
                    placeholder={tr('Ask Chan...')}
                    className="chan-textarea"
                />
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={!text.trim() || agent.busy}
                    aria-label={tr('Send')}
                    className="isl-btn isl-btn--primary chan-send-btn"
                >
                    <Send size={16} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};
