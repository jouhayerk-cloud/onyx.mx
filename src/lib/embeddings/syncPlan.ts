/**
 * Item representation used for planning embedding synchronization.
 */
export interface ItemToSync {
    id: string;
    title: string;
    text: string;
    updatedAt: string;
}

/**
 * Database row representing an existing stored embedding record.
 */
export interface StoredEmbeddingRow {
    id: string;
    sourceHash: string;
    modelVersion: string;
}

/**
 * Result of the embedding sync planning process.
 */
export interface SyncPlanResult {
    toEmbed: string[];
    toDelete: string[];
    upToDate: number;
}

/**
 * Computes a deterministic 32-bit FNV-1a hex string of `title + '\u0001' + text`.
 *
 * @param title - The title of the item.
 * @param text - The text content of the item.
 * @returns An 8-character lowercase hexadecimal hash string.
 */
export function sourceHashOf(title: string, text: string): string {
    const combined = title + '\u0001' + text;
    const bytes = new TextEncoder().encode(combined);
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        hash = (hash ^ bytes[i]) >>> 0;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Plans synchronization updates for an embeddings table by comparing
 * current inventory items against existing stored embedding records.
 *
 * @param items - The inventory items to synchronize.
 * @param stored - The currently stored embedding rows.
 * @param modelVersion - The expected target model version.
 * @returns The sync plan detailing items to embed, rows to delete, and up-to-date count.
 */
export function planEmbeddingSync(
    items: ItemToSync[],
    stored: StoredEmbeddingRow[],
    modelVersion: string
): SyncPlanResult {
    const storedById = new Map<string, StoredEmbeddingRow>();
    for (const row of stored) {
        if (!storedById.has(row.id)) {
            storedById.set(row.id, row);
        }
    }

    const liveItemIds = new Set<string>();
    const toEmbed: string[] = [];
    let upToDate = 0;

    for (const item of items) {
        liveItemIds.add(item.id);
        const storedRow = storedById.get(item.id);

        if (!storedRow) {
            toEmbed.push(item.id);
        } else {
            const currentHash = sourceHashOf(item.title, item.text);
            if (storedRow.sourceHash !== currentHash || storedRow.modelVersion !== modelVersion) {
                toEmbed.push(item.id);
            } else {
                upToDate++;
            }
        }
    }

    const toDelete: string[] = [];
    const seenDeleted = new Set<string>();

    for (const row of stored) {
        if (!liveItemIds.has(row.id)) {
            if (!seenDeleted.has(row.id)) {
                seenDeleted.add(row.id);
                toDelete.push(row.id);
            }
        }
    }

    return {
        toEmbed,
        toDelete,
        upToDate,
    };
}
