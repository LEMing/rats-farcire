import type { MapData, EnemyType, Vec2 } from '@shared/types';
import { getWaveConfig, WAVE_START_DELAY } from '@shared/constants';
import { weightedRandom, randomChoice } from '@shared/utils';

// ============================================================================
// Wave Manager - Handles wave progression and enemy spawning logic
// Single Responsibility: Manage wave state and determine when/what to spawn
// ============================================================================

export interface WaveState {
  waveNumber: number;
  enemiesRemaining: number;
  enemiesTotal: number;
  isActive: boolean;
  isDelaying: boolean;
}

export interface SpawnRequest {
  enemyType: EnemyType;
  spawnPoint: Vec2;
}

export interface WaveManagerCallbacks {
  onSpawnEnemy: (request: SpawnRequest) => void;
  onWaveStart: (waveNumber: number, enemyCount: number) => void;
  onWaveComplete: (waveNumber: number) => void;
}

export class WaveManager {
  // Wave state
  private wave = 0;
  private waveEnemiesRemaining = 0;
  private waveEnemiesSpawned = 0;
  private waveEnemyCount = 0;
  private waveActive = false;

  // Timing
  private waveStartTimer = 0;
  private spawnTimer = 0;
  private currentSpawnDelay = 500;

  // Dependencies
  private readonly spawnPoints: Vec2[];
  private readonly callbacks: WaveManagerCallbacks;

  constructor(mapData: MapData, callbacks: WaveManagerCallbacks) {
    this.spawnPoints = mapData.enemySpawnPoints;
    this.callbacks = callbacks;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Start the wave system (call once after game init)
   */
  start(): void {
    this.waveStartTimer = WAVE_START_DELAY;
  }

  /**
   * Update wave logic - call every game tick
   */
  update(dt: number): void {
    // Wave start delay
    if (this.waveStartTimer > 0) {
      this.waveStartTimer -= dt;
      if (this.waveStartTimer <= 0) {
        this.startNextWave();
      }
      return;
    }

    if (!this.waveActive) return;

    // Spawn enemies
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.waveEnemiesSpawned < this.waveEnemyCount) {
      this.spawnEnemy();
      this.spawnTimer = this.currentSpawnDelay;
    }

    // Check wave complete
    if (this.waveEnemiesRemaining <= 0 && this.waveEnemiesSpawned >= this.waveEnemyCount) {
      this.completeWave();
    }
  }

  /**
   * Notify that an enemy was killed (decrements remaining count)
   */
  onEnemyKilled(): void {
    this.waveEnemiesRemaining--;
  }

  /**
   * Add extra enemies (e.g., mini-horde on cell delivery)
   */
  addBonusEnemies(count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawnEnemy();
      this.waveEnemiesRemaining++;
    }
  }

  /**
   * Get current wave state for UI
   */
  getState(): WaveState {
    return {
      waveNumber: this.wave,
      enemiesRemaining: this.waveEnemiesRemaining,
      enemiesTotal: this.waveEnemyCount,
      isActive: this.waveActive,
      isDelaying: this.waveStartTimer > 0,
    };
  }

  /**
   * Get current wave number
   */
  getWaveNumber(): number {
    return this.wave;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private startNextWave(): void {
    this.wave++;
    const config = getWaveConfig(this.wave);

    this.waveEnemyCount = config.enemyCount;
    this.waveEnemiesRemaining = config.enemyCount;
    this.waveEnemiesSpawned = 0;
    this.currentSpawnDelay = config.spawnDelay;
    this.spawnTimer = 0;
    this.waveActive = true;

    this.callbacks.onWaveStart(this.wave, config.enemyCount);
  }

  private completeWave(): void {
    this.waveActive = false;
    this.waveStartTimer = WAVE_START_DELAY;
    this.callbacks.onWaveComplete(this.wave);
  }

  private spawnEnemy(): void {
    if (this.spawnPoints.length === 0) return;

    const config = getWaveConfig(this.wave);
    const enemyType = weightedRandom(
      config.types.map((t) => ({ item: t.type, weight: t.weight }))
    );

    const spawnPoint = randomChoice(this.spawnPoints);

    this.callbacks.onSpawnEnemy({
      enemyType,
      spawnPoint,
    });

    this.waveEnemiesSpawned++;
  }
}
