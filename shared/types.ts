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

export type EntityType = 'player' | 'enemy' | 'projectile' | 'pickup' | 'powerCell';

export interface Entity {
  id: string;
  type: EntityType;
  position: Vec3;
  rotation: number;
  velocity: Vec2;
}

// ============================================================================
// Power Cell System (Objective)
// ============================================================================

export interface PowerCellState extends Entity {
  type: 'powerCell';
  collected: boolean;
  delivered: boolean;
  carriedBy: string | null; // player id
}

export interface PlayerState extends Entity {
  type: 'player';
  health: number;
  maxHealth: number;
  ammo: number;
  score: number;
  isDead: boolean;
  lastShootTime: number;
  // Weapon system
  currentWeapon: WeaponType;
  unlockedWeapons: WeaponType[];
  // Thermobaric charge
  thermobaricCooldown: number;
  // Dash ability
  dashCooldown: number;
  isDashing: boolean;
  dashDirection: Vec2;
  dashStartTime: number;
  // Combo system
  comboCount: number;
  comboTimer: number;
  maxCombo: number;
  // Active power-ups (expiry timestamps)
  powerUps: {
    rapidFire?: number;
    spreadShot?: number;
    vampire?: number;
    shield?: number;
  };
  // Power Cell carrying
  carryingCellId: string | null;
}

// Tactical AI behavior states
export type TacticalState =
  | 'patrol'     // Walking waypoints, scanning for player
  | 'alert'      // Noticed something, investigating
  | 'engage'     // Actively fighting
  | 'cover'      // Behind cover, peeking to shoot
  | 'advance'    // Moving to better position
  | 'flank'      // Circling around player
  | 'retreat'    // Low health, falling back
  | 'melee'      // Close range attack
  | 'idle'       // Not doing anything
  | 'chasing'    // Legacy: direct chase
  | 'attacking'  // Legacy: in melee range
  | 'dead';      // Dead

export interface EnemyState extends Entity {
  type: 'enemy';
  health: number;
  maxHealth: number;
  enemyType: EnemyType;
  targetId: string | null;
  state: TacticalState;
  knockbackVelocity: Vec2;
  // Tactical AI fields
  tacticalState?: TacticalState;
  detectionLevel?: number;        // 0-1, how aware of player
  lastKnownPlayerPos?: Vec2;      // Where player was last seen
  coverPointId?: string;          // Current cover point being used
  patrolWaypointIndex?: number;   // Current patrol waypoint
  lastShotTime?: number;          // For ranged attack cooldown
  isReloading?: boolean;          // Currently reloading weapon
  alertedBy?: string;             // ID of enemy that alerted this one
}

export type EnemyType = 'grunt' | 'runner' | 'tank' | 'gunner' | 'sniper' | 'hunter';

export interface ProjectileState extends Entity {
  type: 'projectile';
  ownerId: string;
  damage: number;
  lifetime: number;
  createdAt: number;
  weaponType?: WeaponType; // For weapon-specific visuals
}

export type PickupType = 'health' | 'ammo' | 'powerup' | 'weapon';
export type PowerUpType = 'rapidFire' | 'spreadShot' | 'vampire' | 'shield';
export type WeaponType = 'pistol' | 'shotgun' | 'machinegun' | 'rifle' | 'rocket';

export interface PickupState extends Entity {
  type: 'pickup';
  pickupType: PickupType;
  value: number;
  powerUpType?: PowerUpType;
  weaponType?: WeaponType;
}

export interface BarrelState {
  id: string;
  position: Vec3;
  health: number;
  isExploding: boolean;
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

export type RoomType =
  | 'spawn'    // Player start - clean, minimal
  | 'normal'   // Fallback - random decorations
  | 'tardis'   // Exit room - mysterious, ritual
  | 'cell'     // Power cell room - tech/energy
  | 'altar'    // Cult altar room - ritual theme
  | 'grinder'  // Meat processing - industrial horror
  | 'storage'  // Supply depot - crates, explosive barrels
  | 'nest'     // Rat dwelling - bones, rat holes
  | 'shrine';  // Cult worship - candles, ritual circles

export interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
  connected: boolean;
  roomType: RoomType;
}

export interface MapData {
  width: number;
  height: number;
  tiles: Tile[][];
  rooms: Room[];
  spawnPoints: Vec2[];
  enemySpawnPoints: Vec2[];
  altarPositions: Vec2[];
  // Objective system
  tardisPosition: Vec2 | null;
  cellPositions: Vec2[];
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
  powerCells: Map<string, PowerCellState>;
  wave: number;
  waveEnemiesRemaining: number;
  waveActive: boolean;
  gameOver: boolean;
  // Objective system
  cellsDelivered: number;
  cellsRequired: number;
  gameWon: boolean;
}

// Serializable version for network
export interface SerializedGameState {
  tick: number;
  timestamp: number;
  players: [string, PlayerState][];
  enemies: [string, EnemyState][];
  projectiles: [string, ProjectileState][];
  pickups: [string, PickupState][];
  powerCells: [string, PowerCellState][];
  wave: number;
  waveEnemiesRemaining: number;
  waveActive: boolean;
  gameOver: boolean;
  cellsDelivered: number;
  cellsRequired: number;
  gameWon: boolean;
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
  interact: boolean;
  dash: boolean;
  weaponSlot: number | null; // 1-5 for weapon switching
  thermobaric: boolean; // F key for thermobaric charge
  escapePressed: boolean; // ESC key for pause menu
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
