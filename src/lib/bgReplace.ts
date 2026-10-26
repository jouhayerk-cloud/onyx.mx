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
import { loadImage, handleProcessedFileUpload } from './utils';
import { canvasToDataUrl } from './workers/imageWorkerClient';
import { getGeminiKey } from './ai/keys';
import { AI_MODELS, modelChain } from './ai/models';
import { getGenAiSdk, aiSleep, backoffMs, retryDelayFrom } from './ai/client';
import { withAiSlot } from './ai/limiter';
import {
    AiCancelledError,
    AiError,
    AiKeyMissingError,
    AiQuotaError,
    AiResponseError,
    AiTimeoutError,
} from './ai/errors';

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
// v8 (26 Oct 2026): output is always a square 1:1 frame, the room extended around the piece.
export const BG_PROMPT_VERSION = 'dark-room-v8';

/**
 * The light room is its own prompt line with its own version. bgCacheKey leaves
 * the dark key exactly as it was, so adding the light room invalidated no
 * stored dark result, and a dark result can never satisfy a light request (or
 * the reverse): the stored cleanedKey differs, so switching rooms re-cleans.
 *
 * It is NOT covered by the coupling to colorExtractor.ts described above: that
 * guard drops RGB <= 45 and would count a light grey backdrop as stone.
 * catalogHubPipeline therefore never samples a light-room frame for colour
 * (isLightRoomKey): it reads the cut-out, else the original photo.
 *
 * Wording was written in imgCleaner.html and is UNTESTED against stock:
 * check a few white and cream pieces first, where a light backdrop has the
 * least contrast with the stone edge.
 */
export const BG_LIGHT_PROMPT_VERSION = 'light-room-v2'; // v2: square 1:1 frame, as dark-room-v8

export type BgQuality = '1K' | '2K';

/** Which studio the background is repainted as. */
export type BgRoom = 'dark' | 'light';

/*
 * The model chain lives in lib/ai/models.ts as AI_MODELS.bgReplace, with the
 * reasoning for the order.
 */

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

    const dataUrl = await canvasToDataUrl(canvas, 'image/jpeg', 0.92);
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

/** The three phrases that change between rooms; everything else in the prompt is shared. */
const ROOMS: Record<BgRoom, { roomName: string; envDesc: string; bgDesc: string }> = {
    dark: {
        roomName: 'dark room',
        envDesc: 'empty dark studio room',
        bgDesc: 'a large empty near-black room receding into deep shadow, thrown far out of focus as if photographed at a wide aperture: smooth and soft, the far wall and floor dissolving into darkness. Keep the piece itself sharp from front to back.',
    },
    light: {
        roomName: 'studio room',
        envDesc: 'empty light grey studio room',
        bgDesc: 'a large empty light grey room bathed in soft, diffused light, thrown far out of focus as if photographed at a wide aperture: smooth and soft, the far wall and floor fading into a gentle brightness. Keep the piece itself sharp from front to back.',
    },
};

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
export function buildRoomPrompt(subject: BgSubject, room: BgRoom = 'dark', isMirror = false): string {
    const piece = [subject.material, subject.shape].filter(Boolean).join(' ').trim()
        || 'natural stone artisan piece';
    const detail = subject.description ? ` (${subject.description})` : '';
    const r = ROOMS[room];
    // "Add nothing new: no ... reflections" alone left the workshop reflected in
    // mirror glass; for mirrors the glass gets a reflection to DRAW instead.
    const mirror = isMirror ? `\n${mirrorGlassLine(r.roomName)}` : '';

    return `Replace ONLY the background of this photograph. The subject is a handmade ${piece}${detail} in natural Mexican stone.

Keep the subject exactly as photographed:
- Reproduce it pixel-for-pixel. Do not restyle, retouch, straighten, recolour, relight or "improve" it.
- Its natural veining, mineral banding and dark or near-black patches are STONE, not dirt or shadow. Preserve every one at its original tone.
- The stone keeps its own colour all the way out to its outline. The ${r.roomName} and its shadows stay behind the piece and outside it, never spilling onto its surface -- especially around mirror glass, openings and cut-outs, where the stone edge stays clean and unbroken.
- Its rough, unpolished, chipped or bark-like outer edges are part of the piece. Never smooth, trim or tidy them.
- If any part is translucent or lit from within, preserve that glow and its exact colour.
- Keep every component: bases, arms, fittings, hardware, mirror glass and each separate piece in a set.

Replace the surroundings with an ${r.envDesc}:
- Behind the subject, ${r.bgDesc}
- The piece is usually standing on flattened cardboard boxes or packing sheets. Those are floor covering, not part of the piece: put the studio floor in their place at the height the piece already rests at, so it stands directly on the floor.
- Add a soft contact shadow where the piece meets the floor, consistent with the existing lighting direction.
- Remove all props, packing material, cardboard, pallets, tools, people, hands, text and watermarks.
- Remove any power cord, plug, extension cord or power strip visible in the shot, including where a cord runs off the piece toward a wall outlet. A cord is not part of the stone even when the piece is a lamp photographed while lit.
- Add nothing new: no furniture, plants, decor, reflections or text.${mirror}

${SQUARE_FRAME}`;
}

