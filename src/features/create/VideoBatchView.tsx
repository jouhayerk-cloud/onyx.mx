

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { ai } from "../../lib/ai";
import { useAtomValue, useSetAtom } from 'jotai/react';
import { userAtom, batchActionItemsDataAtom, isBatchActionsModalOpenAtom, InventoryVersionAtom } from '../../lib/atoms';
import { SCRIPT_URL, vendors } from '../../lib/consts';
import toast from 'react-hot-toast';
import { LoadingIndicator } from '../../components/LoadingIndicator';

const UploadIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
);

const CheckCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
);


const model = 'gemini-2.5-flash';

interface GeminiAnalysisResponse {
  itemFound: boolean;
  itemName: string;
}

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    itemFound: {
      type: Type.BOOLEAN,
      description: "True if one of the items from the list is clearly visible, false otherwise.",
    },
    itemName: {
      type: Type.STRING,
      description: "The name of the item found from the list. Should be an empty string if itemFound is false.",
    },
  },
  required: ['itemFound', 'itemName'],
};

const analyzeFrame = async (imageDataUrl: string, items: string[]): Promise<GeminiAnalysisResponse | null> => {
  const base64Data = imageDataUrl.split(',')[1];
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64Data } }, { text: `Analyze this image. Does it contain any of these items: "${items.join(', ')}"? Respond only in JSON.` }] },
      config: { responseMimeType: 'application/json', responseSchema: analysisSchema, temperature: 0.2 },
    });
    const parsedJson = JSON.parse(response.text.trim()) as GeminiAnalysisResponse;
    if (parsedJson.itemFound && !items.some(item => parsedJson.itemName.toLowerCase().includes(item.toLowerCase()))) {
        return { itemFound: false, itemName: "" };
    }
    return parsedJson;
  } catch (error) {
    console.error('Error analyzing frame with Gemini:', error);
    return null;
  }
};

const extractFrame = (videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement, timestamp: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        videoElement.currentTime = timestamp;
        const onSeeked = () => {
            videoElement.removeEventListener('seeked', onSeeked);
            const context = canvasElement.getContext('2d');
            if (context) {
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;
                context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
                resolve(canvasElement.toDataURL('image/jpeg', 0.8));
            } else {
                reject(new Error('Could not get canvas context.'));
            }
        };
        videoElement.addEventListener('seeked', onSeeked, { once: true });
    });
};

const formatTimestamp = (seconds: number): string => {
    return new Date(seconds * 1000).toISOString().substr(14, 5);
};

