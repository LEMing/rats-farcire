/**
 * EnemyWeaponSystem - Handles ranged attacks from enemies
 *
 * Features:
 * - Creates enemy projectiles
 * - Applies accuracy based on enemy type and conditions
 * - Manages reload state
 * - Muzzle flash effects
 */

import type { EnemyState, ProjectileState, Vec2, Vec3 } from '@shared/types';
import { ENEMY_CONFIGS } from '@shared/constants';
import { generateId, normalize } from '@shared/utils';

// ============================================================================
// Types
// ============================================================================

export interface EnemyShootResult {
  projectile: ProjectileState | null;
  success: boolean;
  muzzleFlashPos?: Vec3;
}

interface RangedEnemyConfig {
  damage: number;
  attackCooldown: number;
  attackRange: number;
  isRanged: true;
  projectileSpeed: number;
  accuracy: number;
  reloadTime: number;
  magazineSize: number;
}

// ============================================================================
// EnemyWeaponSystem
// ============================================================================

export class EnemyWeaponSystem {
  private magazineState: Map<string, number> = new Map(); // enemyId -> remaining ammo

  /**
   * Attempt to shoot at target
   */
  shoot(
    enemy: EnemyState,
    targetPos: Vec2,
    now: number
  ): EnemyShootResult {
    const config = ENEMY_CONFIGS[enemy.enemyType];

    // Only ranged enemies can shoot
    if (!('isRanged' in config) || !config.isRanged) {
      return { projectile: null, success: false };
    }

    const rangedConfig = config as unknown as RangedEnemyConfig;

    // Check cooldown
    const lastShot = enemy.lastShotTime ?? 0;
    if (now - lastShot < rangedConfig.attackCooldown) {
      return { projectile: null, success: false };
    }

    // Check reload state
    if (enemy.isReloading) {
      return { projectile: null, success: false };
    }

    // Check magazine
    let ammo = this.magazineState.get(enemy.id) ?? rangedConfig.magazineSize;
    if (ammo <= 0) {
      // Start reload
      enemy.isReloading = true;
      setTimeout(() => {
        enemy.isReloading = false;
        this.magazineState.set(enemy.id, rangedConfig.magazineSize);
      }, rangedConfig.reloadTime);

      return { projectile: null, success: false };
    }

    // Calculate shot direction with accuracy
    const enemyPos2D: Vec2 = { x: enemy.position.x, y: enemy.position.z };
    const baseDirection = normalize({
      x: targetPos.x - enemyPos2D.x,
      y: targetPos.y - enemyPos2D.y,
    });

    // Apply accuracy (inaccuracy is random angle offset)
    const inaccuracy = (1 - rangedConfig.accuracy) * Math.PI * 0.5; // Max ~45 degrees spread
    const angleOffset = (Math.random() - 0.5) * 2 * inaccuracy;

    const cos = Math.cos(angleOffset);
    const sin = Math.sin(angleOffset);
    const direction: Vec2 = {
      x: baseDirection.x * cos - baseDirection.y * sin,
      y: baseDirection.x * sin + baseDirection.y * cos,
    };

    // Create projectile
    const projectile: ProjectileState = {
      id: generateId(),
      type: 'projectile',
      position: {
        x: enemy.position.x + direction.x * 0.5, // Offset from enemy center
        y: 0.5,
        z: enemy.position.z + direction.y * 0.5,
      },
      rotation: Math.atan2(direction.x, direction.y),
      velocity: {
        x: direction.x * rangedConfig.projectileSpeed,
        y: direction.y * rangedConfig.projectileSpeed,
      },
      ownerId: enemy.id,
      damage: rangedConfig.damage,
      lifetime: 2000, // 2 seconds
      createdAt: now,
      isEnemyProjectile: true, // Mark as enemy projectile (persists even if enemy dies)
    };

    // Update state
    enemy.lastShotTime = now;
    ammo--;
    this.magazineState.set(enemy.id, ammo);

    // Muzzle flash position
    const muzzleFlashPos: Vec3 = {
      x: enemy.position.x + direction.x * 0.6,
      y: 0.6,
      z: enemy.position.z + direction.y * 0.6,
    };

    return {
      projectile,
      success: true,
      muzzleFlashPos,
    };
  }

  /**
   * Check if enemy can shoot (for AI decisions)
   */
  canShoot(enemy: EnemyState, now: number): boolean {
    const config = ENEMY_CONFIGS[enemy.enemyType];

    if (!('isRanged' in config) || !config.isRanged) {
      return false;
    }

    const rangedConfig = config as unknown as RangedEnemyConfig;

    // Check cooldown
    const lastShot = enemy.lastShotTime ?? 0;
    if (now - lastShot < rangedConfig.attackCooldown) {
      return false;
    }

    // Check reload
    if (enemy.isReloading) {
      return false;
    }

    // Check magazine
    const ammo = this.magazineState.get(enemy.id) ?? rangedConfig.magazineSize;
    return ammo > 0;
  }

  /**
   * Get remaining ammo for enemy
   */
  getAmmo(enemy: EnemyState): number {
    const config = ENEMY_CONFIGS[enemy.enemyType];
    if (!('isRanged' in config) || !config.isRanged) {
      return 0;
    }

    const rangedConfig = config as unknown as RangedEnemyConfig;
    return this.magazineState.get(enemy.id) ?? rangedConfig.magazineSize;
  }

  /**
   * Check if enemy is ranged type
   */
  isRangedEnemy(enemy: EnemyState): boolean {
    const config = ENEMY_CONFIGS[enemy.enemyType];
    return 'isRanged' in config && config.isRanged === true;
  }

  /**
   * Clean up state for removed enemy
   */
  removeEnemy(enemyId: string): void {
    this.magazineState.delete(enemyId);
  }

  /**
   * Reset magazine for enemy (e.g., on spawn)
   */
  resetMagazine(enemy: EnemyState): void {
    const config = ENEMY_CONFIGS[enemy.enemyType];
    if ('isRanged' in config && config.isRanged && 'magazineSize' in config) {
      this.magazineState.set(enemy.id, (config as unknown as RangedEnemyConfig).magazineSize);
    }
  }
}
