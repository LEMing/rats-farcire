/**
 * AssetCache - IndexedDB-based caching for game assets
 * Stores ArrayBuffer data to avoid re-downloading large files
 */

const DB_NAME = 'rats-farcire-assets';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

interface CachedAsset {
  url: string;
  data: ArrayBuffer;
  size: number;
  cachedAt: number;
}

export class AssetCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.warn('[AssetCache] IndexedDB not available, caching disabled');
        resolve(); // Continue without caching
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        }
      };
    });

    return this.initPromise;
  }

  async get(url: string): Promise<ArrayBuffer | null> {
    if (!this.db) return null;

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(url);

        request.onsuccess = () => {
          const result = request.result as CachedAsset | undefined;
          resolve(result?.data ?? null);
        };

        request.onerror = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  }

  async set(url: string, data: ArrayBuffer): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const asset: CachedAsset = {
          url,
          data,
          size: data.byteLength,
          cachedAt: Date.now(),
        };

        const request = store.put(asset);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async has(url: string): Promise<boolean> {
    if (!this.db) return false;

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getKey(url);

        request.onsuccess = () => {
          resolve(request.result !== undefined);
        };

        request.onerror = () => {
          resolve(false);
        };
      } catch {
        resolve(false);
      }
    });
  }

  async getCacheInfo(): Promise<{ count: number; totalSize: number }> {
    if (!this.db) return { count: 0, totalSize: 0 };

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const assets = request.result as CachedAsset[];
          const totalSize = assets.reduce((sum, a) => sum + a.size, 0);
          resolve({ count: assets.length, totalSize });
        };

        request.onerror = () => {
          resolve({ count: 0, totalSize: 0 });
        };
      } catch {
        resolve({ count: 0, totalSize: 0 });
      }
    });
  }

  async clear(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        resolve();
      } catch {
        resolve();
      }
    });
  }
}

// Singleton instance
let cacheInstance: AssetCache | null = null;

export function getAssetCache(): AssetCache {
  if (!cacheInstance) {
    cacheInstance = new AssetCache();
  }
  return cacheInstance;
}
