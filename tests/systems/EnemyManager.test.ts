import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnemyManager, EnemyManagerCallbacks, SpawnEnemyRequest } from '../../src/systems/EnemyManager';
import type { EnemyState, MapData, Tile, Vec3 } from '../../shared/types';
import { ENEMY_CONFIGS, TILE_SIZE, PLAYER_HITBOX_RADIUS } from '../../shared/constants';

// ============================================================================
// Test Helpers
// ============================================================================

const createMockTile = (x: number, y: number, walkable = true): Tile => ({
  type: walkable ? 'floor' : 'wall',
  x,
  y,
  walkable,
  variant: 0,
});

const createMockMapData = (width = 30, height = 30): MapData => {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      // Create walls at edges
      const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      tiles[y][x] = createMockTile(x, y, !isEdge);
    }
  }

  return {
    width,
    height,
    tiles,
    rooms: [],
    spawnPoints: [{ x: 10, y: 10 }],
    enemySpawnPoints: [{ x: 5, y: 5 }],
    altarPositions: [],
    tardisPosition: { x: 15, y: 15 },
    cellPositions: [],
  };
};

const createMockEnemy = (overrides: Partial<EnemyState> = {}): EnemyState => ({
  id: 'enemy-1',
  type: 'enemy',
  position: { x: 10, y: 0.5, z: 10 },
  rotation: 0,
  velocity: { x: 0, y: 0 },
  health: 40,
  maxHealth: 40,
  enemyType: 'grunt',
  targetId: 'player-1',
  state: 'idle',
  knockbackVelocity: { x: 0, y: 0 },
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('EnemyManager', () => {
  let manager: EnemyManager;
  let mapData: MapData;
  let callbacks: EnemyManagerCallbacks;

  beforeEach(() => {
    mapData = createMockMapData();
    callbacks = {
      onEnemySpawned: vi.fn(),
      onEnemyMoved: vi.fn(),
    };
    manager = new EnemyManager(mapData, callbacks);
  });

  describe('spawnEnemy', () => {
    it('should spawn a grunt enemy', () => {
      const request: SpawnEnemyRequest = {
        enemyType: 'grunt',
        spawnPoint: { x: 5, y: 5 },
        targetId: 'player-1',
      };

      const enemy = manager.spawnEnemy(request);

      expect(enemy.enemyType).toBe('grunt');
      expect(enemy.position.x).toBe(5 * TILE_SIZE);
      expect(enemy.position.z).toBe(5 * TILE_SIZE);
      expect(enemy.health).toBe(ENEMY_CONFIGS.grunt.health);
      expect(enemy.targetId).toBe('player-1');
      expect(enemy.state).toBe('idle');
    });

    it('should spawn a runner enemy', () => {
      const request: SpawnEnemyRequest = {
        enemyType: 'runner',
        spawnPoint: { x: 10, y: 10 },
        targetId: null,
      };

      const enemy = manager.spawnEnemy(request);

      expect(enemy.enemyType).toBe('runner');
      expect(enemy.health).toBe(ENEMY_CONFIGS.runner.health);
    });

    it('should spawn a tank enemy', () => {
      const request: SpawnEnemyRequest = {
        enemyType: 'tank',
        spawnPoint: { x: 15, y: 15 },
        targetId: 'player-1',
      };

      const enemy = manager.spawnEnemy(request);

      expect(enemy.enemyType).toBe('tank');
      expect(enemy.health).toBe(ENEMY_CONFIGS.tank.health);
    });

    it('should trigger onEnemySpawned callback', () => {
      const request: SpawnEnemyRequest = {
        enemyType: 'grunt',
        spawnPoint: { x: 5, y: 5 },
        targetId: 'player-1',
      };

      const enemy = manager.spawnEnemy(request);

      expect(callbacks.onEnemySpawned).toHaveBeenCalledWith(enemy);
    });

    it('should add enemy to spatial hash', () => {
      const request: SpawnEnemyRequest = {
        enemyType: 'grunt',
        spawnPoint: { x: 5, y: 5 },
        targetId: 'player-1',
      };

      const enemy = manager.spawnEnemy(request);
      const nearby = manager.getNearbyEnemies(enemy.position.x, enemy.position.z, 2);

      expect(nearby.length).toBe(1);
      expect(nearby[0].id).toBe(enemy.id);
    });
  });

  describe('updateEnemies', () => {
    it('should move enemies toward player', () => {
      const enemies = new Map<string, EnemyState>();
      const enemy = createMockEnemy({
        position: { x: 20, y: 0.5, z: 20 },
      });
      enemies.set(enemy.id, enemy);

      const playerPos: Vec3 = { x: 30, y: 0.5, z: 30 };
      const initialX = enemy.position.x;
      const initialZ = enemy.position.z;

      manager.updateEnemies(enemies, playerPos, 1, 100);

      // Enemy should have moved toward player
      expect(enemy.position.x).toBeGreaterThan(initialX);
      expect(enemy.position.z).toBeGreaterThan(initialZ);
    });

    it('should skip dead enemies', () => {
      const enemies = new Map<string, EnemyState>();
      const enemy = createMockEnemy({
        state: 'dead',
        position: { x: 20, y: 0.5, z: 20 },
      });
      enemies.set(enemy.id, enemy);

      const playerPos: Vec3 = { x: 30, y: 0.5, z: 30 };
      const initialX = enemy.position.x;

      manager.updateEnemies(enemies, playerPos, 1, 100);

      // Dead enemy should not move
      expect(enemy.position.x).toBe(initialX);
    });

    it('should return attacking enemies when in range', () => {
      const enemies = new Map<string, EnemyState>();
      // Position enemy very close to player (within attack range)
      const enemy = createMockEnemy({
        position: { x: 20, y: 0.5, z: 20 },
      });
      enemies.set(enemy.id, enemy);

      // Player right next to enemy
      const playerPos: Vec3 = { x: 20.5, y: 0.5, z: 20 };

      const result = manager.updateEnemies(enemies, playerPos, 1, 16);

      expect(result.attackingEnemies).toContain(enemy);
      expect(enemy.state).toBe('attacking');
    });

    it('should set chasing state when not in range', () => {
      const enemies = new Map<string, EnemyState>();
      const enemy = createMockEnemy({
        position: { x: 10, y: 0.5, z: 10 },
      });
      enemies.set(enemy.id, enemy);

      // Player far away
      const playerPos: Vec3 = { x: 30, y: 0.5, z: 30 };

      manager.updateEnemies(enemies, playerPos, 1, 16);

      expect(enemy.state).toBe('chasing');
    });

    it('should apply knockback', () => {
      const enemies = new Map<string, EnemyState>();
      const enemy = createMockEnemy({
        position: { x: 20, y: 0.5, z: 20 },
        knockbackVelocity: { x: 10, y: 0 },
      });
      enemies.set(enemy.id, enemy);

      const playerPos: Vec3 = { x: 30, y: 0.5, z: 30 };
      const initialX = enemy.position.x;

      manager.updateEnemies(enemies, playerPos, 1, 100);

      // Enemy should move due to knockback
      expect(enemy.position.x).not.toBe(initialX);
      // Knockback should decay
      expect(Math.abs(enemy.knockbackVelocity.x)).toBeLessThan(10);
    });

    it('should trigger onEnemyMoved callback', () => {
      const enemies = new Map<string, EnemyState>();
      const enemy = createMockEnemy();
      enemies.set(enemy.id, enemy);

      const playerPos: Vec3 = { x: 30, y: 0.5, z: 30 };

      manager.updateEnemies(enemies, playerPos, 1, 16);

      expect(callbacks.onEnemyMoved).toHaveBeenCalledWith(enemy);
    });
  });

  describe('removeEnemy', () => {
    it('should remove enemy from spatial hash', () => {
      const request: SpawnEnemyRequest = {
        enemyType: 'grunt',
        spawnPoint: { x: 5, y: 5 },
        targetId: 'player-1',
      };

      const enemy = manager.spawnEnemy(request);
      const nearbyBefore = manager.getNearbyEnemies(enemy.position.x, enemy.position.z, 2);
      expect(nearbyBefore.length).toBe(1);

      manager.removeEnemy(enemy.id);

      const nearbyAfter = manager.getNearbyEnemies(enemy.position.x, enemy.position.z, 2);
      expect(nearbyAfter.length).toBe(0);
    });
  });

  describe('getNearbyEnemies', () => {
    it('should return enemies within radius', () => {
      // Spawn multiple enemies
      manager.spawnEnemy({ enemyType: 'grunt', spawnPoint: { x: 5, y: 5 }, targetId: null });
      manager.spawnEnemy({ enemyType: 'grunt', spawnPoint: { x: 6, y: 5 }, targetId: null });
      manager.spawnEnemy({ enemyType: 'grunt', spawnPoint: { x: 20, y: 20 }, targetId: null });

      // Query near first two
      const nearby = manager.getNearbyEnemies(5 * TILE_SIZE, 5 * TILE_SIZE, 5);

      expect(nearby.length).toBe(2);
    });
  });

  describe('isInAttackRange', () => {
    it('should return true when enemy is close to player', () => {
      const enemy = createMockEnemy({
        position: { x: 10, y: 0.5, z: 10 },
      });
      const playerPos: Vec3 = { x: 10.5, y: 0.5, z: 10 };

      expect(manager.isInAttackRange(enemy, playerPos)).toBe(true);
    });

    it('should return false when enemy is far from player', () => {
      const enemy = createMockEnemy({
        position: { x: 10, y: 0.5, z: 10 },
      });
      const playerPos: Vec3 = { x: 30, y: 0.5, z: 30 };

      expect(manager.isInAttackRange(enemy, playerPos)).toBe(false);
    });
  });

  describe('getEnemyDamage', () => {
    it('should return correct damage for grunt', () => {
      const enemy = createMockEnemy({ enemyType: 'grunt' });
      expect(manager.getEnemyDamage(enemy)).toBe(ENEMY_CONFIGS.grunt.damage);
    });

    it('should return correct damage for tank', () => {
      const enemy = createMockEnemy({ enemyType: 'tank' });
      expect(manager.getEnemyDamage(enemy)).toBe(ENEMY_CONFIGS.tank.damage);
    });
  });

  describe('getEnemyConfig', () => {
    it('should return config for enemy type', () => {
      const config = manager.getEnemyConfig('runner');
      expect(config).toBe(ENEMY_CONFIGS.runner);
    });
  });

  describe('wall collision', () => {
    it('should stop enemy at walls', () => {
      const enemies = new Map<string, EnemyState>();
      // Position enemy near wall edge (walls at x=0)
      const enemy = createMockEnemy({
        position: { x: 3, y: 0.5, z: 15 },
      });
      enemies.set(enemy.id, enemy);

      // Player on other side of wall (enemy would try to go through wall)
      const playerPos: Vec3 = { x: -5, y: 0.5, z: 15 };

      // Multiple updates to ensure enemy doesn't pass through
      for (let i = 0; i < 20; i++) {
        manager.updateEnemies(enemies, playerPos, 1, 50);
      }

      // Enemy should not go past wall collision buffer
      expect(enemy.position.x).toBeGreaterThan(0.5);
    });
  });

  describe('player separation', () => {
    it('should push enemy away from player when overlapping', () => {
      const enemies = new Map<string, EnemyState>();
      // Position enemy slightly overlapping with player (not exact same position)
      const enemy = createMockEnemy({
        position: { x: 20.2, y: 0.5, z: 20 },
      });
      enemies.set(enemy.id, enemy);

      const playerPos: Vec3 = { x: 20, y: 0.5, z: 20 };
      const initialDist = Math.sqrt(
        (enemy.position.x - playerPos.x) ** 2 +
        (enemy.position.z - playerPos.z) ** 2
      );

      manager.updateEnemies(enemies, playerPos, 1, 16);

      // Enemy should be pushed away from player position
      const finalDist = Math.sqrt(
        (enemy.position.x - playerPos.x) ** 2 +
        (enemy.position.z - playerPos.z) ** 2
      );

      // Should be pushed further away than initial
      expect(finalDist).toBeGreaterThan(initialDist);
    });
  });
});
