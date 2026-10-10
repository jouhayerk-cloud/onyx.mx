// Auto-attach photos to Batch Create rows by filename.
//
// A photo goes to the row whose item number is in its name: EM-004.jpg,
// em_004b.jpg, 004.jpg and "EM-004 (2).jpg" all belong to row #4. The suffix
// orders a row's photos: no suffix first, then -1/-2/(2) or a/b. A vendor
// prefix that isn't the selected vendor (IMG_1234.jpg) is not matched, so
// camera filenames never land on a row by accident.
//
// Folders: files directly in the dropped folder are matched by their own
// name. A subfolder named after an item (EM-004/, 004/) holds that row's
// photos, ordered by filename. Files in any other subfolder are ignored and
// counted, so dropping a folder that also holds "originals/" doesn't flood
// the unmatched tray.

export interface PhotoCandidate {
    file: File;
    /** Path inside the dropped or picked folder, without the folder itself ('' for top-level files). */
    dir: string;
}

export interface ParsedPhotoName {
    prefix: string;
    number: number;
    order: number;
}

export interface PhotoMatchResult {
    /** Row id -> files to append, in display order. */
    assigned: Map<string, File[]>;
    unmatched: { file: File; reason: string }[];
    /** Files skipped because they sit in a subfolder that isn't named after an item. */
    ignored: number;
    /** Files already attached to their row (same name and size), skipped. */
    duplicates: number;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;
const NAME_RE = /^([A-Za-z]{1,6})?[\s._-]*0*(\d{1,4})(?:[\s._-]*(?:\((\d{1,2})\)|(\d{1,2})|([A-Za-z])))?$/;

/** True when a file has an image MIME type or an image extension such as jpg, png or heic. */
export function isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || IMAGE_EXT.test(file.name);
}

export function parsePhotoName(name: string): ParsedPhotoName | null {
    const stem = name.replace(/\.[^.]+$/, '').trim();
    const m = NAME_RE.exec(stem);
    if (!m) return null;
    const number = Number(m[2]);
    if (!number) return null;
    const suffixNum = m[3] || m[4];
    const order = suffixNum ? Number(suffixNum) : m[5] ? m[5].toLowerCase().charCodeAt(0) - 96 : 0;
    return { prefix: (m[1] || '').toUpperCase(), number, order };
}

/** Files from an <input multiple> or <input webkitdirectory>. */
export function collectInputFiles(list: FileList): PhotoCandidate[] {
    return Array.from(list).map(file => {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
        const parts = rel.split('/').filter(Boolean);
        // webkitRelativePath starts with the picked folder itself; drop it and the filename.
        return { file, dir: parts.slice(1, -1).join('/') };
    });
}

type FsEntry = {
    isFile: boolean; isDirectory: boolean; name: string; fullPath: string;
    file?: (ok: (f: File) => void, err: (e: unknown) => void) => void;
    createReader?: () => { readEntries: (ok: (e: FsEntry[]) => void, err: (e: unknown) => void) => void };
};

async function walk(entry: FsEntry, rootDepth: number, out: PhotoCandidate[]): Promise<void> {
    if (entry.isFile && entry.file) {
        const file = await new Promise<File>((ok, err) => entry.file!(ok, err));
        const parts = entry.fullPath.split('/').filter(Boolean);
        out.push({ file, dir: parts.slice(rootDepth, -1).join('/') });
        return;
    }
    if (entry.isDirectory && entry.createReader) {
        const reader = entry.createReader();
        // readEntries returns at most ~100 entries per call; read until empty.
        for (;;) {
            const batch = await new Promise<FsEntry[]>((ok, err) => reader.readEntries(ok, err));
            if (!batch.length) break;
            for (const child of batch) await walk(child, rootDepth, out);
        }
    }
}

/** Files from a drop: loose files, or one or more folders (read recursively). */
export async function collectDroppedFiles(dt: DataTransfer): Promise<PhotoCandidate[]> {
    // Entries must be taken synchronously, before the first await: the browser
    // empties the DataTransfer once the drop event handler yields.
    const entries = Array.from(dt.items || [])
        .map(item => (item.kind === 'file' && item.webkitGetAsEntry ? (item.webkitGetAsEntry() as unknown as FsEntry | null) : null))
        .filter(Boolean) as FsEntry[];
    if (!entries.length) return Array.from(dt.files).map(file => ({ file, dir: '' }));
    const out: PhotoCandidate[] = [];
    for (const entry of entries) {
        // A dropped folder is the root, so its own name isn't part of `dir`.
        await walk(entry, entry.isDirectory ? 1 : 0, out);
    }
    return out;
}

export function matchPhotosToRows(
    candidates: PhotoCandidate[],
    rows: { id: string; itemNumber: string; mediaFiles: { originalFile?: File }[] }[],
    vendorKey: string,
): PhotoMatchResult {
    // No vendor yet means only bare numbers can match (EM-004.jpg names a
    // vendor this batch does not have); it used to throw here instead.
    const vendor = String(vendorKey || '').toUpperCase();
    const rowByNumber = new Map<number, (typeof rows)[number]>();
    rows.forEach(r => {
        const n = Number(r.itemNumber);
        if (n && !rowByNumber.has(n)) rowByNumber.set(n, r);
    });
    const seen = new Set<string>();
    rows.forEach(r => r.mediaFiles.forEach(m => m.originalFile && seen.add(`${r.id}|${m.originalFile.name}|${m.originalFile.size}`)));

    const picked = new Map<string, { file: File; order: number }[]>();
    const result: PhotoMatchResult = { assigned: new Map(), unmatched: [], ignored: 0, duplicates: 0 };

    for (const { file, dir } of candidates) {
        if (!isImageFile(file)) continue;
        const folders = dir ? dir.split('/') : [];
        let target: ParsedPhotoName | null;
        let order: number;
        if (folders.length === 0) {
            target = parsePhotoName(file.name);
            order = target?.order ?? 0;
        } else {
            target = folders.length === 1 ? parsePhotoName(folders[0]) : null;
            if (!target) { result.ignored++; continue; }
            // Inside an item folder the filename only sets the order.
            order = parsePhotoName(file.name)?.number ?? 0;
        }
        if (!target) { result.unmatched.push({ file, reason: 'No item number in the name' }); continue; }
        if (target.prefix && target.prefix !== vendor) {
            result.unmatched.push({ file, reason: `${target.prefix} is not vendor ${vendor}` });
            continue;
        }
        const row = rowByNumber.get(target.number);
        if (!row) { result.unmatched.push({ file, reason: `No row #${target.number} in this batch` }); continue; }
        const key = `${row.id}|${file.name}|${file.size}`;
        if (seen.has(key)) { result.duplicates++; continue; }
        seen.add(key);
        if (!picked.has(row.id)) picked.set(row.id, []);
        picked.get(row.id)!.push({ file, order });
    }

    picked.forEach((files, rowId) => {
        files.sort((a, b) => a.order - b.order || a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
        result.assigned.set(rowId, files.map(f => f.file));
    });
    return result;
}

/** A small JPEG preview (keeps 80 full-size data URLs out of memory). */
export async function makePhotoPreview(file: File, max = 240): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.75);
}
