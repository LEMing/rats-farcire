/**
 * AssetLoader - Loads assets with progress tracking and caching
 */

import { getAssetCache } from './AssetCache';

export interface AssetInfo {
  url: string;
  type: 'audio' | 'texture' | 'other';
  category: string; // 'music', 'sfx', etc.
}

export interface LoadProgress {
  loaded: number; // bytes loaded
  total: number; // total bytes
  currentFile: string;
  filesLoaded: number;
  filesTotal: number;
  fromCache: boolean;
}

export type ProgressCallback = (progress: LoadProgress) => void;

export class AssetLoader {
  private cache = getAssetCache();
  private loadedAssets: Map<string, ArrayBuffer> = new Map();

  async init(): Promise<void> {
    await this.cache.init();
  }

  /**
   * Get file sizes for all assets (HEAD request or estimate)
   */
  async getFileSizes(assets: AssetInfo[]): Promise<Map<string, number>> {
    const sizes = new Map<string, number>();

    // Try to get sizes via HEAD requests (parallel)
    const sizePromises = assets.map(async (asset) => {
      try {
        const response = await fetch(asset.url, { method: 'HEAD' });
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          sizes.set(asset.url, parseInt(contentLength, 10));
        }
      } catch {
        // Estimate based on type
        sizes.set(asset.url, asset.type === 'audio' ? 500000 : 100000);
      }
    });

    await Promise.all(sizePromises);
    return sizes;
  }

  /**
   * Load all assets with progress callback
   */
  async loadAll(
    assets: AssetInfo[],
    onProgress?: ProgressCallback
  ): Promise<Map<string, ArrayBuffer>> {
    // Get file sizes first for accurate progress
    const sizes = await this.getFileSizes(assets);
    const totalBytes = Array.from(sizes.values()).reduce((a, b) => a + b, 0);

    let loadedBytes = 0;
    let filesLoaded = 0;

    for (const asset of assets) {
      const fileSize = sizes.get(asset.url) || 0;
      const startBytes = loadedBytes;

      // Check cache first
      const cached = await this.cache.get(asset.url);

      if (cached) {
        // Load from cache instantly
        this.loadedAssets.set(asset.url, cached);
        loadedBytes += cached.byteLength;
        filesLoaded++;

        if (onProgress) {
          onProgress({
            loaded: loadedBytes,
            total: totalBytes,
            currentFile: this.getFileName(asset.url),
            filesLoaded,
            filesTotal: assets.length,
            fromCache: true,
          });
        }
      } else {
        // Download with progress
        const data = await this.downloadWithProgress(
          asset.url,
          fileSize,
          (bytesLoaded) => {
            if (onProgress) {
              onProgress({
                loaded: startBytes + bytesLoaded,
                total: totalBytes,
                currentFile: this.getFileName(asset.url),
                filesLoaded,
                filesTotal: assets.length,
                fromCache: false,
              });
            }
          }
        );

        this.loadedAssets.set(asset.url, data);

        // Cache for next time
        await this.cache.set(asset.url, data);

        loadedBytes = startBytes + data.byteLength;
        filesLoaded++;

        if (onProgress) {
          onProgress({
            loaded: loadedBytes,
            total: totalBytes,
            currentFile: this.getFileName(asset.url),
            filesLoaded,
            filesTotal: assets.length,
            fromCache: false,
          });
        }
      }
    }

    return this.loadedAssets;
  }

  private async downloadWithProgress(
    url: string,
    expectedSize: number,
    onProgress: (bytesLoaded: number) => void
  ): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';

      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(event.loaded);
        } else {
          // Estimate progress based on expected size
          onProgress(Math.min(event.loaded, expectedSize));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response as ArrayBuffer);
        } else {
          reject(new Error(`Failed to load ${url}: ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error(`Network error loading ${url}`));
      };

      xhr.send();
    });
  }

  private getFileName(url: string): string {
    const parts = url.split('/');
    return parts[parts.length - 1] || url;
  }

  getAsset(url: string): ArrayBuffer | undefined {
    return this.loadedAssets.get(url);
  }

  hasAsset(url: string): boolean {
    return this.loadedAssets.has(url);
  }
}

// Singleton
let loaderInstance: AssetLoader | null = null;

export function getAssetLoader(): AssetLoader {
  if (!loaderInstance) {
    loaderInstance = new AssetLoader();
  }
  return loaderInstance;
}
