/**
 * EnemyManager - Handles enemy spawning, movement, and spatial partitioning
 *
 * Single Responsibility: Enemy lifecycle, movement physics, spatial indexing
 * Does NOT handle: Damage calculation, death effects, drops
 *
 * Now includes tactical AI for smart enemy behaviors:
 * - Detection (vision/hearing)
 * - Patrol/Alert/Engage states
 * - Cover usage
 * - Ranged combat
 */

import type { EnemyState, MapData, Vec3, Vec2, ProjectileState, EnemyType } from '@shared/types';
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
import { BehaviorStateMachine, BehaviorContext } from '../ai/BehaviorStates';
import { EnemyWeaponSystem } from './EnemyWeaponSystem';

// ============================================================================
// Types
// ============================================================================

export interface SpawnEnemyRequest {
  enemyType: EnemyType;
  spawnPoint: { x: number; y: number };
  targetId: string | null;
}

export interface EnemyUpdateResult {
  /** Enemies that are now in melee attack range */
  attackingEnemies: EnemyState[];
  /** Projectiles created by ranged enemies this frame */
  enemyProjectiles: ProjectileState[];
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
  private behaviorSystem: BehaviorStateMachine;
  private weaponSystem: EnemyWeaponSystem;
  private spatialHash = new SpatialHash<SpatialEntity>(4);
  private callbacks: EnemyManagerCallbacks;

  // Staggered detection - update only a subset of enemies each frame
  private detectionFrameCounter = 0;
  private readonly DETECTION_STAGGER_FRAMES = 3; // Update 1/3 of enemies per frame
  private readonly cachedDetections = new Map<string, { result: import('../ai/DetectionSystem').DetectionResult; frame: number }>();

  constructor(
    mapData: MapData,
    callbacks: EnemyManagerCallbacks = {}
  ) {
    this.mapData = mapData;
    this.ai = new EnemyAI(mapData);
    this.behaviorSystem = new BehaviorStateMachine(mapData);
    this.weaponSystem = new EnemyWeaponSystem();
    this.callbacks = callbacks;

    // Connect AI to spatial hash for O(nearby) separation instead of O(n)
    this.ai.setGetNearbyEnemies((x, z, radius) => this.spatialHash.getNearby(x, z, radius));
  }

  /**
   * Spawn a new enemy
   */
  spawnEnemy(request: SpawnEnemyRequest): EnemyState {
    const config = ENEMY_CONFIGS[request.enemyType];
    const isRanged = 'isRanged' in config && config.isRanged;

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
      state: 'patrol', // Start patrolling
      knockbackVelocity: { x: 0, y: 0 },
      // Tactical AI fields
      tacticalState: 'patrol',
      detectionLevel: 0,
      patrolWaypointIndex: 0,
    };

    // Add to spatial hash
    this.spatialHash.insert({
      id: enemy.id,
      x: enemy.position.x,
      z: enemy.position.z,
      radius: config.hitboxRadius,
    });

    // Initialize weapon state for ranged enemies
    if (isRanged) {
      this.weaponSystem.resetMagazine(enemy);
    }

    this.callbacks.onEnemySpawned?.(enemy);

