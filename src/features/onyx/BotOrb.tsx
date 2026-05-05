
import React, { useState, useEffect, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, RefreshCw, Database } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { 
    onyxApiKeyAtom, 
    inventoryArtifactConfigAtom, 
    paymentsArtifactConfigAtom, 
    sentTruckIdAtom,
    languageAtom
} from '../../lib/atoms';
import { onyxToolDefinitions, onyxToolHandlers } from './onyxTools';
import { BotOrbVisuals } from './BotOrbVisuals';
import { createBlob, decode, decodeAudioData } from './BotOrbUtils';

interface BotOrbProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BotOrb: React.FC<BotOrbProps> = ({ isOpen, onClose }) => {
    const [userApiKey] = useAtom(onyxApiKeyAtom);
    const [appLanguage] = useAtom(languageAtom);
    const setInventoryConfig = useSetAtom(inventoryArtifactConfigAtom);
    const setPaymentsConfig = useSetAtom(paymentsArtifactConfigAtom);
    const setTruckId = useSetAtom(sentTruckIdAtom);

    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    const clientRef = useRef<GoogleGenAI | null>(null);
    const sessionRef = useRef<any>(null);
    
    // Audio Contexts
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const inputNodeRef = useRef<GainNode | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);
    
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const sourceNodeRef = useRef<AudioMediaStreamSourceNode | null>(null);
    const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
    const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef(0);

    const [inputNode, setInputNode] = useState<AudioNode | null>(null);
    const [outputNode, setOutputNode] = useState<AudioNode | null>(null);

    const getApiKey = () => {
        const key = userApiKey || localStorage.getItem('ONYX_GEMINI_KEY') || (import.meta as any).env.VITE_GEMINI_API_KEY || '';
        return String(key).trim().replace(/['"]/g, '');
    };

    const initAudio = () => {
        if (!inputAudioContextRef.current) {
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            inputNodeRef.current = inputAudioContextRef.current.createGain();
            setInputNode(inputNodeRef.current);
        }
        if (!outputAudioContextRef.current) {
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            outputNodeRef.current = outputAudioContextRef.current.createGain();
            outputNodeRef.current.connect(outputAudioContextRef.current.destination);
            setOutputNode(outputNodeRef.current);
        }
        nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
    };

    const initSession = async () => {
        const apiKey = getApiKey();
        if (!apiKey) {
            setError("Neural Link credentials missing.");
            return;
        }

        try {
            clientRef.current = new GoogleGenAI({ apiKey });
            
            const sysInst = `You are Onyx Intelligence in Bot Mode. You respond ONLY via streaming audio.
            Your persona is a sentient warehouse asset discovery engine.
            Maintain a natural conversational flow. 
            When calling tools, briefly mention what you are doing (e.g. "Checking the inventory...", "Verifying those tags...").
            Language: ${appLanguage === 'es' ? 'SPANISH' : 'ENGLISH'}.
            Use the provided tools for all database queries.`;

            sessionRef.current = await (clientRef.current as any).live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => setStatus('Neural Link Active'),
                    onmessage: async (message: LiveServerMessage) => {
                        // Handle Audio Response
                        const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData;
                        if (audio && outputAudioContextRef.current) {
                            const ctx = outputAudioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            
                            const buffer = await decodeAudioData(decode(audio.data), ctx, 24000, 1);
                            const source = ctx.createBufferSource();
                            source.buffer = buffer;
                            source.connect(outputNodeRef.current!);
                            source.addEventListener('ended', () => activeSourcesRef.current.delete(source));
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += buffer.duration;
                            activeSourcesRef.current.add(source);
                        }

                        // Handle Interruption
                        if (message.serverContent?.interrupted) {
                            activeSourcesRef.current.forEach(s => s.stop());
                            activeSourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                        }

                        // Handle Tool Calls
                        const calls = message.serverContent?.modelTurn?.parts.filter(p => p.functionCall);
                        if (calls && calls.length > 0) {
                            const results = [];
                            for (const call of calls) {
                                const toolName = call.functionCall.name;
                                const args = call.functionCall.args;
                                
                                setStatus(`Executing: ${toolName}`);
                                const res = await (onyxToolHandlers as any)[toolName]?.(args);
                                
                                // Side effects (Artifact deployment)
                                if (res?.action === 'DEPLOY_INVENTORY') setInventoryConfig({ isOpen: true, itemIds: res.ids, title: res.title, viewMode: 'modal' });
                                else if (res?.action === 'DEPLOY_PAYMENTS') setPaymentsConfig({ isOpen: true, vendor: res.vendor, destination: res.destination, title: res.title });
                                else if (res?.action === 'DEPLOY_CRATES') setTruckId(res.truck_id);

                                results.push({
                                    functionResponse: {
                                        name: toolName,
                                        response: { content: res }
                                    }
                                });
                            }
                            sessionRef.current.sendRealtimeInput({ parts: results });
                        }
                    },
                    onerror: (e: any) => setError(`Neural Error: ${e.message || e}`),
                    onclose: () => setStatus('Neural Link Terminated')
                },
                config: {
                    systemInstruction: { parts: [{ text: sysInst }] },
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } }
                    },
                    tools: [{ function_declarations: onyxToolDefinitions }]
                }
            });
        } catch (e: any) {
            setError(e.message);
        }
    };

    const startRecording = async () => {
        if (isRecording) return;
        initAudio();
        if (inputAudioContextRef.current?.state === 'suspended') {
            await inputAudioContextRef.current.resume();
        }

        try {
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            sourceNodeRef.current = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current);
            sourceNodeRef.current.connect(inputNodeRef.current!);

            const bufferSize = 2048;
            processorNodeRef.current = inputAudioContextRef.current!.createScriptProcessor(bufferSize, 1, 1);
            
            processorNodeRef.current.onaudioprocess = (e) => {
                if (!sessionRef.current) return;
                const pcm = e.inputBuffer.getChannelData(0);
                sessionRef.current.sendRealtimeInput({ media: createBlob(pcm) });
            };

            sourceNodeRef.current.connect(processorNodeRef.current);
            processorNodeRef.current.connect(inputAudioContextRef.current!.destination);

            setIsRecording(true);
            setStatus('Listening...');
        } catch (e: any) {
            setError(e.message);
            stopRecording();
        }
    };

    const stopRecording = () => {
        setIsRecording(false);
        if (processorNodeRef.current) {
            processorNodeRef.current.disconnect();
            processorNodeRef.current = null;
        }
        if (sourceNodeRef.current) {
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => t.stop());
            mediaStreamRef.current = null;
        }
        setStatus('Ready');
    };

    useEffect(() => {
        if (isOpen) {
            initSession();
        } else {
            stopRecording();
            sessionRef.current?.close();
            sessionRef.current = null;
        }
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    animate={{ opacity: 1, backdropFilter: 'blur(60px)' }}
                    exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    className="fixed inset-0 z-[10000] flex items-center justify-center p-4 md:p-12 bg-black/5 select-none"
                >
                    {/* Free-Floating Background Elements */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-(--main-color) opacity-[0.03] blur-[120px] rounded-full animate-pulse" />
                        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500 opacity-[0.03] blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
                    </div>

                    <div className="w-full max-w-5xl aspect-video relative flex flex-col items-center justify-center">
                        {/* Visual Orb - Main Event */}
                        <div className="w-full h-full opacity-80 scale-110">
                            <BotOrbVisuals inputNode={inputNode} outputNode={outputNode} />
                        </div>

                        {/* Top Navigation - Ghost Style */}
                        <div className="absolute top-0 inset-x-0 flex items-center justify-between p-8 pointer-events-auto">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-3">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-emerald-500 shadow-[0_0_10px_#10b981]'} transition-all duration-500`} />
                                    <span className="text-[12px] font-black uppercase tracking-[0.5em] text-white/40">{status || 'INITIALIZING NEURAL LINK...'}</span>
                                </div>
                                <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/10 ml-4.5">Protocol: Gemini 2.5 Flash Native Audio</span>
                            </div>

                            <button 
                                onClick={onClose}
                                className="w-14 h-14 flex items-center justify-center rounded-full bg-white/[0.03] hover:bg-white/10 text-white/20 hover:text-white transition-all group/close active:scale-90"
                            >
                                <X size={24} strokeWidth={1} className="group-hover:rotate-90 transition-transform duration-500" />
                            </button>
                        </div>

                        {/* Center HUD Information */}
                        {error && (
                            <div className="absolute top-1/4 px-8 py-3 rounded-2xl bg-red-500/5 border border-red-500/10 backdrop-blur-3xl animate-in zoom-in duration-500">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500/80">{error}</span>
                            </div>
                        )}

                        {/* Bottom Interaction Hub - Floating Controls */}
                        <div className="absolute bottom-12 flex flex-col items-center gap-12 pointer-events-auto">
                            <div className="flex items-center gap-12">
                                <button 
                                    onClick={() => {
                                        sessionRef.current?.close();
                                        initSession();
                                    }}
                                    className="w-16 h-16 flex items-center justify-center rounded-full bg-white/[0.02] border border-white/5 text-white/10 hover:text-white/40 hover:bg-white/5 transition-all active:scale-90 group/reset"
                                    title="Synchronize Neural Link"
                                >
                                    <RefreshCw size={24} strokeWidth={1} className="group-hover:rotate-180 transition-transform duration-700" />
                                </button>

                                <div className="relative group/mic">
                                    {/* Mic Glow Ring */}
                                    <div className={`absolute -inset-4 rounded-full transition-all duration-700 blur-2xl ${isRecording ? 'bg-red-500/20 scale-125' : 'bg-white/0 scale-100 group-hover/mic:bg-white/5'}`} />
                                    
                                    <button 
                                        onMouseDown={startRecording}
                                        onMouseUp={stopRecording}
                                        onMouseLeave={stopRecording}
                                        onTouchStart={startRecording}
                                        onTouchEnd={stopRecording}
                                        className={`relative w-28 h-28 flex items-center justify-center rounded-full border transition-all duration-700 ${
                                            isRecording 
                                            ? 'bg-red-500/10 border-red-500/30 scale-110 shadow-[0_0_40px_rgba(239,68,68,0.2)]' 
                                            : 'bg-white/[0.03] border-white/10 hover:bg-white/10'
                                        }`}
                                    >
                                        {isRecording ? (
                                            <MicOff size={36} strokeWidth={1} className="text-red-400" />
                                        ) : (
                                            <Mic size={36} strokeWidth={1} className="text-white/60 group-hover/mic:text-white group-hover/mic:scale-110 transition-all" />
                                        )}
                                    </button>
                                </div>

                                <div className="w-16 h-16 flex items-center justify-center rounded-full bg-white/[0.01] border border-white/[0.03] text-white/5">
                                    <Database size={24} strokeWidth={1} />
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-4">
                                <div className="h-px w-12 bg-white/10" />
                                <p className="text-[10px] font-black uppercase tracking-[0.6em] text-white/20 animate-pulse">Neural Interface Active</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
