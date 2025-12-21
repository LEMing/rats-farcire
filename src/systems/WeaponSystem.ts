/**
 * WeaponSystem - Handles weapon mechanics, firing, and special abilities
 *
 * Single Responsibility: Weapon state management, projectile creation, cooldowns
 * Does NOT handle: Projectile movement, collision detection, damage application
 */

import type { PlayerState, ProjectileState, WeaponType, Vec3 } from '@shared/types';
import {
  WEAPON_CONFIGS,
  WEAPON_SLOT_ORDER,
  THERMOBARIC_COOLDOWN,
  THERMOBARIC_DAMAGE,
  THERMOBARIC_RADIUS,
  POWERUP_CONFIGS,
} from '@shared/constants';
import { generateId } from '@shared/utils';

// ============================================================================
// Types
// ============================================================================

export interface WeaponSystemCallbacks {
  onMuzzleFlash?: (playerId: string) => void;
  onWeaponFire?: (weaponType: WeaponType, position: Vec3) => void;
  onWeaponSwitch?: (weaponName: string, color: number) => void;
  onThermobaricFire?: (position: Vec3) => void;
}

export interface WeaponSystemConfig {
  /** Override weapon configs (for testing) */
  weaponConfigs?: typeof WEAPON_CONFIGS;
}

export interface ShootResult {
  projectiles: ProjectileState[];
  screenShake: number;
  energyCost: number;
}

export interface ThermobaricResult {
  position: Vec3;
  radius: number;
  baseDamage: number;
}

// ============================================================================
// WeaponSystem
// ============================================================================

export class WeaponSystem {
  private callbacks: WeaponSystemCallbacks;
  private weaponConfigs: typeof WEAPON_CONFIGS;

  constructor(
    callbacks: WeaponSystemCallbacks = {},
    config: WeaponSystemConfig = {}
  ) {
    this.callbacks = callbacks;
    this.weaponConfigs = config.weaponConfigs ?? WEAPON_CONFIGS;
  }

  /**
   * Check if player can currently shoot
   */
  canShoot(player: PlayerState, gameTime: number): boolean {
    const weaponConfig = this.weaponConfigs[player.currentWeapon];

    // Check ammo for current weapon
    if (player.ammo[player.currentWeapon] < weaponConfig.energy) return false;

    // Check cooldown
    const timeSinceLastShot = gameTime - player.lastShootTime;
    const hasRapidFire = player.powerUps.rapidFire && player.powerUps.rapidFire > gameTime;
    const cooldown = hasRapidFire
      ? weaponConfig.cooldown / POWERUP_CONFIGS.rapidFire.fireRateMultiplier
      : weaponConfig.cooldown;

    if (timeSinceLastShot < cooldown) return false;

    // Cannot shoot while dashing
    if (player.isDashing) return false;

    return true;
  }

