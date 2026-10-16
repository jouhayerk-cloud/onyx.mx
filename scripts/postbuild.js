import fs from 'fs';
import path from 'path';

// There used to be a block here that appended an 'activate' listener to dist/sw.js
// which called tab.navigate(tab.url) on every open window. It ran on every
// activation (each deploy and the first install), on top of skipWaiting and
// clientsClaim, so open tabs and Home Screen windows reloaded without warning and
// dropped unsaved input (Add Entry, PackWizard, payment forms). It is gone on
// purpose. The update path is now:
//   1. workbox skipWaiting + clientsClaim: the new worker takes over quietly.
//   2. src/main.tsx 'controllerchange': shows "A new version of Onyx is ready"
//      with a Reload button, so the user reloads when the work is saved.
//   3. src/main.tsx 'vite:preloadError': a lazy chunk from an old deploy that no
//      longer exists reloads (or offers the reload when work is unsaved).
//   4. index.html start-up safety net: a page that can never mount because its
//      own assets 404 resets the worker and caches once per build.
// Do not put a forced navigation back. If a known-broken version ever needs a
// one-time recovery, ship it for that version only and remove it afterwards.

const swPath = './dist/sw.js';
if (fs.existsSync(swPath)) {
  const content = fs.readFileSync(swPath, 'utf8');
  if (/\.navigate\s*\(/.test(content)) {
    console.error('[postbuild] dist/sw.js contains a client navigate() call; forced reloads are not allowed. Remove it.');
    process.exit(1);
  }
}

// Brand source files (.af, Affinity) are copied from public/ into dist/ by Vite
// and then published to GitHub Pages. They are design sources, not app assets.
function removeFiles(dir, ext) {
  let removed = 0;
  if (!fs.existsSync(dir)) return removed;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) removed += removeFiles(full, ext);
    else if (entry.name.toLowerCase().endsWith(ext)) {
      fs.rmSync(full);
      removed += 1;
    }
  }
  return removed;
}
const removedAf = removeFiles('./dist', '.af');
if (removedAf > 0) console.log(`[postbuild] Removed ${removedAf} Affinity (.af) source file(s) from dist/`);

const htmlPath = './dist/index.html';
const notFoundPath = './dist/404.html';
if (fs.existsSync(htmlPath)) {
  fs.copyFileSync(htmlPath, notFoundPath);
  console.log('[postbuild] Created dist/404.html from dist/index.html for GitHub Pages SPA fallback');
}
