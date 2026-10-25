# Patch density.css: compact tinted glass bubbles, smaller text, remove glow, clean glass effect, hover size change

path_dc = r'c:\Jouhayerk\git\app\src\styles\density.css'
with open(path_dc, 'r', encoding='utf-8') as f:
    dc = f.read()

target_bubble = """/* Onyx Island-style translucent tinted liquid glass bubble indicator */
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

rep_bubble = """/* Compact tinted glass bubble indicator: no glow, pure glass refraction, hover scale */
.inv-ai-glass-bubble {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 18px;
    padding: 0 7px;
    border-radius: 999px;
    cursor: pointer;
    overflow: hidden;
    user-select: none;
    
    /* Translucent tinted glass body */
    background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.04) 50%, rgba(0, 0, 0, 0.15) 100%),
        color-mix(in srgb, var(--bubble-color, var(--text-color)) 40%, transparent 60%);
    -webkit-backdrop-filter: blur(8px) saturate(140%);
    backdrop-filter: blur(8px) saturate(140%);
    border: 1px solid rgba(255, 255, 255, 0.35);
    box-shadow:
        inset 0 1px 0.5px rgba(255, 255, 255, 0.65),
        inset 0 -1px 1px rgba(0, 0, 0, 0.25),
        0 1px 2px rgba(0, 0, 0, 0.16);

    transform-origin: center center;
    transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
                border-color 0.18s ease,
                box-shadow 0.18s ease;
}

/* Glass specular curvature sheen */
.inv-ai-glass-bubble__gloss {
    position: absolute;
    top: 1px;
    left: 4px;
    right: 4px;
    height: 38%;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0.1) 70%, transparent 100%);
    pointer-events: none;
    z-index: 1;
}

/* Small, ultra-crisp typography inside the tinted glass bubble */
.inv-ai-glass-bubble__text {
    position: relative;
    z-index: 2;
    font-size: 8.5px;
    font-weight: 750;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.95);
    text-shadow: 0 0.5px 1.5px rgba(0, 0, 0, 0.7);
    line-height: 1;
}

/* Mouse over size changing: smooth spring expansion with no glow halo */
.inv-ai-glass-bubble:hover {
    transform: scale(1.18);
    z-index: 15;
    border-color: rgba(255, 255, 255, 0.65);
    box-shadow:
        inset 0 1px 1px rgba(255, 255, 255, 0.8),
        inset 0 -1px 1.5px rgba(0, 0, 0, 0.3),
        0 2px 6px rgba(0, 0, 0, 0.22);
}"""

assert target_bubble in dc, "target_bubble not found in density.css"
dc = dc.replace(target_bubble, rep_bubble, 1)

with open(path_dc, 'w', encoding='utf-8') as f:
    f.write(dc)
print("Updated density.css with compact tinted glass bubbles, smaller text, no glow, hover size change")
