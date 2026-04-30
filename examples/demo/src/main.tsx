import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

// Public demo opts into mock-data fallback for the Google apps so the
// Pages deployment shows populated UIs without a real OAuth Client ID.
// See docs/google-auth.md for the three integration paths.
(window as any).__REACT_OS_SHELL_DEMO_MODE__ = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
