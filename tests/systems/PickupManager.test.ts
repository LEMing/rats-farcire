import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PickupManager, PickupManagerCallbacks } from '../../src/systems/PickupManager';
import type { PickupState, PlayerState, Vec3 } from '../../shared/types';
import {
  HEALTH_PACK_VALUE,
  AMMO_PACK_VALUE,
  POWERUP_DURATION,
  WEAPON_SLOT_ORDER,
} from '../../shared/constants';

// ============================================================================
// Test Helpers
// ============================================================================

const createMockPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player-1',
  type: 'player',
  position: { x: 10, y: 0.5, z: 10 },
  rotation: 0,
  velocity: { x: 0, y: 0 },
  health: 100,
  maxHealth: 100,
  ammo: 50,
  score: 0,
  currentWeapon: 'pistol',
  unlockedWeapons: ['pistol'],
  lastShotTime: 0,
  lastDashTime: -10000,
  dashCooldown: 1000,
  isDashing: false,
  dashDirection: null,
  dashStartTime: 0,
  combo: 0,
  lastKillTime: 0,
  kills: 0,
  powerUps: {},
  thermobaricCharges: 0,
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('PickupManager', () => {
  let manager: PickupManager;
  let callbacks: PickupManagerCallbacks;

  beforeEach(() => {
    callbacks = {
      onPickupSpawned: vi.fn(),
      onPickupCollected: vi.fn(),
    };
    manager = new PickupManager(callbacks);
  });

  describe('spawnPickup', () => {
    it('should spawn health or ammo pickup', () => {
      const position: Vec3 = { x: 5, y: 0.5, z: 5 };
      const pickup = manager.spawnPickup(position);

      expect(pickup.type).toBe('pickup');
      expect(pickup.position).toEqual(position);
      expect(['health', 'ammo']).toContain(pickup.pickupType);
    });

    it('should set correct value for health pickup', () => {
      // Mock random to always return health
      vi.spyOn(Math, 'random').mockReturnValue(0.3);

      const pickup = manager.spawnPickup({ x: 0, y: 0, z: 0 });

      expect(pickup.pickupType).toBe('health');
      expect(pickup.value).toBe(HEALTH_PACK_VALUE);

      vi.restoreAllMocks();
    });

    it('should set correct value for ammo pickup', () => {
      // Mock random to always return ammo
      vi.spyOn(Math, 'random').mockReturnValue(0.6);

      const pickup = manager.spawnPickup({ x: 0, y: 0, z: 0 });

      expect(pickup.pickupType).toBe('ammo');
      expect(pickup.value).toBe(AMMO_PACK_VALUE);

      vi.restoreAllMocks();
    });

    it('should trigger onPickupSpawned callback', () => {
      const pickup = manager.spawnPickup({ x: 0, y: 0, z: 0 });

      expect(callbacks.onPickupSpawned).toHaveBeenCalledWith(pickup);
    });
  });

  describe('spawnPowerUp', () => {
    it('should spawn a powerup pickup', () => {
      const position: Vec3 = { x: 5, y: 0.5, z: 5 };
      const pickup = manager.spawnPowerUp(position);

      expect(pickup.pickupType).toBe('powerup');
      expect(pickup.value).toBe(POWERUP_DURATION);
      expect(['rapidFire', 'spreadShot', 'vampire', 'shield']).toContain(pickup.powerUpType);
    });

    it('should trigger onPickupSpawned callback', () => {
      const pickup = manager.spawnPowerUp({ x: 0, y: 0, z: 0 });

      expect(callbacks.onPickupSpawned).toHaveBeenCalledWith(pickup);
    });
  });

  describe('spawnWeaponPickup', () => {
    it('should spawn weapon pickup when player has unowned weapons', () => {
      const unlockedWeapons = ['pistol'] as const;
      const pickup = manager.spawnWeaponPickup({ x: 5, y: 0.5, z: 5 }, [...unlockedWeapons]);

      expect(pickup).not.toBeNull();
      expect(pickup!.pickupType).toBe('weapon');
      expect(pickup!.weaponType).not.toBe('pistol');
    });

    it('should return null when player has all weapons', () => {
      const allWeapons = [...WEAPON_SLOT_ORDER];
      const pickup = manager.spawnWeaponPickup({ x: 5, y: 0.5, z: 5 }, allWeapons);

      expect(pickup).toBeNull();
    });

    it('should trigger onPickupSpawned callback when spawned', () => {
      const pickup = manager.spawnWeaponPickup({ x: 0, y: 0, z: 0 }, ['pistol']);

      expect(callbacks.onPickupSpawned).toHaveBeenCalledWith(pickup);
    });

    it('should not trigger callback when returning null', () => {
      manager.spawnWeaponPickup({ x: 0, y: 0, z: 0 }, [...WEAPON_SLOT_ORDER]);

      expect(callbacks.onPickupSpawned).not.toHaveBeenCalled();
    });
  });

  describe('checkCollisions', () => {
    it('should detect collision with nearby pickup', () => {
      const player = createMockPlayer({
        position: { x: 10, y: 0.5, z: 10 },
      });

      const pickups = new Map<string, PickupState>();
      const pickup = manager.createPickup(
        { x: 10.3, y: 0.5, z: 10 },
        'health',
        { value: 25 }
      );
      pickups.set(pickup.id, pickup);

      const result = manager.checkCollisions(player, pickups, 0);

      expect(result.collected).toContain(pickup.id);
    });

    it('should not detect collision with far pickup', () => {
      const player = createMockPlayer({
        position: { x: 10, y: 0.5, z: 10 },
      });

      const pickups = new Map<string, PickupState>();
      const pickup = manager.createPickup(
        { x: 20, y: 0.5, z: 20 },
        'health',
        { value: 25 }
      );
      pickups.set(pickup.id, pickup);

      const result = manager.checkCollisions(player, pickups, 0);

      expect(result.collected).not.toContain(pickup.id);
    });

    it('should apply health pickup to player', () => {
      const player = createMockPlayer({
        position: { x: 10, y: 0.5, z: 10 },
        health: 50,
        maxHealth: 100,
      });

      const pickups = new Map<string, PickupState>();
      const pickup = manager.createPickup(
        { x: 10, y: 0.5, z: 10 },
        'health',
        { value: 25 }
      );
      pickups.set(pickup.id, pickup);

      manager.checkCollisions(player, pickups, 0);

      expect(player.health).toBe(75);
    });

    it('should not exceed max health', () => {
      const player = createMockPlayer({
        position: { x: 10, y: 0.5, z: 10 },
        health: 90,
        maxHealth: 100,
      });

      const pickups = new Map<string, PickupState>();
      const pickup = manager.createPickup(
        { x: 10, y: 0.5, z: 10 },
        'health',
        { value: 25 }
      );
      pickups.set(pickup.id, pickup);

      manager.checkCollisions(player, pickups, 0);

      expect(player.health).toBe(100);
    });

    it('should apply ammo pickup to player', () => {
      const player = createMockPlayer({
        position: { x: 10, y: 0.5, z: 10 },
        ammo: 50,
      });

      const pickups = new Map<string, PickupState>();
      const pickup = manager.createPickup(
        { x: 10, y: 0.5, z: 10 },
        'ammo',
        { value: 30 }
      );
      pickups.set(pickup.id, pickup);

      manager.checkCollisions(player, pickups, 0);

      expect(player.ammo).toBe(80);
    });

    it('should apply powerup to player', () => {
      const player = createMockPlayer({
        position: { x: 10, y: 0.5, z: 10 },
        powerUps: {},
      });

      const pickups = new Map<string, PickupState>();
      const pickup = manager.createPickup(
        { x: 10, y: 0.5, z: 10 },
        'powerup',
        { value: 5000, powerUpType: 'rapidFire' }
      );
      pickups.set(pickup.id, pickup);

      const gameTime = 1000;
      manager.checkCollisions(player, pickups, gameTime);

      expect(player.powerUps.rapidFire).toBe(6000);
    });

    it('should return notification for powerup', () => {
      const player = createMockPlayer({
        position: { x: 10, y: 0.5, z: 10 },
      });

      const pickups = new Map<string, PickupState>();
      const pickup = manager.createPickup(
        { x: 10, y: 0.5, z: 10 },
        'powerup',
        { value: 5000, powerUpType: 'rapidFire' }
      );
      pickups.set(pickup.id, pickup);

      const result = manager.checkCollisions(player, pickups, 0);

      expect(result.notifications.length).toBe(1);
      expect(result.notifications[0].message).toBe('RAPID FIRE');
    });

    it('should unlock new weapon', () => {
      const player = createMockPlayer({
        position: { x: 10, y: 0.5, z: 10 },
        unlockedWeapons: ['pistol'],
        currentWeapon: 'pistol',
      });

      const pickups = new Map<string, PickupState>();
      const pickup = manager.createPickup(
        { x: 10, y: 0.5, z: 10 },
        'weapon',
        { weaponType: 'shotgun' }
      );
      pickups.set(pickup.id, pickup);

      manager.checkCollisions(player, pickups, 0);

      expect(player.unlockedWeapons).toContain('shotgun');
      expect(player.currentWeapon).toBe('shotgun');
    });

    it('should give ammo when picking up owned weapon', () => {
      const player = createMockPlayer({
        position: { x: 10, y: 0.5, z: 10 },
        unlockedWeapons: ['pistol', 'shotgun'],
        ammo: 50,
      });

      const pickups = new Map<string, PickupState>();
      const pickup = manager.createPickup(
        { x: 10, y: 0.5, z: 10 },
        'weapon',
        { weaponType: 'shotgun' }
      );
      pickups.set(pickup.id, pickup);

      const result = manager.checkCollisions(player, pickups, 0);

      expect(player.ammo).toBe(75);
      expect(result.notifications[0].message).toBe('+25 ENERGY');
    });

    it('should trigger onPickupCollected callback', () => {
      const player = createMockPlayer({
        position: { x: 10, y: 0.5, z: 10 },
      });

      const pickups = new Map<string, PickupState>();
      const pickup = manager.createPickup(
        { x: 10, y: 0.5, z: 10 },
        'health',
        { value: 25 }
      );
      pickups.set(pickup.id, pickup);

      manager.checkCollisions(player, pickups, 0);

      expect(callbacks.onPickupCollected).toHaveBeenCalledWith('health');
    });
  });

  describe('createPickup', () => {
    it('should create pickup with specified type and options', () => {
      const pickup = manager.createPickup(
        { x: 5, y: 0.5, z: 5 },
        'weapon',
        { weaponType: 'rocket' }
      );

      expect(pickup.pickupType).toBe('weapon');
      expect(pickup.weaponType).toBe('rocket');
    });

    it('should trigger onPickupSpawned callback', () => {
      const pickup = manager.createPickup({ x: 0, y: 0, z: 0 }, 'health', { value: 25 });

      expect(callbacks.onPickupSpawned).toHaveBeenCalledWith(pickup);
    });
  });
});
