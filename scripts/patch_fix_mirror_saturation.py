# Patch axoMirrors.ts: restore natural, undistorted photo stone colors on mirrors

path_am = r'c:\Jouhayerk\git\app\src\lib\axoMirrors.ts'
with open(path_am, 'r', encoding='utf-8') as f:
    am = f.read()

# 1. Update sampleMirrorColor to return authentic stone color directly without artificial saturation boost
target_sample = """    if (uc === 'FFFFFF' || uc === 'FEFEFE' || uc === 'FDFDFD' || uc === 'FCFFFF' || uc === 'FFFFF7') {
        return fallback;
    }
    return enhanceStoneColor(col.startsWith('#') ? col : `#${col}`);"""

rep_sample = """    if (uc === 'FFFFFF' || uc === 'FEFEFE' || uc === 'FDFDFD' || uc === 'FCFFFF' || uc === 'FFFFF7') {
        return fallback;
    }
    return col.startsWith('#') ? col : `#${col}`;"""

assert target_sample in am, "target_sample not found in axoMirrors.ts"
am = am.replace(target_sample, rep_sample, 1)

# 2. Refine sampling radius in drawRoundMirror to stay safely within the authentic stone rim
target_rad = """            // In photo: outer rim at perimeter
            const u = 0.5 + 0.49 * Math.cos(tMid);
            const v = 0.5 - 0.49 * Math.sin(tMid);"""

rep_rad = """            // In photo: outer rim at perimeter (safely within stone border)
            const u = 0.5 + 0.44 * Math.cos(tMid);
            const v = 0.5 - 0.44 * Math.sin(tMid);"""

assert target_rad in am, "target_rad not found in axoMirrors.ts"
am = am.replace(target_rad, rep_rad, 1)

target_sample_rad = """                // Normalized UV coordinates in photo (mirror outer edge at ~0.46 radius)
                const sampleRadius = 0.33 + 0.16 * Math.pow(fracMid, 0.65);
                const u = 0.5 + sampleRadius * Math.cos(tMid);
                const v = 0.5 - sampleRadius * Math.sin(tMid);"""

rep_sample_rad = """                // Normalized UV coordinates in photo: sweep stone frame from inner border (0.26) to outer border (0.43)
                const sampleRadius = 0.26 + 0.17 * fracMid;
                const u = 0.5 + sampleRadius * Math.cos(tMid);
                const v = 0.5 - sampleRadius * Math.sin(tMid);"""

assert target_sample_rad in am, "target_sample_rad not found in axoMirrors.ts"
am = am.replace(target_sample_rad, rep_sample_rad, 1)

# 3. Refine UV clamp in drawSlabBoxMirror to stay within stone frame
target_box_uv = """                const u = Math.max(0.01, Math.min(0.99, midX / W));
                const v = Math.max(0.01, Math.min(0.99, 1 - (midY / H)));"""

rep_box_uv = """                const u = Math.max(0.04, Math.min(0.96, midX / W));
                const v = Math.max(0.04, Math.min(0.96, 1 - (midY / H)));"""

assert target_box_uv in am, "target_box_uv not found in axoMirrors.ts"
am = am.replace(target_box_uv, rep_box_uv, 1)

with open(path_am, 'w', encoding='utf-8') as f:
    f.write(am)
print("Updated axoMirrors.ts: restored natural undistorted stone colors on mirrors")
