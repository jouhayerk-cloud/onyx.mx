import React, { useState, useEffect } from 'react';
import { useOnyx, OnyxChatHistory, OnyxChatControls } from './OnyxChat';
import { OnyxVisuals } from './OnyxVisuals';
import { OnyxContextModal } from './OnyxContextModal';
import { inventoryArtifactConfigAtom } from '../../lib/atoms';
import { useAtom } from 'jotai';

export function OnyxOrbView() {
    const onyx = useOnyx();
    const [isContextOpen, setIsContextOpen] = useState(false);
    const [artifactConfig] = useAtom(inventoryArtifactConfigAtom);
    const { transcript } = onyx;
    const [requestSend, setRequestSend] = useState(0);

    // Auto-send when requestSend triggers (manual click on transcript)
    useEffect(() => {
        if (requestSend > 0 && transcript.trim()) {
            onyx.sendMessage(transcript);
        }
    }, [requestSend]);

    return (
        <div className="flex flex-col h-full w-full bg-[#050505] overflow-hidden relative font-['Inter']">
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
                    <OnyxVisuals isProcessing={onyx.isTyping} volume={onyx.volume} />
                </div>
            </div>

            {/* INTERACTION LAYER */}
            <div className="flex-1 flex flex-col relative z-10">
                {/* Tactical HUD Overlay */}
                <div className={`absolute inset-0 z-20 flex flex-col p-6 md:p-12 pointer-events-none transition-all duration-700 ${artifactConfig.isOpen ? 'blur-3xl opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                    
                    {/* Floating Transcript */}
                    {transcript && (
                        <div className="absolute inset-x-0 top-[15%] flex items-center justify-center p-8 md:p-24 z-10">
                            <h2 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setRequestSend(p => p + 1);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="text-xl md:text-2xl font-black text-white/40 hover:text-(--main-color) cursor-pointer text-center uppercase tracking-[0.3em] leading-tight transition-all duration-300 drop-shadow-2xl pointer-events-auto"
                            >
                                {transcript}
                            </h2>
                        </div>
                    )}

                    {/* HISTORY CONVERSATION - Glassmorphic Panels inside the Orb */}
                    <div className="flex-1 w-full h-full">
                        <OnyxChatHistory messages={onyx.messages} isTyping={onyx.isTyping} />
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
