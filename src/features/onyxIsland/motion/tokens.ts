/** Default spring for island motion: quick, with almost no overshoot. */
export const SPRING = { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 } as const;
export const SPRING_SLOW = { type: 'spring', stiffness: 280, damping: 34, mass: 1 } as const;
export const ENTER_REVEAL_DELAY_MS = 220;
export const EXIT_COLLAPSE_DELAY_MS = 100;
export const SWIPE_DISTANCE = -18;
export const SWIPE_VELOCITY = -420;
