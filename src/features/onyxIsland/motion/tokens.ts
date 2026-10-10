/** Default spring for island motion: quick, with almost no overshoot. */
export const SPRING = { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 } as const;
/** Slower, softer spring for larger island motion; less stiff than SPRING. */
export const SPRING_SLOW = { type: 'spring', stiffness: 280, damping: 34, mass: 1 } as const;
/** The dock pill: a little overshoot when it grows or shrinks (a tool group opens), like the spring of the Liquid Glass Dock study (stiffness 300, damping 20 there). */
export const SPRING_BOUNCY = { type: 'spring', stiffness: 320, damping: 24, mass: 0.9 } as const;
/** How long the pointer must rest on the FACE before the island deploys (hovering the rest of the pill never deploys it). */
export const FACE_DEPLOY_DELAY_MS = 800;
export const ENTER_REVEAL_DELAY_MS = 220;
export const EXIT_COLLAPSE_DELAY_MS = 100;
export const SWIPE_DISTANCE = -18;
export const SWIPE_VELOCITY = -420;
