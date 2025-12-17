// ============================================================================
// Game Constants
// ============================================================================

// Tick rate and timing
export const TICK_RATE = 20; // Server updates per second
export const TICK_INTERVAL = 1000 / TICK_RATE;
export const CLIENT_RENDER_DELAY = 100; // ms of interpolation delay

// Map
export const TILE_SIZE = 2; // World units per tile
export const MAP_WIDTH = 50; // tiles
export const MAP_HEIGHT = 50; // tiles
export const MIN_ROOM_SIZE = 4;
export const MAX_ROOM_SIZE = 10;
export const ROOM_COUNT = 8;
export const CORRIDOR_WIDTH = 2;

// Player
export const PLAYER_SPEED = 8; // units per second
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_START_AMMO = 30;
export const PLAYER_MAX_AMMO = 90;
export const PLAYER_HITBOX_RADIUS = 0.5;

// Shooting
export const SHOOT_COOLDOWN = 150; // ms
export const PROJECTILE_SPEED = 25; // units per second
export const PROJECTILE_DAMAGE = 25;
export const PROJECTILE_LIFETIME = 2000; // ms
export const PROJECTILE_HITBOX_RADIUS = 0.15;

// Enemies
export const ENEMY_CONFIGS = {
  grunt: {
    health: 50,
    speed: 3,
    damage: 10,
    attackCooldown: 1000,
    attackRange: 1.5,
    hitboxRadius: 0.6,
    score: 10,
  },
  runner: {
    health: 30,
    speed: 6,
    damage: 5,
    attackCooldown: 500,
    attackRange: 1.2,
    hitboxRadius: 0.4,
    score: 15,
  },
  tank: {
    health: 150,
    speed: 1.5,
    damage: 25,
    attackCooldown: 2000,
    attackRange: 2,
    hitboxRadius: 0.9,
    score: 30,
  },
} as const;

// Waves
export const WAVE_CONFIGS = [
  { enemyCount: 5, types: [{ type: 'grunt', weight: 1 }], spawnDelay: 2000 },
  { enemyCount: 8, types: [{ type: 'grunt', weight: 0.8 }, { type: 'runner', weight: 0.2 }], spawnDelay: 1800 },
  { enemyCount: 12, types: [{ type: 'grunt', weight: 0.6 }, { type: 'runner', weight: 0.4 }], spawnDelay: 1500 },
  { enemyCount: 15, types: [{ type: 'grunt', weight: 0.5 }, { type: 'runner', weight: 0.3 }, { type: 'tank', weight: 0.2 }], spawnDelay: 1200 },
  { enemyCount: 20, types: [{ type: 'grunt', weight: 0.4 }, { type: 'runner', weight: 0.4 }, { type: 'tank', weight: 0.2 }], spawnDelay: 1000 },
] as const;

// Get wave config (cycles with increasing difficulty)
export function getWaveConfig(wave: number) {
  const baseIndex = Math.min(wave - 1, WAVE_CONFIGS.length - 1);
  const config = WAVE_CONFIGS[baseIndex];
  const multiplier = Math.floor((wave - 1) / WAVE_CONFIGS.length) + 1;

  return {
    enemyCount: Math.floor(config.enemyCount * multiplier * 1.2),
    types: [...config.types] as { type: 'grunt' | 'runner' | 'tank'; weight: number }[],
    spawnDelay: Math.max(500, config.spawnDelay - multiplier * 100),
  };
}

// Pickups
export const HEALTH_PACK_VALUE = 25;
export const AMMO_PACK_VALUE = 15;
export const PICKUP_SPAWN_CHANCE = 0.3; // 30% chance on enemy death

// Networking
export const SERVER_PORT = 8080;
export const MAX_PLAYERS_PER_ROOM = 4;
export const SNAPSHOT_BUFFER_SIZE = 32;

// Colors (hex)
export const COLORS = {
  floor: 0x3d3d5c,
  wall: 0x2a2a40,
  debris: 0x4a4a6a,
  puddle: 0x2d4a5c,
  player: 0x4ecdc4,
  enemy: 0xff6b6b,
  enemyRunner: 0xffa07a,
  enemyTank: 0x8b0000,
  projectile: 0xffff00,
  health: 0x00ff00,
  ammo: 0xffd700,
  emblem: 0x8b4513, // Brown for meatball emblem (will be blurred)
} as const;
