import React, { useState, useEffect } from 'react';
import { useOnyx, OnyxChatHistory, OnyxChatControls } from './OnyxChat';
import { OnyxVisuals } from './OnyxVisuals';
import { OnyxContextModal } from './OnyxContextModal';
import { 
    inventoryArtifactConfigAtom, 
    onyxIsTypingAtom, 
    onyxIsListeningAtom
} from '../../lib/atoms';
import { useAtom, useAtomValue } from 'jotai';

export function OnyxOrbView() {
    const onyx = useOnyx();
    const [isContextOpen, setIsContextOpen] = useState(false);
    const [isSetupOpen, setIsSetupOpen] = useState(false);
    const artifactConfig = useAtomValue(inventoryArtifactConfigAtom);
    const isTyping = useAtomValue(onyxIsTypingAtom);
    const isListening = useAtomValue(onyxIsListeningAtom);
    const { input } = onyx;
    const [requestSend, setRequestSend] = useState(0);
    const [tempKey, setTempKey] = useState('');

    // Auto-send when requestSend triggers (manual click on transcript)
    useEffect(() => {
        if (requestSend > 0 && onyx.input.trim()) {
            onyx.sendMessage(onyx.input);
        }
    }, [requestSend]);

    return (
        <div className="flex flex-col h-full w-full bg-[#050505] overflow-hidden relative font-['Inter']">
            
            {/* Global Error HUD */}
            {onyx.lastError && (
                <div 
                    onClick={() => setIsSetupOpen(true)}
                    className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 backdrop-blur-xl animate-in fade-in slide-in-from-top duration-500 cursor-pointer hover:bg-red-500/20 transition-all group"
                >
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-500/80 group-hover:text-red-400 flex items-center gap-2">
                        {onyx.lastError}
                        {onyx.lastError.includes("Credentials") && <span className="opacity-40 ml-1 underline decoration-dotted">CONFIGURE LINK</span>}
                    </p>
                </div>
            )}

            {/* Neural Link Setup Overlay */}
            {isSetupOpen && (
                <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
                    <div className="w-full max-w-sm space-y-8 text-center">
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black uppercase tracking-[0.4em] text-white">Neural Core Sync</h3>
                            <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Enter Gemini AI Credentials to activate Link</p>
                        </div>
                        
                        <div className="relative group">
                            <input 
                                type="password"
                                placeholder="PASTE NEURAL KEY..."
                                value={tempKey}
                                onChange={(e) => setTempKey(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-6 py-4 text-center text-sm font-bold tracking-widest text-white placeholder:text-white/10 focus:border-(--main-color) focus:ring-2 focus:ring-(--main-color)/20 transition-all outline-none"
                            />
                            <div className="absolute inset-0 rounded-xl border border-(--main-color)/20 opacity-0 group-focus-within:opacity-100 animate-pulse pointer-events-none" />
                        </div>

                        <div className="flex flex-col gap-4">
                            <button 
                                onClick={() => {
                                    if (tempKey.trim()) {
                                        onyx.setOnyxApiKey(tempKey.trim());
                                        setIsSetupOpen(false);
                                        onyx.setLastError(null);
                                    }
                                }}
                                className="w-full py-4 bg-(--main-color) text-black font-black uppercase tracking-[0.3em] rounded-xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_30px_rgba(var(--main-color-rgb),0.3)]"
                            >
                                Activate Link
                            </button>
                            <button 
                                onClick={() => setIsSetupOpen(false)}
                                className="w-full py-2 text-[9px] font-black uppercase tracking-[0.4em] text-white/20 hover:text-white transition-all"
                            >
                                Bypass Sync
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Background Layer: The Neural Link Visualizer */}
            <div 
                className="absolute inset-0 z-0 cursor-pointer w-full h-full flex items-center justify-center overflow-hidden"
                onClick={(e) => {
                    e.stopPropagation();
                    onyx.unlockTTS();
                    onyx.setIsListening(!onyx.isListening);
                }}
            >
                <div className="w-full h-full relative flex items-center justify-center">
                    <OnyxVisuals isProcessing={isTyping} volume={onyx.volume} />
                </div>
            </div>

            {/* INTERACTION LAYER */}
            <div className="flex-1 flex flex-col relative z-10">
                {/* Tactical HUD Overlay */}
                <div className={`absolute inset-0 z-20 flex flex-col p-6 md:p-12 pointer-events-none transition-all duration-700 ${artifactConfig.isOpen ? 'blur-3xl opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                    
                    {/* Floating Transcript */}
                    {onyx.input && (
                        <div className="absolute inset-x-0 top-[15%] flex items-center justify-center p-8 md:p-24 z-10">
                            <h2 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setRequestSend(p => p + 1);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="text-xl md:text-2xl font-black text-white/40 hover:text-(--main-color) cursor-pointer text-center uppercase tracking-[0.3em] leading-tight transition-all duration-300 drop-shadow-2xl pointer-events-auto"
                            >
                                {onyx.input}
                            </h2>
                        </div>
                    )}

                    {/* HISTORY CONVERSATION - Glassmorphic Panels inside the Orb */}
                    <div className="flex-1 w-full h-full">
                        <OnyxChatHistory messages={onyx.messages} isTyping={isTyping} />
                    </div>
                </div>

                {/* Context Knowledge Overlay */}
                <OnyxContextModal isOpen={isContextOpen} onClose={() => setIsContextOpen(false)} />
            </div>

            {/* MINIMALIST COMPACT TACTICAL CONTROL BAR (Translucent Glassmorphic) */}
            <div className="h-auto z-40 relative">
                <OnyxChatControls 
                    input={onyx.input}
                    setInput={onyx.setInput}
                    sendMessage={onyx.sendMessage}
                    isListening={onyx.isListening}
                    setIsListening={onyx.setIsListening}
                    stopVoice={onyx.stopVoice}
                    isTyping={onyx.isTyping}
                    unlockTTS={onyx.unlockTTS}
                    startAudioCapture={onyx.startAudioCapture}
                />
            </div>
        </div>
    );
}