/**
 * What the mirror glass shows, for both passes: a reflection of the NEW empty
 * room, written as something to draw. The glass reflected the workshop in the
 * original photo, and an empty prompt slot left that reflection in place.
 */
const mirrorGlassLine = (roomName: string) =>
    `- The mirror glass reflects only the new empty ${roomName}: a soft, even studio reflection, a smooth gradient with one gentle diagonal highlight. Paint that soft reflection over the whole glass, in place of the workshop, people, the camera, windows, lights and other pieces it showed in the original photograph. The stone frame around the glass and its edge against the glass stay exactly as they are.`;

/**
 * Every clean-room image is a square 1:1 frame. Phrased as a scene to draw
 * (the room extended around the piece), not as rules, for the reason above.
 */
const SQUARE_FRAME = `Keep the camera angle, and keep the piece at its photographed size and proportions. Output a square 1:1 image: the whole piece in frame and centred, with the empty room extended around it to fill the square. The piece is never stretched, squashed or cropped.`;

/**
 * Second pass, run on an already-cleaned frame: the clean pass leaves a
 * reflected room in mirror glass, and neighbouring pieces or clutter at the
 * frame edges when items were photographed close together. Same fidelity
 * clauses as the room prompt, and the same rule for writing it: describe what
 * to draw (more empty room, a soft studio reflection), not what to avoid.
 */
export function buildEnhancePrompt(subject: BgSubject, room: BgRoom = 'dark', isMirror = false): string {
    const piece = [subject.material, subject.shape].filter(Boolean).join(' ').trim()
        || 'natural stone artisan piece';
    const detail = subject.description ? ` (${subject.description})` : '';
    const r = ROOMS[room];
    const mirror = isMirror ? `\n${mirrorGlassLine(r.roomName)}` : '';

    return `This is a studio photograph of a handmade ${piece}${detail} in natural Mexican stone, already standing in an ${r.envDesc}. Finish the photograph so the piece stands alone in a clean room.

Keep the piece exactly as photographed:
- Reproduce it pixel-for-pixel. Do not restyle, retouch, straighten, recolour, relight or "improve" it.
- Its natural veining, mineral banding and dark or near-black patches are STONE, not dirt or shadow. Preserve every one at its original tone.
- Its rough, unpolished, chipped or bark-like outer edges are part of the piece. Never smooth, trim or tidy them.
- If any part is translucent or lit from within, preserve that glow and its exact colour.
- Keep every component: bases, arms, fittings, hardware, mirror glass and each separate piece in a set.

Finish the room:
- Around the piece, ${r.bgDesc}
- Wherever another object is still visible -- a second piece, part of a neighbouring item, a wall edge, cardboard, a cord, a tool or any clutter, especially along the edges of the frame -- continue the empty ${r.roomName} over it.
- Keep the soft contact shadow where the piece meets the floor.${mirror}

${SQUARE_FRAME}`;
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
    room: BgRoom;
}

/** The SDK's ApiError carries the HTTP status; a fetch failure does not. */
const statusOf = (err: any): number | undefined =>
    typeof err?.status === 'number' ? err.status
        : typeof err?.code === 'number' ? err.code
            : undefined;

/**
 * One generateContent call through the SDK, with a timeout and the caller's
 * AbortSignal wired into the request itself -- checkAbort used to stop
 * waiting while the request carried on running and billing.
 */
