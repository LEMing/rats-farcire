/**
 * PhysicsColliderBuilder - Builds static wall colliders from tilemap
 *
 * Optimizes by merging adjacent wall tiles into larger rectangles
 * to reduce the number of physics bodies.
 */

import type { MapData } from '../../shared/types';
import { TILE_SIZE } from '../../shared/constants';
import type { PhysicsManager } from './PhysicsManager';
import { BODY_CONFIGS } from './types';

interface WallRect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export class PhysicsColliderBuilder {
  /**
   * Build optimized static colliders from map tiles.
   * Merges horizontal runs of walls to reduce collider count.
   */
  buildFromMap(physics: PhysicsManager, mapData: MapData): void {
    const wallRects = this.extractWallRects(mapData);

    for (const rect of wallRects) {
      physics.createWallBody(
        rect.x,
        rect.z,
        rect.width,
        rect.depth,
        BODY_CONFIGS.WALL.height
      );
    }

    console.log(`[Physics] Created ${wallRects.length} wall colliders from ${this.countWallTiles(mapData)} wall tiles`);
  }

  /**
   * Extract wall rectangles by merging adjacent walls
   */
  private extractWallRects(mapData: MapData): WallRect[] {
    const rects: WallRect[] = [];
    const visited = new Set<string>();

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        const tile = mapData.tiles[y]?.[x];
        if (!tile || tile.walkable) continue;

        // Found a wall tile, try to expand horizontally
        let endX = x;
        while (endX < mapData.width) {
          const nextTile = mapData.tiles[y]?.[endX];
          const nextKey = `${endX},${y}`;
          if (!nextTile || nextTile.walkable || visited.has(nextKey)) break;
          visited.add(nextKey);
          endX++;
        }

        const width = endX - x;

        // Convert to world coordinates
        const worldX = (x + width / 2) * TILE_SIZE;
        const worldZ = (y + 0.5) * TILE_SIZE;
        const worldWidth = width * TILE_SIZE;
        const worldDepth = TILE_SIZE;

        rects.push({
          x: worldX,
          z: worldZ,
          width: worldWidth,
          depth: worldDepth,
        });
      }
    }

    return rects;
  }

  /**
   * Count total wall tiles for logging
   */
  private countWallTiles(mapData: MapData): number {
    let count = 0;
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y]?.[x];
        if (tile && !tile.walkable) count++;
      }
    }
    return count;
  }
}
