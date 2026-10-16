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
    RotateCcw,
    Square,
    Cpu
} from 'lucide-react';
import { useAtom } from 'jotai';
import { islandChanDraftAtom } from '../islandState';
import { useOnyxAgentWiring } from '../../onyxAgent/useOnyxAgentWiring';
import { isCompanionAvailable, isColibriAvailable } from '../../../lib/ai/providers';
import { fetchColibriModels } from '../../../lib/ai/providers/colibri';
import { getRoute, setRoute } from '../../../lib/ai/routing';
import { AI_CONFIG_EVENT, getProviderConfig } from '../../../lib/ai/providerKeys';
import { tr, trf } from '../../../lib/i18n';
import { LaserCutfileCard, LaserCutfileCardProps } from '../../onyxAgent/components/LaserCutfileCard';
import './chanPane.css';

export interface ChanPaneProps {
    view: string;
    onClose: () => void;
}

interface ParsedMessageContent {
    cleanText: string;
    cutfile?: LaserCutfileCardProps;
}

const clampNum = (raw: unknown, fallback: number, min: number, max: number): number => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Builds the card props from JSON found in a model reply. The reply is untrusted (prompt injection can shape it), so
 * only plain numbers and two short identifiers are kept. Model-supplied SVG markup and CLI text are never copied: the
 * card regenerates the SVG and the command locally from these numbers.
 */
