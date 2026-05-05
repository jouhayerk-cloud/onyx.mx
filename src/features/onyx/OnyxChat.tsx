
import React, { useState, useRef, useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { 
    onyxMessagesAtom, 
    onyxApiKeyAtom, 
    inventoryArtifactConfigAtom, 
    paymentsArtifactConfigAtom, 
    sentTruckIdAtom,
    languageAtom,
    onyxIsListeningAtom
} from '../../lib/atoms';
import { onyxToolDefinitions, onyxToolHandlers } from './onyxTools';
import { Bot, Send, Brain, Key, Eye, EyeOff, AlertCircle, Mic, MicOff, Volume2, Package, CreditCard, Truck, Languages } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface OnyxChatProps {
    onProcessingChange: (proc: boolean) => void;
    onTranscriptChange?: (text: string) => void;
    onVendorDetect?: (color: string) => void;
    onVolumeChange?: (volume: number) => void;
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function OnyxChat({ onProcessingChange, onTranscriptChange, onVendorDetect, onVolumeChange }: OnyxChatProps) {
    const [messages, setMessages] = useAtom(onyxMessagesAtom);
    const [userApiKey] = useAtom(onyxApiKeyAtom);
    const [appLanguage, setAppLanguage] = useAtom(languageAtom);
    const setInventoryConfig = useSetAtom(inventoryArtifactConfigAtom);
    const setPaymentsConfig = useSetAtom(paymentsArtifactConfigAtom);
    const setTruckId = useSetAtom(sentTruckIdAtom);

    const getBestVoice = (lang: 'en' | 'es') => {
        const voices = window.speechSynthesis.getVoices();
        const targetLocale = lang === 'es' ? 'es-' : 'en-';
        const matches = voices.filter(v => v.lang.startsWith(targetLocale));
        return matches.find(v => v.name.includes('Natural')) || matches.find(v => v.name.includes('Google')) || matches[0] || null;
    };
    
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isListening, setIsListening] = useAtom(onyxIsListeningAtom);
    const [lastError, setLastError] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const getApiKey = () => {
        const key = userApiKey || localStorage.getItem('ONYX_GEMINI_KEY') || (import.meta as any).env.VITE_GEMINI_API_KEY || '';
        return String(key).trim().replace(/['"]/g, '');
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

    useEffect(() => {
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = appLanguage === 'es' ? 'es-MX' : 'en-US';
            recognitionRef.current.onresult = (event: any) => {
                let interimTranscript = '';
                const results = Array.from(event.results);
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (!event.results[i].isFinal) interimTranscript += event.results[i][0].transcript;
                }
                const fullTranscript = results.map((r: any) => r[0].transcript).join('');
                setInput(fullTranscript);
                checkForVendor(fullTranscript);
                if (onTranscriptChange) onTranscriptChange(interimTranscript || fullTranscript);
            };
            recognitionRef.current.onend = () => setIsListening(false);
            recognitionRef.current.onerror = () => setIsListening(false);
        }
    }, [appLanguage]);

    // External Trigger Sync (Orb click etc)
    useEffect(() => {
        if (!recognitionRef.current) return;
        if (isListening) {
            try { recognitionRef.current.start(); } catch (e) {}
        } else {
            try { recognitionRef.current.stop(); } catch (e) {}
        }
    }, [isListening]);

    const toggleListening = () => {
        setIsListening(prev => !prev);
    };

    useEffect(() => {
        const discover = async () => {
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
        discover();
    }, [userApiKey]);

    useEffect(() => {
        if (isListening && onVolumeChange) {
            const startAudio = async () => {
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
            if (audioContextRef.current) audioContextRef.current.close();
            if (onVolumeChange) onVolumeChange(0);
        };
    }, [isListening]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isTyping]);

    const callGemini = async (apiKey: string, model: string, contents: any[], tools?: any[]) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const sys = `You are Onyx Intelligence. Respond in ${appLanguage === 'es' ? 'SPANISH' : 'ENGLISH'}. Real items (Fluorite) = 65. Deploy artifacts always.`;
        const payload: any = { contents, system_instruction: { parts: [{ text: sys }] } };
        if (tools) payload.tools = [{ function_declarations: tools }];
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    };

    const sendMessage = async (overrideInput?: string) => {
        const finalInput = overrideInput || input;
        if (!finalInput.trim() || isTyping) return;
        const apiKey = getApiKey();
        if (!apiKey) return;
        setLastError(null);
        setMessages(prev => [...prev, { role: 'user', content: finalInput }]);
        setInput('');
        setIsTyping(true);
        onProcessingChange(true);
        checkForVendor(finalInput);
        try {
            let contents = messages.filter(m => m.content?.trim()).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
            contents.push({ role: 'user', parts: [{ text: finalInput }] });
            const models = [...availableModels.filter(m => m.includes('flash')), "gemini-1.5-flash"];
            let resp = null;
            let used = "";
            for (const m of models) {
                try { resp = await callGemini(apiKey, m, contents, onyxToolDefinitions); used = m; break; } catch (e) {}
            }
            if (!resp) throw new Error("Link failed.");
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
                    if (d?.action === 'DEPLOY_INVENTORY') setInventoryConfig({ isOpen: true, itemIds: d.ids, title: d.title, viewMode: d.viewMode || 'sidebar' });
                    else if (d?.action === 'DEPLOY_PAYMENTS') setPaymentsConfig({ isOpen: true, vendor: d.vendor, destination: d.destination, title: d.title });
                    else if (d?.action === 'DEPLOY_CRATES') setTruckId(d.truck_id);
                }
                resp = await callGemini(apiKey, used, contents, onyxToolDefinitions);
                iter++;
            }
        } catch (e: any) {
            setLastError(e.message);
            setMessages(prev => [...prev, { role: 'model', content: `Link Interrupted: ${e.message}` }]);
        } finally { setIsTyping(false); onProcessingChange(false); }
    };

    return (
        <div className="flex flex-col h-full w-full overflow-hidden relative">
            {lastError && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 backdrop-blur-xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-500/80">{lastError}</p>
                </div>
            )}

            {/* BOTTOM-RIGHT ALIGNED TIMELINE */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-12 space-y-8 scrollbar-hide flex flex-col items-end">
                <div className="flex-1" />
                <div className="w-full max-w-2xl space-y-8 pb-72"> {/* Increased padding for vertical controls */}
                    {messages.map((m, idx) => (
                        <div key={idx} className="flex flex-col items-end text-right animate-in fade-in slide-in-from-right duration-700">
                            <div className="flex items-center gap-3 mb-2 opacity-20">
                                <span className="text-[9px] font-black uppercase tracking-widest text-white">
                                    {m.role === 'user' ? 'Operator' : 'Neural Core'}
                                </span>
                                <div className="h-px w-6 bg-white/40" />
                            </div>
                            <div className={`p-6 md:p-8 rounded-[2rem] transition-all duration-700 ${
                                m.role === 'user' ? 'bg-white/[0.02] border border-white/5 text-white/70' : 'bg-(--main-color)/5 border border-(--main-color)/20 text-white shadow-2xl'
                            } backdrop-blur-3xl inline-block max-w-[90%]`}>
                                <div className="text-sm md:text-base leading-relaxed tracking-tight prose prose-invert max-w-none text-right">
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

            {/* TACTICAL COMMAND STACK (BOTTOM RIGHT) */}
            <div className="absolute bottom-0 right-0 p-8 md:p-12 pointer-events-none flex flex-col items-end gap-10">
                
                {/* VERTICAL INTEGRATED STACK */}
                <div className="flex flex-col items-end gap-8 pointer-events-auto">
                    
                    {/* Discrete Control Row (Top) */}
                    <div className="flex items-center gap-4 animate-in fade-in slide-in-from-right duration-1000">
                        {/* Language Selector (Transparent) */}
                        <button 
                            onClick={() => setAppLanguage(prev => prev === 'en' ? 'es' : 'en')}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-transparent border border-white/5 text-[9px] font-black text-white/20 hover:text-white hover:border-white/10 transition-all backdrop-blur-3xl"
                        >
                            {appLanguage.toUpperCase()}
                        </button>

                        {/* Transparent Input Field */}
                        <div className="relative min-w-[160px] md:min-w-[240px]">
                            <input 
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                placeholder={appLanguage === 'es' ? "Pregunta..." : "Query..."}
                                className="w-full bg-transparent border-b border-white/5 p-2 px-0 text-xs font-black tracking-[0.4em] text-white outline-none focus:border-white/20 transition-all placeholder:text-white/5 uppercase"
                            />
                            <button 
                                onClick={() => sendMessage()}
                                className={`absolute right-0 top-1/2 -translate-y-1/2 text-white/10 hover:text-white transition-all ${input.trim() ? 'opacity-100' : 'opacity-0'}`}
                            >
                                <Send size={12} />
                            </button>
                        </div>
                    </div>

                    {/* FREE-FLOATING GLASSMORPHIC TALK ICON (Bottom) */}
                    <div className="relative">
                        {isListening && (
                            <div className="absolute bottom-full right-4 mb-4 flex items-center gap-2 opacity-30 animate-in fade-in slide-in-from-bottom-2">
                                <div className="flex gap-1">
                                    {[0, 1, 2].map(i => <div key={i} className="w-0.5 h-3 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 100}ms` }} />)}
                                </div>
                                <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">Active</span>
                            </div>
                        )}

                        <button 
                            onClick={toggleListening}
                            className={`relative flex items-center justify-center transition-all duration-1000 group ${isListening ? 'scale-110' : 'hover:scale-105'}`}
                        >
                            {/* Pure Glass Aura */}
                            <div className="absolute inset-0 rounded-full backdrop-blur-[100px] border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                            
                            <div className={`transition-all duration-700 relative z-10 p-6 ${
                                isListening 
                                    ? 'text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]' 
                                    : 'text-white/10 group-hover:text-white'
                            }`}>
                                {isListening ? <MicOff size={72} strokeWidth={1} /> : <Mic size={72} strokeWidth={1} />}
                            </div>

                            {/* Tactical Pulse Aura */}
                            {isListening && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-24 h-24 rounded-full border border-red-500/20 animate-ping" />
                                    <div className="absolute w-32 h-32 rounded-full border border-red-500/10 animate-pulse scale-110" />
                                </div>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
