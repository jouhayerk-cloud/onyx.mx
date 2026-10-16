import fs from 'fs';

const swPath = './dist/sw.js';
if (fs.existsSync(swPath)) {
  const content = fs.readFileSync(swPath, 'utf8');
  if (!content.includes('client.navigate')) {
    const activationHook = `
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      if (self.clients && self.clients.claim) await self.clients.claim();
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const tab of tabs) {
        if (tab && 'navigate' in tab && tab.url) {
          try { await tab.navigate(tab.url); } catch (e) {}
        }
      }
    } catch (e) {}
  })());
});
`;
    fs.appendFileSync(swPath, activationHook);
    console.log('[postbuild] Appended PWA unstick client-navigate hook to dist/sw.js');
  }
}

const htmlPath = './dist/index.html';
const notFoundPath = './dist/404.html';
if (fs.existsSync(htmlPath)) {
  fs.copyFileSync(htmlPath, notFoundPath);
  console.log('[postbuild] Created dist/404.html from dist/index.html for GitHub Pages SPA fallback');
}
