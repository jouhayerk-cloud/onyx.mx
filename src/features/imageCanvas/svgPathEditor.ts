import { simplifyContourPoints } from '../../lib/workers/imagePixels';

export interface SubpathNode {
    x: number;
    y: number;
}

export interface EditableSubpath {
    id: string;
    closed: boolean;
    nodes: SubpathNode[];
}

export interface ParsedSvgOutline {
    subpaths: EditableSubpath[];
    fillRule: 'nonzero' | 'evenodd';
    width: number;
    height: number;
}

const RDP_TOLERANCE = 2;

const round1 = (n: number): number => Math.round(n * 10) / 10;

function extractAttr(tag: string, attr: string): string | null {
    const re = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
    const m = re.exec(tag);
    return m ? (m[1] ?? m[2] ?? null) : null;
}

function parseSvgDimensions(svgText: string, fallbackW: number, fallbackH: number): { width: number; height: number } {
    const fallbackWidth = fallbackW > 0 && Number.isFinite(fallbackW) ? fallbackW : 1000;
    const fallbackHeight = fallbackH > 0 && Number.isFinite(fallbackH) ? fallbackH : 1000;
    const svgMatch = /<svg\b[^>]*>/i.exec(svgText);
    if (!svgMatch) return { width: fallbackWidth, height: fallbackHeight };

    const svgTag = svgMatch[0];
    const viewBox = extractAttr(svgTag, 'viewBox');
    if (viewBox) {
        const parts = viewBox.trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
            return { width: parts[2], height: parts[3] };
        }
    }

    const wAttr = Number(extractAttr(svgTag, 'width'));
    const hAttr = Number(extractAttr(svgTag, 'height'));
    return {
        width: wAttr > 0 && Number.isFinite(wAttr) ? wAttr : fallbackWidth,
        height: hAttr > 0 && Number.isFinite(hAttr) ? hAttr : fallbackHeight,
    };
}

function extractPathDFromSvg(svgText: string): string {
    const pathTags = svgText.match(/<path\b[^>]*>/gi) || [];
    for (const targetId of ['frame', 'outline']) {
        for (const tag of pathTags) {
            const id = extractAttr(tag, 'id');
            if (id && id.toLowerCase() === targetId) {
                const d = extractAttr(tag, 'd');
                if (d && d.trim()) return d.trim();
            }
        }
    }
    for (const tag of pathTags) {
        const d = extractAttr(tag, 'd');
        if (d && d.trim()) return d.trim();
    }
    return '';
}

function sampleQuadBezier(
    p0: SubpathNode,
    p1: SubpathNode,
    p2: SubpathNode,
    out: (x: number, y: number) => void,
): void {
    const netLen = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(2, Math.min(20, Math.ceil(netLen / 8)));
    for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const mt = 1 - t;
        const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
        const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
        out(x, y);
    }
}

function sampleCubicBezier(
    p0: SubpathNode,
    p1: SubpathNode,
    p2: SubpathNode,
    p3: SubpathNode,
    out: (x: number, y: number) => void,
): void {
    const netLen =
        Math.hypot(p1.x - p0.x, p1.y - p0.y) +
        Math.hypot(p2.x - p1.x, p2.y - p1.y) +
        Math.hypot(p3.x - p2.x, p3.y - p2.y);
    const steps = Math.max(2, Math.min(24, Math.ceil(netLen / 8)));
    for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const mt = 1 - t;
        const x =
            mt * mt * mt * p0.x +
            3 * mt * mt * t * p1.x +
            3 * mt * t * t * p2.x +
            t * t * t * p3.x;
        const y =
            mt * mt * mt * p0.y +
            3 * mt * mt * t * p1.y +
            3 * mt * t * t * p2.y +
            t * t * t * p3.y;
        out(x, y);
    }
}

