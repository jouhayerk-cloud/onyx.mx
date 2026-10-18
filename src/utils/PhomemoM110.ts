/**
 * Phomemo M110 / M110S / M120 Bluetooth Driver
 * Adapted from Phomymo (https://github.com/transcriptionstream/phomymo)
 */

export const isWebBluetoothSupported = (): boolean =>
    typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;

export const M110_CONSTANTS = {
    SERVICE_UUID: '0000ff00-0000-1000-8000-00805f9b34fb',
    WRITE_CHAR_UUID: '0000ff02-0000-1000-8000-00805f9b34fb',
    NOTIFY_CHAR_UUID: '0000ff03-0000-1000-8000-00805f9b34fb',
    WIDTH_PIXELS: 384, // 48 bytes
    WIDTH_BYTES: 48,
};

const CMD = {
    INIT: new Uint8Array([0x1b, 0x40]),
    RASTER_HEADER: (widthBytes: number, heightLines: number) => new Uint8Array([
        0x1d, 0x76, 0x30, 0x00,
        widthBytes, 0x00,
        heightLines & 0xff, (heightLines >> 8) & 0xff,
    ]),
};

const M110_CMD = {
    SPEED: (speed: number) => new Uint8Array([0x1b, 0x4e, 0x0d, speed]),
    DENSITY: (density: number) => new Uint8Array([0x1b, 0x4e, 0x04, density]),
    MEDIA_TYPE: (type: number) => new Uint8Array([0x1f, 0x11, type]),
    FOOTER: new Uint8Array([0x1f, 0xf0, 0x05, 0x00, 0x1f, 0xf0, 0x03, 0x00]),
};

export class M110Driver {
    private device: any = null;
    private characteristic: any = null;
    /** Called when the printer drops the Bluetooth link (power off, out of range). */
    public onDisconnect?: () => void;

    async connect() {
        if (!(navigator as any).bluetooth) {
            // Already handled in PackingModule, but good guard
            throw new Error('Web Bluetooth not supported');
        }

        this.device = await (navigator as any).bluetooth.requestDevice({
            filters: [
                { namePrefix: 'M110' },
                { namePrefix: 'M120' },
                { namePrefix: 'Q' }, // M110S
            ],
            optionalServices: [M110_CONSTANTS.SERVICE_UUID]
        });

        this.device.addEventListener('gattserverdisconnected', () => {
            this.characteristic = null;
            this.onDisconnect?.();
        });

        const server = await this.device.gatt?.connect();
        const service = await server?.getPrimaryService(M110_CONSTANTS.SERVICE_UUID);
        this.characteristic = (await service?.getCharacteristic(M110_CONSTANTS.WRITE_CHAR_UUID)) || null;

        if (!this.characteristic) {
            throw new Error('Bluetooth Characteristic not found');
        }

        return this.device.name;
    }

    async printCanvas(canvas: HTMLCanvasElement, density: number = 10) {
        if (!this.characteristic) throw new Error('Not connected');

        // 1. Prepare Raster Data (384px wide for M110)
        const raster = this.canvasToRaster(canvas);
        const { data, widthBytes, heightLines } = raster;

        // 2. Protocol Initialization
        await this.send(M110_CMD.SPEED(5));
        await this.delay(30);
        await this.send(M110_CMD.DENSITY(density));
        await this.delay(30);
        await this.send(M110_CMD.MEDIA_TYPE(10)); // Labels with gaps
        await this.delay(30);

        // 3. Raster Header
        await this.send(CMD.RASTER_HEADER(widthBytes, heightLines));

        // 4. Send Data in Chunks
        const chunkSize = 128; // Standard reliable chunk size for Phomemo
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            await this.send(chunk);
            await this.delay(20);
        }

