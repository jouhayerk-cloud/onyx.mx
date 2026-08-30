import { ai } from './ai';
import { getFFmpegInstance } from './videoCompressor';
import { fetchFile } from '@ffmpeg/util';

const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(video.src);
            resolve(video.duration);
        };
        video.onerror = () => reject(new Error('Failed to load video metadata'));
        video.src = URL.createObjectURL(file);
    });
};

const processOneClip = async (
    clip: Blob,
    shape: string,
    description: string,
    clipIndex: number,
    totalClips: number,
    onProgress?: (progress: number, label: string) => void
): Promise<Blob> => {
    const tag = totalClips > 1 ? ` (Clip ${clipIndex + 1}/${totalClips})` : '';
    onProgress?.(10, `Preparing video${tag} for Gemini...`);

    const reader = new FileReader();
    const b64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(clip);
    });
    const base64Data = b64.split(',')[1];

    onProgress?.(30, `Prompting Gemini Omni Flash${tag}...`);

    const prompt = `GENERATE new video of the Item in an empty room. Remove all items in the background and leave ONLY the "${shape} ${description}" (Onyx item) in a completely empty room. Maintain the item's original appearance and scale, but place it in a pristine, empty environment. Ensure the output video resolution is strictly 1080p (1920x1080).`;

    const apiKey = (ai as any).apiKey || '';
    const url = `https://generativelanguage.googleapis.com/v1beta/interactions`;

    const payload = {
        model: 'models/gemini-omni-flash-preview',
        input: [
            { type: 'text', text: prompt },
            { type: 'video', mime_type: clip.type || 'video/mp4', data: base64Data }
        ]
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Interactions API Error: ${res.status} ${errText}`);
    }

    const responseData = await res.json();
    onProgress?.(80, `Processing response${tag}...`);

    let videoBase64 = '';

    // Try "steps" structure
    if (responseData.steps && Array.isArray(responseData.steps)) {
        const outputStep = responseData.steps.find((s: any) => s.type === 'model_output');
        if (outputStep?.content && Array.isArray(outputStep.content)) {
            const vp = outputStep.content.find((p: any) => p.type === 'video' || p.mime_type?.startsWith('video/'));
            if (vp?.data) videoBase64 = vp.data;
        }
    }

    // Fallback: "candidates" structure
    if (!videoBase64) {
        const parts = responseData.candidates?.[0]?.content?.parts;
        if (parts) {
            const vp = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('video/'));
            if (vp?.inlineData) videoBase64 = vp.inlineData.data;
        }
    }

    if (!videoBase64) {
        throw new Error('Could not extract generated video from the API response.');
    }

    const bytes = atob(videoBase64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: 'video/mp4' });
};

/**
 * Processes a video with Gemini AI.
 *
 * - Videos ≤ 10 s are sent directly and return a single-element array.
 * - Longer videos are split into ≤ 10 s clips on-device with FFmpeg,
 *   each clip is processed independently by Gemini, and the resulting
 *   array of Blobs is returned (one per clip, NO stitching).
 */
export const processVideoWithGemini = async (
    file: File,
    shape: string,
    description: string,
    onProgress?: (progress: number, label: string) => void
): Promise<Blob[]> => {
    try {
        const duration = await getVideoDuration(file);

        // ── Short video: send directly ──────────────────────────
        if (duration <= 10) {
            const blob = await processOneClip(file, shape, description, 0, 1, onProgress);
            return [blob];
        }

        // ── Long video: split → process each clip ───────────────
        const CHUNK_SEC = 10;
        const numChunks = Math.ceil(duration / CHUNK_SEC);

        onProgress?.(2, 'Initializing FFmpeg for splitting...');
        const ff = await getFFmpegInstance(undefined);
        const srcName = 'src_video.mp4';
        await ff.writeFile(srcName, await fetchFile(file));

        const results: Blob[] = [];

        for (let i = 0; i < numChunks; i++) {
            const pctBase = Math.round((i / numChunks) * 90);
            onProgress?.(pctBase + 2, `Splitting clip ${i + 1}/${numChunks}...`);

            const clipName = `clip_${i}.mp4`;

            // Extract clip – compress to 480p so the base64 stays within Gemini limits
            try {
                await ff.exec([
                    '-y',
                    '-ss', String(i * CHUNK_SEC),
                    '-i', srcName,
                    '-t', String(CHUNK_SEC),
                    '-vf', 'scale=-2:480',
                    '-c:v', 'libx264',
                    '-crf', '30',
                    '-preset', 'ultrafast',
                    '-c:a', 'aac',
                    '-b:a', '64k',
                    '-movflags', '+faststart',
                    clipName
                ]);
            } catch (e) {
                console.warn(`[VideoAI] FFmpeg exec threw (may be normal exit):`, e);
            }

            let clipBlob: Blob;
            try {
                const data = await ff.readFile(clipName);
                clipBlob = new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });
                try { await ff.deleteFile(clipName); } catch (_) {}
            } catch (readErr) {
                console.error(`[VideoAI] Could not read clip ${i}:`, readErr);
                continue;
            }

            // Send this individual clip to Gemini
            onProgress?.(pctBase + 5, `Generating AI video clip ${i + 1}/${numChunks}...`);
            try {
                const genBlob = await processOneClip(
                    clipBlob, shape, description, i, numChunks,
                    (p, l) => onProgress?.(pctBase + 5 + Math.round(p * 0.5), l)
                );
                results.push(genBlob);
            } catch (err: any) {
                console.error(`[VideoAI] Gemini failed for clip ${i}:`, err);
                // Fallback: keep the original clip
                results.push(clipBlob);
            }
        }

        // Cleanup
        try { await ff.deleteFile(srcName); } catch (_) {}

        if (results.length === 0) {
            throw new Error('No video clips were generated successfully.');
        }

        onProgress?.(100, 'All video clips processed!');
        return results;

    } catch (e: any) {
        console.error('Gemini Video Gen Error:', e);
        throw new Error(e.message || 'Failed to generate video with Gemini Omni Flash');
    }
};
