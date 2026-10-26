import { simplifyContourPoints } from '../../lib/workers/imagePixels';

export interface Pt {
    x: number;
    y: number;
}

/** A node with optional Bezier direction handles, in absolute image coordinates. */
export interface SubpathNode extends Pt {
    in?: Pt;
    out?: Pt;
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

/** Round to 0.1 px and drop points within 0.05 px of the previous kept point. */
function cleanNodes(nodes: SubpathNode[]): SubpathNode[] {
    const out: SubpathNode[] = [];
    for (const pt of nodes) {
        const prev = out[out.length - 1];
        if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.05) {
            out.push({ x: round1(pt.x), y: round1(pt.y) });
        }
    }
    return out;
}

function simplifySubpathNodes(nodes: SubpathNode[], closed: boolean, simplify: boolean): SubpathNode[] {
    if (nodes.length === 0) return [];
    const cleaned = cleanNodes(nodes);
    if (closed) {
        // A last node on top of the first adds nothing; never pop below 3 nodes.
        while (
            cleaned.length > 3 &&
            Math.hypot(cleaned[cleaned.length - 1].x - cleaned[0].x, cleaned[cleaned.length - 1].y - cleaned[0].y) <= 0.5
        ) {
            cleaned.pop();
        }
        if (!simplify || cleaned.length <= 3) return cleaned;
        const loop = [...cleaned, cleaned[0]];
        const simplified = simplifyContourPoints(loop, RDP_TOLERANCE);
        const withoutDup = cleanNodes(simplified.slice(0, -1));
        if (withoutDup.length >= 3) return withoutDup;
        // cleaned has 4+ nodes here, so these three indices are always distinct.
        const oneThird = Math.floor(cleaned.length / 3);
        const twoThirds = Math.floor((cleaned.length * 2) / 3);
        return [cleaned[0], cleaned[oneThird], cleaned[twoThirds]];
    }
    if (!simplify || cleaned.length <= 2) return cleaned;
    return simplifyContourPoints(cleaned, RDP_TOLERANCE).map(p => ({ x: round1(p.x), y: round1(p.y) }));
}

const roundPt = (p: Pt): Pt => ({ x: round1(p.x), y: round1(p.y) });

function roundNode(n: SubpathNode): SubpathNode {
    const out: SubpathNode = roundPt(n);
    if (n.in && Math.hypot(n.in.x - n.x, n.in.y - n.y) > 0.05) out.in = roundPt(n.in);
    if (n.out && Math.hypot(n.out.x - n.x, n.out.y - n.y) > 0.05) out.out = roundPt(n.out);
    return out;
}

