# Patch UnifiedInventoryView.tsx and density.css for Onyx Island-style small tinted glass bubbles and Teal normalization

# 1. UnifiedInventoryView.tsx
path_uiv = r'c:\Jouhayerk\git\app\src\features\inventory\UnifiedInventoryView.tsx'
with open(path_uiv, 'r', encoding='utf-8') as f:
    uiv = f.read()

target_colors_line = "    const aiColors = String(norm.generatedColor || '').split(',').map(c => c.trim()).filter(Boolean);"
rep_colors_line = """    const rawAiColors = String(norm.generatedColor || '').split(',').map(c => c.trim()).filter(Boolean);
    const isAquaOrTeal = String(norm.color || '').toLowerCase().includes('aqua') ||
                         String(norm.color || '').toLowerCase().includes('teal') ||
                         String(norm.material || '').toLowerCase().includes('aqua') ||
                         String(norm.material || '').toLowerCase().includes('teal');
    const aiColors = rawAiColors.map(c => {
        const lc = c.toLowerCase();
        if (isAquaOrTeal && (lc === 'blue' || lc === 'turquoise/aqua' || lc === 'aqua')) {
            return 'Teal';
        }
        return c;
    });"""

assert target_colors_line in uiv, "target_colors_line not found"
uiv = uiv.replace(target_colors_line, rep_colors_line, 1)

with open(path_uiv, 'w', encoding='utf-8') as f:
    f.write(uiv)
print("Updated UnifiedInventoryView.tsx")

# 2. density.css
path_dc = r'c:\Jouhayerk\git\app\src\styles\density.css'
with open(path_dc, 'r', encoding='utf-8') as f:
    dc = f.read()

target_bubble_css = """/* Large glass bubble indicators with text inside the bubble */
.inv-ai-glass-bubble {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    padding: 5px 15px;
    border-radius: 9999px;
    cursor: pointer;
    overflow: hidden;
    user-select: none;
    
    /* 3D Glass translucency, stone tinted refraction */
    background: radial-gradient(ellipse at 35% 25%, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0.08) 45%, transparent 75%),
                color-mix(in srgb, var(--bubble-color, var(--text-color)) 58%, transparent 42%);
    backdrop-filter: blur(10px) saturate(140%);
    -webkit-backdrop-filter: blur(10px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.52);
    box-shadow:
        inset 1.5px 2px 4px rgba(255, 255, 255, 0.75),
        inset -2px -2.5px 5px rgba(0, 0, 0, 0.35),
        0 3px 10px rgba(0, 0, 0, 0.18),
        0 0 12px color-mix(in srgb, var(--bubble-color, transparent) 30%, transparent);

    transform-origin: center center;
    transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 0.28s ease,
                border-color 0.28s ease,
                filter 0.28s ease;
}

/* Glass specular curvature gloss across the upper bubble dome */
.inv-ai-glass-bubble__gloss {
    position: absolute;
    top: 2px;
    left: 8px;
    right: 8px;
    height: 44%;
    border-radius: 9999px 9999px 70% 70%;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(255, 255, 255, 0.18) 60%, transparent 100%);
    pointer-events: none;
    z-index: 1;
}

/* Razor-sharp crisp text inside the translucent bubble */
.inv-ai-glass-bubble__text {
    position: relative;
    z-index: 2;
    font-size: 11.5px;
    font-weight: 850;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #ffffff;
    -webkit-text-stroke: 0.3px rgba(0, 0, 0, 0.35);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 6px rgba(0, 0, 0, 0.5);
    line-height: 1;
}

/* Interactive mouse hover size-changing scale animation */
.inv-ai-glass-bubble:hover {
    transform: scale(1.18);
    z-index: 20;
    border-color: rgba(255, 255, 255, 0.88);
    box-shadow:
        inset 2px 2.5px 5px rgba(255, 255, 255, 0.95),
        inset -2px -3px 6px rgba(0, 0, 0, 0.45),
        0 8px 22px rgba(0, 0, 0, 0.3),
        0 0 20px var(--bubble-color, rgba(255, 255, 255, 0.65));
    filter: brightness(1.15) saturate(1.25);
}"""

rep_bubble_css = """/* Onyx Island-style translucent tinted liquid glass bubble indicator */
.inv-ai-glass-bubble {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    padding: 0 10px;
    border-radius: 999px;
    cursor: pointer;
    overflow: hidden;
    user-select: none;
    
    /* Liquid glass surface: translucent dark base tinted with stone color */
    background-color: color-mix(in srgb, var(--bubble-color, var(--text-color)) 24%, rgba(18, 20, 27, 0.72));
    background-image:
        radial-gradient(120% 90% at 16% -25%, rgba(255, 255, 255, 0.32), transparent 55%),
        radial-gradient(90% 80% at 86% 135%, color-mix(in srgb, var(--bubble-color, #00aeef) 38%, transparent), transparent 60%);
    -webkit-backdrop-filter: blur(14px) saturate(160%);
    backdrop-filter: blur(14px) saturate(160%);
    border: 1px solid color-mix(in srgb, var(--bubble-color, #ffffff) 32%, rgba(255, 255, 255, 0.22));
    box-shadow:
        inset 0 1px 1px rgba(255, 255, 255, 0.45),
        inset 0 -1px 2px rgba(0, 0, 0, 0.4),
        0 2px 6px rgba(0, 0, 0, 0.22),
        0 0 10px color-mix(in srgb, var(--bubble-color, transparent) 25%, transparent);

    transform-origin: center center;
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
                box-shadow 0.22s ease,
                border-color 0.22s ease,
                filter 0.22s ease;
}

/* Island liquid sheen layer inside the glass */
.inv-ai-glass-bubble__gloss {
    position: absolute;
    top: 1px;
    left: 6px;
    right: 6px;
    height: 40%;
    border-radius: 999px 999px 65% 65%;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.12) 65%, transparent 100%);
    pointer-events: none;
    z-index: 1;
}

/* Crisp typography inside the tinted bubble */
.inv-ai-glass-bubble__text {
    position: relative;
    z-index: 2;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
    line-height: 1;
}

/* Hover state: spring scale up and vibrant tinted glow */
.inv-ai-glass-bubble:hover {
    transform: scale(1.14);
    z-index: 15;
    border-color: color-mix(in srgb, var(--bubble-color, #ffffff) 60%, rgba(255, 255, 255, 0.7));
    box-shadow:
        inset 0 1.5px 2px rgba(255, 255, 255, 0.7),
        inset 0 -1.5px 3px rgba(0, 0, 0, 0.5),
        0 4px 12px rgba(0, 0, 0, 0.35),
        0 0 14px color-mix(in srgb, var(--bubble-color, #00aeef) 60%, transparent);
    filter: brightness(1.15) saturate(1.25);
}"""

assert target_bubble_css in dc, "target_bubble_css not found"
dc = dc.replace(target_bubble_css, rep_bubble_css, 1)

with open(path_dc, 'w', encoding='utf-8') as f:
    f.write(dc)
print("Updated density.css")
