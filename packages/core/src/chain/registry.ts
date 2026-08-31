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
