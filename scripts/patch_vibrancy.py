import re

# 1. Update src/lib/canonicalColors.ts
path_can = r'c:\Jouhayerk\git\app\src\lib\canonicalColors.ts'
with open(path_can, 'r', encoding='utf-8') as f:
    text_can = f.read()

enhance_code = r'''/**
 * Boosts saturation, brightness, and vibrancy of stone colors.
 * Makes whites clean, brilliant, and pure; makes stone pigments pop with rich saturation.
 */
export function enhanceStoneColor(hex: string): string {
    if (!hex) return hex;
    const clean = hex.trim().replace(/^#/, '');
    if (clean.length < 6) return hex;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    let l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    // 1. Whites and near-whites: brighten to clean, crisp white
    if (s < 0.16 && l > 0.65) {
        l = Math.min(0.99, l * 1.12 + 0.04);
        s = Math.max(0, s * 0.6);
    } else {
        // 2. Colored pigments: boost saturation and vibrancy
        s = Math.min(1.0, s * 1.45 + 0.08);
        l = Math.min(0.95, l * 1.12 + 0.03);
    }

    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    let rNew: number, gNew: number, bNew: number;
    if (s === 0) {
        rNew = gNew = bNew = l;
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        rNew = hue2rgb(p, q, h + 1 / 3);
        gNew = hue2rgb(p, q, h);
        bNew = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = (n: number) => {
        const clamped = Math.max(0, Math.min(255, Math.round(n * 255)));
        return clamped.toString(16).padStart(2, '0').toUpperCase();
    };

    return `#${toHex(rNew)}${toHex(gNew)}${toHex(bNew)}`;
}

export function enhanceStonePalette(palette: StonePalette): StonePalette {
    return {
        primary: enhanceStoneColor(palette.primary),
        secondary: enhanceStoneColor(palette.secondary),
        gradientColors: palette.gradientColors.map(enhanceStoneColor),
    };
}
'''

if 'export function enhanceStoneColor' not in text_can:
    # Wrap resolveStonePalette to return enhanced palette
    text_can = enhance_code + '\n' + text_can
    text_can = re.sub(
        r'(return CANONICAL_STONE_PALETTES\.\w+;)',
        r'return enhanceStonePalette(\1);'.replace('return enhanceStonePalette(return ', 'return enhanceStonePalette('),
        text_can
    )
    with open(path_can, 'w', encoding='utf-8') as f:
        f.write(text_can)
    print('Updated canonicalColors.ts')
else:
    print('canonicalColors.ts already has enhanceStoneColor')
