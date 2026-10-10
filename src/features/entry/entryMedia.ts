/**
 * Photos for one entry: reading picked files into previews and uploading the
 * ones not uploaded yet, through the app's existing helper (Drive for images,
 * Supabase storage for video).
 *
 * The three old entry paths each had a media policy. The wizard compressed
 * video, appended &tag=Product (a type with no control behind it) and, when an
 * upload failed, saved anyway and announced success with the photo missing.
 * Create Item aborted on the first failure and lost every upload before it.
 * Here a failed upload stops the save and names the photo, and every photo
 * that did upload keeps its URL, so pressing Save again uploads only what is
 * left. Generate uploads through the same call, so a photo is never uploaded
 * twice for one entry.
 */
import { handleFileUpload, readFileAsDataURL } from '../../lib/utils';
import { compressAndTrimVideo } from '../../lib/videoCompressor';
import { photoKey, type EntryPhoto } from './entryModel';

/** Reads picked image and video files into photos with previews, skipping other types and read errors. */
export async function readPickedFiles(files: readonly File[]): Promise<EntryPhoto[]> {
    const out: EntryPhoto[] = [];
    for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        if (!isVideo && !file.type.startsWith('image/')) continue;
        try {
            const preview = await readFileAsDataURL(file, isVideo ? 'video' : 'image');
            out.push({ key: photoKey(), file, preview, isVideo });
        } catch (err) {
            console.warn('[entry] Could not read', file.name, err);
        }
    }
    return out;
}

export interface UploadProgress {
    done: number;
    total: number;
    /** Already translated by the caller's formatter; English source here. */
    label: string;
}

/**
 * Upload every photo that has a file and no URL yet. Returns the photos with
 * their URLs filled in (same order, same keys) and the names that failed.
 */
export async function uploadEntryPhotos(
    photos: readonly EntryPhoto[],
    user: unknown,
    onProgress?: (p: UploadProgress) => void,
): Promise<{ photos: EntryPhoto[]; failed: string[] }> {
    const pending = photos.filter(p => p.file && !p.url);
    const failed: string[] = [];
    const next = photos.slice();
    let done = 0;
    for (const p of pending) {
        const file = p.file!;
        onProgress?.({ done, total: pending.length, label: file.name });
        try {
            const toSend = file.type.startsWith('video/') ? await compressAndTrimVideo(file) : file;
            const res = await handleFileUpload(toSend, user);
            if (!res?.thumbnailUrl) throw new Error('no URL returned');
            const i = next.findIndex(x => x.key === p.key);
            if (i >= 0) next[i] = { ...next[i], url: res.thumbnailUrl };
        } catch (err) {
            console.error('[entry] Upload failed:', file.name, err);
            failed.push(file.name);
        }
        done++;
        onProgress?.({ done, total: pending.length, label: file.name });
    }
    return { photos: next, failed };
}