async function generateImageOnce(
    model: string,
    parts: unknown[],
    config: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal,
): Promise<any> {
    if (signal?.aborted) throw new AiCancelledError();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        return await getGenAiSdk().models.generateContent({
            model,
            contents: { parts } as any,
            config: { ...config, abortSignal: controller.signal } as any,
        });
    } catch (err: any) {
        if (controller.signal.aborted) {
            if (timedOut) throw new AiTimeoutError(timeoutMs);
            throw new AiCancelledError();
        }
        if (statusOf(err) === 429 || /RESOURCE_EXHAUSTED/.test(String(err?.message))) {
            const quota = new AiQuotaError(String(err?.message || ''));
            (quota as any).retryAfterMs = retryDelayFrom(String(err?.message || ''));
            throw quota;
        }
        throw err;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

/**
 * Ask the model for the piece standing in an empty studio room, dark (the
 * default) or light.
 *
 * Walks the AI_MODELS.bgReplace chain, and within each model retries once
 * without `imageConfig` -- older image models reject the field outright, and
 * losing size control is a far better outcome than failing the item.
 *
 * A 429 is not a model rejection. Walking the chain on one used to fire up to
 * four image requests back to back into the same exhausted quota; now it
 * waits once (the server's RetryInfo, else a short backoff), retries the same
 * request, and gives up with AiQuotaError if the quota is still out.
 *
 * Holds one 'image' slot of the shared limiter for the whole chain, so the
 * Catalog Hub and Batch Create running together still send at most two image
 * generations at a time.
 *
 * The whole chain shares one AI_MODELS.bgReplace.timeoutMs deadline, and a
 * timeout ends it: it is not a rejection, so walking on to the next config
 * and model gave every attempt its own full timeout and could hold that slot
 * for twelve minutes per photo.
 */
export function replaceBackground(
    imageUrl: string,
    subject: BgSubject,
    opts: BgOptions = {},
): Promise<BgResult> {
    return runImageEdit(imageUrl, buildRoomPrompt(subject, opts.room ?? 'dark', !!opts.isMirror), opts, 'Background replaced');
}

/**
 * The Enhance Cleanup pass: starts from an already-cleaned frame (not the
 * original photo) and clears what the clean pass leaves behind -- the room
 * reflected in mirror glass, neighbouring pieces and clutter at the frame edges.
 */
export function enhanceCleanup(
    cleanedUrl: string,
    subject: BgSubject,
    opts: BgOptions = {},
): Promise<BgResult> {
    return runImageEdit(cleanedUrl, buildEnhancePrompt(subject, opts.room ?? 'dark', !!opts.isMirror), opts, 'Cleanup enhanced');
}

export interface BgOptions { quality?: BgQuality; room?: BgRoom; isMirror?: boolean; onLog?: (msg: string) => void; signal?: AbortSignal }

/**
 * Pads a non-square result to a square with the median colour of its outer
 * border, centring the frame. Only the fallback path (models that reject
 * imageConfig) can return a non-square image; this keeps every clean-room
 * output 1:1 without stretching anything.
 */
async function padToSquare(dataUrl: string): Promise<string> {
    const img = await loadImage(dataUrl);
    const w = img.width, h = img.height;
    if (Math.abs(w - h) <= Math.max(w, h) * 0.01) return dataUrl;
    const side = Math.max(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, w, h).data;
    const border: number[][] = [];
    const take = (x: number, y: number) => { const i = (y * w + x) * 4; border.push([px[i], px[i + 1], px[i + 2]]); };
    for (let x = 0; x < w; x += 4) { take(x, 0); take(x, h - 1); }
    for (let y = 0; y < h; y += 4) { take(0, y); take(w - 1, y); }
    const med = [0, 1, 2].map(c => border.map(p => p[c]).sort((a, b) => a - b)[border.length >> 1] ?? 0);
    ctx.clearRect(0, 0, side, side);
    ctx.fillStyle = `rgb(${med[0]},${med[1]},${med[2]})`;
    ctx.fillRect(0, 0, side, side);
    ctx.drawImage(img, Math.round((side - w) / 2), Math.round((side - h) / 2));
    return canvasToDataUrl(canvas, 'image/png');
}

async function runImageEdit(
    imageUrl: string,
    prompt: string,
    opts: BgOptions,
    doneLabel: string,
): Promise<BgResult> {
    const { quality = '2K', room = 'dark', onLog, signal } = opts;
    if (!getGeminiKey()) throw new AiKeyMissingError();

    const source = await loadImageForGeneration(imageUrl);
    const aspectRatio = '1:1';

    const requestParts = [
        { inlineData: { mimeType: source.mimeType, data: source.data } },
        { text: prompt },
    ];
    const timeoutMs = AI_MODELS.bgReplace.timeoutMs;

    return withAiSlot('image', async () => {
        // The deadline starts once the slot is held, so waiting in line does
        // not use up the request's budget (as in videoAI).
        const deadline = Date.now() + timeoutMs;
        let lastError: Error | null = null;
        let quotaRetried = false;

        for (const model of modelChain('bgReplace')) {
            for (const withImageConfig of [true, false]) {
                const config = {
                    responseModalities: [Modality.IMAGE],
                    ...(withImageConfig ? { imageConfig: { aspectRatio, imageSize: quality } } : {}),
                };
                for (;;) {
                    const remaining = deadline - Date.now();
                    if (remaining <= 0) throw new AiTimeoutError(timeoutMs);
                    try {
                        onLog?.(`[ WAIT ] ${model}${withImageConfig ? ` @ ${quality}` : ''}${room === 'light' ? ' (light room)' : ''}...`);
                        const response = await generateImageOnce(model, requestParts, config, remaining, signal);

                        const image = extractImagePart(response);
                        if (!image) {
                            const finish = response?.candidates?.[0]?.finishReason;
                            throw new AiResponseError(`Model returned no image${finish ? ` (${finish})` : ''}`);
                        }

                        onLog?.(`[  OK  ] ${doneLabel} via ${model}`);
                        return {
                            dataUrl: await padToSquare(`data:${image.mimeType};base64,${image.data}`),
                            modelUsed: model,
                            aspectRatio,
                            room,
                        };
                    } catch (err: any) {
                        if (err instanceof AiCancelledError || err instanceof AiKeyMissingError) throw err;
                        if (err instanceof AiTimeoutError) throw new AiTimeoutError(timeoutMs);
                        if (err instanceof AiQuotaError) {
                            if (quotaRetried) throw err;
                            quotaRetried = true;
                            onLog?.(`[ WARN ] ${model}: ${err.message}; retrying once`);
                            await aiSleep(backoffMs(err), signal);
                            continue;
                        }
                        lastError = err instanceof Error ? err : new Error(String(err));
                        onLog?.(`[ WARN ] ${model} rejected: ${lastError.message}`);
                        break;
                    }
                }
            }
        }

        if (lastError instanceof AiError) throw lastError;
        throw new AiResponseError(
            `All image models rejected the request${lastError ? `: ${lastError.message.slice(0, 160)}` : ''}`,
            { cause: lastError },
        );
    }, signal);
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
export const bgCacheKey = (sourceUrl: string, quality: BgQuality, room: BgRoom = 'dark'): string =>
    hashString(`${room === 'light' ? BG_LIGHT_PROMPT_VERSION : BG_PROMPT_VERSION}|${quality}|${sourceUrl}`);

/** True when a stored cleanedKey names a light-room render of `sourceUrl`, at either quality. */
export const isLightRoomKey = (key: string | undefined | null, sourceUrl: string): boolean =>
    !!key && (['1K', '2K'] as const).some(q => key === bgCacheKey(sourceUrl, q, 'light'));


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
    // Name the file after what it actually contains.
    //
    // Callers pass ".png" unconditionally, but the model hands back whatever it
    // hands back -- every one of the 150 images already in storage is JPEG
    // bytes under a .png name. That was invisible while Supabase served them
    // with a content type taken from the blob, and it stops being invisible on
    // Drive, where the name is what people see.
    const mimeExt = /^data:image\/(png|jpeg|webp|svg\+xml)/i.exec(dataUrl)?.[1];
    const ext = mimeExt === 'svg+xml' ? 'svg' : mimeExt === 'jpeg' ? 'jpg' : mimeExt;
    const named = ext ? `${fileName.replace(/\.[a-z0-9+]+$/i, '')}.${ext}` : fileName;

    const res = await handleProcessedFileUpload(dataUrl, named, user);
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
