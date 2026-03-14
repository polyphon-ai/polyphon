import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ExpiryScreen from './components/Expiry/ExpiryScreen';
import type { ExpiryStatus } from '../shared/types';
import './index.css';

// Apply stored theme before any render to prevent FOUC on the expiry screen.
const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (
  savedTheme === 'dark' ||
  (savedTheme === 'system' && prefersDark) ||
  (!savedTheme && prefersDark)
) {
  document.documentElement.classList.add('dark');
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

window.polyphon.expiry
  .check()
  .then((status: ExpiryStatus) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        {status.expired ? (
          <ExpiryScreen status={status} />
        ) : (
          <App initialExpiryStatus={status} />
        )}
      </React.StrictMode>,
    );
  })
  .catch(() => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