    return enemy;
  }

  /**
   * Update all enemies - movement, knockback, spatial hash
   * Returns list of enemies in melee attack range and projectiles from ranged enemies
   */
  updateEnemies(
    enemies: Map<string, EnemyState>,
    playerPos: Vec3,
    waveNumber: number,
    dt: number
  ): EnemyUpdateResult {
    const dtSeconds = dt / 1000;
    const now = Date.now();
    const attackingEnemies: EnemyState[] = [];
    const enemyProjectiles: ProjectileState[] = [];
    const playerPos2D: Vec2 = { x: playerPos.x, y: playerPos.z };

    // Increment frame counter for staggered detection
    this.detectionFrameCounter++;
    const currentFrame = this.detectionFrameCounter;
    let enemyIndex = 0;

    for (const enemy of enemies.values()) {
      if (enemy.state === 'dead') continue;

      const config = ENEMY_CONFIGS[enemy.enemyType];
      const isRanged = 'isRanged' in config && config.isRanged;

      // Apply knockback first
      this.applyKnockback(enemy, dtSeconds);

      // Staggered detection - only update 1/3 of enemies per frame
      // Use cached result for others (detection changes slowly)
      const detectionSystem = this.behaviorSystem.getDetectionSystem();
      let detection: import('../ai/DetectionSystem').DetectionResult;

      const shouldUpdateDetection = (enemyIndex % this.DETECTION_STAGGER_FRAMES) === (currentFrame % this.DETECTION_STAGGER_FRAMES);
      enemyIndex++;

      if (shouldUpdateDetection) {
        // Full detection update this frame
        detection = detectionSystem.updateDetection(enemy, playerPos, dtSeconds * this.DETECTION_STAGGER_FRAMES);
        this.cachedDetections.set(enemy.id, { result: detection, frame: currentFrame });
      } else {
        // Use cached detection
        const cached = this.cachedDetections.get(enemy.id);
        if (cached) {
          detection = cached.result;
        } else {
          // No cache yet, do full update
          detection = detectionSystem.updateDetection(enemy, playerPos, dtSeconds);
          this.cachedDetections.set(enemy.id, { result: detection, frame: currentFrame });
        }
      }

      // Run behavior state machine
      const behaviorContext: BehaviorContext = {
        enemy,
        playerPos,
        playerVisible: detection.alertState === 'detected',
        detection,
        dtSeconds,
        now,
      };

      const behavior = this.behaviorSystem.update(behaviorContext);

      // Update enemy state
      enemy.state = behavior.newState;
      enemy.tacticalState = behavior.newState;

      // Get movement direction
      let moveDir: Vec2 | null = behavior.moveDirection;

      // For non-ranged enemies in certain states, use legacy A* pathfinding
      if (!isRanged && (enemy.state === 'chasing' || enemy.state === 'engage' || enemy.state === 'melee')) {
        moveDir = this.ai.getMovementDirection(enemy, playerPos, enemies.values());
      }

      // Apply movement if we have a direction
      if (moveDir && (Math.abs(moveDir.x) > 0.01 || Math.abs(moveDir.y) > 0.01)) {
        const speed = config.speed * getEnemySpeedMultiplier(waveNumber);
        this.applyMovement(enemy, moveDir, speed, dtSeconds);
      }

      // Separation from player (only for melee enemies getting close)
      if (!isRanged) {
        this.applySeparation(enemy, playerPos, config.hitboxRadius);
      }

      // Update spatial hash
      this.spatialHash.update({
        id: enemy.id,
        x: enemy.position.x,
        z: enemy.position.z,
        radius: config.hitboxRadius,
      });

      // Calculate distance
      const enemyPos2D: Vec2 = { x: enemy.position.x, y: enemy.position.z };
      const finalDist = distance(enemyPos2D, playerPos2D);

      // Update rotation
      if (moveDir) {
        this.updateRotation(enemy, moveDir, playerPos, finalDist, config.attackRange);
      } else if (behavior.targetPosition) {
        // Face the target
        enemy.rotation = angleBetween(enemyPos2D, behavior.targetPosition);
      }

      // Handle shooting for ranged enemies
      if (behavior.shouldShoot && isRanged) {
        const shootResult = this.weaponSystem.shoot(enemy, playerPos2D, now);
        if (shootResult.projectile) {
          enemyProjectiles.push(shootResult.projectile);
        }
      }

      // Check if in melee attack range (for melee enemies or close-range ranged)
      const minSeparation = PLAYER_HITBOX_RADIUS + config.hitboxRadius;
      const meleeRange = isRanged ? 1.5 : Math.max(config.attackRange, minSeparation + 0.1);

      if (finalDist < meleeRange && enemy.state === 'attacking') {
        attackingEnemies.push(enemy);
      }

      this.callbacks.onEnemyMoved?.(enemy);
    }

    return { attackingEnemies, enemyProjectiles };
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
    this.weaponSystem.removeEnemy(enemyId);
    this.behaviorSystem.getCoverSystem().releaseCover(enemyId);
    this.cachedDetections.delete(enemyId);
  }

  /**
   * Register a noise event (for detection system)
   */
  registerNoise(position: Vec2, type: 'gunshot' | 'footstep' | 'explosion'): void {
    this.behaviorSystem.registerNoise(position, type);
  }

  /**
   * Get the behavior system (for debug/visualization)
   */
  getBehaviorSystem(): BehaviorStateMachine {
    return this.behaviorSystem;
  }

  /**
   * Get the weapon system
   */
  getWeaponSystem(): EnemyWeaponSystem {
    return this.weaponSystem;
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
