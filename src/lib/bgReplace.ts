/**
 * bgReplace.ts — generative background replacement for catalogue photos.
 *
 * Replaces the alpha-matting cleanup path, which fails on our stock for a
 * structural reason rather than a tuning one. Matting asks one question per
 * pixel — keep or delete — and on natural onyx, travertine and marble the
 * honest answer is often ambiguous: dark veining reads as shadow, a rough
 * unpolished edge reads as debris, a backlit translucent wall reads as
 * background showing through. A wrong answer there is a HOLE IN THE PRODUCT,
 * which is the failure we kept shipping.
 *
 * Background replacement never asks that question. The model repaints what it
 * judges to be the environment, so a mistake is a slightly-wrong room — which
 * a customer cannot detect — instead of a missing lamp arm. It also sidesteps
 * translucency entirely, since nothing has to be resolved into an alpha value.
 *
 * The output goes to Supabase Storage and is recorded in `processed_media_urls`
 * under the CLEANED SOURCE URL as key, because that is what
 * UnifiedInventoryView reads back (see its `mediaUrls` memo). Originals in
 * `media_urls` are never touched.
 */

import { Modality } from '@google/genai';
import { ai } from './ai';
import { supabase } from './supabase';
import { loadImage } from './utils';

/** Bumped whenever the prompt changes, so cached results are invalidated. */
export const BG_PROMPT_VERSION = 'dark-room-v2';

export type BgQuality = '1K' | '2K';

/**
 * Tried in order. 3.1 is the only one that can return 2K, which matters
 * because source photos are ~4000px and 1K is a visible downgrade in the
 * catalogue. 2.5 is the fallback because SceneComposerView already proves it
 * works against our key — if the preview model is not enabled on the account,
 * we still produce an image rather than failing the batch.
 */
const MODEL_CHAIN = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'] as const;

/** Ratios the image models accept. Snapping to one stops silent reframing. */
const SUPPORTED_RATIOS: [string, number][] = [
    ['1:1', 1], ['3:2', 3 / 2], ['2:3', 2 / 3], ['3:4', 3 / 4],
    ['4:3', 4 / 3], ['4:5', 4 / 5], ['5:4', 5 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9],
];

export const nearestAspectRatio = (width: number, height: number): string => {
    if (!width || !height) return '1:1';
    const target = width / height;
    let best = SUPPORTED_RATIOS[0];
    let bestDelta = Infinity;
    for (const candidate of SUPPORTED_RATIOS) {
        const delta = Math.abs(Math.log(candidate[1] / target));
        if (delta < bestDelta) { bestDelta = delta; best = candidate; }
    }
    return best[0];
};

/**
 * Downscale on the long edge only.
 *
 * Deliberately NOT resizeImage() from utils: that letterboxes onto a #121212
 * square with 10% padding, and a generative model treats the padding as part
 * of the picture — it would bake a dark border into every result.
 */
export async function loadImageForGeneration(
    url: string,
    maxEdge = 1536,
): Promise<{ data: string; mimeType: string; width: number; height: number }> {
    const img = await loadImage(url);
    const longEdge = Math.max(img.width, img.height);
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable for image preparation');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    return {
        data: dataUrl.split(',')[1],
        mimeType: 'image/jpeg',
        width: img.width,
        height: img.height,
    };
}

export interface BgSubject {
    shape?: string;
    material?: string;
    description?: string;
}

/**
 * The fidelity clauses are the ones that matter. Without them the model
 * "cleans up" the piece: it smooths rough quarry edges into machined ones,
 * reads dark veining as grime and lightens it, and flattens the glow out of a
 * backlit shade. Those are exactly the features the stock is sold on.
 *
 * The SUPPORT clause is the second thing that matters, and it is the reason
 * for v2. v1 listed "cardboard" among the props to remove and the model kept
 * it anyway — because the piece is STANDING ON IT. Read together, "keep the
 * subject exactly as photographed" and a sheet of cardboard in contact with
 * the subject are ambiguous about where the subject ends, and the model
 * resolved that by promoting the cardboard to floor and lighting it. Naming
 * cardboard harder does not fix an ambiguity; the fix is to say what the
 * subject is NOT before saying to preserve it, and to say what goes in the
 * removed floor's place. Hence packing material is disowned in its own
 * paragraph ahead of the fidelity list, and the floor clause pins the new
 * floor to the height the piece already rests at — otherwise removing a
 * 20cm stack of boxes leaves the piece hovering.
 */
