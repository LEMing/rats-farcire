import { describe, it, expect } from 'vitest';
import {
  calculateKnockback,
  processKnockback,
  KnockbackState,
  KNOCKBACK_CONFIG,
} from '../../src/systems/KnockbackUtils';
import type { Vec2 } from '../../shared/types';

describe('KnockbackUtils', () => {
  describe('calculateKnockback', () => {
    it('should calculate knockback direction from source to target', () => {
      const source = { x: 0, y: 0 };
      const target = { x: 10, y: 0 };
      const force = 5;

      const result = calculateKnockback(source, target, force);

      // Should push target away from source (positive X direction)
      expect(result.x).toBeCloseTo(5, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('should handle diagonal knockback', () => {
      const source = { x: 0, y: 0 };
      const target = { x: 5, y: 5 };
      const force = Math.sqrt(2); // Force that results in 1,1 velocity

      const result = calculateKnockback(source, target, force);

      // Should push diagonally (normalized * force)
      expect(result.x).toBeCloseTo(1, 5);
      expect(result.y).toBeCloseTo(1, 5);
    });

    it('should handle negative coordinates', () => {
      const source = { x: 5, y: 5 };
      const target = { x: 0, y: 0 };
      const force = 5;

      const result = calculateKnockback(source, target, force);

      // Should push toward negative direction
      expect(result.x).toBeLessThan(0);
      expect(result.y).toBeLessThan(0);
    });

    it('should return zero velocity when source and target are same position', () => {
      const source = { x: 5, y: 5 };
      const target = { x: 5, y: 5 };
      const force = 10;

      const result = calculateKnockback(source, target, force);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('should scale knockback by force multiplier', () => {
      const source = { x: 0, y: 0 };
      const target = { x: 10, y: 0 };

      const weak = calculateKnockback(source, target, 2);
      const strong = calculateKnockback(source, target, 10);

      expect(strong.x).toBeGreaterThan(weak.x);
      expect(strong.x).toBeCloseTo(weak.x * 5, 5); // 10/2 = 5x stronger
    });
  });

  describe('processKnockback', () => {
    const mockWallChecker = (x: number, z: number): boolean => {
      // Simple wall: block positions where x < 0 or z < 0
      return x >= 0 && z >= 0;
    };

    it('should move entity based on knockback velocity', () => {
      const state: KnockbackState = {
        position: { x: 5, y: 5 },
        velocity: { x: 10, y: 0 },
      };
      const dt = 0.1; // 100ms

      const result = processKnockback(state, dt, mockWallChecker);

      // Position should move: 5 + 10 * 0.1 = 6
      expect(result.position.x).toBeCloseTo(6, 5);
      expect(result.position.y).toBe(5);
    });

    it('should decay knockback velocity', () => {
      const state: KnockbackState = {
        position: { x: 5, y: 5 },
        velocity: { x: 10, y: 10 },
      };

      const result = processKnockback(state, 0.016, mockWallChecker);

      // Velocity should decay by decay factor (0.85)
      expect(result.velocity.x).toBeCloseTo(10 * KNOCKBACK_CONFIG.decayRate, 5);
      expect(result.velocity.y).toBeCloseTo(10 * KNOCKBACK_CONFIG.decayRate, 5);
    });

    it('should zero out small velocities', () => {
      const state: KnockbackState = {
        position: { x: 5, y: 5 },
        velocity: { x: 0.05, y: 0.05 }, // Below threshold
      };

      const result = processKnockback(state, 0.016, mockWallChecker);

      // Small velocities should be zeroed
      expect(result.velocity.x).toBe(0);
      expect(result.velocity.y).toBe(0);
    });

    it('should stop movement at walls (X axis)', () => {
      const state: KnockbackState = {
        position: { x: 0.5, y: 5 },
        velocity: { x: -10, y: 0 }, // Moving toward wall at x < 0
      };

      const result = processKnockback(state, 0.1, mockWallChecker);

      // X movement should be blocked, velocity zeroed
      expect(result.position.x).toBe(0.5);
      expect(result.velocity.x).toBe(0);
      // Y should still be processed normally
      expect(result.velocity.y).toBe(0); // Was 0, stays 0
    });

    it('should stop movement at walls (Y axis)', () => {
      const state: KnockbackState = {
        position: { x: 5, y: 0.5 },
        velocity: { x: 0, y: -10 }, // Moving toward wall at y < 0
      };

      const result = processKnockback(state, 0.1, mockWallChecker);

      // Y movement should be blocked
      expect(result.position.y).toBe(0.5);
      expect(result.velocity.y).toBe(0);
    });

    it('should handle diagonal wall collision independently', () => {
      const state: KnockbackState = {
        position: { x: 0.5, y: 0.5 },
        velocity: { x: -10, y: 10 }, // X blocked, Y allowed
      };

      const result = processKnockback(state, 0.1, mockWallChecker);

      // X blocked
      expect(result.position.x).toBe(0.5);
      expect(result.velocity.x).toBe(0);
      // Y should move normally
      expect(result.position.y).toBeCloseTo(1.5, 5);
    });

    it('should return same position when velocity is zero', () => {
      const state: KnockbackState = {
        position: { x: 5, y: 5 },
        velocity: { x: 0, y: 0 },
      };

      const result = processKnockback(state, 0.1, mockWallChecker);

      expect(result.position.x).toBe(5);
      expect(result.position.y).toBe(5);
      expect(result.velocity.x).toBe(0);
      expect(result.velocity.y).toBe(0);
    });

    it('should handle no wall checker (always walkable)', () => {
      const state: KnockbackState = {
        position: { x: 0, y: 0 },
        velocity: { x: -10, y: -10 },
      };

      const alwaysWalkable = () => true;
      const result = processKnockback(state, 0.1, alwaysWalkable);

      // Should move freely into negative space
      expect(result.position.x).toBeCloseTo(-1, 5);
      expect(result.position.y).toBeCloseTo(-1, 5);
    });
  });

  describe('KNOCKBACK_CONFIG', () => {
    it('should have reasonable decay rate', () => {
      expect(KNOCKBACK_CONFIG.decayRate).toBeGreaterThan(0);
      expect(KNOCKBACK_CONFIG.decayRate).toBeLessThan(1);
    });

    it('should have reasonable zero threshold', () => {
      expect(KNOCKBACK_CONFIG.zeroThreshold).toBeGreaterThan(0);
      expect(KNOCKBACK_CONFIG.zeroThreshold).toBeLessThan(1);
    });
  });
});
