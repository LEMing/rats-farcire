/**
 * BehaviorStates - State machine for tactical enemy AI
 *
 * Manages transitions between:
 * - Patrol: Walking waypoints, scanning for player
 * - Alert: Noticed something, investigating
 * - Engage: Actively fighting (ranged or moving to melee)
 * - Cover: Behind cover, peeking to shoot
 * - Retreat: Low health, falling back
 * - Melee: Close range attack
 */

import type { EnemyState, Vec2, Vec3, TacticalState, MapData, Room } from '@shared/types';
import { ENEMY_CONFIGS, COVER_CONFIG, TILE_SIZE } from '@shared/constants';
import { distance, normalize } from '@shared/utils';
import { DetectionSystem, DetectionResult } from './DetectionSystem';
import { CoverSystem } from './CoverSystem';

// ============================================================================
// Types
// ============================================================================

export interface BehaviorContext {
  enemy: EnemyState;
  playerPos: Vec3;
  playerVisible: boolean;
  detection: DetectionResult;
  dtSeconds: number;
  now: number;
}

export interface BehaviorOutput {
  newState: TacticalState;
  moveDirection: Vec2 | null;
  shouldShoot: boolean;
  targetPosition: Vec2 | null;
}

// ============================================================================
// State Handlers
// ============================================================================

export class BehaviorStateMachine {
  private detectionSystem: DetectionSystem;
  private coverSystem: CoverSystem;
  private patrolWaypoints: Map<string, Vec2[]> = new Map();
  private mapData: MapData;

  constructor(mapData: MapData) {
    this.mapData = mapData;
    this.detectionSystem = new DetectionSystem(mapData);
    this.coverSystem = new CoverSystem(mapData);
    this.generatePatrolWaypoints();
  }

  /**
   * Generate patrol waypoints for each room
   */
  private generatePatrolWaypoints(): void {
    for (const room of this.mapData.rooms) {
      const waypoints: Vec2[] = [];

      // Create waypoints at room corners (inset)
      const inset = 1.5;
      const corners = [
        { x: room.x + inset, y: room.y + inset },
        { x: room.x + room.width - inset, y: room.y + inset },
        { x: room.x + room.width - inset, y: room.y + room.height - inset },
        { x: room.x + inset, y: room.y + room.height - inset },
      ];

      for (const corner of corners) {
        waypoints.push({
          x: corner.x * TILE_SIZE,
          y: corner.y * TILE_SIZE,
        });
      }

      const roomId = `${room.x}_${room.y}`;
      this.patrolWaypoints.set(roomId, waypoints);
    }
  }

  /**
   * Find which room an enemy is in
   */
  private findEnemyRoom(enemy: EnemyState): Room | null {
    const tileX = Math.floor(enemy.position.x / TILE_SIZE);
    const tileY = Math.floor(enemy.position.z / TILE_SIZE);

    for (const room of this.mapData.rooms) {
      if (
        tileX >= room.x &&
        tileX < room.x + room.width &&
        tileY >= room.y &&
        tileY < room.y + room.height
      ) {
        return room;
      }
    }
    return null;
  }

  /**
   * Get patrol waypoints for enemy's current room
   */
  private getPatrolWaypoints(enemy: EnemyState): Vec2[] {
    const room = this.findEnemyRoom(enemy);
    if (!room) return [];

    const roomId = `${room.x}_${room.y}`;
    return this.patrolWaypoints.get(roomId) ?? [];
  }

