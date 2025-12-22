import type { Vec2, Vec3, MapData, InputState, EnemyType, WeaponAmmo, WeaponType } from '@shared/types';

// ============================================================================
// Core Interfaces for Dependency Injection
// These interfaces enable testing and flexibility in the game architecture
// ============================================================================

/**
 * Renderer interface for visual output
 */
export interface IRenderer {
  init(): Promise<void>;
  buildMap(mapData: MapData): void;
  render(): void;
  resize(width: number, height: number): void;
  updateCamera(position: Vec3, aimDir: Vec2): void;
  worldToScreen(position: Vec3): Vec2;

  // Camera controls
  adjustZoom(delta: number): void;

  // Visual effects
  addScreenShake(intensity: number): void;
  spawnBloodBurst(position: Vec3, enemyType: EnemyType, count?: number): void;
  spawnBloodDecal(x: number, z: number, size?: number): void;
  updateParticles(dt: number): void;
  updateTorches(gameTime: number): void;
  updateTardis(dt: number): void;
  updatePowerCells(): void;
  updateThermobaricEffects(): void;

  // Explosion effects
  createThermobaricEffect(position: Vec3, radius: number): void;
  createRocketExplosion(position: Vec3): void;

  // Power cell visuals
  removePowerCell(cellId: string): void;
  addPowerCellAt(cellId: string, x: number, z: number): void;
  setTardisPowerLevel(level: number): void;

  // Wall occlusion
  updateWallOcclusion(entityPositions: Array<{ x: number; z: number }>, dt: number): void;
}

/**
 * Input manager interface
 */
export interface IInputManager {
  getState(): InputState;
  readonly mouseX: number;
  readonly mouseY: number;
}

/**
 * UI manager interface
 */
export interface IUIManager {
  update(data: UIUpdateData): void;
  showGameOver(score: number, wave: number, maxCombo: number): void;
  showVictory(score: number, wave: number, maxCombo: number): void;
  updateCrosshair(x: number, y: number): void;
  setConnectionStatus(status: string): void;
  setPing(ping: number): void;
  showNotification(text: string, color: number): void;
  showPowerUpNotification(name: string, color: number): void;
  spawnDamageNumber(x: number, y: number, damage: number, isCrit: boolean, combo: number): void;
  spawnScorePopup(x: number, y: number, score: number, combo: number): void;
  spawnHealNumber(x: number, y: number, amount: number): void;
  triggerKillFlash(): void;
  triggerDamageVignette(intensity: number): void;
  initMinimap(mapData: MapData): void;
}

/**
 * Data structure for UI updates
 */
export interface UIUpdateData {
  wave: number;
  enemiesLeft: number;
  score: number;
  health: number;
  maxHealth: number;
  ammo?: WeaponAmmo;
  currentWeapon?: WeaponType;
  combo?: number;
  comboTimer?: number;
  powerUps?: Record<string, number>;
  gameTime?: number;
  cellsDelivered?: number;
  cellsRequired?: number;
  carryingCell?: boolean;
}

/**
 * Game loop interface for different game modes
 */
export interface IGameLoop {
  update(input: InputState, dt: number): void;
  spawnLocalPlayer(position: Vec2): void;

  // Callbacks
  onHitstop: (() => void) | null;
  onPlayerDeath: ((score: number, wave: number, maxCombo: number) => void) | null;
  onGameWin: ((score: number, wave: number, maxCombo: number) => void) | null;
  onCellDelivered: ((cellNumber: number, totalCells: number) => void) | null;
}

/**
 * Configuration options for the Game
 */
export interface GameConfig {
  hitstopDuration?: number;
  mapWidth?: number;
  mapHeight?: number;
  tickRate?: number;
}
