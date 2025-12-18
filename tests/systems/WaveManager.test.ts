import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaveManager, WaveManagerCallbacks, SpawnRequest } from '../../src/systems/WaveManager';
import type { MapData } from '../../shared/types';

// Mock map data
const createMockMapData = (): MapData => ({
  width: 10,
  height: 10,
  tiles: [],
  spawnPoints: [{ x: 5, y: 5 }],
  enemySpawnPoints: [
    { x: 0, y: 0 },
    { x: 9, y: 9 },
  ],
  tardisPosition: { x: 5, y: 5 },
  cellPositions: [],
});

describe('WaveManager', () => {
  let waveManager: WaveManager;
  let callbacks: WaveManagerCallbacks;
  let spawnedEnemies: SpawnRequest[];

  beforeEach(() => {
    spawnedEnemies = [];
    callbacks = {
      onSpawnEnemy: vi.fn((request: SpawnRequest) => {
        spawnedEnemies.push(request);
      }),
      onWaveStart: vi.fn(),
      onWaveComplete: vi.fn(),
    };
    waveManager = new WaveManager(createMockMapData(), callbacks);
  });

  describe('initialization', () => {
    it('should start with wave 0', () => {
      const state = waveManager.getState();
      expect(state.waveNumber).toBe(0);
    });

    it('should not be active initially', () => {
      const state = waveManager.getState();
      expect(state.isActive).toBe(false);
    });

    it('should be in delay state after start()', () => {
      waveManager.start();
      const state = waveManager.getState();
      expect(state.isDelaying).toBe(true);
    });
  });

  describe('wave progression', () => {
    it('should start wave 1 after initial delay', () => {
      waveManager.start();

      // Simulate time passing (default WAVE_START_DELAY is 3000ms)
      waveManager.update(3001);

      expect(callbacks.onWaveStart).toHaveBeenCalledWith(1, expect.any(Number));
      expect(waveManager.getWaveNumber()).toBe(1);
    });

    it('should spawn enemies during active wave', () => {
      waveManager.start();
      waveManager.update(3001); // Start wave
      waveManager.update(1000); // Allow spawning

      expect(callbacks.onSpawnEnemy).toHaveBeenCalled();
      expect(spawnedEnemies.length).toBeGreaterThan(0);
    });

    it('should use spawn points from map data', () => {
      waveManager.start();
      waveManager.update(3001);
      waveManager.update(1000);

      if (spawnedEnemies.length > 0) {
        const validSpawnPoints = [
          { x: 0, y: 0 },
          { x: 9, y: 9 },
        ];
        const spawnPoint = spawnedEnemies[0].spawnPoint;
        const isValidSpawn = validSpawnPoints.some(
          (p) => p.x === spawnPoint.x && p.y === spawnPoint.y
        );
        expect(isValidSpawn).toBe(true);
      }
    });
  });

  describe('enemy tracking', () => {
    it('should decrement enemies remaining when killed', () => {
      waveManager.start();
      waveManager.update(3001); // Start wave

      const initialRemaining = waveManager.getState().enemiesRemaining;
      waveManager.onEnemyKilled();

      expect(waveManager.getState().enemiesRemaining).toBe(initialRemaining - 1);
    });

    it('should complete wave when all enemies killed', () => {
      waveManager.start();
      waveManager.update(3001); // Start wave

      const state = waveManager.getState();
      const totalEnemies = state.enemiesTotal;

      // Spawn all enemies
      for (let i = 0; i < 20; i++) {
        waveManager.update(500);
      }

      // Kill all enemies
      for (let i = 0; i < totalEnemies; i++) {
        waveManager.onEnemyKilled();
      }

      waveManager.update(100); // Process completion

      expect(callbacks.onWaveComplete).toHaveBeenCalledWith(1);
    });
  });

  describe('bonus enemies', () => {
    it('should add bonus enemies during wave', () => {
      waveManager.start();
      waveManager.update(3001); // Start wave

      const initialRemaining = waveManager.getState().enemiesRemaining;
      waveManager.addBonusEnemies(5);

      expect(waveManager.getState().enemiesRemaining).toBe(initialRemaining + 5);
    });

    it('should spawn bonus enemies immediately', () => {
      waveManager.start();
      waveManager.update(3001);

      const spawnCountBefore = spawnedEnemies.length;
      waveManager.addBonusEnemies(3);

      expect(spawnedEnemies.length).toBe(spawnCountBefore + 3);
    });
  });

  describe('getState', () => {
    it('should return correct state structure', () => {
      const state = waveManager.getState();

      expect(state).toHaveProperty('waveNumber');
      expect(state).toHaveProperty('enemiesRemaining');
      expect(state).toHaveProperty('enemiesTotal');
      expect(state).toHaveProperty('isActive');
      expect(state).toHaveProperty('isDelaying');
    });
  });
});
