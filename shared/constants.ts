// ============================================================================
// Game Constants
// ============================================================================

import type { WeaponType } from './types';

// Tick rate and timing
export const TICK_RATE = 30; // Server updates per second (increased from 20)
export const TICK_INTERVAL = 1000 / TICK_RATE;
export const CLIENT_RENDER_DELAY = 100; // ms of interpolation delay

// Map
export const TILE_SIZE = 2; // World units per tile
export const MAP_WIDTH = 96; // tiles (larger map)
export const MAP_HEIGHT = 96; // tiles
export const MIN_ROOM_SIZE = 5;
export const MAX_ROOM_SIZE = 14;
export const ROOM_COUNT = 16;
export const CORRIDOR_WIDTH = 2;

// Player
export const PLAYER_SPEED = 11; // units per second (Dalek hover speed)
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_ACCELERATION = 25; // acceleration for inertia
export const PLAYER_DECELERATION = 15; // deceleration when stopping
export const PLAYER_HOVER_HEIGHT = 0.3; // levitation height above ground
export const PLAYER_HOVER_BOB_SPEED = 2.5; // hover animation speed
export const PLAYER_HOVER_BOB_AMOUNT = 0.08; // hover animation amplitude
export const PLAYER_TILT_AMOUNT = 0.15; // tilt when moving (radians)
// Per-weapon ammo now uses WEAPON_AMMO_CONFIGS
export const PLAYER_HITBOX_RADIUS = 0.35;

// Wall collision buffer - keeps entities visible (larger than hitbox for camera visibility)
export const WALL_COLLISION_BUFFER = 0.7;

// Weapon System (WeaponType is defined in types.ts)
export const WEAPON_CONFIGS = {
  pistol: {
    name: 'PISTOL',
    damage: 20,
    cooldown: 300,
    energy: 1,
    pellets: 1,
    spread: 0,
    speed: 30,
    lifetime: 1000,
    color: 0xffff88,
    recoil: 1.5,       // Light recoil
  },
  shotgun: {
    name: 'SHOTGUN',
    damage: 12,
    cooldown: 400,
    energy: 3,
    pellets: 6,
    spread: 0.25,
    speed: 25,
    lifetime: 800,
    color: 0xff8844,
    recoil: 4.0,       // Heavy recoil - big kick!
  },
  machinegun: {
    name: 'MACHINE GUN',
    damage: 8,
    cooldown: 80,
    energy: 1,
    pellets: 1,
    spread: 0.08,
    speed: 35,
    lifetime: 600,
    color: 0x88ff88,
    recoil: 0.8,       // Light continuous recoil
  },
  rifle: {
    name: 'RIFLE',
    damage: 50,
    cooldown: 600,
    energy: 5,
    pellets: 1,
    spread: 0,
    speed: 45,
    lifetime: 1200,
    color: 0x8888ff,
    recoil: 3.0,       // Strong kick
  },
  rocket: {
    name: 'ROCKET',
    damage: 80,
    cooldown: 1000,
    energy: 10,
    pellets: 1,
    spread: 0,
    speed: 15,
    lifetime: 2000,
    color: 0xff4444,
    explosive: true,
    blastRadius: 3,
    recoil: 5.0,       // Massive recoil!
  },
} as const;

export const WEAPON_SLOT_ORDER: WeaponType[] = ['pistol', 'shotgun', 'machinegun', 'rifle', 'rocket'];

// Per-weapon ammo configuration
export const WEAPON_AMMO_CONFIGS = {
  pistol: {
    startAmmo: 200,
    maxAmmo: 400,
    pickupAmmo: 50,
  },
  shotgun: {
    startAmmo: 60,
    maxAmmo: 120,
    pickupAmmo: 20,
  },
  machinegun: {
    startAmmo: 400,
    maxAmmo: 800,
    pickupAmmo: 100,
  },
  rifle: {
    startAmmo: 50,
    maxAmmo: 100,
    pickupAmmo: 20,
  },
  rocket: {
    startAmmo: 200,
    maxAmmo: 500,
    pickupAmmo: 50,
  },
} as const;

