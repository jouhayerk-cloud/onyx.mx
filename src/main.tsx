

import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './features/core/App';

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
    <Suspense fallback={<div style={{ color: 'white', padding: '20px' }}>Loading Onyx.mx...</div>}>
      <App />
    </Suspense>
  </StrictMode>,
);