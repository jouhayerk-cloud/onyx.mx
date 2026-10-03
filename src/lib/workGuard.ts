/**
 * Does any screen hold work that a page reload would throw away?
 *
 * Screens report it (a run in flight, generated content not yet saved, a
 * filled-in entry, a loaded batch) so app-wide code that might reload the page
 * on its own, such as the stale-chunk handler in main.tsx, can ask first.
 */
const holders = new Set<symbol>();

/** Mark one screen's work as held (true) or released (false). */
export function setWorkHeld(key: symbol, held: boolean): void {
    if (held) holders.add(key);
    else holders.delete(key);
}

export function hasUnsavedWork(): boolean {
    return holders.size > 0;
}
