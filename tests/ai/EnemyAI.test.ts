import { describe, it, expect, beforeEach } from 'vitest';
import { EnemyAI } from '../../src/ai/EnemyAI';
import type { MapData, EnemyState, Tile } from '@shared/types';
import { TILE_SIZE } from '@shared/constants';

// Helper to create a simple test map
function createTestMap(width: number, height: number, walkablePattern?: boolean[][]): MapData {
  const tiles: Tile[][] = [];

  for (let y = 0; y < height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < width; x++) {
      const isWalkable = walkablePattern
        ? walkablePattern[y]?.[x] ?? false
        : x > 0 && x < width - 1 && y > 0 && y < height - 1; // Default: border walls

      row.push({
        type: isWalkable ? 'floor' : 'wall',
        x,
        y,
        walkable: isWalkable,
        variant: 0,
      });
    }
    tiles.push(row);
  }

  return {
    width,
    height,
    tiles,
    rooms: [],
    spawnPoints: [],
    enemySpawnPoints: [],
    altarPositions: [],
    tardisPosition: null,
    cellPositions: [],
  };
}

// Helper to create a test enemy
function createTestEnemy(id: string, x: number, z: number): EnemyState {
  return {
    id,
    enemyType: 'grunt', // Must match ENEMY_CONFIGS
    position: { x, y: 0, z },
    rotation: 0,
    health: 40,
    maxHealth: 40,
    state: 'idle',
    lastShotTime: 0,
  };
}

