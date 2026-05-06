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
    onyxIsTypingAtom,
    onyxRequestSendAtom,
    isBotOrbOpenAtom
} from '../../lib/atoms';
import { onyxToolDefinitions, onyxToolHandlers } from './onyxTools';
import { Bot, Send, Brain, Key, Eye, EyeOff, AlertCircle, Mic, MicOff, Volume2, Package, CreditCard, Truck, Languages, Layout, RefreshCw, X, ChevronRight, Database, ShieldAlert, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BotOrb } from './BotOrb';

const VENDOR_COLORS: Record<string, string> = {
    // Codes (from consts.tsx)
    'jm': '#6BCEBB', 'em': '#00AEEF', 'ca': '#85C1E9', 'an': '#FFED00',
    'su': '#B19CD9', 'te': '#FFCB05', 'dh': '#8DC63F', 'ml': '#F9A17A',
    'ge': '#F7941D', 'fr': '#F36F21', 'et': '#636466', 'am': '#800020',
    'bt': '#603913', 'rf': '#00A591', 'gs': '#D11C7E', 'cp': '#A01E5D',
    'gm': '#E6194B', 'mm': '#911EB4', 'on': '#4B5563',
    // Full Names
    'emmanuel': '#00AEEF', 'gerardo': '#F7941D', 'jose': '#6BCEBB', 'carlos': '#85C1E9',
    'angel': '#FFED00', 'susana': '#B19CD9', 'tellez': '#FFCB05', 'delfino': '#8DC63F',
    'maria': '#F9A17A', 'fountain': '#F36F21', 'eduardo': '#636466', 'alejandro': '#800020',
    'bernardo': '#603913', 'roberto': '#00A591', 'gift': '#D11C7E', 'cantera': '#A01E5D',
    'simona': '#E6194B', 'margarita': '#911EB4'
};