function simplifySubpathNodes(nodes: SubpathNode[], closed: boolean): SubpathNode[] {
    if (nodes.length === 0) return [];
    const cleaned: SubpathNode[] = [];
    for (const pt of nodes) {
        const prev = cleaned[cleaned.length - 1];
        if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.05) {
            cleaned.push({ x: round1(pt.x), y: round1(pt.y) });
        }
    }
    if (closed) {
        while (
            cleaned.length > 1 &&
            Math.hypot(cleaned[cleaned.length - 1].x - cleaned[0].x, cleaned[cleaned.length - 1].y - cleaned[0].y) <= 0.5
        ) {
            cleaned.pop();
        }
        if (cleaned.length <= 3) return cleaned;
        const loop = [...cleaned, cleaned[0]];
        const simplified = simplifyContourPoints(loop, RDP_TOLERANCE);
        const withoutDup = simplified.slice(0, -1).map(p => ({ x: round1(p.x), y: round1(p.y) }));
        if (withoutDup.length >= 3) return withoutDup;
        const mid = Math.floor(cleaned.length / 2);
        const twoThirds = Math.floor((cleaned.length * 2) / 3);
        return [cleaned[0], cleaned[mid], cleaned[twoThirds]];
    }
    if (cleaned.length <= 2) return cleaned;
    return simplifyContourPoints(cleaned, RDP_TOLERANCE).map(p => ({ x: round1(p.x), y: round1(p.y) }));
}

/**
 * Parse a full SVG document or a bare `d` string into editable subpaths.
 * Splits into subpaths at each M/m, flattens C/Q/S/T/L/H/V/Z (absolute and relative)
 * to polyline nodes, and simplifies each subpath with Ramer-Douglas-Peucker at 2 px.
 */
