/**
 * L2-normalizes a vector to unit length.
 * @param v - The input vector.
 * @returns A new unit-length vector.
 */
export function l2Normalize(v: Float32Array): Float32Array {
    const len = v.length;
    const norm = Math.sqrt(v.reduce((acc, val) => acc + val * val, 0));
    if (norm === 0) return new Float32Array(len).fill(0);
    return new Float32Array(v.map(val => val / norm));
}

/**
 * Truncates and normalizes a vector.
 * @param v - The input vector.
 * @param dims - The number of dimensions to keep.
 * @returns A new normalized vector.
 */
export function truncateAndNormalize(v: Float32Array, dims: number): Float32Array {
    if (dims < 1 || dims > v.length) throw new RangeError('dims must be between 1 and v.length');
    const truncated = v.slice(0, dims);
    return l2Normalize(truncated);
}

/**
 * Computes the dot product of two vectors.
 * @param a - The first vector.
 * @param b - The second vector.
 * @returns The dot product.
 */
export function dot(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) throw new Error('Vectors must have the same length');
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result += a[i] * b[i];
    }
    return result;
}

/**
 * Finds the top-k most similar rows in a matrix to a query vector.
 * @param query - The query vector.
 * @param matrix - The matrix of rows.
 * @param dims - The number of dimensions per row.
 * @param k - The number of top results to return.
 * @returns An array of objects containing the index and score of each result.
 */
export function topK(query: Float32Array, matrix: Float32Array, dims: number, k: number): Array<{ index: number; score: number }> {
    const rows = matrix.length / dims;
    k = Math.min(k, rows);
    if (k <= 0) return [];
    const topKList: { index: number; score: number }[] = [];

    for (let i = 0; i < rows; i++) {
        const start = i * dims;
        const row = matrix.slice(start, start + dims);
        const score = dot(query, row);
        if (topKList.length < k) {
            topKList.push({ index: i, score });
            topKList.sort((a, b) => b.score - a.score);
        } else if (score > topKList[k - 1].score) {
            topKList[k - 1] = { index: i, score };
            topKList.sort((a, b) => b.score - a.score);
        }
    }

    return topKList;
}

/**
 * Recursively fuses scores from multiple lists.
 * @param lists - An array of arrays of strings.
 * @param k - The number of top results to consider.
 * @returns An array of objects containing the id and score of each result.
 */
export function reciprocalRankFusion(lists: string[][], k = 60): Array<{ id: string; score: number }> {
    const scores: { [id: string]: number } = {};

    for (const list of lists) {
        for (let i = 0; i < list.length; i++) {
            const rank = i + 1;
            const id = list[i];
            if (!scores[id]) scores[id] = 0;
            scores[id] += 1 / (k + rank);
        }
    }

    return Object.entries(scores)
        .map(([id, score]) => ({ id, score }))
        .sort((a, b) => b.score - a.score);
}

