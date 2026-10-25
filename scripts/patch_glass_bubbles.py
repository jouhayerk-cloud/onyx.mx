# Patch UnifiedInventoryView.tsx, density.css, ui.css

# 1. UnifiedInventoryView.tsx
path_uiv = r'c:\Jouhayerk\git\app\src\features\inventory\UnifiedInventoryView.tsx'
with open(path_uiv, 'r', encoding='utf-8') as f:
    uiv = f.read()

target_uiv = """                                        return (
                                            <span key={c} className={`inv-ai-chip${inStore ? '' : ' inv-ai-chip--off'}`} title={hint}>
                                                <span className="inv-ai-sw" style={{ background: swatchFor(c) }} aria-hidden="true" />{c}
                                            </span>
                                        );"""

rep_uiv = """                                        const sw = swatchFor(c);
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

assert target_uiv in uiv, "target_uiv not found"
uiv = uiv.replace(target_uiv, rep_uiv, 1)

# Also update the hint text in UnifiedInventoryView
uiv = uiv.replace('Exports as Blue — the store has no Turquoise/Aqua value', 'Exports as Teal — the store has no Turquoise/Aqua value')

with open(path_uiv, 'w', encoding='utf-8') as f:
    f.write(uiv)
print("Updated UnifiedInventoryView.tsx")

# 2. density.css
path_dc = r'c:\Jouhayerk\git\app\src\styles\density.css'
with open(path_dc, 'r', encoding='utf-8') as f:
    dc = f.read()

target_dc = """/* A hairline ring so White, Cream and Clear still read as swatches. */
.inv-ai-sw {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.2);
}"""

rep_dc = """/* Glass translucent colored tinted round bubble with specular highlights */
.inv-ai-sw {
    position: relative;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    cursor: pointer;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border: 1px solid rgba(255, 255, 255, 0.45);
    box-shadow:
        inset 1px 1px 2px rgba(255, 255, 255, 0.75),
        inset -1px -1.5px 2px rgba(0, 0, 0, 0.35),
        0 1.5px 3px rgba(0, 0, 0, 0.12);
    transform-origin: center center;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease, filter 0.25s ease;
}

/* 3D Glass specular highlight shine reflection */
.inv-ai-sw::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.35) 32%, transparent 65%);
    pointer-events: none;
}

/* Size changing on mouse hover with glass glow */
.inv-ai-sw:hover,
.inv-ai-chip:hover .inv-ai-sw {
    transform: scale(1.65);
    z-index: 10;
    border-color: rgba(255, 255, 255, 0.85);
    box-shadow:
        inset 1.5px 1.5px 3px rgba(255, 255, 255, 0.95),
        inset -1.5px -2px 3.5px rgba(0, 0, 0, 0.45),
        0 4px 10px rgba(0, 0, 0, 0.25),
        0 0 10px var(--sw-color, rgba(255, 255, 255, 0.5));
    filter: brightness(1.15) saturate(1.25);
}"""

assert target_dc in dc, "target_dc not found"
dc = dc.replace(target_dc, rep_dc, 1)

# Also ensure inv-ai-chip has overflow visible and transition
target_chip = """.inv-ai-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 20px;
    padding: 0 8px 0 4px;
    border: 1px solid color-mix(in srgb, var(--text-color) 12%, transparent);
    border-radius: 10px;
    font-size: 11px;
    font-weight: 800;
    color: color-mix(in srgb, var(--text-color) 85%, transparent);
}"""

rep_chip = """.inv-ai-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 9px 0 5px;
    border: 1px solid color-mix(in srgb, var(--text-color) 12%, transparent);
    border-radius: 11px;
    font-size: 11px;
    font-weight: 800;
    color: color-mix(in srgb, var(--text-color) 85%, transparent);
    overflow: visible;
    transition: border-color 0.2s ease, background 0.2s ease;
}

.inv-ai-chip:hover {
    border-color: color-mix(in srgb, var(--text-color) 25%, transparent);
    background: color-mix(in srgb, var(--text-color) 5%, transparent);
}"""

assert target_chip in dc, "target_chip not found"
dc = dc.replace(target_chip, rep_chip, 1)

with open(path_dc, 'w', encoding='utf-8') as f:
    f.write(dc)
print("Updated density.css")

# 3. ui.css
path_ui = r'c:\Jouhayerk\git\app\src\styles\ui.css'
with open(path_ui, 'r', encoding='utf-8') as f:
    uic = f.read()

target_uisw = """.ui-root .ui-color__sw {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid rgb(0 0 0 / 0.25);
}"""

rep_uisw = """.ui-root .ui-color {
    overflow: visible;
    transition: border-color 0.2s ease, background 0.2s ease;
}

.ui-root .ui-color__sw {
    position: relative;
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    cursor: pointer;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border: 1px solid rgba(255, 255, 255, 0.45);
    box-shadow:
        inset 1px 1px 2px rgba(255, 255, 255, 0.75),
        inset -1px -1.5px 2px rgba(0, 0, 0, 0.35),
        0 1.5px 3px rgba(0, 0, 0, 0.12);
    transform-origin: center center;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease, filter 0.25s ease;
}

.ui-root .ui-color__sw::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.35) 32%, transparent 65%);
    pointer-events: none;
}

.ui-root .ui-color__sw:hover,
.ui-root .ui-color:hover .ui-color__sw {
    transform: scale(1.65);
    z-index: 10;
    border-color: rgba(255, 255, 255, 0.85);
    box-shadow:
        inset 1.5px 1.5px 3px rgba(255, 255, 255, 0.95),
        inset -1.5px -2px 3.5px rgba(0, 0, 0, 0.45),
        0 4px 10px rgba(0, 0, 0, 0.25),
        0 0 10px rgba(255, 255, 255, 0.5);
    filter: brightness(1.15) saturate(1.25);
}"""

assert target_uisw in uic, "target_uisw not found"
uic = uic.replace(target_uisw, rep_uisw, 1)

with open(path_ui, 'w', encoding='utf-8') as f:
    f.write(uic)
print("Updated ui.css")
