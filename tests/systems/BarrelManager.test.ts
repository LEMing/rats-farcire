import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BarrelManager, BarrelManagerCallbacks } from '../../src/systems/BarrelManager';
import type { ProjectileState, Vec3 } from '../../shared/types';

// ============================================================================
// Test Helpers
// ============================================================================

const createMockProjectile = (position: Vec3): ProjectileState => ({
  id: 'projectile-1',
  type: 'projectile',
  position,
  rotation: 0,
  velocity: { x: 10, y: 0 },
  ownerId: 'player-1',
  damage: 25,
  lifetime: 2000,
  createdAt: 0,
});

// ============================================================================
// Tests
// ============================================================================

describe('BarrelManager', () => {
  let manager: BarrelManager;
  let callbacks: BarrelManagerCallbacks;

  beforeEach(() => {
    callbacks = {
      onBarrelExplode: vi.fn(),
    };
    manager = new BarrelManager({}, callbacks);
  });

  describe('spawnBarrel', () => {
    it('should create a barrel with correct properties', () => {
      const position = { x: 5, y: 0.5, z: 10 };
      const barrel = manager.spawnBarrel(position);

      expect(barrel.id).toBe('barrel-0');
      expect(barrel.position).toEqual(position);
      expect(barrel.health).toBe(1);
      expect(barrel.isExploding).toBe(false);
    });

    it('should increment barrel IDs', () => {
      const barrel1 = manager.spawnBarrel({ x: 0, y: 0, z: 0 });
      const barrel2 = manager.spawnBarrel({ x: 1, y: 0, z: 1 });

      expect(barrel1.id).toBe('barrel-0');
      expect(barrel2.id).toBe('barrel-1');
    });

    it('should add barrel to collection', () => {
      manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });

      expect(manager.getBarrelCount()).toBe(1);
      expect(manager.getBarrels().size).toBe(1);
    });
  });

  describe('checkProjectileCollision', () => {
    it('should detect collision when projectile hits barrel', () => {
      const barrelPos = { x: 5, y: 0.5, z: 10 };
      manager.spawnBarrel(barrelPos);

      const projectile = createMockProjectile({ x: 5.2, y: 0.5, z: 10 });
      const hitBarrel = manager.checkProjectileCollision(projectile);

      expect(hitBarrel).not.toBeNull();
      expect(hitBarrel?.position).toEqual(barrelPos);
    });

    it('should return null when projectile misses', () => {
      manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });

      const projectile = createMockProjectile({ x: 20, y: 0.5, z: 20 });
      const hitBarrel = manager.checkProjectileCollision(projectile);

      expect(hitBarrel).toBeNull();
    });

    it('should not detect collision with exploding barrels', () => {
      const barrel = manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.explodeBarrel(barrel.id, 0);

      const projectile = createMockProjectile({ x: 5.2, y: 0.5, z: 10 });
      const hitBarrel = manager.checkProjectileCollision(projectile);

      expect(hitBarrel).toBeNull();
    });
  });

  describe('explodeBarrel', () => {
    it('should return explosion result with correct properties', () => {
      const barrel = manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      const result = manager.explodeBarrel(barrel.id, 1000);

      expect(result).not.toBeNull();
      expect(result?.position).toEqual({ x: 5, y: 0.5, z: 10 });
      expect(result?.radius).toBe(4); // default config
      expect(result?.damage).toBe(80); // default config
      expect(result?.knockbackForce).toBe(15); // default config
    });

    it('should remove barrel after explosion', () => {
      const barrel = manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.explodeBarrel(barrel.id, 1000);

      expect(manager.getBarrelCount()).toBe(0);
      expect(manager.getBarrel(barrel.id)).toBeUndefined();
    });

    it('should fire callback on explosion', () => {
      const barrel = manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.explodeBarrel(barrel.id, 1000);

      expect(callbacks.onBarrelExplode).toHaveBeenCalledTimes(1);
    });

    it('should return null for non-existent barrel', () => {
      const result = manager.explodeBarrel('fake-id', 1000);
      expect(result).toBeNull();
    });

    it('should return null for already exploding barrel', () => {
      const barrel = manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.explodeBarrel(barrel.id, 1000);

      // Try to explode again (barrel is already removed)
      const result = manager.explodeBarrel(barrel.id, 1000);
      expect(result).toBeNull();
    });
  });

  describe('chain reactions', () => {
    it('should queue nearby barrels for chain reaction', () => {
      const barrel1 = manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.spawnBarrel({ x: 7, y: 0.5, z: 10 }); // Within chain radius

      const result = manager.explodeBarrel(barrel1.id, 1000);

      expect(result?.chainTriggeredBarrelIds).toHaveLength(1);
    });

    it('should not chain to distant barrels', () => {
      const barrel1 = manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.spawnBarrel({ x: 50, y: 0.5, z: 50 }); // Far away

      const result = manager.explodeBarrel(barrel1.id, 1000);

      expect(result?.chainTriggeredBarrelIds).toHaveLength(0);
    });

    it('should trigger chain reactions after delay', () => {
      const barrel1 = manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.spawnBarrel({ x: 7, y: 0.5, z: 10 });

      manager.explodeBarrel(barrel1.id, 1000);

      // Before delay
      let explosions = manager.update(1050);
      expect(explosions).toHaveLength(0);

      // After delay (100ms default)
      explosions = manager.update(1100);
      expect(explosions).toHaveLength(1);
    });

    it('should cascade multiple chain reactions', () => {
      // Line of barrels
      manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.spawnBarrel({ x: 8, y: 0.5, z: 10 });
      manager.spawnBarrel({ x: 11, y: 0.5, z: 10 });

      // Explode first
      manager.explodeBarrel('barrel-0', 1000);

      // First chain reaction
      let explosions = manager.update(1100);
      expect(explosions).toHaveLength(1);

      // Second chain reaction
      explosions = manager.update(1200);
      expect(explosions).toHaveLength(1);

      // All barrels gone
      expect(manager.getBarrelCount()).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should use custom explosion radius', () => {
      const customManager = new BarrelManager({ explosionRadius: 8 }, {});
      const barrel = customManager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      const result = customManager.explodeBarrel(barrel.id, 1000);

      expect(result?.radius).toBe(8);
    });

    it('should use custom damage', () => {
      const customManager = new BarrelManager({ enemyDamage: 100 }, {});
      const barrel = customManager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      const result = customManager.explodeBarrel(barrel.id, 1000);

      expect(result?.damage).toBe(100);
    });

    it('should return player damage separately', () => {
      const customManager = new BarrelManager({ playerDamage: 50 }, {});
      expect(customManager.getPlayerDamage()).toBe(50);
    });
  });

  describe('clear', () => {
    it('should remove all barrels', () => {
      manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.spawnBarrel({ x: 10, y: 0.5, z: 15 });

      manager.clear();

      expect(manager.getBarrelCount()).toBe(0);
    });

    it('should reset barrel ID counter', () => {
      manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.clear();

      const barrel = manager.spawnBarrel({ x: 10, y: 0.5, z: 15 });
      expect(barrel.id).toBe('barrel-0');
    });

    it('should clear pending chain reactions', () => {
      const barrel1 = manager.spawnBarrel({ x: 5, y: 0.5, z: 10 });
      manager.spawnBarrel({ x: 7, y: 0.5, z: 10 });

      manager.explodeBarrel(barrel1.id, 1000);
      manager.clear();

      // Chain reaction should not trigger
      const explosions = manager.update(1200);
      expect(explosions).toHaveLength(0);
    });
  });
});