export function extractOutlineFromSvg(
    svgTextOrD: string,
    fallbackW = 1000,
    fallbackH = 1000,
    isMirror = false,
): ParsedSvgOutline {
    const raw = (svgTextOrD || '').trim();
    const isSvgDoc = /<(?:svg|path)\b/i.test(raw);
    const { width, height } = isSvgDoc
        ? parseSvgDimensions(raw, fallbackW, fallbackH)
        : {
            width: fallbackW > 0 && Number.isFinite(fallbackW) ? fallbackW : 1000,
            height: fallbackH > 0 && Number.isFinite(fallbackH) ? fallbackH : 1000,
        };
    const d = isSvgDoc ? extractPathDFromSvg(raw) : raw;

    const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
    const rawSubpaths: { nodes: SubpathNode[]; closed: boolean }[] = [];
    let current: { nodes: SubpathNode[]; closed: boolean } | null = null;

    let curX = 0;
    let curY = 0;
    let startX = 0;
    let startY = 0;
    let lastCmd = '';
    let lastCtrlX = 0;
    let lastCtrlY = 0;

    const pushPt = (x: number, y: number) => {
        if (!current) {
            current = { nodes: [], closed: false };
            rawSubpaths.push(current);
        }
        const prev = current.nodes[current.nodes.length - 1];
        if (!prev || Math.hypot(prev.x - x, prev.y - y) > 1e-4) {
            current.nodes.push({ x, y });
        }
    };

    let i = 0;
    let cmd = '';
    const isCmdToken = (tok: string) => /^[MmLlHhVvCcSsQqTtAaZz]$/.test(tok);
    const nextNum = (): number => {
        if (i >= tokens.length) return 0;
        const v = Number(tokens[i++]);
        return Number.isFinite(v) ? v : 0;
    };

    while (i < tokens.length) {
        if (isCmdToken(tokens[i])) {
            cmd = tokens[i++];
        } else if (!cmd) {
            i++;
            continue;
        }

        if (cmd === 'Z' || cmd === 'z') {
            if (current) current.closed = true;
            curX = startX;
            curY = startY;
            lastCmd = cmd;
            cmd = '';
            continue;
        }

        if (i >= tokens.length || isCmdToken(tokens[i])) {
            continue;
        }

        switch (cmd) {
            case 'M':
            case 'm': {
                const nx = nextNum();
                const ny = nextNum();
                curX = cmd === 'm' ? curX + nx : nx;
                curY = cmd === 'm' ? curY + ny : ny;
                startX = curX;
                startY = curY;
                current = { nodes: [{ x: curX, y: curY }], closed: false };
                rawSubpaths.push(current);
                lastCtrlX = curX;
                lastCtrlY = curY;
                lastCmd = cmd;
                // Subsequent coordinate pairs after M/m are implicit L/l
                cmd = cmd === 'm' ? 'l' : 'L';
                break;
            }
            case 'L':
            case 'l': {
                const nx = nextNum();
                const ny = nextNum();
                curX = cmd === 'l' ? curX + nx : nx;
                curY = cmd === 'l' ? curY + ny : ny;
                pushPt(curX, curY);
                lastCtrlX = curX;
                lastCtrlY = curY;
                lastCmd = cmd;
                break;
            }
            case 'H':
            case 'h': {
                const nx = nextNum();
                curX = cmd === 'h' ? curX + nx : nx;
                pushPt(curX, curY);
                lastCtrlX = curX;
                lastCtrlY = curY;
                lastCmd = cmd;
                break;
            }
            case 'V':
            case 'v': {
                const ny = nextNum();
                curY = cmd === 'v' ? curY + ny : ny;
                pushPt(curX, curY);
                lastCtrlX = curX;
                lastCtrlY = curY;
                lastCmd = cmd;
                break;
            }
            case 'C':
            case 'c': {
                const rel = cmd === 'c';
                const x1 = (rel ? curX : 0) + nextNum();
                const y1 = (rel ? curY : 0) + nextNum();
                const x2 = (rel ? curX : 0) + nextNum();
                const y2 = (rel ? curY : 0) + nextNum();
                const x = (rel ? curX : 0) + nextNum();
                const y = (rel ? curY : 0) + nextNum();
                sampleCubicBezier({ x: curX, y: curY }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }, pushPt);
                lastCtrlX = x2;
                lastCtrlY = y2;
                curX = x;
                curY = y;
                lastCmd = cmd;
                break;
            }
            case 'S':
            case 's': {
                const rel = cmd === 's';
                const hasPrevCubic = lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's';
                const x1 = hasPrevCubic ? 2 * curX - lastCtrlX : curX;
                const y1 = hasPrevCubic ? 2 * curY - lastCtrlY : curY;
                const x2 = (rel ? curX : 0) + nextNum();
                const y2 = (rel ? curY : 0) + nextNum();
                const x = (rel ? curX : 0) + nextNum();
                const y = (rel ? curY : 0) + nextNum();
                sampleCubicBezier({ x: curX, y: curY }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x, y }, pushPt);
                lastCtrlX = x2;
                lastCtrlY = y2;
                curX = x;
                curY = y;
                lastCmd = cmd;
                break;
            }
            case 'Q':
            case 'q': {
                const rel = cmd === 'q';
                const x1 = (rel ? curX : 0) + nextNum();
                const y1 = (rel ? curY : 0) + nextNum();
                const x = (rel ? curX : 0) + nextNum();
                const y = (rel ? curY : 0) + nextNum();
                sampleQuadBezier({ x: curX, y: curY }, { x: x1, y: y1 }, { x, y }, pushPt);
                lastCtrlX = x1;
                lastCtrlY = y1;
                curX = x;
                curY = y;
                lastCmd = cmd;
                break;
            }
            case 'T':
            case 't': {
                const rel = cmd === 't';
                const hasPrevQuad = lastCmd === 'Q' || lastCmd === 'q' || lastCmd === 'T' || lastCmd === 't';
                const x1 = hasPrevQuad ? 2 * curX - lastCtrlX : curX;
                const y1 = hasPrevQuad ? 2 * curY - lastCtrlY : curY;
                const x = (rel ? curX : 0) + nextNum();
                const y = (rel ? curY : 0) + nextNum();
                sampleQuadBezier({ x: curX, y: curY }, { x: x1, y: y1 }, { x, y }, pushPt);
                lastCtrlX = x1;
                lastCtrlY = y1;
                curX = x;
                curY = y;
                lastCmd = cmd;
                break;
            }
            case 'A':
            case 'a': {
                const rel = cmd === 'a';
                nextNum();
                nextNum();
                nextNum();
                nextNum();
                nextNum();
                const x = (rel ? curX : 0) + nextNum();
                const y = (rel ? curY : 0) + nextNum();
                pushPt(x, y);
                lastCtrlX = x;
                lastCtrlY = y;
                curX = x;
                curY = y;
                lastCmd = cmd;
                break;
            }
            default: {
                i++;
                break;
            }
        }
    }

    const subpaths: EditableSubpath[] = [];
    for (let idx = 0; idx < rawSubpaths.length; idx++) {
        const sp = rawSubpaths[idx];
        const isClosed =
            sp.closed ||
            (sp.nodes.length > 2 &&
                Math.hypot(
                    sp.nodes[sp.nodes.length - 1].x - sp.nodes[0].x,
                    sp.nodes[sp.nodes.length - 1].y - sp.nodes[0].y,
                ) <= 1);
        const simplified = simplifySubpathNodes(sp.nodes, isClosed);
        if (simplified.length >= (isClosed ? 3 : 2)) {
            subpaths.push({
                id: `subpath_${subpaths.length}`,
                closed: isClosed,
                nodes: simplified,
            });
        }
    }

    const fillRule: 'nonzero' | 'evenodd' = subpaths.length > 1 || isMirror ? 'evenodd' : 'nonzero';
    return { subpaths, fillRule, width, height };
}

