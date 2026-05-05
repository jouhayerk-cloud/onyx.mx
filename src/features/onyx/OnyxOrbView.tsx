
import React, { useState } from 'react';
import { OnyxVisuals } from './OnyxVisuals';
import { OnyxChat } from './OnyxChat';
import { OnyxContextModal } from './OnyxContextModal';
import { InventoryArtifact } from '../inventory/InventoryArtifact';
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

    return (
        <div 
            className="relative flex h-full w-full overflow-hidden bg-black"
            onMouseDown={() => setIsListening(true)}
            onMouseUp={() => setIsListening(false)}
            onMouseLeave={() => setIsListening(false)}
            onTouchStart={(e) => {
                // If touching a button or input, don't trigger mic
                if ((e.target as HTMLElement).closest('button, input')) return;
                setIsListening(true);
            }}
            onTouchEnd={() => setIsListening(false)}
        >
            {/* Full Panel Visualizer Background */}
            <div className="absolute inset-0 z-0">
                <OnyxVisuals 
                    isProcessing={isProcessing} 
                    tint={currentVendorColor} 
                    volume={volume} 
                    onStart={() => setIsListening(true)}
                    onEnd={() => setIsListening(false)}
                />
            </div>


            {/* Free Floating Context Trigger */}
            <div className="absolute top-12 right-12 z-30">
                <button 
                    onClick={() => setIsContextOpen(true)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="w-12 h-12 flex items-center justify-center rounded-full bg-white/0 hover:bg-white/5 border border-white/0 hover:border-white/5 transition-all duration-700 backdrop-blur-sm group/btn"
                >
                    <ShieldCheck className="text-white/20 group-hover/btn:text-(--main-color) transition-colors" size={20} />
                </button>
            </div>

            {/* Free Floating Chat Timeline */}
            <div className={`absolute inset-0 z-10 flex flex-col pointer-events-none transition-all duration-700 ${artifactConfig.isOpen ? 'blur-2xl opacity-20 scale-95' : 'opacity-100 scale-100'}`}>
                {/* Floating Transcript - Sentient Mode */}
                {transcript && (
                    <div className="absolute inset-x-0 top-[20%] flex items-center justify-center p-12 md:p-32 z-10">
                        <h2 
                            onClick={(e) => {
                                e.stopPropagation();
                                setRequestSend(p => p + 1);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            className="text-xl md:text-3xl font-black text-white/40 hover:text-(--main-color) cursor-pointer text-center uppercase tracking-widest leading-tight transition-all duration-300 drop-shadow-2xl pointer-events-auto"
                        >
                            {transcript}
                        </h2>
                    </div>
                )}

                <div className="flex-1" />
                
                {/* Free Floating High-Density Chat Panel */}
                <div className="w-full max-w-4xl ml-auto pointer-events-auto p-6 md:p-12 mb-12 mr-6 md:mr-12 h-full">
                    <OnyxChat 
                        onProcessingChange={setIsProcessing} 
                        onTranscriptChange={setTranscript}
                        onVolumeChange={setVolume}
                        onVendorDetect={(color) => setCurrentVendorColor(color)}
                    />
                </div>
            </div>

            {/* Minimalist Activity Beacon */}
            <div className="absolute bottom-12 right-12 z-20 flex items-center gap-4 pointer-events-none">
                <div className={`w-1 h-1 rounded-full transition-all duration-1000 ${isProcessing ? 'bg-(--main-color) scale-[4] opacity-100' : 'bg-white/10 opacity-30'}`} />
            </div>

            <OnyxContextModal isOpen={isContextOpen} onClose={() => setIsContextOpen(false)} />
            <InventoryArtifact />
        </div>
    );
}