        // 5. Finalize Print
        await this.delay(300);
        await this.send(M110_CMD.FOOTER);
        await this.delay(500);
    }

    private async send(data: Uint8Array) {
        if (!this.characteristic) return;
        try {
            await this.characteristic.writeValueWithoutResponse(data.buffer);
        } catch (e) {
            // Fallback for some devices
            await this.characteristic.writeValue(data.buffer);
        }
    }

    private delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private canvasToRaster(canvas: HTMLCanvasElement) {
        // M110/M120 print head is exactly 384 dots (48 bytes) wide
        const targetWidth = M110_CONSTANTS.WIDTH_PIXELS;
        const targetHeight = canvas.height;
        const widthBytes = M110_CONSTANTS.WIDTH_BYTES;

        // Never scale: preserve exact integer module widths by center-cropping or centering
        let srcX = 0;
        let dstX = 0;
        const copyWidth = Math.min(canvas.width, targetWidth);

        if (canvas.width > targetWidth) {
            srcX = Math.floor((canvas.width - targetWidth) / 2);
        } else if (canvas.width < targetWidth) {
            dstX = Math.floor((targetWidth - canvas.width) / 2);
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas context');

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, srcX, 0, copyWidth, targetHeight, dstX, 0, copyWidth, targetHeight);

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const pixels = imageData.data;
        const output = new Uint8Array(widthBytes * targetHeight);

        for (let y = 0; y < targetHeight; y++) {
            for (let byteX = 0; byteX < widthBytes; byteX++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const x = byteX * 8 + bit;
                    const idx = (y * targetWidth + x) * 4;
                    const brightness = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
                    if (brightness < 128) {
                        byte |= (1 << (7 - bit));
                    }
                }
                output[y * widthBytes + byteX] = byte;
            }
        }

        return { data: output, widthBytes, heightLines: targetHeight };
    }

    isConnected() {
        return !!this.characteristic;
    }
}

export interface BarcodeScanlineCheckResult {
    passed: boolean;
    moduleWidth: number;
    scanline: number;
    barCount: number;
    bars: number[];
    nonMultipleBars: Array<{ index: number; x: number; width: number; remainder: number }>;
    decodedText?: string;
    expectedText?: string;
    checksumValid?: boolean;
    error?: string;
}

// ISO/IEC 15417 Code 128 patterns (0-106). 0-105: 6 elements, sum=11; 106 (Stop): 7 elements, sum=13.
const CODE128_PATTERNS: string[] = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

const CODE128_MODULES = CODE128_PATTERNS.map(p => p.split('').map(Number));

function matchCode128Char(runs: number[], startIdx: number): { charIndex: number; error: number } {
    if (startIdx + 6 > runs.length) return { charIndex: -1, error: Infinity };
    const r1 = runs[startIdx], r2 = runs[startIdx + 1], r3 = runs[startIdx + 2], r4 = runs[startIdx + 3], r5 = runs[startIdx + 4], r6 = runs[startIdx + 5];
    const totalDots = r1 + r2 + r3 + r4 + r5 + r6;
    if (totalDots <= 0) return { charIndex: -1, error: Infinity };
    const Z = totalDots / 11;
    if (Z < 1.0) return { charIndex: -1, error: Infinity };

    // T-dimensions normalized to module units (inherently invariant to bar gain)
    const T1 = (r1 + r2) / Z;
    const T2 = (r2 + r3) / Z;
    const T3 = (r3 + r4) / Z;
    const T4 = (r4 + r5) / Z;

    let bestIdx = -1;
    let bestErr = Infinity;

    for (let c = 0; c < 106; c++) {
        const m = CODE128_MODULES[c];
        const t1 = m[0] + m[1];
        const t2 = m[1] + m[2];
        const t3 = m[2] + m[3];
        const t4 = m[3] + m[4];
        const err = Math.abs(T1 - t1) + Math.abs(T2 - t2) + Math.abs(T3 - t3) + Math.abs(T4 - t4) + Math.abs(r1 / Z - m[0]) * 0.4;
        if (err < bestErr) {
            bestErr = err;
            bestIdx = c;
        }
    }

    return { charIndex: bestIdx, error: bestErr };
}

function matchStopPattern(runs: number[], startIdx: number): { matched: boolean; error: number } {
    if (startIdx + 7 > runs.length) return { matched: false, error: Infinity };
    const r = runs.slice(startIdx, startIdx + 7);
    const totalDots = r.reduce((a, b) => a + b, 0);
    if (totalDots <= 0) return { matched: false, error: Infinity };
    const Z = totalDots / 13;
    if (Z < 1.0) return { matched: false, error: Infinity };

    const stopModules = [2, 3, 3, 1, 1, 1, 2];
    const T1 = (r[0] + r[1]) / Z;
    const T2 = (r[1] + r[2]) / Z;
    const T3 = (r[2] + r[3]) / Z;
    const T4 = (r[3] + r[4]) / Z;
    const T5 = (r[4] + r[5]) / Z;
    const T6 = (r[5] + r[6]) / Z;

    const t1 = stopModules[0] + stopModules[1];
    const t2 = stopModules[1] + stopModules[2];
    const t3 = stopModules[2] + stopModules[3];
    const t4 = stopModules[3] + stopModules[4];
    const t5 = stopModules[4] + stopModules[5];
    const t6 = stopModules[5] + stopModules[6];

    const err = Math.abs(T1 - t1) + Math.abs(T2 - t2) + Math.abs(T3 - t3) + Math.abs(T4 - t4) + Math.abs(T5 - t5) + Math.abs(T6 - t6) + Math.abs(r[0] / Z - stopModules[0]) * 0.4;
    return { matched: err < 1.8, error: err };
}

