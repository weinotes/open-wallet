/**
 * Copyright 2026 Davey Wong <wgwcko@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Pure utility functions — no crypto dependencies, safe for all platforms.
 */

/** Shorten a hex/address for display: "0xABCD...1234" */
export function shortenAddress(address: string, start = 6, end = 4): string {
  if (!address) return '';
  if (address.length <= start + end + 3) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

/** Format a bigint/string token balance with proper decimals */
export function formatBalance(
  raw: string | bigint,
  decimals: number,
  maxFraction = 6,
): string {
  const value = typeof raw === 'bigint' ? raw.toString() : raw;
  if (!value || value === '0') return '0';

  // Add leading zeros if needed
  const padded = value.length <= decimals
    ? value.padStart(decimals + 1, '0')
    : value;

  const integerPart = padded.slice(0, padded.length - decimals);
  const fractionPart = padded.slice(padded.length - decimals);

  // Trim trailing zeros
  const trimmedFraction = fractionPart.replace(/0+$/, '').slice(0, maxFraction);

  return trimmedFraction
    ? `${integerPart}.${trimmedFraction}`
    : integerPart;
}

/** Convert human-readable amount to raw smallest unit */
export function parseAmount(amount: string, decimals: number): string {
  const [int, frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return (int + paddedFrac).replace(/^0+(?=\d)/, '') || '0';
}

/** Simple UUID v4 for account IDs */
export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Hex encode bytes */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hex decode to bytes */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

/** Deep wipe a Uint8Array (fill with zeros) — best-effort memory cleanup */
export function wipeBytes(buf: Uint8Array): void {
  for (let i = 0; i < buf.length; i++) buf[i] = 0;
}
