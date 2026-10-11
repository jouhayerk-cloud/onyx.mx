const BACKSLASH = String.fromCharCode(92);

/** Escapes the LIKE wildcards in a value so an ilike filter matches it literally.
 *  A backslash is the default LIKE escape character in PostgreSQL, so it is escaped as well. */
export function escapeLikeValue(value: string): string {
    let out = "";
    for (const ch of value) {
        out += (ch === BACKSLASH || ch === "%" || ch === "_") ? BACKSLASH + ch : ch;
    }
    return out;
}
