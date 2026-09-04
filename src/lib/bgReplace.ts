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
 * The output goes to Google Drive and is recorded in `processed_media_urls`
 * under the CLEANED SOURCE URL as key, because that is what
 * UnifiedInventoryView reads back (see its `mediaUrls` memo). Originals in
 * `media_urls` are never touched.
 */

import { Modality } from '@google/genai';
import { ai } from './ai';
import { loadImage, handleProcessedFileUpload } from './utils';

/**
 * Bumped whenever the prompt changes, so cached results are invalidated.
 *
 * v3 IS COUPLED TO colorExtractor.ts. That file drops background pixels with
 * `pr <= 45 && pg <= 45 && pb <= 45`, a constant tuned for the black studio
 * cloth in the original photographs. v1 and v2 asked for a "deep charcoal
 * room", which lands just above it: rgb(46,46,46) survives the guard, picks up
 * the sampler's +58.8 brightness offset, and matches "Gray" in COLOR_PALETTE.
 * The backdrop was being counted as stone, unconditionally poisoning
 * _pixel_map_hex and reaching generated_color whenever the text pass returned
 * no colours.
 *
 * So the backdrop is now specified as near-black with an explicit ceiling
 * BELOW that guard. If you ever make the background lighter or more
 * atmospheric, raise colorExtractor's threshold in the same commit -- but note
 * that raising it costs dark stone, which is why the prompt moved instead.
 */
export const BG_PROMPT_VERSION = 'dark-room-v7';

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
 * HOW TO CHANGE THIS PROMPT, learned by breaking it. v2 and v3 tried to stop
 * the model keeping the cardboard the piece stands on, by rewriting this
 * whole block: the positive scene description ("a deep charcoal room with a
 * soft floor-to-wall falloff") was replaced with prohibitions -- no lit wall,
 * no horizon, no grey gradient, no charcoal, every pixel below RGB 30, never
 * brighten the floor, do not invent, do not reframe. The result was WORSE
 * than the bug being fixed: the model stopped replacing the background at all
 * and returned the input with a little haze and a slightly punchier stone.
 *
 * Image models render nouns, not negations. A stack of prohibitions plus a
 * numeric pixel constraint makes "change almost nothing" the safest move.
 * v4 is therefore v1 verbatim plus exactly two edits -- one word for the
 * backdrop, one bullet for the cardboard -- both phrased as things to draw.
 * Keep it that way: add scenery, not rules, and change one thing at a time.
 *
 * v6 answers the inverse of the veining clause above it. That one stops the
 * model reading dark stone as shadow; v6 stops it painting shadow onto stone.
 * Frames and rings made it visible: the opening has to be filled with the
 * dark room, and at that high-contrast boundary the fill bled outward into
 * black blobs sitting on the onyx. Being generative, this is a tendency
 * rather than a switch -- expect it to get rarer, not to vanish, and re-run
 * the individual item when it appears.
 *
 * v5 makes the backdrop a shallow depth-of-field room rather than a flat
 * sweep, which is a scene change and so the safe kind: photographic language
 * ("thrown far out of focus at a wide aperture") is something a model draws
 * well. Two things kept it safe. It stays "near-black" for the reason below,
 * and it says the piece stays sharp -- a wide aperture on a piece this large
 * is otherwise an invitation to blur its own far edge.
 *
 * "near-black" is also a contract with colorExtractor.ts, which drops
 * background pixels at <= RGB 45. Charcoal sits just above that line, so the
 * backdrop was being measured as the stone's colour. If you make the
 * background lighter, raise that threshold in the same commit -- but it costs
 * dark stone, which is why the wording moved instead.
 */
export function buildDarkRoomPrompt(subject: BgSubject): string {
    const piece = [subject.material, subject.shape].filter(Boolean).join(' ').trim()
        || 'natural stone artisan piece';
    const detail = subject.description ? ` (${subject.description})` : '';

    return `Replace ONLY the background of this photograph. The subject is a handmade ${piece}${detail} in natural Mexican stone.

Keep the subject exactly as photographed:
- Reproduce it pixel-for-pixel. Do not restyle, retouch, straighten, recolour, relight or "improve" it.
- Its natural veining, mineral banding and dark or near-black patches are STONE, not dirt or shadow. Preserve every one at its original tone.
- The stone keeps its own colour all the way out to its outline. The dark room and its shadows stay behind the piece and outside it, never spilling onto its surface -- especially around mirror glass, openings and cut-outs, where the stone edge stays clean and unbroken.
- Its rough, unpolished, chipped or bark-like outer edges are part of the piece. Never smooth, trim or tidy them.
- If any part is translucent or lit from within, preserve that glow and its exact colour.
- Keep every component: bases, arms, fittings, hardware, mirror glass and each separate piece in a set.

Replace the surroundings with an empty dark studio room:
- Behind the subject, a large empty near-black room receding into deep shadow, thrown far out of focus as if photographed at a wide aperture: smooth and soft, the far wall and floor dissolving into darkness. Keep the piece itself sharp from front to back.
- The piece is usually standing on flattened cardboard boxes or packing sheets. Those are floor covering, not part of the piece: put the studio floor in their place at the height the piece already rests at, so it stands directly on the floor.
- Add a soft contact shadow where the piece meets the floor, consistent with the existing lighting direction.
- Remove all props, packing material, cardboard, pallets, tools, people, hands, text and watermarks.
- Remove any power cord, plug, extension cord or power strip visible in the shot, including where a cord runs off the piece toward a wall outlet. A cord is not part of the stone even when the piece is a lamp photographed while lit.
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


/**
 * Upload the cleaned image to Google Drive, through the same Apps Script path
 * the wizard already uses for masks and bitmaps.
 *
 * This used to write to Supabase Storage, which made the cleanup pipeline the
 * only thing in the app storing its output outside Drive. That divergence
 * reached the customer: Rare Earth import the Shopify workbook through
 * Matrixify, which wants a direct Drive download link, and the export only
 * rewrites URLs it recognises as Drive -- a Supabase URL fell through the else
 * branch and shipped verbatim.
 *
 * Drive mints a NEW file id per upload instead of upserting to a fixed path,
 * so a re-clean changes the URL by itself and the content-hash cache-buster
 * this function used to append is neither needed nor meaningful here. The
 * trade is that a re-cleaned image leaves its predecessor behind in Drive,
 * which is already true of every mask and bitmap the wizard uploads.
 */
export async function uploadCleanedImage(dataUrl: string, fileName: string, user?: any): Promise<string> {
    const res = await handleProcessedFileUpload(dataUrl, fileName, user);
    if (!res?.thumbnailUrl) throw new Error('Drive upload returned no URL for the cleaned image');

    // No cache-buster here, unlike the Supabase version this replaced.
    //
    // That one existed because the storage path came from bgCacheKey, which
    // only changes when the prompt version, the quality or the source URL
    // changes -- so a re-clean upserted over the same object and handed back a
    // byte-identical URL, and every viewer kept serving the previous image for
    // an hour. A fresh Drive file id per upload solves that at the source.
    return res.thumbnailUrl;
}
