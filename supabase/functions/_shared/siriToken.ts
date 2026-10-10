export function encodeBase64Url(bytes: Uint8Array): string {
    const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function generateSiriToken(): { token: string; prefix: string } {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const randomString = encodeBase64Url(randomBytes);
    const token = `siri_${randomString}`;
    return {
        token,
        prefix: token.slice(0, 9),
    };
}

export async function hashSiriToken(token: string): Promise<string> {
    const data = new TextEncoder().encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isSiriToken(value: string): boolean {
    return /^siri_[a-zA-Z0-9_-]{43}$/.test(value);
}

export function bearerFrom(header: string | null): string | null {
    if (!header) return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}
