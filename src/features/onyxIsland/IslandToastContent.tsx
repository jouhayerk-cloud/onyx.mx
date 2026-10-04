import React, { useEffect } from 'react';
import { 
    CheckCircle2, AlertCircle, AlertTriangle, Info, Sparkles, X 
} from 'lucide-react';
import { tr } from '../../lib/i18n';
import type { IslandNotification } from './notify/types';

// A custom toast renderer is app code: if it throws while rendering, show nothing instead of taking the island (and the page) down.
class RenderBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? null : this.props.children; }
}

interface IslandToastContentProps {
    notification: IslandNotification;
    expanded: boolean;
    onToggleExpand: () => void;
    onDismiss: () => void;
}

let timerStyleInjected = false;
function useTimerStyle() {
    useEffect(() => {
        if (!timerStyleInjected && typeof document !== 'undefined') {
            timerStyleInjected = true;
            const style = document.createElement('style');
            style.textContent = `
                @keyframes onyx-toast-timer {
                    from { transform: scaleX(1); }
                    to { transform: scaleX(0); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .onyx-toast-timer-bar { animation: none !important; transform: scaleX(0) !important; }
                }
            `;
            document.head.appendChild(style);
        }
    }, []);
}

export const IslandToastContent: React.FC<IslandToastContentProps> = ({
    notification,
    expanded,
    onToggleExpand,
    onDismiss
}) => {
    useTimerStyle();
    
    const { kind, title, message, count, duration, render, actions, id } = notification;

    const renderIcon = () => {
        const size = 18;
        switch (kind) {
            case 'success': return <CheckCircle2 size={size} color="#34d399" />;
            case 'error': return <AlertCircle size={size} color="#f87171" />;
            case 'warning': return <AlertTriangle size={size} color="#fbbf24" />;
            case 'info': return <Info size={size} color="#60a5fa" />;
            case 'agent': return <Sparkles size={size} color="var(--main-color, #00aeef)" />;
            case 'loading': return (
                <div 
                    style={{ width: size, height: size, borderWidth: 2, borderTopColor: '#a3a3a3', borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent' }} 
                    className="rounded-full animate-spin border-solid"
                />
            );
            default: return <Info size={size} color="#60a5fa" />;
        }
    };

    const handleActionClick = (e: React.MouseEvent, actionOnClick: () => void) => {
        e.stopPropagation();
        actionOnClick();
        onDismiss();
    };

    return (
        <div className="flex flex-col w-full relative min-w-0" onClick={onToggleExpand}>
            <div className="flex items-start gap-3 p-3">
                <div className="shrink-0 mt-0.5">
                    {renderIcon()}
                </div>
                
                <div className="flex-1 min-w-0 flex flex-col justify-center cursor-pointer select-none">
                    {title && (
                        <div className={`text-[13px] font-semibold text-white ${!expanded ? 'truncate' : ''}`}>
                            {title}
                        </div>
                    )}
                    <div className={`text-[13px] text-white/80 ${!expanded ? 'truncate' : 'whitespace-pre-wrap'}`}>
                        {message}
                    </div>
                    {expanded && render && (
                        <div className="mt-2 min-w-0 cursor-default" onClick={e => e.stopPropagation()}>
                            <RenderBoundary>{render({ id, dismiss: onDismiss })}</RenderBoundary>
                        </div>
                    )}
                    {expanded && actions && actions.length > 0 && (
                        <div className="mt-3 flex gap-2 flex-wrap">
                            {actions.slice(0, 2).map((act, i) => (
                                <button
                                    key={i}
                                    onClick={e => handleActionClick(e, act.onClick)}
                                    className="px-3 py-1.5 isl-w10 isl-hw20 text-white rounded-md text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                                >
                                    {act.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {count > 1 && (
                        <span className="text-[11px] font-medium px-1.5 py-0.5 isl-w10 text-white/90 rounded-full">
                            &times;{count}
                        </span>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDismiss();
                        }}
                        aria-label={tr('Dismiss')}
                        className="p-1 -mr-1 rounded-full text-white/50 hover:text-white isl-hw10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
            {typeof duration === 'number' && duration > 0 && (
                <div className="absolute bottom-0 left-3 right-3 h-[2px] isl-w20 origin-left rounded-full overflow-hidden pointer-events-none">
                    <div 
                        className="h-full isl-w50 origin-left onyx-toast-timer-bar"
                        style={{ 
                            animationName: 'onyx-toast-timer',
                            animationDuration: `${duration}ms`,
                            animationTimingFunction: 'linear',
                            animationFillMode: 'forwards'
                        }}
                    />
                </div>
            )}
        </div>
    );
};
