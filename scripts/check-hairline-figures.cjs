// Checks every (Type, sub-shape) hairline figure: parts exist, no NaN, inside the 400 x 320 view, and different options draw DIFFERENT figures.
// Run: node scripts/check-hairline-figures.cjs [--sheet out.html]  (the sheet is an HTML contact sheet of every figure)
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const root = path.join(__dirname, '..');
const out = path.join(os.tmpdir(), 'hairline.check.cjs');
const entry = path.join(os.tmpdir(), 'hairline.entry.ts');
fs.writeFileSync(entry, "export { buildTypeFigure } from '" + root.split(path.sep).join('/') + "/src/features/entry/hairline/typeFigures';\nexport { SUB_SHAPES, subShapesFor } from '" + root.split(path.sep).join('/') + "/src/features/entry/hairline/variantOptions';\n");
execFileSync(process.execPath, [path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'), entry, '--bundle', '--format=cjs', '--platform=node', '--outfile=' + out, '--log-level=error'], { cwd: root, stdio: 'inherit' });
const { buildTypeFigure, SUB_SHAPES } = require(out);

let problems = 0, figures = 0;
const sheet = [];
const fail = m => { problems++; console.log('PROBLEM', m); };
const nums = d => (d.match(/-?\d+(\.\d+)?(e-?\d+)?/gi) || []).map(Number);
for (const [id, info] of Object.entries(SUB_SHAPES)) {
    const options = info.options.length ? info.options.map(o => o.value) : [null];
    const sigs = new Map();
    for (const v of options) {
        const holes = info.kind === 'holes' && v ? Number(v) : undefined;
        const parts = buildTypeFigure(id, null, holes, v);
        figures++;
        if (!parts || !parts.length) { fail(`${id}/${v}: no figure`); continue; }
        let bad = false;
        for (const p of parts) {
            if (/NaN|Infinity|undefined/.test(p.d)) { fail(`${id}/${v}: bad number in a path`); bad = true; break; }
            const ns = nums(p.d);
            if (ns.some(n => n < -60 || n > 460)) { fail(`${id}/${v}: coordinate outside the view`); bad = true; break; }
        }
        if (!bad) sigs.set(v, parts.map(p => p.kind + p.d).join('|'));
        sheet.push({ id, v, parts, kind: info.kind });
    }
    const distinct = new Set(sigs.values()).size;
    if (options.length > 1 && distinct < options.length) {
        const same = [...sigs.entries()].filter(([, s], i, arr) => arr.findIndex(([, t]) => t === s) !== i).map(([k]) => k);
        fail(`${id}: ${options.length} options but only ${distinct} different drawings (same as another option: ${same.join(', ')})`);
    }
}
console.log(`figures ${figures}, problems ${problems}`);
const i = process.argv.indexOf('--sheet');
if (i > 0) {
    const css = '.c{display:inline-block;margin:6px;text-align:center;font:12px system-ui}svg{width:200px;height:160px;background:#0e1114;border:1px solid #333}path{fill:none;stroke:#7ee0cf;stroke-width:1.2}.sf-plate,.sf-face{fill:#0e1114}.sf-slot{fill:#05070a}.sf-mark,.sf-bright{fill:#7ee0cf}.sf-crease{stroke:#4a7c74}';
    const body = sheet.map(f => `<div class="c"><svg viewBox="0 0 400 320">${f.parts.map(p => `<path class="sf-${p.kind}" d="${p.d}"/>`).join('')}</svg><br>${f.id} / ${f.v}</div>`).join('');
    fs.writeFileSync(process.argv[i + 1], `<meta charset="utf-8"><style>body{background:#181c20;color:#ddd}${css}</style>${body}`);
    console.log('sheet ->', process.argv[i + 1]);
}
process.exit(problems ? 1 : 0);
