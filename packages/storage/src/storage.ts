/**
 * Cross-platform secure storage abstraction.
 * Each platform (web / mobile / desktop) provides its own implementation.
 * This package exports the interface and a default WebStorage implementation
 * that uses localStorage. Mobile and Desktop will provide their own adapters
 * at the app layer.
 */

export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** localStorage-based implementation for web browsers */
export class WebStorage implements SecureStorage {
  async get(key: string): Promise<string | null> {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  }
}

/** In-memory storage — useful for testing or ephemeral sessions */
export class MemoryStorage implements SecureStorage {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/** Default export — web storage for the web platform */
export function createDefaultStorage(): SecureStorage {
  return new WebStorage();
}
