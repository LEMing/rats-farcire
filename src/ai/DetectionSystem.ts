/**
 * DetectionSystem - Handles enemy awareness of the player
 *
 * Features:
 * - Vision cone detection (central + peripheral)
 * - Hearing (gunshots, footsteps)
 * - Alert propagation between enemies
 * - Detection level tracking (0-1)
 */

import type { EnemyState, Vec2, Vec3, MapData } from '@shared/types';
import { DETECTION_CONFIG, TILE_SIZE } from '@shared/constants';
import { distance, normalize } from '@shared/utils';

// ============================================================================
// Types
// ============================================================================

export interface DetectionResult {
  detectionLevel: number;
  lastKnownPos: Vec2 | null;
  alertState: 'unaware' | 'suspicious' | 'detected';
}

export interface NoiseEvent {
  position: Vec2;
  radius: number;
  timestamp: number;
  type: 'gunshot' | 'footstep' | 'explosion';
}

// ============================================================================
// DetectionSystem
// ============================================================================

// LOS cache entry
interface LOSCacheEntry {
  result: boolean;
  timestamp: number;
}

export class DetectionSystem {
  private mapData: MapData;
  private noiseEvents: NoiseEvent[] = [];
  private readonly NOISE_LIFETIME = 500; // ms

  // LOS cache - avoids expensive raycasting every frame
  private readonly losCache = new Map<string, LOSCacheEntry>();
  private readonly LOS_CACHE_TTL = 150; // ms - cache results for 150ms
  private readonly LOS_CACHE_MAX_SIZE = 500;
  private losCacheCleanupCounter = 0;

  constructor(mapData: MapData) {
    this.mapData = mapData;
  }

  /**
   * Get LOS cache key for two positions (rounded to reduce cache misses)
   */
  private getLOSCacheKey(from: Vec2, to: Vec2): string {
    // Round to 0.5 units to increase cache hits while maintaining accuracy
    const fx = Math.round(from.x * 2) / 2;
    const fy = Math.round(from.y * 2) / 2;
    const tx = Math.round(to.x * 2) / 2;
    const ty = Math.round(to.y * 2) / 2;
    return `${fx},${fy}-${tx},${ty}`;
  }

  /**
   * Update detection level for an enemy based on player position
   */
  updateDetection(
    enemy: EnemyState,
    playerPos: Vec3,
    dtSeconds: number
  ): DetectionResult {
    const enemyPos2D: Vec2 = { x: enemy.position.x, y: enemy.position.z };
    const playerPos2D: Vec2 = { x: playerPos.x, y: playerPos.z };
    const currentLevel = enemy.detectionLevel ?? 0;

    // Check if player is visible
    const visibilityResult = this.checkVisibility(enemy, playerPos2D);

    let newLevel = currentLevel;

    if (visibilityResult.visible) {
      // Player is visible - increase detection
      const rate = visibilityResult.inCentralVision
        ? DETECTION_CONFIG.centralDetectionRate
        : DETECTION_CONFIG.peripheralDetectionRate;

      newLevel = Math.min(1, currentLevel + rate * dtSeconds);
    } else {
      // Player not visible - check for noise
      const heardNoise = this.checkHearing(enemyPos2D, playerPos2D);

      if (heardNoise) {
        // Heard something - partial detection
        newLevel = Math.min(1, currentLevel + 0.4 * dtSeconds);
      } else {
        // Nothing detected - decay
        newLevel = Math.max(0, currentLevel - DETECTION_CONFIG.detectionDecayRate * dtSeconds);
      }
    }

    // Determine alert state
    let alertState: 'unaware' | 'suspicious' | 'detected';
    if (newLevel >= DETECTION_CONFIG.detectedThreshold) {
      alertState = 'detected';
    } else if (newLevel >= DETECTION_CONFIG.alertThreshold) {
      alertState = 'suspicious';
    } else {
      alertState = 'unaware';
    }

    return {
      detectionLevel: newLevel,
      lastKnownPos: visibilityResult.visible ? playerPos2D : enemy.lastKnownPlayerPos ?? null,
      alertState,
    };
  }

  /**
   * Check if player is visible to enemy
   */
  private checkVisibility(
    enemy: EnemyState,
    playerPos: Vec2
  ): { visible: boolean; inCentralVision: boolean } {
    const enemyPos: Vec2 = { x: enemy.position.x, y: enemy.position.z };
    const dist = distance(enemyPos, playerPos);

    // Check range
    const maxRange = DETECTION_CONFIG.visionRange * TILE_SIZE;
    const peripheralRange = DETECTION_CONFIG.peripheralRange * TILE_SIZE;

    if (dist > maxRange) {
      return { visible: false, inCentralVision: false };
    }

    // Check angle
    const toPlayer = normalize({
      x: playerPos.x - enemyPos.x,
      y: playerPos.y - enemyPos.y,
    });

    // Enemy facing direction
    const facing = {
      x: Math.sin(enemy.rotation),
      y: Math.cos(enemy.rotation),
    };

    // Dot product gives cos of angle between vectors
    const dot = toPlayer.x * facing.x + toPlayer.y * facing.y;
    const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

    // Check central vision
    if (angleDeg <= DETECTION_CONFIG.visionAngle) {
      // In central vision cone - check LOS
      if (this.hasLineOfSight(enemyPos, playerPos)) {
        return { visible: true, inCentralVision: true };
      }
    }

    // Check peripheral vision
    if (angleDeg <= DETECTION_CONFIG.peripheralAngle && dist <= peripheralRange) {
      if (this.hasLineOfSight(enemyPos, playerPos)) {
        return { visible: true, inCentralVision: false };
      }
    }

    return { visible: false, inCentralVision: false };
  }

