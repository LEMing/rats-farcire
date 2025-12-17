import type { Vec2, Vec3, GameState, SerializedGameState } from './types';

// ============================================================================
// Math Utilities
// ============================================================================

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distance3D(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function magnitude(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function angleBetween(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

// ============================================================================
// Random Utilities
// ============================================================================

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1));
}

export function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function weightedRandom<T>(items: { item: T; weight: number }[]): T {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  let random = Math.random() * totalWeight;

  for (const { item, weight } of items) {
    random -= weight;
    if (random <= 0) return item;
  }

  return items[items.length - 1].item;
}

// Seeded random number generator (for reproducible maps)
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

// ============================================================================
// Collision Utilities
// ============================================================================

export function circleCollision(
  a: Vec2,
  radiusA: number,
  b: Vec2,
  radiusB: number
): boolean {
  const dist = distance(a, b);
  return dist < radiusA + radiusB;
}

export function pointInRect(
  point: Vec2,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

// ============================================================================
// State Serialization
// ============================================================================

export function serializeGameState(state: GameState): SerializedGameState {
  return {
    tick: state.tick,
    timestamp: state.timestamp,
    players: Array.from(state.players.entries()),
    enemies: Array.from(state.enemies.entries()),
    projectiles: Array.from(state.projectiles.entries()),
    pickups: Array.from(state.pickups.entries()),
    wave: state.wave,
    waveEnemiesRemaining: state.waveEnemiesRemaining,
    waveActive: state.waveActive,
    gameOver: state.gameOver,
  };
}

export function deserializeGameState(data: SerializedGameState): GameState {
  return {
    tick: data.tick,
    timestamp: data.timestamp,
    players: new Map(data.players),
    enemies: new Map(data.enemies),
    projectiles: new Map(data.projectiles),
    pickups: new Map(data.pickups),
    wave: data.wave,
    waveEnemiesRemaining: data.waveEnemiesRemaining,
    waveActive: data.waveActive,
    gameOver: data.gameOver,
  };
}

// ============================================================================
// UUID Generation
// ============================================================================

export function generateId(): string {
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}
