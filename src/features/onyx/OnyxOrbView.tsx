
import React, { useState } from 'react';
import { OnyxVisuals } from './OnyxVisuals';
import { useOnyx, OnyxChatHistory, OnyxChatControls } from './OnyxChat';
import { OnyxContextModal } from './OnyxContextModal';
import { ShieldCheck } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { inventoryArtifactConfigAtom, onyxIsListeningAtom, onyxRequestSendAtom } from '../../lib/atoms';

export function OnyxOrbView() {
    const artifactConfig = useAtomValue(inventoryArtifactConfigAtom);
    const setIsListening = useSetAtom(onyxIsListeningAtom);
    const setRequestSend = useSetAtom(onyxRequestSendAtom);
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [isContextOpen, setIsContextOpen] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [volume, setVolume] = useState(0);
    const [currentVendorColor, setCurrentVendorColor] = useState<string | undefined>(undefined);

    // Initialize Onyx Logic
    const onyx = useOnyx({
        onProcessingChange: setIsProcessing,
        onTranscriptChange: setTranscript,
        onVendorDetect: setCurrentVendorColor,
        onVolumeChange: setVolume
    });

    return (
        <div className="flex flex-col h-full w-full bg-black overflow-hidden">
            {/* LARGE DYNAMIC ORB CONTAINER */}
            <div className="relative flex-1 overflow-hidden">
                {/* Full Panel Visualizer Background - THIS IS THE TALK TRIGGER AREA */}
                <div 
                    className="absolute inset-0 z-0 touch-none"
                    onPointerDown={() => onyx.setIsListening(true)}
                    onPointerUp={() => onyx.setIsListening(false)}
                    onPointerLeave={() => onyx.setIsListening(false)}
                    onPointerCancel={() => onyx.setIsListening(false)}
                >
                    <OnyxVisuals 
                        isProcessing={isProcessing} 
                        tint={currentVendorColor} 
                        volume={volume} 
                        onStart={() => onyx.setIsListening(true)}
                        onEnd={() => onyx.setIsListening(false)}
                    />
                </div>

                {/* Free Floating Context Trigger */}
                <div className="absolute top-8 right-8 z-30">
                    <button 
                        onClick={() => setIsContextOpen(true)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="group relative flex items-center justify-center w-12 h-12 rounded-full border border-white/5 bg-black/20 backdrop-blur-3xl hover:bg-white/5 transition-all duration-500"
                    >
                        <ShieldCheck className="w-5 h-5 text-white/20 group-hover:text-(--main-color) transition-colors" />
                    </button>
                </div>

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
                />
            </div>
        </div>
    );
}
