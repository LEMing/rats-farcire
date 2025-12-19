/**
 * ProjectileManager - Handles projectile physics and lifecycle
 *
 * Single Responsibility: Projectile movement, homing, wall collision, lifetime
 * Does NOT handle: Enemy collision detection, damage application
 */

import type { ProjectileState, MapData, EnemyState, Vec3 } from '@shared/types';
import { normalize, distance, isWalkable } from '@shared/utils';

// ============================================================================
// Types
// ============================================================================

export interface ProjectileUpdateResult {
  /** Projectiles that should be removed (lifetime expired, wall hit) */
  toRemove: string[];
  /** Positions where rockets exploded (for area damage) */
  rocketExplosions: Vec3[];
}

export interface ProjectileManagerConfig {
  /** Homing strength for rockets (0-1) */
  homingStrength?: number;
  /** Max distance for homing to engage */
  homingRange?: number;
}

const DEFAULT_CONFIG: Required<ProjectileManagerConfig> = {
  homingStrength: 0.08,
  homingRange: 20,
};

// ============================================================================
// ProjectileManager
// ============================================================================

export class ProjectileManager {
  private mapData: MapData;
  private config: Required<ProjectileManagerConfig>;

  constructor(mapData: MapData, config: ProjectileManagerConfig = {}) {
    this.mapData = mapData;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update projectile physics (movement, homing, wall collision, lifetime)
   * Does NOT handle enemy collision - that's returned for caller to process
   */
  updatePhysics(
    projectiles: Map<string, ProjectileState>,
    enemies: Map<string, EnemyState>,
    gameTime: number,
    dt: number
  ): ProjectileUpdateResult {
    const dtSeconds = dt / 1000;
    const toRemove: string[] = [];
    const rocketExplosions: Vec3[] = [];

    for (const [id, proj] of projectiles) {
      // Rocket homing behavior
      if (proj.weaponType === 'rocket') {
        this.applyRocketHoming(proj, enemies);
      }

      // Move projectile
      proj.position.x += proj.velocity.x * dtSeconds;
      proj.position.z += proj.velocity.y * dtSeconds;

      // Check lifetime
      if (gameTime - proj.createdAt > proj.lifetime) {
        if (proj.weaponType === 'rocket') {
          rocketExplosions.push({ ...proj.position });
        }
        toRemove.push(id);
        continue;
      }

      // Check wall collision
      if (!isWalkable(this.mapData, proj.position.x, proj.position.z)) {
        if (proj.weaponType === 'rocket') {
          rocketExplosions.push({ ...proj.position });
        }
        toRemove.push(id);
        continue;
      }
    }

    return { toRemove, rocketExplosions };
  }

  /**
   * Apply homing behavior to rocket projectiles
   */
  private applyRocketHoming(
    proj: ProjectileState,
    enemies: Map<string, EnemyState>
  ): void {
    let nearestEnemy: EnemyState | null = null;
    let nearestDist = Infinity;

    // Find nearest alive enemy within range
    for (const enemy of enemies.values()) {
      if (enemy.state === 'dead') continue;
      const dist = distance(
        { x: proj.position.x, y: proj.position.z },
        { x: enemy.position.x, y: enemy.position.z }
      );
      if (dist < nearestDist && dist < this.config.homingRange) {
        nearestDist = dist;
        nearestEnemy = enemy;
      }
    }

    if (!nearestEnemy) return;

    // Calculate direction to target
    const toTarget = normalize({
      x: nearestEnemy.position.x - proj.position.x,
      y: nearestEnemy.position.z - proj.position.z,
    });

    // Current velocity direction
    const currentSpeed = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
    const currentDir = normalize({ x: proj.velocity.x, y: proj.velocity.y });

    // Smoothly steer towards target
    const newDirX = currentDir.x + (toTarget.x - currentDir.x) * this.config.homingStrength;
    const newDirY = currentDir.y + (toTarget.y - currentDir.y) * this.config.homingStrength;
    const newDir = normalize({ x: newDirX, y: newDirY });

    // Apply new velocity
    proj.velocity.x = newDir.x * currentSpeed;
    proj.velocity.y = newDir.y * currentSpeed;
    proj.rotation = Math.atan2(newDir.x, newDir.y);
  }

  /**
   * Mark a projectile for removal (called when it hits an enemy)
   */
  markForRemoval(projectileId: string, projectiles: Map<string, ProjectileState>): Vec3 | null {
    const proj = projectiles.get(projectileId);
    if (!proj) return null;

    // Return explosion position if it's a rocket
    if (proj.weaponType === 'rocket') {
      return { ...proj.position };
    }
    return null;
  }
}
