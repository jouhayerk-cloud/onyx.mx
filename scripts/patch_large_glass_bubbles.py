# Patch UnifiedInventoryView.tsx and density.css for large glass bubble indicators

# 1. UnifiedInventoryView.tsx
path_uiv = r'c:\Jouhayerk\git\app\src\features\inventory\UnifiedInventoryView.tsx'
with open(path_uiv, 'r', encoding='utf-8') as f:
    uiv = f.read()

target_uiv_bubble = """                                        const sw = swatchFor(c);
                                        const isGrad = sw.includes('gradient');
                                        return (
                                            <span key={c} className={`inv-ai-chip${inStore ? '' : ' inv-ai-chip--off'}`} title={hint}>
                                                <span
                                                    className="inv-ai-sw"
                                                    style={{
                                                        ['--sw-color' as any]: sw,
                                                        background: isGrad ? sw : `color-mix(in srgb, ${sw} 75%, transparent)`,
                                                    }}
                                                    aria-hidden="true"
                                                />{c}
                                            </span>
                                        );"""

rep_uiv_bubble = """                                        const sw = swatchFor(c);
                                        const isGrad = sw.includes('gradient');
                                        return (
                                            <span
                                                key={c}
                                                className={`inv-ai-glass-bubble${inStore ? '' : ' inv-ai-glass-bubble--off'}`}
                                                style={{
                                                    ['--bubble-color' as any]: sw,
                                                    ...(isGrad ? { background: `radial-gradient(ellipse at 35% 25%, rgba(255, 255, 255, 0.42) 0%, transparent 70%), ${sw}` } : {}),
                                                }}
                                                title={hint}
                                            >
                                                <span className="inv-ai-glass-bubble__gloss" aria-hidden="true" />
                                                <span className="inv-ai-glass-bubble__text">{c}</span>
                                            </span>
                                        );"""

assert target_uiv_bubble in uiv, "target_uiv_bubble not found in UnifiedInventoryView.tsx"
uiv = uiv.replace(target_uiv_bubble, rep_uiv_bubble, 1)

with open(path_uiv, 'w', encoding='utf-8') as f:
    f.write(uiv)
print("Updated UnifiedInventoryView.tsx with large glass bubble markup")

# 2. density.css
path_dc = r'c:\Jouhayerk\git\app\src\styles\density.css'
with open(path_dc, 'r', encoding='utf-8') as f:
    dc = f.read()

target_dc_section = """/* Glass translucent colored tinted round bubble with specular highlights */
.inv-ai-sw {"""

rep_dc_section = """/* Large glass bubble indicators with text inside the bubble */
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
}

.inv-ai-glass-bubble:active {
    transform: scale(1.08);
}

/* Dimmed / dashed for non-store colors */
.inv-ai-glass-bubble--off {
    border-style: dashed;
    opacity: 0.75;
}

/* Glass translucent colored tinted round bubble with specular highlights */
.inv-ai-sw {"""

assert target_dc_section in dc, "target_dc_section not found in density.css"
dc = dc.replace(target_dc_section, rep_dc_section, 1)

with open(path_dc, 'w', encoding='utf-8') as f:
    f.write(dc)
print("Updated density.css with large glass bubble styles")
