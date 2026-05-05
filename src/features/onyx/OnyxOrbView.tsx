
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
        <div className="flex flex-col h-full w-full bg-black">
            {/* DYNAMIC RESPONSIVE ORB CONTAINER */}
            <div 
                className="relative flex-1 overflow-hidden"
                onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest('button, input, form')) return;
                    setIsListening(true);
                }}
                onPointerUp={(e) => {
                    if ((e.target as HTMLElement).closest('button, input, form')) return;
                    setIsListening(false);
                }}
                onPointerLeave={() => setIsListening(false)}
                onPointerCancel={() => setIsListening(false)}
                style={{ touchAction: 'none' }}
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

                {/* Free Floating Context Trigger (Always on HUD) */}
                <div className="absolute top-12 right-12 z-30">
                    <button 
                        onClick={() => setIsContextOpen(true)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="group relative flex items-center justify-center w-14 h-14 rounded-full border border-white/5 bg-black/20 backdrop-blur-3xl hover:bg-white/5 transition-all duration-500"
                    >
                        <ShieldCheck className="w-6 h-6 text-white/20 group-hover:text-(--main-color) transition-colors" />
                        <div className="absolute inset-0 rounded-full border border-white/0 group-hover:border-white/10 transition-all duration-700" />
                    </button>
                </div>

                {/* Tactical HUD Overlay (Adaptive Content) */}
                <div className={`absolute inset-0 z-20 flex flex-col p-12 md:p-24 pointer-events-none transition-all duration-700 ${artifactConfig.isOpen ? 'blur-2xl opacity-20 scale-95' : 'opacity-100 scale-100'}`}>
                    {/* Floating Transcript - Sentient Mode */}
                    {transcript && (
                        <div className="absolute inset-x-0 top-[20%] flex items-center justify-center p-12 md:p-32 z-10">
                            <h2 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setRequestSend(p => p + 1);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="text-xl md:text-3xl font-black text-white/40 hover:text-(--main-color) cursor-pointer text-center uppercase tracking-widest leading-tight transition-all duration-300 drop-shadow-2xl pointer-events-auto"
                            >
                                {transcript}
                            </h2>
                        </div>
                    )}

                    {/* Central Artifact Display Slot */}
                    <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="w-full max-w-6xl aspect-video md:aspect-auto pointer-events-none">
                            {/* Inventory Artifact Manifestation (When Active) */}
                        </div>
                    </div>
                </div>

                {/* Artifact Overlay (Modal/Sidebar layer) */}
                <InventoryArtifact />
                
                {/* Context Knowledge Overlay */}
                <OnyxContextModal isOpen={isContextOpen} onClose={() => setIsContextOpen(false)} />
            </div>

            {/* SEPARATED TACTICAL CONTROL BAR (Bottom) */}
            <div className="h-auto z-40">
                <OnyxChat 
                    onProcessingChange={setIsProcessing}
                    onTranscriptChange={setTranscript}
                    onVendorDetect={setCurrentVendorColor}
                    onVolumeChange={setVolume}
                />
            </div>
        </div>
    );
}
