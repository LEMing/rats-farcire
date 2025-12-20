/**
 * CoverSystem - Manages cover points for tactical AI
 *
 * Features:
 * - Generate cover points from map geometry
 * - Evaluate cover quality relative to threat
 * - Claim/release cover to prevent stacking
 * - Find best cover for an enemy
 */

import type { MapData, Vec2 } from '@shared/types';
import { COVER_CONFIG, TILE_SIZE } from '@shared/constants';
import { distance, normalize } from '@shared/utils';

// ============================================================================
// Types
// ============================================================================

export interface CoverPoint {
  id: string;
  position: Vec2;
  facing: Vec2;           // Direction the cover provides protection from
  quality: number;        // 0-1 rating
  claimedBy: string | null;
}

// ============================================================================
// CoverSystem
// ============================================================================

export class CoverSystem {
  private coverPoints: Map<string, CoverPoint> = new Map();
  private mapData: MapData;

  constructor(mapData: MapData) {
    this.mapData = mapData;
    this.generateCoverPoints();
  }

  /**
   * Generate cover points from map geometry
   * Cover points are floor tiles adjacent to walls
   */
  private generateCoverPoints(): void {
    for (let y = 1; y < this.mapData.height - 1; y++) {
      for (let x = 1; x < this.mapData.width - 1; x++) {
        const tile = this.mapData.tiles[y][x];
        if (!tile.walkable) continue;

        // Check adjacent walls
        const directions = [
          { dx: 0, dy: -1 }, // North
          { dx: 0, dy: 1 },  // South
          { dx: -1, dy: 0 }, // West
          { dx: 1, dy: 0 },  // East
        ];

        for (const dir of directions) {
          const adjTile = this.mapData.tiles[y + dir.dy]?.[x + dir.dx];
          if (adjTile && !adjTile.walkable) {
            // This tile provides cover from the direction of the wall
            const id = `cover_${x}_${y}_${dir.dx}_${dir.dy}`;
            const coverFacing: Vec2 = { x: -dir.dx, y: -dir.dy };

            // Don't create duplicate cover points for same position
            if (!this.hasNearbyPoint(x, y, 0.5)) {
              this.coverPoints.set(id, {
                id,
                position: {
                  x: x * TILE_SIZE + TILE_SIZE / 2,
                  y: y * TILE_SIZE + TILE_SIZE / 2,
                },
                facing: coverFacing,
                quality: 1,
                claimedBy: null,
              });
            }
          }
        }
      }
    }
  }

