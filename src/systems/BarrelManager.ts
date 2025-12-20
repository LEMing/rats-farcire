/**
 * BarrelManager - Handles explosive barrel logic
 *
 * Explosive barrels can be shot by projectiles to trigger area damage.
 * They can also chain-react with nearby barrels.
 */

import type { Vec3, ProjectileState, BarrelState } from '@shared/types';

// ============================================================================
// Types
// ============================================================================

export interface ExplosionResult {
  barrelId: string;
  position: Vec3;
  radius: number;
  damage: number;
  knockbackForce: number;
  chainTriggeredBarrelIds: string[];
}

export interface BarrelManagerCallbacks {
  onBarrelExplode?: (result: ExplosionResult) => void;
}

export interface BarrelManagerConfig {
  /** Barrel hitbox radius for collision detection */
  hitboxRadius: number;
  /** Explosion radius in world units */
  explosionRadius: number;
  /** Damage dealt to enemies */
  enemyDamage: number;
  /** Damage dealt to players */
  playerDamage: number;
  /** Knockback force applied */
  knockbackForce: number;
  /** Radius to check for chain reactions */
  chainReactionRadius: number;
  /** Delay before chain reaction triggers (ms) */
  chainReactionDelay: number;
}

const DEFAULT_CONFIG: BarrelManagerConfig = {
  hitboxRadius: 0.5,
  explosionRadius: 4,
  enemyDamage: 80,
  playerDamage: 30,
  knockbackForce: 15,
  chainReactionRadius: 5,
  chainReactionDelay: 100,
};

// ============================================================================
// BarrelManager
// ============================================================================

export class BarrelManager {
  private barrels: Map<string, BarrelState> = new Map();
  private pendingChainReactions: { barrelId: string; triggerTime: number }[] = [];
  private config: BarrelManagerConfig;
  private callbacks: BarrelManagerCallbacks;
  private nextBarrelId = 0;

  constructor(
    config: Partial<BarrelManagerConfig> = {},
    callbacks: BarrelManagerCallbacks = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /**
   * Spawn a new barrel at the given position
   */
  spawnBarrel(position: Vec3): BarrelState {
    const id = `barrel-${this.nextBarrelId++}`;
    const barrel: BarrelState = {
      id,
      position: { ...position },
      health: 1,
      isExploding: false,
    };
    this.barrels.set(id, barrel);
    return barrel;
  }

  /**
   * Get all barrels
   */
  getBarrels(): Map<string, BarrelState> {
    return this.barrels;
  }

  /**
   * Get a specific barrel by ID
   */
  getBarrel(id: string): BarrelState | undefined {
    return this.barrels.get(id);
  }

  /**
   * Check if a projectile collides with any barrel
   * Returns the hit barrel or null
   */
  checkProjectileCollision(projectile: ProjectileState): BarrelState | null {
    const { hitboxRadius } = this.config;

    for (const barrel of this.barrels.values()) {
      if (barrel.isExploding) continue;

      // Calculate distance in XZ plane
      const dx = projectile.position.x - barrel.position.x;
      const dz = projectile.position.z - barrel.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // Check collision (projectile radius ~0.1 + barrel hitbox)
      if (distance < hitboxRadius + 0.1) {
        return barrel;
      }
    }

    return null;
  }

  /**
   * Trigger barrel explosion
   * Returns explosion result with damage info and chain-triggered barrels
   */
  explodeBarrel(barrelId: string, gameTime: number): ExplosionResult | null {
    const barrel = this.barrels.get(barrelId);
    if (!barrel || barrel.isExploding) return null;

    // Mark as exploding
    barrel.isExploding = true;

    const result: ExplosionResult = {
      barrelId,
      position: { ...barrel.position },
      radius: this.config.explosionRadius,
      damage: this.config.enemyDamage,
      knockbackForce: this.config.knockbackForce,
      chainTriggeredBarrelIds: [],
    };

    // Find nearby barrels for chain reaction
    for (const otherBarrel of this.barrels.values()) {
      if (otherBarrel.id === barrelId || otherBarrel.isExploding) continue;

      const dx = otherBarrel.position.x - barrel.position.x;
      const dz = otherBarrel.position.z - barrel.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance < this.config.chainReactionRadius) {
        // Queue chain reaction with delay
        this.pendingChainReactions.push({
          barrelId: otherBarrel.id,
          triggerTime: gameTime + this.config.chainReactionDelay,
        });
        result.chainTriggeredBarrelIds.push(otherBarrel.id);
      }
    }

    // Remove exploded barrel
    this.barrels.delete(barrelId);

    // Fire callback
    this.callbacks.onBarrelExplode?.(result);

    return result;
  }

  /**
   * Update barrel manager - handles chain reactions
   * Returns array of explosion results for this frame
   */
  update(gameTime: number): ExplosionResult[] {
    const explosions: ExplosionResult[] = [];

    // Process pending chain reactions
    const stillPending: typeof this.pendingChainReactions = [];

    for (const reaction of this.pendingChainReactions) {
      if (gameTime >= reaction.triggerTime) {
        const result = this.explodeBarrel(reaction.barrelId, gameTime);
        if (result) {
          explosions.push(result);
        }
      } else {
        stillPending.push(reaction);
      }
    }

    this.pendingChainReactions = stillPending;

    return explosions;
  }

  /**
   * Get player damage (different from enemy damage)
   */
  getPlayerDamage(): number {
    return this.config.playerDamage;
  }

  /**
   * Get config
   */
  getConfig(): Readonly<BarrelManagerConfig> {
    return this.config;
  }

  /**
   * Clear all barrels (for map reset)
   */
  clear(): void {
    this.barrels.clear();
    this.pendingChainReactions = [];
    this.nextBarrelId = 0;
  }

  /**
   * Get barrel count
   */
  getBarrelCount(): number {
    return this.barrels.size;
  }
}