function decodeSymbolsToText(symbols: number[]): { text: string; checksumValid: boolean } {
    if (symbols.length < 3) return { text: '', checksumValid: false };
    const startVal = symbols[0];
    const stopVal = symbols[symbols.length - 1];
    if (stopVal !== 106) return { text: '', checksumValid: false };
    const checkVal = symbols[symbols.length - 2];
    const dataSymbols = symbols.slice(1, symbols.length - 2);

    let sum = startVal;
    for (let i = 0; i < dataSymbols.length; i++) {
        sum += (i + 1) * dataSymbols[i];
    }
    const checksumValid = (sum % 103 === checkVal);

    let currentSet: 'A' | 'B' | 'C' = startVal === 103 ? 'A' : startVal === 105 ? 'C' : 'B';
    let text = '';
    let shift = false;

    for (let i = 0; i < dataSymbols.length; i++) {
        const val = dataSymbols[i];
        const activeSet = shift ? (currentSet === 'A' ? 'B' : 'A') : currentSet;
        shift = false;

        if (activeSet === 'C') {
            if (val === 100) {
                currentSet = 'B';
            } else if (val === 101) {
                currentSet = 'A';
            } else if (val <= 99) {
                text += String(val).padStart(2, '0');
            }
        } else if (activeSet === 'B') {
            if (val === 98) {
                shift = true;
            } else if (val === 99) {
                currentSet = 'C';
            } else if (val === 101) {
                currentSet = 'A';
            } else if (val <= 95) {
                text += String.fromCharCode(val + 32);
            }
        } else { // activeSet === 'A'
            if (val === 98) {
                shift = true;
            } else if (val === 99) {
                currentSet = 'C';
            } else if (val === 100) {
                currentSet = 'B';
            } else if (val <= 63) {
                text += String.fromCharCode(val + 32);
            } else if (val <= 95) {
                text += String.fromCharCode(val - 64);
            }
        }
    }

    return { text, checksumValid };
}

/**
 * Decode printed scan line run lengths to Code 128 text and verify checksum.
 */
