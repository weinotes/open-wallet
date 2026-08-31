/**
 * Vite config for the Chrome MV3 extension.
 *
 * Multi-entry build:
 *   - popup.html  → popup.tsx (the wallet UI, shown when clicking the icon)
 *   - background  → background.ts (service worker, message routing)
 *   - manifest.json + icons are copied from public/
 *
 * The popup reuses the web app's pages/store/i18n via the `@web` alias,
 * so we don't duplicate ~7 page components.
 */

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { cpSync, mkdirSync } from 'node:fs';

/**
 * Copy static extension files (manifest + icons) into dist after build.
 * Implemented as a proper Vite plugin so closeBundle fires reliably.
 */
function copyExtensionAssets(): Plugin {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      mkdirSync(resolve(outDir, 'icons'), { recursive: true });
      cpSync(resolve(__dirname, 'manifest.json'), resolve(outDir, 'manifest.json'));
      for (const size of [16, 32, 48, 128]) {
        cpSync(
          resolve(__dirname, `public/icons/icon${size}.png`),
          resolve(outDir, `icons/icon${size}.png`),
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionAssets()],
  resolve: {
    alias: {
      '@web': resolve(__dirname, '../web/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          // background must be a top-level JS file for MV3 service worker
          return chunk.name === 'background' ? 'background.js' : 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});

