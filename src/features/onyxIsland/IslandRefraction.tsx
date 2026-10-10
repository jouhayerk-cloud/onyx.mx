import React, { useEffect } from 'react';
import { atom } from 'jotai';
import { useAtomValue, useSetAtom } from 'jotai/react';

interface RefractionData {
    href: string;
    w: number;
    h: number;
    scale: number;
}

// `null as T | null`: without strict null checks atom<T | null>(null) picks the read-only overload
const refractionAtom = atom(null as RefractionData | null);
const mapCache = new Map<string, RefractionData>();

export function buildRefractionMap(w: number, h: number, radius: number, bezel: number): Uint8ClampedArray {
    const len = w * h;
    const mapX = new Float32Array(len);
    const mapY = new Float32Array(len);
    let max_val = 0;

    const cx = w / 2;
    const cy = h / 2;
    const hx = w / 2;
    const hy = h / 2;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const px = x + 0.5;
            const py = y + 0.5;

            const signX = px > cx ? 1 : (px < cx ? -1 : 0);
            const signY = py > cy ? 1 : (py < cy ? -1 : 0);

            const dx = Math.abs(px - cx) - (hx - radius);
            const dy = Math.abs(py - cy) - (hy - radius);

            let d = 0;
            let nx = 0;
            let ny = 0;

            if (dx > 0 && dy > 0) {
                const out_dist = Math.sqrt(dx * dx + dy * dy);
                d = radius - out_dist;
                if (out_dist > 0) {
                    nx = -(dx / out_dist) * signX;
                    ny = -(dy / out_dist) * signY;
                }
            } else if (dx > 0) {
                d = radius - dx;
                nx = -signX;
                ny = 0;
            } else if (dy > 0) {
                d = radius - dy;
                nx = 0;
                ny = -signY;
            } else {
                if (dx > dy) {
                    d = radius - dx;
                    nx = -signX;
                    ny = 0;
                } else {
                    d = radius - dy;
                    nx = 0;
                    ny = -signY;
                }
            }

            const idx = y * w + x;
            if (d <= 0 || d >= bezel) {
                mapX[idx] = 0;
                mapY[idx] = 0;
            } else {
                const t = d / bezel;
                const invT = 1 - t;
                const invT4 = invT * invT * invT * invT;
                const base = 1 - invT4;
                
                let slope = 0;
                if (base > 1e-8) {
                    slope = (invT * invT * invT) / Math.pow(base, 0.75);
                } else {
                    slope = 100;
                }
                
                const vx = nx * slope;
                const vy = ny * slope;
                mapX[idx] = vx;
                mapY[idx] = vy;
                
                const absVx = Math.abs(vx);
                const absVy = Math.abs(vy);
                if (absVx > max_val) max_val = absVx;
                if (absVy > max_val) max_val = absVy;
            }
        }
    }

    const arr = new Uint8ClampedArray(len * 4);
    const mapScale = max_val > 0 ? (127 / max_val) : 0;

    for (let i = 0; i < len; i++) {
        const vx = mapX[i];
        const vy = mapY[i];
        arr[i * 4] = 128 + Math.round(vx * mapScale);
        arr[i * 4 + 1] = 128 + Math.round(vy * mapScale);
        arr[i * 4 + 2] = 128;
        arr[i * 4 + 3] = 255;
    }

    return arr;
}

export function IslandRefractionDefs() {
    const data = useAtomValue(refractionAtom);
    
    return (
        <svg aria-hidden="true" style={{ width: 0, height: 0, position: 'absolute', pointerEvents: 'none' }}>
            {data && (
                <filter id="isl-refract" filterUnits="userSpaceOnUse" x="0" y="0" width={data.w} height={data.h} colorInterpolationFilters="sRGB">
                    <feImage href={data.href} result="map" x="0" y="0" width={data.w} height={data.h} />
                    <feDisplacementMap in="SourceGraphic" in2="map" scale={data.scale} xChannelSelector="R" yChannelSelector="G" />
                </filter>
            )}
        </svg>
    );
}

export function useIslandRefraction(targetRef: React.RefObject<HTMLElement | null>) {
    const setRefractionData = useSetAtom(refractionAtom);

    useEffect(() => {
        const nav = navigator as any;
        let isChromium = false;
        
        if (nav.userAgentData && nav.userAgentData.brands) {
            isChromium = nav.userAgentData.brands.some((b: any) => b.brand.includes('Chromium'));
        }
        if (!isChromium) {
            isChromium = /Chrome\/|Edg\//.test(navigator.userAgent);
        }
        
        if (!isChromium) return;
        if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;

        let timeoutId: number;
        let w = 0;
        let h = 0;
        const target = targetRef.current;
        if (!target) return;

        const applyRefraction = () => {
            if (document.visibilityState === 'hidden') return;
            if (w <= 0 || h <= 0) return;

            const computedStyle = window.getComputedStyle(target);
            let radius = parseFloat(computedStyle.borderTopLeftRadius) || 0;
            radius = Math.min(radius, w / 2, h / 2);
            
            const key = `${w}x${h}x${radius}`;
            let data = mapCache.get(key);

            if (!data) {
                const bezel = Math.min(16, 0.28 * Math.min(w, h));
                const arr = buildRefractionMap(w, h, radius, bezel);
                
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.putImageData(new ImageData(arr as unknown as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
                    const href = canvas.toDataURL('image/png');
                    const maxPixels = w < 200 ? 14 : 10;
                    const scale = 2 * maxPixels;
                    
                    data = { href, w, h, scale };
                    mapCache.set(key, data);
                }
            }

            if (data) {
                setRefractionData(data);
                target.setAttribute('data-isl-refract', 'on');
            }
        };

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            
            const newW = Math.round(target.offsetWidth);
            const newH = Math.round(target.offsetHeight);

            if (newW === w && newH === h) return;
            
            target.setAttribute('data-isl-refract', 'off');
            w = newW;
            h = newH;

            clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                applyRefraction();
            }, 150);
        });

        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && target.getAttribute('data-isl-refract') === 'off' && w > 0 && h > 0) {
                applyRefraction();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        observer.observe(target);

        return () => {
            observer.disconnect();
            clearTimeout(timeoutId);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [targetRef, setRefractionData]);
}
