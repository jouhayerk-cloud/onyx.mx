/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { GoogleGenAI, Modality } from "@google/genai";
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { marketMultiSelectItemsAtom, userAtom, InventoryVersionAtom } from '../../lib/atoms';
import { InventoryItem } from '../../lib/Types';
import { SCRIPT_URL } from '../../lib/consts';
import { LoadingIndicator } from '../../components/LoadingIndicator';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const transparentDragImage = new Image();
transparentDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const loadingMessages = [ "Analyzing scene...", "Placing product...", "Adjusting lighting...", "Casting realistic shadows...", "Rendering final image...", "Almost there..." ];

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error("Could not parse MIME type");
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) { u8arr[n] = bstr.charCodeAt(n); }
    return new File([u8arr], filename, { type: mime });
}

const loadDriveFileAsDataUrl = async (driveUrl: string): Promise<string | null> => {
    if (!driveUrl) return null;
    const match = driveUrl.match(/id=([\w-]+)/);
    const fileId = match ? match[1] : null;
    if (!fileId) return driveUrl;

    const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'getImageBase64FromDriveId', fileId }),
    });
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    const response = await res.json();
    if (response.status === 'success') {
        return `data:${response.data.mimeType};base64,${response.data.base64}`;
    }
    throw new Error(response.message);
};

const ProductImageThumb = ({ product }: { product: InventoryItem }) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    useEffect(() => {
        const url = product.data.generatedPngUrl;
        if (!url) return;
        
        let isActive = true;
        loadDriveFileAsDataUrl(url).then(dataUrl => {
            if (isActive && dataUrl) {
                setImageUrl(dataUrl);
            }
        }).catch(err => console.error(err));

        return () => { isActive = false; };
    }, [product]);

    if (!imageUrl) return <div className="w-full h-full bg-black/20 animate-pulse rounded-md" />;
    return <img src={imageUrl} alt={product.data.shape} className="w-full h-full object-contain" />;
}

