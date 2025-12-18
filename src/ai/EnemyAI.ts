import type { MapData, EnemyState, Vec2, Vec3 } from '@shared/types';
import { normalize, distance, isWalkable } from '@shared/utils';
import { TILE_SIZE, ENEMY_CONFIGS } from '@shared/constants';

// ============================================================================
// Enemy AI System with A* Pathfinding
// ============================================================================

interface EnemyPath {
  path: Vec2[];
  waypointIndex: number;
  targetPosition: Vec2;
  timestamp: number;
}

export class EnemyAI {
  private mapData: MapData;
  private pathCache: Map<string, Vec2[]> = new Map();
  private enemyPaths: Map<string, EnemyPath> = new Map();

  // Pathfinding settings
  private readonly PATH_RECALC_INTERVAL = 500; // ms between recalculations
  private readonly PATH_RECALC_DISTANCE = 3; // Recalc if target moved this far
  private readonly WAYPOINT_REACHED_DIST = 0.8; // Distance to consider waypoint reached
  private readonly LOS_CHECK_DISTANCE = 15; // Max distance for line-of-sight

  constructor(mapData: MapData) {
    this.mapData = mapData;
  }

  /**
   * Calculate movement direction for an enemy using A* pathfinding
   */
  getMovementDirection(
    enemy: EnemyState,
    targetPosition: Vec3,
    allEnemies: EnemyState[]
  ): Vec2 {
    const enemyPos: Vec2 = { x: enemy.position.x, y: enemy.position.z };
    const targetPos: Vec2 = { x: targetPosition.x, y: targetPosition.z };
    const now = Date.now();

    // Get movement direction from pathfinding
    const pathDirection = this.getPathDirection(enemy, enemyPos, targetPos, now);

    // Separation from other enemies (always apply)
    const separation = this.calculateSeparation(enemy, allEnemies);

    // Light wall avoidance (for fine-tuning around corners)
    const wallAvoidance = this.calculateWallAvoidance(enemyPos);

    // Combine forces with weights
    // Path direction is primary, separation and avoidance are secondary
    const combined: Vec2 = {
      x: pathDirection.x * 1.0 + separation.x * 0.4 + wallAvoidance.x * 0.3,
      y: pathDirection.y * 1.0 + separation.y * 0.4 + wallAvoidance.y * 0.3,
    };

    return normalize(combined);
  }

  /**
   * Get direction from pathfinding system
   */
  private getPathDirection(
    enemy: EnemyState,
    enemyPos: Vec2,
    targetPos: Vec2,
    now: number
  ): Vec2 {
    const distToTarget = distance(enemyPos, targetPos);

    // If very close to target, go direct
    if (distToTarget < 2) {
      return normalize({
        x: targetPos.x - enemyPos.x,
        y: targetPos.y - enemyPos.y,
      });
    }

    // Check if we have line of sight to target
    const hasLOS = distToTarget < this.LOS_CHECK_DISTANCE &&
                   this.hasLineOfSight(enemyPos, targetPos);

    // If we have line of sight, go direct (faster, smoother)
    if (hasLOS) {
      // Clear any stored path since we don't need it
      this.enemyPaths.delete(enemy.id);
      return normalize({
        x: targetPos.x - enemyPos.x,
        y: targetPos.y - enemyPos.y,
      });
    }

    // No line of sight - use A* pathfinding
    return this.followPath(enemy, enemyPos, targetPos, now);
  }

  /**
   * Follow A* path to target
   */
  private followPath(
    enemy: EnemyState,
    enemyPos: Vec2,
    targetPos: Vec2,
    now: number
  ): Vec2 {
    let currentPath = this.enemyPaths.get(enemy.id);

    // Check if we need to recalculate path
    const needsRecalc = !currentPath ||
      now - currentPath.timestamp > this.PATH_RECALC_INTERVAL ||
      distance(currentPath.targetPosition, targetPos) > this.PATH_RECALC_DISTANCE ||
      currentPath.waypointIndex >= currentPath.path.length;

    if (needsRecalc) {
      const path = this.findPath(enemyPos, targetPos);
      currentPath = {
        path,
        waypointIndex: 0,
        targetPosition: { ...targetPos },
        timestamp: now,
      };
      this.enemyPaths.set(enemy.id, currentPath);
    }

    // TypeScript now knows currentPath is defined
    const enemyPath = currentPath!;

    // Get current waypoint
    if (enemyPath.path.length === 0) {
      // No path found, try direct movement
      return normalize({
        x: targetPos.x - enemyPos.x,
        y: targetPos.y - enemyPos.y,
      });
    }

    // Skip waypoints we've passed (catch up if we're ahead)
    while (enemyPath.waypointIndex < enemyPath.path.length - 1) {
      const waypoint = enemyPath.path[enemyPath.waypointIndex];
      const distToWaypoint = distance(enemyPos, waypoint);

      if (distToWaypoint < this.WAYPOINT_REACHED_DIST) {
        enemyPath.waypointIndex++;
      } else {
        break;
      }
    }

    // Move toward current waypoint
    const targetWaypoint = enemyPath.path[Math.min(enemyPath.waypointIndex, enemyPath.path.length - 1)];

    return normalize({
      x: targetWaypoint.x - enemyPos.x,
      y: targetWaypoint.y - enemyPos.y,
    });
  }

