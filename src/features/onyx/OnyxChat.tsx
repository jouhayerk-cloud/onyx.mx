
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
import { supabase } from '../../lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { vendors } from '../../lib/consts';
import { getOnyxSystemGrounding } from './onyxBusinessRules';
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

    const getApiKey = () => {
        const key = userApiKey || localStorage.getItem('ONYX_GEMINI_KEY') || (import.meta as any).env.VITE_GEMINI_API_KEY || '';
        return String(key).trim().replace(/['"]/g, '');
    };

    const getBestVoice = (lang: 'en' | 'es') => {
        const voices = window.speechSynthesis.getVoices();
        const targetLocale = lang === 'es' ? 'es-' : 'en-';
        const matches = voices.filter(v => v.lang.startsWith(targetLocale));
        return matches.find(v => v.name.includes('Natural')) || matches.find(v => v.name.includes('Google')) || matches[0] || null;
    };

    // Mobile TTS Unlock: Must be called on user gesture
    const unlockTTS = () => {
        window.speechSynthesis.cancel(); // Clear any stuck utterances
        const utt = new SpeechSynthesisUtterance(' ');
        utt.volume = 0;
        window.speechSynthesis.speak(utt);
    };

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

    const callGeminiStreaming = async (apiKey: string, modelName: string, contents: any[]) => {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: getOnyxSystemGrounding(),
            tools: [{ functionDeclarations: onyxToolDefinitions as any }]
        });
        
        const history = contents.slice(0, -1).map(m => ({
            role: m.role,
            parts: m.parts
        }));
        
        const chat = model.startChat({ history });
        const lastMsg = contents[contents.length - 1].parts[0].text;
        
        return await chat.sendMessageStream(lastMsg);
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
        
        // Auto-Language Detection for TTS engine
        const isSpanish = /([aeiouáéíóú]s|el|la|los|las|de|un|una|para|con|por|que|si|no)\b/i.test(finalInput);
        if (isSpanish && appLanguage !== 'es') setAppLanguage('es');
        else if (!isSpanish && appLanguage !== 'en' && /\b(the|is|are|a|an|for|with|by|that|if|no)\b/i.test(finalInput)) setAppLanguage('en');

        try {
            let contents = messages.filter(m => m.content?.trim()).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
            contents.push({ role: 'user', parts: [{ text: finalInput }] });
            
            const modelsToTry = [...availableModels.filter(m => m.includes('flash')), "gemini-1.5-flash", "gemini-1.5-flash-latest"];
            const uniqueModels = Array.from(new Set(modelsToTry));
            
            let result = null;
            for (const m of uniqueModels) {
                try {
                    result = await callGeminiStreaming(apiKey, m, contents);
                    break;
                } catch (e) {}
            }

            if (!result) throw new Error("Neural link failed to initialize.");

            let fullText = "";
            let currentSentence = "";
            let toolCalls: any[] = [];
            
            // Add a placeholder message for streaming
            setMessages(prev => [...prev, { role: 'model', content: '' }]);

            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                if (chunkText) {
                    fullText += chunkText;
                    currentSentence += chunkText;
                    
                    setMessages(prev => {
                        const next = [...prev];
                        next[next.length - 1].content = fullText;
                        return next;
                    });

                    // Partial Speaking
                    if (/[.!?]\s$/.test(currentSentence) || currentSentence.length > 100) {
                        const utt = new SpeechSynthesisUtterance(currentSentence.trim());
                        utt.lang = appLanguage === 'es' ? 'es-MX' : 'en-US';
                        utt.voice = getBestVoice(appLanguage);
                        window.speechSynthesis.speak(utt);
                        currentSentence = "";
                    }
                }

                const calls = chunk.functionCalls();
                if (calls) toolCalls.push(...calls);
            }

            // Speak remaining
            if (currentSentence.trim()) {
                const utt = new SpeechSynthesisUtterance(currentSentence.trim());
                utt.lang = appLanguage === 'es' ? 'es-MX' : 'en-US';
                utt.voice = getBestVoice(appLanguage);
                window.speechSynthesis.speak(utt);
            }

            // Handle Tool Calls
            if (toolCalls.length > 0) {
                const resps = [];
                for (const c of toolCalls) {
                    const res = await (onyxToolHandlers as any)[c.name]?.(c.args);
                    resps.push({ functionResponse: { name: c.name, response: { content: res } } });
                    
                    // Specific Deploys
                    if (res?.action === 'DEPLOY_INVENTORY') setInventoryConfig({ isOpen: true, itemIds: res.ids, title: res.title, viewMode: 'modal' });
                }
                
                // For now, we stop after tool execution to avoid complex recursive streaming
                // The AI can be prompted to follow up if needed.
            }

        } catch (e: any) {
            setLastError(e.message);
            setMessages(prev => [...prev, { role: 'model', content: `Neural Link Interrupted: ${e.message}` }]);
        } finally {
            setIsTyping(false);
            onProcessingChange(false);
        }
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
                // Delay visualizer slightly on mobile to allow SpeechRecognition priority
                await new Promise(r => setTimeout(r, 300));
                if (!isListeningRef.current) return;
                
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
            if (onVolumeChange) onVolumeChange(0);
        };
    }, [isListening]);

    const [requestSend] = useAtom(onyxRequestSendAtom);
    useEffect(() => {
        if (requestSend > 0 && input.trim() && !isTyping) {
            sendMessage();
        }
    }, [requestSend]);

    useEffect(() => {
        discoverModels();

        // Ensure voices are loaded for mobile
        const loadVoices = () => window.speechSynthesis.getVoices();
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }, [userApiKey]);

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
        resetNeuralKey,
        handleFormSubmit
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
    handleFormSubmit?: (e: React.FormEvent) => void;
}) {
    const { input, setInput, sendMessage, isListening, setIsListening, resetNeuralKey, handleFormSubmit } = props;
    const [appLanguage, setAppLanguage] = useAtom(languageAtom);
    const [inventoryConfig, setInventoryConfig] = useAtom(inventoryArtifactConfigAtom);

    return (
        <div className="w-full flex items-center justify-between gap-3 p-3 md:p-4 bg-transparent backdrop-blur-3xl animate-in slide-in-from-bottom duration-700">
            {/* Minimal Language Detection Indicator */}
            <div className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 border border-white/5 text-[8px] font-black text-white/40 shrink-0">
                AUTO
            </div>

            {/* Frameless Compact Input Form */}
            <form 
                onSubmit={handleFormSubmit || ((e) => { e.preventDefault(); sendMessage(); })}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 relative flex items-center"
            >
                <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            // Let the form handle the submit for mobile Go button
                        }
                    }}
                    placeholder={appLanguage === 'es' ? "Neural Query..." : "Neural Query..."}
                    className="w-full bg-transparent p-2 px-3 text-[12px] font-black tracking-[0.2em] text-white outline-none transition-all placeholder:text-white/5 uppercase"
                />
            </form>

            {/* Action Buttons Panel */}
            <div className="flex items-center gap-2 relative shrink-0">
                {/* Reset Credentials Button */}
                <button 
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        resetNeuralKey?.();
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 border border-white/5 text-white/10 hover:text-white/40 transition-all shrink-0"
                    title="Reset Neural Key"
                >
                    <RefreshCw size={12} strokeWidth={2} />
                </button>

                {/* Artifact Toggle Button */}
                {inventoryConfig.itemIds.length > 0 && (
                    <button 
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setInventoryConfig(prev => ({ ...prev, isOpen: !prev.isOpen }));
                        }}
                        className={`flex items-center justify-center w-8 h-8 rounded-full border border-white/5 transition-all duration-500 group/art ${inventoryConfig.isOpen ? 'bg-(--main-color)/10' : 'bg-white/5'}`}
                        title="Toggle Manifest"
                    >
                        <Package size={12} strokeWidth={2} className={`${inventoryConfig.isOpen ? 'text-(--main-color)' : 'text-white/40'} group-hover/art:text-white transition-colors`} />
                    </button>
                )}

                {/* Minimal Send Button */}
                <button 
                    type="submit"
                    onClick={(e) => {
                        // Let form handle submit
                    }}
                    className={`flex items-center justify-center w-8 h-8 rounded-full border border-white/5 bg-white/5 transition-all duration-500 group/send ${input.trim() ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}
                >
                    <Send size={12} strokeWidth={2} className="text-white/40 group-hover/send:text-white transition-colors" />
                </button>

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
                        // Add touch support for mobile
                        onTouchStart={(e) => { 
                            e.stopPropagation(); 
                            unlockTTS(); 
                            setIsListening(true); 
                        }}
                        onTouchEnd={(e) => { e.stopPropagation(); setIsListening(false); }}
                        className={`relative flex items-center justify-center w-10 h-10 rounded-full border border-white/5 bg-white/5 transition-all duration-300 group/mic ${isListening ? 'scale-110 border-red-500/20 bg-red-500/10' : 'hover:scale-105'}`}
                        style={{ touchAction: 'none' }}
                    >
                        <div className={`transition-all duration-700 relative z-10 ${
                            isListening ? 'text-red-500' : 'text-white/20 group-hover/mic:text-white'
                        }`}>
                            {isListening ? <MicOff size={16} strokeWidth={2} /> : <Mic size={16} strokeWidth={2} />}
                        </div>
                        {isListening && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-full h-full rounded-full border border-red-500/20 animate-ping" />
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
