/**
 * conflictResolver.ts
 * Last-write-wins conflict resolution based on updated_at timestamps.
 * Called during sync when a local change and a remote change affect the same record.
 */

export interface ConflictRecord {
    id: string;
    table: string;
    localRecord: any;
    remoteRecord: any;
    resolvedAt: string;
    winner: 'local' | 'remote' | 'equal';
}

const CONFLICT_LOG_KEY = 'onyx_conflict_log';
const MAX_LOG_SIZE = 100;

function logConflict(record: ConflictRecord): void {
    try {
        const log: ConflictRecord[] = JSON.parse(localStorage.getItem(CONFLICT_LOG_KEY) || '[]');
        log.unshift(record); // newest first
        if (log.length > MAX_LOG_SIZE) log.splice(MAX_LOG_SIZE);
        localStorage.setItem(CONFLICT_LOG_KEY, JSON.stringify(log));
    } catch {
        // ignore storage errors
    }
}

export function getConflictLog(): ConflictRecord[] {
    try {
        return JSON.parse(localStorage.getItem(CONFLICT_LOG_KEY) || '[]');
    } catch {
        return [];
    }
}

export function clearConflictLog(): void {
    localStorage.removeItem(CONFLICT_LOG_KEY);
}

/**
 * Resolve a conflict between a local and remote version of a record.
 * Strategy: Last-Write-Wins based on updated_at ISO timestamp.
 * @returns The winning record to persist, and which side won.
 */
export function resolveConflict(
    table: string,
    localRecord: any,
    remoteRecord: any
): { winner: 'local' | 'remote' | 'equal'; record: any } {
    const localTs = localRecord?.updated_at ? new Date(localRecord.updated_at).getTime() : 0;
    const remoteTs = remoteRecord?.updated_at ? new Date(remoteRecord.updated_at).getTime() : 0;

    let winner: 'local' | 'remote' | 'equal';
    let winRecord: any;

    if (localTs > remoteTs) {
        winner = 'local';
        winRecord = localRecord;
    } else if (remoteTs > localTs) {
        winner = 'remote';
        winRecord = remoteRecord;
    } else {
        winner = 'equal';
        winRecord = remoteRecord; // prefer remote when equal
    }

    if (winner !== 'equal') {
        logConflict({
            id: String(localRecord?.id || remoteRecord?.id),
            table,
            localRecord,
            remoteRecord,
            resolvedAt: new Date().toISOString(),
            winner,
        });
        console.log(`[Conflict] ${table}:${winRecord.id} — ${winner} wins (local: ${localRecord.updated_at}, remote: ${remoteRecord.updated_at})`);
    }

    return { winner, record: winRecord };
}
