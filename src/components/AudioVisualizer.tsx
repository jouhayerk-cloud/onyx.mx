

import React, { useEffect, useRef, useState } from 'react';

declare global {
    interface Window {
        webkitSpeechRecognition: any;
        SpeechRecognition: any;
    }
}

const noise = (() => {
    const noise: any = {};
    function Grad(this: any, x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; }
    Grad.prototype.dot2 = function (x: number, y: number) { return this.x * x + this.y * y; };
    Grad.prototype.dot3 = function (x: number, y: number, z: number) { return this.x * x + this.y * y + this.z * z; };
    const grad3 = [
        new (Grad as any)(1, 1, 0), new (Grad as any)(-1, 1, 0), new (Grad as any)(1, -1, 0), new (Grad as any)(-1, -1, 0),
        new (Grad as any)(1, 0, 1), new (Grad as any)(-1, 0, 1), new (Grad as any)(1, 0, -1), new (Grad as any)(-1, 0, -1),
        new (Grad as any)(0, 1, 1), new (Grad as any)(0, -1, 1), new (Grad as any)(0, 1, -1), new (Grad as any)(0, -1, -1)
    ];
    const p = [151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180];
    const perm = new Array(512);
    const gradP = new Array(512);
    noise.seed = function (seed: number) {
        if (seed > 0 && seed < 1) seed *= 65536;
        seed = Math.floor(seed);
        if (seed < 256) seed |= seed << 8;
        for (let i = 0; i < 256; i++) {
            let v = (i & 1) ? p[i] ^ (seed & 255) : p[i] ^ ((seed >> 8) & 255);
            perm[i] = perm[i + 256] = v;
            gradP[i] = gradP[i + 256] = grad3[v % 12];
        }
    };
    noise.seed(0);
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6, F3 = 1 / 3, G3 = 1 / 6;
    noise.simplex2 = function (xin: number, yin: number) {
        let n0, n1, n2; // Noise contributions from the three corners
        const s = (xin + yin) * F2; // Hairy factor for 2D
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const t = (i + j) * G2;
        const x0 = xin - i + t; // The x,y distances from the cell origin
        const y0 = yin - j + t;
        let i1, j1; // Offsets for second (middle) corner of simplex in (i,j) coords
        if (x0 > y0) {
            i1 = 1; j1 = 0;
        } else {
            i1 = 0; j1 = 1;
        }
        const x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2; // Offsets for last corner in (x,y) unskewed coords
        const y2 = y0 - 1 + 2 * G2;
        const ii = i & 255;
        const jj = j & 255;
        const gi0 = gradP[ii + perm[jj]];
        const gi1 = gradP[ii + i1 + perm[jj + j1]];
        const gi2 = gradP[ii + 1 + perm[jj + 1]];
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 < 0) {
            n0 = 0;
        } else {
            t0 *= t0;
            n0 = t0 * t0 * gi0.dot2(x0, y0);
        }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 < 0) {
            n1 = 0;
        } else {
            t1 *= t1;
            n1 = t1 * t1 * gi1.dot2(x1, y1);
        }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 < 0) {
            n2 = 0;
        } else {
            t2 *= t2;
            n2 = t1 * t1 * gi2.dot2(x2, y2);
        }
        return 70 * (n0 + n1 + n2);
    };
    noise.perlin2 = function (x: number, y: number) {
        return 0; // Simplified for brevity
    };
    return noise;
})();

