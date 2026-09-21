

import {useSetAtom, useAtomValue} from 'jotai/react';
import React, {useEffect, useState} from 'react';
import {
  ImageSrcAtom,
  IsUploadedImageAtom,
  SelectedItemDataAtom,
} from '../../lib/atoms';
import {LoadingIndicator} from '../../components/LoadingIndicator';
import { imageCache, fetchImageBatch } from '../../lib/utils';
import { tr } from '../../lib/i18n';

/* ──────────────────────────────────────────────────────────────────────────
   PROCESSED vs RAW — the module's one distinction, defined once.
   --------------------------------------------------------------------------
   Every catalog surface shows the same two images for a piece: the original
   photograph somebody uploaded, and the background-cleaned version the STUDIO
   produced from it. Before this, nothing on screen said which was which — the
   cleaned frame was simply spliced in at index 0 of the gallery and the only
   hint was a red delete key that appeared on hover.

   The rule this states is the one the app already enforces everywhere else.
   MainHeader's Shopify export classifies each row's picture as `processed` or
   `uploaded` and ships the processed one; collectExportImages in lib/utils
   substitutes the cleaned URL per image on the way out. So:

       PROCESSED   background-cleaned. This is the image shown publicly.
       RAW         original upload. Never shown publicly.

   It is a WORD, deliberately. A tint or a thinner border cannot be read by
   somebody who does not already know the convention, does not survive
   greyscale or forced-colors, and — on the Aqua slab, where the accent is
   1.7:1 against its own tint — would not have cleared contrast anyway.

   This module is the only definition. All four components import it, so the
   wording, the colour and the tooltip cannot drift apart again.
   ────────────────────────────────────────────────────────────────────────── */

export type MediaOrigin = 'processed' | 'raw';

/** The word itself. Kept as a literal: like AQ and LD, it is a code the
 *  operators read on screen and in the export sheet, not prose. */
export const MEDIA_ORIGIN_WORD: Record<MediaOrigin, string> = {
  processed: 'PROCESSED',
  raw: 'RAW',
};

/** One letter, for a 52px tray tile that has no room for the word. Same two
 *  words cut to their initial, never a second scheme. */
export const MEDIA_ORIGIN_INITIAL: Record<MediaOrigin, string> = {
  processed: 'P',
  raw: 'R',
};

export const mediaOriginTitle = (origin: MediaOrigin): string =>
  origin === 'processed'
    ? tr('PROCESSED — background-cleaned. This is the image shown publicly.')
    : tr('RAW — original upload. Never shown publicly.');

/**
 * Which kind of image a given gallery URL is.
 *
 * Every catalog gallery is built the same way: the cleaned PNG first, then the
 * raw uploads from media_urls. Rather than each component re-deriving that from
 * an array index, they all ask here.
 */
export const mediaOriginOf = (
  url: string | null | undefined,
  generatedPngUrl: string | null | undefined,
): MediaOrigin =>
  !!url && !!generatedPngUrl && url === generatedPngUrl ? 'processed' : 'raw';

export const MediaOriginBadge: React.FC<{
  origin: MediaOrigin;
  /** 'word' on a photo well, 'stamp' on a tray tile too small for the word. */
  variant?: 'word' | 'onmedia' | 'stamp';
  className?: string;
}> = ({origin, variant = 'word', className = ''}) => (
  <span
    className={`cat-origin cat-origin--${origin} ${
      variant === 'onmedia' ? 'cat-origin--onmedia' : ''
    } ${variant === 'stamp' ? 'cat-origin--stamp' : ''} ${className}`}
    title={mediaOriginTitle(origin)}
    aria-label={mediaOriginTitle(origin)}>
    {variant === 'stamp'
      ? MEDIA_ORIGIN_INITIAL[origin]
      : MEDIA_ORIGIN_WORD[origin]}
  </span>
);

/** The rule in a sentence, for the one place per surface that can afford it. */
export const MediaOriginNote: React.FC<{className?: string}> = ({
  className = '',
}) => (
  <p className={`cat-origin-note ${className}`}>
    {tr('PROCESSED images are the ones shown publicly. RAW uploads never are.')}
  </p>
);

const MediaThumbnail: React.FC<{
  url: string;
  origin: MediaOrigin;
  onClick: (dataUrl: string) => void;
}> = ({url, origin, onClick}) => {
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
      className={`cat-tile ${isSelected ? 'is-on' : ''}`}
      style={{width: 56, height: 56, flex: 'none'}}
      title={mediaOriginTitle(origin)}
      onClick={() => imageDataUrl && onClick(imageDataUrl)}
      disabled={isLoading || !imageDataUrl}>
      {isLoading && (
        <div className="scale-50">
          <LoadingIndicator />
        </div>
      )}
      {error && <div className="cat-origin-note">{error}</div>}
      {imageDataUrl && <img src={imageDataUrl} alt="" />}
      <MediaOriginBadge origin={origin} variant="stamp" />
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
      <div className="catalog-hub">
        <div className="cat-empty">{tr('No media found for this item.')}</div>
      </div>
    );
  }

  /* This panel lists media_urls and nothing else, so every tile in it is a RAW
     upload by construction. Saying so is the point: it is the surface an
     operator reaches for when they want the ORIGINAL, and it used to be
     indistinguishable from the cleaned gallery next to it. */
  return (
    <div className="catalog-hub">
      <div className="cat-head">
        <h3 className="cat-title">{tr('Media Gallery')}</h3>
        <span className="cat-origin cat-origin--raw" title={mediaOriginTitle('raw')}>
          {MEDIA_ORIGIN_WORD.raw}
        </span>
      </div>
      <MediaOriginNote />
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {mediaUrls.map((url, index) => (
          <MediaThumbnail
            key={index}
            url={url}
            origin="raw"
            onClick={handleThumbnailClick}
          />
        ))}
      </div>
    </div>
  );
}
