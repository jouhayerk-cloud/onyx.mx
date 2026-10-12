import { atom } from 'jotai';
import type { Message } from './useOnyxAgent';

/**
 * The Onyx Chan conversation outlives the screen that shows it: closing the drawer, switching the island tab or
 * compacting the island unmounts the chat, and the log must still be there when it opens again. The messages live in
 * a jotai atom (survives unmounts) and are mirrored to localStorage (survives closing and reopening the app), tagged with the user so another login never sees them.
 */
const KEY = 'onyx_chan_history_v1';
const MAX_MESSAGES = 80;

interface Stored { uid: string | null; messages: Message[] }

const isMessage = (m: unknown): m is Message => {
    const x = m as Message;
    return !!x && typeof x.id === 'string' && typeof x.text === 'string' && typeof x.t === 'number' && (x.role === 'user' || x.role === 'model' || x.role === 'tool');
};

function load(): Stored {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
        if (!raw) return { uid: null, messages: [] };
        const parsed = JSON.parse(raw) as Stored;
        const messages = Array.isArray(parsed?.messages) ? parsed.messages.filter(isMessage).slice(-MAX_MESSAGES) : [];
        return { uid: typeof parsed?.uid === 'string' ? parsed.uid : null, messages };
    } catch {
        return { uid: null, messages: [] };
    }
}

const initial = load();

export const onyxAgentMessagesAtom = atom<Message[]>(initial.messages);
/** Whose conversation the atom holds; null until a user is known. */
export const onyxAgentHistoryOwnerAtom = atom<string | null>(initial.uid);

export function saveHistory(uid: string | null, messages: readonly Message[]): void {
    try {
        // an empty model message is a reply that was cut off before its first word: not worth keeping
        const keep = messages.filter(m => m.text.trim() !== '').slice(-MAX_MESSAGES);
        localStorage.setItem(KEY, JSON.stringify({ uid, messages: keep } satisfies Stored));
    } catch { /* storage blocked or full: the in-memory log still works */ }
}

export function clearHistory(): void {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
