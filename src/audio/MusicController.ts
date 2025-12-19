import * as THREE from 'three';
import { MusicTrack } from './types';

/**
 * Handles background music with crossfade transitions
 */
export class MusicController {
  private readonly listener: THREE.AudioListener;
  private readonly loader: THREE.AudioLoader;

  private tracks: Map<string, THREE.Audio> = new Map();
  private buffers: Map<string, AudioBuffer> = new Map();
  private currentTrack: THREE.Audio | null = null;
  private currentTrackId: string | null = null;

  private masterVolume = 0.6;
  private fadeTime = 2.0; // seconds
  private fadeInterval: ReturnType<typeof setInterval> | null = null;

  constructor(listener: THREE.AudioListener) {
    this.listener = listener;
    this.loader = new THREE.AudioLoader();
  }

  async preload(trackConfigs: MusicTrack[], preloadedBuffers?: Map<string, ArrayBuffer>): Promise<void> {
    const audioContext = this.listener.context;

    const loadPromises = trackConfigs.map(async (config) => {
      try {
        let buffer: AudioBuffer;

        // Check if we have preloaded data
        const preloaded = preloadedBuffers?.get(config.path);
        if (preloaded) {
          // Decode ArrayBuffer to AudioBuffer
          buffer = await audioContext.decodeAudioData(preloaded.slice(0));
        } else {
          // Fallback to loading directly
          buffer = await this.loader.loadAsync(config.path);
        }

        this.buffers.set(config.id, buffer);

        const audio = new THREE.Audio(this.listener);
        audio.setBuffer(buffer);
        audio.setLoop(true);
        audio.setVolume(0);
        this.tracks.set(config.id, audio);
      } catch (error) {
        console.warn(`Failed to load music track: ${config.id}`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  play(trackId: string, crossfade: boolean = true): void {
    if (trackId === this.currentTrackId) return;

    const nextTrack = this.tracks.get(trackId);
    if (!nextTrack) {
      console.warn(`Music track not found: ${trackId}`);
      return;
    }

    // Clear any ongoing fade
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }

    if (crossfade && this.currentTrack && this.currentTrack.isPlaying) {
      this.crossfade(this.currentTrack, nextTrack);
    } else {
      if (this.currentTrack?.isPlaying) {
        this.currentTrack.stop();
        this.currentTrack.setVolume(0);
      }
      nextTrack.setVolume(this.masterVolume);
      nextTrack.play();
    }

    this.currentTrack = nextTrack;
    this.currentTrackId = trackId;
  }

  private crossfade(from: THREE.Audio, to: THREE.Audio): void {
    const steps = 60;
    const stepTime = (this.fadeTime * 1000) / steps;
    const fromStartVol = from.getVolume();
    let step = 0;

    to.setVolume(0);
    to.play();

    this.fadeInterval = setInterval(() => {
      step++;
      const progress = step / steps;

      // Ease curves for smooth transition
      const fadeOutProgress = 1 - Math.pow(progress, 2);
      const fadeInProgress = Math.pow(progress, 2);

      from.setVolume(fromStartVol * fadeOutProgress);
      to.setVolume(this.masterVolume * fadeInProgress);

      if (step >= steps) {
        if (this.fadeInterval) {
          clearInterval(this.fadeInterval);
          this.fadeInterval = null;
        }
        from.stop();
        from.setVolume(0);
        to.setVolume(this.masterVolume);
      }
    }, stepTime);
  }

  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.currentTrack && this.currentTrack.isPlaying) {
      this.currentTrack.setVolume(this.masterVolume);
    }
  }

  getVolume(): number {
    return this.masterVolume;
  }

  stop(): void {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    if (this.currentTrack?.isPlaying) {
      this.currentTrack.stop();
      this.currentTrack.setVolume(0);
    }
    this.currentTrack = null;
    this.currentTrackId = null;
  }

  pause(): void {
    if (this.currentTrack?.isPlaying) {
      this.currentTrack.pause();
    }
  }

  resume(): void {
    if (this.currentTrack && !this.currentTrack.isPlaying) {
      this.currentTrack.play();
    }
  }

  getCurrentTrackId(): string | null {
    return this.currentTrackId;
  }

  dispose(): void {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
    }
    this.tracks.forEach((track) => {
      if (track.isPlaying) track.stop();
      track.disconnect();
    });
    this.tracks.clear();
    this.buffers.clear();
    this.currentTrack = null;
    this.currentTrackId = null;
  }
}
