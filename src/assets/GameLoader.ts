/**
 * GameLoader - Orchestrates loading all game assets before starting
 */

import { AssetLoader, getAssetLoader, type AssetInfo } from './AssetLoader';
import { LoadingScreen } from '../ui/LoadingScreen';
import { ALL_SOUND_CONFIGS, MUSIC_TRACKS } from '../audio/AudioConfig';
import { TextureManager, getTextureManager } from '../rendering/TextureManager';

export class GameLoader {
  private loader: AssetLoader;
  private loadingScreen: LoadingScreen;
  private loadedBuffers: Map<string, ArrayBuffer> = new Map();

  constructor() {
    this.loader = getAssetLoader();
    this.loadingScreen = new LoadingScreen();
  }

  /**
   * Load all game assets with progress display
   */
  async loadAll(): Promise<Map<string, ArrayBuffer>> {
    this.loadingScreen.show();
    this.loadingScreen.setStatus('Initializing...');

    await this.loader.init();

    const assets = this.collectAssets();

    this.loadingScreen.setStatus('Loading assets...');

    const buffers = await this.loader.loadAll(assets, (progress) => {
      this.loadingScreen.updateProgress(progress);
    });

    this.loadedBuffers = buffers;

    // Initialize zone textures
    this.loadingScreen.setStatus('Preparing textures...');
    await getTextureManager().loadTextures();

    this.loadingScreen.setComplete();

    // Brief pause to show "complete" state
    await new Promise((resolve) => setTimeout(resolve, 300));

    this.loadingScreen.hide();

    return buffers;
  }

  private collectAssets(): AssetInfo[] {
    const assets: AssetInfo[] = [];

    // Zone textures (load first as they're important for visuals)
    assets.push(...TextureManager.getTextureAssets());

    // Music tracks (largest files first for better UX - show big progress early)
    for (const track of MUSIC_TRACKS) {
      assets.push({
        url: track.path,
        type: 'audio',
        category: 'music',
      });
    }

    // Sound effects
    for (const [, config] of Object.entries(ALL_SOUND_CONFIGS)) {
      assets.push({
        url: config.path,
        type: 'audio',
        category: 'sfx',
      });
    }

    return assets;
  }

  getBuffer(url: string): ArrayBuffer | undefined {
    return this.loadedBuffers.get(url);
  }

  getAllBuffers(): Map<string, ArrayBuffer> {
    return this.loadedBuffers;
  }

  dispose(): void {
    this.loadingScreen.dispose();
  }
}

// Singleton
let gameLoaderInstance: GameLoader | null = null;

export function getGameLoader(): GameLoader {
  if (!gameLoaderInstance) {
    gameLoaderInstance = new GameLoader();
  }
  return gameLoaderInstance;
}
