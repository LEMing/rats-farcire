import * as THREE from 'three';
import { getEventBus } from '../core/EventBus';
import { SoundPool } from './SoundPool';
import { MusicController } from './MusicController';
import { VolumeSettings, SoundCategory, AudioPosition } from './types';
import {
  DEFAULT_VOLUMES,
  ALL_SOUND_CONFIGS,
  MUSIC_TRACKS,
  SPATIAL_AUDIO_CONFIG,
} from './AudioConfig';

/**
 * Central audio system integrating Three.js spatial audio with EventBus
 */
export class AudioManager {
  private readonly camera: THREE.Camera;
  private readonly listener: THREE.AudioListener;
  private readonly loader: THREE.AudioLoader;

  private soundPools: Map<string, SoundPool> = new Map();
  private singleSounds: Map<string, THREE.Audio | THREE.PositionalAudio> = new Map();
  private buffers: Map<string, AudioBuffer> = new Map();

  private musicController: MusicController;
  private volumes: VolumeSettings = { ...DEFAULT_VOLUMES };

  private initialized = false;
  private userInteracted = false;
  private pendingPlay: (() => void)[] = [];
  private unsubscribers: (() => void)[] = [];

  constructor(camera: THREE.Camera) {
    this.camera = camera;
    this.listener = new THREE.AudioListener();
    this.loader = new THREE.AudioLoader();
    this.musicController = new MusicController(this.listener);

    this.camera.add(this.listener);
    this.setupUserInteractionHandler();
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.preloadSounds();
      await this.musicController.preload(MUSIC_TRACKS);
      this.subscribeToEvents();
      this.initialized = true;
      console.log('[AudioManager] Initialized');
    } catch (error) {
      console.error('[AudioManager] Initialization failed:', error);
    }
  }

  private async preloadSounds(): Promise<void> {
    const loadPromises = Object.entries(ALL_SOUND_CONFIGS).map(async ([id, config]) => {
      try {
        const buffer = await this.loader.loadAsync(config.path);
        this.buffers.set(id, buffer);

        if (config.poolSize && config.poolSize > 1) {
          const pool = new SoundPool(
            buffer,
            this.listener,
            config.poolSize,
            config.positional ?? false
          );
          this.soundPools.set(id, pool);
        } else {
          const sound = config.positional
            ? new THREE.PositionalAudio(this.listener)
            : new THREE.Audio(this.listener);

          sound.setBuffer(buffer);
          if (config.loop) sound.setLoop(true);

          if (config.positional && sound instanceof THREE.PositionalAudio) {
            sound.setRefDistance(config.refDistance ?? SPATIAL_AUDIO_CONFIG.refDistance);
            sound.setMaxDistance(config.maxDistance ?? SPATIAL_AUDIO_CONFIG.maxDistance);
            sound.setRolloffFactor(SPATIAL_AUDIO_CONFIG.rolloffFactor);
          }

          this.singleSounds.set(id, sound);
        }
      } catch (error) {
        // Sound file missing - this is expected until we add placeholder files
        console.warn(`[AudioManager] Sound not found: ${id} (${config.path})`);
      }
    });

    await Promise.all(loadPromises);
  }

  private setupUserInteractionHandler(): void {
    const handleInteraction = () => {
      if (!this.userInteracted) {
        this.userInteracted = true;
        if (this.listener.context.state === 'suspended') {
          this.listener.context.resume();
        }
        this.pendingPlay.forEach((fn) => fn());
        this.pendingPlay = [];
      }
    };

    document.addEventListener('click', handleInteraction, { once: false });
    document.addEventListener('keydown', handleInteraction, { once: false });
  }

  private subscribeToEvents(): void {
    const eventBus = getEventBus();

    // Enemy hit sounds
    this.unsubscribers.push(
      eventBus.on('enemyHit', (payload) => {
        const soundId = `${payload.enemyType}_hit`;
        this.playPositional(soundId, payload.position);
      })
    );

    // Enemy death sounds
    this.unsubscribers.push(
      eventBus.on('enemyKilled', (payload) => {
        const soundId = `${payload.enemyType}_death`;
        this.playPositional(soundId, payload.position);
      })
    );

    // Player hit sound
    this.unsubscribers.push(
      eventBus.on('playerHit', () => {
        this.play('player_hit');
      })
    );

    // Player death sound + defeat music
    this.unsubscribers.push(
      eventBus.on('playerDied', () => {
        this.play('player_death');
        this.musicController.play('defeat', true);
      })
    );

    // Cell pickup
    this.unsubscribers.push(
      eventBus.on('cellPickedUp', () => {
        this.play('cell_pickup');
      })
    );

    // Cell delivery
    this.unsubscribers.push(
      eventBus.on('cellDelivered', (payload) => {
        this.play('cell_deliver');
        // Intensify music on final cell
        if (payload.cellNumber >= payload.totalCells - 1) {
          this.musicController.play('gameplay_intense', true);
        }
      })
    );

    // Cell dropped
    this.unsubscribers.push(
      eventBus.on('cellDropped', () => {
        this.play('cell_drop');
      })
    );

    // Wave start
    this.unsubscribers.push(
      eventBus.on('waveStarted', (payload) => {
        this.play('wave_start');
        if (payload.waveNumber >= 3) {
          this.musicController.play('gameplay_intense', true);
        }
      })
    );

    // Wave complete
    this.unsubscribers.push(
      eventBus.on('waveCompleted', () => {
        this.play('wave_complete');
        this.musicController.play('gameplay_calm', true);
      })
    );

    // Game started
    this.unsubscribers.push(
      eventBus.on('gameStarted', () => {
        this.musicController.play('gameplay_calm', true);
      })
    );

    // Game over
    this.unsubscribers.push(
      eventBus.on('gameOver', (payload) => {
        if (payload.won) {
          this.musicController.play('victory', true);
        }
      })
    );

    // Objective complete
    this.unsubscribers.push(
      eventBus.on('objectiveComplete', () => {
        this.play('notification');
      })
    );
  }

  // === Public Playback API ===

  play(soundId: string, volume?: number): void {
    if (!this.initialized) return;

    const config = ALL_SOUND_CONFIGS[soundId];
    const effectiveVolume = this.calculateVolume('sfx', volume ?? config?.volume ?? 1);

    const playFn = () => {
      const pool = this.soundPools.get(soundId);
      if (pool) {
        pool.play(effectiveVolume);
        return;
      }

      const sound = this.singleSounds.get(soundId);
      if (sound) {
        if (sound.isPlaying) sound.stop();
        sound.setVolume(effectiveVolume);
        sound.play();
      }
    };

    if (this.userInteracted) {
      playFn();
    } else {
      this.pendingPlay.push(playFn);
    }
  }

  playPositional(soundId: string, position: AudioPosition, volume?: number): void {
    if (!this.initialized) return;

    const config = ALL_SOUND_CONFIGS[soundId];
    const effectiveVolume = this.calculateVolume('sfx', volume ?? config?.volume ?? 1);
    const pos = new THREE.Vector3(position.x, position.y, position.z);

    const playFn = () => {
      const pool = this.soundPools.get(soundId);
      if (pool) {
        pool.play(effectiveVolume, pos);
        return;
      }

      const sound = this.singleSounds.get(soundId);
      if (sound && sound instanceof THREE.PositionalAudio) {
        if (sound.isPlaying) sound.stop();
        sound.position.copy(pos);
        sound.setVolume(effectiveVolume);
        sound.play();
      }
    };

    if (this.userInteracted) {
      playFn();
    } else {
      this.pendingPlay.push(playFn);
    }
  }

  playWeaponFire(weaponType: string, position: AudioPosition): void {
    const soundId = `${weaponType}_fire`;
    this.playPositional(soundId, position);
  }

  playDash(): void {
    this.play('dash');
  }

  playThermobaric(position: AudioPosition): void {
    this.playPositional('thermobaric', position);
  }

  playPickup(pickupType: 'health' | 'ammo' | 'powerup' | 'weapon'): void {
    this.play(`pickup_${pickupType}`);
  }

  // === Volume Control ===

  private calculateVolume(category: SoundCategory, baseVolume: number): number {
    return this.volumes.master * this.volumes[category] * baseVolume;
  }

  setVolume(category: keyof VolumeSettings, value: number): void {
    this.volumes[category] = Math.max(0, Math.min(1, value));

    if (category === 'music' || category === 'master') {
      this.musicController.setVolume(this.calculateVolume('music', 1));
    }
  }

  getVolume(category: keyof VolumeSettings): number {
    return this.volumes[category];
  }

  // === Music Control ===

  playMusic(trackId: string, crossfade: boolean = true): void {
    this.musicController.play(trackId, crossfade);
  }

  stopMusic(): void {
    this.musicController.stop();
  }

  startMenuMusic(): void {
    this.musicController.play('menu', false);
  }

  stopMenuMusic(): void {
    this.musicController.stop();
  }

  // === Cleanup ===

  dispose(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    this.soundPools.forEach((pool) => pool.dispose());
    this.soundPools.clear();

    this.singleSounds.forEach((sound) => {
      if (sound.isPlaying) sound.stop();
      sound.disconnect();
    });
    this.singleSounds.clear();

    this.musicController.dispose();
    this.camera.remove(this.listener);
    this.buffers.clear();
    this.initialized = false;
  }
}

// Singleton
let audioManagerInstance: AudioManager | null = null;

export function getAudioManager(): AudioManager | null {
  return audioManagerInstance;
}

export function createAudioManager(camera: THREE.Camera): AudioManager {
  if (audioManagerInstance) {
    audioManagerInstance.dispose();
  }
  audioManagerInstance = new AudioManager(camera);
  return audioManagerInstance;
}

export function disposeAudioManager(): void {
  if (audioManagerInstance) {
    audioManagerInstance.dispose();
    audioManagerInstance = null;
  }
}