/**
 * Serialize editable subpaths back to an SVG path `d` string:
 * `'M x y L ... Z'` per subpath, numbers rounded to 1 decimal.
 */
export function serializeSubpathsToD(subpaths: readonly EditableSubpath[]): string {
    return subpaths
        .filter(sp => sp.nodes.length > 0)
        .map(sp => {
            const [first, ...rest] = sp.nodes;
            const head = `M ${round1(first.x)} ${round1(first.y)}`;
            const tail = rest.map(p => `L ${round1(p.x)} ${round1(p.y)}`).join(' ');
            const close = sp.closed ? ' Z' : '';
            return `${head}${tail ? ` ${tail}` : ''}${close}`;
        })
        .join(' ');
}

function closestPointOnSegment(
    pt: SubpathNode,
    a: SubpathNode,
    b: SubpathNode,
): { x: number; y: number; dist: number } {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        return { x: a.x, y: a.y, dist: Math.hypot(pt.x - a.x, pt.y - a.y) };
    }
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq));
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    return { x, y, dist: Math.hypot(pt.x - x, pt.y - y) };
}

/** Find the closest segment in a single subpath to `pt`. */
export function findNearestSegmentInSubpath(
    subpath: EditableSubpath,
    pt: SubpathNode,
): { insertIndex: number; point: SubpathNode; dist: number } {
    const n = subpath.nodes.length;
    if (n === 0) return { insertIndex: 0, point: { x: round1(pt.x), y: round1(pt.y) }, dist: 0 };
    if (n === 1) {
        const d = Math.hypot(pt.x - subpath.nodes[0].x, pt.y - subpath.nodes[0].y);
        return { insertIndex: 1, point: { x: round1(pt.x), y: round1(pt.y) }, dist: d };
    }

    const segCount = subpath.closed ? n : n - 1;
    let bestIdx = 0;
    let bestPt = { x: round1(pt.x), y: round1(pt.y) };
    let bestDist = Infinity;

    for (let i = 0; i < segCount; i++) {
        const a = subpath.nodes[i];
        const b = subpath.nodes[(i + 1) % n];
        const hit = closestPointOnSegment(pt, a, b);
        if (hit.dist < bestDist) {
            bestDist = hit.dist;
            bestIdx = i + 1;
            bestPt = { x: round1(hit.x), y: round1(hit.y) };
        }
    }

    return { insertIndex: bestIdx, point: bestPt, dist: bestDist };
}

