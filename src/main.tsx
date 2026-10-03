

import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './features/core/App';
import toast from 'react-hot-toast';
import { tr } from './lib/i18n';
import { hasUnsavedWork } from './lib/workGuard';

if (import.meta.env.PROD) {
  console.log = () => { };
  console.info = () => { };
  console.debug = () => { };
}

console.log("Onyx.mx entry script executing...");

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
    <Suspense fallback={<div style={{ color: 'white', padding: '20px' }}>{tr("Loading Onyx.mx...")}</div>}>
      <App />
    </Suspense>
  </StrictMode>,
);