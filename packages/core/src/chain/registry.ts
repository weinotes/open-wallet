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
 * Chain registry — holds all available chain adapter instances.
 * Provides lookup by chainId.
 */

import type { ChainAdapter } from './adapter.js';

export class ChainRegistry {
  private adapters = new Map<string, ChainAdapter>();

  register(adapter: ChainAdapter): void {
    this.adapters.set(adapter.chainId, adapter);
  }

  get(chainId: string): ChainAdapter | undefined {
    return this.adapters.get(chainId);
  }

  getAll(): ChainAdapter[] {
    return Array.from(this.adapters.values());
  }

  has(chainId: string): boolean {
    return this.adapters.has(chainId);
  }

  remove(chainId: string): void {
    this.adapters.delete(chainId);
  }

  clear(): void {
    this.adapters.clear();
  }
}

/** Singleton registry instance */
export const chainRegistry = new ChainRegistry();
