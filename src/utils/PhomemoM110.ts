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
        // We need exactly 384px wide for M110
        const targetWidth = M110_CONSTANTS.WIDTH_PIXELS;
        const scale = targetWidth / canvas.width;
        const targetHeight = Math.round(canvas.height * scale);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas context');

        // Draw and scale
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const pixels = imageData.data;
        const widthBytes = M110_CONSTANTS.WIDTH_BYTES;
        const output = new Uint8Array(widthBytes * targetHeight);

        for (let y = 0; y < targetHeight; y++) {
            for (let byteX = 0; byteX < widthBytes; byteX++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const x = byteX * 8 + bit;
                    const idx = (y * targetWidth + x) * 4;
                    
                    // Simple thresholding (0.299R + 0.587G + 0.114B)
                    const brightness = 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
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

export interface VirtualDecodedLabel {
    id: string;
    dataUrl: string;
    width: number;
    height: number;
    timestamp: number;
    tagId?: string;
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

            const label: VirtualDecodedLabel = {
                id: `vlbl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                dataUrl,
                width: widthBytes * 8,
                height: heightLines,
                timestamp: Date.now()
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
        const targetWidth = M110_CONSTANTS.WIDTH_PIXELS;
        const scale = targetWidth / canvas.width;
        const targetHeight = Math.round(canvas.height * scale);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) throw new Error('Could not create canvas context');

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const pixels = imageData.data;
        const widthBytes = M110_CONSTANTS.WIDTH_BYTES;
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

    clearPrintedLabels() {
        this.printedLabels = [];
        this.rxBuffer = new Uint8Array(0);
    }
}

