import React, { useState, useEffect } from 'react';
import { imageCache, fetchImageBatch } from '../lib/utils';
import { LoadingIndicator } from './LoadingIndicator';
import { OnyxMiniLogo } from './OnyxLogo';

export const ItemThumbnail = ({ imageUrl, color, shape, material }: { imageUrl: string | null, color?: string, shape?: string, material?: string }) => {
    const [dataUrl, setDataUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setDataUrl(null);
        if (!imageUrl) {
            setIsLoading(false);
            return;
        }

        let isActive = true;
        setIsLoading(true);
        
        const fileId = (imageUrl.match(/id=([\w-]+)/) || [])[1];
        if (!fileId) {
            setIsLoading(false);
            return;
        }

        if (imageCache.has(fileId)) {
            setDataUrl(imageCache.get(fileId)!);
            setIsLoading(false);
            return;
        }

        fetchImageBatch(fileId)
            .then(data => {
                if (isActive) {
                    const url = `data:${data.mimeType};base64,${data.base64}`;
                    imageCache.set(fileId, url);
                    setDataUrl(url);
                }
            })
            .catch(e => console.error("Failed to load thumbnail", e))
            .finally(() => {
                if(isActive) setIsLoading(false);
            });

        return () => { isActive = false; };
    }, [imageUrl]);

    return (
        <div 
            className="w-full h-full rounded-lg flex items-center justify-center overflow-hidden shrink-0 relative p-1" 
            style={{ 
                backgroundColor: 'rgba(0,0,0,0.2)',
                boxShadow: 'inset 0px 8px 15px -8px rgba(0,0,0,0.5)'
            }}
        >
            <div className="absolute inset-0 opacity-70" style={{ background: color || 'transparent' }} />
            {isLoading ? 
                <div className="relative scale-50 mt-2"><LoadingIndicator /></div> :
                dataUrl ? 
                <img src={dataUrl} alt="Item thumbnail" className="relative w-full h-full object-contain" /> : 
                <div className="w-1/2 h-1/2 opacity-30 text-[var(--secondary-color)]">
                    <OnyxMiniLogo />
                </div>
            }
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-2 text-white text-left z-10">
                <p className="font-bold text-xs truncate drop-shadow-md">{shape}</p>
                <p className="text-[10px] opacity-80 truncate -mt-0.5 drop-shadow-md">{material}</p>
            </div>
        </div>
    );
};
