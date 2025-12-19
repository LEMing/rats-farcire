import { describe, it, expect } from 'vitest';
import {
  calculateComboMultiplier,
  calculateScore,
  updateComboState,
  ComboState,
  COMBO_CONFIG,
} from '../../src/systems/ScoreUtils';

describe('ScoreUtils', () => {
  describe('calculateComboMultiplier', () => {
    it('should return 1x multiplier for first kill (combo 1)', () => {
      const multiplier = calculateComboMultiplier(1);
      expect(multiplier).toBe(1);
    });

    it('should increase multiplier with combo count', () => {
      const combo5 = calculateComboMultiplier(5);
      const combo10 = calculateComboMultiplier(10);

      expect(combo10).toBeGreaterThan(combo5);
    });

    it('should apply score multiplier constant correctly', () => {
      // At combo 2: 1 + (2-1) * 0.5 = 1.5
      const combo2 = calculateComboMultiplier(2);
      expect(combo2).toBeCloseTo(1 + COMBO_CONFIG.scoreMultiplier, 5);

      // At combo 3: 1 + (3-1) * 0.5 = 2.0
      const combo3 = calculateComboMultiplier(3);
      expect(combo3).toBeCloseTo(2, 5);
    });

    it('should handle zero combo (edge case)', () => {
      const multiplier = calculateComboMultiplier(0);
      // 1 + (0-1) * 0.1 = 0.9, but should never happen in practice
      expect(multiplier).toBeLessThan(1);
    });

    it('should handle large combo counts', () => {
      const largeCombo = calculateComboMultiplier(100);
      expect(Number.isFinite(largeCombo)).toBe(true);
      expect(largeCombo).toBeGreaterThan(1);
    });
  });

  describe('calculateScore', () => {
    it('should return base score with no combo', () => {
      const score = calculateScore(100, 1);
      expect(score).toBe(100);
    });

    it('should apply combo multiplier', () => {
      const noCombo = calculateScore(100, 1);
      const withCombo = calculateScore(100, 10);

      expect(withCombo).toBeGreaterThan(noCombo);
    });

    it('should floor the result', () => {
      // At combo 2: 100 * 1.5 = 150 (no rounding needed)
      const score2 = calculateScore(100, 2);
      expect(score2).toBe(150);

      // At combo 3: 100 * 2.0 = 200
      const score3 = calculateScore(100, 3);
      expect(score3).toBe(200);

      // Test with odd base: 33 * 1.5 = 49.5 -> 49
      const oddScore = calculateScore(33, 2);
      expect(oddScore).toBe(49);
    });

    it('should handle zero base score', () => {
      const score = calculateScore(0, 10);
      expect(score).toBe(0);
    });
  });

  describe('updateComboState', () => {
    it('should increment combo count on kill', () => {
      const state: ComboState = { comboCount: 0, comboTimer: 0, maxCombo: 0 };

      const result = updateComboState(state, 'kill');

      expect(result.comboCount).toBe(1);
    });

    it('should reset combo timer on kill', () => {
      const state: ComboState = { comboCount: 5, comboTimer: 500, maxCombo: 5 };

      const result = updateComboState(state, 'kill');

      expect(result.comboTimer).toBe(COMBO_CONFIG.timeout);
      expect(result.comboCount).toBe(6);
    });

    it('should update max combo on new high', () => {
      const state: ComboState = { comboCount: 5, comboTimer: 1000, maxCombo: 5 };

      const result = updateComboState(state, 'kill');

      expect(result.maxCombo).toBe(6);
    });

    it('should not reduce max combo', () => {
      const state: ComboState = { comboCount: 2, comboTimer: 1000, maxCombo: 10 };

      const result = updateComboState(state, 'kill');

      expect(result.maxCombo).toBe(10);
      expect(result.comboCount).toBe(3);
    });

    it('should decay timer on tick', () => {
      const state: ComboState = { comboCount: 5, comboTimer: 1000, maxCombo: 5 };

      const result = updateComboState(state, 'tick', 100);

      expect(result.comboTimer).toBe(900);
      expect(result.comboCount).toBe(5); // Unchanged
    });

    it('should reset combo when timer expires', () => {
      const state: ComboState = { comboCount: 5, comboTimer: 50, maxCombo: 5 };

      const result = updateComboState(state, 'tick', 100);

      expect(result.comboTimer).toBe(0);
      expect(result.comboCount).toBe(0);
    });

    it('should not go below zero timer', () => {
      const state: ComboState = { comboCount: 0, comboTimer: 0, maxCombo: 5 };

      const result = updateComboState(state, 'tick', 100);

      expect(result.comboTimer).toBe(0);
      expect(result.comboCount).toBe(0);
    });

    it('should preserve max combo on reset', () => {
      const state: ComboState = { comboCount: 5, comboTimer: 10, maxCombo: 8 };

      const result = updateComboState(state, 'tick', 50);

      expect(result.maxCombo).toBe(8);
      expect(result.comboCount).toBe(0);
    });
  });

  describe('COMBO_CONFIG', () => {
    it('should have reasonable timeout', () => {
      expect(COMBO_CONFIG.timeout).toBeGreaterThan(0);
      expect(COMBO_CONFIG.timeout).toBeLessThan(10000); // Less than 10 seconds
    });

    it('should have reasonable score multiplier', () => {
      expect(COMBO_CONFIG.scoreMultiplier).toBeGreaterThan(0);
      expect(COMBO_CONFIG.scoreMultiplier).toBeLessThan(1);
    });
  });
});