  /**
   * Update enemy behavior state and get movement/action output
   */
  update(context: BehaviorContext): BehaviorOutput {
    const { enemy, playerPos, detection } = context;
    const config = ENEMY_CONFIGS[enemy.enemyType];
    const isRanged = 'isRanged' in config && config.isRanged;
    const isHunter = 'isHunter' in config && config.isHunter;

    // Hunters are special - they always know where the player is
    if (isHunter) {
      // Force detection to max level
      enemy.detectionLevel = 1.0;
      // Always update last known position to current player position
      enemy.lastKnownPlayerPos = { x: playerPos.x, y: playerPos.z };

      // Skip patrol, go straight to engage
      if (enemy.tacticalState === 'patrol' || enemy.tacticalState === 'alert') {
        enemy.tacticalState = 'engage';
        enemy.state = 'engage';
      }
    }

    // Get current tactical state (default to patrol for new enemies)
    const currentState = enemy.tacticalState ?? 'patrol';

    // Update detection on enemy (hunters already handled above)
    if (!isHunter) {
      enemy.detectionLevel = detection.detectionLevel;
      if (detection.lastKnownPos) {
        enemy.lastKnownPlayerPos = detection.lastKnownPos;
      }
    }

    // Determine next state and behavior
    switch (currentState) {
      case 'patrol':
        return this.handlePatrol(context, isRanged);

      case 'alert':
        return this.handleAlert(context, isRanged);

      case 'engage':
        return this.handleEngage(context, isRanged);

      case 'cover':
        return this.handleCover(context);

      case 'retreat':
        return this.handleRetreat(context);

      case 'melee':
        return this.handleMelee(context);

      // Legacy states - redirect to new system
      case 'idle':
      case 'chasing':
      case 'attacking':
        return this.handleLegacy(context, isRanged);

      case 'dead':
        return {
          newState: 'dead',
          moveDirection: null,
          shouldShoot: false,
          targetPosition: null,
        };

      default:
        return this.handlePatrol(context, isRanged);
    }
  }

  /**
   * Handle PATROL state - walk waypoints, scan for player
   */
  private handlePatrol(context: BehaviorContext, isRanged: boolean): BehaviorOutput {
    const { enemy, detection } = context; // playerPos, dtSeconds, now unused here

    // Check for state transitions
    if (detection.alertState === 'detected') {
      return this.transitionTo(context, isRanged ? 'engage' : 'chasing');
    }

    if (detection.alertState === 'suspicious') {
      return this.transitionTo(context, 'alert');
    }

    // Continue patrol
    const waypoints = this.getPatrolWaypoints(enemy);
    if (waypoints.length === 0) {
      return {
        newState: 'patrol',
        moveDirection: null,
        shouldShoot: false,
        targetPosition: null,
      };
    }

    const waypointIndex = enemy.patrolWaypointIndex ?? 0;
    const targetWaypoint = waypoints[waypointIndex % waypoints.length];
    const enemyPos: Vec2 = { x: enemy.position.x, y: enemy.position.z };

    const dist = distance(enemyPos, targetWaypoint);

    if (dist < TILE_SIZE) {
      // Reached waypoint, go to next
      enemy.patrolWaypointIndex = (waypointIndex + 1) % waypoints.length;
    }

    const moveDir = normalize({
      x: targetWaypoint.x - enemyPos.x,
      y: targetWaypoint.y - enemyPos.y,
    });

    return {
      newState: 'patrol',
      moveDirection: moveDir,
      shouldShoot: false,
      targetPosition: targetWaypoint,
    };
  }

  /**
   * Handle ALERT state - investigate last known position
   */
  private handleAlert(context: BehaviorContext, isRanged: boolean): BehaviorOutput {
    const { enemy, detection } = context;
    const enemyPos: Vec2 = { x: enemy.position.x, y: enemy.position.z };

    // Check for state transitions
    if (detection.alertState === 'detected') {
      return this.transitionTo(context, isRanged ? 'engage' : 'chasing');
    }

    if (detection.alertState === 'unaware') {
      // Lost track, return to patrol
      return this.transitionTo(context, 'patrol');
    }

    // Move toward last known position
    const targetPos = enemy.lastKnownPlayerPos;
    if (!targetPos) {
      return this.transitionTo(context, 'patrol');
    }

    const dist = distance(enemyPos, targetPos);

    if (dist < TILE_SIZE * 2) {
      // Reached investigation point, nothing found
      enemy.lastKnownPlayerPos = undefined;
      return this.transitionTo(context, 'patrol');
    }

    const moveDir = normalize({
      x: targetPos.x - enemyPos.x,
      y: targetPos.y - enemyPos.y,
    });

    return {
      newState: 'alert',
      moveDirection: moveDir,
      shouldShoot: false,
      targetPosition: targetPos,
    };
  }