export function VideoBatchView() {
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [formState, setFormState] = useState({
        numItems: '5',
        vendorId: '',
        shape: '',
        material: '',
        widthCm: '',
        heightCm: '',
        lengthCm: '',
        price: '',
        description: '',
        runPostProcessing: true,
    });
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('');
    const [potentialFrames, setPotentialFrames] = useState<{imageDataUrl: string, timestamp: number}[]>([]);
    const [selectedFrames, setSelectedFrames] = useState<string[]>([]);
    const [viewStep, setViewStep] = useState<'setup' | 'analyzing' | 'selection' | 'creating'>('setup');
    
    const user = useAtomValue(userAtom);
    const setBatchActionItemsData = useSetAtom(batchActionItemsDataAtom);
    const setIsBatchActionsModalOpen = useSetAtom(isBatchActionsModalOpenAtom);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (user && user.role === 'Vendor') {
            setFormState(prev => ({...prev, vendorId: user.id}));
        }
    }, [user]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setVideoFile(file);
            setFileName(file.name);
        }
    };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        setFormState(prev => ({ ...prev, [name]: isCheckbox ? (e.target as HTMLInputElement).checked : value }));
    };

    const handleStartAnalysis = useCallback(async () => {
        if (!videoFile || !formState.shape || !formState.vendorId) {
            return toast.error("Please provide a video, vendor ID, and shape.");
        }
        setViewStep('analyzing');
        setStatusText("Initializing...");
        setProgress(0);
        setPotentialFrames([]);
        setSelectedFrames([]);

        const videoElement = videoRef.current!;
        const canvasElement = canvasRef.current!;
        const itemsToFind = [`${formState.shape} ${formState.material}`.trim()];
        
        const videoUrl = URL.createObjectURL(videoFile);
        videoElement.src = videoUrl;

        videoElement.onloadedmetadata = async () => {
            const duration = videoElement.duration;
            const interval = 1; 
            const cooldown = 3;
            const foundFrames: typeof potentialFrames = [];

            try {
                for (let t = 0; t < duration; t += interval) {
                    if (viewStep === 'setup') break; // Allow cancellation
                    setStatusText(`Scanning video at ${Math.round(t)}s...`);
                    const imageDataUrl = await extractFrame(videoElement, canvasElement, t);
                    const analysis = await analyzeFrame(imageDataUrl, itemsToFind);
                    if (analysis?.itemFound) {
                        foundFrames.push({imageDataUrl, timestamp: t});
                        setPotentialFrames([...foundFrames]);
                        t += cooldown;
                    }
                    setProgress((t / duration) * 100);
                }
                setStatusText(`Found ${foundFrames.length} potential items. Please make your selection.`);
                setViewStep('selection');

            } catch (error: any) {
                toast.error(`An error occurred: ${error.message}`);
                setViewStep('setup');
            } finally {
                URL.revokeObjectURL(videoUrl);
            }
        };
    }, [videoFile, formState.shape, formState.material, formState.vendorId, viewStep]);

    const handleFrameSelection = (imageDataUrl: string) => {
        setSelectedFrames(prev => {
            if (prev.includes(imageDataUrl)) {
                return prev.filter(url => url !== imageDataUrl);
            }
            if (prev.length >= parseInt(formState.numItems, 10)) {
                toast.error(`You can select up to ${formState.numItems} items.`);
                return prev;
            }
            return [...prev, imageDataUrl];
        });
    };

    const handleCreateItems = async () => {
        if (selectedFrames.length === 0) {
            return toast.error("Please select at least one frame to create.");
        }
        setViewStep('creating');
        setStatusText(`Creating ${selectedFrames.length} items...`);
        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST', body: JSON.stringify({
                    action: 'batchCreateItems',
                    itemData: {
                        itemId: formState.vendorId, shape: formState.shape, material: formState.material,
                        widthCm: formState.widthCm, heightCm: formState.heightCm, lengthCm: formState.lengthCm,
                        price: formState.price, description: formState.description
                    },
                    imageDataUrls: selectedFrames, user,
                }),
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            
            toast.success(`${result.createdItems.length} items created!`);
            setInventoryVersion(v => v + 1);

            if (formState.runPostProcessing && result.createdItems.length > 0) {
                setStatusText('Starting post-processing...');
                setBatchActionItemsData(result.createdItems);
                setIsBatchActionsModalOpen(true);
            }
            handleReset();
        } catch (error: any) {
             toast.error(`Creation failed: ${error.message}`);
             setViewStep('selection');
        }
    };
    
    const handleReset = () => {
        setVideoFile(null);
        setFileName('');
        setViewStep('setup');
        setProgress(0);
        setStatusText('');
        setPotentialFrames([]);
        setSelectedFrames([]);
    };

    const isAnalyzing = viewStep === 'analyzing' || viewStep === 'creating';

    return (
        <div className="w-full h-full flex flex-col p-4 sm:p-6 md:p-8 gap-8 overflow-hidden">
            <video ref={videoRef} style={{ display: 'none' }} muted playsInline />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <div className="flex flex-col md:flex-row gap-8 h-full min-h-0">
                {/* Form Panel */}
                <div className="glass-panel p-6 space-y-4 md:w-1/3 flex flex-col">
                    <h2 className="text-xl font-bold">Video Batch Creation</h2>
                    <div className="flex-grow overflow-y-auto pr-2 -mr-6 space-y-4">
                        <label htmlFor="video-upload" className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-[var(--border-color)] border-dashed rounded-md cursor-pointer hover:border-[var(--accent-color)]">
                            <div className="space-y-1 text-center"><UploadIcon className="mx-auto h-12 w-12 text-[var(--text-color-secondary)]" /><p className="text-sm text-[var(--text-color-secondary)]">{fileName || 'Select a video file'}</p></div>
                        </label>
                        <input id="video-upload" type="file" className="sr-only" accept="video/*" onChange={handleFileChange} />
                        
                        <div className="grid grid-cols-2 gap-4">
                            <input name="numItems" type="number" placeholder="Number of Items" value={formState.numItems} onChange={handleInputChange} />
                            <select name="vendorId" value={formState.vendorId} onChange={handleInputChange} disabled={user?.role === 'Vendor'}>
                                <option value="">Select Vendor</option>
                                {Object.keys(vendors).map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <input name="shape" type="text" placeholder="Shape" value={formState.shape} onChange={handleInputChange} />
                            <input name="material" type="text" placeholder="Material" value={formState.material} onChange={handleInputChange} />
                        </div>
                         <div className="grid grid-cols-3 gap-4">
                            <input name="widthCm" type="number" placeholder="W (cm)" value={formState.widthCm} onChange={handleInputChange} />
                            <input name="heightCm" type="number" placeholder="H (cm)" value={formState.heightCm} onChange={handleInputChange} />
                            <input name="lengthCm" type="number" placeholder="L (cm)" value={formState.lengthCm} onChange={handleInputChange} />
                        </div>
                         <div className="grid grid-cols-2 gap-4">
                            <input name="price" type="number" placeholder="Price (MXN)" value={formState.price} onChange={handleInputChange} />
                            <textarea name="description" rows={1} placeholder="Description" value={formState.description} onChange={handleInputChange} className="col-span-2 !rounded-lg" />
                        </div>
    
                        <label className="flex items-center gap-2 cursor-pointer pt-2">
                            <input type="checkbox" name="runPostProcessing" checked={formState.runPostProcessing} onChange={handleInputChange} />
                            <span className="text-sm">Run AI analysis after creation (masks, descriptions)</span>
                        </label>
                    </div>

                    <div className="shrink-0 pt-4">
                        <button onClick={handleStartAnalysis} disabled={isAnalyzing || !videoFile} className="button w-full">
                            {isAnalyzing ? statusText : 'Scan Video for Items'}
                        </button>
                        {(viewStep === 'analyzing') && (
                            <div className="w-full bg-[var(--input-color)] rounded-full h-2.5 mt-2"><div className="bg-[var(--accent-color)] h-2.5 rounded-full" style={{ width: `${progress}%` }}></div></div>
                        )}
                    </div>
                </div>
    
                {/* Results Panel */}
                <div className="glass-panel p-6 flex-1 flex flex-col overflow-hidden">
                    <div className="flex justify-between items-center mb-4 shrink-0">
                        <h2 className="text-xl font-bold">Results</h2>
                        {(viewStep === 'selection' || viewStep === 'creating') && (
                            <div className="flex items-center gap-2">
                                <button onClick={handleReset} className="button secondary !min-h-0 text-xs py-1 px-3">Reset</button>
                                <button onClick={handleCreateItems} disabled={selectedFrames.length === 0 || viewStep === 'creating'} className="button !min-h-0 text-xs py-1 px-3">
                                    {viewStep === 'creating' ? 'Creating...' : `Create ${selectedFrames.length} Items`}
                                </button>
                            </div>
                        )}
                    </div>
    
                    <div className="flex-grow overflow-y-auto -m-6 p-6">
                        {viewStep === 'analyzing' && (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <LoadingIndicator />
                                <p className="mt-4 font-semibold">{statusText}</p>
                                <p className="text-sm text-[var(--text-color-secondary)]">This may take several minutes depending on video length.</p>
                            </div>
                        )}
                        {viewStep === 'creating' && (
                             <div className="flex flex-col items-center justify-center h-full text-center">
                                <LoadingIndicator />
                                <p className="mt-4 font-semibold">{statusText}</p>
                            </div>
                        )}
                        {viewStep === 'selection' && (
                            <>
                                <p className="mb-4 text-center text-sm text-[var(--text-color-secondary)]">{statusText} ({selectedFrames.length}/{formState.numItems} selected)</p>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                    {potentialFrames.map(({ imageDataUrl, timestamp }) => (
                                        <div key={timestamp} className="relative aspect-video rounded-lg overflow-hidden cursor-pointer" onClick={() => handleFrameSelection(imageDataUrl)}>
                                            <img src={imageDataUrl} alt={`Frame at ${timestamp}s`} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <p className="text-white font-bold">{formatTimestamp(timestamp)}</p>
                                            </div>
                                            {selectedFrames.includes(imageDataUrl) && (
                                                <div className="absolute inset-0 ring-4 ring-offset-2 ring-offset-black/50 ring-[var(--accent-color)] rounded-lg pointer-events-none">
                                                    <CheckCircleIcon className="absolute top-2 right-2 w-6 h-6 text-white bg-green-500 rounded-full" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                         {viewStep === 'setup' && (
                            <div className="flex items-center justify-center h-full text-center p-8">
                                <div className="max-w-md">
                                    <svg className="mx-auto h-16 w-16 text-[var(--text-color-secondary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 15.75-2.489-2.489m0 0a3.375 3.375 0 1 0-4.773-4.773 3.375 3.375 0 0 0 4.774 4.774ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                    </svg>
                                    <h3 className="mt-4 text-xl font-bold">Awaiting Analysis</h3>
                                    <p className="mt-2 text-[var(--text-color-secondary)]">
                                        Fill out the form and scan a video to see potential items here.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