function cutfileFromParsed(parsed: any): LaserCutfileCardProps {
    const dims = parsed.dimensionsMm && typeof parsed.dimensionsMm === 'object' ? parsed.dimensionsMm : parsed;
    const generator = String(parsed.generator || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
    const crateId = String(parsed.crateId || parsed.crate_id || '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 40);
    return {
        crateId: crateId || 'Crate',
        dimensionsMm: {
            x: clampNum(dims.x, 600, 10, 5000),
            y: clampNum(dims.y, 600, 10, 5000),
            h: clampNum(dims.h, 400, 10, 5000),
        },
        materialThicknessMm: clampNum(parsed.materialThicknessMm ?? parsed.material_thickness_mm ?? parsed.thickness, 6, 0.5, 30),
        burnMm: clampNum(parsed.burnMm ?? parsed.burn_mm ?? parsed.burn, 0.1, 0.01, 2),
        generator: generator || 'UniversalBox',
        cliCommand: '',   // the card builds the command from the numbers above
    };
}

function extractCutfileFromText(text: string): ParsedMessageContent {
    if (!text) return { cleanText: '' };

    // 1. Check for fenced code block ```(json|cutfile|boxes)? ... ```
    const codeBlockRegex = /```(?:json|cutfile|boxes)?\s*([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
        const raw = match[1].trim();
        try {
            const parsed = JSON.parse(raw);
            if (
                parsed &&
                typeof parsed === 'object' &&
                (parsed.generator || parsed.dimensionsMm || (parsed.crateId && (parsed.x || parsed.dimensionsMm)))
            ) {
                const cleanText = text.replace(match[0], '').trim();
                return { cleanText, cutfile: cutfileFromParsed(parsed) };
            }
        } catch {
            // Not valid JSON in this block
        }
    }

    // 2. Check for inline JSON object with cutfile markers
    const rawJsonRegex = /\{(?:[^{}]|(\{[^{}]*\}))*\}/g;
    let rawMatch: RegExpExecArray | null;
    while ((rawMatch = rawJsonRegex.exec(text)) !== null) {
        const candidate = rawMatch[0].trim();
        if (candidate.includes('dimensionsMm') || (candidate.includes('generator') && candidate.includes('crateId'))) {
            try {
                const parsed = JSON.parse(candidate);
                if (parsed && typeof parsed === 'object' && (parsed.dimensionsMm || parsed.generator)) {
                    const cleanText = text.replace(candidate, '').trim();
                    return { cleanText, cutfile: cutfileFromParsed(parsed) };
                }
            } catch {
                // Not valid cutfile JSON
            }
        }
    }

    return { cleanText: text };
}

/** Chan pane of the island: the conversation with the Onyx agent and its message box. */
export const ChanPane: React.FC<ChanPaneProps> = ({ view, onClose }) => {
    void onClose;
    const wiring = useOnyxAgentWiring();
    const { agent, robot, mirror, setMirror } = wiring;

    const [text, setText] = useState('');
    const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

    const [companionActive, setCompanionActive] = useState(() => {
        return isCompanionAvailable() && getRoute('chat').provider === 'companion';
    });
    const hasCompanion = useMemo(() => isCompanionAvailable(), []);

    const isDesktop = useMemo(() => {
        return typeof navigator !== 'undefined' && !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    }, []);
    const [hasColibri, setHasColibri] = useState(false);
    const [colibriActive, setColibriActive] = useState(() => getRoute('chat').provider === 'colibri');
    const [colibriModel, setColibriModel] = useState<string | null>(null);
    const [colibriNote, setColibriNote] = useState<string | null>(null);

    // Fast health check (two seconds at most): is the local server up, and which model does it have loaded?
    const refreshColibri = React.useCallback(async () => {
        try {
            const cfg = getProviderConfig('colibri');
            const avail = await isColibriAvailable(cfg.baseUrl || undefined);
            setHasColibri(avail);
            setColibriModel(avail ? ((await fetchColibriModels(cfg))?.[0] ?? null) : null);
        } catch {
            setHasColibri(false);
            setColibriModel(null);
        }
    }, []);

    useEffect(() => {
        void refreshColibri();
    }, [refreshColibri]);

    // while Colibri is the chat model, keep the status honest: the daemon can start or stop at any time
    useEffect(() => {
        if (!colibriActive) return;
        const t = setInterval(() => { void refreshColibri(); }, 20000);
        return () => clearInterval(t);
    }, [colibriActive, refreshColibri]);

    const [recentCutfiles, setRecentCutfiles] = useState<Record<string, LaserCutfileCardProps>>({});

    useEffect(() => {
        const handleCutfileGenerated = (e: Event) => {
            const data = (e as CustomEvent<any>).detail;
            if (data && data.crateId) {
                setRecentCutfiles(prev => ({
                    ...prev,
                    [data.crateId]: {
                        crateId: data.crateId,
                        dimensionsMm: data.dimensionsMm,
                        materialThicknessMm: data.materialThicknessMm,
                        burnMm: data.burnMm,
                        generator: data.generator,
                        cliCommand: data.cliCommand,
                        svgSnippet: data.sampleSvgSnippet,
                        fullSvg: data.fullSvg
                    }
                }));
            }
        };

        window.addEventListener('onyx:cutfile-generated', handleCutfileGenerated);
        return () => window.removeEventListener('onyx:cutfile-generated', handleCutfileGenerated);
    }, []);

    useEffect(() => {
        const updateRouteState = () => {
            setCompanionActive(isCompanionAvailable() && getRoute('chat').provider === 'companion');
            setColibriActive(getRoute('chat').provider === 'colibri');
            void refreshColibri();
        };
        window.addEventListener(AI_CONFIG_EVENT, updateRouteState);
        return () => window.removeEventListener(AI_CONFIG_EVENT, updateRouteState);
    }, [refreshColibri]);

    // seconds since the question was sent, so a slow local model does not look frozen
    const [waitedSec, setWaitedSec] = useState(0);
    const waiting = colibriActive && agent.phase === 'thinking';
    useEffect(() => {
        if (!waiting) { setWaitedSec(0); return; }
        const started = Date.now();
        const t = setInterval(() => setWaitedSec(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(t);
    }, [waiting]);

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

    // a message typed in the deployed island starts the conversation as soon as this tab opens
    const [draft, setDraft] = useAtom(islandChanDraftAtom);
    useEffect(() => {
        const first = draft.trim();
        if (!first) return;
        setDraft('');
        if (!agent.busy) agent.send(first); else setText(first);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (agent.pendingConfirm) {
            cancelBtnRef.current?.focus();
        }
    }, [agent.pendingConfirm]);

    const visibleMessages = useMemo(() => {
        return agent.messages.filter(m => m.role !== 'tool' && m.text.trim() !== '');
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
                    {hasCompanion && (
                        <button
                            type="button"
                            className={`chan-local-pill ${companionActive ? 'chan-local-pill--active' : ''}`}
                            title={tr('LiteRT-LM On-Device Model (iPhone 15 Pro)')}
                            onClick={() => {
                                const current = getRoute('chat');
                                setRoute('chat', current.provider === 'companion' ? null : { provider: 'companion', model: 'qwen2.5-1.5b-instruct' });
                            }}
                        >
                            <span className="chan-local-dot" />
                            <span>{companionActive ? 'LiteRT-LM (Qwen 1.5B)' : 'Enable Local SLM'}</span>
                        </button>
                    )}
                    {(hasColibri || isDesktop) && (
                        <button
                            type="button"
                            className={`chan-local-pill ${colibriActive ? 'chan-local-pill--active' : ''}`}
                            title={tr('Colibrì: a local model on this PC (slow, text only)')}
                            onClick={async () => {
                                const current = getRoute('chat');
                                if (current.provider === 'colibri') {
                                    setColibriNote(null);
                                    setRoute('chat', null);
                                    return;
                                }
                                // never switch Chan to a server that is not there: say so and stay on the current model
                                const up = await isColibriAvailable(getProviderConfig('colibri').baseUrl || undefined);
                                setHasColibri(up);
                                if (!up) {
                                    setColibriNote(tr('Colibrì is not running on this PC. Start it, then try again.'));
                                    return;
                                }
                                setColibriNote(null);
                                // 'auto' = the model the server has loaded; the server rejects any other id
                                setRoute('chat', { provider: 'colibri', model: 'auto' });
                            }}
                        >
                            <span className="chan-local-dot" />
                            <span>{colibriActive ? tr('Colibrì (local)') : tr('Use Colibrì')}</span>
                        </button>
                    )}
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

            {/* Local model notice: Colibrì is slow (about half a token per second on this PC) and text only */}
            {(colibriActive || colibriNote) && (
                <div className="chan-local-notice" role="status">
                    <Cpu size={12} aria-hidden="true" />
                    <span>
                        {colibriNote
                            ? colibriNote
                            : !hasColibri
                                ? tr('Colibrì is not running on this PC. Start it, or pick another model.')
                                : `${tr('Local model: replies can take a minute')}${colibriModel ? ` (${colibriModel})` : ''}`}
                    </span>
                </div>
            )}

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
                    visibleMessages.map((m) => {
                        const isUser = m.role === 'user';
                        let cutfileData: LaserCutfileCardProps | undefined;
                        let textToDisplay = m.text;

                        if (!isUser) {
                            const extracted = extractCutfileFromText(m.text);
                            textToDisplay = extracted.cleanText;
                            cutfileData = extracted.cutfile;

                            // Fallback: If no inline cutfile found, check if message refers to recent cutfiles
                            if (!cutfileData) {
                                for (const [cId, cached] of Object.entries(recentCutfiles)) {
                                    if (m.text.toLowerCase().includes(cId.toLowerCase())) {
                                        cutfileData = cached;
                                        break;
                                    }
                                }
                            }
                        }

                        return (
                            <div
                                key={m.id}
                                className={`chan-message-row ${
                                    isUser ? 'chan-message-row--user' : 'chan-message-row--assistant'
                                }`}
                            >
                                <div className={`flex flex-col gap-2 max-w-[94%] sm:max-w-[88%] ${isUser ? 'items-end' : 'items-start'}`}>
                                    {textToDisplay.trim() !== '' && (
                                        <div
                                            className={`chan-bubble ${
                                                isUser ? 'chan-bubble--user' : 'chan-bubble--assistant'
                                            }`}
                                        >
                                            {textToDisplay}
                                        </div>
                                    )}
                                    {cutfileData && (
                                        <LaserCutfileCard
                                            crateId={cutfileData.crateId}
                                            dimensionsMm={cutfileData.dimensionsMm}
                                            materialThicknessMm={cutfileData.materialThicknessMm}
                                            burnMm={cutfileData.burnMm}
                                            generator={cutfileData.generator}
                                            cliCommand={cutfileData.cliCommand}
                                            svgSnippet={cutfileData.svgSnippet}
                                            fullSvg={cutfileData.fullSvg}
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}

                {/* Thinking indicator */}
                {agent.phase === 'thinking' && (
                    <div className="chan-message-row chan-message-row--assistant">
                        <div className="chan-thinking-bubble">
                            <span className="chan-thinking-dot" />
                            <span className="chan-thinking-dot" />
                            <span className="chan-thinking-dot" />
                            <span className="onyx-sr-only">{tr('Chan is thinking')}</span>
                            {colibriActive && (
                                <>
                                    <span className="chan-wait-time isl-num">{trf('{s} s', { s: waitedSec })}</span>
                                    <button
                                        type="button"
                                        onClick={agent.stop}
                                        className="isl-btn chan-stop-btn"
                                        aria-label={tr('Stop')}
                                        title={tr('Stop')}
                                    >
                                        <Square size={12} aria-hidden="true" />
                                        <span>{tr('Stop')}</span>
                                    </button>
                                </>
                            )}
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
