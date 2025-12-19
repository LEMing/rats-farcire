/**
 * EnemyManager - Handles enemy spawning, movement, and spatial partitioning
 *
 * Single Responsibility: Enemy lifecycle, movement physics, spatial indexing
 * Does NOT handle: Damage calculation, death effects, drops
 */

import type { EnemyState, MapData, Vec3 } from '@shared/types';
import {
  ENEMY_CONFIGS,
  TILE_SIZE,
  WALL_COLLISION_BUFFER,
  PLAYER_HITBOX_RADIUS,
  getEnemySpeedMultiplier,
} from '@shared/constants';
import { generateId, isWalkableWithRadius, distance, angleBetween } from '@shared/utils';
import { processKnockback } from './KnockbackUtils';
import { SpatialHash, SpatialEntity } from './SpatialHash';
import { EnemyAI } from '../ai/EnemyAI';

// ============================================================================
// Types
// ============================================================================

export interface SpawnEnemyRequest {
  enemyType: 'grunt' | 'runner' | 'tank';
  spawnPoint: { x: number; y: number };
  targetId: string | null;
}

export interface EnemyUpdateResult {
  /** Enemies that are now in attack range */
  attackingEnemies: EnemyState[];
}

export interface EnemyManagerCallbacks {
  onEnemySpawned?: (enemy: EnemyState) => void;
  onEnemyMoved?: (enemy: EnemyState) => void;
}

// ============================================================================
// EnemyManager
// ============================================================================

export class EnemyManager {
  private mapData: MapData;
  private ai: EnemyAI;
  private spatialHash = new SpatialHash<SpatialEntity>(4);
  private callbacks: EnemyManagerCallbacks;

  constructor(
    mapData: MapData,
    callbacks: EnemyManagerCallbacks = {}
  ) {
    this.mapData = mapData;
    this.ai = new EnemyAI(mapData);
    this.callbacks = callbacks;
  }

  /**
   * Spawn a new enemy
   */
  spawnEnemy(request: SpawnEnemyRequest): EnemyState {
    const config = ENEMY_CONFIGS[request.enemyType];

    const enemy: EnemyState = {
      id: generateId(),
      type: 'enemy',
      position: {
        x: request.spawnPoint.x * TILE_SIZE,
        y: 0.5,
        z: request.spawnPoint.y * TILE_SIZE,
      },
      rotation: 0,
      velocity: { x: 0, y: 0 },
      health: config.health,
      maxHealth: config.health,
      enemyType: request.enemyType,
      targetId: request.targetId,
      state: 'idle',
      knockbackVelocity: { x: 0, y: 0 },
    };

    // Add to spatial hash
    this.spatialHash.insert({
      id: enemy.id,
      x: enemy.position.x,
      z: enemy.position.z,
      radius: config.hitboxRadius,
    });

    this.callbacks.onEnemySpawned?.(enemy);

    return enemy;
  }

  /**
   * Update all enemies - movement, knockback, spatial hash
   * Returns list of enemies in attack range
   */
  updateEnemies(
    enemies: Map<string, EnemyState>,
    playerPos: Vec3,
    waveNumber: number,
    dt: number
  ): EnemyUpdateResult {
    const dtSeconds = dt / 1000;
    const attackingEnemies: EnemyState[] = [];
    const playerPos2D = { x: playerPos.x, y: playerPos.z };

    for (const enemy of enemies.values()) {
      if (enemy.state === 'dead') continue;

      const config = ENEMY_CONFIGS[enemy.enemyType];

      // Apply knockback
      this.applyKnockback(enemy, dtSeconds);

      // Get AI movement direction
      const moveDir = this.ai.getMovementDirection(
        enemy,
        playerPos,
        enemies.values()
      );

      // Move enemy (speed scales with wave)
      const speed = config.speed * getEnemySpeedMultiplier(waveNumber);
      this.applyMovement(enemy, moveDir, speed, dtSeconds);

      // Separation from player
      this.applySeparation(enemy, playerPos, config.hitboxRadius);

      // Update spatial hash
      this.spatialHash.update({
        id: enemy.id,
        x: enemy.position.x,
        z: enemy.position.z,
        radius: config.hitboxRadius,
      });

      // Calculate distance and update state
      const finalDist = distance(
        { x: enemy.position.x, y: enemy.position.z },
        playerPos2D
      );

      // Update rotation
      this.updateRotation(enemy, moveDir, playerPos, finalDist, config.attackRange);

      // Check if in attack range
      const minSeparation = PLAYER_HITBOX_RADIUS + config.hitboxRadius;
      const effectiveAttackRange = Math.max(config.attackRange, minSeparation + 0.1);

      if (finalDist < effectiveAttackRange) {
        enemy.state = 'attacking';
        attackingEnemies.push(enemy);
      } else {
        enemy.state = 'chasing';
      }

      this.callbacks.onEnemyMoved?.(enemy);
    }

    return { attackingEnemies };
  }

