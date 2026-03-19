import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Apply stored theme before any render to prevent FOUC.
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

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
