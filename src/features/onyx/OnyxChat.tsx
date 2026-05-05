
import React, { useState, useRef, useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { 
    onyxMessagesAtom, 
    onyxApiKeyAtom, 
    inventoryArtifactConfigAtom, 
    paymentsArtifactConfigAtom, 
    sentTruckIdAtom,
    languageAtom,
    onyxIsListeningAtom,
    onyxRequestSendAtom
} from '../../lib/atoms';
import { onyxToolDefinitions, onyxToolHandlers } from './onyxTools';
import { Bot, Send, Brain, Key, Eye, EyeOff, AlertCircle, Mic, MicOff, Volume2, Package, CreditCard, Truck, Languages, Layout, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// ── Shared Logic Hook ───────────────────────────────────────────────────
export function useOnyx(props: {
    onProcessingChange: (proc: boolean) => void;
    onTranscriptChange?: (text: string) => void;
    onVendorDetect?: (color: string) => void;
    onVolumeChange?: (volume: number) => void;
}) {
    const { onProcessingChange, onTranscriptChange, onVendorDetect, onVolumeChange } = props;
    const [messages, setMessages] = useAtom(onyxMessagesAtom);
    const [userApiKey, setUserApiKey] = useAtom(onyxApiKeyAtom);
    const [appLanguage] = useAtom(languageAtom);
    const setInventoryConfig = useSetAtom(inventoryArtifactConfigAtom);
    const setPaymentsConfig = useSetAtom(paymentsArtifactConfigAtom);
    const setTruckId = useSetAtom(sentTruckIdAtom);

    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isListening, setIsListening] = useAtom(onyxIsListeningAtom);
    const [lastError, setLastError] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    
    const recognitionRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const inputRef = useRef('');
    const isListeningRef = useRef(false);

    useEffect(() => { inputRef.current = input; }, [input]);
    useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

    const streamRef = useRef<MediaStream | null>(null);

    const getApiKey = () => {
        const key = userApiKey || localStorage.getItem('ONYX_GEMINI_KEY') || (import.meta as any).env.VITE_GEMINI_API_KEY || '';
        return String(key).trim().replace(/['"]/g, '');
    };

    const getBestVoice = (lang: 'en' | 'es') => {
        const voices = window.speechSynthesis.getVoices();
        if (!voices.length) return null;
        const targetLocale = lang === 'es' ? 'es-' : 'en-';
        const matches = voices.filter(v => v.lang.startsWith(targetLocale));
        return matches.find(v => v.name.includes('Natural')) || matches.find(v => v.name.includes('Google')) || matches[0] || null;
    };

    useEffect(() => {
        const handleVoices = () => {
            // Just trigger a re-render or voice check if needed
            getBestVoice(appLanguage);
        };
        window.speechSynthesis.addEventListener('voiceschanged', handleVoices);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoices);
    }, [appLanguage]);

    // Mobile TTS Unlock: Aggressive version for iOS/Safari
    const unlockTTS = () => {
        const utt = new SpeechSynthesisUtterance(' ');
        utt.volume = 0.01; // Tiny volume to count as speech
        window.speechSynthesis.speak(utt);
    };

    const checkForVendor = (text: string) => {
        if (!onVendorDetect) return;
        const lower = text.toLowerCase();
        const vendorMap: Record<string, string> = {
            'emmanuel': '#00AEEF', 'gerardo': '#F7941D', 'jose': '#6BCEBB', 'carlos': '#85C1E9',
            'angel': '#FFED00', 'susana': '#B19CD9', 'tellez': '#FFCB05', 'delfino': '#8DC63F',
            'maria': '#F9A17A', 'fountain': '#F36F21', 'eduardo': '#636466', 'alejandro': '#800020',
            'bernardo': '#603913', 'roberto': '#00A591', 'gift': '#D11C7E', 'cantera': '#A01E5D'
        };
        for (const [name, color] of Object.entries(vendorMap)) {
            if (lower.includes(name)) { onVendorDetect(color); break; }
        }
    };

    const callGemini = async (apiKey: string, model: string, contents: any[], tools?: any[]) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const sys = `You are Onyx Intelligence, a sentient warehouse asset discovery engine. Respond in ${appLanguage === 'es' ? 'SPANISH' : 'ENGLISH'}.
CRITICAL IDENTIFIER RULE: You MUST ONLY use the 'book_barcode' (Tag ID) for asset identification in dialogue (e.g., DH3261HFNN). However, when deploying artifacts via 'deploy_inventory_artifact', you MUST use the database 'id' field if available to ensure reliable manifest resolution. 
Real items (Fluorite) = 65. Deploy artifacts for all inventory lookups.`;
        const payload: any = { contents, system_instruction: { parts: [{ text: sys }] } };
        if (tools) payload.tools = [{ function_declarations: tools }];
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${res.status}`);
        }
        return await res.json();
    };

    const sendMessage = async (overrideInput?: string) => {
        const finalInput = overrideInput || input;
        if (!finalInput.trim() || isTyping) return;
        const apiKey = getApiKey();
        if (!apiKey) {
            setLastError("Neural link credentials missing.");
            return;
        }
        setLastError(null);
        setMessages(prev => [...prev, { role: 'user', content: finalInput }]);
        setInput('');
        setIsTyping(true);
        onProcessingChange(true);
        checkForVendor(finalInput);
        try {
            let contents = messages.filter(m => m.content?.trim()).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
            contents.push({ role: 'user', parts: [{ text: finalInput }] });

            const modelsToTry = [
                ...availableModels.filter(m => m.includes('2.5') || m.includes('2.0')),
                "gemini-2.5-flash",
                "gemini-2.0-flash",
                "gemini-1.5-flash"
            ];
            const uniqueModels = Array.from(new Set(modelsToTry));
            
            let resp = null;
            let used = "";
            let lastAttemptError = "";
            
            for (const m of uniqueModels) {
                try { 
                    resp = await callGemini(apiKey, m, contents, onyxToolDefinitions); 
                    used = m; 
                    break; 
                } catch (e: any) {
                    lastAttemptError = e.message;
                    console.error(`Neural Link [${m}] failed:`, e.message);
                }
            }
            
            if (!resp) {
                const isInvalidKey = lastAttemptError.toLowerCase().includes('key') || lastAttemptError.includes('404') || lastAttemptError.includes('API_KEY_INVALID');
                throw new Error(isInvalidKey ? "Neural Link Denied. Verify API credentials in settings." : (lastAttemptError || "Neural core unreachable."));
            }
            
            let iter = 0;
            while (iter < 5) {
                const parts = resp.candidates?.[0]?.content?.parts || [];
                const calls = parts.filter((p: any) => p.functionCall);
                const text = parts.find((p: any) => p.text)?.text;
                if (calls.length === 0) {
                    if (text) {
                        setMessages(prev => [...prev, { role: 'model', content: text }]);
                        const utt = new SpeechSynthesisUtterance(text);
                        utt.lang = appLanguage === 'es' ? 'es-MX' : 'en-US';
                        utt.voice = getBestVoice(appLanguage);
                        utt.onstart = () => { (utt as any)._p = setInterval(() => onVolumeChange?.(0.3 + Math.random() * 0.4), 50); };
                        utt.onend = () => { clearInterval((utt as any)._p); onVolumeChange?.(0); };
                        window.speechSynthesis.speak(utt);
                    }
                    break;
                }
                contents.push(resp.candidates[0].content);
                const resps = [];
                for (const c of calls) {
                    const res = await (onyxToolHandlers as any)[c.functionCall.name]?.(c.functionCall.args);
                    resps.push({ functionResponse: { name: c.functionCall.name, response: { content: res } } });
                }
                contents.push({ role: 'function', parts: resps });
                for (const r of resps) {
                    const d = r.functionResponse.response.content;
                    if (d?.action === 'DEPLOY_INVENTORY') setInventoryConfig({ isOpen: true, itemIds: d.ids, title: d.title, viewMode: 'modal' });
                    else if (d?.action === 'DEPLOY_PAYMENTS') setPaymentsConfig({ isOpen: true, vendor: d.vendor, destination: d.destination, title: d.title });
                    else if (d?.action === 'DEPLOY_CRATES') setTruckId(d.truck_id);
                }
                resp = await callGemini(apiKey, used, contents, onyxToolDefinitions);
                iter++;
            }
        } catch (e: any) {
            setLastError(e.message);
            setMessages(prev => [...prev, { role: 'model', content: `Neural Link Interrupted: ${e.message}` }]);
        } finally { setIsTyping(false); onProcessingChange(false); }
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        unlockTTS(); // Unlock TTS on mobile gesture
        // Resume AudioContext on user gesture for mobile
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().catch(() => {});
        }
        sendMessage();
    };

    useEffect(() => {
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = appLanguage === 'es' ? 'es-MX' : 'en-US';
            
            recognitionRef.current.onresult = (event: any) => {
                let current = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        current += event.results[i][0].transcript;
                    } else {
                        current += event.results[i][0].transcript;
                    }
                }
                
                if (current) {
                    const final = current.trim();
                    setInput(final);
                    checkForVendor(final);
                    if (onTranscriptChange) onTranscriptChange(final);
                }
            };

            recognitionRef.current.onend = () => {
                const currentText = inputRef.current.trim();
                // Check if we were listening - if so, restart for continuous mobile feel
                if (isListeningRef.current) {
                    try { recognitionRef.current.start(); } catch (e) {}
                } else if (currentText) {
                    sendMessage(currentText);
                    setInput('');
                    if (onTranscriptChange) onTranscriptChange('');
                }
            };

            recognitionRef.current.onerror = (e: any) => {
                if (e.error === 'not-allowed') setLastError("Microphone access denied.");
                if (e.error !== 'no-speech') setIsListening(false);
            };
        }
    }, [appLanguage]);

    useEffect(() => {
        if (!recognitionRef.current) return;
        if (isListening) {
            setInput('');
            try { recognitionRef.current.start(); } catch (e) {}
        } else {
            try { recognitionRef.current.stop(); } catch (e) {}
        }
    }, [isListening]);

    useEffect(() => {
        if (isListening && onVolumeChange) {
            const startAudio = async () => {
                // EXCLUSIVE MIC ACCESS FOR MOBILE: 
                // We delay and check if recognition is already holding the mic.
                await new Promise(r => setTimeout(r, 500));
                if (!isListeningRef.current) return;
                
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    streamRef.current = stream;
                    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                    const ctx = new AudioCtx();
                    const source = ctx.createMediaStreamSource(stream);
                    const analyzer = ctx.createAnalyser();
                    analyzer.fftSize = 256;
                    source.connect(analyzer);
                    const dataArray = new Uint8Array(analyzer.frequencyBinCount);
                    audioContextRef.current = ctx;
                    analyzerRef.current = analyzer;
                    dataArrayRef.current = dataArray;
                    const updateVolume = () => {
                        if (!analyzerRef.current || !dataArrayRef.current) return;
                        analyzerRef.current.getByteFrequencyData(dataArrayRef.current);
                        const avg = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length;
                        onVolumeChange(Math.min(1, (avg / 64) * 1.5));
                        animationFrameRef.current = requestAnimationFrame(updateVolume);
                    };
                    updateVolume();
                } catch (e) {}
            };
            startAudio();
        }
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(() => {});
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
            if (onVolumeChange) onVolumeChange(0);
        };
    }, [isListening]);

    const [requestSend] = useAtom(onyxRequestSendAtom);
    useEffect(() => {
        if (requestSend > 0 && input.trim() && !isTyping) {
            sendMessage();
        }
    }, [requestSend]);

    const discoverModels = async () => {
        const key = getApiKey();
        if (!key || key.length < 10) return;
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (res.ok) {
                const data = await res.json();
                setAvailableModels(data.models?.map((m: any) => m.name.replace('models/', '')) || []);
            }
        } catch (e) {}
    };

    useEffect(() => { discoverModels(); }, [userApiKey]);

    const resetNeuralKey = () => {
        // Clear all possible persistent keys
        localStorage.removeItem('ONYX_GEMINI_KEY');
        localStorage.removeItem('onyxApiKey');
        setUserApiKey('');
        setAvailableModels([]);
        setLastError(null);
        
        // Visual feedback
        import('react-hot-toast').then(({ toast }) => {
            toast.success("Neural Link Reset to System Defaults", {
                icon: '🔄',
                style: {
                    borderRadius: '99px',
                    background: '#000',
                    color: '#fff',
                    border: '1px border white/10',
                    backdropFilter: 'blur(20px)'
                }
            });
        });

        setTimeout(() => discoverModels(), 500);
    };

    return {
        input, setInput,
        messages, setMessages,
        isTyping, setIsTyping,
        isListening, setIsListening,
        sendMessage, lastError,
        resetNeuralKey
    };
}

// ── OnyxChatHistory ─────────────────────────────────────────────────────
export function OnyxChatHistory({ messages, isTyping }: { messages: any[], isTyping: boolean }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isTyping]);

    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-12 space-y-6 md:space-y-8 scrollbar-hide flex flex-col items-end pointer-events-none h-full">
            <div className="flex-1" />
            <div className="w-full max-w-2xl space-y-6 md:space-y-8 pb-32">
                {messages.map((m, idx) => (
                    <div key={idx} className="flex flex-col items-end text-right animate-in fade-in slide-in-from-right duration-700 pointer-events-auto">
                        <div className="flex items-center gap-3 mb-2 opacity-20">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white">
                                {m.role === 'user' ? 'Operator' : 'Neural Core'}
                            </span>
                            <div className="h-px w-6 bg-white/40" />
                        </div>
                        <div className={`p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] transition-all duration-700 ${
                            m.role === 'user' ? 'bg-white/[0.02] border border-white/5 text-white/70' : 'bg-(--main-color)/5 border border-(--main-color)/20 text-white shadow-2xl'
                        } backdrop-blur-3xl inline-block max-w-[90%]`}>
                            <div className="text-[13px] md:text-sm leading-relaxed tracking-tight prose prose-invert max-w-none text-right">
                                <ReactMarkdown>{m.content}</ReactMarkdown>
                            </div>
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex justify-end px-2">
                        <div className="bg-(--main-color)/10 border border-(--main-color)/20 px-6 py-3 rounded-full animate-pulse backdrop-blur-3xl">
                            <div className="flex gap-2">
                                {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-(--main-color)/40 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

import { BotOrb } from './BotOrb';
import { isBotOrbOpenAtom } from '../../lib/atoms';

// ── OnyxChatControls ────────────────────────────────────────────────────
export function OnyxChatControls(props: {
    input: string;
    setInput: (v: string) => void;
    sendMessage: () => void;
    isListening: boolean;
    setIsListening: (v: boolean) => void;
    resetNeuralKey?: () => void;
}) {
    const { input, setInput, sendMessage, isListening, setIsListening, resetNeuralKey } = props;
    const [appLanguage, setAppLanguage] = useAtom(languageAtom);
    const [inventoryConfig, setInventoryConfig] = useAtom(inventoryArtifactConfigAtom);
    const [isBotOpen, setIsBotOpen] = useAtom(isBotOrbOpenAtom);

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 flex items-center justify-center gap-4 z-50 animate-in slide-in-from-bottom duration-700 pointer-events-none">
            {/* Bot & Lang Group */}
            <div className="flex items-center gap-2 pointer-events-auto">
                <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsBotOpen(true); }}
                    className={`w-14 h-14 flex items-center justify-center rounded-full border border-white/5 transition-all shadow-2xl ${isBotOpen ? 'bg-(--main-color)/20 text-(--main-color)' : 'bg-black/40 backdrop-blur-3xl text-white/40 hover:text-white hover:bg-black/60'}`}
                    title="Deploy Bot Orb"
                >
                    <Brain size={20} strokeWidth={1.5} />
                </button>

                <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setAppLanguage(prev => prev === 'en' ? 'es' : 'en'); }}
                    className="w-14 h-14 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-3xl border border-white/5 text-[10px] font-black text-white/40 hover:text-white hover:bg-black/60 transition-all shadow-2xl"
                >
                    {appLanguage.toUpperCase()}
                </button>
            </div>

            {/* Neural Input Capsule */}
            <form 
                onSubmit={(props as any).handleFormSubmit || ((e) => { e.preventDefault(); sendMessage(); })}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 max-w-lg relative flex items-center bg-black/40 backdrop-blur-3xl rounded-full border border-white/5 shadow-2xl pointer-events-auto overflow-hidden group hover:border-white/10 transition-all"
            >
                <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={appLanguage === 'es' ? "Neural Query..." : "Neural Query..."}
                    className="w-full bg-transparent py-4 px-6 text-[13px] font-black tracking-[0.2em] text-white outline-none placeholder:text-white/10 uppercase"
                />
                
                {input.trim() && (
                    <button 
                        type="submit"
                        className="absolute right-3 flex items-center justify-center w-10 h-10 rounded-full bg-(--main-color)/20 text-(--main-color) hover:bg-(--main-color)/30 transition-all animate-in fade-in scale-in"
                    >
                        <Send size={16} strokeWidth={2} />
                    </button>
                )}
            </form>

            {/* Tactical Tools Group */}
            <div className="flex items-center gap-2 pointer-events-auto">
                {/* Reset Credentials Button - HIGHLIGHTED for accessibility */}
                <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); resetNeuralKey?.(); }}
                    className="w-14 h-14 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-3xl border border-white/5 text-white/20 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all shadow-2xl"
                    title="Reset Neural Link"
                >
                    <RefreshCw size={20} strokeWidth={1.5} />
                </button>

                {inventoryConfig.itemIds.length > 0 && (
                    <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setInventoryConfig(prev => ({ ...prev, isOpen: !prev.isOpen })); }}
                        className={`w-14 h-14 flex items-center justify-center rounded-full border border-white/5 transition-all shadow-2xl ${inventoryConfig.isOpen ? 'bg-(--main-color)/20 text-(--main-color)' : 'bg-black/40 backdrop-blur-3xl text-white/40 hover:text-white'}`}
                        title="Toggle Manifest"
                    >
                        <Package size={20} strokeWidth={1.5} />
                    </button>
                )}

                <button 
                    type="button"
                    onPointerDown={(e) => { e.stopPropagation(); unlockTTS(); setIsListening(true); }}
                    onPointerUp={(e) => { e.stopPropagation(); setIsListening(false); }}
                    onPointerLeave={(e) => { e.stopPropagation(); setIsListening(false); }}
                    onPointerCancel={(e) => { e.stopPropagation(); setIsListening(false); }}
                    onTouchStart={(e) => { e.stopPropagation(); unlockTTS(); setIsListening(true); }}
                    onTouchEnd={(e) => { e.stopPropagation(); setIsListening(false); }}
                    className={`relative w-16 h-16 flex items-center justify-center rounded-full border border-white/5 shadow-2xl transition-all duration-300 ${isListening ? 'bg-red-500/20 border-red-500/40 text-red-500 scale-110' : 'bg-black/40 backdrop-blur-3xl text-white/20 hover:text-white hover:bg-black/60'}`}
                    style={{ touchAction: 'none' }}
                >
                    {isListening ? <MicOff size={24} strokeWidth={2} /> : <Mic size={24} strokeWidth={2} />}
                    {isListening && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-full h-full rounded-full border border-red-500/20 animate-ping" />
                        </div>
                    )}
                </button>
            </div>
        </div>
    );
}

// ── Legacy Compatibility Wrapper ────────────────────────────────────────
export function OnyxChat(props: OnyxChatProps) {
    const onyx = useOnyx(props);
    return (
        <div className="flex flex-col h-full w-full overflow-hidden relative">
            {onyx.lastError && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 backdrop-blur-xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-500/80">{onyx.lastError}</p>
                </div>
            )}
            <OnyxChatHistory messages={onyx.messages} isTyping={onyx.isTyping} />
            <OnyxChatControls 
                input={onyx.input} 
                setInput={onyx.setInput} 
                sendMessage={onyx.sendMessage} 
                isListening={onyx.isListening} 
                setIsListening={onyx.setIsListening} 
                resetNeuralKey={onyx.resetNeuralKey}
                handleFormSubmit={onyx.handleFormSubmit}
            />
        </div>
    );
}
