import type { MapData, EnemyState, Vec2, Vec3 } from '@shared/types';
import { normalize, distance } from '@shared/utils';
import { TILE_SIZE, ENEMY_CONFIGS } from '@shared/constants';

// ============================================================================
// Enemy AI System
// Simple chase + avoidance with optional A* pathfinding
// ============================================================================

export class EnemyAI {
  private mapData: MapData;
  private pathCache: Map<string, Vec2[]> = new Map();

  constructor(mapData: MapData) {
    this.mapData = mapData;
  }

  /**
   * Calculate movement direction for an enemy
   */
  getMovementDirection(
    enemy: EnemyState,
    targetPosition: Vec3,
    allEnemies: EnemyState[]
  ): Vec2 {
    const enemyPos: Vec2 = { x: enemy.position.x, y: enemy.position.z };
    const targetPos: Vec2 = { x: targetPosition.x, y: targetPosition.z };

    // Direct chase vector
    const toTarget = normalize({
      x: targetPos.x - enemyPos.x,
      y: targetPos.y - enemyPos.y,
    });

    // Separation from other enemies
    const separation = this.calculateSeparation(enemy, allEnemies);

    // Wall avoidance
    const wallAvoidance = this.calculateWallAvoidance(enemyPos);

    // Combine forces with weights
    const weights = {
      chase: 1.0,
      separation: 0.5,
      wallAvoidance: 0.8,
    };

    const combined: Vec2 = {
      x:
        toTarget.x * weights.chase +
        separation.x * weights.separation +
        wallAvoidance.x * weights.wallAvoidance,
      y:
        toTarget.y * weights.chase +
        separation.y * weights.separation +
        wallAvoidance.y * weights.wallAvoidance,
    };

    return normalize(combined);
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
   * Calculate wall avoidance force
   */
  private calculateWallAvoidance(position: Vec2): Vec2 {
    const checkRadius = TILE_SIZE * 1.5;
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

      if (!this.isWalkable(checkX, checkY)) {
        // Push away from wall
        avoidX -= dir.x;
        avoidY -= dir.y;
      }
    }

    return normalize({ x: avoidX, y: avoidY });
  }

  /**
   * Check if world position is walkable
   */
  private isWalkable(worldX: number, worldY: number): boolean {
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    if (
      tileX < 0 ||
      tileX >= this.mapData.width ||
      tileY < 0 ||
      tileY >= this.mapData.height
    ) {
      return false;
    }

    return this.mapData.tiles[tileY][tileX].walkable;
  }

  // ============================================================================
  // A* Pathfinding (Optional - for smarter enemies)
  // ============================================================================

  /**
   * Find path using A* algorithm
   */
  findPath(start: Vec2, end: Vec2): Vec2[] {
    const cacheKey = `${Math.floor(start.x)},${Math.floor(start.y)}-${Math.floor(end.x)},${Math.floor(end.y)}`;

    if (this.pathCache.has(cacheKey)) {
      return this.pathCache.get(cacheKey)!;
    }

    const startTile = this.worldToTile(start);
    const endTile = this.worldToTile(end);

    const path = this.aStar(startTile, endTile);

    // Convert tile path to world coordinates
    const worldPath = path.map((tile) => this.tileToWorld(tile));

    // Cache for performance
    this.pathCache.set(cacheKey, worldPath);

    // Clear old cache entries
    if (this.pathCache.size > 100) {
      const firstKey = this.pathCache.keys().next().value;
      if (firstKey) this.pathCache.delete(firstKey);
    }

    return worldPath;
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
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: 1, dy: 1 },
    ];

    let iterations = 0;
    const maxIterations = 1000;

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

      for (const { dx, dy } of neighbors) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const neighborKey = `${nx},${ny}`;

        if (closedSet.has(neighborKey)) continue;

        // Check bounds and walkability
        if (
          nx < 0 ||
          nx >= this.mapData.width ||
          ny < 0 ||
          ny >= this.mapData.height
        ) {
          continue;
        }

        if (!this.mapData.tiles[ny][nx].walkable) continue;

        // Diagonal movement cost
        const moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1;
        const tentativeG = current.g + moveCost;

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

    // No path found, return direct path
    return [start, end];
  }

  private heuristic(a: Vec2, b: Vec2): number {
    // Diagonal distance heuristic
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    return dx + dy + (1.414 - 2) * Math.min(dx, dy);
  }
}