  /**
   * Check if there's already a cover point near this position
   */
  private hasNearbyPoint(x: number, y: number, radiusTiles: number): boolean {
    const worldX = x * TILE_SIZE + TILE_SIZE / 2;
    const worldY = y * TILE_SIZE + TILE_SIZE / 2;
    const radiusWorld = radiusTiles * TILE_SIZE;

    for (const point of this.coverPoints.values()) {
      const dist = distance({ x: worldX, y: worldY }, point.position);
      if (dist < radiusWorld) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find the best cover point for an enemy given a threat position
   */
  findBestCover(
    enemyPos: Vec2,
    threatPos: Vec2,
    excludeEnemyId: string
  ): CoverPoint | null {
    const minDist = COVER_CONFIG.minCoverDistance * TILE_SIZE;
    const maxDist = COVER_CONFIG.maxCoverDistance * TILE_SIZE;
    const searchRadius = COVER_CONFIG.coverSearchRadius * TILE_SIZE;

    let bestCover: CoverPoint | null = null;
    let bestScore = -Infinity;

    for (const cover of this.coverPoints.values()) {
      // Skip claimed cover
      if (cover.claimedBy !== null && cover.claimedBy !== excludeEnemyId) {
        continue;
      }

      const distToEnemy = distance(cover.position, enemyPos);
      const distToThreat = distance(cover.position, threatPos);

      // Must be within search radius from enemy
      if (distToEnemy > searchRadius) continue;

      // Must be at appropriate distance from threat
      if (distToThreat < minDist || distToThreat > maxDist) continue;

      // Evaluate cover quality
      const score = this.evaluateCover(cover, enemyPos, threatPos);

      if (score > bestScore) {
        bestScore = score;
        bestCover = cover;
      }
    }

    return bestCover;
  }

  /**
   * Evaluate how good a cover point is for the current situation
   */
  private evaluateCover(
    cover: CoverPoint,
    enemyPos: Vec2,
    threatPos: Vec2
  ): number {
    let score = 0;

    // Direction from cover to threat
    const toThreat = normalize({
      x: threatPos.x - cover.position.x,
      y: threatPos.y - cover.position.y,
    });

    // How well does cover facing align with threat direction?
    // Cover facing should be towards the threat
    const alignmentDot = toThreat.x * cover.facing.x + toThreat.y * cover.facing.y;
    const alignmentScore = (alignmentDot + 1) / 2; // 0-1
    score += alignmentScore * 50;

    // Prefer cover closer to enemy (less travel time)
    const distToEnemy = distance(cover.position, enemyPos);
    const proxScore = Math.max(0, 1 - distToEnemy / (COVER_CONFIG.coverSearchRadius * TILE_SIZE));
    score += proxScore * 30;

    // Prefer cover at medium distance from threat (not too close, not too far)
    const distToThreat = distance(cover.position, threatPos);
    const idealDist = (COVER_CONFIG.minCoverDistance + COVER_CONFIG.maxCoverDistance) / 2 * TILE_SIZE;
    const distScore = Math.max(0, 1 - Math.abs(distToThreat - idealDist) / idealDist);
    score += distScore * 20;

    return score;
  }

  /**
   * Claim a cover point for an enemy
   */
  claimCover(coverId: string, enemyId: string): boolean {
    const cover = this.coverPoints.get(coverId);
    if (!cover) return false;

    if (cover.claimedBy !== null && cover.claimedBy !== enemyId) {
      return false;
    }

    cover.claimedBy = enemyId;
    return true;
  }

  /**
   * Release a cover point
   */
  releaseCover(enemyId: string): void {
    for (const cover of this.coverPoints.values()) {
      if (cover.claimedBy === enemyId) {
        cover.claimedBy = null;
      }
    }
  }

  /**
   * Get cover point by ID
   */
  getCover(coverId: string): CoverPoint | undefined {
    return this.coverPoints.get(coverId);
  }

  /**
   * Get all cover points (for debug visualization)
   */
  getAllCoverPoints(): CoverPoint[] {
    return Array.from(this.coverPoints.values());
  }

  /**
   * Check if position is in cover relative to threat
   */
  isInCover(position: Vec2, threatPos: Vec2, coverRadius: number = 1.5): boolean {
    for (const cover of this.coverPoints.values()) {
      const dist = distance(position, cover.position);
      if (dist > coverRadius * TILE_SIZE) continue;

      // Check if cover faces the threat
      const toThreat = normalize({
        x: threatPos.x - cover.position.x,
        y: threatPos.y - cover.position.y,
      });

      const dot = toThreat.x * cover.facing.x + toThreat.y * cover.facing.y;
      if (dot > 0.5) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get position to peek from cover (step out to shoot)
   */
  getPeekPosition(cover: CoverPoint, threatPos: Vec2): Vec2 {
    // Step out perpendicular to cover facing
    const perpendicular: Vec2 = { x: -cover.facing.y, y: cover.facing.x };

    // Decide which side to peek from (side closer to threat)
    const leftPeek: Vec2 = {
      x: cover.position.x + perpendicular.x * TILE_SIZE * 0.8,
      y: cover.position.y + perpendicular.y * TILE_SIZE * 0.8,
    };
    const rightPeek: Vec2 = {
      x: cover.position.x - perpendicular.x * TILE_SIZE * 0.8,
      y: cover.position.y - perpendicular.y * TILE_SIZE * 0.8,
    };

    const leftDist = distance(leftPeek, threatPos);
    const rightDist = distance(rightPeek, threatPos);

    return leftDist < rightDist ? leftPeek : rightPeek;
  }
}