  /**
   * Check if there's a clear line of sight between two points
   * Uses Bresenham's line algorithm on tile grid
   */
  private hasLineOfSight(from: Vec2, to: Vec2): boolean {
    const fromTile = this.worldToTile(from);
    const toTile = this.worldToTile(to);

    // Bresenham's line algorithm
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
        x0 < 0 || x0 >= this.mapData.width ||
        y0 < 0 || y0 >= this.mapData.height ||
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
   * Calculate separation force from nearby enemies
   */
  private calculateSeparation(enemy: EnemyState, allEnemies: EnemyState[]): Vec2 {
    const config = ENEMY_CONFIGS[enemy.enemyType];
    const separationRadius = config.hitboxRadius * 4;
    const enemyPos: Vec2 = { x: enemy.position.x, y: enemy.position.z };

    let separationX = 0;
    let separationY = 0;
    let count = 0;

    for (const other of allEnemies) {
      if (other.id === enemy.id || other.state === 'dead') continue;

      const otherPos: Vec2 = { x: other.position.x, y: other.position.z };
      const dist = distance(enemyPos, otherPos);

      if (dist < separationRadius && dist > 0) {
        // Push away from other enemy
        const pushX = (enemyPos.x - otherPos.x) / dist;
        const pushY = (enemyPos.y - otherPos.y) / dist;
        const strength = (separationRadius - dist) / separationRadius;

        separationX += pushX * strength;
        separationY += pushY * strength;
        count++;
      }
    }

    if (count > 0) {
      return { x: separationX / count, y: separationY / count };
    }

    return { x: 0, y: 0 };
  }

  /**
   * Calculate wall avoidance force (light, for corner smoothing)
   */
  private calculateWallAvoidance(position: Vec2): Vec2 {
    const checkRadius = TILE_SIZE * 0.8;
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 0.7, y: 0.7 },
      { x: -0.7, y: 0.7 },
      { x: 0.7, y: -0.7 },
      { x: -0.7, y: -0.7 },
    ];

    let avoidX = 0;
    let avoidY = 0;

    for (const dir of directions) {
      const checkX = position.x + dir.x * checkRadius;
      const checkY = position.y + dir.y * checkRadius;

      if (!isWalkable(this.mapData, checkX, checkY)) {
        avoidX -= dir.x;
        avoidY -= dir.y;
      }
    }

