export declare class Gradient {
    el: HTMLCanvasElement | null;
    /** Accepts a CSS selector or the canvas element itself, and optionally the four palette colours (hex). */
    initGradient(target: string | HTMLCanvasElement, colors?: string[]): this;
    triggerBurst(): void;
    connect(): Promise<void>;
    disconnect(): void;
    play(): void;
    pause(): void;
}
