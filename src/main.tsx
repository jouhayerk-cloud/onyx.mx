

import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './features/core/App';
import toast from './features/onyxIsland/notify/toast';
import { tr } from './lib/i18n';
import { hasUnsavedWork } from './lib/workGuard';
import { lockZoom } from './lib/lockZoom';

if (import.meta.env.PROD) {
  console.log = () => { };
  console.info = () => { };
  console.debug = () => { };
}

console.log("Onyx.mx entry script executing...");

lockZoom();   // touch devices: no pinch-zoom, fixed-size app (see lib/lockZoom.ts)

// TEMP DEV-ONLY diagnostic for the iOS bottom-bar investigation: import.meta.env.DEV is false in
// every built/deployed bundle (checked at build time, dead-code-eliminated), so this never ships.
// Remove once the bug is confirmed fixed on-device. Screenshot this box to report the numbers back.
if (import.meta.env.DEV) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:999999;background:#39ff14;' +
    'color:#000;font:10px/1.3 monospace;padding:2px 6px;white-space:pre;pointer-events:none;';
  document.body.appendChild(box);
  // standard trick to read an env() value from JS: a hidden element whose padding is set from it
  const sabProbe = document.createElement('div');
  sabProbe.style.cssText = 'position:fixed;height:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;';
  document.body.appendChild(sabProbe);
  const update = () => {
    const vv = window.visualViewport;
    const sample = document.createElement('div');
    sample.style.cssText = 'position:fixed;left:50%;bottom:0;width:1px;height:1px;';
    document.body.appendChild(sample);
    const rect = sample.getBoundingClientRect();
    const atBottom = document.elementFromPoint(rect.left, window.innerHeight - 1);
    document.body.removeChild(sample);
    const bg = atBottom ? getComputedStyle(atBottom).backgroundColor : '?';
    const tag = atBottom ? `${atBottom.tagName}.${atBottom.className}`.slice(0, 40) : '?';
    // sample a few heights up from the true bottom to find exactly where the colour changes
    const samples = [5, 40, 100, 200].map(offset => {
      const y = window.innerHeight - offset;
      const el = document.elementFromPoint(window.innerWidth / 2, y);
      const c = el ? getComputedStyle(el).backgroundColor : '?';
      return `${offset}px:${el?.tagName || '?'}:${c}`;
    }).join(' ');
    const hero = document.querySelector('.z--2') as HTMLElement | null;
    const heroInfo = hero
      ? `found h:${Math.round(hero.getBoundingClientRect().height)} b:${Math.round(hero.getBoundingClientRect().bottom)} bg:${getComputedStyle(hero).backgroundColor} bgImg:${getComputedStyle(hero).backgroundImage.slice(0, 30)}`
      : 'NOT FOUND';
    box.textContent =
      `inner:${window.innerHeight} vv:${vv ? Math.round(vv.height) : '?'} ` +
      `html:${Math.round(document.documentElement.getBoundingClientRect().height)} ` +
      `body:${Math.round(document.body.getBoundingClientRect().height)} ` +
      `sab:${getComputedStyle(sabProbe).paddingBottom}\n` +
      `bottomEl:${tag} bg:${bg}\nhero:${heroInfo}\nsamples:${samples}`;
  };
  update();
  window.addEventListener('resize', update);
  window.visualViewport?.addEventListener('resize', update);
  setInterval(update, 1000);
}

// Service worker updates (registered by vite-plugin-pwa, autoUpdate). A new
// deploy installs in the background and takes over open pages, but the page
// keeps running the old code until it reloads. Say so instead of reloading on
// our own, which could throw away unsaved work such as a batch in progress.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install: this page is already current
    toast((t) => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {tr("A new version of Onyx is ready.")}
        <button type="button" onClick={() => { toast.dismiss(t.id); window.location.reload(); }}
          style={{ fontWeight: 800, textDecoration: 'underline' }}>
          {tr("Reload")}
        </button>
      </span>
    ), { id: 'sw-update', duration: Infinity });
  });
  // Pages and the installed app can stay open for days; look for a new deploy hourly.
  navigator.serviceWorker.ready.then((reg) => setInterval(() => reg.update().catch(() => { }), 60 * 60 * 1000));
}

// A lazy-loaded chunk that no longer exists (the page predates the last
// deploy): reloading fetches the current build. But not on our own while a
// screen holds unsaved work (a run, generated content, a filled-in entry, a
// loaded batch): the failed import surfaces as that step's error, and the
// toast offers the reload for when the work is saved.
window.addEventListener('vite:preloadError', (event) => {
  if (!hasUnsavedWork()) {
    event.preventDefault();
    window.location.reload();
    return;
  }
  toast((t) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {tr("A new version of Onyx is out and part of this page could not load. Save your work, then reload.")}
      <button type="button" onClick={() => { toast.dismiss(t.id); window.location.reload(); }}
        style={{ fontWeight: 800, textDecoration: 'underline' }}>
        {tr("Reload")}
      </button>
    </span>
  ), { id: 'stale-chunk', duration: Infinity });
});

const rootNode = document.getElementById('root');
if (!rootNode) console.error("FATAL: #root node not found!");

console.log("Mounting React tree...");
createRoot(rootNode!).render(
  <StrictMode>
    <Suspense fallback={
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0b0a', color: '#fdfcf0', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif' }}>
        <img src={`${import.meta.env.BASE_URL}onyxlogo.webp`} alt="Onyx-mx" style={{ width: 84, height: 84, objectFit: 'contain', marginBottom: 16 }} />
        <div style={{ fontSize: 13, letterSpacing: '0.04em', opacity: 0.85, fontWeight: 600 }}>Onyx-mx loading...</div>
      </div>
    }>
      <App />
    </Suspense>
  </StrictMode>,
);