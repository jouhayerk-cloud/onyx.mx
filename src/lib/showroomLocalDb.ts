/**
 * On-device persistent storage for Showroom staging items.
 * Uses native IndexedDB to store items and their binary photo Blobs locally.
 * Items remain persistent across refreshes and browser restarts until the
 * user explicitly clicks "Save to Cloud" or "Clear".
 */

import type { ParsedVendorItem } from './vendorIntakeParser';

export interface StagedShowroomItem extends ParsedVendorItem {
    id: string;
    vendor: string;
    created_at: string;
    updated_at: string;
    matchedPhotoBlob?: Blob | null;
    photoDataUrl?: string | null;
    img_clean?: string | null;
    svg_data?: string | null;
}

const DB_NAME = 'OnyxShowroomStaging';
const DB_VERSION = 1;
const STORE_NAME = 'staged_items';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
    if (typeof window === 'undefined' || !window.indexedDB) {
        return Promise.reject(new Error('IndexedDB not supported in this environment'));
    }

    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = window.indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('vendor', 'vendor', { unique: false });
                    store.createIndex('created_at', 'created_at', { unique: false });
                }
            };

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('Failed to open OnyxShowroomStaging database'));
        });
    }

    return dbPromise;
}

/**
 * Generate a unique ID for a staged item
 */
export function generateStagedId(): string {
    return 'staged_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/**
 * Retrieve all staged items from the local on-device database, optionally filtered by vendor.
 */
export async function getStagedShowroomItems(vendorFilter?: string): Promise<StagedShowroomItem[]> {
    try {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();

            req.onsuccess = () => {
                let items: StagedShowroomItem[] = req.result || [];
                if (vendorFilter) {
                    items = items.filter(it => it.vendor === vendorFilter);
                }
                // Sort by created_at ascending
                items.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
                
                // Reconstruct object URLs from stored Blobs for display
                for (const item of items) {
                    if (item.matchedPhotoBlob && !item.matchedPhotoUrl) {
                        try {
                            item.matchedPhotoUrl = URL.createObjectURL(item.matchedPhotoBlob);
                            item.matchedPhoto = item.matchedPhotoBlob;
                        } catch (err) {
                            console.warn('[ShowroomLocalDb] Failed creating object URL for blob:', err);
                        }
                    }
                }
                resolve(items);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.warn('[ShowroomLocalDb] IndexedDB get failed, falling back to empty:', err);
        return [];
    }
}

/**
 * Save or update multiple staged items to the on-device database.
 */
export async function saveStagedShowroomItems(items: StagedShowroomItem[]): Promise<void> {
    if (!items.length) return;
    try {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);

            for (const item of items) {
                // Ensure photo is stored as Blob
                const toStore: any = { ...item };
                if (item.matchedPhoto instanceof Blob) {
                    toStore.matchedPhotoBlob = item.matchedPhoto;
                }
                // Delete ephemeral object URL before serializing
                delete toStore.matchedPhoto;
                store.put(toStore);
            }
        });
    } catch (err) {
        console.error('[ShowroomLocalDb] Failed saving staged items:', err);
        throw err;
    }
}

/**
 * Upsert a single staged item (e.g. after user edits fields in modal).
 */
export async function upsertStagedShowroomItem(item: StagedShowroomItem): Promise<void> {
    try {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);

            const toStore: any = { 
                ...item,
                updated_at: new Date().toISOString()
            };
            if (item.matchedPhoto instanceof Blob) {
                toStore.matchedPhotoBlob = item.matchedPhoto;
            }
            delete toStore.matchedPhoto;
            store.put(toStore);
        });
    } catch (err) {
        console.error('[ShowroomLocalDb] Failed updating staged item:', err);
        throw err;
    }
}

/**
 * Delete a single staged item by ID.
 */
export async function deleteStagedShowroomItem(id: string): Promise<void> {
    try {
        const db = await getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            store.delete(id);
        });
    } catch (err) {
        console.error('[ShowroomLocalDb] Failed deleting staged item:', err);
        throw err;
    }
}

/**
 * Clear all staged items from the on-device database, optionally filtered by vendor.
 */
export async function clearStagedShowroomItems(vendorFilter?: string): Promise<void> {
    try {
        const db = await getDb();
        if (!vendorFilter) {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const req = store.clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }

        // Delete only for specified vendor
        const all = await getStagedShowroomItems(vendorFilter);
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            for (const item of all) {
                store.delete(item.id);
            }
        });
    } catch (err) {
        console.error('[ShowroomLocalDb] Failed clearing staged items:', err);
    }
}
