export type SoundCategory = 'sfx' | 'music' | 'ambient';

export interface SoundConfig {
  path: string;
  volume: number;
  poolSize?: number;
  positional?: boolean;
  loop?: boolean;
  refDistance?: number;
  maxDistance?: number;
}

export interface VolumeSettings {
  master: number;
  sfx: number;
  music: number;
  ambient: number;
}

export interface MusicTrack {
  id: string;
  path: string;
  intensity: 'calm' | 'medium' | 'intense';
}

export type WeaponType = 'pistol' | 'shotgun' | 'machinegun' | 'rifle' | 'rocket';
export type EnemyType = 'grunt' | 'runner' | 'tank';

export interface AudioPosition {
  x: number;
  y: number;
  z: number;
}
