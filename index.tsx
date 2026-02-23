import '@tailwindcss/browser';

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './src/features/core/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);