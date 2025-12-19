import * as THREE from 'three';
import { SPATIAL_AUDIO_CONFIG } from './AudioConfig';

/**
 * Object pool for rapid-fire sounds (e.g., machinegun)
 * Cycles through pre-allocated audio instances to prevent clipping
 */
export class SoundPool {
  private sounds: (THREE.PositionalAudio | THREE.Audio)[] = [];
  private currentIndex = 0;
  private readonly isPositional: boolean;

  constructor(
    buffer: AudioBuffer,
    listener: THREE.AudioListener,
    poolSize: number,
    isPositional: boolean = true
  ) {
    this.isPositional = isPositional;

    for (let i = 0; i < poolSize; i++) {
      const sound = isPositional
        ? new THREE.PositionalAudio(listener)
        : new THREE.Audio(listener);

      sound.setBuffer(buffer);

      if (isPositional && sound instanceof THREE.PositionalAudio) {
        sound.setRefDistance(SPATIAL_AUDIO_CONFIG.refDistance);
        sound.setMaxDistance(SPATIAL_AUDIO_CONFIG.maxDistance);
        sound.setRolloffFactor(SPATIAL_AUDIO_CONFIG.rolloffFactor);
      }

      this.sounds.push(sound);
    }
  }

  play(volume: number = 1, position?: THREE.Vector3): void {
    const sound = this.sounds[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.sounds.length;

    if (sound.isPlaying) {
      sound.stop();
    }

    sound.setVolume(volume);

    if (position && this.isPositional && sound instanceof THREE.PositionalAudio) {
      sound.position.copy(position);
    }

    sound.play();
  }

  stop(): void {
    this.sounds.forEach((sound) => {
      if (sound.isPlaying) {
        sound.stop();
      }
    });
  }

  dispose(): void {
    this.sounds.forEach((sound) => {
      if (sound.isPlaying) {
        sound.stop();
      }
      sound.disconnect();
    });
    this.sounds = [];
  }
}