// Thermobaric charge (panic button)
export const THERMOBARIC_COOLDOWN = 5000; // 5 seconds
export const THERMOBARIC_DAMAGE = 100;
export const THERMOBARIC_RADIUS = 5;

// Legacy constants for compatibility
export const SHOOT_COOLDOWN = 200;
export const PROJECTILE_SPEED = 25;
export const PROJECTILE_DAMAGE = 15;
export const PROJECTILE_LIFETIME = 800;
export const PROJECTILE_HITBOX_RADIUS = 0.12;
export const SHOTGUN_PELLETS = 6;
export const SHOTGUN_SPREAD = 0.25;

// Enemies - faster base speeds
export const ENEMY_CONFIGS = {
  grunt: {
    health: 40,
    speed: 5,
    damage: 18,
    attackCooldown: 800,
    attackRange: 0.7,
    hitboxRadius: 0.55,
    score: 10,
    isRanged: false,
  },
  runner: {
    health: 25,
    speed: 8,
    damage: 8,
    attackCooldown: 400,
    attackRange: 0.6,
    hitboxRadius: 0.4,
    score: 15,
    isRanged: false,
  },
  tank: {
    health: 120,
    speed: 3,
    damage: 30,
    attackCooldown: 1500,
    attackRange: 1.0,
    hitboxRadius: 0.8,
    score: 30,
    isRanged: false,
  },
  gunner: {
    health: 35,
    speed: 4,
    damage: 12,
    attackCooldown: 600,    // Time between shots
    attackRange: 12,        // Ranged attack distance
    hitboxRadius: 0.5,
    score: 20,
    isRanged: true,
    projectileSpeed: 20,
    accuracy: 0.85,         // Base accuracy (1 = perfect)
    reloadTime: 2000,       // ms to reload
    magazineSize: 6,
  },
  sniper: {
    health: 25,
    speed: 2.5,
    damage: 35,
    attackCooldown: 1500,   // Slow but powerful
    attackRange: 20,        // Long range
    hitboxRadius: 0.45,
    score: 30,
    isRanged: true,
    projectileSpeed: 35,
    accuracy: 0.95,         // Very accurate
    reloadTime: 3000,
    magazineSize: 3,
  },
  hunter: {
    health: 60,             // Tough special soldier
    speed: 5.5,             // Fast - actively hunts
    damage: 25,             // Rifle damage
    attackCooldown: 800,    // Moderate fire rate
    attackRange: 16,        // Good range
    hitboxRadius: 0.55,
    score: 50,              // High value target
    isRanged: true,
    projectileSpeed: 30,
    accuracy: 0.9,          // Very accurate
    reloadTime: 1800,
    magazineSize: 8,
    isHunter: true,         // Special flag - always hunts player
  },
} as const;

// Detection settings for tactical AI
export const DETECTION_CONFIG = {
  // Vision
  visionRange: 15,          // Tiles
  visionAngle: 60,          // Degrees (half cone)
  peripheralRange: 8,       // Shorter range for peripheral
  peripheralAngle: 120,     // Wider angle
  // Detection speed (0-1 per second)
  centralDetectionRate: 1.5,    // Fast detection in central vision
  peripheralDetectionRate: 0.5, // Slower in peripheral
  // Detection decay when player not visible
  detectionDecayRate: 0.3,
  // Thresholds
  alertThreshold: 0.3,      // Start investigating
  detectedThreshold: 0.8,   // Full detection, attack
  // Hearing
  gunshotRange: 25,         // Tiles - gunshots are loud
  footstepRange: 5,         // Tiles - player running
  // Alert propagation
  alertRadius: 8,           // Tiles - nearby enemies get alerted
} as const;

// Cover system settings
export const COVER_CONFIG = {
  coverSearchRadius: 10,    // How far to look for cover
  minCoverDistance: 3,      // Min distance from threat
  maxCoverDistance: 12,     // Max distance from threat
  peekDuration: 500,        // ms to peek and shoot
  hideDuration: 1500,       // ms to hide between peeks
} as const;

// Enemy speed scaling per wave
export function getEnemySpeedMultiplier(wave: number): number {
  return 1 + wave * 0.1; // 10% faster each wave
}