describe('EnemyAI', () => {
  describe('getMovementDirection', () => {
    let ai: EnemyAI;
    let map: MapData;

    beforeEach(() => {
      // Create 10x10 map with open center
      map = createTestMap(10, 10);
      ai = new EnemyAI(map);
    });

    it('should return a normalized direction vector', () => {
      const enemy = createTestEnemy('e1', 3 * TILE_SIZE, 3 * TILE_SIZE);
      const target = { x: 7 * TILE_SIZE, y: 0, z: 7 * TILE_SIZE };

      const direction = ai.getMovementDirection(enemy, target, [enemy]);

      // Check it's normalized (length ~= 1)
      const length = Math.sqrt(direction.x ** 2 + direction.y ** 2);
      expect(length).toBeCloseTo(1, 1);
    });

    it('should move toward target when path is clear', () => {
      const enemy = createTestEnemy('e1', 2 * TILE_SIZE, 5 * TILE_SIZE);
      const target = { x: 8 * TILE_SIZE, y: 0, z: 5 * TILE_SIZE };

      const direction = ai.getMovementDirection(enemy, target, [enemy]);

      // Should move right (positive x)
      expect(direction.x).toBeGreaterThan(0);
    });

    it('should apply separation from other enemies', () => {
      const enemy1 = createTestEnemy('e1', 5 * TILE_SIZE, 5 * TILE_SIZE);
      const enemy2 = createTestEnemy('e2', 5.2 * TILE_SIZE, 5 * TILE_SIZE); // Very close
      const target = { x: 5 * TILE_SIZE, y: 0, z: 2 * TILE_SIZE };

      const direction = ai.getMovementDirection(enemy1, target, [enemy1, enemy2]);

      // Should have some x component due to separation (pushed left by enemy2)
      expect(direction.x).toBeLessThan(0);
    });

    it('should ignore dead enemies for separation', () => {
      const enemy1 = createTestEnemy('e1', 5 * TILE_SIZE, 5 * TILE_SIZE);
      const deadEnemy = {
        ...createTestEnemy('e2', 5.1 * TILE_SIZE, 5 * TILE_SIZE),
        state: 'dead' as const,
      };
      const target = { x: 5 * TILE_SIZE, y: 0, z: 2 * TILE_SIZE };

      const dirWithDead = ai.getMovementDirection(enemy1, target, [enemy1, deadEnemy]);
      const dirAlone = ai.getMovementDirection(enemy1, target, [enemy1]);

      // Should be similar since dead enemy is ignored
      expect(Math.abs(dirWithDead.x - dirAlone.x)).toBeLessThan(0.1);
    });
  });

  describe('findPath (A* pathfinding)', () => {
    it('should find a direct path in open space', () => {
      const map = createTestMap(10, 10);
      const ai = new EnemyAI(map);

      const start = { x: 2 * TILE_SIZE, y: 2 * TILE_SIZE };
      const end = { x: 7 * TILE_SIZE, y: 7 * TILE_SIZE };

      const path = ai.findPath(start, end);

      expect(path.length).toBeGreaterThan(0);
      // First waypoint should be near start
      expect(Math.abs(path[0].x - start.x)).toBeLessThan(TILE_SIZE * 2);
    });

    it('should navigate around obstacles', () => {
      // Create map with a wall in the middle
      const pattern = [
        [false, false, false, false, false, false, false, false],
        [false, true,  true,  true,  true,  true,  true,  false],
        [false, true,  true,  true,  true,  true,  true,  false],
        [false, true,  true,  false, false, true,  true,  false], // Wall in middle
        [false, true,  true,  false, false, true,  true,  false],
        [false, true,  true,  true,  true,  true,  true,  false],
        [false, true,  true,  true,  true,  true,  true,  false],
        [false, false, false, false, false, false, false, false],
      ];
      const map = createTestMap(8, 8, pattern);
      const ai = new EnemyAI(map);

      // Path from left side to right side (must go around wall)
      const start = { x: 1.5 * TILE_SIZE, y: 3.5 * TILE_SIZE };
      const end = { x: 6.5 * TILE_SIZE, y: 3.5 * TILE_SIZE };

      const path = ai.findPath(start, end);

      expect(path.length).toBeGreaterThan(2); // Must have waypoints to go around
    });

    it('should return empty path when no path exists', () => {
      // Create map where start and end are isolated
      const pattern = [
        [false, false, false, false, false],
        [false, true,  false, true,  false],
        [false, false, false, false, false],
        [false, true,  false, true,  false],
        [false, false, false, false, false],
      ];
      const map = createTestMap(5, 5, pattern);
      const ai = new EnemyAI(map);

      const start = { x: 1 * TILE_SIZE, y: 1 * TILE_SIZE };
      const end = { x: 3 * TILE_SIZE, y: 3 * TILE_SIZE };

      const path = ai.findPath(start, end);

      expect(path.length).toBe(0);
    });

    it('should handle start position at destination', () => {
      const map = createTestMap(10, 10);
      const ai = new EnemyAI(map);

      const pos = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE };
      const path = ai.findPath(pos, pos);

      // Path should be very short or single point
      expect(path.length).toBeLessThanOrEqual(2);
    });
  });

  describe('removeEnemy', () => {
    it('should clean up path data for removed enemies', () => {
      const map = createTestMap(10, 10);
      const ai = new EnemyAI(map);

      const enemy = createTestEnemy('e1', 2 * TILE_SIZE, 2 * TILE_SIZE);
      const target = { x: 8 * TILE_SIZE, y: 0, z: 8 * TILE_SIZE };

      // Trigger path calculation
      ai.getMovementDirection(enemy, target, [enemy]);

      // Should not throw
      expect(() => ai.removeEnemy('e1')).not.toThrow();

      // Removing again should also not throw
      expect(() => ai.removeEnemy('e1')).not.toThrow();
    });
  });

  describe('wall avoidance', () => {
    it('should avoid walls when close to them', () => {
      const map = createTestMap(10, 10);
      const ai = new EnemyAI(map);

      // Enemy near left wall
      const enemy = createTestEnemy('e1', 1.2 * TILE_SIZE, 5 * TILE_SIZE);
      const target = { x: 1 * TILE_SIZE, y: 0, z: 2 * TILE_SIZE }; // Target is also near wall

      const direction = ai.getMovementDirection(enemy, target, [enemy]);

      // Should have positive x (pushed away from left wall)
      expect(direction.x).toBeGreaterThanOrEqual(0);
    });
  });

  describe('line of sight', () => {
    it('should go direct when target is in line of sight', () => {
      const map = createTestMap(20, 20);
      const ai = new EnemyAI(map);

      // Clear line of sight
      const enemy = createTestEnemy('e1', 5 * TILE_SIZE, 10 * TILE_SIZE);
      const target = { x: 10 * TILE_SIZE, y: 0, z: 10 * TILE_SIZE };

      const direction = ai.getMovementDirection(enemy, target, [enemy]);

      // Should move directly toward target
      expect(direction.x).toBeGreaterThan(0.9); // Almost entirely in x direction
      expect(Math.abs(direction.y)).toBeLessThan(0.2);
    });
  });

  describe('close range behavior', () => {
    it('should move directly toward very close targets', () => {
      const map = createTestMap(10, 10);
      const ai = new EnemyAI(map);

      const enemy = createTestEnemy('e1', 5 * TILE_SIZE, 5 * TILE_SIZE);
      const target = { x: 5.5 * TILE_SIZE, y: 0, z: 5 * TILE_SIZE }; // Very close

      const direction = ai.getMovementDirection(enemy, target, [enemy]);

      // Should move toward target
      expect(direction.x).toBeGreaterThan(0);
    });
  });

  describe('multiple enemies', () => {
    it('should handle multiple enemies simultaneously', () => {
      const map = createTestMap(20, 20);
      const ai = new EnemyAI(map);

      const enemies = [
        createTestEnemy('e1', 3 * TILE_SIZE, 3 * TILE_SIZE),
        createTestEnemy('e2', 5 * TILE_SIZE, 3 * TILE_SIZE),
        createTestEnemy('e3', 4 * TILE_SIZE, 5 * TILE_SIZE),
      ];

      const target = { x: 15 * TILE_SIZE, y: 0, z: 15 * TILE_SIZE };

      // Get directions for all enemies
      const directions = enemies.map((enemy) =>
        ai.getMovementDirection(enemy, target, enemies)
      );

      // All should have valid directions
      for (const dir of directions) {
        const length = Math.sqrt(dir.x ** 2 + dir.y ** 2);
        expect(length).toBeCloseTo(1, 1);
      }

      // All should generally move toward target (positive x and y)
      for (const dir of directions) {
        expect(dir.x).toBeGreaterThan(0);
        expect(dir.y).toBeGreaterThan(0);
      }
    });
  });
});
