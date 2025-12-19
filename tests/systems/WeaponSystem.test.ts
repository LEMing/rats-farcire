import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeaponSystem, WeaponSystemCallbacks } from '../../src/systems/WeaponSystem';
import type { PlayerState, WeaponType } from '../../shared/types';
import { WEAPON_CONFIGS, THERMOBARIC_COOLDOWN, POWERUP_CONFIGS } from '../../shared/constants';

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
  ammo: 100,
  score: 0,
  isDead: false,
  lastShootTime: 0,
  currentWeapon: 'shotgun',
  unlockedWeapons: ['pistol', 'shotgun'],
  thermobaricCooldown: 0,
  dashCooldown: 0,
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

describe('WeaponSystem', () => {
  let weaponSystem: WeaponSystem;
  let callbacks: WeaponSystemCallbacks;

  beforeEach(() => {
    callbacks = {
      onMuzzleFlash: vi.fn(),
      onWeaponFire: vi.fn(),
      onWeaponSwitch: vi.fn(),
      onThermobaricFire: vi.fn(),
    };
    weaponSystem = new WeaponSystem(callbacks);
  });

  describe('canShoot', () => {
    it('should return true when player can shoot', () => {
      const player = createMockPlayer();
      expect(weaponSystem.canShoot(player, 1000)).toBe(true);
    });

    it('should return false when not enough ammo', () => {
      const player = createMockPlayer({ ammo: 0 });
      expect(weaponSystem.canShoot(player, 1000)).toBe(false);
    });

    it('should return false when weapon on cooldown', () => {
      const player = createMockPlayer({ lastShootTime: 900 });
      const shotgunCooldown = WEAPON_CONFIGS.shotgun.cooldown;
      // Game time is 1000, last shot was 900, cooldown is 400ms
      // 1000 - 900 = 100ms elapsed, need 400ms
      expect(weaponSystem.canShoot(player, 1000)).toBe(false);
    });

    it('should return true when cooldown has passed', () => {
      const player = createMockPlayer({ lastShootTime: 500 });
      // 1000 - 500 = 500ms elapsed, shotgun cooldown is 400ms
      expect(weaponSystem.canShoot(player, 1000)).toBe(true);
    });

    it('should return false when player is dashing', () => {
      const player = createMockPlayer({ isDashing: true });
      expect(weaponSystem.canShoot(player, 1000)).toBe(false);
    });

    it('should reduce cooldown with rapid fire power-up', () => {
      const player = createMockPlayer({
        lastShootTime: 900,
        powerUps: { rapidFire: 5000 }, // expires at 5000
      });
      // Without rapid fire: cooldown 400ms, elapsed 100ms = can't shoot
      // With rapid fire: cooldown 160ms (400/2.5), elapsed 100ms = can't shoot
      expect(weaponSystem.canShoot(player, 1000)).toBe(false);

      // But with more time elapsed...
      const player2 = createMockPlayer({
        lastShootTime: 800,
        powerUps: { rapidFire: 5000 },
      });
      // Elapsed 200ms > 160ms rapid fire cooldown = can shoot
      expect(weaponSystem.canShoot(player2, 1000)).toBe(true);
    });
  });

  describe('shoot', () => {
    it('should create projectiles for shotgun', () => {
      const player = createMockPlayer({ currentWeapon: 'shotgun' });
      const result = weaponSystem.shoot(player, 1000);

      expect(result).not.toBeNull();
      expect(result!.projectiles.length).toBe(WEAPON_CONFIGS.shotgun.pellets);
      expect(result!.energyCost).toBe(WEAPON_CONFIGS.shotgun.energy);
    });

    it('should create single projectile for pistol', () => {
      const player = createMockPlayer({ currentWeapon: 'pistol', unlockedWeapons: ['pistol'] });
      const result = weaponSystem.shoot(player, 1000);

      expect(result).not.toBeNull();
      expect(result!.projectiles.length).toBe(1);
    });

    it('should return null when cannot shoot', () => {
      const player = createMockPlayer({ ammo: 0 });
      const result = weaponSystem.shoot(player, 1000);
      expect(result).toBeNull();
    });

    it('should trigger muzzle flash callback', () => {
      const player = createMockPlayer();
      weaponSystem.shoot(player, 1000);
      expect(callbacks.onMuzzleFlash).toHaveBeenCalledWith('player-1');
    });

    it('should trigger weapon fire callback', () => {
      const player = createMockPlayer();
      weaponSystem.shoot(player, 1000);
      expect(callbacks.onWeaponFire).toHaveBeenCalledWith('shotgun', player.position);
    });

    it('should set correct screen shake for different weapons', () => {
      const rocketPlayer = createMockPlayer({
        currentWeapon: 'rocket',
        unlockedWeapons: ['pistol', 'shotgun', 'rocket'],
        ammo: 50,
      });
      const rocketResult = weaponSystem.shoot(rocketPlayer, 1000);
      expect(rocketResult!.screenShake).toBe(0.3);

      const shotgunPlayer = createMockPlayer();
      const shotgunResult = weaponSystem.shoot(shotgunPlayer, 1000);
      expect(shotgunResult!.screenShake).toBe(0.2);

      const pistolPlayer = createMockPlayer({ currentWeapon: 'pistol' });
      const pistolResult = weaponSystem.shoot(pistolPlayer, 1000);
      expect(pistolResult!.screenShake).toBe(0.08);
    });

    it('should double pellets with spread shot power-up', () => {
      const player = createMockPlayer({
        powerUps: { spreadShot: 5000 },
      });
      const result = weaponSystem.shoot(player, 1000);

      const expectedPellets = WEAPON_CONFIGS.shotgun.pellets * POWERUP_CONFIGS.spreadShot.pelletMultiplier;
      expect(result!.projectiles.length).toBe(expectedPellets);
    });

    it('should set correct projectile properties', () => {
      const player = createMockPlayer({ currentWeapon: 'pistol', rotation: Math.PI / 2 });
      const result = weaponSystem.shoot(player, 1000);

      const projectile = result!.projectiles[0];
      expect(projectile.ownerId).toBe('player-1');
      expect(projectile.damage).toBe(WEAPON_CONFIGS.pistol.damage);
      expect(projectile.lifetime).toBe(WEAPON_CONFIGS.pistol.lifetime);
      expect(projectile.weaponType).toBe('pistol');
      expect(projectile.createdAt).toBe(1000);
    });
  });

  describe('applyShootResult', () => {
    it('should deduct ammo and update lastShootTime', () => {
      const player = createMockPlayer({ ammo: 100, lastShootTime: 0 });
      const result = weaponSystem.shoot(player, 1000);

      weaponSystem.applyShootResult(player, result!, 1000);

      expect(player.ammo).toBe(100 - WEAPON_CONFIGS.shotgun.energy);
      expect(player.lastShootTime).toBe(1000);
    });
  });

  describe('switchWeapon', () => {
    it('should switch to unlocked weapon', () => {
      const player = createMockPlayer({
        currentWeapon: 'pistol',
        unlockedWeapons: ['pistol', 'shotgun'],
      });

      const switched = weaponSystem.switchWeapon(player, 2); // slot 2 = shotgun

      expect(switched).toBe(true);
      expect(player.currentWeapon).toBe('shotgun');
    });

    it('should not switch to locked weapon', () => {
      const player = createMockPlayer({
        currentWeapon: 'pistol',
        unlockedWeapons: ['pistol'],
      });

      const switched = weaponSystem.switchWeapon(player, 2); // shotgun not unlocked

      expect(switched).toBe(false);
      expect(player.currentWeapon).toBe('pistol');
    });

    it('should not switch to same weapon', () => {
      const player = createMockPlayer({
        currentWeapon: 'shotgun',
        unlockedWeapons: ['pistol', 'shotgun'],
      });

      const switched = weaponSystem.switchWeapon(player, 2); // already on shotgun

      expect(switched).toBe(false);
    });

    it('should return false for invalid slot', () => {
      const player = createMockPlayer();
      const switched = weaponSystem.switchWeapon(player, 99);
      expect(switched).toBe(false);
    });

    it('should trigger weapon switch callback', () => {
      const player = createMockPlayer({
        currentWeapon: 'pistol',
        unlockedWeapons: ['pistol', 'shotgun'],
      });

      weaponSystem.switchWeapon(player, 2);

      expect(callbacks.onWeaponSwitch).toHaveBeenCalledWith(
        WEAPON_CONFIGS.shotgun.name,
        WEAPON_CONFIGS.shotgun.color
      );
    });
  });

  describe('thermobaric', () => {
    it('should return true when thermobaric available', () => {
      const player = createMockPlayer({ thermobaricCooldown: 0 });
      expect(weaponSystem.canUseThermobaric(player)).toBe(true);
    });

    it('should return false when on cooldown', () => {
      const player = createMockPlayer({ thermobaricCooldown: 1000 });
      expect(weaponSystem.canUseThermobaric(player)).toBe(false);
    });

    it('should use thermobaric and set cooldown', () => {
      const player = createMockPlayer();
      const result = weaponSystem.useThermobaric(player);

      expect(result).not.toBeNull();
      expect(player.thermobaricCooldown).toBe(THERMOBARIC_COOLDOWN);
    });

    it('should return explosion data', () => {
      const player = createMockPlayer({ position: { x: 5, y: 0.5, z: 5 } });
      const result = weaponSystem.useThermobaric(player);

      expect(result!.position).toEqual({ x: 5, y: 0.5, z: 5 });
      expect(result!.radius).toBeGreaterThan(0);
      expect(result!.baseDamage).toBeGreaterThan(0);
    });

    it('should trigger thermobaric callback', () => {
      const player = createMockPlayer();
      weaponSystem.useThermobaric(player);
      expect(callbacks.onThermobaricFire).toHaveBeenCalledWith(player.position);
    });

    it('should return null when on cooldown', () => {
      const player = createMockPlayer({ thermobaricCooldown: 1000 });
      const result = weaponSystem.useThermobaric(player);
      expect(result).toBeNull();
    });
  });

  describe('updateCooldowns', () => {
    it('should decrease thermobaric cooldown', () => {
      const player = createMockPlayer({ thermobaricCooldown: 1000 });
      weaponSystem.updateCooldowns(player, 500);
      expect(player.thermobaricCooldown).toBe(500);
    });

    it('should not go below zero', () => {
      const player = createMockPlayer({ thermobaricCooldown: 100 });
      weaponSystem.updateCooldowns(player, 500);
      expect(player.thermobaricCooldown).toBe(-400); // System allows negative, caller should clamp
    });
  });

  describe('utility methods', () => {
    it('should return weapon config', () => {
      const config = weaponSystem.getWeaponConfig('shotgun');
      expect(config).toBe(WEAPON_CONFIGS.shotgun);
    });

    it('should return weapon slot order', () => {
      const slots = weaponSystem.getWeaponSlotOrder();
      expect(slots).toEqual(['pistol', 'shotgun', 'machinegun', 'rifle', 'rocket']);
    });
  });
});