export const SceneComposerView = () => {
    const [selectedProducts, setSelectedProducts] = useAtom(marketMultiSelectItemsAtom);
    const user = useAtomValue(userAtom);
    const setInventoryVersion = useSetAtom(InventoryVersionAtom);

    const [sceneImage, setSceneImage] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [draggedProduct, setDraggedProduct] = useState<InventoryItem | null>(null);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [orbPosition, setOrbPosition] = useState<{ x: number, y: number } | null>(null);

    const sceneImgRef = useRef<HTMLImageElement>(null);
    const sceneImageUrl = useMemo(() => sceneImage ? URL.createObjectURL(sceneImage) : null, [sceneImage]);

    useEffect(() => {
        if (isLoading) {
            setLoadingMessage(loadingMessages[0]);
            const intervalId = window.setInterval(() => {
                setLoadingMessage(prev => {
                    const nextIndex = (loadingMessages.indexOf(prev) + 1) % loadingMessages.length;
                    return loadingMessages[nextIndex];
                });
            }, 3000);
            return () => window.clearInterval(intervalId);
        }
    }, [isLoading]);

    const handleSceneUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSceneImage(file);
            setError(null);
        }
    };
    
    const handleProductDragStart = (e: React.DragEvent, product: InventoryItem) => {
        if (!product.data.generatedPngUrl) {
            e.preventDefault();
            toast.error(`Product "${product.data.shape}" does not have a generated PNG image.`);
            return;
        }
        setDraggedProduct(product);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(transparentDragImage, 0, 0);
    };

    const handleProductDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(false);
        setOrbPosition(null);
        
        const img = sceneImgRef.current;
        if (!draggedProduct || !sceneImage || !img) return;

        const target = e.currentTarget;
        const rect = target.getBoundingClientRect();
        
        const { naturalWidth, naturalHeight } = img;
        const { width: containerWidth, height: containerHeight } = rect;

        const imageAspectRatio = naturalWidth / naturalHeight;
        const containerAspectRatio = containerWidth / containerHeight;

        let renderedWidth, renderedHeight, offsetX, offsetY;
        if (imageAspectRatio > containerAspectRatio) {
            renderedWidth = containerWidth;
            renderedHeight = containerWidth / imageAspectRatio;
            offsetX = 0;
            offsetY = (containerHeight - renderedHeight) / 2;
        } else {
            renderedHeight = containerHeight;
            renderedWidth = containerHeight * imageAspectRatio;
            offsetY = 0;
            offsetX = (containerWidth - renderedWidth) / 2;
        }
        
        const pointX = e.clientX - rect.left;
        const pointY = e.clientY - rect.top;

        const imageX = pointX - offsetX;
        const imageY = pointY - offsetY;

        if (imageX < 0 || imageX > renderedWidth || imageY < 0 || imageY > renderedHeight) {
            toast.error("Dropped outside of the scene image.");
            return;
        }
        
        const xPercent = (imageX / renderedWidth) * 100;
        const yPercent = (imageY / renderedHeight) * 100;
        
        setIsLoading(true);
        setError(null);

        try {
            const productImageUrl = await loadDriveFileAsDataUrl(draggedProduct.data.generatedPngUrl!);
            if(!productImageUrl) throw new Error("Could not load product image.");
            
            const sceneDataUrl = await fileToDataUrl(sceneImage);

            const prompt = `Place the product image into the scene image at approximately ${xPercent.toFixed(0)}% from the left and ${yPercent.toFixed(0)}% from the top. The product is a "${draggedProduct.data.shape} made of ${draggedProduct.data.material}". Realistically integrate it by adjusting lighting, scale, and adding shadows. The final image should have the same dimensions as the original scene.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ inlineData: { mimeType: 'image/png', data: productImageUrl.split(',')[1] } }, { inlineData: { mimeType: sceneImage.type, data: sceneDataUrl.split(',')[1] } }, { text: prompt }] },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });

            const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
            if (!imagePart?.inlineData) throw new Error("AI did not return an image.");
            
            const newSceneDataUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
            const newSceneFile = dataURLtoFile(newSceneDataUrl, `scene-${Date.now()}.png`);
            setSceneImage(newSceneFile);

        } catch (err: any) {
            setError(err.message || 'Failed to generate image.');
            toast.error(err.message || 'Failed to generate image.');
        } finally {
            setIsLoading(false);
            setDraggedProduct(null);
        }
    }, [draggedProduct, sceneImage]);
    
    const handleSaveScene = async () => {
        if (!sceneImage || selectedProducts.length === 0) {
            toast.error('No scene to save or no initial product selected.');
            return;
        }
        const toastId = toast.loading('Saving scene to Drive...');
        try {
            const firstProduct = selectedProducts[0];
            const sceneDataUrl = await fileToDataUrl(sceneImage);

            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'saveGeneratedImagesBatch',
                    row: firstProduct.row,
                    itemData: firstProduct.data,
                    imageDataUrls: [sceneDataUrl],
                    user,
                }),
            });

            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);

            toast.success('Scene saved successfully!', { id: toastId });
            setInventoryVersion(v => v + 1);
        } catch (error: any) {
            toast.error(`Save failed: ${error.message}`, { id: toastId });
        }
    };

    const handleDownloadScene = () => {
        if (!sceneImage) {
            toast.error('No generated image to download.');
            return;
        }
        const url = URL.createObjectURL(sceneImage);
        const a = document.createElement('a');
        a.href = url;
        a.download = sceneImage.name || 'generated-scene.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Image downloaded!');
    };
    
    useEffect(() => {
        const currentUrl = sceneImageUrl;
        return () => {
            if (currentUrl) URL.revokeObjectURL(currentUrl);
        };
    }, [sceneImageUrl]);

    if(selectedProducts.length === 0) {
        return <div className="flex items-center justify-center h-full text-[var(--text-color-secondary)]">Use the "Select" button in the inventory to choose products.</div>;
    }

    return (
        <div className="flex flex-col h-full p-4 gap-4">
            <div
                className={`relative flex-grow rounded-lg border-2 border-dashed border-transparent flex items-center justify-center ${isDraggingOver ? 'border-[var(--main-color)]' : ''}`}
                onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(true);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setOrbPosition({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                    });
                }}
                onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                    setOrbPosition(null);
                }}
                onDrop={handleProductDrop}
            >
                {sceneImageUrl ? (
                    <img 
                        ref={sceneImgRef}
                        src={sceneImageUrl}
                        alt="Scene"
                        className="w-full h-full object-contain pointer-events-none"
                    />
                ) : (
                    <p className="text-[var(--text-color-secondary)]">Upload a scene image to begin</p>
                )}
                
                <div 
                    className="absolute w-8 h-8 bg-[var(--main-color)] rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-200"
                    style={{
                        left: orbPosition ? `${orbPosition.x}px` : '-9999px',
                        top: orbPosition ? `${orbPosition.y}px` : '-9999px',
                        opacity: isDraggingOver ? 1 : 0,
                        boxShadow: '0 0 20px 10px var(--main-color)'
                    }}
                />

                {isLoading && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white rounded-lg">
                        <LoadingIndicator/>
                        <p>{loadingMessage}</p>
                    </div>
                )}
                 {error && <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center p-4 text-center text-white rounded-lg">{error}</div>}
            </div>
            
            <div className="shrink-0 flex items-center justify-between gap-4 p-2 rounded-lg bg-black/20">
                <div className="flex items-center gap-2 overflow-x-auto">
                    {selectedProducts.map(product => (
                        <div
                            key={product.row}
                            className="w-16 h-16 shrink-0 rounded-md bg-black/30 p-1 cursor-grab active:cursor-grabbing"
                            draggable
                            onDragStart={(e) => handleProductDragStart(e, product)}
                            title={`Drag "${product.data.shape}"`}
                        >
                            <ProductImageThumb product={product} />
                        </div>
                    ))}
                </div>
                 <div className="flex items-center gap-2">
                    <label htmlFor="scene-upload-input" className="button secondary cursor-pointer !min-h-0 text-xs py-2">
                        {sceneImage ? 'Change Scene' : 'Upload Scene'}
                    </label>
                    <input id="scene-upload-input" type="file" accept="image/*" className="hidden" onChange={handleSceneUpload} />
                    <button className="button secondary !min-h-0 text-xs py-2" onClick={handleDownloadScene} disabled={!sceneImage || isLoading}>Download</button>
                    <button className="button !min-h-0 text-xs py-2" onClick={handleSaveScene} disabled={!sceneImage || isLoading}>Save Scene</button>
                </div>
            </div>
        </div>
    );
};