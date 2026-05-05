
import React, { useState, useRef, useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { 
    onyxMessagesAtom, 
    onyxApiKeyAtom, 
    inventoryArtifactConfigAtom, 
    paymentsArtifactConfigAtom, 
    sentTruckIdAtom,
    languageAtom
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

// Speech Recognition Type Definition
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function OnyxChat({ onProcessingChange, onTranscriptChange, onVendorDetect, onVolumeChange }: OnyxChatProps) {
    const [messages, setMessages] = useAtom(onyxMessagesAtom);
    const [userApiKey, setUserApiKey] = useAtom(onyxApiKeyAtom);
    const [appLanguage, setAppLanguage] = useAtom(languageAtom);
    const setInventoryConfig = useSetAtom(inventoryArtifactConfigAtom);
    const setPaymentsConfig = useSetAtom(paymentsArtifactConfigAtom);
    const setTruckId = useSetAtom(sentTruckIdAtom);

    // Natural Voice Selection Logic
    const getBestVoice = (lang: 'en' | 'es') => {
        const voices = window.speechSynthesis.getVoices();
        const targetLocale = lang === 'es' ? 'es-' : 'en-';
        
        // Prioritization: 1. "Natural" voices, 2. "Google" voices, 3. Matches for locale
        const matches = voices.filter(v => v.lang.startsWith(targetLocale));
        
        const best = matches.find(v => v.name.includes('Natural')) || 
                     matches.find(v => v.name.includes('Google')) || 
                     matches[0];
        
        return best || null;
    };
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [showKeyInput, setShowKeyInput] = useState(!userApiKey);
    const [isKeyVisible, setIsKeyVisible] = useState(false);
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
        const clean = String(key).trim().replace(/['"]/g, '');
        return (clean === 'null' || clean === 'undefined') ? '' : clean;
    };

    // Vendor Detection Logic
    const checkForVendor = (text: string) => {
        if (!onVendorDetect) return;
        const lower = text.toLowerCase();
        
        // Map from onyxBusinessRules context (manual mapping for speed)
        const vendorMap: Record<string, string> = {
            'emmanuel': '#00AEEF',
            'gerardo': '#F7941D',
            'jose': '#6BCEBB',
            'carlos': '#85C1E9',
            'angel': '#FFED00',
            'susana': '#B19CD9',
            'tellez': '#FFCB05',
            'delfino': '#8DC63F',
            'maria': '#F9A17A',
            'fountain': '#F36F21',
            'eduardo': '#636466',
            'alejandro': '#800020',
            'bernardo': '#603913',
            'roberto': '#00A591',
            'gift': '#D11C7E',
            'cantera': '#A01E5D'
        };

        for (const [name, color] of Object.entries(vendorMap)) {
            if (lower.includes(name)) {
                onVendorDetect(color);
                break;
            }
        }
    };

    // Initialize Speech Recognition
    useEffect(() => {
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'en-US';

            recognitionRef.current.onresult = (event: any) => {
                let interimTranscript = '';
                const results = Array.from(event.results);
                
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        // Final is handled via setInput eventually, but we want the full string now
                    } else {
                        interimTranscript += transcript;
                    }
                }

                const fullTranscript = results.map((r: any) => r[0].transcript).join('');
                setInput(fullTranscript);
                checkForVendor(fullTranscript);
                if (onTranscriptChange) onTranscriptChange(interimTranscript || fullTranscript);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech Recognition Error:", event.error);
                setIsListening(false);
            };
        }
    }, []);

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert("Speech recognition is not supported in this browser.");
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
        } else {
            setIsListening(true);
            recognitionRef.current.start();
        }
    };

    useEffect(() => {
        const discover = async () => {
            const key = getApiKey();
            if (!key || key.length < 10) return;
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
                if (res.ok) {
                    const data = await res.json();
                    const names = data.models?.map((m: any) => m.name.replace('models/', '')) || [];
                    setAvailableModels(names);
                }
            } catch (e) {}
        };
        discover();
    }, [userApiKey]);

    // Audio Analysis Loop
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
                        
                        // Calculate average volume with boosted sensitivity
                        const sum = dataArrayRef.current.reduce((a, b) => a + b, 0);
                        const avg = sum / dataArrayRef.current.length;
                        const normalized = Math.min(1, (avg / 64) * 1.5); // Boosted sensitivity
                        onVolumeChange(normalized);
                        
                        animationFrameRef.current = requestAnimationFrame(updateVolume);
                    };
                    updateVolume();
                } catch (e) {
                    console.error("Audio Context Error:", e);
                }
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
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const callGemini = async (apiKey: string, model: string, contents: any[], tools?: any[]) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const systemInstruction = {
            parts: [{
                text: `You are Onyx Intelligence, the advanced AI core for the warehouse. 
                Your primary goal is absolute accuracy and visual data manifest.
                
                LANGUAGE MODE: You MUST respond entirely in ${appLanguage === 'es' ? 'SPANISH' : 'ENGLISH'}.
                
                LOGIC RULES:
                1. GROUND TRUTH (COUNTING): If asked for inventory counts or "how many", ALWAYS prioritize items with 'status: Acquisition'. For 'Fluorite', the reality is 65 items (Acquisition). If there are more (e.g. 78 total), refer to the extra 13 as "In Stock/Available" but focus on the 65 as the primary warehouse figure.
                2. ARTIFACT PROTOCOL: You MUST call 'deploy_inventory_artifact' after every 'search_inventory' or 'get_inventory_summary' call. Do NOT just provide a text answer. The user MUST see the glassmorphic artifact.
                3. IDENTIFIERS: Prioritize 'Tag IDs' (book_barcode) and 'Barcodes'.
                4. SCOPE: Default to an inclusive 'Global Scan' but report 'Acquisition' counts as the primary "Reality" figure for the user.
                5. SEMANTIC PRECISION: Distinguish between categories (Lamps vs Bowls).
                6. VENDORS: Map names like 'Emmanuel' to 'EM' and 'Gerardo' to 'GE'. Use hierarchical prefix matching.
                
                Keep responses data-driven, concise, and ALWAYS DEPLOY THE ARTIFACT.`
            }]
        };

        const payload: any = { 
            contents,
            system_instruction: systemInstruction
        };
        if (tools) payload.tools = [{ function_declarations: tools }];

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `HTTP ${res.status}`);
        }
        return await res.json();
    };

    const sendMessage = async (overrideInput?: string) => {
        const finalInput = overrideInput || input;
        if (!finalInput.trim() || isTyping) return;

        const apiKey = getApiKey();
        if (!apiKey) return;

        setLastError(null);
        const userMsg = { role: 'user', content: finalInput };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);
        onProcessingChange(true);
        checkForVendor(finalInput);

        try {
            let contents = messages
                .filter(m => m.content && m.content.trim() !== '')
                .map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }));
            
            contents.push({
                role: 'user',
                parts: [{ text: userMsg.content }]
            });

            const fallbacks = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-pro"];
            const modelsToTry = [
                ...availableModels.filter(m => m.includes('flash') || m.includes('pro')),
                ...fallbacks
            ].filter((v, i, a) => a.indexOf(v) === i);

            let responseData = null;
            let usedModel = "";

            for (const modelName of modelsToTry) {
                try {
                    responseData = await callGemini(apiKey, modelName, contents, onyxToolDefinitions);
                    usedModel = modelName;
                    break;
                } catch (e: any) {
                    if (e.message.toLowerCase().includes('expired')) throw e;
                }
            }

            if (!responseData) throw new Error("All model conduits rejected the link.");

            let iteration = 0;
            while (iteration < 5) {
                const firstCandidate = responseData.candidates?.[0];
                if (!firstCandidate) break;

                const parts = firstCandidate.content?.parts || [];
                const toolCalls = parts.filter((p: any) => p.functionCall);
                const textResponse = parts.find((p: any) => p.text)?.text;

                if (toolCalls.length === 0) {
                    if (textResponse) {
                        setMessages(prev => [...prev, { role: 'model', content: textResponse }]);
                        // Speak the response with visual sync
                        if ('speechSynthesis' in window) {
                             const utterance = new SpeechSynthesisUtterance(textResponse);
                             utterance.lang = appLanguage === 'es' ? 'es-MX' : 'en-US';
                             utterance.voice = getBestVoice(appLanguage);
                             utterance.rate = 1.0;
                             utterance.pitch = 1.0;
                             
                             utterance.onstart = () => {
                                 // Simulate speech pulse
                                 const pulseInterval = setInterval(() => {
                                     if (onVolumeChange) onVolumeChange(0.3 + Math.random() * 0.4);
                                 }, 50);
                                 (utterance as any)._pulseId = pulseInterval;
                             };
                             
                             utterance.onend = () => {
                                 if ((utterance as any)._pulseId) clearInterval((utterance as any)._pulseId);
                                 if (onVolumeChange) onVolumeChange(0);
                             };

                             window.speechSynthesis.speak(utterance);
                        }
                    }
                    break;
                }

                contents.push(firstCandidate.content);
                const toolResponsesParts = [];
                for (const call of toolCalls) {
                    const fnName = call.functionCall.name;
                    const args = call.functionCall.args;
                    const handler = (onyxToolHandlers as any)[fnName];
                    if (handler) {
                        const result = await handler(args);
                        toolResponsesParts.push({
                            functionResponse: { name: fnName, response: { content: result } }
                        });
                    }
                }

                contents.push({ role: 'function', parts: toolResponsesParts });
                
                // --- ARTIFACT DEPLOYMENT LOGIC ---
                for (const resp of toolResponsesParts) {
                    const data = resp.functionResponse.response.content;
                    if (data && data.action) {
                        if (data.action === 'DEPLOY_INVENTORY') {
                            setInventoryConfig({
                                isOpen: true,
                                itemIds: data.ids,
                                title: data.title || 'Onyx Search Results',
                                viewMode: data.viewMode || 'sidebar'
                            });
                        } else if (data.action === 'DEPLOY_PAYMENTS') {
                            setPaymentsConfig({
                                isOpen: true,
                                vendor: data.vendor,
                                destination: data.destination,
                                title: data.title || 'Financial Audit'
                            });
                        } else if (data.action === 'DEPLOY_CRATES') {
                            setTruckId(data.truck_id);
                        }
                    }
                }
                // ---------------------------------

                responseData = await callGemini(apiKey, usedModel, contents, onyxToolDefinitions);
                iteration++;
            }

        } catch (error: any) {
            console.error("Onyx Error:", error);
            const errMsg = error.message || "Synthesis interrupted.";
            setLastError(errMsg);
            setMessages(prev => [...prev, { role: 'model', content: `Neural Link Interrupted: ${errMsg}` }]);
        } finally {
            setIsTyping(false);
            onProcessingChange(false);
        }
    };

    return (
        <div className="flex flex-col h-full w-full overflow-hidden relative">
            {/* Minimalist Error Overlay */}
            {lastError && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 backdrop-blur-xl animate-in fade-in zoom-in duration-500">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-500/80">{lastError}</p>
                </div>
            )}

            {/* Scrollable Neural Timeline */}
            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scrollbar-hide flex flex-col"
            >
                {/* Spacer to push content to bottom when list is short */}
                <div className="flex-1" />
                
                <div className="space-y-8 pb-4">
                    {messages.map((m, idx) => (
                        <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-700`}>
                            <div className={`max-w-[80%] group ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`flex items-center gap-3 mb-2 px-2 opacity-0 group-hover:opacity-40 transition-all duration-500 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-white">
                                        {m.role === 'user' ? 'Operator' : 'Neural Core'}
                                    </span>
                                    <div className="h-px w-8 bg-white/20" />
                                </div>
                                
                                <div className={`p-5 md:p-7 rounded-[2rem] transition-all duration-700 ${
                                    m.role === 'user' 
                                        ? 'bg-white/5 border border-white/10 text-white hover:bg-white/10' 
                                        : 'bg-(--main-color)/5 border border-(--main-color)/20 text-white/90 shadow-[0_30px_100px_rgba(0,0,0,0.5)] hover:border-(--main-color)/40'
                                } backdrop-blur-3xl`}>
                                    <div className="text-sm md:text-base leading-relaxed tracking-tight prose prose-invert max-w-none">
                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {isTyping && (
                        <div className="flex justify-start px-2">
                            <div className="bg-(--main-color)/5 border border-(--main-color)/20 p-5 rounded-full animate-pulse backdrop-blur-3xl">
                                <div className="flex gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-(--main-color)/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-(--main-color)/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-(--main-color)/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* REDESIGNED: Control Interface with Large Dedicated TALK Button */}
            <div className="shrink-0">
                {/* Floating Input Bar */}
                <div className="px-6 pb-2">
                    <div className="relative group max-w-2xl mx-auto flex items-center gap-4">
                        {/* Language Toggle */}
                        <button 
                            onClick={() => setAppLanguage(prev => prev === 'en' ? 'es' : 'en')}
                            className="w-14 h-14 shrink-0 flex items-center justify-center rounded-full bg-white/[0.03] border border-white/10 backdrop-blur-xl text-white/40 hover:text-(--main-color) hover:border-(--main-color)/40 hover:bg-(--main-color)/10 transition-all group/lang shadow-2xl"
                            title={appLanguage === 'en' ? "Switch to Spanish" : "Switch to English"}
                        >
                            <div className="relative flex flex-col items-center">
                                <span className={`text-[10px] font-black transition-all ${appLanguage === 'es' ? 'text-(--main-color) scale-110' : 'opacity-20 scale-90'}`}>ES</span>
                                <div className="h-px w-4 bg-white/10 my-0.5" />
                                <span className={`text-[10px] font-black transition-all ${appLanguage === 'en' ? 'text-(--main-color) scale-110' : 'opacity-20 scale-90'}`}>EN</span>
                            </div>
                        </button>

                        <div className="relative flex-1 group/input">
                            <div className="relative flex items-center gap-4 bg-white/[0.03] border border-white/10 p-2 md:p-3 rounded-[3rem] backdrop-blur-[40px] shadow-2xl transition-all duration-1000 group-hover/input:border-white/20 group-hover/input:bg-white/[0.05]">
                                <input 
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder={appLanguage === 'es' ? "Pregunta al núcleo..." : "Query the core..."}
                                    className="flex-1 bg-transparent border-none outline-none text-white text-sm md:text-base font-medium placeholder:text-white/10 px-6"
                                />

                                <button 
                                    onClick={() => sendMessage()}
                                    disabled={!input.trim() || isTyping}
                                    className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-500 ${
                                        input.trim() && !isTyping
                                            ? 'bg-(--main-color)/20 text-(--main-color) hover:bg-(--main-color)/30 hover:scale-105'
                                            : 'opacity-10'
                                    }`}
                                >
                                    <Send size={20} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* LARGE DEDICATED TALK BAR */}
                <div className="px-6 pb-6 pt-2">
                    <div className="max-w-2xl mx-auto">
                        <button 
                            onClick={toggleListening}
                            className={`w-full group relative flex items-center justify-center gap-4 py-8 rounded-[2.5rem] border transition-all duration-700 overflow-hidden ${
                                isListening 
                                    ? 'bg-red-500/10 border-red-500/40 shadow-[0_0_80px_rgba(239,68,68,0.2)]' 
                                    : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20 shadow-2xl'
                            } backdrop-blur-3xl`}
                        >
                            {/* Visual Pulse for Listening State */}
                            {isListening && (
                                <div className="absolute inset-0 pointer-events-none">
                                    <div className="absolute inset-0 bg-red-500/5 animate-pulse" />
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-shimmer" />
                                </div>
                            )}

                            <div className={`p-4 rounded-full transition-all duration-500 ${isListening ? 'bg-red-500 text-white scale-125' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:scale-110'}`}>
                                {isListening ? <MicOff size={32} strokeWidth={1.5} /> : <Mic size={32} strokeWidth={1.5} />}
                            </div>

                            <div className="flex flex-col items-start">
                                <span className={`text-[14px] font-black uppercase tracking-[0.5em] transition-all duration-500 ${isListening ? 'text-red-500' : 'text-white/40 group-hover:text-white group-hover:tracking-[0.6em]'}`}>
                                    {isListening ? (appLanguage === 'es' ? "DETENER" : "STOP") : (appLanguage === 'es' ? "HABLAR" : "TALK")}
                                </span>
                                <span className={`text-[9px] font-black uppercase tracking-[0.2em] mt-1 transition-all duration-500 ${isListening ? 'text-red-500/60' : 'text-white/10'}`}>
                                    {isListening ? (appLanguage === 'es' ? "Escuchando voz..." : "Listening to voice...") : (appLanguage === 'es' ? "Presiona para enviar comando" : "Press to send command")}
                                </span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
