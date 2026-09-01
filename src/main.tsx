

import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './features/core/App';
import { tr } from './lib/i18n';

if (import.meta.env.PROD) {
  console.log = () => { };
  console.info = () => { };
  console.debug = () => { };
}

console.log("Onyx.mx entry script executing...");

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