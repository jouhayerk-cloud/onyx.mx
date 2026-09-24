export async function processQueueWithConcurrency<T>(
    items: T[],
    concurrency: number,
    processor: (item: T) => Promise<void>
): Promise<void> {
    const queue = [...items];
    const workers = Array(Math.min(concurrency, queue.length)).fill(0).map(async () => {
        while (queue.length > 0) {
            const item = queue.shift();
            if (item) {
                try {
                    await processor(item);
                } catch (err) {
                    console.error("Queue processor error:", err);
                }
            }
        }
    });
    await Promise.all(workers);
}
