import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LastStandSystem, LastStandCallbacks } from '../../src/systems/LastStandSystem';
import type { PlayerState } from '../../shared/types';

// ============================================================================
// Test Helpers
// ============================================================================

const createMockPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player-1',
  type: 'player',
  position: { x: 10, y: 0.5, z: 10 },
  rotation: 0,
  velocity: { x: 5, y: 3 },
  health: 0,
  maxHealth: 100,
  ammo: 50,
  score: 0,
  isDead: false,
  lastShootTime: 0,
  currentWeapon: 'pistol',
  unlockedWeapons: ['pistol'],
  thermobaricCooldown: 0,
  dashCooldown: 1000,
  isDashing: false,
  dashDirection: { x: 0, y: 0 },
  dashStartTime: 0,
  comboCount: 0,
  comboTimer: 0,
  maxCombo: 0,
  powerUps: {},
  carryingCellId: null,
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('LastStandSystem', () => {
  let system: LastStandSystem;
  let callbacks: LastStandCallbacks;

  beforeEach(() => {
    callbacks = {
      onLastStandStart: vi.fn(),
      onLastStandKill: vi.fn(),
      onLastStandSuccess: vi.fn(),
      onLastStandFail: vi.fn(),
    };
    system = new LastStandSystem({}, callbacks);
  });

  describe('tryTrigger', () => {
    it('should activate Last Stand on first trigger', () => {
      const result = system.tryTrigger(1000);

      expect(result).toBe(true);
      expect(system.isActive()).toBe(true);
      expect(callbacks.onLastStandStart).toHaveBeenCalled();
    });

    it('should not activate Last Stand if already used', () => {
      system.tryTrigger(1000);
      const result = system.tryTrigger(2000);

      expect(result).toBe(false);
      expect(callbacks.onLastStandStart).toHaveBeenCalledTimes(1);
    });

    it('should initialize state correctly', () => {
      system.tryTrigger(1000);
      const state = system.getState();

      expect(state.isActive).toBe(true);
      expect(state.wasUsed).toBe(true);
      expect(state.kills).toBe(0);
      expect(state.startTime).toBe(1000);
    });
  });

  describe('update', () => {
    it('should return inactive when not triggered', () => {
      const result = system.update(1000, 16);
      expect(result).toBe('inactive');
    });

    it('should return active during Last Stand', () => {
      system.tryTrigger(1000);
      const result = system.update(1500, 16);
      expect(result).toBe('active');
    });

    it('should track time remaining', () => {
      system.tryTrigger(1000);
      system.update(3000, 16);
      const state = system.getState();

      expect(state.timeRemaining).toBe(3000); // 5000 - 2000 elapsed
    });

    it('should return fail when time expires', () => {
      system.tryTrigger(1000);
      const result = system.update(6001, 16);

      expect(result).toBe('fail');
      expect(system.isActive()).toBe(false);
      expect(callbacks.onLastStandFail).toHaveBeenCalled();
    });

    it('should return success when kill requirement met', () => {
      system.tryTrigger(1000);

      // Register 3 kills
      for (let i = 0; i < 3; i++) {
        system.registerKill();
      }

      const result = system.update(2000, 16);

      expect(result).toBe('success');
      expect(system.isActive()).toBe(false);
      expect(callbacks.onLastStandSuccess).toHaveBeenCalled();
    });
  });

  describe('registerKill', () => {
    it('should increment kill count during Last Stand', () => {
      system.tryTrigger(1000);
      system.registerKill();

      expect(system.getState().kills).toBe(1);
      expect(callbacks.onLastStandKill).toHaveBeenCalledWith(1, 3);
    });

    it('should not increment when Last Stand is inactive', () => {
      system.registerKill();

      expect(system.getState().kills).toBe(0);
      expect(callbacks.onLastStandKill).not.toHaveBeenCalled();
    });

    it('should trigger success after 3 kills', () => {
      system.tryTrigger(1000);

      for (let i = 0; i < 3; i++) {
        system.registerKill();
      }

      system.update(2000, 16);

      expect(callbacks.onLastStandSuccess).toHaveBeenCalled();
    });
  });

  describe('applyEffects', () => {
    it('should freeze player movement', () => {
      const player = createMockPlayer({ velocity: { x: 10, y: 5 } });
      system.tryTrigger(1000);

      system.applyEffects(player);

      expect(player.velocity).toEqual({ x: 0, y: 0 });
    });

    it('should cancel dashing', () => {
      const player = createMockPlayer({ isDashing: true });
      system.tryTrigger(1000);

      system.applyEffects(player);

      expect(player.isDashing).toBe(false);
    });

    it('should not affect player when inactive', () => {
      const player = createMockPlayer({ velocity: { x: 10, y: 5 } });

      system.applyEffects(player);

      expect(player.velocity).toEqual({ x: 10, y: 5 });
    });
  });

  describe('applySuccessEffects', () => {
    it('should restore player health', () => {
      const player = createMockPlayer({ health: 0 });

      system.applySuccessEffects(player);

      expect(player.health).toBe(25);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      system.tryTrigger(1000);
      system.registerKill();

      system.reset();

      expect(system.isActive()).toBe(false);
      expect(system.wasUsed()).toBe(false);
      expect(system.getState().kills).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should use custom duration', () => {
      const customSystem = new LastStandSystem({ duration: 3000 }, {});
      customSystem.tryTrigger(1000);

      customSystem.update(4001, 16);

      expect(customSystem.isActive()).toBe(false);
    });

    it('should use custom kill requirement', () => {
      const customSystem = new LastStandSystem({ killsRequired: 3 }, callbacks);
      customSystem.tryTrigger(1000);

      for (let i = 0; i < 3; i++) {
        customSystem.registerKill();
      }

      customSystem.update(2000, 16);

      expect(callbacks.onLastStandSuccess).toHaveBeenCalled();
    });

    it('should use custom health restored', () => {
      const customSystem = new LastStandSystem({ healthRestored: 50 }, {});
      const player = createMockPlayer({ health: 0 });

      customSystem.applySuccessEffects(player);

      expect(player.health).toBe(50);
    });
  });
});
