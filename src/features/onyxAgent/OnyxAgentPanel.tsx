import React, { useEffect, useRef, useState } from 'react';
import { OnyxFace } from './face/OnyxFace';
import { useGaze } from './face/useGaze';
import { mapWireExpression, FaceExpression } from './face/expressions';
import { tr } from '../../lib/i18n';
import { 
    X, 
    ChevronRight, 
    Wrench, 
    Map, 
    Bot, 
    AlertTriangle, 
    Check, 
    RotateCcw, 
    Square, 
    Send 
} from 'lucide-react';
import { useOnyxAgent } from './useOnyxAgent';

export interface OnyxAgentPanelProps {
    variant?: 'drawer' | 'page';
    onClose?: () => void;
    agent: ReturnType<typeof useOnyxAgent>;
    robot: {
        canUse: boolean;
        devices: Array<{
            id: string;
            name: string;
            online: boolean;
            expression?: string;
            batteryPct?: number | null;
        }>;
        selectedId: string | null;
        onSelect: (id: string | null) => void;
    };
    mirror: boolean;
    onMirrorChange: (value: boolean) => void;
}

export const OnyxAgentPanel: React.FC<OnyxAgentPanelProps> = ({
    variant = 'drawer',
    onClose,
    agent,
    robot,
    mirror,
    onMirrorChange
}) => {
    const faceRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isNearBottomRef = useRef(true);
    
    const [text, setText] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    
    useGaze(faceRef);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    }, []);

    const onScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    };

    useEffect(() => {
        if (isNearBottomRef.current && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [agent.messages, agent.phase, agent.activity, agent.pendingConfirm]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
    };

    const handleSend = () => {
        if (text.trim() && !agent.busy) {
            agent.send(text);
            setText('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
            e.preventDefault();
            handleSend();
        }
    };

    const selectedRobot = robot.selectedId ? robot.devices.find(d => d.id === robot.selectedId) : null;
    let faceExpression: FaceExpression = 'calm';
    
    if (selectedRobot && selectedRobot.online && selectedRobot.expression) {
        faceExpression = mapWireExpression(selectedRobot.expression);
    } else {
        switch (agent.phase) {
            case 'idle': faceExpression = 'calm'; break;
            case 'listening': faceExpression = 'listening'; break;
            case 'thinking': faceExpression = 'thinking'; break;
            case 'acting': faceExpression = 'alert'; break;
            case 'speaking': faceExpression = 'speaking'; break;
            case 'error': faceExpression = 'error'; break;
            default: faceExpression = 'calm'; break;
        }
    }

    const visibleMessages = agent.messages.filter(m => m.role !== 'tool');

    return (
        <div className={`glass-panel flex flex-col overflow-hidden max-h-full ${variant === 'drawer' ? 'h-full rounded-2xl border-0 sm:border' : 'h-full w-full'}`}>
            {/* 1. HEADER */}
            <div className="flex gap-5 p-5 border-b border-white/5 items-center shrink-0 bg-white/[0.02]">
                <div ref={faceRef} className="shrink-0">
                    <OnyxFace 
                        size={132} 
                        expression={faceExpression} 
                        speakingLevel={agent.phase === 'speaking' ? 0.5 : 0} 
                    />
                </div>
                
                <div className="flex-1 flex flex-col gap-3 min-w-0">
                    <div className="flex justify-between items-start">
                        <h2 className="text-lg font-black tracking-widest text-white/90 uppercase truncate">
                            {tr('Onyx Assistant')}
                        </h2>
                        {variant === 'drawer' && onClose && (
                            <button 
                                onClick={onClose} 
                                aria-label={tr('Close')} 
                                className="p-1 opacity-50 hover:opacity-100 transition-opacity rounded-sm hover:bg-white/10 -mt-1 -mr-1 focus:outline-none"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    {robot.canUse && (
                        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <select
                                    value={robot.selectedId || ''}
                                    onChange={(e) => robot.onSelect(e.target.value || null)}
                                    className="bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-amber-500 max-w-[140px] truncate"
                                    aria-label={tr('Select robot')}
                                >
                                    <option value="">{tr('None')}</option>
                                    {robot.devices.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>

                                {selectedRobot && (
                                    <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider">
                                        <span className="flex h-2.5 w-2.5 relative">
                                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${selectedRobot.online ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                                            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${selectedRobot.online ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                        </span>
                                        <span className="text-white/60">
                                            {selectedRobot.batteryPct != null ? `${selectedRobot.batteryPct}%` : '??%'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between text-xs">
                                <span 
                                    className="font-bold uppercase tracking-widest text-white/50 select-none cursor-pointer" 
                                    onClick={() => { if(selectedRobot && selectedRobot.online) onMirrorChange(!mirror); }}
                                >
                                    {tr('Mirror to robot')}
                                </span>
                                <button
                                    role="switch"
                                    aria-checked={mirror}
                                    disabled={!selectedRobot || !selectedRobot.online}
                                    onClick={() => onMirrorChange(!mirror)}
                                    className={`w-9 h-5 rounded-full relative transition-colors border border-white/10 ${mirror ? 'bg-amber-500 border-amber-400' : 'bg-black/30'} ${(!selectedRobot || !selectedRobot.online) ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
                                >
                                    <span className={`absolute top-[1px] left-[1px] w-4 h-4 rounded-full bg-white transition-transform ${mirror ? 'translate-x-4' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* 2. CHAT AREA */}
            <div className={`flex-1 overflow-hidden relative flex flex-col ${variant === 'page' ? 'items-center bg-black/20' : ''}`}>
                <div 
                    ref={scrollRef}
                    onScroll={onScroll}
                    className={`h-full w-full overflow-y-auto custom-scrollbar p-5 flex flex-col gap-6 ${variant === 'page' ? 'max-w-3xl' : ''}`}
                >
                    {visibleMessages.length === 0 && (
                        <div className="my-auto flex flex-col gap-3 items-center text-center opacity-70">
                            <p className="text-sm font-bold tracking-widest uppercase mb-2">{tr('How can I help you today?')}</p>
                            <button onClick={() => agent.send(tr('Summarise today\'s inventory'))} className="bg-white/5 text-xs px-4 py-2 rounded-full hover:bg-white/10 transition-colors border border-white/10 w-full max-w-xs">{tr('Summarise today\'s inventory')}</button>
                            <button onClick={() => agent.send(tr('Open the finance view'))} className="bg-white/5 text-xs px-4 py-2 rounded-full hover:bg-white/10 transition-colors border border-white/10 w-full max-w-xs">{tr('Open the finance view')}</button>
                            <button onClick={() => agent.send(tr('Say hello on the robot'))} className="bg-white/5 text-xs px-4 py-2 rounded-full hover:bg-white/10 transition-colors border border-white/10 w-full max-w-xs">{tr('Say hello on the robot')}</button>
                        </div>
                    )}
                    
                    <div role="log" aria-live="polite" className="flex flex-col gap-4">
                        {visibleMessages.map((m) => (
                            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                                    m.role === 'user' 
                                        ? 'bg-white/[0.08] border border-white/10 text-white/90 rounded-tr-sm' 
                                        : 'bg-black/30 border border-white/5 text-white/80 rounded-tl-sm'
                                }`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        
                        {agent.phase === 'thinking' && (
                            <div className="flex justify-start">
                                <div className="max-w-[90%] rounded-2xl rounded-tl-sm px-4 py-4 bg-black/30 border border-white/5 flex items-center gap-1.5 opacity-60">
                                    <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {agent.error && (
                        <div role="alert" className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-bold tracking-wide uppercase mt-2">
                            {agent.error}
                        </div>
                    )}
                    
                    {/* 3. CONFIRM CARD */}
                    {agent.pendingConfirm && (
                        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl mt-2 shadow-lg backdrop-blur-md">
                            <div className="font-bold text-[13px] mb-4 text-amber-100">{agent.pendingConfirm.summary}</div>
                            <div className="flex gap-3 justify-end">
                                <button 
                                    className="px-4 py-1.5 rounded bg-black/30 hover:bg-black/50 text-white/70 transition-colors text-xs font-bold uppercase tracking-wider" 
                                    onClick={() => agent.confirm(agent.pendingConfirm!.id, false)}
                                >
                                    {tr('Decline')}
                                </button>
                                <button 
                                    className="px-4 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/30 text-amber-400 transition-colors text-xs font-bold uppercase tracking-wider" 
                                    onClick={() => agent.confirm(agent.pendingConfirm!.id, true)}
                                >
                                    {tr('Approve')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* 4. ACTIVITY */}
            {agent.activity.length > 0 && (
                <div className="border-t border-white/5 shrink-0 px-4 py-1 bg-white/[0.01]">
                    <details className="group">
                        <summary className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 cursor-pointer list-none flex items-center gap-2 p-2 hover:opacity-100 transition-opacity select-none focus:outline-none">
                            <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                            {tr('What I did')}
                        </summary>
                        <div className="flex flex-col gap-1.5 mt-1 mb-3 px-2 max-h-[120px] overflow-y-auto custom-scrollbar">
                            {[...agent.activity].reverse().slice(0, 8).map(act => (
                                <div key={act.id} className="flex items-center gap-2 text-[11px] bg-black/20 px-2.5 py-1.5 rounded-lg border border-white/5 text-white/60">
                                    <span className="opacity-40 font-mono text-[9px] mr-1">
                                        {new Date(act.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {act.kind === 'tool' && <Wrench size={12} className="opacity-50" />}
                                    {act.kind === 'navigate' && <Map size={12} className="opacity-50" />}
                                    {act.kind === 'robot' && <Bot size={12} className="opacity-50" />}
                                    {act.kind === 'error' && <AlertTriangle size={12} className="text-red-400 opacity-80" />}
                                    
                                    <span className="flex-1 font-mono truncate" title={act.label}>{act.label}</span>
                                    
                                    {act.ok ? (
                                        <Check size={12} className="text-emerald-500 opacity-80" />
                                    ) : (
                                        <X size={12} className="text-rose-500 opacity-80" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </details>
                </div>
            )}
            
            {/* 5. COMPOSER */}
            <div className={`p-4 border-t border-white/5 shrink-0 bg-white/[0.02] ${variant === 'page' ? 'flex justify-center' : ''}`}>
                <div className={`flex gap-3 items-end w-full ${variant === 'page' ? 'max-w-3xl' : ''}`}>
                    <button 
                        onClick={agent.reset}
                        aria-label={tr('Reset conversation')}
                        className="p-2 mb-[3px] rounded-full opacity-40 hover:opacity-100 hover:bg-white/10 transition-colors focus:outline-none focus:ring-1 focus:ring-white/20"
                    >
                        <RotateCcw size={18} />
                    </button>
                    
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        onCompositionStart={() => setIsComposing(true)}
                        onCompositionEnd={() => setIsComposing(false)}
                        placeholder={tr('Type a message...')}
                        className="flex-1 bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-[13px] resize-none custom-scrollbar focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500/50 min-h-[46px] max-h-[120px]"
                        rows={1}
                    />
                    
                    {agent.busy ? (
                        <button 
                            onClick={agent.stop}
                            aria-label={tr('Stop')}
                            className="p-[11px] mb-[1px] rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/30 hover:bg-rose-500/30 transition-colors focus:outline-none"
                        >
                            <Square size={16} fill="currentColor" />
                        </button>
                    ) : (
                        <button 
                            onClick={handleSend}
                            disabled={!text.trim()}
                            aria-label={tr('Send message')}
                            className="p-[11px] mb-[1px] rounded-full bg-amber-500 text-black border border-amber-600 hover:bg-amber-400 transition-colors disabled:opacity-20 disabled:bg-white/10 disabled:text-white/30 disabled:border-transparent disabled:cursor-not-allowed focus:outline-none"
                        >
                            <Send size={16} className={text.trim() ? "translate-x-[1px] -translate-y-[1px]" : ""} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
