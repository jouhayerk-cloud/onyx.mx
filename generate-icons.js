const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function processIcons() {
    const inputPath = path.join(__dirname, 'public', 'chan-directions.webp');
    const outputPath = path.join(__dirname, 'public');

    const sizes = [
        { name: 'apple-touch-icon.png', size: 180 },
        { name: 'apple-touch-icon-dark.png', size: 180 },
        { name: 'icon-192.png', size: 192 },
        { name: 'icon-512.png', size: 512 },
        { name: 'icon-maskable-512.png', size: 512 }
    ];

    for (const {name, size} of sizes) {
        await sharp(inputPath)
            .resize(size, size, { fit: 'contain', background: { r: 10, g: 10, b: 10, alpha: 1 } })
            .toFile(path.join(outputPath, name));
        console.log('Generated', name);
    }
}

processIcons().catch(console.error);