// Waves - all enemy types from wave 1
export const WAVE_START_DELAY = 1500; // 1.5 seconds between waves
export const WAVE_CONFIGS = [
  // Wave 1: Full variety from the start - intense!
  { enemyCount: 40, types: [{ type: 'grunt', weight: 0.2 }, { type: 'runner', weight: 0.2 }, { type: 'gunner', weight: 0.2 }, { type: 'tank', weight: 0.1 }, { type: 'sniper', weight: 0.15 }, { type: 'hunter', weight: 0.15 }], spawnDelay: 350 },
  // Wave 2: More enemies, faster spawning
  { enemyCount: 55, types: [{ type: 'grunt', weight: 0.2 }, { type: 'runner', weight: 0.2 }, { type: 'gunner', weight: 0.2 }, { type: 'tank', weight: 0.1 }, { type: 'sniper', weight: 0.15 }, { type: 'hunter', weight: 0.15 }], spawnDelay: 300 },
  // Wave 3: Even more intense
  { enemyCount: 70, types: [{ type: 'grunt', weight: 0.15 }, { type: 'runner', weight: 0.2 }, { type: 'gunner', weight: 0.25 }, { type: 'tank', weight: 0.1 }, { type: 'sniper', weight: 0.15 }, { type: 'hunter', weight: 0.15 }], spawnDelay: 250 },
  // Wave 4+: Swarm mode - more hunters and ranged
  { enemyCount: 90, types: [{ type: 'grunt', weight: 0.1 }, { type: 'runner', weight: 0.15 }, { type: 'gunner', weight: 0.25 }, { type: 'tank', weight: 0.1 }, { type: 'sniper', weight: 0.2 }, { type: 'hunter', weight: 0.2 }], spawnDelay: 200 },
] as const;

// Get wave config (cycles with increasing difficulty)
export function getWaveConfig(wave: number) {
  const baseIndex = Math.min(wave - 1, WAVE_CONFIGS.length - 1);
  const config = WAVE_CONFIGS[baseIndex];
  const multiplier = Math.floor((wave - 1) / WAVE_CONFIGS.length) + 1;

  return {
    enemyCount: Math.floor((10 + wave * 5) * multiplier), // More enemies per wave
    types: [...config.types] as { type: 'grunt' | 'runner' | 'tank' | 'gunner' | 'sniper' | 'hunter'; weight: number }[],
    spawnDelay: Math.max(150, config.spawnDelay - multiplier * 30), // Faster spawning
  };
}

// Pickups
export const HEALTH_PACK_VALUE = 45; // more health per pack
// Per-weapon ammo pickups now use WEAPON_AMMO_CONFIGS.pickupAmmo
export const PICKUP_SPAWN_CHANCE = 0.5; // 50% chance on enemy death

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
export const DASH_SPEED = 64;        // 2x faster
export const DASH_DURATION = 400;    // 2.5x longer (total: 5x distance)
export const DASH_COOLDOWN = 800; // ms
export const DASH_IFRAMES = true;

// Sprint (Shift key acceleration)
export const SPRINT_MULTIPLIER = 1.8; // 80% faster when sprinting

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
  gunner: 0x880022,  // Dark red for gunner
  sniper: 0x770033,  // Purple-red for sniper
  hunter: 0x660000,  // Deep crimson for hunter
} as const;

// Colors (hex)
export const COLORS = {
  floor: 0x3d3d5c,
  wall: 0x2a2a40,
  debris: 0x4a4a6a,
  puddle: 0x2d4a5c,
  player: 0x79c0ff, // brighter blue like codex
  // Enemy colors by type
  enemy: 0xe26b6b,        // Default/grunt - red
  enemyGrunt: 0xe26b6b,   // Red - basic melee
  enemyRunner: 0xff8866,  // Orange - fast melee
  enemyTank: 0x993333,    // Dark red - heavy melee
  enemyGunner: 0x6b8be2,  // Blue - ranged soldier
  enemySniper: 0x8b6be2,  // Purple - long range
  enemyHunter: 0x2a9d8f,  // Teal/green - elite hunter (special uniform)
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
