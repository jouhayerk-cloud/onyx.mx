import re

# Update src/lib/axonometric.ts
path_axo = r'c:\Jouhayerk\git\app\src\lib\axonometric.ts'
with open(path_axo, 'r', encoding='utf-8') as f:
    text_axo = f.read()

# Add enhanceStoneColor to import
text_axo = text_axo.replace(
    "import { resolveStonePalette, resolveItemColor } from './canonicalColors';",
    "import { resolveStonePalette, resolveItemColor, enhanceStoneColor } from './canonicalColors';"
)

# Apply enhanceStoneColor in normalizeHexMapTexture
text_axo = text_axo.replace(
    "result.push(toOpaqueHex(hex));",
    "result.push(enhanceStoneColor(toOpaqueHex(hex)));"
)

# Soften face overlays in drawProjectedHexGrid
text_axo = text_axo.replace(
    "drawProjectedHexGrid('top', 'rgba(255, 255, 255, 0.15)');",
    "drawProjectedHexGrid('top', 'rgba(255, 255, 255, 0.22)');"
)
text_axo = text_axo.replace(
    "drawProjectedHexGrid('left', 'rgba(0, 0, 0, 0.35)');",
    "drawProjectedHexGrid('left', 'rgba(0, 0, 0, 0.16)');"
)
text_axo = text_axo.replace(
    "drawProjectedHexGrid('front', 'rgba(0, 0, 0, 0.15)');",
    "drawProjectedHexGrid('front', 'rgba(0, 0, 0, 0.04)');"
)

with open(path_axo, 'w', encoding='utf-8') as f:
    f.write(text_axo)
print('Updated axonometric.ts')

# Update src/lib/axoMirrors.ts
path_mirrors = r'c:\Jouhayerk\git\app\src\lib\axoMirrors.ts'
with open(path_mirrors, 'r', encoding='utf-8') as f:
    text_mir = f.read()

# Add import enhanceStoneColor
text_mir = text_mir.replace(
    "import type { AxoDrawHelpers } from './axoExtra';",
    "import type { AxoDrawHelpers } from './axoExtra';\nimport { enhanceStoneColor } from './canonicalColors';"
)

# Enhance sampleMirrorColor
text_mir = text_mir.replace(
    "return col.startsWith('#') ? col : `#${col}`;",
    "return enhanceStoneColor(col.startsWith('#') ? col : `#${col}`);"
)

# In drawRoundMirror:
# 1. Wider frame: R * 0.46
text_mir = text_mir.replace(
    "const rInner = R * 0.52;",
    "const rInner = R * 0.46;"
)

# 2. Mantle UV sampling outer perimeter 0.49
text_mir = text_mir.replace(
    "const u = 0.5 + 0.46 * Math.cos(tMid);\n            const v = 0.5 - 0.46 * Math.sin(tMid);",
    "const u = 0.5 + 0.49 * Math.cos(tMid);\n            const v = 0.5 - 0.49 * Math.sin(tMid);"
)

# 3. Mantle shading softer
text_mir = text_mir.replace(
    "shGrd.addColorStop(0, 'rgba(0,0,0,0.35)');\n        shGrd.addColorStop(1, 'rgba(255,255,255,0.15)');",
    "shGrd.addColorStop(0, 'rgba(0,0,0,0.16)');\n        shGrd.addColorStop(1, 'rgba(255,255,255,0.22)');"
)

# 4. Ring facet UV sampling outward
text_mir = text_mir.replace(
    "const normR = radMid / R;\n                const u = 0.5 + 0.46 * normR * Math.cos(tMid);\n                const v = 0.5 - 0.46 * normR * Math.sin(tMid);",
    "const sampleRadius = 0.33 + 0.16 * Math.pow(fracMid, 0.65);\n                const u = 0.5 + sampleRadius * Math.cos(tMid);\n                const v = 0.5 - sampleRadius * Math.sin(tMid);"
)

# 5. Front ambient shadow softer
text_mir = text_mir.replace(
    "ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';\n        ctx.fill('evenodd');",
    "ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';\n        ctx.fill('evenodd');"
)

with open(path_mirrors, 'w', encoding='utf-8') as f:
    f.write(text_mir)
print('Updated axoMirrors.ts')