/** The command end points as nodes; on a closed subpath an end point back on the start merges into the first node. */
function exactNodes(raw: SubpathNode[], closed: boolean): SubpathNode[] {
    const nodes = raw.map(roundNode);
    if (closed && nodes.length > 3) {
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (Math.hypot(last.x - first.x, last.y - first.y) <= 0.5) {
            nodes.pop();
            if (last.in) first.in = last.in;
        }
    }
    const out: SubpathNode[] = [];
    for (const n of nodes) {
        const prev = out[out.length - 1];
        // A zero-length straight step adds nothing; fold its outgoing handle into the node before it.
        if (prev && Math.hypot(prev.x - n.x, prev.y - n.y) <= 0.05 && !n.in && !prev.out) {
            if (n.out) prev.out = n.out;
            continue;
        }
        out.push(n);
    }
    return out;
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
    simplify = true,
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
    // `curved` is set by any C/S/Q/T/A command; a subpath without one is an editable polyline.
    // `exact` keeps each command's end point with its control points as handles; `arc` marks a lossy A command.
    type RawSubpath = { nodes: SubpathNode[]; exact: SubpathNode[]; closed: boolean; curved: boolean; arc: boolean };
    const rawSubpaths: RawSubpath[] = [];
    let current: RawSubpath | null = null;

    let curX = 0;
    let curY = 0;
    let startX = 0;
    let startY = 0;
    let lastCmd = '';
    let lastCtrlX = 0;
    let lastCtrlY = 0;

    const pushPt = (x: number, y: number) => {
        if (!current) {
            current = { nodes: [], exact: [], closed: false, curved: false, arc: false };
            rawSubpaths.push(current);
        }
        const prev = current.nodes[current.nodes.length - 1];
        if (!prev || Math.hypot(prev.x - x, prev.y - y) > 1e-4) {
            current.nodes.push({ x, y });
        }
    };
    const pushExact = (x: number, y: number, c1?: Pt, c2?: Pt) => {
        if (!current) {
            current = { nodes: [], exact: [], closed: false, curved: false, arc: false };
            rawSubpaths.push(current);
        }
        const prev = current.exact[current.exact.length - 1];
        if (prev && c1) prev.out = c1;
        current.exact.push(c2 ? { x, y, in: c2 } : { x, y });
    };
    // A quadratic control point as the two cubic handles that draw the same curve.
    const quadHandles = (x0: number, y0: number, qx: number, qy: number, x: number, y: number): [Pt, Pt] => [
        { x: x0 + (2 / 3) * (qx - x0), y: y0 + (2 / 3) * (qy - y0) },
        { x: x + (2 / 3) * (qx - x), y: y + (2 / 3) * (qy - y) },
    ];

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
        if (current && /[CcSsQqTtAa]/.test(cmd)) current.curved = true;

        switch (cmd) {
            case 'M':
            case 'm': {
                const nx = nextNum();
                const ny = nextNum();
                curX = cmd === 'm' ? curX + nx : nx;
                curY = cmd === 'm' ? curY + ny : ny;
                startX = curX;
                startY = curY;
                current = { nodes: [{ x: curX, y: curY }], exact: [{ x: curX, y: curY }], closed: false, curved: false, arc: false };
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
                pushExact(curX, curY);
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
                pushExact(curX, curY);
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
                pushExact(curX, curY);
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
                pushExact(x, y, { x: x1, y: y1 }, { x: x2, y: y2 });
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
                pushExact(x, y, { x: x1, y: y1 }, { x: x2, y: y2 });
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
                pushExact(x, y, ...quadHandles(curX, curY, x1, y1, x, y));
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
                pushExact(x, y, ...quadHandles(curX, curY, x1, y1, x, y));
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
                pushExact(x, y);
                if (current) current.arc = true;
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
        // Editor-saved outlines (lines and curves, at most 400 commands, no arcs) come back exactly as saved, handles included.
        // A traced curve with simplify on and more points than that still goes through RDP on its sampled points.
        const polyline = !sp.curved && sp.nodes.length <= 400;
        const keepExact = !sp.arc && sp.exact.length <= 400 && (polyline || (sp.curved && simplify));
        const simplified = keepExact
            ? exactNodes(sp.exact, isClosed)
            : simplifySubpathNodes(sp.nodes, isClosed, simplify && !polyline);
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
            const n = sp.nodes;
            const xy = (p: Pt) => `${round1(p.x)} ${round1(p.y)}`;
            const seg = (a: SubpathNode, b: SubpathNode) =>
                a.out || b.in ? `C ${xy(a.out ?? a)} ${xy(b.in ?? b)} ${xy(b)}` : `L ${xy(b)}`;
            const parts = [`M ${xy(n[0])}`];
            for (let i = 1; i < n.length; i++) parts.push(seg(n[i - 1], n[i]));
            // The closing segment is only written when it curves; Z draws the straight one.
            if (sp.closed && n.length > 1 && (n[n.length - 1].out || n[0].in)) parts.push(seg(n[n.length - 1], n[0]));
            if (sp.closed) parts.push('Z');
            return parts.join(' ');
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

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** The closest point on the cubic a -> b (handles a.out, b.in), sampled at 32 steps. */
function closestPointOnCubic(pt: Pt, a: SubpathNode, b: SubpathNode): { x: number; y: number; dist: number; t: number } {
    const c1 = a.out ?? a;
    const c2 = b.in ?? b;
    let best = { x: a.x, y: a.y, dist: Infinity, t: 0 };
    for (let s = 0; s <= 32; s++) {
        const t = s / 32;
        const p = lerp(lerp(lerp(a, c1, t), lerp(c1, c2, t), t), lerp(lerp(c1, c2, t), lerp(c2, b, t), t), t);
        const dist = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (dist < best.dist) best = { x: p.x, y: p.y, dist, t };
    }
    return best;
}

/** Find the closest segment in a single subpath to `pt`; `t` is the position along that segment. */
export function findNearestSegmentInSubpath(
    subpath: EditableSubpath,
    pt: Pt,
): { insertIndex: number; point: SubpathNode; dist: number; t: number } {
    const n = subpath.nodes.length;
    if (n === 0) return { insertIndex: 0, point: { x: round1(pt.x), y: round1(pt.y) }, dist: 0, t: 0 };
    if (n === 1) {
        const d = Math.hypot(pt.x - subpath.nodes[0].x, pt.y - subpath.nodes[0].y);
        return { insertIndex: 1, point: { x: round1(pt.x), y: round1(pt.y) }, dist: d, t: 0 };
    }

    const segCount = subpath.closed ? n : n - 1;
    let bestIdx = 0;
    let bestPt = { x: round1(pt.x), y: round1(pt.y) };
    let bestDist = Infinity;
    let bestT = 0;

    for (let i = 0; i < segCount; i++) {
        const a = subpath.nodes[i];
        const b = subpath.nodes[(i + 1) % n];
        const hit = a.out || b.in ? closestPointOnCubic(pt, a, b) : { ...closestPointOnSegment(pt, a, b), t: 0 };
        if (hit.dist < bestDist) {
            bestDist = hit.dist;
            bestIdx = i + 1;
            bestPt = { x: round1(hit.x), y: round1(hit.y) };
            bestT = hit.t;
        }
    }

    return { insertIndex: bestIdx, point: bestPt, dist: bestDist, t: bestT };
}

/** Insert a node on the closest segment of `subpath`; a curved segment is split so its shape stays the same. */
export function insertNodeOnNearestSegment(subpath: EditableSubpath, pt: Pt): EditableSubpath {
    const { insertIndex, point, t } = findNearestSegmentInSubpath(subpath, pt);
    const nodes = subpath.nodes.map(nd => ({ ...nd }));
    const a = nodes[insertIndex - 1];
    const b = a && nodes.length > 1 ? nodes[insertIndex % nodes.length] : undefined;
    let mid: SubpathNode = point;
    if (a && b && (a.out || b.in)) {
        // de Casteljau split at t.
        const c1 = a.out ?? a;
        const c2 = b.in ?? b;
        const p01 = lerp(a, c1, t), p12 = lerp(c1, c2, t), p23 = lerp(c2, b, t);
        const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t);
        a.out = roundPt(p01);
        b.in = roundPt(p23);
        mid = { ...roundPt(lerp(p012, p123, t)), in: roundPt(p012), out: roundPt(p123) };
    }
    return { ...subpath, nodes: [...nodes.slice(0, insertIndex), mid, ...nodes.slice(insertIndex)] };
}

/** Make a corner node smooth (handles along its neighbours, a third of each side long), or a curved node a corner. */
export function toggleNodeCurve(subpath: EditableSubpath, index: number): EditableSubpath {
    const n = subpath.nodes.length;
    const node = subpath.nodes[index];
    if (!node || n < 2) return subpath;
    let next: SubpathNode = { x: node.x, y: node.y };
    if (!node.in && !node.out) {
        const prev = index > 0 ? subpath.nodes[index - 1] : subpath.closed ? subpath.nodes[n - 1] : null;
        const after = index < n - 1 ? subpath.nodes[index + 1] : subpath.closed ? subpath.nodes[0] : null;
        const from = prev ?? node;
        const to = after ?? node;
        const len = Math.hypot(to.x - from.x, to.y - from.y);
        if (!len) return subpath;
        const ux = (to.x - from.x) / len;
        const uy = (to.y - from.y) / len;
        if (prev) {
            const l = Math.hypot(node.x - prev.x, node.y - prev.y) / 3;
            next.in = roundPt({ x: node.x - ux * l, y: node.y - uy * l });
        }
        if (after) {
            const l = Math.hypot(after.x - node.x, after.y - node.y) / 3;
            next.out = roundPt({ x: node.x + ux * l, y: node.y + uy * l });
        }
    }
    return { ...subpath, nodes: subpath.nodes.map((nd, i) => (i === index ? next : nd)) };
}

/** Move a node, carrying its handles with it. */
export function moveNode(node: SubpathNode, x: number, y: number): SubpathNode {
    const dx = x - node.x;
    const dy = y - node.y;
    const out: SubpathNode = { x, y };
    if (node.in) out.in = roundPt({ x: node.in.x + dx, y: node.in.y + dy });
    if (node.out) out.out = roundPt({ x: node.out.x + dx, y: node.out.y + dy });
    return out;
}

/** Drag one handle; unless `broken`, the opposite handle turns to stay in line and keeps its length. */
export function moveHandle(node: SubpathNode, which: 'in' | 'out', pt: Pt, broken = false): SubpathNode {
    const other = which === 'in' ? 'out' : 'in';
    const next: SubpathNode = { ...node, [which]: roundPt(pt) };
    const opp = node[other];
    const d = Math.hypot(node.x - pt.x, node.y - pt.y);
    if (!broken && opp && d > 0) {
        const len = Math.hypot(opp.x - node.x, opp.y - node.y);
        next[other] = roundPt({ x: node.x + ((node.x - pt.x) / d) * len, y: node.y + ((node.y - pt.y) / d) * len });
    }
    return next;
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

    const next: SubpathNode[] = [{ x: subpath.nodes[0].x, y: subpath.nodes[0].y }];
    for (let i = 0; i < n - 1; i++) {
        const p0 = subpath.nodes[i];
        const p1 = subpath.nodes[i + 1];
        next.push(
            { x: round1(0.75 * p0.x + 0.25 * p1.x), y: round1(0.75 * p0.y + 0.25 * p1.y) },
            { x: round1(0.25 * p0.x + 0.75 * p1.x), y: round1(0.25 * p0.y + 0.75 * p1.y) },
        );
    }
    next.push({ x: subpath.nodes[n - 1].x, y: subpath.nodes[n - 1].y });
    return { ...subpath, closed: false, nodes: next };
}

const xmlAttr = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    const href = xmlAttr((cutoutHref || '').trim());
    const dAttr = xmlAttr(d);
    const image = href
        ? `<image xlink:href="${href}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`
        : '';
    const sw = Math.max(2, Math.round(Math.max(w, h) / 500));

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<path id="${pathId}" d="${dAttr}" fill="#7a8a8c" fill-opacity="0.22" fill-rule="${fillRule}"/>` +
        image +
        `<path d="${dAttr}" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="${sw * 2}" stroke-linejoin="round" stroke-linecap="round"/>` +
        `<path d="${dAttr}" fill="none" stroke="#0b6f7c" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>` +
        `</svg>`
    );
}
