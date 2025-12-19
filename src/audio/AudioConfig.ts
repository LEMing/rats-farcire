import { SoundConfig, MusicTrack, VolumeSettings } from './types';

export const DEFAULT_VOLUMES: VolumeSettings = {
  master: 1.0,
  sfx: 1.0,
  music: 0.25,
  ambient: 0.4,
};

// Isometric audio settings - compensate for camera distance
// Higher refDistance = louder at distance
export const SPATIAL_AUDIO_CONFIG = {
  refDistance: 15,
  maxDistance: 100,
  rolloffFactor: 0.5,
};

export const WEAPON_SOUNDS: Record<string, SoundConfig> = {
  pistol_fire: {
    path: 'sounds/weapons/pistol_fire.mp3',
    volume: 1.0,
    poolSize: 4,
    positional: true,
  },
  shotgun_fire: {
    path: 'sounds/weapons/shotgun_fire.mp3',
    volume: 1.0,
    poolSize: 3,
    positional: true,
  },
  machinegun_fire: {
    path: 'sounds/weapons/machinegun_fire.mp3',
    volume: 0.9,
    poolSize: 8,
    positional: true,
  },
  rifle_fire: {
    path: 'sounds/weapons/rifle_fire.mp3',
    volume: 1.0,
    poolSize: 2,
    positional: true,
  },
  rocket_fire: {
    path: 'sounds/weapons/rocket_fire.mp3',
    volume: 1.0,
    poolSize: 2,
    positional: true,
  },
  rocket_explode: {
    path: 'sounds/weapons/rocket_explode.mp3',
    volume: 1.0,
    poolSize: 3,
    positional: true,
  },
};

export const ENEMY_SOUNDS: Record<string, SoundConfig> = {
  grunt_hit: {
    path: 'sounds/enemies/grunt_hit.mp3',
    volume: 0.5,
    poolSize: 6,
    positional: true,
  },
  grunt_death: {
    path: 'sounds/enemies/grunt_death.mp3',
    volume: 0.7,
    poolSize: 4,
    positional: true,
  },
  runner_hit: {
    path: 'sounds/enemies/runner_hit.mp3',
    volume: 0.4,
    poolSize: 6,
    positional: true,
  },
  runner_death: {
    path: 'sounds/enemies/runner_death.mp3',
    volume: 0.6,
    poolSize: 4,
    positional: true,
  },
  tank_hit: {
    path: 'sounds/enemies/tank_hit.mp3',
    volume: 0.6,
    poolSize: 4,
    positional: true,
  },
  tank_death: {
    path: 'sounds/enemies/tank_death.mp3',
    volume: 0.9,
    poolSize: 3,
    positional: true,
  },
};

export const PLAYER_SOUNDS: Record<string, SoundConfig> = {
  player_hit: {
    path: 'sounds/player/player_hit.mp3',
    volume: 0.8,
    poolSize: 3,
    positional: false,
  },
  player_death: {
    path: 'sounds/player/player_death.mp3',
    volume: 1.0,
    positional: false,
  },
  dash: {
    path: 'sounds/player/dash.mp3',
    volume: 0.6,
    poolSize: 2,
    positional: false,
  },
  pickup_health: {
    path: 'sounds/player/pickup_health.mp3',
    volume: 0.5,
    positional: false,
  },
  pickup_ammo: {
    path: 'sounds/player/pickup_ammo.mp3',
    volume: 0.5,
    positional: false,
  },
  pickup_powerup: {
    path: 'sounds/player/pickup_powerup.mp3',
    volume: 0.7,
    positional: false,
  },
  pickup_weapon: {
    path: 'sounds/player/pickup_weapon.mp3',
    volume: 0.8,
    positional: false,
  },
};

export const OBJECTIVE_SOUNDS: Record<string, SoundConfig> = {
  cell_pickup: {
    path: 'sounds/objective/cell_pickup.mp3',
    volume: 0.8,
    positional: false,
  },
  cell_drop: {
    path: 'sounds/objective/cell_drop.mp3',
    volume: 0.6,
    positional: false,
  },
  cell_deliver: {
    path: 'sounds/objective/cell_deliver.mp3',
    volume: 1.0,
    positional: false,
  },
  thermobaric: {
    path: 'sounds/objective/thermobaric.mp3',
    volume: 1.0,
    poolSize: 2,
    positional: true,
  },
};

export const UI_SOUNDS: Record<string, SoundConfig> = {
  wave_start: {
    path: 'sounds/ui/wave_start.mp3',
    volume: 0.7,
    positional: false,
  },
  wave_complete: {
    path: 'sounds/ui/wave_complete.mp3',
    volume: 0.8,
    positional: false,
  },
  notification: {
    path: 'sounds/ui/notification.mp3',
    volume: 0.4,
    positional: false,
  },
};

export const MUSIC_TRACKS: MusicTrack[] = [
  { id: 'menu', path: 'sounds/music/menu_theme.mp3', intensity: 'calm' },
  { id: 'gameplay_calm', path: 'sounds/music/gameplay_calm.mp3', intensity: 'calm' },
  { id: 'gameplay_intense', path: 'sounds/music/gameplay_intense.mp3', intensity: 'intense' },
  { id: 'victory', path: 'sounds/music/victory.mp3', intensity: 'calm' },
  { id: 'defeat', path: 'sounds/music/defeat.mp3', intensity: 'medium' },
];

// Combined for easy iteration
export const ALL_SOUND_CONFIGS: Record<string, SoundConfig> = {
  ...WEAPON_SOUNDS,
  ...ENEMY_SOUNDS,
  ...PLAYER_SOUNDS,
  ...OBJECTIVE_SOUNDS,
  ...UI_SOUNDS,
};