  /**
   * Handle ENGAGE state - actively fighting (ranged)
   */
  private handleEngage(context: BehaviorContext, isRanged: boolean): BehaviorOutput {
    const { enemy, playerPos, detection, now } = context;
    const config = ENEMY_CONFIGS[enemy.enemyType];
    const enemyPos: Vec2 = { x: enemy.position.x, y: enemy.position.z };
    const playerPos2D: Vec2 = { x: playerPos.x, y: playerPos.z };
    const isHunter = 'isHunter' in config && config.isHunter;

    // Check for retreat (low health) - but hunters never retreat
    const healthPercent = enemy.health / enemy.maxHealth;
    if (healthPercent < 0.25 && isRanged && !isHunter) {
      return this.transitionTo(context, 'retreat');
    }

    // Lost detection - but hunters always know where player is
    if (detection.alertState === 'unaware' && !isHunter) {
      return this.transitionTo(context, 'alert');
    }

    const dist = distance(enemyPos, playerPos2D);

    // Melee enemies go to melee when close (hunters NEVER go to melee)
    if (!isRanged && dist < config.attackRange * 1.5) {
      return this.transitionTo(context, 'melee');
    }

    // Ranged enemies seek cover when too close - hunters back away instead of taking cover
    if (isRanged) {
      // Hunters maintain distance - they should fight from 8+ tiles away
      const hunterMinDist = 8 * TILE_SIZE;

      if (isHunter) {
        // Hunters: always hunt, maintain distance, never use cover
        const lastShot = enemy.lastShotTime ?? 0;
        const canShoot = now - lastShot >= config.attackCooldown;
        const hasLOS = this.detectionSystem.hasLineOfSight(enemyPos, playerPos2D);

        // Shoot while backing away if too close
        if (dist < hunterMinDist) {
          // Too close - back away while shooting
          const moveDir = normalize({
            x: enemyPos.x - playerPos2D.x,
            y: enemyPos.y - playerPos2D.y,
          });

          return {
            newState: 'engage',
            moveDirection: moveDir,
            shouldShoot: canShoot && hasLOS && dist <= config.attackRange * TILE_SIZE,
            targetPosition: playerPos2D,
          };
        }

        // At good distance or far - shoot if possible, advance if needed
        if (canShoot && hasLOS && dist <= config.attackRange * TILE_SIZE) {
          return {
            newState: 'engage',
            moveDirection: null,
            shouldShoot: true,
            targetPosition: playerPos2D,
          };
        }

        // Move to optimal range (60% of attack range, but not closer than hunterMinDist)
        const idealDist = Math.max(config.attackRange * TILE_SIZE * 0.6, hunterMinDist);
        let moveDir: Vec2 | null = null;

        if (dist > idealDist + TILE_SIZE) {
          // Too far, move closer (but hunter actively hunts)
          moveDir = normalize({
            x: playerPos2D.x - enemyPos.x,
            y: playerPos2D.y - enemyPos.y,
          });
        }

        return {
          newState: 'engage',
          moveDirection: moveDir,
          shouldShoot: false,
          targetPosition: playerPos2D,
        };
      }

      // Non-hunter ranged enemies: use cover when too close
      if (dist < 5 * TILE_SIZE) {
        // Too close, find cover
        const cover = this.coverSystem.findBestCover(enemyPos, playerPos2D, enemy.id);
        if (cover) {
          this.coverSystem.claimCover(cover.id, enemy.id);
          enemy.coverPointId = cover.id;
          return this.transitionTo(context, 'cover');
        }
      }

      // Check if should shoot
      const lastShot = enemy.lastShotTime ?? 0;
      const canShoot = now - lastShot >= config.attackCooldown;
      const hasLOS = this.detectionSystem.hasLineOfSight(enemyPos, playerPos2D);

      if (canShoot && hasLOS && dist <= config.attackRange * TILE_SIZE) {
        return {
          newState: 'engage',
          moveDirection: null,
          shouldShoot: true,
          targetPosition: playerPos2D,
        };
      }

      // Move to better position
      const idealDist = config.attackRange * TILE_SIZE * 0.6;
      let moveDir: Vec2 | null = null;

      if (dist > idealDist + TILE_SIZE) {
        // Too far, move closer
        moveDir = normalize({
          x: playerPos2D.x - enemyPos.x,
          y: playerPos2D.y - enemyPos.y,
        });
      } else if (dist < idealDist - TILE_SIZE) {
        // Too close, back away
        moveDir = normalize({
          x: enemyPos.x - playerPos2D.x,
          y: enemyPos.y - playerPos2D.y,
        });
      }

      return {
        newState: 'engage',
        moveDirection: moveDir,
        shouldShoot: false,
        targetPosition: playerPos2D,
      };
    }

    // Melee enemies: chase player
    const moveDir = normalize({
      x: playerPos2D.x - enemyPos.x,
      y: playerPos2D.y - enemyPos.y,
    });

    return {
      newState: 'engage',
      moveDirection: moveDir,
      shouldShoot: false,
      targetPosition: playerPos2D,
    };
  }

