import type { AgentToolPack } from '../useOnyxAgent';

export interface MergedTools {
    definitions: unknown[];
    handlers: AgentToolPack['handlers'];
    risk: AgentToolPack['risk'];
    confirm: Record<string, boolean>;
    describe: Record<string, AgentToolPack['describe']>;
    clashes: Array<{ name: string; kept: string; dropped: string }>;
}

export function mergeToolPacks(packs: readonly AgentToolPack[]): MergedTools {
    const definitions: unknown[] = [];
    const handlers: AgentToolPack['handlers'] = {};
    const risk: AgentToolPack['risk'] = {};
    const confirm: Record<string, boolean> = {};
    const describe: Record<string, AgentToolPack['describe']> = {};
    const clashes: Array<{ name: string; kept: string; dropped: string }> = [];

    const seenNames = new Map<string, string>();

    for (const pack of packs) {
        for (const def of pack.definitions) {
            const name = (def as any).name;
            if (!name) continue;

            const packSource = pack.source || 'unknown';

            if (seenNames.has(name)) {
                clashes.push({
                    name,
                    kept: seenNames.get(name)!,
                    dropped: packSource
                });
                if (import.meta.env.DEV) {
                    console.warn(`Tool clash detected: ${name} (kept: ${seenNames.get(name)}, dropped: ${packSource})`);
                }
                continue;
            }

            seenNames.set(name, packSource);
            definitions.push(def);

            if (pack.handlers && pack.handlers[name]) {
                handlers[name] = pack.handlers[name];
            }
            if (pack.risk && pack.risk[name]) {
                risk[name] = pack.risk[name];
            }
            if (pack.confirm && pack.confirm[name] !== undefined) {
                confirm[name] = pack.confirm[name];
            }
            if (pack.describe) {
                describe[name] = pack.describe;
            }
        }
    }

    return { definitions, handlers, risk, confirm, describe, clashes };
}
