/**
 * Hero media gallery — sourced from G:\My Drive\Jouhayerk Hero page
 * Served from /onyx.mx/hero/ (public/hero/ + vite base: /onyx.mx/)
 *
 * Images auto-cycle as background. Videos play in a video element when selected.
 */

// Vite base is /onyx.mx/ so public files are at /onyx.mx/hero/
const base = '/onyx.mx/hero';

export const heroImages: string[] = [
    `${base}/bg.jpg`,
    `${base}/flouritetower-aaa-205-topaz-denoise-sharpen.jpg`,
    `${base}/IMG_0205.jpg`,
    `${base}/AN_image.png`,
    `${base}/EM_cd67dc57-41ec-45bf-a6a6-814748ebaff1.JPG`,
    `${base}/Imagen_de_WhatsApp_2025-09-12_a_las_19.41.18_2e35bf30.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-12_a_las_19.50.24_13c77052.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-12_a_las_19.51.02_fa26c52f.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.12.57_3e8259c0.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.12.57_c776c0a0.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.13.22_8ec3d221.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.13.23_8171d900.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.13.23_9e1508c1.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.13.24_1dbe9973.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.13.24_255ab525.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.13.25_8c273242.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.13.25_8c273242_(1).jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.13.27_90c606a5.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-13_a_las_16.13.29_077d4ea6.jpg`,
    `${base}/Imagen_de_WhatsApp_2025-09-24_a_las_13.05.24_b76b7faf.jpg`,
];

export const heroVideos: string[] = [
    `${base}/hero.mp4`,
    `${base}/Onyx_Decor_Brand.mp4`,
    `${base}/Onyx_Lamp_Brand_Video_Generation.mp4`,
    `${base}/Onyx_Decor_Brand_Video_Generation_(1).mp4`,
    `${base}/AN_mp4_1.mp4`,
    `${base}/AN_mp4_2.mp4`,
    `${base}/AN_mp4_3.mp4`,
    `${base}/AN_mp4_4.mp4`,
];

/** Fisher-Yates shuffle of images only (for background cycling) */
export function shuffleHeroMedia(): string[] {
    const arr = [...heroImages];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Interleaved pool: every Nth slide is a video (short clip) */
export function buildMediaPool(): Array<{ type: 'img' | 'video'; url: string }> {
    const imgs = shuffleHeroMedia();
    const vids = [...heroVideos].sort(() => Math.random() - 0.5);
    const pool: Array<{ type: 'img' | 'video'; url: string }> = [];
    let vi = 0;
    imgs.forEach((img, idx) => {
        pool.push({ type: 'img', url: img });
        // Insert a video every 4 images
        if ((idx + 1) % 4 === 0 && vi < vids.length) {
            pool.push({ type: 'video', url: vids[vi++] });
        }
    });
    return pool;
}