/** Insert a node on the closest segment of `subpath`. */
export function insertNodeOnNearestSegment(subpath: EditableSubpath, pt: SubpathNode): EditableSubpath {
    const { insertIndex, point } = findNearestSegmentInSubpath(subpath, pt);
    const nextNodes = [
        ...subpath.nodes.slice(0, insertIndex),
        point,
        ...subpath.nodes.slice(insertIndex),
    ];
    return { ...subpath, nodes: nextNodes };
}

/** Delete node at `index` from `subpath`. Refuses below 3 nodes on a closed subpath (or below 2 on open). */
export function deleteNodeFromSubpath(subpath: EditableSubpath, index: number): EditableSubpath {
    const minNodes = subpath.closed ? 3 : 2;
    if (subpath.nodes.length <= minNodes) return subpath;
    if (index < 0 || index >= subpath.nodes.length) return subpath;
    return {
        ...subpath,
        nodes: subpath.nodes.filter((_, i) => i !== index),
    };
}

/** Chaikin corner-cutting smoothing, one iteration, keeping closed subpaths closed. */
export function smoothSubpath(subpath: EditableSubpath): EditableSubpath {
    const n = subpath.nodes.length;
    if (n < 3) return subpath;

    if (subpath.closed) {
        const next: SubpathNode[] = [];
        for (let i = 0; i < n; i++) {
            const p0 = subpath.nodes[i];
            const p1 = subpath.nodes[(i + 1) % n];
            next.push(
                { x: round1(0.75 * p0.x + 0.25 * p1.x), y: round1(0.75 * p0.y + 0.25 * p1.y) },
                { x: round1(0.25 * p0.x + 0.75 * p1.x), y: round1(0.25 * p0.y + 0.75 * p1.y) },
            );
        }
        return { ...subpath, closed: true, nodes: next };
    }

    const next: SubpathNode[] = [subpath.nodes[0]];
    for (let i = 0; i < n - 1; i++) {
        const p0 = subpath.nodes[i];
        const p1 = subpath.nodes[i + 1];
        next.push(
            { x: round1(0.75 * p0.x + 0.25 * p1.x), y: round1(0.75 * p0.y + 0.25 * p1.y) },
            { x: round1(0.25 * p0.x + 0.75 * p1.x), y: round1(0.25 * p0.y + 0.75 * p1.y) },
        );
    }
    next.push(subpath.nodes[n - 1]);
    return { ...subpath, closed: false, nodes: next };
}

/**
 * Reproduce the SVG document format built by `cutoutSvgDocument` in `src/lib/catalogHubPipeline.ts`
 * (same element ids, fill, opacity, optional cutout image, and dual stroke) so every existing reader keeps working.
 */
export function buildCutoutSvgMarkup(
    pathD: string,
    width: number,
    height: number,
    cutoutHref: string | null | undefined,
    fillRule: 'nonzero' | 'evenodd' = 'nonzero',
): string {
    const d = (pathD || '').trim();
    if (!d) return '';
    if (d.startsWith('<svg')) return d;

    const w = Math.max(1, Math.round(width || 1000));
    const h = Math.max(1, Math.round(height || 1000));
    const pathId = fillRule === 'evenodd' ? 'frame' : 'outline';
    const href = (cutoutHref || '').trim();
    const image = href
        ? `<image xlink:href="${href}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`
        : '';
    const sw = Math.max(2, Math.round(Math.max(w, h) / 500));

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<path id="${pathId}" d="${d}" fill="#7a8a8c" fill-opacity="0.22" fill-rule="${fillRule}"/>` +
        image +
        `<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="${sw * 2}" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="${d}" fill="none" stroke="#0b6f7c" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>` +
        `</svg>`
    );
}