interface AudioVisualizerProps {
    onFinalTranscription: (text: string) => void;
    onInterimTranscription: (text: string) => void;
    autoStart?: boolean;
    lang?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ onFinalTranscription, onInterimTranscription, autoStart, lang }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isListening, setIsListening] = useState(false);

    const contextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const freqsRef = useRef<Uint8Array | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recognitionRef = useRef<any>(null);
    const animationFrameId = useRef<number>(0);

    const optsRef = useRef({
        smoothing: 0.6,
        fft: 12,
        minDecibels: -70,
        scale: 0.2,
        glow: 50,
        color1: [203, 36, 128],
        color2: [41, 200, 192],
        color3: [24, 137, 218],
        fillOpacity: 0.25,
        lineWidth: 2,
        blend: "screen" as GlobalCompositeOperation,
        shift: 5,
        width: 100,
        amp: 5,
        peaks: 15,
        mode: "line",
        lang: lang || "es-ES",
        origin: "microphone",
    });

    const stop = () => {
        if (animationFrameId.current) {
            window.cancelAnimationFrame(animationFrameId.current);
        }
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (contextRef.current && contextRef.current.state !== 'closed') {
            contextRef.current.close();
        }
        setIsListening(false);
    };

    const start = () => {
        if (isListening) return;

        const initRecognition = () => {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.error("Speech Recognition not supported.");
                return null;
            }
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.lang = optsRef.current.lang;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;

            recognition.onresult = (event: any) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                if (finalTranscript) onFinalTranscription(finalTranscript.trim());
                if (interimTranscript) onInterimTranscription(interimTranscript);
            };

            recognition.onerror = (event: any) => console.error("Speech recognition error", event.error);
            recognition.onend = () => setIsListening(false);

            return recognition;
        }

        const visualize = () => {
            if (!analyserRef.current || !freqsRef.current || !isListening) return;

            const analyser = analyserRef.current;
            const freqs = freqsRef.current;
            const opts = optsRef.current;

            analyser.smoothingTimeConstant = opts.smoothing;
            analyser.fftSize = Math.pow(2, opts.fft);
            analyser.minDecibels = opts.minDecibels;
            analyser.maxDecibels = 0;
            analyser.getByteFrequencyData(freqs as any);

            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const WIDTH = canvas.width;
            const HEIGHT = canvas.height;

            ctx.clearRect(0, 0, WIDTH, HEIGHT);

            const path = (channel: number) => {
                const color = (optsRef.current as any)[`color${channel + 1}`].map(Math.floor);
                ctx.fillStyle = `rgba(${color}, ${opts.fillOpacity})`;
                ctx.strokeStyle = ctx.shadowColor = `rgb(${color})`;
                ctx.lineWidth = opts.lineWidth;
                ctx.shadowBlur = opts.glow;
                ctx.globalCompositeOperation = opts.blend;

                let shuffle = Array.from(Array(opts.peaks).keys());
                for (let i = shuffle.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffle[i], shuffle[j]] = [shuffle[j], shuffle[i]];
                }

                const freq = (i: number) => freqs[2 * channel + shuffle[i % shuffle.length] * 6];
                const scale = (i: number) => {
                    const x = Math.abs((opts.peaks - 1) / 2 - i);
                    const s = (opts.peaks + 1) / 2 - x;
                    return (s / ((opts.peaks + 1) / 2)) * opts.amp / 5;
                };

                const m = HEIGHT / 2;
                const numControlPoints = 2 * opts.peaks + 4;
                const widthInPixels = WIDTH * (opts.width / 100);
                const offset = (WIDTH - widthInPixels) / 2;
                const x = Array.from(Array(numControlPoints).keys()).map(i => offset + channel * opts.shift + i * (widthInPixels / (numControlPoints - 1)));
                const y = Array.from(Array(opts.peaks).keys()).map(i => Math.max(0, m - scale(i) * freq(i)));
                const h = 2 * m;

                ctx.beginPath();
                ctx.moveTo(0, m);
                ctx.lineTo(x[0], m);
                ctx.bezierCurveTo(x[1], m, x[2], y[0], x[3], y[0]);
                let lastIdx = 0;
                for (let i = 1; i < opts.peaks; i++) {
                    ctx.bezierCurveTo(x[i * 2 + 2], y[i - 1], x[i * 2 + 2], y[i], x[i * 2 + 3], y[i]);
                    lastIdx = i * 2 + 3;
                }
                ctx.bezierCurveTo(x[lastIdx + 1], y[opts.peaks - 1], x[lastIdx + 1], m, x[lastIdx + 2], m);
                ctx.lineTo(WIDTH, m);
                ctx.lineTo(x[lastIdx + 2], m);
                ctx.bezierCurveTo(x[lastIdx + 1], m, x[lastIdx + 1], h - y[opts.peaks - 1], x[lastIdx], h - y[opts.peaks - 1]);
                for (let i = opts.peaks - 2; i >= 0; i--) {
                    let baseIdx = i * 2 + 2;
                    ctx.bezierCurveTo(x[baseIdx + 2], h - y[i + 1], x[baseIdx + 2], h - y[i], x[baseIdx + 1], h - y[i]);
                }
                ctx.bezierCurveTo(x[1], h - y[0], x[1], m, x[0], m);
                ctx.lineTo(x[0], m);
                ctx.fill();
                ctx.stroke();
            };

            path(0);
            path(1);
            path(2);

            animationFrameId.current = window.requestAnimationFrame(visualize);
        };

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(mediaStream => {
                setIsListening(true);
                streamRef.current = mediaStream;
                contextRef.current = new AudioContext();
                analyserRef.current = contextRef.current.createAnalyser();
                freqsRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);

                const input = contextRef.current.createMediaStreamSource(mediaStream);
                input.connect(analyserRef.current);

                recognitionRef.current = initRecognition();
                if (recognitionRef.current) {
                    recognitionRef.current.start();
                }

                animationFrameId.current = window.requestAnimationFrame(visualize);
            })
            .catch(error => console.error("Error accessing microphone", error));
    };

    useEffect(() => {
        let timeoutId: number;
        const handleResize = () => {
            clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => {
                if (canvasRef.current) {
                    canvasRef.current.width = window.innerWidth;
                    canvasRef.current.height = window.innerHeight;
                }
            }, 100) as unknown as number;
        };
        
        handleResize(); // Initial sizing
        window.addEventListener('resize', handleResize);

        if (autoStart) {
            start();
        }
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeoutId);
            stop();
        };
    }, [autoStart]);

    return (
        <div className="audiovis-container" style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
            <canvas id="audiovis-canvas" ref={canvasRef}></canvas>
            {!isListening && (
                <button
                    style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto' }}
                    className="button"
                    onClick={start}
                    aria-label="Start Listening"
                >
                    <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm0-240Zm-40 520v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Zm40-360q17 0 28.5-11.5T520-520v-240q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760v240q0 17 11.5 28.5T480-480Z" />
                    </svg>
                </button>
            )}
        </div>
    );
};