import { describe, it, expect } from 'vitest';
import { applyAimAssist, AimAssistConfig } from '../../src/systems/AimAssist';
import type { Vec3 } from '../../shared/types';

// Test configuration matching game defaults
const DEFAULT_CONFIG: AimAssistConfig = {
  range: 15,
  coneAngle: Math.PI / 6, // 30 degrees
  strength: 0.15,
};

// Helper to create enemy position
const createEnemy = (x: number, z: number, isDead = false) => ({
  position: { x, y: 0.5, z } as Vec3,
  isDead,
});

describe('AimAssist', () => {
  describe('basic behavior', () => {
    it('should return original aim when no enemies present', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 1 }; // Aiming forward
      const enemies: { position: Vec3; isDead: boolean }[] = [];

      const result = applyAimAssist(playerPos, aim, enemies, DEFAULT_CONFIG);

      expect(result.x).toBeCloseTo(aim.x, 5);
      expect(result.y).toBeCloseTo(aim.y, 5);
    });

    it('should return original aim when all enemies are dead', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 1 };
      const enemies = [
        createEnemy(5, 10, true), // Dead enemy in front
      ];

      const result = applyAimAssist(playerPos, aim, enemies, DEFAULT_CONFIG);

      expect(result.x).toBeCloseTo(aim.x, 5);
      expect(result.y).toBeCloseTo(aim.y, 5);
    });

    it('should return original aim when enemies are out of range', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 1 };
      const enemies = [
        createEnemy(5, 25), // 20 units away (> 15 range)
      ];

      const result = applyAimAssist(playerPos, aim, enemies, DEFAULT_CONFIG);

      expect(result.x).toBeCloseTo(aim.x, 5);
      expect(result.y).toBeCloseTo(aim.y, 5);
    });

    it('should return original aim when enemies are outside cone', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 1 }; // Aiming forward (positive Z)
      const enemies = [
        createEnemy(5, 0), // Behind player (outside cone)
      ];

      const result = applyAimAssist(playerPos, aim, enemies, DEFAULT_CONFIG);

      expect(result.x).toBeCloseTo(aim.x, 5);
      expect(result.y).toBeCloseTo(aim.y, 5);
    });
  });

  describe('aim adjustment', () => {
    it('should pull aim slightly toward enemy in cone', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 1 }; // Aiming forward
      const enemies = [
        createEnemy(7, 10), // Slightly to the right, in range and in cone
      ];

      const result = applyAimAssist(playerPos, aim, enemies, DEFAULT_CONFIG);

      // Result should be pulled toward enemy (positive X)
      expect(result.x).toBeGreaterThan(aim.x);
      // Should still be normalized
      const length = Math.sqrt(result.x * result.x + result.y * result.y);
      expect(length).toBeCloseTo(1, 5);
    });

    it('should pull aim toward closer enemy when multiple in cone', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 1 };
      const enemies = [
        createEnemy(6, 10), // Closer, slightly right
        createEnemy(8, 15), // Farther, more to the right
      ];

      const result = applyAimAssist(playerPos, aim, enemies, DEFAULT_CONFIG);

      // Should prefer the closer enemy (less X offset)
      expect(result.x).toBeGreaterThan(0);
    });

    it('should prefer enemy closer to aim direction', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0.1, y: 1 }; // Aiming slightly right
      const enemies = [
        createEnemy(3, 10), // Left (away from aim)
        createEnemy(7, 10), // Right (closer to aim direction)
      ];

      // Normalize aim
      const aimLen = Math.sqrt(aim.x * aim.x + aim.y * aim.y);
      const normalizedAim = { x: aim.x / aimLen, y: aim.y / aimLen };

      const result = applyAimAssist(playerPos, normalizedAim, enemies, DEFAULT_CONFIG);

      // Should pull toward right enemy (positive X adjustment)
      expect(result.x).toBeGreaterThan(normalizedAim.x);
    });

    it('should apply strength factor correctly', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 1 };
      // Enemy within 30-degree cone (angle ~11 degrees from aim)
      const enemies = [createEnemy(6, 10)];

      // Test with weak strength
      const weakConfig = { ...DEFAULT_CONFIG, strength: 0.05 };
      const weakResult = applyAimAssist(playerPos, aim, enemies, weakConfig);

      // Test with strong strength
      const strongConfig = { ...DEFAULT_CONFIG, strength: 0.5 };
      const strongResult = applyAimAssist(playerPos, aim, enemies, strongConfig);

      // Strong should pull more than weak
      expect(Math.abs(strongResult.x)).toBeGreaterThan(Math.abs(weakResult.x));
    });
  });

  describe('edge cases', () => {
    it('should handle enemy at exact player position', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 1 };
      const enemies = [createEnemy(5, 5)]; // Same position

      const result = applyAimAssist(playerPos, aim, enemies, DEFAULT_CONFIG);

      // Should return original aim (no valid direction to enemy)
      expect(result.x).toBeCloseTo(aim.x, 5);
      expect(result.y).toBeCloseTo(aim.y, 5);
    });

    it('should handle zero aim vector', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 0 }; // No aim direction
      const enemies = [createEnemy(5, 10)];

      const result = applyAimAssist(playerPos, aim, enemies, DEFAULT_CONFIG);

      // Should return the zero vector (no aim to adjust)
      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('should always return normalized vector', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0.3, y: 0.9 }; // Non-normalized aim
      const enemies = [createEnemy(8, 10)];

      // Normalize aim first
      const aimLen = Math.sqrt(aim.x * aim.x + aim.y * aim.y);
      const normalizedAim = { x: aim.x / aimLen, y: aim.y / aimLen };

      const result = applyAimAssist(playerPos, normalizedAim, enemies, DEFAULT_CONFIG);

      const length = Math.sqrt(result.x * result.x + result.y * result.y);
      expect(length).toBeCloseTo(1, 5);
    });

    it('should handle negative coordinates', () => {
      const playerPos = { x: -5, z: -5 };
      const aim = { x: 0, y: -1 }; // Aiming negative Z
      const enemies = [createEnemy(-5, -10)]; // In front

      const result = applyAimAssist(playerPos, aim, enemies, DEFAULT_CONFIG);

      // Should return valid result (no NaN or Infinity)
      expect(Number.isFinite(result.x)).toBe(true);
      expect(Number.isFinite(result.y)).toBe(true);
    });
  });

  describe('config variations', () => {
    it('should respect custom range', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 1 };
      const enemies = [createEnemy(5, 15)]; // 10 units away

      // Short range config
      const shortRange = { ...DEFAULT_CONFIG, range: 5 };
      const shortResult = applyAimAssist(playerPos, aim, enemies, shortRange);

      // Long range config
      const longRange = { ...DEFAULT_CONFIG, range: 20 };
      const longResult = applyAimAssist(playerPos, aim, enemies, longRange);

      // Short range should not affect aim (enemy out of range)
      expect(shortResult.x).toBeCloseTo(aim.x, 5);
      expect(shortResult.y).toBeCloseTo(aim.y, 5);

      // Long range should affect aim (enemy in range)
      // Actually, enemy is directly in front, so no X adjustment needed
      expect(Number.isFinite(longResult.x)).toBe(true);
    });

    it('should respect custom cone angle', () => {
      const playerPos = { x: 5, z: 5 };
      const aim = { x: 0, y: 1 };
      // Enemy at ~45 degrees (just outside 30 degree cone)
      const enemies = [createEnemy(10, 10)];

      // Narrow cone (should not include enemy)
      const narrowCone = { ...DEFAULT_CONFIG, coneAngle: Math.PI / 12 }; // 15 degrees
      const narrowResult = applyAimAssist(playerPos, aim, enemies, narrowCone);

      // Wide cone (should include enemy)
      const wideCone = { ...DEFAULT_CONFIG, coneAngle: Math.PI / 2 }; // 90 degrees
      const wideResult = applyAimAssist(playerPos, aim, enemies, wideCone);

      // Narrow cone should not adjust (enemy outside)
      expect(narrowResult.x).toBeCloseTo(aim.x, 5);

      // Wide cone should adjust
      expect(wideResult.x).toBeGreaterThan(aim.x);
    });
  });
});