export function decodeBarcodeScanline(
    rasterBytes: Uint8Array,
    widthBytes: number,
    heightLines: number,
    expectedData?: string
): BarcodeScanlineCheckResult {
    const widthPx = widthBytes * 8;
    let bestLine = -1;
    let bestBars: Array<{ x: number; width: number }> = [];
    let fallbackCandidate: BarcodeScanlineCheckResult | null = null;

    // Scan lines to locate and decode Code 128 barcode
    for (let y = 0; y < heightLines; y++) {
        const lineOffset = y * widthBytes;
        const runs: Array<{ isBlack: boolean; width: number; x: number }> = [];
        let inBlack = false;
        let startX = 0;

        for (let x = 0; x < widthPx; x++) {
            const byte = rasterBytes[lineOffset + (x >> 3)];
            const isBlack = (byte & (1 << (7 - (x & 7)))) !== 0;
            if (x === 0) {
                inBlack = isBlack;
                startX = 0;
            } else if (isBlack !== inBlack) {
                runs.push({ isBlack: inBlack, width: x - startX, x: startX });
                inBlack = isBlack;
                startX = x;
            }
        }
        runs.push({ isBlack: inBlack, width: widthPx - startX, x: startX });

        const blackBars = runs.filter(r => r.isBlack);
        if (blackBars.length > bestBars.length) {
            bestBars = blackBars;
            bestLine = y;
        }

        // Code 128 has at least 13 bars (Start 3, at least 1 data char 3, Check 3, Stop 4)
        if (blackBars.length < 13) continue;

        // Try decoding starting at any black bar that follows a white space (quiet zone)
        for (let rIdx = 0; rIdx < runs.length - 12; rIdx++) {
            if (!runs[rIdx].isBlack) continue;
            // Quiet zone preceding start must be at least 3 dots
            if (rIdx > 0 && runs[rIdx - 1].width < 3) continue;

            const runWidths = runs.slice(rIdx).map(r => r.width);
            const startMatch = matchCode128Char(runWidths, 0);
            if (startMatch.charIndex < 103 || startMatch.charIndex > 105 || startMatch.error > 1.4) {
                continue;
            }

            let curr = 6;
            const symbols = [startMatch.charIndex];
            let foundStop = false;

            while (curr + 6 <= runWidths.length) {
                const stopMatch = matchStopPattern(runWidths, curr);
                if (stopMatch.matched) {
                    symbols.push(106);
                    curr += 7;
                    foundStop = true;
                    break;
                }
                const charMatch = matchCode128Char(runWidths, curr);
                if (charMatch.charIndex < 0 || charMatch.error > 1.6) {
                    break;
                }
                symbols.push(charMatch.charIndex);
                curr += 6;
            }

            if (foundStop && symbols.length >= 4) {
                const { text, checksumValid } = decodeSymbolsToText(symbols);
                if (checksumValid) {
                    const totalDots = runWidths.slice(0, curr).reduce((a, b) => a + b, 0);
                    const totalModules = (symbols.length - 1) * 11 + 2;
                    const moduleWidth = totalDots / totalModules;
                    const barcodeBars = runs.slice(rIdx, rIdx + curr).filter(r => r.isBlack).map(r => r.width);

                    const matchesExpected = !expectedData || (text === expectedData);
                    const result: BarcodeScanlineCheckResult = {
                        passed: matchesExpected,
                        moduleWidth: Number(moduleWidth.toFixed(2)),
                        scanline: y,
                        barCount: barcodeBars.length,
                        bars: barcodeBars,
                        nonMultipleBars: [],
                        decodedText: text,
                        expectedText: expectedData,
                        checksumValid: true,
                        error: matchesExpected ? undefined : `Decoded "${text}" did not match expected "${expectedData}"`
                    };

                    if (matchesExpected) {
                        return result;
                    } else if (!fallbackCandidate) {
                        fallbackCandidate = result;
                    }
                }
            }
        }
    }

    if (fallbackCandidate) {
        return fallbackCandidate;
    }

    return {
        passed: false,
        moduleWidth: 0,
        scanline: bestLine,
        barCount: bestBars.length,
        bars: bestBars.map(b => b.width),
        nonMultipleBars: [],
        expectedText: expectedData,
        checksumValid: false,
        error: bestLine === -1 ? 'No barcode scanline detected on label' : 'Barcode scanline could not be decoded to valid Code 128'
    };
}

/**
 * Backward compatibility alias for integer module check.
 */
export function checkBarcodeScanlineIntegerModules(
    rasterBytes: Uint8Array,
    widthBytes: number,
    heightLines: number,
    _targetModuleWidth?: number
): BarcodeScanlineCheckResult {
    return decodeBarcodeScanline(rasterBytes, widthBytes, heightLines);
}

export interface VirtualDecodedLabel {
    id: string;
    dataUrl: string;
    width: number;
    height: number;
    timestamp: number;
    tagId?: string;
    barcodeCheck?: BarcodeScanlineCheckResult;
}

/**
 * Decode 1-bit ESC/POS raster byte slice into crisp PNG Data URL
 */