  /**
   * Handle COVER state - behind cover, peek and shoot
   */
  private handleCover(context: BehaviorContext): BehaviorOutput {
    const { enemy, playerPos, detection, now } = context;
    const config = ENEMY_CONFIGS[enemy.enemyType];
    const enemyPos: Vec2 = { x: enemy.position.x, y: enemy.position.z };
    const playerPos2D: Vec2 = { x: playerPos.x, y: playerPos.z };

    // Lost detection
    if (detection.alertState === 'unaware') {
      this.coverSystem.releaseCover(enemy.id);
      enemy.coverPointId = undefined;
      return this.transitionTo(context, 'alert');
    }

    // Get cover point
    const cover = enemy.coverPointId ? this.coverSystem.getCover(enemy.coverPointId) : null;
    if (!cover) {
      return this.transitionTo(context, 'engage');
    }

    // Check if we're at cover position
    const distToCover = distance(enemyPos, cover.position);
    if (distToCover > TILE_SIZE) {
      // Move to cover
      const moveDir = normalize({
        x: cover.position.x - enemyPos.x,
        y: cover.position.y - enemyPos.y,
      });

      return {
        newState: 'cover',
        moveDirection: moveDir,
        shouldShoot: false,
        targetPosition: cover.position,
      };
    }

    // At cover - peek and shoot cycle
    const lastShot = enemy.lastShotTime ?? 0;
    const timeSinceShot = now - lastShot;

    // Hiding phase
    if (timeSinceShot < COVER_CONFIG.hideDuration) {
      return {
        newState: 'cover',
        moveDirection: null,
        shouldShoot: false,
        targetPosition: null,
      };
    }

    // Peeking phase - move to peek position and shoot
    const peekPos = this.coverSystem.getPeekPosition(cover, playerPos2D);
    const distToPeek = distance(enemyPos, peekPos);

    if (distToPeek > TILE_SIZE * 0.3) {
      // Move to peek position
      const moveDir = normalize({
        x: peekPos.x - enemyPos.x,
        y: peekPos.y - enemyPos.y,
      });

      return {
        newState: 'cover',
        moveDirection: moveDir,
        shouldShoot: false,
        targetPosition: peekPos,
      };
    }

    // At peek position - shoot if we have LOS
    const hasLOS = this.detectionSystem.hasLineOfSight(enemyPos, playerPos2D);
    const dist = distance(enemyPos, playerPos2D);

    if (hasLOS && dist <= config.attackRange * TILE_SIZE) {
      return {
        newState: 'cover',
        moveDirection: null,
        shouldShoot: true,
        targetPosition: playerPos2D,
      };
    }

    return {
      newState: 'cover',
      moveDirection: null,
      shouldShoot: false,
      targetPosition: null,
    };
  }

