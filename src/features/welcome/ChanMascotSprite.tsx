import React, { useEffect, useRef, useState, useCallback } from 'react';

export type Area = 'inv' | 'fin' | 'add' | 'log' | 'shp';

export interface ChanMascotSpriteProps {
    directions?: string;
    reactions?: string;
    size?: number;
    className?: string;
    label?: string;
    focusedArea: Area | null;
    onBoop?: () => void;
}

const DIRECTIONS = [
    'up-left',
    'up',
    'up-right',
    'left',
    'center',
    'right',
    'down-left',
    'down',
    'down-right',
] as const;

type Direction = typeof DIRECTIONS[number];

const REACTIONS = [
    'blink',
    'heart',
    'sparkle',
    'surprised',
    'wink',
    'bashful',
    'sleepy',
    'dizzy',
    'delighted',
] as const;

type Reaction = typeof REACTIONS[number];

// Clockwise from the right, matching atan2 with y pointing down.
const CLOCKWISE: readonly Direction[] = [
    'right',
    'down-right',
    'down',
    'down-left',
    'left',
    'up-left',
    'up',
    'up-right',
];

const SECTOR = (Math.PI * 2) / CLOCKWISE.length;
const HYSTERESIS = 0.12;
const DEAD_ZONE = 70;
const SQUASH_MS = 420;

const SQUASH: Keyframe[] = [
    { transform: 'scale(1, 1)', easing: 'ease-in' },
    { transform: 'scale(1.10, 0.86)', offset: 0.18, easing: 'ease-out' },
    { transform: 'scale(0.95, 1.08)', offset: 0.45, easing: 'ease-in-out' },
    { transform: 'scale(1.03, 0.97)', offset: 0.72, easing: 'ease-in-out' },
    { transform: 'scale(1, 1)' },
];

