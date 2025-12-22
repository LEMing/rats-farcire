import type { Vec3, EnemyState, ProjectileState, WeaponType } from '@shared/types';
import { ENEMY_CONFIGS, POWERUP_CONFIGS, DASH_IFRAMES } from '@shared/constants';
import { distance } from '@shared/utils';
import { calculateKnockback } from './KnockbackUtils';

// ============================================================================
// CombatSystem - Handles damage application and explosion effects
// Single Responsibility: Calculate and apply combat damage/knockback
// ============================================================================

/**
 * Result of applying area damage
 */
export interface AreaDamageResult {
  enemyId: string;
  damage: number;
  killed: boolean;
  knockbackVelocity: { x: number; y: number };
}

/**
 * Result of a projectile hit
 */
export interface ProjectileHitResult {
  damage: number;
  killed: boolean;
  knockbackVelocity: { x: number; y: number };
  isCrit: boolean;
}

/**
 * Callbacks for combat events
 */
export interface CombatSystemCallbacks {
  onEnemyDamaged: (enemyId: string, currentHealth: number, maxHealth: number) => void;
  onEnemyKilled: (enemyId: string, weaponType?: WeaponType) => void;
  onPlayerDamaged: (damage: number, position: Vec3) => void;
  onPlayerKilled: () => void;
  onScreenShake: (intensity: number) => void;
  onDamageNumber: (x: number, y: number, damage: number, isCrit: boolean, combo?: number) => void;
  worldToScreen: (worldPos: Vec3) => { x: number; y: number };
  onHitstop: () => void;
}

/**
 * Player state subset needed for combat calculations
 */
export interface CombatPlayerState {
  position: Vec3;
  health: number;
  isDashing: boolean;
  powerUps: Record<string, number>;
}

export class CombatSystem {
  private callbacks: CombatSystemCallbacks;
  private gameTime = 0;