export function buildDarkRoomPrompt(subject: BgSubject): string {
    const piece = [subject.material, subject.shape].filter(Boolean).join(' ').trim()
        || 'natural stone artisan piece';
    const detail = subject.description ? ` (${subject.description})` : '';

    return `Replace ONLY the background of this photograph. The subject is a handmade ${piece}${detail} in natural Mexican stone.

The subject is the stone piece and nothing else. Everything it stands on, leans against, rests in or is surrounded by is warehouse packing material, NOT part of the subject, and must be removed even where it touches the piece. This includes flattened boxes and cardboard sheets laid on the floor beneath the piece, pallets, wooden crates, foam, blankets, plastic wrap, straps, loose tape and tools, together with any printed logos, arrows or handling symbols on them.

Keep the subject exactly as photographed:
- Reproduce it pixel-for-pixel. Do not restyle, retouch, straighten, recolour, relight or "improve" it.
- Its natural veining, mineral banding and dark or near-black patches are STONE, not dirt or shadow. Preserve every one at its original tone.
- Its rough, unpolished, chipped or bark-like outer edges are part of the piece. Never smooth, trim or tidy them.
- If any part is translucent or lit from within, preserve that glow and its exact colour.
- Keep every component: bases, arms, fittings, hardware, cabling, mirror glass and each separate piece in a set.

Replace the surroundings with an empty dark studio room:
- A seamless, unlit deep charcoal room with a soft floor-to-wall falloff behind the subject.
- Where cardboard, boxes or pallets lie under the piece, put clean studio floor in their place, level with the height the piece already rests at, so it stands directly on the floor. Do not move, tilt, rescale or reframe the piece to meet a new floor, and never leave it floating.
- If packing material hid part of the base, the new floor line takes its place at that same height. Do not invent stone that was not photographed.
- Add a soft contact shadow exactly where the piece meets that floor, consistent with the existing lighting direction.
- Remove all people, hands, background text and watermarks.
- Add nothing new: no furniture, plants, decor, reflections or text.

Keep the original framing, crop, scale and camera angle. Output the full scene at the same aspect ratio.`;
}

const extractImagePart = (response: any): { data: string; mimeType: string } | null => {
    const parts = response?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    for (const part of parts) {
        if (part?.inlineData?.data) {
            return { data: part.inlineData.data, mimeType: part.inlineData.mimeType || 'image/png' };
        }
    }
    return null;
};

export interface BgResult {
    dataUrl: string;
    modelUsed: string;
    aspectRatio: string;
}

/**
 * Ask the model for the piece standing in an empty dark room.
 *
 * Walks MODEL_CHAIN, and within each model retries once without `imageConfig`
 * — older image models reject the field outright, and losing size control is a
 * far better outcome than failing the item.
 */
export async function replaceBackgroundWithDarkRoom(
    imageUrl: string,
    subject: BgSubject,
    opts: { quality?: BgQuality; onLog?: (msg: string) => void } = {},
): Promise<BgResult> {
    const { quality = '2K', onLog } = opts;

    const source = await loadImageForGeneration(imageUrl);
    const aspectRatio = nearestAspectRatio(source.width, source.height);
    const prompt = buildDarkRoomPrompt(subject);

    const requestParts = [
        { inlineData: { mimeType: source.mimeType, data: source.data } },
        { text: prompt },
    ];

    let lastError: Error | null = null;

    for (const model of MODEL_CHAIN) {
        for (const withImageConfig of [true, false]) {
            try {
                onLog?.(`[ WAIT ] ${model}${withImageConfig ? ` @ ${quality}` : ''}...`);
                const response = await ai.models.generateContent({
                    model,
                    contents: { parts: requestParts },
                    config: {
                        responseModalities: [Modality.IMAGE],
                        ...(withImageConfig ? { imageConfig: { aspectRatio, imageSize: quality } } : {}),
                    } as any,
                });

                const image = extractImagePart(response);
                if (!image) throw new Error('Model returned no image part');

                onLog?.(`[  OK  ] Background replaced via ${model}`);
                return {
                    dataUrl: `data:${image.mimeType};base64,${image.data}`,
                    modelUsed: model,
                    aspectRatio,
                };
            } catch (err: any) {
                lastError = err instanceof Error ? err : new Error(String(err));
                onLog?.(`[ WARN ] ${model} rejected: ${lastError.message}`);
            }
        }
    }

    throw lastError || new Error('All image models rejected the request');
}

/** Stable, non-cryptographic hash — only needs to detect "same input as before". */
export const hashString = (input: string): string => {
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
};

/**
 * Identifies a generated image by everything that would change it. A rerun
 * whose key already matches what is stored has nothing to do.
 */
export const bgCacheKey = (sourceUrl: string, quality: BgQuality): string =>
    hashString(`${BG_PROMPT_VERSION}|${quality}|${sourceUrl}`);

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

/**
 * Upload to Supabase Storage rather than the Apps Script Drive path used by
 * handleProcessedFileUpload. The bucket is public-read with authenticated
 * writes, the wizard already uploads generated video there, and the resulting
 * URL passes through getCleanImageUrl untouched (Drive URLs get rewritten).
 */
export async function uploadCleanedImage(dataUrl: string, fileName: string): Promise<string> {
    const blob = await dataUrlToBlob(dataUrl);
    const path = `cleaned/${fileName}`;

    const { error } = await supabase.storage
        .from('inventory-media')
        .upload(path, blob, { cacheControl: '3600', upsert: true, contentType: blob.type || 'image/png' });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const { data } = supabase.storage.from('inventory-media').getPublicUrl(path);
    return data.publicUrl;
}
