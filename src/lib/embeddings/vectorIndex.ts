import { topK } from './vectorMath';

const INITIAL_CAPACITY = 64;

/**
 * Serialized representation of a VectorIndex.
 */
export interface SerializedVectorIndex {
    dims: number;
    modelVersion: string;
    ids: string[];
    vectors: Float32Array;
}

/**
 * Single search match result containing the item ID and similarity score.
 */
export interface VectorSearchResult {
    id: string;
    score: number;
}

/**
 * In-memory vector index with geometric capacity growth, O(1) removals via swap-with-last,
 * and cosine similarity search using topK.
 */
export class VectorIndex {
    /** Dimensionality of vectors stored in the index. */
    readonly dims: number;

    /** Model version identifier for checking index compatibility. */
    readonly modelVersion: string;

    private _vectors: Float32Array;
    private _ids: string[];
    private _idToRow: Map<string, number>;

    /**
     * Initializes an empty vector index.
     * @param dims - Number of dimensions per vector (must be positive integer).
     * @param modelVersion - Model version string identifying embedding space compatibility.
     */
    constructor(dims: number, modelVersion: string) {
        if (dims <= 0 || !Number.isInteger(dims)) {
            throw new RangeError('dims must be a positive integer');
        }
        this.dims = dims;
        this.modelVersion = modelVersion;
        this._vectors = new Float32Array(INITIAL_CAPACITY * dims);
        this._ids = [];
        this._idToRow = new Map();
    }

    /**
     * Number of items currently stored in the index.
     */
    get size(): number {
        return this._ids.length;
    }

    /**
     * Returns true if an item with the given ID exists in the index.
     * @param id - Item identifier.
     */
    has(id: string): boolean {
        return this._idToRow.has(id);
    }

    /**
     * Inserts a new vector or replaces an existing vector in place.
     * @param id - Item identifier.
     * @param vec - Float32Array of length matching this.dims.
     */
    upsert(id: string, vec: Float32Array): void {
        if (vec.length !== this.dims) {
            throw new Error(`Vector dimension mismatch: expected ${this.dims}, got ${vec.length}`);
        }
        const existingRow = this._idToRow.get(id);
        if (existingRow !== undefined) {
            this._vectors.set(vec, existingRow * this.dims);
            return;
        }

        const row = this._ids.length;
        this.ensureCapacity(row + 1);
        this._vectors.set(vec, row * this.dims);
        this._ids.push(id);
        this._idToRow.set(id, row);
    }

    /**
     * Removes an item by ID in O(1) time by swapping the last row into the freed slot.
     * If the ID is not found, this is a no-op.
     * @param id - Item identifier.
     */
    remove(id: string): void {
        const row = this._idToRow.get(id);
        if (row === undefined) {
            return;
        }
        const lastRow = this._ids.length - 1;
        if (row < lastRow) {
            const lastId = this._ids[lastRow];
            const lastStart = lastRow * this.dims;
            const targetStart = row * this.dims;
            this._vectors.copyWithin(targetStart, lastStart, lastStart + this.dims);
            this._ids[row] = lastId;
            this._idToRow.set(lastId, row);
        }
        this._ids.pop();
        this._idToRow.delete(id);
    }

    /**
     * Searches for the top-k most similar vectors to the query vector.
     * @param query - Query vector of length matching this.dims.
     * @param k - Maximum number of results to return.
     * @returns Array of matches with ID and similarity score, descending by score.
     */
    search(query: Float32Array, k: number): VectorSearchResult[] {
        if (query.length !== this.dims) {
            throw new Error(`Vector dimension mismatch: expected ${this.dims}, got ${query.length}`);
        }
        if (this._ids.length === 0 || k <= 0) {
            return [];
        }
        const usedVectors = this._vectors.subarray(0, this._ids.length * this.dims);
        const matches = topK(query, usedVectors, this.dims, k);
        return matches.map(m => ({ id: this._ids[m.index], score: m.score }));
    }

    /**
     * Serializes the index into a compact representation with a copy of all used vectors.
     */
    serialize(): SerializedVectorIndex {
        return {
            dims: this.dims,
            modelVersion: this.modelVersion,
            ids: this._ids.slice(),
            vectors: this._vectors.slice(0, this._ids.length * this.dims),
        };
    }

    /**
     * Deserializes a saved state into a new VectorIndex instance.
     * @param blob - Serialized index state.
     */
    static deserialize(blob: {
        dims: number;
        modelVersion: string;
        ids: string[];
        vectors: Float32Array;
    }): VectorIndex {
        const { dims, modelVersion, ids, vectors } = blob;
        if (dims <= 0 || !Number.isInteger(dims)) {
            throw new RangeError('dims must be a positive integer');
        }
        const count = ids.length;
        let floatVec: Float32Array;
        const raw = vectors as unknown;
        if (raw instanceof Float32Array) {
            floatVec = raw;
        } else if (raw instanceof ArrayBuffer) {
            floatVec = new Float32Array(raw);
        } else if (ArrayBuffer.isView(raw)) {
            if (raw.byteOffset % Float32Array.BYTES_PER_ELEMENT === 0 && raw.byteLength % Float32Array.BYTES_PER_ELEMENT === 0) {
                floatVec = new Float32Array(
                    raw.buffer,
                    raw.byteOffset,
                    raw.byteLength / Float32Array.BYTES_PER_ELEMENT
                );
            } else {
                const u8 = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
                const copy = new Uint8Array(u8);
                floatVec = new Float32Array(copy.buffer);
            }
        } else {
            floatVec = new Float32Array(raw as ArrayLike<number>);
        }

        if (floatVec.length !== count * dims) {
            throw new Error(`Vectors length (${floatVec.length}) does not match expected length (${count * dims})`);
        }

        const index = new VectorIndex(dims, modelVersion);
        const capacity = Math.max(INITIAL_CAPACITY, count);
        index._vectors = new Float32Array(capacity * dims);
        index._vectors.set(floatVec);
        index._ids = ids.slice();
        index._idToRow = new Map();
        for (let i = 0; i < count; i++) {
            index._idToRow.set(ids[i], i);
        }
        return index;
    }

    /**
     * Checks if this index was created with the given model version.
     * @param modelVersion - Model version string to compare.
     */
    isCompatible(modelVersion: string): boolean {
        return this.modelVersion === modelVersion;
    }

    /**
     * Ensures capacity for at least neededRows by growing geometrically.
     */
    private ensureCapacity(neededRows: number): void {
        const currentCapacity = this._vectors.length / this.dims;
        if (neededRows <= currentCapacity) {
            return;
        }
        let newCapacity = Math.max(INITIAL_CAPACITY, currentCapacity * 2);
        while (newCapacity < neededRows) {
            newCapacity *= 2;
        }
        const nextVectors = new Float32Array(newCapacity * this.dims);
        nextVectors.set(this._vectors);
        this._vectors = nextVectors;
    }
}
