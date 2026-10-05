export declare class Gradient {
    el: HTMLCanvasElement | null;
    /** Accepts a CSS selector or the canvas element itself. */
    initGradient(target: string | HTMLCanvasElement): this;
    connect(): Promise<void>;
    disconnect(): void;
    play(): void;
    pause(): void;
}