  /**
   * Fire the current weapon
   * Returns projectiles to be created and effects to trigger
   */
  shoot(player: PlayerState, gameTime: number): ShootResult | null {
    if (!this.canShoot(player, gameTime)) return null;

    const weaponConfig = this.weaponConfigs[player.currentWeapon];

    // Trigger callbacks
    this.callbacks.onMuzzleFlash?.(player.id);
    this.callbacks.onWeaponFire?.(player.currentWeapon, player.position);

    // Calculate screen shake based on weapon power
    const screenShake =
      player.currentWeapon === 'rocket' ? 0.3 :
      player.currentWeapon === 'shotgun' ? 0.2 :
      player.currentWeapon === 'rifle' ? 0.15 : 0.08;

    const baseAngle = player.rotation;

    // Spread shot power-up doubles pellets
    const hasSpreadShot = player.powerUps.spreadShot && player.powerUps.spreadShot > gameTime;
    const pelletCount = hasSpreadShot
      ? weaponConfig.pellets * POWERUP_CONFIGS.spreadShot.pelletMultiplier
      : weaponConfig.pellets;
    const spreadAngle = hasSpreadShot ? weaponConfig.spread * 1.5 : weaponConfig.spread;

    // Create projectiles
    const projectiles: ProjectileState[] = [];

    for (let i = 0; i < pelletCount; i++) {
      // Calculate spread for multi-pellet weapons
      let angle = baseAngle;
      if (pelletCount > 1) {
        const spreadOffset = (i / (pelletCount - 1) - 0.5) * spreadAngle;
        const randomOffset = (Math.random() - 0.5) * 0.08;
        angle = baseAngle + spreadOffset + randomOffset;
      } else if (weaponConfig.spread > 0) {
        // Single pellet with spread (like machine gun)
        angle = baseAngle + (Math.random() - 0.5) * weaponConfig.spread;
      }

      const direction = {
        x: Math.sin(angle),
        y: Math.cos(angle),
      };

      const projectile: ProjectileState = {
        id: generateId(),
        type: 'projectile',
        position: {
          x: player.position.x + direction.x * 0.5,
          y: 0.5,
          z: player.position.z + direction.y * 0.5,
        },
        rotation: angle,
        velocity: {
          x: direction.x * weaponConfig.speed,
          y: direction.y * weaponConfig.speed,
        },
        ownerId: player.id,
        damage: weaponConfig.damage,
        lifetime: weaponConfig.lifetime,
        createdAt: gameTime,
        weaponType: player.currentWeapon,
      };

      projectiles.push(projectile);
    }

    return {
      projectiles,
      screenShake,
      energyCost: weaponConfig.energy,
    };
  }

  /**
   * Apply shoot result to player state (update ammo, lastShootTime)
   */
  applyShootResult(player: PlayerState, result: ShootResult, gameTime: number): void {
    player.ammo[player.currentWeapon] -= result.energyCost;
    player.lastShootTime = gameTime;
  }

  /**
   * Switch to a weapon slot
   * Returns true if weapon was switched
   */
  switchWeapon(player: PlayerState, slot: number): boolean {
    const weaponType = WEAPON_SLOT_ORDER[slot - 1];
    if (!weaponType) return false;

    // Check if weapon is unlocked
    if (!player.unlockedWeapons.includes(weaponType)) return false;

    // Check if already using this weapon
    if (player.currentWeapon === weaponType) return false;

    player.currentWeapon = weaponType;

    // Trigger callback
    const config = this.weaponConfigs[weaponType];
    this.callbacks.onWeaponSwitch?.(config.name, config.color);

    return true;
  }

  /**
   * Check if thermobaric charge is available
   */
  canUseThermobaric(player: PlayerState): boolean {
    return player.thermobaricCooldown <= 0;
  }

  /**
   * Use thermobaric charge
   * Returns explosion data for damage calculation
   */
  useThermobaric(player: PlayerState): ThermobaricResult | null {
    if (!this.canUseThermobaric(player)) return null;

    // Set cooldown
    player.thermobaricCooldown = THERMOBARIC_COOLDOWN;

    // Trigger callback
    this.callbacks.onThermobaricFire?.(player.position);

    return {
      position: { ...player.position },
      radius: THERMOBARIC_RADIUS,
      baseDamage: THERMOBARIC_DAMAGE,
    };
  }

  /**
   * Update weapon cooldowns
   */
  updateCooldowns(player: PlayerState, dt: number): void {
    if (player.thermobaricCooldown > 0) {
      player.thermobaricCooldown -= dt;
    }
  }

  /**
   * Get weapon config for a weapon type
   */
  getWeaponConfig(weaponType: WeaponType): typeof WEAPON_CONFIGS[WeaponType] {
    return this.weaponConfigs[weaponType];
  }

  /**
   * Get all available weapon slots
   */
  getWeaponSlotOrder(): WeaponType[] {
    return [...WEAPON_SLOT_ORDER];
  }
}