  /**
   * Apply knockback to enemy
   */
  private applyKnockback(enemy: EnemyState, dtSeconds: number): void {
    if (!enemy.knockbackVelocity) return;
    if (enemy.knockbackVelocity.x === 0 && enemy.knockbackVelocity.y === 0) return;

    const wallChecker = (x: number, z: number) =>
      isWalkableWithRadius(this.mapData, x, z, WALL_COLLISION_BUFFER);

    const result = processKnockback(
      { position: { x: enemy.position.x, y: enemy.position.z }, velocity: enemy.knockbackVelocity },
      dtSeconds,
      wallChecker
    );

    enemy.position.x = result.position.x;
    enemy.position.z = result.position.y;
    enemy.knockbackVelocity = result.velocity;
  }

  /**
   * Apply movement in direction with wall collision
   */
  private applyMovement(
    enemy: EnemyState,
    moveDir: { x: number; y: number },
    speed: number,
    dtSeconds: number
  ): void {
    let newX = enemy.position.x + moveDir.x * speed * dtSeconds;
    let newZ = enemy.position.z + moveDir.y * speed * dtSeconds;

    // Wall collision
    if (!isWalkableWithRadius(this.mapData, newX, enemy.position.z, WALL_COLLISION_BUFFER)) {
      newX = enemy.position.x;
    }
    if (!isWalkableWithRadius(this.mapData, enemy.position.x, newZ, WALL_COLLISION_BUFFER)) {
      newZ = enemy.position.z;
    }

    enemy.position.x = newX;
    enemy.position.z = newZ;
  }

  /**
   * Apply separation from player to prevent overlap
   */
  private applySeparation(
    enemy: EnemyState,
    playerPos: Vec3,
    hitboxRadius: number
  ): void {
    const minSeparation = PLAYER_HITBOX_RADIUS + hitboxRadius;
    const toPlayer = {
      x: playerPos.x - enemy.position.x,
      y: playerPos.z - enemy.position.z,
    };
    const distToPlayer = Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.y * toPlayer.y);

    if (distToPlayer < minSeparation && distToPlayer > 0.01) {
      // Push enemy away from player
      const overlap = minSeparation - distToPlayer;
      const pushX = -(toPlayer.x / distToPlayer) * overlap;
      const pushZ = -(toPlayer.y / distToPlayer) * overlap;

      // Apply push with wall collision check
      let pushedX = enemy.position.x + pushX;
      let pushedZ = enemy.position.z + pushZ;

      if (!isWalkableWithRadius(this.mapData, pushedX, enemy.position.z, WALL_COLLISION_BUFFER)) {
        pushedX = enemy.position.x;
      }
      if (!isWalkableWithRadius(this.mapData, enemy.position.x, pushedZ, WALL_COLLISION_BUFFER)) {
        pushedZ = enemy.position.z;
      }

      enemy.position.x = pushedX;
      enemy.position.z = pushedZ;
    }
  }

  /**
   * Update enemy rotation to face movement or player
   */
  private updateRotation(
    enemy: EnemyState,
    moveDir: { x: number; y: number },
    playerPos: Vec3,
    distToPlayer: number,
    attackRange: number
  ): void {
    const enemyPos2D = { x: enemy.position.x, y: enemy.position.z };
    const playerPos2D = { x: playerPos.x, y: playerPos.z };

    if (distToPlayer < attackRange * 1.5) {
      // Close to player - face them for attack
      enemy.rotation = angleBetween(enemyPos2D, playerPos2D);
    } else if (Math.abs(moveDir.x) > 0.01 || Math.abs(moveDir.y) > 0.01) {
      // Face movement direction
      enemy.rotation = Math.atan2(moveDir.x, moveDir.y);
    }
  }

  /**
   * Remove enemy from spatial hash (call when enemy dies)
   */
  removeEnemy(enemyId: string): void {
    this.spatialHash.remove(enemyId);
  }

  /**
   * Get nearby enemies using spatial hash
   */
  getNearbyEnemies(x: number, z: number, radius: number): readonly SpatialEntity[] {
    return this.spatialHash.getNearby(x, z, radius);
  }

  /**
   * Check if enemy is in attack range of player
   */
  isInAttackRange(enemy: EnemyState, playerPos: Vec3): boolean {
    const config = ENEMY_CONFIGS[enemy.enemyType];
    const minSeparation = PLAYER_HITBOX_RADIUS + config.hitboxRadius;
    const effectiveAttackRange = Math.max(config.attackRange, minSeparation + 0.1);

    const dist = distance(
      { x: enemy.position.x, y: enemy.position.z },
      { x: playerPos.x, y: playerPos.z }
    );

    return dist < effectiveAttackRange;
  }

  /**
   * Get attack damage for enemy (per second)
   */
  getEnemyDamage(enemy: EnemyState): number {
    return ENEMY_CONFIGS[enemy.enemyType].damage;
  }

  /**
   * Get enemy config
   */
  getEnemyConfig(enemyType: 'grunt' | 'runner' | 'tank') {
    return ENEMY_CONFIGS[enemyType];
  }
}
