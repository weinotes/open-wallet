import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import './styles/globals.css';
import '@open-wallet/ui/src/tokens.css';
import './i18n/index.js';

// Buffer polyfill — bip39 (mnemonic generation) and some crypto deps
// expect Node's Buffer global in the browser. Without this, new-wallet
// creation throws "Buffer is not defined".
import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as { Buffer: typeof Buffer }).Buffer = Buffer;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
