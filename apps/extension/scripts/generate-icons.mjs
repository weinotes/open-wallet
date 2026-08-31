/**
 * Generate simple extension icons as PNG files.
 * Pure Node.js (zlib) — no external deps. Draws a rounded wallet glyph
 * with an accent gradient, which is good enough as a placeholder icon
 * that users can replace later.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

// ── Minimal PNG encoder ─────────────────────────────────────────────

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (width * 4 + 1) + 1 + x * 4;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      raw[dst + 3] = rgba[src + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Draw a wallet glyph ─────────────────────────────────────────────

const SIZES = [16, 32, 48, 128];

for (const size of SIZES) {
  const px = Buffer.alloc(size * size * 4);

  // Background: dark slate with rounded corners
  const radius = Math.max(2, Math.round(size * 0.2));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded rect alpha
      const dx = x < radius ? radius - x : x > size - 1 - radius ? x - (size - 1 - radius) : 0;
      const dy = y < radius ? radius - y : y > size - 1 - radius ? y - (size - 1 - radius) : 0;
      const inside = dx * dx + dy * dy <= radius * radius;
      const alpha = inside ? 255 : 0;

      const i = (y * size + x) * 4;
      if (alpha === 0) {
        px[i + 3] = 0;
        continue;
      }

      // Gradient: #2563eb (top-left) → #7c3aed (bottom-right)
      const t = (x + y) / (2 * (size - 1));
      const r = Math.round(37 + (124 - 37) * t);
      const g = Math.round(99 + (58 - 99) * t);
      const b = Math.round(235 + (237 - 235) * t);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }

  // Draw a white wallet card shape in the middle
  const cardTop = Math.round(size * 0.35);
  const cardBottom = Math.round(size * 0.68);
  const cardLeft = Math.round(size * 0.22);
  const cardRight = Math.round(size * 0.78);
  const cardRadius = Math.max(1, Math.round(size * 0.05));

  for (let y = cardTop; y <= cardBottom; y++) {
    for (let x = cardLeft; x <= cardRight; x++) {
      const dx = x < cardLeft + cardRadius ? cardLeft + cardRadius - x : x > cardRight - cardRadius ? x - (cardRight - cardRadius) : 0;
      const dy = y < cardTop + cardRadius ? cardTop + cardRadius - y : y > cardBottom - cardRadius ? y - (cardBottom - cardRadius) : 0;
      const inside = dx * dx + dy * dy <= cardRadius * cardRadius;
      if (!inside) continue;

      const i = (y * size + x) * 4;
      // card fill: white with soft translucency
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = 235;
    }
  }

  // Card "chip" — small accent square on the card
  const chipX = Math.round(size * 0.3);
  const chipY = Math.round(size * 0.46);
  const chipSize = Math.max(1, Math.round(size * 0.08));
  for (let y = chipY; y < chipY + chipSize; y++) {
    for (let x = chipX; x < chipX + chipSize; x++) {
      if (y >= size || x >= size) continue;
      const i = (y * size + x) * 4;
      px[i] = 37;
      px[i + 1] = 99;
      px[i + 2] = 235;
      px[i + 3] = 255;
    }
  }

  const file = resolve(outDir, `icon${size}.png`);
  writeFileSync(file, encodePng(size, size, px));
  console.log(`Generated ${file}`);
}
