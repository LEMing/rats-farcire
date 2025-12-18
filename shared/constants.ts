// ============================================================================
// Game Constants
// ============================================================================

// Tick rate and timing
export const TICK_RATE = 30; // Server updates per second (increased from 20)
export const TICK_INTERVAL = 1000 / TICK_RATE;
export const CLIENT_RENDER_DELAY = 100; // ms of interpolation delay

// Map
export const TILE_SIZE = 2; // World units per tile
export const MAP_WIDTH = 64; // tiles (larger map)
export const MAP_HEIGHT = 64; // tiles
export const MIN_ROOM_SIZE = 5;
export const MAX_ROOM_SIZE = 12;
export const ROOM_COUNT = 10;
export const CORRIDOR_WIDTH = 2;

// Player
export const PLAYER_SPEED = 8; // units per second
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_START_AMMO = 50; // more starting ammo
export const PLAYER_MAX_AMMO = 150;
export const PLAYER_HITBOX_RADIUS = 0.35;

// Shooting - shotgun style
export const SHOOT_COOLDOWN = 200; // ms - fast responsive shooting
export const PROJECTILE_SPEED = 25; // units per second
export const PROJECTILE_DAMAGE = 15; // damage per pellet
export const PROJECTILE_LIFETIME = 800; // ms (shorter range)
export const PROJECTILE_HITBOX_RADIUS = 0.12;

// Shotgun spread
export const SHOTGUN_PELLETS = 6; // pellets per shot
export const SHOTGUN_SPREAD = 0.25; // radians spread angle (~15 degrees total)

// Enemies - faster base speeds
export const ENEMY_CONFIGS = {
  grunt: {
    health: 40,
    speed: 5, // faster
    damage: 18,
    attackCooldown: 800,
    attackRange: 0.7,
    hitboxRadius: 0.55,
    score: 10,
  },
  runner: {
    health: 25,
    speed: 8, // much faster
    damage: 8,
    attackCooldown: 400,
    attackRange: 0.6,
    hitboxRadius: 0.4,
    score: 15,
  },
  tank: {
    health: 120,
    speed: 3, // faster than before
    damage: 30,
    attackCooldown: 1500,
    attackRange: 1.0,
    hitboxRadius: 0.8,
    score: 30,
  },
} as const;

// Enemy speed scaling per wave
export function getEnemySpeedMultiplier(wave: number): number {
  return 1 + wave * 0.1; // 10% faster each wave
}

// Waves - more enemies, faster spawning
export const WAVE_START_DELAY = 2000; // 2 seconds between waves (was 3-5)
export const WAVE_CONFIGS = [
  { enemyCount: 6, types: [{ type: 'grunt', weight: 1 }], spawnDelay: 800 },
  { enemyCount: 10, types: [{ type: 'grunt', weight: 0.7 }, { type: 'runner', weight: 0.3 }], spawnDelay: 700 },
  { enemyCount: 14, types: [{ type: 'grunt', weight: 0.5 }, { type: 'runner', weight: 0.5 }], spawnDelay: 600 },
  { enemyCount: 18, types: [{ type: 'grunt', weight: 0.4 }, { type: 'runner', weight: 0.4 }, { type: 'tank', weight: 0.2 }], spawnDelay: 500 },
  { enemyCount: 24, types: [{ type: 'grunt', weight: 0.3 }, { type: 'runner', weight: 0.5 }, { type: 'tank', weight: 0.2 }], spawnDelay: 400 },
] as const;

// Get wave config (cycles with increasing difficulty)
export function getWaveConfig(wave: number) {
  const baseIndex = Math.min(wave - 1, WAVE_CONFIGS.length - 1);
  const config = WAVE_CONFIGS[baseIndex];
  const multiplier = Math.floor((wave - 1) / WAVE_CONFIGS.length) + 1;

  return {
    enemyCount: Math.floor((4 + wave * 2) * multiplier), // Simple scaling like codex
    types: [...config.types] as { type: 'grunt' | 'runner' | 'tank'; weight: number }[],
    spawnDelay: Math.max(300, config.spawnDelay - multiplier * 50),
  };
}

// Pickups
export const HEALTH_PACK_VALUE = 45; // more health per pack
export const AMMO_PACK_VALUE = 20;
export const PICKUP_SPAWN_CHANCE = 0.4; // 40% chance on enemy death

// Power Cell Objective System
export const POWER_CELLS_REQUIRED = 3;
export const CELL_PICKUP_RADIUS = 1.2; // How close to pick up a cell
export const CELL_DELIVERY_RADIUS = 2.0; // How close to TARDIS to deliver
export const CELL_CARRY_SPEED_MULTIPLIER = 0.75; // 75% speed when carrying
export const CELL_DROP_KEY = 'KeyE'; // Key to drop cell (interact key)
export const MINI_HORDE_SIZE = 6; // Enemies spawned when delivering a cell

// Networking
export const SERVER_PORT = 8080;
export const MAX_PLAYERS_PER_ROOM = 4;
export const SNAPSHOT_BUFFER_SIZE = 32;

// Dash ability
export const DASH_SPEED = 25;
export const DASH_DURATION = 150; // ms
export const DASH_COOLDOWN = 800; // ms
export const DASH_IFRAMES = true;

// Combo system
export const COMBO_TIMEOUT = 2000; // ms to maintain combo
export const COMBO_SCORE_MULTIPLIER = 0.5; // 50% bonus per combo level

// Power-ups
export const POWERUP_DURATION = 8000; // ms
export const POWERUP_DROP_CHANCE = 0.15; // 15% chance on kill
export const POWERUP_CONFIGS = {
  rapidFire: {
    color: 0xff6600,
    fireRateMultiplier: 2.5,
    name: 'RAPID FIRE',
  },
  spreadShot: {
    color: 0x00ffff,
    pelletMultiplier: 2,
    name: 'SPREAD SHOT',
  },
  vampire: {
    color: 0xff00ff,
    healPerKill: 15,
    name: 'VAMPIRE',
  },
  shield: {
    color: 0x00ff00,
    damageReduction: 0.5,
    name: 'SHIELD',
  },
} as const;

// Blood/particle colors by enemy type
export const BLOOD_COLORS = {
  grunt: 0x990000,
  runner: 0xcc3300,
  tank: 0x660033,
} as const;

// Colors (hex)
export const COLORS = {
  floor: 0x3d3d5c,
  wall: 0x2a2a40,
  debris: 0x4a4a6a,
  puddle: 0x2d4a5c,
  player: 0x79c0ff, // brighter blue like codex
  enemy: 0xe26b6b, // slightly different red
  enemyRunner: 0xff8866,
  enemyTank: 0x993333,
  projectile: 0xfff4b2, // warm yellow like codex
  health: 0x7cff79, // brighter green
  ammo: 0xffd700,
  emblem: 0xb44646, // meatball color
  torch: 0xff6600,
  torchHolder: 0x4a3728,
  muzzleFlash: 0xffff88,
  dashTrail: 0x4488ff,
  altarStone: 0x3a3a4a,
  altarCandle: 0xddcc88,
  candleFlame: 0xff9944,
} as const;
