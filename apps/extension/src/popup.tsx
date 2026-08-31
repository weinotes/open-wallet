/**
 * OpenWallet browser extension — popup entry.
 *
 * The popup reuses the web app's pages, store, i18n, and styles via the
 * `@web` alias. Unlike the web SPA (BrowserRouter), the extension popup
 * has no URL to navigate — so we mount a MemoryRouter instead.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '@web/styles/globals.css';
import '@open-wallet/ui/src/tokens.css';
import '@web/i18n/index.js';

// Buffer polyfill — bip39 needs Node's Buffer global in browser context.
import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as { Buffer: typeof Buffer }).Buffer = Buffer;
}

import AppShell from './AppShell.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MemoryRouter initialEntries={['/']}>
      <AppShell />
    </MemoryRouter>
  </React.StrictMode>,
);
