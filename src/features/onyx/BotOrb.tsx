
import React, { useState, useEffect, useRef } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RefreshCw, Database } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { 
    isBotOrbOpenAtom,
    inventoryArtifactConfigAtom, 
    languageAtom
} from '../../lib/atoms';
import { OnyxVisuals } from './OnyxVisuals';
import { onyxToolHandlers } from './onyxTools';
import { decode, decodeAudioData, createBlob } from './BotOrbUtils';
import { tr } from '../../lib/i18n';

interface BotOrbProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BotOrb: React.FC<BotOrbProps> = ({ isOpen, onClose }) => {
    const [isBotOpen, setIsBotOpen] = useAtom(isBotOrbOpenAtom);
    const setInventoryConfig = useSetAtom(inventoryArtifactConfigAtom);
    const [language] = useAtom(languageAtom);

    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState('');
    const [transcription, setTranscription] = useState('');
    const [error, setError] = useState('');
    const [audioActivity, setAudioActivity] = useState(0);
    const [textInput, setTextInput] = useState('');

    const clientRef = useRef<GoogleGenAI | null>(null);
    const sessionRef = useRef<any>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const inputNodeRef = useRef<GainNode | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);
    const nextStartTimeRef = useRef(0);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    // Initialize Audio
    useEffect(() => {
        if (!isOpen) return;

        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        inputNodeRef.current = inputAudioContextRef.current.createGain();
        outputNodeRef.current = outputAudioContextRef.current.createGain();
        outputNodeRef.current.connect(outputAudioContextRef.current.destination);

        initClient();

        return () => {
            stopRecording();
            sessionRef.current?.close();
            inputAudioContextRef.current?.close();
            outputAudioContextRef.current?.close();
        };
    }, [isOpen]);

    const initClient = async () => {
        const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            setError('Neural API Key missing');
            return;
        }

        clientRef.current = new GoogleGenAI({ apiKey });
        initSession();
    };

    const initSession = async () => {
        // REINSTATED ORIGINAL BETA MODEL AS REQUESTED
        const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

        try {
            sessionRef.current = await clientRef.current!.live.connect({
                model,
                callbacks: {
                    onopen: () => setStatus('Neural Link Established'),
                    onmessage: async (message: LiveServerMessage) => {
                        const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData;
                        if (audio && outputAudioContextRef.current) {
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                            const audioBuffer = await decodeAudioData(decode(audio.data), outputAudioContextRef.current, 24000, 1);
                            const source = outputAudioContextRef.current.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputNodeRef.current!);
                            source.addEventListener('ended', () => sourcesRef.current.delete(source));
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                        }

                        const interrupted = message.serverContent?.interrupted;
                        if (interrupted) {
                            sourcesRef.current.forEach(s => s.stop());
                            sourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                        }

                        const calls = message.serverContent?.modelTurn?.parts.filter(p => p.functionCall);
                        if (calls && calls.length > 0) {
                            for (const call of (calls as any)) {
                                const toolName = call.functionCall.name;
                                const args = call.functionCall.args;
                                setStatus(`Processing: ${toolName}`);
                                setTranscription(`Neural Discovery: Checking ${toolName}...`);
                                const res = await (onyxToolHandlers as any)[toolName]?.(args);
                                
                                if ((toolName === 'search_inventory' || toolName === 'deploy_inventory_artifact') && (res?.items || res?.ids)) {
                                    setInventoryConfig({
                                        isOpen: true,
                                        itemIds: res.items ? res.items.map((i: any) => i.id || i.tag_id) : res.ids,
                                        title: res.title || `Onyx Search: ${args.query || args.vendor || 'Results'}`
                                    });
                                }

                                sessionRef.current.sendRealtimeInput({
                                    functionResponses: [{
                                        name: toolName,
                                        response: { result: res },
                                        id: call.functionCall.id
                                    }]
                                });
                            }
                        }
                    },
                    onerror: (e: any) => setError(`Neural Glitch: ${e.message}`),
                    onclose: (e: any) => setStatus('Neural Link Severed')
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } }
                    },
                    tools: [{ functionDeclarations: Object.values(onyxToolHandlers).map(h => (h as any).declaration) }]
                }
            });
        } catch (e: any) {
            setError('Neural Initialization Failed');
        }
    };

    const startRecording = async () => {
        if (isRecording || !inputAudioContextRef.current) return;
        inputAudioContextRef.current.resume();
        setIsRecording(true);
        setStatus('🔴 Neural Capture Active');
        setTranscription('');

        try {
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            sourceNodeRef.current = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            sourceNodeRef.current.connect(inputNodeRef.current!);

            const bufferSize = 2048;
            processorNodeRef.current = inputAudioContextRef.current.createScriptProcessor(bufferSize, 1, 1);
            processorNodeRef.current.onaudioprocess = (e) => {
                if (!sessionRef.current || !isRecording) return;
                const pcmData = e.inputBuffer.getChannelData(0);
                
                // Calculate activity for UI feedback
                let sum = 0;
                for(let i = 0; i < pcmData.length; i++) sum += pcmData[i] * pcmData[i];
                const rms = Math.sqrt(sum / pcmData.length);
                setAudioActivity(rms);

                sessionRef.current.sendRealtimeInput({ media: createBlob(pcmData) });
            };

            sourceNodeRef.current.connect(processorNodeRef.current);
            processorNodeRef.current.connect(inputAudioContextRef.current.destination);
        } catch (err) {
            setError('Microphone Access Denied');
            stopRecording();
        }
    };

    const stopRecording = () => {
        setIsRecording(false);
        setAudioActivity(0);
        setStatus('Neural Interface Idle');
        
        processorNodeRef.current?.disconnect();
        sourceNodeRef.current?.disconnect();
        processorNodeRef.current = null;
        sourceNodeRef.current = null;

        mediaStreamRef.current?.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
    };

    const sendTextInput = () => {
        if (!textInput.trim() || !sessionRef.current) return;
        sessionRef.current.sendRealtimeInput({
            text: textInput
        });
        setTranscription(`Neural Query: ${textInput}`);
        setTextInput('');
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                animate={{ opacity: 1, backdropFilter: 'blur(60px)' }}
                exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                className="fixed inset-0 z-[10000] flex items-center justify-center p-4 md:p-12 bg-black/40"
            >
                {/* Background Glows */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[radial-gradient(circle,_rgba(59,130,246,0.1)_0%,_transparent_70%)] transform-gpu will-change-opacity rounded-full animate-pulse" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[radial-gradient(circle,_rgba(239,68,68,0.1)_0%,_transparent_70%)] transform-gpu will-change-opacity rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
                </div>

                <div className="w-full max-w-6xl h-full relative flex flex-col items-center md:items-start justify-center">
                    
                    {/* Main Orb Button */}
                    <div 
                        className="relative flex-1 w-full flex flex-col items-center justify-center cursor-pointer group/orb"
                        onPointerDown={(e) => { e.stopPropagation(); startRecording(); }}
                        onPointerUp={(e) => { e.stopPropagation(); stopRecording(); }}
                        onPointerLeave={stopRecording}
                        onPointerCancel={stopRecording}
                    >
                        {/* Visual Orb */}
                        <div className={`w-full h-full transition-all duration-1000 ${isRecording ? 'opacity-100 scale-105' : 'opacity-70 scale-100 group-hover/orb:opacity-90'}`}>
                            <OnyxVisuals 
                                volume={isRecording ? audioActivity * 2 : 0}
                                isProcessing={status.includes('Processing')} 
                            />
                        </div>

                        {/* Transcription/Status Overlay */}
                        <AnimatePresence>
                            {(transcription || isRecording || status.includes('Processing')) && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 20 }}
                                    className="absolute bottom-[20%] z-50 px-10 py-6 rounded-[2.5rem] bg-black/40 border border-white/10 backdrop-blur-3xl shadow-[0_0_80px_rgba(0,0,0,0.8)] max-w-3xl text-center md:text-left pointer-events-none"
                                >
                                    <p className="text-lg md:text-xl font-black text-white uppercase tracking-[0.2em] leading-tight">
                                        {isRecording ? (
                                            <span className="flex items-center justify-center gap-4 text-red-500 animate-pulse">
                                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                                {tr("NEURAL CAPTURE ACTIVE...")}
                                            </span>
                                        ) : transcription || status}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Navigation */}
                    <div className="absolute top-0 inset-x-0 flex items-center justify-between p-8 pointer-events-none">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 shadow-[0_0_15px_#ef4444]' : 'bg-emerald-500 shadow-[0_0_15px_#10b981]'} transition-all duration-500`} />
                                <span className="text-[12px] font-black uppercase tracking-[0.5em] text-white/40">{tr("Onyx Neural Link")}</span>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/10 ml-5">{tr("Core: Gemini 2.5 Flash Native Audio")}</span>
                        </div>

                        <button 
                            onClick={onClose}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="w-14 h-14 flex items-center justify-center rounded-full bg-white/[0.03] border border-white/5 text-white/20 hover:text-white transition-all group/close active:scale-90 pointer-events-auto"
                        >
                            <X size={24} strokeWidth={1} className="group-hover:rotate-90 transition-transform duration-500" />
                        </button>
                    </div>

                    {/* Controls */}
                    <div className="absolute bottom-12 flex flex-col items-center md:items-start gap-8 pointer-events-auto w-full md:w-auto px-8 md:px-0">
                        
                        {/* Text Query Field */}
                        <form 
                            onSubmit={(e) => { e.preventDefault(); sendTextInput(); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="w-full max-w-md bg-white/[0.03] border border-white/5 rounded-2xl p-1 flex items-center gap-2 backdrop-blur-xl group/input focus-within:border-white/20 transition-all"
                        >
                            <input 
                                type="text"
                                inputMode="text"
                                enterKeyHint="send"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                placeholder={tr("Neural Query...")}
                                className="flex-1 bg-transparent border-none outline-none text-white px-4 py-3 text-sm font-bold tracking-widest placeholder:text-white/10 uppercase"
                            />
                            <button 
                                type="submit"
                                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${textInput.trim() ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.1)]' : 'text-white/5'}`}
                            >
                                <ChevronRight size={20} strokeWidth={3} />
                            </button>
                        </form>

                        <div className="flex items-center gap-16">
                            <button 
                                onClick={resetNeuralKey}
                                className="w-16 h-16 flex items-center justify-center rounded-full bg-white/[0.02] border border-white/5 text-white/10 hover:text-red-500/40 transition-all active:scale-90"
                            >
                                <RefreshCw size={24} strokeWidth={1} />
                            </button>

                            <div className="flex flex-col items-center gap-4">
                                <div className="h-px w-12 bg-white/20" />
                                <p className="text-[11px] font-black uppercase tracking-[0.8em] text-white/30">{tr("Hold Orb to Talk")}</p>
                            </div>

                            <button 
                                onClick={() => { sourcesRef.current.forEach(s => s.stop()); sourcesRef.current.clear(); }}
                                className="w-16 h-16 flex items-center justify-center rounded-full bg-white/[0.02] border border-white/5 text-white/10 hover:text-red-500 transition-all active:scale-90"
                            >
                                <Database size={24} strokeWidth={1} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Error Overlay */}
                <AnimatePresence>
                    {(error) && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="absolute top-1/4 px-8 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-3xl"
                        >
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500">{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
};
