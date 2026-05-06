import React, { useState, useEffect } from 'react';
import { useOnyx, OnyxChatHistory, OnyxChatControls } from './OnyxChat';
import { OnyxVisuals } from './OnyxVisuals';
import { OnyxContextModal } from './OnyxContextModal';
import { 
    inventoryArtifactConfigAtom, 
    languageAtom, 
    onyxIsTypingAtom, 
    onyxIsListeningAtom 
} from '../../lib/atoms';
import { useAtom, useAtomValue } from 'jotai';
import { Package, Square } from 'lucide-react';

export function OnyxOrbView() {
    const onyx = useOnyx();
    const [isContextOpen, setIsContextOpen] = useState(false);
    const [artifactConfig, setArtifactConfig] = useAtom(inventoryArtifactConfigAtom);
    const isTyping = useAtomValue(onyxIsTypingAtom);
    const isListening = useAtomValue(onyxIsListeningAtom);
    const { input } = onyx;
    const [requestSend, setRequestSend] = useState(0);

    // Auto-send when requestSend triggers (manual click on transcript)
    useEffect(() => {
        if (requestSend > 0 && onyx.input.trim()) {
            onyx.sendMessage(onyx.input);
        }
    }, [requestSend]);

    return (
        <div className="flex flex-col h-full w-full bg-[#050505] overflow-hidden relative font-['Inter']">
            
            {/* TACTICAL TOP BAR */}
            <div className="absolute top-0 inset-x-0 z-50 p-6 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-4 pointer-events-auto">
                    {/* Language Toggle */}
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onyx.setAppLanguage(prev => prev === 'en' ? 'es' : 'en');
                        }}
                        className="px-6 py-2 bg-white/5 border border-white/10 backdrop-blur-3xl rounded-full text-[14px] font-black tracking-[0.3em] text-white hover:text-(--main-color) hover:border-(--main-color)/30 transition-all active:scale-95"
                    >
                        {onyx.appLanguage.toUpperCase()}
                    </button>
                </div>

                <div className="flex items-center gap-4 pointer-events-auto">
                    {/* Stop Neural Voice */}
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onyx.stopVoice?.();
                        }}
                        className="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 backdrop-blur-3xl rounded-full text-red-500 hover:bg-red-500/10 transition-all active:scale-90"
                        title="Stop Neural Response"
                    >
                        <Square size={20} fill="currentColor" />
                    </button>

                    {/* Artifact Toggle Button */}
                    {onyx.inventoryConfig.itemIds.length > 0 && (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setArtifactConfig(prev => ({ ...prev, isOpen: !prev.isOpen }));
                            }}
                            className={`w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 backdrop-blur-3xl rounded-full transition-all active:scale-90 ${artifactConfig.isOpen ? 'text-(--main-color) border-(--main-color)/40 shadow-[0_0_20px_var(--main-color)]' : 'text-white/40 hover:text-white'}`}
                        >
                            <Package size={22} />
                        </button>
                    )}
                </div>
            </div>

            {/* Background Layer: The Neural Link Visualizer */}
            <div 
                className="absolute inset-0 z-0 cursor-pointer w-full h-full flex items-center justify-center overflow-hidden"
                onPointerDown={(e) => {
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
                    resetNeuralKey={onyx.resetNeuralKey}
                    stopVoice={onyx.stopVoice}
                    handleFormSubmit={onyx.handleFormSubmit}
                />
            </div>
        </div>
    );
}