function cell(index: number) {
    return { backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%` };
}

function wrap(angle: number) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

const layerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundSize: '300% 300%',
    backgroundRepeat: 'no-repeat',
};

// Spatial mapping from area code to mascot gaze direction
const AREA_DIRECTIONS: Record<Area, Direction> = {
    inv: 'up-left',
    fin: 'down-left',
    add: 'down',
    log: 'up-right',
    shp: 'down-right',
};

const HAPPY_REACTIONS: readonly Reaction[] = ['sparkle', 'delighted', 'wink', 'heart', 'bashful'];

export function ChanMascotSprite({
    directions = `${import.meta.env.BASE_URL}chan-directions.webp`,
    reactions = `${import.meta.env.BASE_URL}chan-reactions.webp`,
    size = 176,
    className = '',
    label = 'Chan Mascot',
    focusedArea,
    onBoop,
}: ChanMascotSpriteProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const squashRef = useRef<HTMLSpanElement>(null);
    const [direction, setDirection] = useState<Direction>('center');
    const [reaction, setReaction] = useState<Reaction | null>(null);

    const boopCountRef = useRef(0);
    const lastBoopRef = useRef(0);
    const animLoopTimerRef = useRef<number | null>(null);

    // ── 1. Idle Pointer Tracking ──────────────────────────────────────────────
    useEffect(() => {
        // If an area is focused, pointer tracking is paused while the gaze sequence runs
        if (focusedArea !== null) return;

        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            return;
        }

        let sector = -1;
        let pointer: { x: number; y: number } | null = null;

        const aim = () => {
            const button = buttonRef.current;
            if (!button || !pointer) return;

            const box = button.getBoundingClientRect();
            const dx = pointer.x - (box.left + box.width / 2);
            const dy = pointer.y - (box.top + box.height / 2);

            if (Math.hypot(dx, dy) < DEAD_ZONE) {
                sector = -1;
                setDirection('center');
                return;
            }

            const angle = Math.atan2(dy, dx);
            if (sector !== -1 && Math.abs(wrap(angle - sector * SECTOR)) < SECTOR / 2 + HYSTERESIS) {
                return;
            }
            sector = (Math.round(angle / SECTOR) + CLOCKWISE.length) % CLOCKWISE.length;
            setDirection(CLOCKWISE[sector]);
        };

        const onPointerMove = (e: PointerEvent) => {
            pointer = { x: e.clientX, y: e.clientY };
            aim();
        };

        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('scroll', aim, { passive: true });

        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('scroll', aim);
        };
    }, [focusedArea]);

    // ── 2. Focused Gaze Sequence (Bubble <-> Description Text Loop) ─────────
    useEffect(() => {
        if (focusedArea === null) {
            // Unfocused: reset reaction and let pointer aim take over
            setReaction(null);
            if (animLoopTimerRef.current) {
                window.clearTimeout(animLoopTimerRef.current);
                animLoopTimerRef.current = null;
            }
            return;
        }

        const targetBubbleDir = AREA_DIRECTIONS[focusedArea];
        let step = 0;
        let isMounted = true;

        const runGazeCycle = () => {
            if (!isMounted) return;

            // Cycle:
            // Step 0: Look at the focused bubble
            // Step 1: Action sprite in between (happy state: sparkle, delighted, or wink)
            // Step 2: Look down at the description text bubble under the face
            // Step 3: Gentle happy wink / nod
            if (step === 0) {
                setDirection(targetBubbleDir);
                setReaction(null);
                animLoopTimerRef.current = window.setTimeout(runGazeCycle, 1100);
            } else if (step === 1) {
                const randHappy = HAPPY_REACTIONS[Math.floor(Math.random() * HAPPY_REACTIONS.length)];
                setReaction(randHappy);
                animLoopTimerRef.current = window.setTimeout(runGazeCycle, 750);
            } else if (step === 2) {
                setDirection('down');
                setReaction(null);
                animLoopTimerRef.current = window.setTimeout(runGazeCycle, 1200);
            } else {
                setReaction('delighted');
                animLoopTimerRef.current = window.setTimeout(runGazeCycle, 750);
            }

            step = (step + 1) % 4;
        };

        // Start cycle immediately on focus
        runGazeCycle();

        return () => {
            isMounted = false;
            if (animLoopTimerRef.current) {
                window.clearTimeout(animLoopTimerRef.current);
                animLoopTimerRef.current = null;
            }
        };
    }, [focusedArea]);

    // ── 3. Boop / Tap Interaction ─────────────────────────────────────────────
    const triggerBoop = useCallback(() => {
        if (onBoop) onBoop();

        const now = Date.now();
        boopCountRef.current = now - lastBoopRef.current < 1600 ? boopCountRef.current + 1 : 1;
        lastBoopRef.current = now;

        if (boopCountRef.current >= 4) {
            boopCountRef.current = 0;
            setReaction('dizzy');
            window.setTimeout(() => setReaction(null), 1200);
        } else {
            setReaction('blink');
            window.setTimeout(() => {
                setReaction(HAPPY_REACTIONS[(boopCountRef.current - 1) % HAPPY_REACTIONS.length]);
            }, 120);
            window.setTimeout(() => setReaction(null), 700);
        }

        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            squashRef.current?.animate(SQUASH, { duration: SQUASH_MS, easing: 'linear' });
        }
    }, [onBoop]);

    const dirIndex = Math.max(0, DIRECTIONS.indexOf(direction));
    const reactIndex = reaction ? Math.max(0, REACTIONS.indexOf(reaction)) : 0;

    return (
        <button
            ref={buttonRef}
            type="button"
            onClick={triggerBoop}
            aria-label={`Boop ${label}`}
            className={`chan-mascot-sprite ${className}`}
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                width: '100%',
                height: '100%',
                maxWidth: size,
                maxHeight: size,
                aspectRatio: '1 / 1',
                margin: 'auto',
                padding: 0,
                border: 'none',
                borderRadius: '50%',
                overflow: 'hidden',
                outline: 'none',
                boxShadow: 'none',
                background: 'transparent',
                appearance: 'none',
                cursor: 'pointer',
                userSelect: 'none',
            }}
        >
            <span
                ref={squashRef}
                style={{
                    position: 'relative',
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    transformOrigin: '50% 78%',
                }}
            >
                {/* Direction Layer */}
                <span
                    style={{
                        ...layerStyle,
                        backgroundImage: `url(${directions})`,
                        ...cell(dirIndex),
                        opacity: reaction ? 0 : 1,
                        transition: 'opacity 0.15s ease',
                    }}
                />
                {/* Reaction Expression Layer */}
                <span
                    style={{
                        ...layerStyle,
                        backgroundImage: `url(${reactions})`,
                        ...cell(reactIndex),
                        opacity: reaction ? 1 : 0,
                        transition: 'opacity 0.15s ease',
                    }}
                />
            </span>
        </button>
    );
}