  constructor(callbacks: CombatSystemCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Update game time (for power-up checks)
   */
  setGameTime(time: number): void {
    this.gameTime = time;
  }

  /**
   * Apply thermobaric explosion damage to all enemies in radius
   */
  applyThermobaricExplosion(
    position: Vec3,
    radius: number,
    baseDamage: number,
    enemies: Map<string, EnemyState>
  ): AreaDamageResult[] {
    const results: AreaDamageResult[] = [];

    for (const [enemyId, enemy] of enemies) {
      if (enemy.state === 'dead') continue;

      const dist = distance(
        { x: position.x, y: position.z },
        { x: enemy.position.x, y: enemy.position.z }
      );

      if (dist <= radius) {
        // Full damage at center, less at edges
        const damageFalloff = 1 - (dist / radius) * 0.5;
        const damage = Math.floor(baseDamage * damageFalloff);
        enemy.health -= damage;

        // Spawn damage number
        const screenPos = this.callbacks.worldToScreen(enemy.position);
        this.callbacks.onDamageNumber(screenPos.x, screenPos.y, damage, true);

        // Strong knockback
        const knockbackVel = calculateKnockback(
          { x: position.x, y: position.z },
          { x: enemy.position.x, y: enemy.position.z },
          60
        );
        enemy.knockbackVelocity = knockbackVel;

        const killed = enemy.health <= 0;
        results.push({
          enemyId,
          damage,
          killed,
          knockbackVelocity: knockbackVel,
        });

        if (killed) {
          this.callbacks.onEnemyKilled(enemyId);
        } else {
          this.callbacks.onEnemyDamaged(enemyId, enemy.health, ENEMY_CONFIGS[enemy.enemyType].health);
        }
      }
    }

    return results;
  }

  /**
   * Apply barrel explosion damage to enemies and optionally player
   */
  applyBarrelExplosion(
    position: Vec3,
    radius: number,
    damage: number,
    knockbackForce: number,
    playerDamage: number,
    enemies: Map<string, EnemyState>,
    player: CombatPlayerState | null,
    canTriggerLastStand: () => boolean,
    tryTriggerLastStand: () => boolean
  ): { enemyResults: AreaDamageResult[]; playerHit: boolean; playerDamage: number } {
    const enemyResults: AreaDamageResult[] = [];

    // Damage all enemies in radius
    for (const [enemyId, enemy] of enemies) {
      if (enemy.state === 'dead') continue;

      const dist = distance(
        { x: position.x, y: position.z },
        { x: enemy.position.x, y: enemy.position.z }
      );

      if (dist <= radius) {
        const damageFalloff = 1 - (dist / radius) * 0.5;
        const finalDamage = Math.floor(damage * damageFalloff);
        enemy.health -= finalDamage;

        // Spawn damage number
        const screenPos = this.callbacks.worldToScreen(enemy.position);
        this.callbacks.onDamageNumber(screenPos.x, screenPos.y, finalDamage, true);

        // Strong knockback
        const knockbackVel = calculateKnockback(
          { x: position.x, y: position.z },
          { x: enemy.position.x, y: enemy.position.z },
          knockbackForce
        );
        enemy.knockbackVelocity = knockbackVel;

        const killed = enemy.health <= 0;
        enemyResults.push({
          enemyId,
          damage: finalDamage,
          killed,
          knockbackVelocity: knockbackVel,
        });

        if (killed) {
          this.callbacks.onEnemyKilled(enemyId);
        } else {
          this.callbacks.onEnemyDamaged(enemyId, enemy.health, ENEMY_CONFIGS[enemy.enemyType].health);
        }
      }
    }

    // Damage player if in radius (and not dashing with i-frames)
    let playerHit = false;
    let actualPlayerDamage = 0;

    if (player && !(player.isDashing && DASH_IFRAMES)) {
      const playerDist = distance(
        { x: position.x, y: position.z },
        { x: player.position.x, y: player.position.z }
      );

      if (playerDist <= radius) {
        const damageFalloff = 1 - (playerDist / radius) * 0.5;
        actualPlayerDamage = Math.floor(playerDamage * damageFalloff);

        player.health -= actualPlayerDamage;
        playerHit = true;

        // Damage feedback
        this.callbacks.onScreenShake(0.3);
        const screenPos = this.callbacks.worldToScreen(player.position);
        this.callbacks.onDamageNumber(screenPos.x, screenPos.y, actualPlayerDamage, false);
        this.callbacks.onPlayerDamaged(actualPlayerDamage, player.position);

        // Check if player died
        if (player.health <= 0) {
          if (canTriggerLastStand() && tryTriggerLastStand()) {
            player.health = 1;
          } else {
            this.callbacks.onPlayerKilled();
          }
        }
      }
    }

    return { enemyResults, playerHit, playerDamage: actualPlayerDamage };
  }

  /**
   * Handle projectile hitting an enemy
   */
  handleProjectileHit(
    proj: ProjectileState,
    enemy: EnemyState
  ): ProjectileHitResult {
    const config = ENEMY_CONFIGS[enemy.enemyType];

    // Damage enemy
    enemy.health -= proj.damage;

    // Trigger damage visual effects
    this.callbacks.onEnemyDamaged(enemy.id, enemy.health, config.health);

    // Apply knockback
    const knockbackVel = calculateKnockback(
      { x: proj.position.x, y: proj.position.z },
      { x: enemy.position.x, y: enemy.position.z },
      4
    );
    enemy.knockbackVelocity = knockbackVel;

    // Spawn damage number
    const screenPos = this.callbacks.worldToScreen(enemy.position);
    const offsetX = (Math.random() - 0.5) * 40;
    const offsetY = (Math.random() - 0.5) * 30;
    this.callbacks.onDamageNumber(screenPos.x + offsetX, screenPos.y + offsetY, proj.damage, false, 0);

    // Trigger hitstop
    this.callbacks.onHitstop();

    const killed = enemy.health <= 0;
    if (killed) {
      this.callbacks.onEnemyKilled(enemy.id, proj.weaponType);
    }

    return {
      damage: proj.damage,
      killed,
      knockbackVelocity: knockbackVel,
      isCrit: false,
    };
  }

  /**
   * Handle enemy projectile hitting the player
   */
  handleEnemyProjectileHit(
    proj: ProjectileState,
    player: CombatPlayerState,
    canTriggerLastStand: () => boolean,
    tryTriggerLastStand: () => boolean
  ): { damage: number; died: boolean } {
    // Shield power-up reduces damage
    const hasShield = player.powerUps.shield && player.powerUps.shield > this.gameTime;
    const damageMultiplier = hasShield ? POWERUP_CONFIGS.shield.damageReduction : 1;
    const damage = proj.damage * damageMultiplier;

    player.health -= damage;

    // Spawn damage number
    const screenPos = this.callbacks.worldToScreen(player.position);
    this.callbacks.onDamageNumber(screenPos.x, screenPos.y, Math.floor(damage), false);

    // Screen shake
    this.callbacks.onScreenShake(0.3);
    this.callbacks.onPlayerDamaged(damage, player.position);

    // Check for player death or Last Stand trigger
    let died = false;
    if (player.health <= 0) {
      if (canTriggerLastStand() && tryTriggerLastStand()) {
        player.health = 1;
      } else {
        died = true;
        this.callbacks.onPlayerKilled();
      }
    }

    return { damage, died };
  }

  /**
   * Handle rocket explosion - area damage to nearby enemies
   */
  handleRocketExplosion(
    explosionPos: Vec3,
    explosionRadius: number,
    baseDamage: number,
    knockbackForce: number,
    enemies: Map<string, EnemyState>
  ): AreaDamageResult[] {
    const results: AreaDamageResult[] = [];

    for (const [enemyId, enemy] of enemies) {
      if (enemy.state === 'dead') continue;

      const dist = distance(
        { x: explosionPos.x, y: explosionPos.z },
        { x: enemy.position.x, y: enemy.position.z }
      );

      if (dist <= explosionRadius) {
        // Damage falls off with distance
        const damageFalloff = 1 - (dist / explosionRadius) * 0.6;
        const damage = Math.floor(baseDamage * damageFalloff);
        enemy.health -= damage;

        // Knockback from explosion
        const explosionKnockback = calculateKnockback(
          { x: explosionPos.x, y: explosionPos.z },
          { x: enemy.position.x, y: enemy.position.z },
          knockbackForce
        );
        enemy.knockbackVelocity = explosionKnockback;

        // Damage number
        const screenPos = this.callbacks.worldToScreen(enemy.position);
        this.callbacks.onDamageNumber(screenPos.x, screenPos.y, damage, true, 0);

        const killed = enemy.health <= 0;
        results.push({
          enemyId,
          damage,
          killed,
          knockbackVelocity: explosionKnockback,
        });

        if (killed) {
          this.callbacks.onEnemyKilled(enemyId);
        } else {
          this.callbacks.onEnemyDamaged(enemyId, enemy.health, ENEMY_CONFIGS[enemy.enemyType].health);
        }
      }
    }

    return results;
  }

  /**
   * Calculate melee damage to player from enemy attack
   */
  applyMeleeDamage(
    player: CombatPlayerState,
    baseDamage: number,
    dtSeconds: number,
    canTriggerLastStand: () => boolean,
    tryTriggerLastStand: () => boolean
  ): { damage: number; died: boolean } {
    // Skip if player is dashing with iframes
    if (player.isDashing && DASH_IFRAMES) {
      return { damage: 0, died: false };
    }

    // Shield power-up reduces damage
    const hasShield = player.powerUps.shield && player.powerUps.shield > this.gameTime;
    const damageMultiplier = hasShield ? POWERUP_CONFIGS.shield.damageReduction : 1;
    const damage = baseDamage * dtSeconds * damageMultiplier;
    player.health -= damage;

    // Trigger visual feedback for significant damage
    if (damage > 0.5) {
      this.callbacks.onPlayerDamaged(damage, player.position);
    }

    // Check for death or Last Stand
    let died = false;
    if (player.health <= 0) {
      if (canTriggerLastStand() && tryTriggerLastStand()) {
        player.health = 1;
      } else {
        died = true;
        this.callbacks.onPlayerKilled();
      }
    }

    return { damage, died };
  }
}