    return normalize({ x: avoidX, y: avoidY });
  }

  /**
   * Clean up path data for removed enemies
   */
  removeEnemy(enemyId: string): void {
    this.enemyPaths.delete(enemyId);
  }

  // ============================================================================
  // A* Pathfinding
  // ============================================================================

  /**
   * Find path using A* algorithm
   */
  findPath(start: Vec2, end: Vec2): Vec2[] {
    const startTile = this.worldToTile(start);
    const endTile = this.worldToTile(end);

    // Quick check if end is reachable
    if (!this.isTileWalkable(endTile.x, endTile.y)) {
      // Find nearest walkable tile to end
      const nearestEnd = this.findNearestWalkable(endTile);
      if (nearestEnd) {
        return this.findPathInternal(startTile, nearestEnd);
      }
      return [];
    }

    return this.findPathInternal(startTile, endTile);
  }

  private findPathInternal(startTile: Vec2, endTile: Vec2): Vec2[] {
    const cacheKey = `${startTile.x},${startTile.y}-${endTile.x},${endTile.y}`;

    if (this.pathCache.has(cacheKey)) {
      return this.pathCache.get(cacheKey)!;
    }

    const path = this.aStar(startTile, endTile);

    // Convert tile path to world coordinates
    const worldPath = path.map((tile) => this.tileToWorld(tile));

    // Smooth the path (remove unnecessary waypoints)
    const smoothedPath = this.smoothPath(worldPath);

    // Cache for performance
    this.pathCache.set(cacheKey, smoothedPath);

    // Clear old cache entries
    if (this.pathCache.size > 200) {
      const firstKey = this.pathCache.keys().next().value;
      if (firstKey) this.pathCache.delete(firstKey);
    }

    return smoothedPath;
  }

  /**
   * Smooth path by removing unnecessary waypoints
   */
  private smoothPath(path: Vec2[]): Vec2[] {
    if (path.length <= 2) return path;

    const smoothed: Vec2[] = [path[0]];
    let current = 0;

    while (current < path.length - 1) {
      // Try to skip ahead as far as possible while maintaining LOS
      let furthest = current + 1;
      for (let i = current + 2; i < path.length; i++) {
        if (this.hasLineOfSight(path[current], path[i])) {
          furthest = i;
        }
      }
      smoothed.push(path[furthest]);
      current = furthest;
    }

    return smoothed;
  }

  private findNearestWalkable(tile: Vec2): Vec2 | null {
    const maxRadius = 5;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = tile.x + dx;
          const ny = tile.y + dy;
          if (this.isTileWalkable(nx, ny)) {
            return { x: nx, y: ny };
          }
        }
      }
    }
    return null;
  }

  private isTileWalkable(x: number, y: number): boolean {
    if (x < 0 || x >= this.mapData.width || y < 0 || y >= this.mapData.height) {
      return false;
    }
    return this.mapData.tiles[y][x].walkable;
  }

  private worldToTile(pos: Vec2): Vec2 {
    return {
      x: Math.floor(pos.x / TILE_SIZE),
      y: Math.floor(pos.y / TILE_SIZE),
    };
  }

  private tileToWorld(tile: Vec2): Vec2 {
    return {
      x: tile.x * TILE_SIZE + TILE_SIZE / 2,
      y: tile.y * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  private aStar(start: Vec2, end: Vec2): Vec2[] {
    interface Node {
      x: number;
      y: number;
      g: number;
      h: number;
      f: number;
      parent: Node | null;
    }

    const openSet: Node[] = [];
    const closedSet = new Set<string>();

    const startNode: Node = {
      x: start.x,
      y: start.y,
      g: 0,
      h: this.heuristic(start, end),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);

    const neighbors = [
      { dx: 0, dy: -1, cost: 1 },
      { dx: 0, dy: 1, cost: 1 },
      { dx: -1, dy: 0, cost: 1 },
      { dx: 1, dy: 0, cost: 1 },
      { dx: -1, dy: -1, cost: 1.414 },
      { dx: 1, dy: -1, cost: 1.414 },
      { dx: -1, dy: 1, cost: 1.414 },
      { dx: 1, dy: 1, cost: 1.414 },
    ];

    let iterations = 0;
    const maxIterations = 2000;

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      // Find node with lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      const currentKey = `${current.x},${current.y}`;

      if (current.x === end.x && current.y === end.y) {
        // Reconstruct path
        const path: Vec2[] = [];
        let node: Node | null = current;
        while (node) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path;
      }

      closedSet.add(currentKey);

      for (const { dx, dy, cost } of neighbors) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const neighborKey = `${nx},${ny}`;

        if (closedSet.has(neighborKey)) continue;

        // Check bounds and walkability
        if (!this.isTileWalkable(nx, ny)) continue;

        // For diagonal movement, check that adjacent tiles are also walkable
        // (prevents cutting corners through walls)
        if (dx !== 0 && dy !== 0) {
          if (!this.isTileWalkable(current.x + dx, current.y) ||
              !this.isTileWalkable(current.x, current.y + dy)) {
            continue;
          }
        }

        const tentativeG = current.g + cost;

        const existingNode = openSet.find((n) => n.x === nx && n.y === ny);

        if (!existingNode) {
          const newNode: Node = {
            x: nx,
            y: ny,
            g: tentativeG,
            h: this.heuristic({ x: nx, y: ny }, end),
            f: 0,
            parent: current,
          };
          newNode.f = newNode.g + newNode.h;
          openSet.push(newNode);
        } else if (tentativeG < existingNode.g) {
          existingNode.g = tentativeG;
          existingNode.f = existingNode.g + existingNode.h;
          existingNode.parent = current;
        }
      }
    }

    // No path found, return empty
    return [];
  }

  private heuristic(a: Vec2, b: Vec2): number {
    // Octile distance (proper heuristic for 8-directional movement)
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    return Math.max(dx, dy) + (1.414 - 1) * Math.min(dx, dy);
  }
}
