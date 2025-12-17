// ============================================================================
// Core Types for Rats Farcire
// ============================================================================

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ============================================================================
// Entity Types
// ============================================================================

export type EntityType = 'player' | 'enemy' | 'projectile' | 'pickup';

export interface Entity {
  id: string;
  type: EntityType;
  position: Vec3;
  rotation: number;
  velocity: Vec2;
}

export interface PlayerState extends Entity {
  type: 'player';
  health: number;
  maxHealth: number;
  ammo: number;
  score: number;
  isDead: boolean;
  lastShootTime: number;
}

export interface EnemyState extends Entity {
  type: 'enemy';
  health: number;
  maxHealth: number;
  enemyType: EnemyType;
  targetId: string | null;
  state: 'idle' | 'chasing' | 'attacking' | 'dead';
}

export type EnemyType = 'grunt' | 'runner' | 'tank';

export interface ProjectileState extends Entity {
  type: 'projectile';
  ownerId: string;
  damage: number;
  lifetime: number;
  createdAt: number;
}

export type PickupType = 'health' | 'ammo';

export interface PickupState extends Entity {
  type: 'pickup';
  pickupType: PickupType;
  value: number;
}

// ============================================================================
// Map Types
// ============================================================================

export type TileType = 'floor' | 'wall' | 'debris' | 'puddle' | 'door';

export interface Tile {
  type: TileType;
  x: number;
  y: number;
  walkable: boolean;
  variant: number;
}

export interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
  connected: boolean;
}

export interface MapData {
  width: number;
  height: number;
  tiles: Tile[][];
  rooms: Room[];
  spawnPoints: Vec2[];
  enemySpawnPoints: Vec2[];
}

// ============================================================================
// Game State
// ============================================================================

export interface WaveConfig {
  waveNumber: number;
  enemyCount: number;
  enemyTypes: { type: EnemyType; weight: number }[];
  spawnDelay: number;
}

export interface GameState {
  tick: number;
  timestamp: number;
  players: Map<string, PlayerState>;
  enemies: Map<string, EnemyState>;
  projectiles: Map<string, ProjectileState>;
  pickups: Map<string, PickupState>;
  wave: number;
  waveEnemiesRemaining: number;
  waveActive: boolean;
  gameOver: boolean;
}

// Serializable version for network
export interface SerializedGameState {
  tick: number;
  timestamp: number;
  players: [string, PlayerState][];
  enemies: [string, EnemyState][];
  projectiles: [string, ProjectileState][];
  pickups: [string, PickupState][];
  wave: number;
  waveEnemiesRemaining: number;
  waveActive: boolean;
  gameOver: boolean;
}

// ============================================================================
// Input
// ============================================================================

export interface InputState {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  shooting: boolean;
  reload: boolean;
  interact: boolean;
  sequence: number;
}

// ============================================================================
// Network Messages
// ============================================================================

export type ClientMessage =
  | { type: 'join'; payload: { name: string } }
  | { type: 'input'; payload: InputState }
  | { type: 'ping'; payload: { timestamp: number } }
  | { type: 'leave'; payload: {} };

export type ServerMessage =
  | { type: 'joined'; payload: { playerId: string; mapData: MapData } }
  | { type: 'state'; payload: SerializedGameState }
  | { type: 'playerJoined'; payload: { playerId: string; name: string } }
  | { type: 'playerLeft'; payload: { playerId: string } }
  | { type: 'pong'; payload: { timestamp: number; serverTime: number } }
  | { type: 'waveStart'; payload: { wave: number; enemyCount: number } }
  | { type: 'waveComplete'; payload: { wave: number } }
  | { type: 'gameOver'; payload: { scores: { playerId: string; score: number }[] } }
  | { type: 'damage'; payload: { entityId: string; damage: number; sourceId: string } }
  | { type: 'death'; payload: { entityId: string; killedBy: string } };

// ============================================================================
// Room Management
// ============================================================================

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  wave: number;
  inProgress: boolean;
}
