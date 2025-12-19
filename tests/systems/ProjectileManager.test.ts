import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectileManager } from '../../src/systems/ProjectileManager';
import type { ProjectileState, EnemyState, MapData, Tile } from '../../shared/types';

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
    spawnPoints: [{ x: 15, y: 15 }],
    enemySpawnPoints: [],
    altarPositions: [],
    tardisPosition: { x: 15, y: 15 },
    cellPositions: [],
  };
};

const createMockProjectile = (overrides: Partial<ProjectileState> = {}): ProjectileState => ({
  id: 'proj-1',
  type: 'projectile',
  position: { x: 10, y: 0.5, z: 10 },
  rotation: 0,
  velocity: { x: 10, y: 0 }, // Moving right
  ownerId: 'player-1',
  damage: 20,
  lifetime: 1000,
  createdAt: 0,
  weaponType: 'pistol',
  ...overrides,
});

const createMockEnemy = (overrides: Partial<EnemyState> = {}): EnemyState => ({
  id: 'enemy-1',
  type: 'enemy',
  position: { x: 20, y: 0.5, z: 10 },
  rotation: 0,
  velocity: { x: 0, y: 0 },
  health: 40,
  maxHealth: 40,
  enemyType: 'grunt',
  targetId: 'player-1',
  state: 'chasing',
  knockbackVelocity: { x: 0, y: 0 },
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('ProjectileManager', () => {
  let manager: ProjectileManager;
  let mapData: MapData;

  beforeEach(() => {
    mapData = createMockMapData();
    manager = new ProjectileManager(mapData);
  });

  describe('updatePhysics', () => {
    it('should move projectile based on velocity', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        position: { x: 10, y: 0.5, z: 10 },
        velocity: { x: 10, y: 0 },
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();

      manager.updatePhysics(projectiles, enemies, 100, 100); // 100ms = 0.1s

      // Should have moved 10 * 0.1 = 1 unit in x
      expect(proj.position.x).toBeCloseTo(11, 1);
      expect(proj.position.z).toBe(10);
    });

    it('should remove projectile when lifetime expires', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        lifetime: 500,
        createdAt: 0,
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();

      const result = manager.updatePhysics(projectiles, enemies, 600, 16);

      expect(result.toRemove).toContain('proj-1');
    });

    it('should not remove projectile before lifetime expires', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        lifetime: 1000,
        createdAt: 0,
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();

      const result = manager.updatePhysics(projectiles, enemies, 500, 16);

      expect(result.toRemove).not.toContain('proj-1');
    });

    it('should remove projectile when hitting wall', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        // Position near wall edge (wall at x=0)
        position: { x: 1, y: 0.5, z: 10 },
        velocity: { x: -20, y: 0 }, // Moving toward wall
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();

      // Large dt to ensure projectile moves into wall
      const result = manager.updatePhysics(projectiles, enemies, 100, 200);

      expect(result.toRemove).toContain('proj-1');
    });

    it('should add rocket explosion when rocket hits wall', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        weaponType: 'rocket',
        position: { x: 1, y: 0.5, z: 10 },
        velocity: { x: -20, y: 0 },
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();

      const result = manager.updatePhysics(projectiles, enemies, 100, 200);

      expect(result.toRemove).toContain('proj-1');
      expect(result.rocketExplosions.length).toBe(1);
    });

    it('should add rocket explosion when rocket lifetime expires', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        weaponType: 'rocket',
        lifetime: 500,
        createdAt: 0,
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();

      const result = manager.updatePhysics(projectiles, enemies, 600, 16);

      expect(result.toRemove).toContain('proj-1');
      expect(result.rocketExplosions.length).toBe(1);
    });
  });

  describe('rocket homing', () => {
    it('should steer rocket toward nearest enemy', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        weaponType: 'rocket',
        position: { x: 15, y: 0.5, z: 15 },
        velocity: { x: 10, y: 0 }, // Moving right
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();
      // Enemy is above and to the right
      const enemy = createMockEnemy({
        position: { x: 20, y: 0.5, z: 20 },
      });
      enemies.set(enemy.id, enemy);

      manager.updatePhysics(projectiles, enemies, 100, 16);

      // Velocity should have some positive y component (steering toward enemy)
      expect(proj.velocity.y).toBeGreaterThan(0);
    });

    it('should not home on dead enemies', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        weaponType: 'rocket',
        position: { x: 15, y: 0.5, z: 15 },
        velocity: { x: 10, y: 0 },
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();
      const enemy = createMockEnemy({
        position: { x: 20, y: 0.5, z: 20 },
        state: 'dead',
      });
      enemies.set(enemy.id, enemy);

      manager.updatePhysics(projectiles, enemies, 100, 16);

      // Should not steer toward dead enemy
      expect(proj.velocity.y).toBe(0);
    });

    it('should not home when enemy is out of range', () => {
      const manager = new ProjectileManager(mapData, { homingRange: 5 });

      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        weaponType: 'rocket',
        position: { x: 15, y: 0.5, z: 15 },
        velocity: { x: 10, y: 0 },
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();
      // Enemy is far away (more than 5 units)
      const enemy = createMockEnemy({
        position: { x: 30, y: 0.5, z: 30 },
      });
      enemies.set(enemy.id, enemy);

      manager.updatePhysics(projectiles, enemies, 100, 16);

      // Should not steer toward out-of-range enemy
      expect(proj.velocity.y).toBe(0);
    });

    it('should home on nearest enemy when multiple exist', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        weaponType: 'rocket',
        position: { x: 15, y: 0.5, z: 15 },
        velocity: { x: 10, y: 0 },
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();
      // Far enemy (up and right)
      enemies.set('far', createMockEnemy({
        id: 'far',
        position: { x: 25, y: 0.5, z: 25 },
      }));
      // Near enemy (down and right)
      enemies.set('near', createMockEnemy({
        id: 'near',
        position: { x: 18, y: 0.5, z: 12 },
      }));

      manager.updatePhysics(projectiles, enemies, 100, 16);

      // Should steer toward near enemy (below, so negative y)
      expect(proj.velocity.y).toBeLessThan(0);
    });

    it('should not affect non-rocket projectiles', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        weaponType: 'shotgun',
        position: { x: 15, y: 0.5, z: 15 },
        velocity: { x: 10, y: 0 },
      });
      projectiles.set(proj.id, proj);

      const enemies = new Map<string, EnemyState>();
      const enemy = createMockEnemy({
        position: { x: 20, y: 0.5, z: 20 },
      });
      enemies.set(enemy.id, enemy);

      manager.updatePhysics(projectiles, enemies, 100, 16);

      // Should not steer - non-rocket
      expect(proj.velocity.y).toBe(0);
    });
  });

  describe('markForRemoval', () => {
    it('should return explosion position for rocket', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        weaponType: 'rocket',
        position: { x: 15, y: 0.5, z: 15 },
      });
      projectiles.set(proj.id, proj);

      const result = manager.markForRemoval(proj.id, projectiles);

      expect(result).toEqual({ x: 15, y: 0.5, z: 15 });
    });

    it('should return null for non-rocket', () => {
      const projectiles = new Map<string, ProjectileState>();
      const proj = createMockProjectile({
        weaponType: 'pistol',
        position: { x: 15, y: 0.5, z: 15 },
      });
      projectiles.set(proj.id, proj);

      const result = manager.markForRemoval(proj.id, projectiles);

      expect(result).toBeNull();
    });

    it('should return null for non-existent projectile', () => {
      const projectiles = new Map<string, ProjectileState>();

      const result = manager.markForRemoval('non-existent', projectiles);

      expect(result).toBeNull();
    });
  });

  describe('configuration', () => {
    it('should use custom homing strength', () => {
      const strongHoming = new ProjectileManager(mapData, { homingStrength: 0.5 });
      const weakHoming = new ProjectileManager(mapData, { homingStrength: 0.02 });

      const createTestProjectiles = () => {
        const projectiles = new Map<string, ProjectileState>();
        projectiles.set('proj-1', createMockProjectile({
          weaponType: 'rocket',
          position: { x: 15, y: 0.5, z: 15 },
          velocity: { x: 10, y: 0 },
        }));
        return projectiles;
      };

      const enemies = new Map<string, EnemyState>();
      enemies.set('enemy-1', createMockEnemy({
        position: { x: 20, y: 0.5, z: 20 },
      }));

      const strongProj = createTestProjectiles();
      const weakProj = createTestProjectiles();

      strongHoming.updatePhysics(strongProj, enemies, 100, 16);
      weakHoming.updatePhysics(weakProj, enemies, 100, 16);

      // Strong homing should have steered more
      expect(strongProj.get('proj-1')!.velocity.y).toBeGreaterThan(
        weakProj.get('proj-1')!.velocity.y
      );
    });
  });
});
