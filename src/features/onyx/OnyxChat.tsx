import React, { useState, useRef, useEffect } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import { 
    onyxMessagesAtom, 
    onyxApiKeyAtom, 
    inventoryArtifactConfigAtom, 
    paymentsArtifactConfigAtom, 
    sentTruckIdAtom,
    languageAtom,
    onyxIsListeningAtom,
    onyxRequestSendAtom,
    isBotOrbOpenAtom
} from '../../lib/atoms';
import { onyxToolDefinitions, onyxToolHandlers } from './onyxTools';
import { Bot, Send, Brain, Key, Eye, EyeOff, AlertCircle, Mic, MicOff, Volume2, Package, CreditCard, Truck, Languages, Layout, RefreshCw, X, ChevronRight, Database, ShieldAlert } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BotOrb } from './BotOrb';

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
        localStorage.removeItem('ONYX_GEMINI_KEY');
        setUserApiKey('');
        setLastError("Neural credentials reset to system default.");
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

// ── OnyxChatControls ────────────────────────────────────────────────────
export function OnyxChatControls(props: {
    input: string;
    setInput: (v: string) => void;
    sendMessage: () => void;
    isListening: boolean;
    setIsListening: (v: boolean) => void;
    resetNeuralKey?: () => void;
    handleFormSubmit?: (e: any) => void;
}) {
    const { input, setInput, sendMessage, isListening, setIsListening, resetNeuralKey, handleFormSubmit } = props;
    const [appLanguage, setAppLanguage] = useAtom(languageAtom);
    const [inventoryConfig, setInventoryConfig] = useAtom(inventoryArtifactConfigAtom);
    const [isBotOpen, setIsBotOpen] = useAtom(isBotOrbOpenAtom);

    const unlockTTS = () => {
        const synth = window.speechSynthesis;
        if (synth.speaking) synth.cancel();
        const utterance = new SpeechSynthesisUtterance('');
        synth.speak(utterance);
    };

    return (
        <div className="w-full flex items-center justify-between gap-6 p-4 md:p-6 bg-transparent backdrop-blur-3xl animate-in slide-in-from-bottom duration-700">
            {/* Bot Icon Button - High Contrast */}
            <button 
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsBotOpen(true);
                }}
                className={`flex items-center justify-center transition-all duration-300 shrink-0 ${isBotOpen ? 'text-(--main-color) drop-shadow-[0_0_15px_var(--main-color)] scale-110' : 'text-white hover:text-(--main-color) hover:scale-110'}`}
                title="Deploy Bot Orb"
            >
                <Brain size={28} strokeWidth={2} />
            </button>

            {/* Minimal Language Toggle - High Contrast */}
            <button 
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setAppLanguage(prev => prev === 'en' ? 'es' : 'en');
                }}
                className="flex items-center justify-center text-[12px] font-black tracking-widest text-white hover:text-(--main-color) transition-all duration-300 shrink-0 hover:scale-110"
            >
                {appLanguage.toUpperCase()}
            </button>

            {/* Frameless Compact Input Form */}
            <form 
                onSubmit={handleFormSubmit || ((e) => { e.preventDefault(); sendMessage(); })}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 flex items-center gap-6"
            >
                <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Neural Query..."
                    className="flex-1 bg-white/10 p-3 px-6 rounded-full text-[16px] font-bold tracking-wide text-white outline-none transition-all placeholder:text-white/20 uppercase border border-white/20 focus:border-(--main-color) focus:bg-white/20"
                />

                {/* Minimal Send Button - High Prominence */}
                <button 
                    type="submit"
                    disabled={!input.trim()}
                    className={`flex items-center justify-center transition-all duration-500 shrink-0 ${input.trim() ? 'text-(--main-color) drop-shadow-[0_0_15px_var(--main-color)] cursor-pointer hover:scale-110 opacity-100 scale-100' : 'opacity-10 scale-90 pointer-events-none'}`}
                >
                    <Send size={32} strokeWidth={2} />
                </button>
            </form>

            {/* Action Buttons Panel */}
            <div className="flex items-center gap-6 relative shrink-0">
                {/* Reset Credentials Button */}
                <button 
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        resetNeuralKey?.();
                    }}
                    className="flex items-center justify-center text-white hover:text-red-400 transition-all duration-300 shrink-0 hover:scale-110"
                    title="Reset Neural Key"
                >
                    <RefreshCw size={20} strokeWidth={2} />
                </button>

                {/* Artifact Toggle Button */}
                {inventoryConfig.itemIds.length > 0 && (
                    <button 
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setInventoryConfig(prev => ({ ...prev, isOpen: !prev.isOpen }));
                        }}
                        className={`flex items-center justify-center transition-all duration-500 group/art ${inventoryConfig.isOpen ? 'text-(--main-color) drop-shadow-[0_0_10px_var(--main-color)]' : 'text-white hover:text-(--main-color)'} hover:scale-110`}
                        title="Toggle Manifest"
                    >
                        <Package size={24} strokeWidth={2} />
                    </button>
                )}

                {/* Minimal Talk Button */}
                <div className="relative">
                    <button 
                        type="button"
                        onPointerDown={(e) => { 
                            e.stopPropagation(); 
                            unlockTTS(); 
                            setIsListening(true); 
                        }}
                        onPointerUp={(e) => { e.stopPropagation(); setIsListening(false); }}
                        onPointerLeave={(e) => { e.stopPropagation(); setIsListening(false); }}
                        onPointerCancel={(e) => { e.stopPropagation(); setIsListening(false); }}
                        onTouchStart={(e) => { 
                            e.stopPropagation(); 
                            unlockTTS(); 
                            setIsListening(true); 
                        }}
                        onTouchEnd={(e) => { e.stopPropagation(); setIsListening(false); }}
                        className={`relative flex items-center justify-center transition-all duration-300 group/mic ${isListening ? 'scale-125' : 'hover:scale-110'}`}
                        style={{ touchAction: 'none' }}
                    >
                        <div className={`transition-all duration-700 relative z-10 ${
                            isListening ? 'text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]' : 'text-white hover:text-(--main-color)'
                        }`}>
                            {isListening ? <MicOff size={36} strokeWidth={2} /> : <Mic size={36} strokeWidth={2} />}
                        </div>
                        {isListening && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-16 h-16 rounded-full border border-red-500/40 animate-ping" />
                            </div>
                        )}
                    </button>
                </div>
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
