/**
 * Phomemo M110 / M110S / M120 Bluetooth Driver
 * Adapted from Phomymo (https://github.com/transcriptionstream/phomymo)
 */

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
