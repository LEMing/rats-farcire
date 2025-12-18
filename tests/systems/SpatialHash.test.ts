import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHash, SpatialEntity } from '../../src/systems/SpatialHash';

describe('SpatialHash', () => {
  let spatialHash: SpatialHash<SpatialEntity>;

  beforeEach(() => {
    spatialHash = new SpatialHash(4); // 4 unit cell size
  });

  describe('insert and getNearby', () => {
    it('should find entities within range', () => {
      const entity: SpatialEntity = { id: 'e1', x: 5, z: 5, radius: 1 };
      spatialHash.insert(entity);

      const nearby = spatialHash.getNearby(5, 5, 2);
      expect(nearby).toHaveLength(1);
      expect(nearby[0].id).toBe('e1');
    });

    it('should not find entities outside range', () => {
      const entity: SpatialEntity = { id: 'e1', x: 100, z: 100, radius: 1 };
      spatialHash.insert(entity);

      const nearby = spatialHash.getNearby(5, 5, 2);
      expect(nearby).toHaveLength(0);
    });

    it('should find multiple entities in same cell', () => {
      spatialHash.insert({ id: 'e1', x: 5, z: 5, radius: 1 });
      spatialHash.insert({ id: 'e2', x: 6, z: 6, radius: 1 });

      const nearby = spatialHash.getNearby(5.5, 5.5, 3);
      expect(nearby).toHaveLength(2);
    });

    it('should find entities across cell boundaries', () => {
      // Entity in one cell
      spatialHash.insert({ id: 'e1', x: 3, z: 3, radius: 1 });
      // Entity in adjacent cell
      spatialHash.insert({ id: 'e2', x: 5, z: 3, radius: 1 });

      // Query that spans both cells
      const nearby = spatialHash.getNearby(4, 3, 2);
      expect(nearby).toHaveLength(2);
    });
  });

  describe('remove', () => {
    it('should remove entity from hash', () => {
      const entity: SpatialEntity = { id: 'e1', x: 5, z: 5, radius: 1 };
      spatialHash.insert(entity);
      spatialHash.remove('e1');

      const nearby = spatialHash.getNearby(5, 5, 10);
      expect(nearby).toHaveLength(0);
    });

    it('should not affect other entities when removing one', () => {
      spatialHash.insert({ id: 'e1', x: 5, z: 5, radius: 1 });
      spatialHash.insert({ id: 'e2', x: 6, z: 6, radius: 1 });
      spatialHash.remove('e1');

      const nearby = spatialHash.getNearby(6, 6, 2);
      expect(nearby).toHaveLength(1);
      expect(nearby[0].id).toBe('e2');
    });

    it('should handle removing non-existent entity gracefully', () => {
      expect(() => spatialHash.remove('nonexistent')).not.toThrow();
    });
  });

  describe('update', () => {
    it('should update entity position', () => {
      spatialHash.insert({ id: 'e1', x: 5, z: 5, radius: 1 });

      // Move entity far away
      spatialHash.update({ id: 'e1', x: 100, z: 100, radius: 1 });

      // Should not find at old position
      const nearbyOld = spatialHash.getNearby(5, 5, 2);
      expect(nearbyOld).toHaveLength(0);

      // Should find at new position
      const nearbyNew = spatialHash.getNearby(100, 100, 2);
      expect(nearbyNew).toHaveLength(1);
      expect(nearbyNew[0].id).toBe('e1');
    });
  });

  describe('clear', () => {
    it('should remove all entities', () => {
      spatialHash.insert({ id: 'e1', x: 5, z: 5, radius: 1 });
      spatialHash.insert({ id: 'e2', x: 50, z: 50, radius: 1 });
      spatialHash.clear();

      expect(spatialHash.getEntityCount()).toBe(0);
      expect(spatialHash.getCellCount()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle entities at origin', () => {
      spatialHash.insert({ id: 'e1', x: 0, z: 0, radius: 1 });

      const nearby = spatialHash.getNearby(0, 0, 2);
      expect(nearby).toHaveLength(1);
    });

    it('should handle negative coordinates', () => {
      spatialHash.insert({ id: 'e1', x: -10, z: -10, radius: 1 });

      const nearby = spatialHash.getNearby(-10, -10, 2);
      expect(nearby).toHaveLength(1);
    });

    it('should handle large radius entities spanning multiple cells', () => {
      // Entity with large radius spans multiple cells
      spatialHash.insert({ id: 'e1', x: 0, z: 0, radius: 10 });

      // Should be found from any position within radius
      const nearby1 = spatialHash.getNearby(8, 0, 1);
      expect(nearby1).toHaveLength(1);

      const nearby2 = spatialHash.getNearby(0, 8, 1);
      expect(nearby2).toHaveLength(1);
    });

    it('should not return duplicates for entity in multiple cells', () => {
      // Large radius entity spans multiple cells
      spatialHash.insert({ id: 'e1', x: 4, z: 4, radius: 5 });

      // Query that overlaps multiple cells
      const nearby = spatialHash.getNearby(4, 4, 10);
      expect(nearby).toHaveLength(1);
    });
  });

  describe('performance characteristics', () => {
    it('should handle many entities efficiently', () => {
      // Insert 1000 entities
      for (let i = 0; i < 1000; i++) {
        spatialHash.insert({
          id: `e${i}`,
          x: Math.random() * 100,
          z: Math.random() * 100,
          radius: 1,
        });
      }

      expect(spatialHash.getEntityCount()).toBe(1000);

      // Query should still be fast (only checks nearby cells)
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        spatialHash.getNearby(50, 50, 5);
      }
      const elapsed = performance.now() - start;

      // Should complete 100 queries in under 50ms
      expect(elapsed).toBeLessThan(50);
    });
  });
});
