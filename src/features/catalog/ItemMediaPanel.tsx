

import {useSetAtom, useAtomValue} from 'jotai/react';
import React, {useEffect, useState} from 'react';
import {
  ImageSrcAtom,
  IsUploadedImageAtom,
  SelectedItemDataAtom,
} from '../../lib/atoms';
import {LoadingIndicator} from '../../components/LoadingIndicator';
import { imageCache, fetchImageBatch } from '../../lib/utils';

const MediaThumbnail: React.FC<{
  url: string;
  onClick: (dataUrl: string) => void;
}> = ({url, onClick}) => {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const imageSrc = useAtomValue(ImageSrcAtom);
  const isSelected = !!(imageDataUrl && imageDataUrl === imageSrc);

  useEffect(() => {
    setImageDataUrl(null);
    setIsLoading(true);
    setError(null);

    try {
      const driveUrl = new URL(url);
      const fileId = driveUrl.searchParams.get('id');

      if (fileId) {
        if (imageCache.has(fileId)) {
          setImageDataUrl(imageCache.get(fileId)!);
          setIsLoading(false);
          return;
        }

        fetchImageBatch(fileId)
          .then((data) => {
            const dataUrl = `data:${data.mimeType};base64,${data.base64}`;
            imageCache.set(fileId, dataUrl);
            setImageDataUrl(dataUrl);
          })
          .catch((e) => {
            console.error(`[MediaThumbnail] Failed to fetch image (fileId: ${fileId}, url: ${url}):`, e.message);
            setError('Load failed');
          })
          .finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    } catch (e) {
      setError('Invalid URL');
      setIsLoading(false);
    }
  }, [url]);

  return (
    <button
      className={`aspect-square h-14 relative rounded-md overflow-hidden border-2 shrink-0 transition-colors flex items-center justify-center ${
        isSelected
          ? 'border-[var(--accent-color)]'
          : 'border-transparent hover:border-white/20'
      }`}
      onClick={() => imageDataUrl && onClick(imageDataUrl)}
      disabled={isLoading || !imageDataUrl}>
      {isLoading && (
        <div className="scale-50">
          <LoadingIndicator />
        </div>
      )}
      {error && <div className="text-red-500 text-[9px]">{error}</div>}
      {imageDataUrl && (
        <img src={imageDataUrl} className="w-full h-full object-cover" />
      )}
    </button>
  );
};

export function ItemMediaPanel() {
  const selectedItemData = useAtomValue(SelectedItemDataAtom);
  const setImageSrc = useSetAtom(ImageSrcAtom);
  const setIsUploadedImage = useSetAtom(IsUploadedImageAtom);

  const mediaUrls =
    selectedItemData?.mediaUrls
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) || [];

  const handleThumbnailClick = (dataUrl: string) => {
    setImageSrc(dataUrl);
    setIsUploadedImage(false); // When clicking existing media, it's not a new upload.
  };

  if (mediaUrls.length === 0) {
    return (
      <div className="text-center text-xs text-[var(--text-color-secondary)] h-full flex items-center justify-center">
        No media found for this item.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold uppercase text-[var(--text-color-secondary)]">
        Media Gallery
      </h3>
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {mediaUrls.map((url, index) => (
          <MediaThumbnail
            key={index}
            url={url}
            onClick={handleThumbnailClick}
          />
        ))}
      </div>
    </div>
  );
}