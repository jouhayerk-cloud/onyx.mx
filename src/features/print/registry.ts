import { useEffect, useRef } from 'react';
import { atom } from 'jotai';
import { useSetAtom } from 'jotai/react';
import type { DocumentType, DocumentKind, DocumentRole } from './types';

// The global record atom tracking all registered document types
export const documentTypesAtom = atom<Record<string, DocumentType<any, any>>>({});

// A module-level registry for synchronous access by runDocumentJob
const registry = new Map<string, DocumentType<any, any>>();

export function registerDocumentType(type: DocumentType<any, any>): void {
    registry.set(type.id, type);
}

export function unregisterDocumentType(id: string): void {
    registry.delete(id);
}

export function getDocumentType(id: string): DocumentType<any, any> | undefined {
    return registry.get(id);
}

export function listDocumentTypes(filter?: { kind?: DocumentKind; role?: DocumentRole; module?: string }): DocumentType<any, any>[] {
    let types = Array.from(registry.values());
    if (filter) {
        if (filter.kind) {
            types = types.filter(t => t.kind === filter.kind);
        }
        if (filter.role) {
            types = types.filter(t => t.allowedRoles.includes(filter.role as string));
        }
        if (filter.module) {
            types = types.filter(t => t.module === filter.module);
        }
    }
    return types;
}

const signature = (types: DocumentType<any, any>[]): string => {
    return types.map(t => [t.id, t.kind, t.group, t.module, t.templateVersion].join('|')).join(';');
};

/**
 * Register a module's document types while the calling component is mounted.
 * Follows the pattern of useRegisterTools in src/lib/toolRegistry.ts.
 */
export function useRegisterDocumentTypes(owner: string, types: DocumentType<any, any>[], enabled = true): void {
    const setRegistry = useSetAtom(documentTypesAtom);
    const latest = useRef<DocumentType<any, any>[]>(types);
    latest.current = types;
    const sig = enabled ? signature(types) : '';

    const remove = () => {
        setRegistry(prev => {
            let changed = false;
            const next = { ...prev };
            for (const t of latest.current) {
                if (next[t.id]) {
                    delete next[t.id];
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
        for (const t of latest.current) {
            unregisterDocumentType(t.id);
        }
    };

    useEffect(() => {
        if (!enabled) {
            remove();
            return;
        }
        // Wrap closures to point to the latest ref so we don't recreate the signature on every data change
        const wrapped: DocumentType<any, any>[] = latest.current.map(t => ({
            ...t,
            requiredData: (params: any) => latest.current.find(x => x.id === t.id)!.requiredData(params),
            buildSnapshot: (source: any, params: any) => latest.current.find(x => x.id === t.id)!.buildSnapshot(source, params),
            render: (snapshot: any, params: any) => latest.current.find(x => x.id === t.id)!.render(snapshot, params),
        }));
        
        setRegistry(prev => {
            const next = { ...prev };
            for (const t of wrapped) {
                next[t.id] = t;
                registerDocumentType(t);
            }
            return next;
        });
        
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [owner, sig, enabled, setRegistry]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => remove, [owner]);
}