  /**
   * Handle RETREAT state - fall back when low health
   */
  private handleRetreat(context: BehaviorContext): BehaviorOutput {
    const { enemy, playerPos, detection } = context;
    const enemyPos: Vec2 = { x: enemy.position.x, y: enemy.position.z };
    const playerPos2D: Vec2 = { x: playerPos.x, y: playerPos.z };

    // If we've recovered health, go back to fighting
    const healthPercent = enemy.health / enemy.maxHealth;
    if (healthPercent > 0.5) {
      return this.transitionTo(context, 'engage');
    }

    // Lost player, return to patrol
    if (detection.alertState === 'unaware') {
      return this.transitionTo(context, 'patrol');
    }

    // Find cover while retreating
    const cover = this.coverSystem.findBestCover(enemyPos, playerPos2D, enemy.id);
    if (cover) {
      this.coverSystem.claimCover(cover.id, enemy.id);
      enemy.coverPointId = cover.id;
      return this.transitionTo(context, 'cover');
    }

    // No cover available, just run away
    const moveDir = normalize({
      x: enemyPos.x - playerPos2D.x,
      y: enemyPos.y - playerPos2D.y,
    });

    return {
      newState: 'retreat',
      moveDirection: moveDir,
      shouldShoot: false,
      targetPosition: null,
    };
  }

  /**
   * Handle MELEE state - close range attack
   */
  private handleMelee(context: BehaviorContext): BehaviorOutput {
    const { enemy, playerPos, detection } = context;
    const config = ENEMY_CONFIGS[enemy.enemyType];
    const enemyPos: Vec2 = { x: enemy.position.x, y: enemy.position.z };
    const playerPos2D: Vec2 = { x: playerPos.x, y: playerPos.z };

    const dist = distance(enemyPos, playerPos2D);

    // Too far for melee, go back to engage/chase
    if (dist > config.attackRange * 2) {
      return this.transitionTo(context, 'engage');
    }

    // Lost player
    if (detection.alertState === 'unaware') {
      return this.transitionTo(context, 'alert');
    }

    // In melee range - attack (handled by game loop)
    if (dist <= config.attackRange) {
      return {
        newState: 'attacking', // Use legacy state for melee damage
        moveDirection: null,
        shouldShoot: false,
        targetPosition: playerPos2D,
      };
    }

    // Close the gap
    const moveDir = normalize({
      x: playerPos2D.x - enemyPos.x,
      y: playerPos2D.y - enemyPos.y,
    });

    return {
      newState: 'melee',
      moveDirection: moveDir,
      shouldShoot: false,
      targetPosition: playerPos2D,
    };
  }

  /**
   * Handle legacy states - redirect to new system
   */
  private handleLegacy(context: BehaviorContext, isRanged: boolean): BehaviorOutput {
    const { detection } = context;

    if (detection.alertState === 'detected') {
      return this.transitionTo(context, isRanged ? 'engage' : 'melee');
    }

    if (detection.alertState === 'suspicious') {
      return this.transitionTo(context, 'alert');
    }

    return this.transitionTo(context, 'patrol');
  }

  /**
   * Helper to transition to a new state
   * Returns a default output - the new state will be fully handled on next update
   */
  private transitionTo(context: BehaviorContext, newState: TacticalState): BehaviorOutput {
    context.enemy.tacticalState = newState;
    context.enemy.state = newState;

    // Return a default output - don't recursively call update to avoid infinite loop
    // The new state behavior will be executed on the next frame
    return {
      newState,
      moveDirection: null,
      shouldShoot: false,
      targetPosition: null,
    };
  }

  /**
   * Get detection system for external use
   */
  getDetectionSystem(): DetectionSystem {
    return this.detectionSystem;
  }

  /**
   * Get cover system for external use
   */
  getCoverSystem(): CoverSystem {
    return this.coverSystem;
  }

  /**
   * Register a noise event (gunshot, explosion, etc.)
   */
  registerNoise(position: Vec2, type: 'gunshot' | 'footstep' | 'explosion'): void {
    this.detectionSystem.registerNoise(position, type);
  }
}