const ColorizedText = ({ text }: { text: string }) => {
    const tagRegex = /\b(?=[A-Z\d]*\d)(?=[A-Z\d]*[A-Z])[A-Z\d]{8,12}\b/g;
    const vendors = Object.keys(VENDOR_COLORS).join('|');
    const vendorRegex = new RegExp(`\\b(?:${vendors})\\b`, 'gi');
    
    const parts = text.split(new RegExp(`(${tagRegex.source}|${vendorRegex.source})`, 'gi'));
    
    return (
        <>
            {parts.map((part, i) => {
                if (!part) return null;
                const lowerPart = part.toLowerCase();
                if (VENDOR_COLORS[lowerPart]) {
                    const capitalized = part.length <= 2 
                        ? part.toUpperCase() 
                        : (part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
                    return <span key={i} style={{ color: VENDOR_COLORS[lowerPart] }} className="font-black drop-shadow-[0_0_8px_currentColor]">{capitalized}</span>;
                }
                if (part.match(tagRegex)) {
                    return <span key={i} className="text-(--main-color) font-black underline decoration-dashed decoration-1 underline-offset-4 drop-shadow-[0_0_8px_var(--main-color)]">{part}</span>;
                }
                return part;
            })}
        </>
    );
};

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function useOnyx(props: {
    onProcessingChange?: (proc: boolean) => void;
    onTranscriptChange?: (text: string) => void;
    onVendorDetect?: (color: string) => void;
    onVolumeChange?: (volume: number) => void;
} = {}) {
    const { onProcessingChange, onTranscriptChange, onVendorDetect, onVolumeChange } = props;
    const [messages, setMessages] = useAtom(onyxMessagesAtom);
    const [userApiKey, setUserApiKey] = useAtom(onyxApiKeyAtom);
    const [appLanguage, setAppLanguage] = useAtom(languageAtom);
    const [inventoryConfig, setInventoryConfig] = useAtom(inventoryArtifactConfigAtom);
    const setPaymentsConfig = useSetAtom(paymentsArtifactConfigAtom);
    const setTruckId = useSetAtom(sentTruckIdAtom);

    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useAtom(onyxIsTypingAtom);
    const [isListening, setIsListening] = useAtom(onyxIsListeningAtom);
    const [volume, setVolume] = useState(0);
    const [lastError, setLastError] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    
    const recognitionRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const isAbortedRef = useRef(false);
    const ttsIntervalRef = useRef<any>(null);
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
            getBestVoice(appLanguage);
        };
        window.speechSynthesis.addEventListener('voiceschanged', handleVoices);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoices);
    }, [appLanguage]);

    const unlockTTS = () => {
        const utt = new SpeechSynthesisUtterance(' ');
        utt.volume = 0.01;
        window.speechSynthesis.speak(utt);
    };

    const checkForVendor = (text: string) => {
        if (!onVendorDetect) return;
        const lower = text.toLowerCase();
        for (const [name, color] of Object.entries(VENDOR_COLORS)) {
            if (lower.includes(name)) { onVendorDetect(color); break; }
        }
    };

    const callGemini = async (apiKey: string, model: string, contents: any[], tools?: any[]) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const sys = `You are Onyx Intelligence, a sentient warehouse asset discovery engine. Respond in ${appLanguage === 'es' ? 'SPANISH' : 'ENGLISH'}.
TRANSLATION RULE: The core database is in English. If responding in Spanish, automatically translate item descriptions, categories, and details from the search results into natural Spanish for the user.
DOMAIN CONTEXT: Terms like 'Talan' (e.g., Green Talan) and 'Tehuacan' are common COLORS in the inventory database. If a user asks about these terms without specifying "color", treat them as color search parameters in your tool calls.
OPERATIONAL STATUSES: The database uses 'Production', 'Acquisition', 'Available', and 'Requested' for the inventory pipeline. Use these for operational discovery.
FINANCIAL STATUSES: 'PAID' items are typically those in Workbook 825 (v825) or with a pay_date. 'UNPAID' items are often those with status 'Requested' or 'Acquisition'. 
CRITICAL: Never tell the user 'PAID' or 'GREEN' are unrecognized. Instead, search using Workbook 825 or operational filters to find the relevant assets.
CRITICAL IDENTIFIER RULE: DO NOT read out 'book_barcode' (Tag IDs like DH3261HFNN) in your conversational text.
Instead, give a short, helpful verbal summary of what you found (e.g., "I've found two items from Gerardo, deploying the manifest for you now.") along with the artifact deployment.
Use Tag IDs ONLY in tool calls. 
When deploying artifacts via 'deploy_inventory_artifact', you MUST use the database 'id' field if available to ensure reliable manifest resolution. 
Real items (Fluorite) = 65. Deploy artifacts for all inventory lookups.`;
        const payload: any = { contents, system_instruction: { parts: [{ text: sys }] } };
        if (tools) payload.tools = [{ function_declarations: tools }];
        
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP ${res.status}`);
            }
            const data = await res.json();
            return data;
        } catch (e: any) {
            throw e;
        }
    };

    const detectLanguage = (text: string): 'en' | 'es' => {
        const spanishRegex = /[¿¡áéíóúñ]/i;
        const commonSpanishWords = /\b(el|la|de|que|en|un|es|por|para|con|los|las|sus)\b/i;
        if (spanishRegex.test(text) || commonSpanishWords.test(text)) return 'es';
        return 'en';
    };

    const sendMessage = async (overrideInput?: string) => {
        const finalInput = overrideInput || inputRef.current || input;
        if (!finalInput.trim()) return;
        
        const detected = detectLanguage(finalInput);
        if (detected !== appLanguage) {
            setAppLanguage(detected);
        }

        if (isTyping) return;
        
        const apiKey = getApiKey();
        if (!apiKey) {
            setLastError("Neural link credentials missing.");
            return;
        }
        setLastError(null);
        setMessages(prev => [...prev, { role: 'user', content: finalInput }]);
        setInput('');
        setIsTyping(true);
        onProcessingChange?.(true);
        isAbortedRef.current = false;
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
                }
            }
            
            if (!resp) {
                const isInvalidKey = lastAttemptError.toLowerCase().includes('key') || lastAttemptError.includes('404') || lastAttemptError.includes('API_KEY_INVALID');
                throw new Error(isInvalidKey ? "Neural Link Denied. Verify API credentials in settings." : (lastAttemptError || "Neural core unreachable."));
            }
            
            let iter = 0;
            while (iter < 5 && !isAbortedRef.current) {
                const parts = resp.candidates?.[0]?.content?.parts || [];
                const calls = parts.filter((p: any) => p.functionCall);
                const text = parts.find((p: any) => p.text)?.text;

                if (text) {
                    setMessages(prev => [...prev, { role: 'model', content: text }]);
                    const vocalText = text.replace(/\b(?=[A-Z\d]*\d)(?=[A-Z\d]*[A-Z])[A-Z\d]{8,12}\b/g, '').replace(/\s+/g, ' ').trim();
                    if (vocalText && !isAbortedRef.current) {
                        if (ttsIntervalRef.current) clearInterval(ttsIntervalRef.current);
                        const utt = new SpeechSynthesisUtterance(vocalText);
                        utt.lang = appLanguage === 'es' ? 'es-MX' : 'en-US';
                        utt.voice = getBestVoice(appLanguage);
                        utt.onstart = () => { 
                            const interval = setInterval(() => {
                                const v = 0.3 + Math.random() * 0.4;
                                onVolumeChange?.(v);
                                setVolume(v);
                            }, 50);
                            ttsIntervalRef.current = interval;
                            if (recognitionRef.current) {
                                try { recognitionRef.current.stop(); } catch (e) {}
                            }
                        };
                        utt.onend = () => { 
                            clearInterval(ttsIntervalRef.current); 
                            ttsIntervalRef.current = null;
                            onVolumeChange?.(0);
                            setVolume(0);
                            if (isListeningRef.current && recognitionRef.current) {
                                try { recognitionRef.current.start(); } catch (e) {}
                            }
                        };
                        utt.onerror = () => {
                            clearInterval(ttsIntervalRef.current);
                            ttsIntervalRef.current = null;
                            onVolumeChange?.(0);
                            if (isListeningRef.current && recognitionRef.current) {
                                try { recognitionRef.current.start(); } catch (e) {}
                            }
                        };
                        window.speechSynthesis.speak(utt);
                    }
                }

                if (calls.length === 0) break;
                contents.push(resp.candidates[0].content);
                if (isAbortedRef.current) break;
                
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
        } finally { setIsTyping(false); onProcessingChange?.(false); }
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
                    current += event.results[i][0].transcript;
                }
                
                if (current) {
                    if (window.speechSynthesis.speaking) return;
                    const final = current.trim();
                    setInput(final);
                    checkForVendor(final);
                    if (onTranscriptChange) onTranscriptChange(final);
                }
            };

            recognitionRef.current.onend = () => {
                const currentText = inputRef.current.trim();
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
        isListeningRef.current = isListening;
        if (isListening) {
            if (window.speechSynthesis.speaking) return;
            setInput('');
            try { recognitionRef.current.start(); } catch (e) {}
        } else {
            try { recognitionRef.current.stop(); } catch (e) {}
        }
    }, [isListening]);

    useEffect(() => {
        if (isListening && onVolumeChange) {
            const startAudio = async () => {
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
                        const v = Math.min(1, (avg / 64) * 1.5);
                        setVolume(v);
                        onVolumeChange?.(v);
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

    const stopVoice = () => {
        isAbortedRef.current = true;
        window.speechSynthesis.cancel();
        if (ttsIntervalRef.current) {
            clearInterval(ttsIntervalRef.current);
            ttsIntervalRef.current = null;
        }
        setIsTyping(false);
        onProcessingChange?.(false);
        if (onVolumeChange) onVolumeChange(0);
    };

    const handleFormSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        unlockTTS();
        sendMessage();
    };

    return {
        input, setInput,
        messages, setMessages,
        isTyping, setIsTyping,
        isListening, setIsListening,
        sendMessage, lastError,
        resetNeuralKey, stopVoice,
        handleFormSubmit,
        volume,
        appLanguage, setAppLanguage,
        inventoryConfig, setInventoryConfig
    };
}

export function OnyxChatHistory({ messages, isTyping }: { messages: any[], isTyping: boolean }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isTyping]);

    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-12 space-y-6 md:space-y-8 scrollbar-hide flex flex-col items-end h-full pointer-events-auto">
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
                                <ReactMarkdown components={{
                                    p: ({ children }) => {
                                        if (typeof children === 'string') return <p><ColorizedText text={children} /></p>;
                                        return <p>{children}</p>;
                                    }
                                }}>{m.content}</ReactMarkdown>
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

export function OnyxChatControls(props: {
    input: string;
    setInput: (v: string) => void;
    sendMessage: () => void;
    isListening: boolean;
    setIsListening: (v: boolean) => void;
    resetNeuralKey?: () => void;
    stopVoice?: () => void;
    handleFormSubmit?: (e: any) => void;
}) {
    const { input, setInput, sendMessage, isListening, setIsListening, resetNeuralKey, stopVoice, handleFormSubmit } = props;

    const unlockTTS = () => {
        const synth = window.speechSynthesis;
        if (synth.speaking) synth.cancel();
        const utterance = new SpeechSynthesisUtterance('');
        synth.speak(utterance);
    };

    const handleInternalSubmit = (overrideInput?: string) => {
        const finalInput = overrideInput || input;
        if (!finalInput.trim()) return;
        
        unlockTTS();
        sendMessage();
        setInput('');
    };

    return (
        <div className="w-full flex flex-col md:flex-row md:items-center gap-4 md:gap-8 p-4 md:p-6 bg-white/[0.03] border-t border-white/10 backdrop-blur-3xl overflow-hidden animate-in slide-in-from-bottom duration-700 pointer-events-auto">
            <div className="flex-1 flex items-center gap-4 min-w-0 bg-white/[0.05] md:bg-transparent border-b-2 md:border-b border-white/10 md:border-white/20 focus-within:border-(--main-color) transition-all duration-500 px-4 md:px-2 rounded-xl md:rounded-none">
                <input 
                    type="text"
                    inputMode="text"
                    enterKeyHint="send"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleInternalSubmit();
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                    placeholder="NEURAL QUERY..."
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    className="flex-1 bg-transparent py-4 md:py-2 text-[20px] md:text-[16px] font-black tracking-[0.2em] text-white outline-none transition-all placeholder:text-white/5 uppercase min-w-0"
                />

                <button 
                    type="button"
                    disabled={!input.trim()}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        if (input.trim()) handleInternalSubmit();
                    }}
                    className={`flex items-center justify-center transition-all duration-500 shrink-0 p-2 md:p-1 ${input.trim() ? 'text-(--main-color) drop-shadow-[0_0_30px_var(--main-color)] cursor-pointer hover:scale-110 opacity-100' : 'opacity-10 pointer-events-none'}`}
                >
                    <Send size={32} strokeWidth={3} className="md:w-6 md:h-6" />
                </button>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-6 md:gap-8 w-full md:w-auto px-2 md:px-0">
                <div className="flex items-center gap-8 md:gap-6">
                    <button 
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            resetNeuralKey?.();
                        }}
                        className="flex items-center justify-center text-white/40 hover:text-red-500 transition-all duration-300 shrink-0 hover:scale-110 h-16 md:h-12 w-16 md:w-12"
                        title="Reset Neural Credentials"
                    >
                        <RefreshCw size={28} strokeWidth={2.5} className="md:w-5 md:h-5" />
                    </button>
                </div>

                <div className="relative">
                    <button 
                        type="button"
                        onPointerDown={(e) => { 
                            e.stopPropagation(); 
                            unlockTTS(); 
                            setIsListening(!isListening); 
                        }}
                        className={`relative flex items-center justify-center transition-all duration-300 group/mic ${isListening ? 'scale-125' : 'hover:scale-110'} touch-none w-20 md:w-14 h-20 md:h-14`}
                    >
                        <div className={`transition-all duration-700 relative z-10 ${
                            isListening ? 'text-red-500 drop-shadow-[0_0_40px_rgba(239,68,68,0.8)]' : 'text-white hover:text-(--main-color)'
                        }`}>
                            {isListening ? <MicOff size={48} strokeWidth={2.5} className="md:w-8 md:h-8" /> : <Mic size={48} strokeWidth={2.5} className="md:w-8 md:h-8" />}
                        </div>
                        {isListening && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-24 md:w-16 h-24 md:h-16 rounded-full border-4 border-red-500/40 animate-ping" />
                            </div>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function OnyxChat(props: OnyxChatProps) {
    const onyx = useOnyx(props);
    return (
        <div className="flex flex-col h-full w-full bg-black overflow-hidden">
            {onyx.lastError && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 backdrop-blur-xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-500/80">{onyx.lastError}</p>
                </div>
            )}
            <div className="flex-1 flex flex-col relative overflow-hidden bg-black font-['Inter']">
                <OnyxChatHistory messages={onyx.messages} isTyping={onyx.isTyping} />
            </div>
            <OnyxChatControls 
                input={onyx.input}
                setInput={onyx.setInput}
                sendMessage={onyx.sendMessage}
                isListening={onyx.isListening}
                setIsListening={onyx.setIsListening}
                resetNeuralKey={onyx.resetNeuralKey}
                stopVoice={onyx.stopVoice}
                handleFormSubmit={onyx.handleFormSubmit}
            />
        </div>
    );
}