export function decodeRasterToDataUrl(
    rasterBytes: Uint8Array,
    widthBytes: number,
    heightLines: number
): string {
    const widthPx = widthBytes * 8;
    const heightPx = heightLines;
    if (typeof document === 'undefined') return '';

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const imgData = ctx.createImageData(widthPx, heightPx);
    const data = imgData.data;

    for (let y = 0; y < heightPx; y++) {
        for (let bx = 0; bx < widthBytes; bx++) {
            const byte = rasterBytes[y * widthBytes + bx] || 0;
            for (let bit = 0; bit < 8; bit++) {
                const isBlack = (byte & (1 << (7 - bit))) !== 0;
                const pxIdx = (y * widthPx + (bx * 8 + bit)) * 4;
                if (isBlack) {
                    data[pxIdx] = 18;
                    data[pxIdx + 1] = 18;
                    data[pxIdx + 2] = 18;
                    data[pxIdx + 3] = 255;
                } else {
                    data[pxIdx] = 255;
                    data[pxIdx + 1] = 255;
                    data[pxIdx + 2] = 255;
                    data[pxIdx + 3] = 255;
                }
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
}

/**
 * Virtual M110 Thermal Driver
 * Accepts exact ESC/POS raster byte stream sent to a physical M110,
 * decodes back to 1-bit monochrome images, simulates realistic timing and hardware errors.
 */
export class VirtualM110Driver {
    private connected: boolean = false;
    private rxBuffer: Uint8Array = new Uint8Array(0);
    private printedLabels: VirtualDecodedLabel[] = [];

    public speedMultiplier: number = 1.0; // 1.0 = ~2-2.5s per label like real M110
    public simulatePaperOut: boolean = false;
    public simulateDisconnect: boolean = false;
    public lastBarcodeCheck?: BarcodeScanlineCheckResult;

    setSpeedMultiplier(v: number) { this.speedMultiplier = v > 0 ? v : 1; }
    setSimulatePaperOut(v: boolean) { this.simulatePaperOut = v; }
    setSimulateDisconnect(v: boolean) { this.simulateDisconnect = v; }
    public onDisconnect?: () => void;
    public onLabelDecoded?: (label: VirtualDecodedLabel) => void;

    async connect(): Promise<string> {
        if (this.simulateDisconnect) {
            throw new Error('Simulated Bluetooth pairing failed (Device unavailable)');
        }
        this.connected = true;
        this.rxBuffer = new Uint8Array(0);
        return 'Phomemo M110 (Virtual)';
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.rxBuffer = new Uint8Array(0);
        this.onDisconnect?.();
    }

    isConnected(): boolean {
        return this.connected;
    }

    async send(data: Uint8Array): Promise<void> {
        if (!this.connected) throw new Error('Virtual printer not connected');
        if (this.simulateDisconnect) {
            this.connected = false;
            this.onDisconnect?.();
            throw new Error('Simulated printer connection lost');
        }
        if (this.simulatePaperOut) {
            throw new Error('Simulated paper out (Cover open or gap error)');
        }

        // Accumulate incoming bytes
        const next = new Uint8Array(this.rxBuffer.length + data.length);
        next.set(this.rxBuffer, 0);
        next.set(data, this.rxBuffer.length);
        this.rxBuffer = next;

        // Realistic chunk pacing
        await this.delay(18);

        // Process buffer for raster frames
        this.processBuffer();
    }

    public delay(ms: number): Promise<void> {
        const adjustedMs = Math.max(1, Math.round(ms / (this.speedMultiplier || 1.0)));
        return new Promise(resolve => setTimeout(resolve, adjustedMs));
    }

    private processBuffer() {
        // Search for ESC/POS GS v 0 0: 0x1d, 0x76, 0x30, 0x00
        while (this.rxBuffer.length >= 8) {
            let headerIdx = -1;
            for (let i = 0; i <= this.rxBuffer.length - 8; i++) {
                if (
                    this.rxBuffer[i] === 0x1d &&
                    this.rxBuffer[i + 1] === 0x76 &&
                    this.rxBuffer[i + 2] === 0x30 &&
                    this.rxBuffer[i + 3] === 0x00
                ) {
                    headerIdx = i;
                    break;
                }
            }

            if (headerIdx === -1) {
                // Keep last 7 bytes in case header spans across chunks
                if (this.rxBuffer.length > 7) {
                    this.rxBuffer = this.rxBuffer.slice(this.rxBuffer.length - 7);
                }
                break;
            }

            const wL = this.rxBuffer[headerIdx + 4];
            const wH = this.rxBuffer[headerIdx + 5];
            const hL = this.rxBuffer[headerIdx + 6];
            const hH = this.rxBuffer[headerIdx + 7];

            const widthBytes = wL | (wH << 8);
            const heightLines = hL | (hH << 8);
            const rasterBytesTotal = widthBytes * heightLines;
            const rasterDataStart = headerIdx + 8;
            const rasterDataEnd = rasterDataStart + rasterBytesTotal;

            if (this.rxBuffer.length < rasterDataEnd) {
                // Awaiting full raster frame chunks
                break;
            }

            // Extract raster payload
            const rasterSlice = this.rxBuffer.slice(rasterDataStart, rasterDataEnd);
            const dataUrl = decodeRasterToDataUrl(rasterSlice, widthBytes, heightLines);
            const barcodeCheck = decodeBarcodeScanline(rasterSlice, widthBytes, heightLines);
            this.lastBarcodeCheck = barcodeCheck;

            if (barcodeCheck.barCount > 0) {
                if (barcodeCheck.passed) {
                    console.log(`[VirtualM110] Scanline ${barcodeCheck.scanline} verified: decoded Code 128 "${barcodeCheck.decodedText}" (module ~${barcodeCheck.moduleWidth} dots, ${barcodeCheck.barCount} bars)`);
                } else {
                    console.warn(`[VirtualM110] Scanline ${barcodeCheck.scanline} failed barcode check: ${barcodeCheck.error}`);
                }
            }

            const label: VirtualDecodedLabel = {
                id: `vlbl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                dataUrl,
                width: widthBytes * 8,
                height: heightLines,
                timestamp: Date.now(),
                barcodeCheck
            };

            this.printedLabels.push(label);
            this.onLabelDecoded?.(label);

            // Discard processed data and optional trailing footer
            let advanceTo = rasterDataEnd;
            if (this.rxBuffer.length >= advanceTo + 8) {
                // Check for M110_CMD.FOOTER: 1f f0 05 00 1f f0 03 00
                if (
                    this.rxBuffer[advanceTo] === 0x1f &&
                    this.rxBuffer[advanceTo + 1] === 0xf0 &&
                    this.rxBuffer[advanceTo + 2] === 0x05 &&
                    this.rxBuffer[advanceTo + 3] === 0x00 &&
                    this.rxBuffer[advanceTo + 4] === 0x1f &&
                    this.rxBuffer[advanceTo + 5] === 0xf0 &&
                    this.rxBuffer[advanceTo + 6] === 0x03 &&
                    this.rxBuffer[advanceTo + 7] === 0x00
                ) {
                    advanceTo += 8;
                }
            }

            this.rxBuffer = this.rxBuffer.slice(advanceTo);
        }
    }

    async printCanvas(canvas: HTMLCanvasElement, density: number = 10) {
        if (!this.connected) throw new Error('Virtual printer not connected');

        const raster = this.canvasToRaster(canvas);
        const { data, widthBytes, heightLines } = raster;

        await this.send(M110_CMD.SPEED(5));
        await this.delay(30);
        await this.send(M110_CMD.DENSITY(density));
        await this.delay(30);
        await this.send(M110_CMD.MEDIA_TYPE(10));
        await this.delay(30);

        await this.send(CMD.RASTER_HEADER(widthBytes, heightLines));

        const chunkSize = 128;
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            await this.send(chunk);
            await this.delay(20);
        }

        await this.delay(300);
        await this.send(M110_CMD.FOOTER);
        await this.delay(500);
    }

    private canvasToRaster(canvas: HTMLCanvasElement) {
        // M110/M120 print head is exactly 384 dots (48 bytes) wide
        const targetWidth = M110_CONSTANTS.WIDTH_PIXELS;
        const targetHeight = canvas.height;
        const widthBytes = M110_CONSTANTS.WIDTH_BYTES;

        // Never scale: preserve exact integer module widths by center-cropping or centering
        let srcX = 0;
        let dstX = 0;
        const copyWidth = Math.min(canvas.width, targetWidth);

        if (canvas.width > targetWidth) {
            srcX = Math.floor((canvas.width - targetWidth) / 2);
        } else if (canvas.width < targetWidth) {
            dstX = Math.floor((targetWidth - canvas.width) / 2);
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas context');

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, srcX, 0, copyWidth, targetHeight, dstX, 0, copyWidth, targetHeight);

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const pixels = imageData.data;
        const output = new Uint8Array(widthBytes * targetHeight);

        for (let y = 0; y < targetHeight; y++) {
            for (let byteX = 0; byteX < widthBytes; byteX++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const x = byteX * 8 + bit;
                    const idx = (y * targetWidth + x) * 4;
                    const brightness = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
                    if (brightness < 128) {
                        byte |= (1 << (7 - bit));
                    }
                }
                output[y * widthBytes + byteX] = byte;
            }
        }

        return { data: output, widthBytes, heightLines: targetHeight };
    }

    getPrintedLabels(): VirtualDecodedLabel[] {
        return [...this.printedLabels];
    }

    getLastBarcodeCheck(): BarcodeScanlineCheckResult | undefined {
        return this.lastBarcodeCheck;
    }

    clearPrintedLabels() {
        this.printedLabels = [];
        this.rxBuffer = new Uint8Array(0);
    }
}