  /**
   * Check if enemy can hear player (via noise events)
   */
  private checkHearing(enemyPos: Vec2, _playerPos: Vec2): boolean {
    const now = Date.now();

    // Clean old noise events
    this.noiseEvents = this.noiseEvents.filter(
      (e) => now - e.timestamp < this.NOISE_LIFETIME
    );

    // Check if any noise is in range
    for (const noise of this.noiseEvents) {
      const dist = distance(enemyPos, noise.position);
      if (dist <= noise.radius * TILE_SIZE) {
        return true;
      }
    }

    return false;
  }

  /**
   * Register a noise event (called when player shoots, etc.)
   */
  registerNoise(position: Vec2, type: 'gunshot' | 'footstep' | 'explosion'): void {
    let radius: number;
    switch (type) {
      case 'gunshot':
        radius = DETECTION_CONFIG.gunshotRange;
        break;
      case 'explosion':
        radius = DETECTION_CONFIG.gunshotRange * 1.5;
        break;
      case 'footstep':
        radius = DETECTION_CONFIG.footstepRange;
        break;
    }

    this.noiseEvents.push({
      position,
      radius,
      timestamp: Date.now(),
      type,
    });
  }

  /**
   * Propagate alert to nearby enemies
   */
  propagateAlert(
    alertingEnemy: EnemyState,
    allEnemies: Iterable<EnemyState>,
    playerPos: Vec2
  ): void {
    const alertPos: Vec2 = { x: alertingEnemy.position.x, y: alertingEnemy.position.z };
    const alertRadius = DETECTION_CONFIG.alertRadius * TILE_SIZE;

    for (const other of allEnemies) {
      if (other.id === alertingEnemy.id) continue;
      if (other.state === 'dead') continue;

      const otherPos: Vec2 = { x: other.position.x, y: other.position.z };
      const dist = distance(alertPos, otherPos);

      if (dist <= alertRadius) {
        // Alert this enemy
        const currentLevel = other.detectionLevel ?? 0;
        if (currentLevel < DETECTION_CONFIG.alertThreshold) {
          other.detectionLevel = DETECTION_CONFIG.alertThreshold;
          other.lastKnownPlayerPos = playerPos;
          other.alertedBy = alertingEnemy.id;
        }
      }
    }
  }

  /**
   * Check line of sight using Bresenham's algorithm (with caching)
   */
  hasLineOfSight(from: Vec2, to: Vec2): boolean {
    const now = Date.now();
    const cacheKey = this.getLOSCacheKey(from, to);

    // Check cache first
    const cached = this.losCache.get(cacheKey);
    if (cached && now - cached.timestamp < this.LOS_CACHE_TTL) {
      return cached.result;
    }

    // Calculate LOS
    const result = this.calculateLineOfSight(from, to);

    // Cache result
    this.losCache.set(cacheKey, { result, timestamp: now });

    // Periodic cache cleanup (every 100 calls)
    if (++this.losCacheCleanupCounter >= 100) {
      this.losCacheCleanupCounter = 0;
      this.cleanupLOSCache(now);
    }

    return result;
  }

  /**
   * Clean up expired LOS cache entries
   */
  private cleanupLOSCache(now: number): void {
    // Remove expired entries
    for (const [key, entry] of this.losCache) {
      if (now - entry.timestamp > this.LOS_CACHE_TTL * 2) {
        this.losCache.delete(key);
      }
    }

    // If still too large, remove oldest entries
    if (this.losCache.size > this.LOS_CACHE_MAX_SIZE) {
      const entriesToRemove = this.losCache.size - this.LOS_CACHE_MAX_SIZE;
      const iterator = this.losCache.keys();
      for (let i = 0; i < entriesToRemove; i++) {
        const key = iterator.next().value;
        if (key) this.losCache.delete(key);
      }
    }
  }

  /**
   * Actual LOS calculation using Bresenham's algorithm
   */
  private calculateLineOfSight(from: Vec2, to: Vec2): boolean {
    const fromTile = this.worldToTile(from);
    const toTile = this.worldToTile(to);

    let x0 = fromTile.x;
    let y0 = fromTile.y;
    const x1 = toTile.x;
    const y1 = toTile.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      // Check if current tile is walkable
      if (
        x0 < 0 ||
        x0 >= this.mapData.width ||
        y0 < 0 ||
        y0 >= this.mapData.height ||
        !this.mapData.tiles[y0][x0].walkable
      ) {
        return false;
      }

      // Reached destination
      if (x0 === x1 && y0 === y1) {
        return true;
      }

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /**
   * Convert world position to tile coordinates
   */
  private worldToTile(pos: Vec2): Vec2 {
    return {
      x: Math.floor(pos.x / TILE_SIZE),
      y: Math.floor(pos.y / TILE_SIZE),
    };
  }

  /**
   * Clear all noise events
   */
  clearNoiseEvents(): void {
    this.noiseEvents = [];
  }
}
